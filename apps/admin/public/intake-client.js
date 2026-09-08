// Presentation and exact-command recovery only. Every trusted input is selected
// and every receipt reconstructed by the runtime. No local Case or authority state.
const ROOT = "/v1/intake";
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
export async function intakeHash(value) {
  const bytes = new globalThis.TextEncoder().encode(
      JSON.stringify(canonical(value)),
    ),
    digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new globalThis.Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
const requireData = (ok) => {
  if (!ok)
    throw new Error(
      "Intake evidence could not be reconciled. No commit is assumed.",
    );
};
async function bound(v) {
  const { hash, ...content } = v;
  requireData(hash === (await intakeHash(content)));
}
export async function validateIntakeReceipt(r) {
  requireData(
    r?.schema_version === "intake-commit.v1" &&
      r.tenant_id === "tenant_intake_demo" &&
      r.actor?.identity_id === "identity_intake_operator" &&
      r.actor.status === "active" &&
      r.actor.identity_kind === "human" &&
      r.case_id === r.review_material?.target_case_id &&
      r.material_key === r.review_material?.material_key &&
      r.review_material_hash === r.selection?.expected_consent_hash,
  );
  await bound(r);
  requireData(r.review_material_hash === (await intakeHash(r.review_material)));
  return r;
}
export async function validateIntakeView(v) {
  requireData(
    v?.schema_version === "intake-view.v1" &&
      v.authority_granted === false &&
      v.closure_permission === false &&
      v.bundle?.tenant_id === "tenant_intake_demo" &&
      v.bundle.profile_id === "invoice-dispute-intake.v1" &&
      Array.isArray(v.candidates) &&
      v.candidates.length === v.bundle.records.length,
  );
  await bound(v.bundle);
  for (const [index, c] of v.candidates.entries()) {
    // Invalid rows may have no key and identical cells but distinct byte locators.
    // Reconcile the server's preserved row order, not an arbitrary first key match.
    requireData(
      c.record_key === c.record.record_key &&
        c.can_review === c.record.valid &&
        JSON.stringify(canonical(c.record)) ===
          JSON.stringify(canonical(v.bundle.records[index])) &&
        Array.isArray(c.targets) &&
        Array.isArray(c.commits),
    );
    for (const r of c.commits) {
      await validateIntakeReceipt(r);
      requireData(r.record_key === c.record_key);
    }
  }
  return v;
}
export function pendingIntakeStorage() {
  let database;
  async function db() {
    if (!database)
      database = new Promise((resolve, reject) => {
        const r = window.indexedDB.open("fieldruntime-intake-retry.v1", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("pending");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () =>
          reject(
            new Error("Retry storage is unavailable; nothing was submitted"),
          );
      });
    return database;
  }
  async function operation(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("pending", mode),
        r = fn(tx.objectStore("pending"));
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () =>
        reject(
          new Error(
            "Retry storage could not be saved; nothing new was submitted",
          ),
        );
      tx.onabort = tx.onerror;
    });
  }
  const sameCommand = (a, b) => a?.path === b?.path && a?.body === b?.body;
  async function update(expected, clearing) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("pending", "readwrite"),
        store = tx.objectStore("pending"),
        read = store.get("command");
      let result = false,
        failure;
      read.onsuccess = () => {
        const current = read.result;
        if (clearing) {
          if (sameCommand(current, expected)) {
            store.delete("command");
            result = true;
          }
        } else if (current === undefined || sameCommand(current, expected)) {
          if (current === undefined) store.add(expected, "command");
          result = true;
        } else {
          failure = new Error(
            "Another tab has an unresolved intake or Discovery command. Recover the saved original submission before starting another; nothing new was submitted.",
          );
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () =>
        reject(
          failure ??
            new Error(
              "Retry storage could not be saved; nothing new was submitted",
            ),
        );
    });
  }
  return {
    get: () => operation("readonly", (s) => s.get("command")),
    set: (value) => update(value, false),
    clear: (expected) => update(expected, true),
  };
}
export function createIntakeClient({
  fetcher = fetch,
  storage = pendingIntakeStorage(),
  changed = () => {},
} = {}) {
  const state = {
    view: null,
    list: [],
    preview: null,
    pending: null,
    confirmed: null,
    recovered: false,
    busy: false,
    error: null,
    needsRefresh: false,
    draftRevision: 0,
    discovery: null,
    discoveryTarget: null,
    discoveryConfirmed: null,
  };
  async function request(path, body) {
    const abort = new globalThis.AbortController(),
      timer = globalThis.setTimeout(() => abort.abort(), 15000);
    try {
      const r = await fetcher(
        path,
        body === undefined
          ? { signal: abort.signal }
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body,
              signal: abort.signal,
            },
      );
      let data;
      try {
        data = await r.json();
      } catch {
        throw new Error("The server response was unreadable");
      }
      if (!r.ok) {
        const e = new Error(
          data.message ?? data.error ?? "Server operation unavailable",
        );
        e.confirmedDenial = r.status >= 400 && r.status < 500;
        e.code = data.error;
        throw e;
      }
      return data;
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
  function invalidate() {
    state.preview = null;
    state.draftRevision++;
  }
  async function refresh(id = state.view?.bundle.id) {
    invalidate();
    state.preview = null;
    const list = await request(`${ROOT}/bundles`);
    requireData(
      list.schema_version === "intake-list.v1" && Array.isArray(list.bundles),
    );
    const view = id
      ? await validateIntakeView(await request(`${ROOT}/bundles/${id}`))
      : null;
    state.list = list.bundles;
    state.view = view;
    if (
      state.discoveryTarget &&
      state.discoveryTarget.bundle_id !== view?.bundle.id
    ) {
      state.discovery = null;
      state.discoveryTarget = null;
      window.localStorage.removeItem("fieldruntime.discovery.navigation.v1");
    }
    state.needsRefresh = false;
    if (view)
      window.localStorage.setItem(
        "fieldruntime.intake.navigation.v1",
        view.bundle.id,
      );
  }
  async function refreshDiscovery(target = state.discoveryTarget) {
    if (!target) return;
    const path = `${ROOT}/bundles/${target.bundle_id}/discovery?record_key=${encodeURIComponent(target.record_key)}${target.case_id ? `&case_id=${encodeURIComponent(target.case_id)}` : ""}`;
    const brief = await validateDiscoveryBrief(await request(path), target);
    state.discovery = brief;
    state.discoveryTarget = { ...target };
    state.needsRefresh = false;
    window.localStorage.setItem(
      "fieldruntime.discovery.navigation.v1",
      JSON.stringify(target),
    );
    return brief;
  }
  async function run(operation) {
    if (state.busy) return;
    state.busy = true;
    state.error = null;
    changed(state);
    try {
      return await operation();
    } catch (error) {
      state.error = error.message;
      changed(state);
      return undefined;
    } finally {
      state.busy = false;
      changed(state);
    }
  }
  async function submitPending(recovering = false) {
    const saved = state.pending;
    requireData(
      saved &&
        ([`${ROOT}/preparations`, `${ROOT}/commits`].includes(saved.path) ||
          /^\/v1\/intake\/bundles\/intake_bundle_[a-f0-9]{64}\/discovery-reviews$/.test(
            saved.path,
          )),
    );
    try {
      // Claim again on explicit recovery: another tab may have completed this
      // command and claimed a different one since this tab loaded its state.
      if ((await storage.set(saved)) !== true)
        throw new Error(
          "Retry storage claim failed; nothing new was submitted",
        );
    } catch (error) {
      state.pending = (await storage.get().catch(() => null)) ?? null;
      state.preview = null;
      state.error = error.message;
      return undefined;
    }
    state.needsRefresh = true;
    try {
      const result = await request(saved.path, saved.body);
      const isDiscovery = saved.path.endsWith("discovery-reviews");
      if (isDiscovery) {
        await validateDiscoveryResult(result, JSON.parse(saved.body));
        state.discoveryConfirmed = result;
        state.discoveryTarget = {
          bundle_id: result.entry.command.bundle_id,
          record_key: result.entry.command.record_key,
          case_id: result.entry.case_id,
        };
      } else if (saved.path.endsWith("commits")) {
        requireData(
          result.schema_version === "intake-commit-result.v1" &&
            ["committed", "duplicate", "already_committed"].includes(
              result.status,
            ) &&
            result.authority_granted === false,
        );
        await validateIntakeReceipt(result.receipt);
      } else
        requireData(
          result.schema_version === "intake-prepare-result.v1" &&
            ["prepared", "duplicate", "already_retained"].includes(
              result.status,
            ) &&
            /^intake_bundle_[a-f0-9]{64}$/.test(result.bundle_id),
        );
      if (!isDiscovery) state.confirmed = result;
      state.needsRefresh = true;
      state.recovered = recovering;
      try {
        await storage.clear(saved);
        state.pending = (await storage.get()) ?? null;
      } catch (error) {
        state.error = `Confirmed result retained. Recovery storage could not be cleared: ${error.message}`;
        return result;
      }
      state.preview = null;
      try {
        await refresh(
          isDiscovery
            ? result.entry.command.bundle_id
            : (result.receipt?.selection.bundle_id ?? result.bundle_id),
        );
        if (state.discoveryTarget) await refreshDiscovery();
      } catch (error) {
        state.needsRefresh = true;
        state.error = `Confirmed ${isDiscovery ? "descriptive review" : result.receipt ? "Case receipt" : "preparation"} retained. Current view could not be refreshed: ${error.message}`;
      }
      return result;
    } catch (error) {
      if (error.confirmedDenial) {
        await storage.clear(saved);
        state.pending = (await storage.get()) ?? null;
        state.preview = null;
        state.needsRefresh = true;
        state.error = `No new commit accepted: ${error.message}. Refresh, inspect the change and review again.`;
      } else
        state.error = `Submission uncertain: ${error.message}. Recover the original command; no new key or success is assumed.`;
      return undefined;
    }
  }
  return {
    state,
    invalidate,
    closeDiscovery: () => {
      state.discovery = null;
      state.discoveryTarget = null;
      window.localStorage.removeItem("fieldruntime.discovery.navigation.v1");
    },
    load: () =>
      run(async () => {
        state.pending = (await storage.get()) ?? null;
        await refresh(
          window.localStorage.getItem("fieldruntime.intake.navigation.v1") ??
            undefined,
        );
        const nav = window.localStorage.getItem(
          "fieldruntime.discovery.navigation.v1",
        );
        if (nav) {
          const target = JSON.parse(nav);
          if (target.bundle_id === state.view?.bundle.id)
            await refreshDiscovery(target);
        }
      }),
    refresh: (id) =>
      run(async () => {
        state.needsRefresh = true;
        try {
          await refresh(id);
          if (state.discoveryTarget?.bundle_id === state.view?.bundle.id)
            await refreshDiscovery();
          else {
            state.discovery = null;
            state.discoveryTarget = null;
            window.localStorage.removeItem(
              "fieldruntime.discovery.navigation.v1",
            );
          }
        } catch (error) {
          state.needsRefresh = true;
          throw error;
        }
      }),
    openDiscovery: (target) =>
      run(async () => {
        state.needsRefresh = true;
        try {
          return await refreshDiscovery(target);
        } catch (error) {
          state.needsRefresh = true;
          throw error;
        }
      }),
    writeDiscovery: (command) =>
      run(async () => {
        requireData(
          !state.pending &&
            !state.needsRefresh &&
            state.discovery?.current.can_record,
        );
        state.pending = {
          path: `${ROOT}/bundles/${command.bundle_id}/discovery-reviews`,
          body: JSON.stringify(command),
        };
        return submitPending();
      }),
    preview: (review) =>
      run(async () => {
        state.preview = null;
        const revision = state.draftRevision;
        const p = await request(
          `${ROOT}/selections/preview`,
          JSON.stringify(review),
        );
        requireData(
          p.schema_version === "intake-preview.v1" &&
            p.authority_granted === false &&
            p.consent_hash === (await intakeHash(p.review_material)) &&
            p.material_key === p.review_material.material_key &&
            p.review_material.bundle_id === review.bundle_id,
        );
        if (state.draftRevision !== revision)
          throw new Error(
            "Selection changed during inspection. Inspect exact commit again.",
          );
        state.preview = { response: p, review: structuredCloneSafe(review) };
        return p;
      }),
    write: (kind, command) =>
      run(async () => {
        requireData(!state.pending && !state.needsRefresh);
        state.pending = {
          path: `${ROOT}/${kind}`,
          body: JSON.stringify(command),
        };
        return submitPending();
      }),
    retry: () => run(() => submitPending(true)),
  };
}
function structuredCloneSafe(v) {
  return JSON.parse(JSON.stringify(v));
}

const legacyDiscoveryVersions = {
  projection: "discovery.invoice-dispute.v1",
  template: "discovery.questions.v1",
  interpretation: "discovery.source-claims.v1",
};
const discoveryVersions = {
  projection: "discovery.invoice-dispute.v2",
  template: "discovery.questions.v2",
  interpretation: "discovery.source-claims.v2",
};
const equal = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export async function validateDiscoveryEntry(e) {
  requireData(
    e?.schema_version === "discovery-review-entry.v1" &&
      e.tenant_id === "tenant_intake_demo" &&
      e.intake_scope_id === "scope_invoice_disputes" &&
      e.actor?.identity_id === "identity_intake_operator" &&
      e.actor.status === "active" &&
      e.actor.identity_kind === "human" &&
      (equal(e.versions, discoveryVersions) ||
        equal(e.versions, legacyDiscoveryVersions)) &&
      equal(e.material?.manifest.versions, e.versions) &&
      e.case_id === e.command?.case_id &&
      e.sequence === e.command.expected_discovery_revision + 1 &&
      e.previous_entry_hash === e.command.expected_previous_entry_hash &&
      e.idempotency_key === e.command.idempotency_key &&
      e.operation === e.command.operation &&
      e.result?.authority_granted === false &&
      e.result.closure_permission === false &&
      e.result.status === "recorded" &&
      e.result.discovery_revision === e.sequence &&
      e.result.material_hash === e.material_hash,
  );
  await bound(e);
  requireData(
    e.command_fingerprint === (await intakeHash(e.command)) &&
      e.material_hash === (await intakeHash(e.material)) &&
      e.id === `discovery_review_${e.command_fingerprint.slice(7)}` &&
      e.material?.manifest.case_id === e.case_id &&
      e.material.manifest.bundle_id === e.command.bundle_id &&
      e.material.manifest.record_key === e.command.record_key &&
      e.material.manifest.case_version === e.command.expected_case_version &&
      e.material.manifest.intake_receipt_hash ===
        e.command.expected_intake_receipt_hash,
  );
  if (e.operation === "confirm")
    requireData(
      e.material_hash === e.command.expected_material_hash &&
        ["discovery_description", "improvement_discussion"].includes(
          e.command.purpose,
        ),
    );
  else
    requireData(e.operation === "annotate" && Array.isArray(e.command.changes));
  return e;
}
export async function validateDiscoveryBrief(v, target) {
  requireData(
    v?.schema_version === "discovery-brief.v1" &&
      v.authority_granted === false &&
      v.closure_permission === false &&
      Array.isArray(v.history) &&
      v.material?.schema_version === "discovery-material.v1" &&
      v.material.model_calls === 0 &&
      v.material.assignment.independently_verified === false &&
      v.material.findings?.length === 7 &&
      v.material.loop_outputs?.length === 6 &&
      equal(v.material.manifest.versions, discoveryVersions) &&
      v.material.manifest.tenant_id === "tenant_intake_demo",
  );
  await bound(v);
  requireData(v.material_hash === (await intakeHash(v.material)));
  const m = v.material.manifest,
    b = v.binding;
  requireData(
    m.bundle_id === target.bundle_id &&
      m.record_key === target.record_key &&
      m.case_id === target.case_id &&
      b.bundle_id === m.bundle_id &&
      b.record_key === m.record_key &&
      b.case_id === m.case_id &&
      b.expected_case_version === m.case_version &&
      b.expected_intake_receipt_hash === m.intake_receipt_hash &&
      b.expected_material_hash === v.material_hash,
  );
  let last = null;
  for (const e of v.history) {
    await validateDiscoveryEntry(e);
    requireData(
      e.case_id === m.case_id &&
        e.sequence === (last?.sequence ?? 0) + 1 &&
        e.previous_entry_hash === (last?.hash ?? null),
    );
    last = e;
  }
  requireData(
    b.expected_discovery_revision === (last?.sequence ?? 0) &&
      b.expected_previous_entry_hash === (last?.hash ?? null),
  );
  const purposes = [
    ...new Set(
      v.history
        .filter(
          (e) =>
            e.operation === "confirm" && e.material_hash === v.material_hash,
        )
        .map((e) => e.command.purpose),
    ),
  ].sort();
  requireData(
    equal(purposes, v.current.confirmed_purposes) &&
      v.current.can_record === (m.case_id !== null),
  );
  return v;
}
export async function validateDiscoveryResult(v, command) {
  requireData(
    v?.schema_version === "discovery-review-result.v1" &&
      v.status === "recorded" &&
      v.authority_granted === false &&
      v.closure_permission === false,
  );
  await validateDiscoveryEntry(v.entry);
  requireData(equal(v.entry.command, command));
  return v;
}
