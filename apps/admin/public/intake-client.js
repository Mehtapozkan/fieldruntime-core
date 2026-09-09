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
            "Another tab has an unresolved intake, Discovery, pack or preparation-work command. Recover the saved original submission before starting another; nothing new was submitted.",
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
    pack: null,
    packConfirmed: null,
    packError: null,
    packNeedsRefresh: true,
    work: null,
    workConfirmed: null,
    workError: null,
    workNeedsRefresh: true,
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
    await refreshPack(brief, target);
    if (
      state.pack?.schema_version === "pack-selection-read.v2" &&
      target.case_id
    )
      await refreshWork(target);
    return brief;
  }
  async function refreshPack(brief, target) {
    state.packNeedsRefresh = true;
    state.packError = null;
    try {
      const view = await validatePackView(
        await request(packPath(target)),
        target,
      );
      state.pack = view;
      if (
        view.candidate &&
        !equal(view.candidate.binding.discovery, brief.binding)
      )
        throw new Error(
          "Description and pack were read across a change. Refresh and inspect both before a new submission.",
        );
      state.packNeedsRefresh = false;
    } catch (error) {
      state.packError = error.message;
    }
  }
  async function refreshWork(target) {
    state.workNeedsRefresh = true;
    state.workError = null;
    try {
      const view = await validateWorkView(
        await request(workPath(target)),
        target,
      );
      state.work = view;
      requireData(
        !state.packNeedsRefresh &&
          view.selection_head === state.pack.selection_head &&
          view.selection_revision === state.pack.selection_revision,
      );
      if (view.candidate_binding)
        requireData(
          equal(
            view.candidate_binding.basis.discovery,
            state.discovery.binding,
          ),
        );
      state.workNeedsRefresh = false;
    } catch (error) {
      state.workError = `Current preparation could not be reconciled: ${error.message}`;
    }
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
        ([
          `${ROOT}/preparations`,
          `${ROOT}/commits`,
          `${ROOT}/preparation-work/commands`,
          `${PACK_ROOT}/selections/publication`,
        ].includes(saved.path) ||
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
      const isWork = saved.path === `${ROOT}/preparation-work/commands`,
        isDiscovery = saved.path.endsWith("discovery-reviews"),
        isPack = saved.path === `${PACK_ROOT}/selections/publication`;
      if (isWork) {
        await validateWorkReceipt(result, JSON.parse(saved.body));
        state.workConfirmed = result;
        const b =
          result.entry.command.operation === "start"
            ? result.entry.command.binding
            : null;
        if (b)
          state.discoveryTarget = {
            bundle_id: b.basis.discovery.bundle_id,
            record_key: b.record_key,
            case_id: b.case_id,
          };
      } else if (isPack) {
        await validatePackResult(result, JSON.parse(saved.body));
        state.packConfirmed = result;
        const artifact = result.entry.artifact ?? state.pack?.selected_artifact;
        if (artifact)
          state.discoveryTarget = {
            bundle_id: artifact.binding.discovery.bundle_id,
            record_key: artifact.binding.discovery.record_key,
            case_id: artifact.binding.discovery.case_id,
          };
      } else if (isDiscovery) {
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
      if (!isDiscovery && !isPack && !isWork) state.confirmed = result;
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
        if (isWork && result.entry.command.operation !== "start") {
          // A different tab may have navigated elsewhere. Recover the original
          // invocation's canonical target through a read, never a guessed binding.
          const target = {
            case_id: result.entry.case_id,
            record_key: result.entry.record_key,
          };
          const view = await validateWorkView(
            await request(workPath(target)),
            target,
          );
          const run = view.invocations.find(
            (r) => r.invocation_id === result.entry.invocation_id,
          );
          requireData(run);
          state.discoveryTarget = {
            ...target,
            bundle_id: run.binding.basis.discovery.bundle_id,
          };
        }
        await refresh(
          isPack || isWork
            ? state.discoveryTarget?.bundle_id
            : isDiscovery
              ? result.entry.command.bundle_id
              : (result.receipt?.selection.bundle_id ?? result.bundle_id),
        );
        if (state.discoveryTarget) await refreshDiscovery();
      } catch (error) {
        state.needsRefresh = true;
        state.error = `Confirmed ${isWork ? "preparation-work receipt" : isPack ? "publication receipt" : isDiscovery ? "descriptive review" : result.receipt ? "Case receipt" : "preparation"} retained. Current view could not be refreshed: ${error.message}`;
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
    writeWork: (command) =>
      run(async () => {
        requireData(
          !state.pending &&
            !state.needsRefresh &&
            !state.workNeedsRefresh &&
            state.work,
        );
        state.pending = {
          path: `${ROOT}/preparation-work/commands`,
          body: JSON.stringify(command),
        };
        return submitPending();
      }),
    writePack: (command) =>
      run(async () => {
        requireData(
          !state.pending &&
            !state.needsRefresh &&
            !state.packNeedsRefresh &&
            state.pack,
        );
        const v = state.pack;
        requireData(
          command.operation === "withdraw"
            ? v.current.can_withdraw
            : command.operation === "rollback"
              ? v.rollback_candidates.some(
                  (r) =>
                    r.artifact_hash === command.artifact_hash && r.eligible,
                )
              : v.current.can_publish,
        );
        state.pending = {
          path: `${PACK_ROOT}/selections/publication`,
          body: JSON.stringify(command),
        };
        return submitPending();
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

const PACK_ROOT = `${ROOT}/preparation-packs/pack_synthetic_invoice_dispute_north`;
export function packPath(target) {
  return `${PACK_ROOT}?bundle_id=${encodeURIComponent(target.bundle_id)}&record_key=${encodeURIComponent(target.record_key)}${target.case_id ? `&case_id=${encodeURIComponent(target.case_id)}` : ""}`;
}
const packVersions = {
  projection: "preparation-pack.v1",
  selection: "pack-selection.v1",
};
async function validatePackArtifact(a, hash) {
  requireData(
    ["preparation-pack.v1", "preparation-pack.v2"].includes(
      a?.schema_version,
    ) &&
      a.pack_id === "pack_synthetic_invoice_dispute_north" &&
      a.authority_granted === false &&
      a.closure_permission === false &&
      a.template?.template_id ===
        (a.schema_version.endsWith(".v2")
          ? "invoice-dispute-preparation.v2"
          : "invoice-dispute-preparation.v1") &&
      a.material?.model_calls === 0 &&
      a.findings?.length === 7 &&
      a.loop_outputs?.length === 6 &&
      Array.isArray(a.sources),
  );
  const { version, ...content } = a;
  requireData(
    version ===
      `pack-${a.schema_version.endsWith(".v2") ? "v2" : "v1"}-${(await intakeHash(content)).slice(7)}` &&
      hash === (await intakeHash(a)),
  );
  requireData(
    a.binding.discovery.expected_material_hash ===
      (await intakeHash(a.material)) &&
      equal(a.binding.manifest, a.material.manifest),
  );
  const refs = new Set(a.sources.map((c) => c.id));
  requireData(
    a.findings
      .concat(a.loop_outputs)
      .every((c) => c.citation_ids.every((id) => refs.has(id))),
  );
}
export async function validatePackEntry(e) {
  requireData(
    ["pack-selection-entry.v1", "pack-selection-entry.v2"].includes(
      e?.schema_version,
    ) &&
      e.tenant_id === "tenant_intake_demo" &&
      e.pack_id === "pack_synthetic_invoice_dispute_north" &&
      e.actor?.identity_id === "identity_pack_reviewer_demo" &&
      e.actor.status === "active" &&
      e.actor.identity_kind === "human" &&
      equal(
        e.versions,
        e.schema_version.endsWith(".v2")
          ? {
              projection: "preparation-pack.v2",
              selection: "pack-selection.v2",
            }
          : packVersions,
      ) &&
      e.operation === e.command?.operation &&
      e.idempotency_key === e.command.idempotency_key &&
      e.sequence === e.command.expected_selection_revision + 1 &&
      e.previous_entry_hash === e.command.expected_selection_head &&
      e.artifact_hash === e.command.artifact_hash &&
      e.result?.authority_granted === false &&
      e.result.closure_permission === false,
  );
  await bound(e);
  requireData(
    e.command_fingerprint === (await intakeHash(e.command)) &&
      e.id === `pack_selection_${e.command_fingerprint.slice(7)}` &&
      e.command.expected_publication_profile_hash ===
        (await intakeHash(e.profile)),
  );
  if (e.operation === "publish") {
    await validatePackArtifact(e.artifact, e.artifact_hash);
    requireData(equal(e.artifact.binding, e.command.expected_basis));
  } else
    requireData(
      e.artifact === null && ["withdraw", "rollback"].includes(e.operation),
    );
  requireData(
    e.result.selected_artifact_hash ===
      (e.operation === "withdraw" ? null : e.artifact_hash),
  );
  return e;
}
export async function validatePackResult(v, command) {
  requireData(
    ["pack-selection-result.v1", "pack-selection-result.v2"].includes(
      v?.schema_version,
    ) &&
      v.status === "recorded" &&
      v.historical_receipt === true &&
      v.authority_granted === false &&
      v.closure_permission === false,
  );
  await validatePackEntry(v.entry);
  requireData(equal(v.entry.command, command));
  return v;
}
export async function validatePackView(v, target) {
  requireData(
    ["pack-selection-read.v1", "pack-selection-read.v2"].includes(
      v?.schema_version,
    ) &&
      v.pack_id === "pack_synthetic_invoice_dispute_north" &&
      v.authority_granted === false &&
      v.closure_permission === false &&
      equal(v.target, { ...target, case_id: target.case_id ?? null }) &&
      Array.isArray(v.history) &&
      Array.isArray(v.comparison) &&
      Array.isArray(v.rollback_candidates) &&
      [
        "proposed",
        "published_for_preparation",
        "stale",
        "withdrawn",
        "unavailable",
      ].includes(v.current?.status),
  );
  await bound(v);
  let last = null;
  const artifacts = new Map();
  for (const e of v.history) {
    await validatePackEntry(e);
    requireData(
      e.sequence === (last?.sequence ?? 0) + 1 &&
        e.previous_entry_hash === (last?.hash ?? null),
    );
    if (e.artifact) artifacts.set(e.artifact_hash, e.artifact);
    requireData(artifacts.has(e.artifact_hash));
    last = e;
  }
  requireData(
    v.selection_revision === (last?.sequence ?? 0) &&
      v.selection_head === (last?.hash ?? null) &&
      v.selected_artifact_hash ===
        (last?.result.selected_artifact_hash ?? null),
  );
  if (v.candidate) {
    await validatePackArtifact(v.candidate, v.candidate_hash);
    const b = v.candidate.binding.discovery;
    requireData(
      b.bundle_id === target.bundle_id &&
        b.record_key === target.record_key &&
        b.case_id === (target.case_id ?? null),
    );
  } else requireData(v.candidate_hash === null);
  requireData(
    equal(v.selected_artifact, artifacts.get(v.selected_artifact_hash) ?? null),
  );
  requireData(
    v.rollback_candidates.every((r) => artifacts.has(r.artifact_hash)),
  );
  requireData(
    v.current.eligible === (v.current.status === "published_for_preparation") &&
      (!v.current.can_withdraw || v.selected_artifact_hash !== null),
  );
  return v;
}

export function workPath(target) {
  return `${ROOT}/preparation-work?case_id=${encodeURIComponent(target.case_id)}&record_key=${encodeURIComponent(target.record_key)}`;
}
export async function validateWorkEntry(e) {
  requireData(
    e?.schema_version === "preparation-work-entry.v1" &&
      e.tenant_id === "tenant_intake_demo" &&
      e.authority_granted === false &&
      e.closure_permission === false,
  );
  await bound(e);
  const id = ["started", "terminal_result"].includes(e.event)
    ? "identity_disposition_worker_demo"
    : e.event === "evaluation_review"
      ? "identity_pack_reviewer_demo"
      : "identity_intake_operator";
  requireData(
    e.actor?.identity_id === id &&
      e.actor.status === "active" &&
      e.actor.identity_kind ===
        (id === "identity_disposition_worker_demo" ? "service" : "human") &&
      (e.event === "terminal_result" ||
        e.worker_profile.identities.some((i) => equal(i, e.actor))),
  );
  if (e.command)
    requireData(
      e.command_fingerprint === (await intakeHash(e.command)) &&
        e.idempotency_key === e.command.idempotency_key &&
        e.sequence === e.command.expected_work_revision + 1 &&
        e.previous_entry_hash === e.command.expected_work_head,
    );
  if (e.result) {
    requireData(
      e.event === "terminal_result" &&
        e.result_hash === (await intakeHash(e.result)) &&
        e.result.invocation_id === e.invocation_id &&
        e.result.started_entry_hash === e.started_entry_hash &&
        e.result.binding_hash === e.binding_hash &&
        e.result.financial_authority === false &&
        e.result.case_closure_permission === false &&
        e.result.follow_up.sent === false &&
        e.result.disposition.recommended_credit_minor === null &&
        e.result.execution_facts.model_calls === 0,
    );
  }
  return e;
}
export async function validateWorkReceipt(v, command) {
  requireData(
    v?.schema_version === "preparation-work-receipt.v1" &&
      v.historical_receipt === true &&
      v.authority_granted === false &&
      v.closure_permission === false,
  );
  await validateWorkEntry(v.entry);
  requireData(equal(v.entry.command, command));
  return v;
}
export async function validateWorkView(v, target) {
  requireData(
    v?.schema_version === "preparation-work-read.v1" &&
      v.case_id === target.case_id &&
      v.record_key === target.record_key &&
      v.authority_granted === false &&
      v.closure_permission === false &&
      Array.isArray(v.history) &&
      Array.isArray(v.invocations) &&
      Array.isArray(v.sources),
  );
  await bound(v);
  let last = null;
  const starts = new Map(),
    terminals = new Map(),
    reviews = new Map();
  for (const e of v.history) {
    await validateWorkEntry(e);
    requireData(
      e.case_id === v.case_id &&
        e.sequence === (last?.sequence ?? 0) + 1 &&
        e.previous_entry_hash === (last?.hash ?? null),
    );
    last = e;
    if (e.event === "started") {
      requireData(e.binding_hash === (await intakeHash(e.command.binding)));
      starts.set(e.invocation_id, e);
    } else {
      const start = starts.get(e.invocation_id);
      requireData(
        start &&
          e.started_entry_hash === start.hash &&
          e.binding_hash === start.binding_hash,
      );
      if (e.event === "terminal_result")
        requireData(equal(e.actor, start.actor));
      if (["terminal_result", "interrupt"].includes(e.event)) {
        requireData(!terminals.has(e.invocation_id));
        terminals.set(e.invocation_id, e);
      }
      if (e.event === "task_review") {
        requireData(
          !reviews.has(e.invocation_id) &&
            e.command.result_hash ===
              terminals.get(e.invocation_id)?.result_hash,
        );
        reviews.set(e.invocation_id, e);
      }
    }
  }
  requireData(
    v.work_revision === (last?.sequence ?? 0) &&
      v.work_head === (last?.hash ?? null),
  );
  const selected = [...starts.values()].filter(
    (e) => e.record_key === v.record_key,
  );
  requireData(selected.length === v.invocations.length);
  for (const [i, r] of v.invocations.entries()) {
    const start = selected[i],
      terminal = terminals.get(r.invocation_id),
      review = reviews.get(r.invocation_id);
    requireData(
      start.invocation_id === r.invocation_id &&
        start.hash === r.started_entry_hash &&
        equal(r.binding, start.command.binding) &&
        equal(r.result, terminal?.result ?? null) &&
        r.result_hash === (terminal?.result_hash ?? null) &&
        r.terminal_entry_hash === (terminal?.hash ?? null) &&
        r.outcome === (terminal?.outcome ?? "started") &&
        equal(r.review, review ?? null),
    );
    requireData(!r.can_accept || (r.current_usable && !review));
  }
  return v;
}
