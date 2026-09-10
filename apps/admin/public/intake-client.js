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
            "Another tab has an unresolved intake, Discovery, pack, preparation-work or result command. Recover the saved original submission before starting another; nothing new was submitted.",
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
    dispute: null,
    disputeOpen: window.localStorage.getItem(
      "fieldruntime.result.navigation.v1",
    ),
    disputeConfirmed: null,
    disputeError: null,
    disputeNeedsRefresh: true,
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
      ["pack-selection-read.v2", "pack-selection-read.v3"].includes(
        state.pack?.schema_version,
      ) &&
      target.case_id
    )
      await refreshWork(target);
    if (
      target.case_id &&
      state.disputeOpen === target.case_id + "|" + target.record_key
    )
      await refreshDispute(target);
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
  async function refreshDispute(target = state.discoveryTarget) {
    state.disputeNeedsRefresh = true;
    state.disputeError = null;
    if (!target?.case_id) return;
    try {
      const view = await validateDisputeView(
        await request(disputePath(target)),
        target,
      );
      state.dispute = view;
      // Independent reads may straddle a Case/intake change. Do not assemble
      // apparent current permission from incompatible snapshots.
      const m = state.discovery?.material.manifest;
      requireData(
        m &&
          m.case_id === view.binding.case_id &&
          m.record_key === view.binding.record_key &&
          m.case_version === view.binding.case_version &&
          m.case_journal_hash === view.binding.case_head_hash,
      );
      requireData(
        view.binding.business_input_hash ===
          (await intakeHash({
            bundles: m.business_bundle_hashes,
            commits: m.business_commit_hashes,
          })),
      );
      state.disputeNeedsRefresh = false;
    } catch (error) {
      state.disputeError = `Result information unavailable or changed: ${error.message}`;
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
          `${ROOT}/dispute-results/commands`,
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
      const isDispute = saved.path === `${ROOT}/dispute-results/commands`,
        isWork = saved.path === `${ROOT}/preparation-work/commands`,
        isDiscovery = saved.path.endsWith("discovery-reviews"),
        isPack = saved.path === `${PACK_ROOT}/selections/publication`;
      if (isDispute) {
        await validateDisputeReceipt(result, JSON.parse(saved.body));
        state.disputeConfirmed = result;
        state.disputeNeedsRefresh = true;
        const binding = result.entry.command.binding;
        requireData(
          saved.target?.case_id === binding.case_id &&
            saved.target.record_key === binding.record_key,
        );
        state.discoveryTarget = saved.target;
        state.disputeOpen = binding.case_id + "|" + binding.record_key;
        window.localStorage.setItem(
          "fieldruntime.result.navigation.v1",
          state.disputeOpen,
        );
      } else if (isWork) {
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
      if (!isDiscovery && !isPack && !isWork && !isDispute)
        state.confirmed = result;
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
          isPack || isWork || isDispute
            ? state.discoveryTarget?.bundle_id
            : isDiscovery
              ? result.entry.command.bundle_id
              : (result.receipt?.selection.bundle_id ?? result.bundle_id),
        );
        if (state.discoveryTarget) await refreshDiscovery();
      } catch (error) {
        state.needsRefresh = true;
        state.error = `Confirmed ${isDispute ? "business-result receipt" : isWork ? "preparation-work receipt" : isPack ? "publication receipt" : isDiscovery ? "descriptive review" : result.receipt ? "Case receipt" : "preparation"} retained. Current view could not be refreshed: ${error.message}`;
      }
      return result;
    } catch (error) {
      if (error.confirmedDenial) {
        await storage.clear(saved);
        state.pending = (await storage.get()) ?? null;
        state.preview = null;
        state.needsRefresh = true;
        state.disputeNeedsRefresh = true;
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
    openDispute: () =>
      run(async () => {
        const target = state.discoveryTarget;
        requireData(target?.case_id);
        state.disputeOpen = target.case_id + "|" + target.record_key;
        window.localStorage.setItem(
          "fieldruntime.result.navigation.v1",
          state.disputeOpen,
        );
        await refreshDispute();
      }),
    refreshDispute: () =>
      run(async () => {
        state.needsRefresh = true;
        // Refresh the descriptive input anchor as well, without recording anything.
        await refreshDiscovery();
      }),
    writeDispute: (command) =>
      run(async () => {
        requireData(
          !state.pending &&
            !state.needsRefresh &&
            !state.disputeNeedsRefresh &&
            state.dispute &&
            equal(command.binding, state.dispute.binding),
        );
        state.pending = {
          path: `${ROOT}/dispute-results/commands`,
          body: JSON.stringify(command),
          target: { ...state.discoveryTarget },
        };
        return submitPending();
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
    [
      "preparation-pack.v1",
      "preparation-pack.v2",
      "preparation-pack.v3",
      "preparation-pack.v4",
    ].includes(a?.schema_version) &&
      a.pack_id === "pack_synthetic_invoice_dispute_north" &&
      a.authority_granted === false &&
      a.closure_permission === false &&
      a.template?.template_id ===
        `invoice-dispute-preparation.${a.schema_version.split(".").at(-1)}` &&
      a.material?.model_calls === 0 &&
      a.findings?.length === 7 &&
      a.loop_outputs?.length === 6 &&
      Array.isArray(a.sources),
  );
  const { version, ...content } = a;
  requireData(
    version ===
      `pack-${a.schema_version.split(".").at(-1)}-${(await intakeHash(content)).slice(7)}` &&
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
    [
      "pack-selection-entry.v1",
      "pack-selection-entry.v2",
      "pack-selection-entry.v3",
      "pack-selection-entry.v4",
    ].includes(e?.schema_version) &&
      e.tenant_id === "tenant_intake_demo" &&
      e.pack_id === "pack_synthetic_invoice_dispute_north" &&
      e.actor?.identity_id === "identity_pack_reviewer_demo" &&
      e.actor.status === "active" &&
      e.actor.identity_kind === "human" &&
      equal(
        e.versions,
        e.schema_version.endsWith(".v1")
          ? packVersions
          : {
              projection: `preparation-pack.${e.schema_version.split(".").at(-1)}`,
              selection: `pack-selection.${e.schema_version.split(".").at(-1)}`,
            },
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
    [
      "pack-selection-result.v1",
      "pack-selection-result.v2",
      "pack-selection-result.v3",
      "pack-selection-result.v4",
    ].includes(v?.schema_version) &&
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
    [
      "pack-selection-read.v1",
      "pack-selection-read.v2",
      "pack-selection-read.v3",
      "pack-selection-read.v4",
    ].includes(v?.schema_version) &&
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
    [
      "preparation-work-entry.v1",
      "preparation-work-entry.v2",
      "preparation-work-entry.v3",
    ].includes(e?.schema_version) &&
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
        e.result.execution_facts.model_calls ===
          (e.schema_version === "preparation-work-entry.v3" ? 1 : 0) &&
        (e.schema_version !== "preparation-work-entry.v3" ||
          (e.result.investigation?.live_activation === false &&
            e.result.investigation?.semantic_correctness ===
              "not_established" &&
            e.result.investigation?.interpretation_review_required === true)),
    );
  }
  return e;
}
export async function validateWorkReceipt(v, command) {
  requireData(
    [
      "preparation-work-receipt.v1",
      "preparation-work-receipt.v2",
      "preparation-work-receipt.v3",
    ].includes(v?.schema_version) &&
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
    [
      "preparation-work-read.v1",
      "preparation-work-read.v2",
      "preparation-work-read.v3",
    ].includes(v?.schema_version) &&
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
      requireData(
        e.binding_hash === (await intakeHash(e.command.binding)) &&
          e.case_id === e.command.binding.case_id &&
          e.record_key === e.command.binding.record_key &&
          !starts.has(e.invocation_id),
      );
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
  if (
    ["preparation-work-read.v2", "preparation-work-read.v3"].includes(
      v.schema_version,
    )
  ) {
    const p = v.resource_preflight;
    requireData(
      p === null ||
        (p &&
          typeof p.eligible === "boolean" &&
          p.permission_granted === false &&
          Array.isArray(p.reasons) &&
          Array.isArray(p.bundle_ids) &&
          equal(Object.keys(p.counts).sort(), [
            "associated_support_artifacts",
            "coverage_rows",
            "parsed_utf8_bytes",
            "questions",
            "retained_bundles",
          ]) &&
          equal(Object.keys(p.limits).sort(), Object.keys(p.counts).sort()) &&
          p.counts.retained_bundles === p.bundle_ids.length &&
          Object.keys(p.counts).every(
            (k) =>
              Number.isSafeInteger(p.counts[k]) &&
              p.counts[k] >= 0 &&
              Number.isSafeInteger(p.limits[k]),
          ) &&
          (!p.eligible ||
            (p.reasons.length === 0 &&
              Object.keys(p.counts).every((k) => p.counts[k] <= p.limits[k])))),
    );
    requireData(
      !v.current.can_start ||
        (p?.eligible === true &&
          v.candidate_binding !== null &&
          v.current.reasons.length === 0),
    );
  }
  const pending = [...starts.values()].filter(
    (e) => !terminals.has(e.invocation_id),
  );
  requireData(
    pending.length <= 1 &&
      v.current.pending_invocation === (pending[0]?.invocation_id ?? null) &&
      (!pending.length || !v.current.can_start),
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

export function disputePath(target) {
  return `${ROOT}/dispute-results?case_id=${encodeURIComponent(target.case_id)}&record_key=${encodeURIComponent(target.record_key)}`;
}
const resultAssert = (ok) => {
  if (!ok)
    throw new Error(
      "Business-result evidence could not be reconciled. Current permission is unconfirmed.",
    );
};
const resultRoles = {
  enroll: "identity_intake_operator",
  candidate: "identity_intake_operator",
  basis_check: "identity_dispute_verifier",
  request_authority: "identity_intake_operator",
  review_authority: "identity_dispute_morgan",
  no_action: "identity_dispute_morgan",
  report: "identity_dispute_reporter",
  result_check: "identity_dispute_verifier",
  accept: "identity_dispute_robin",
  reject: "identity_dispute_robin",
  reopen: "identity_dispute_robin",
};
const resultAuthority = (e) =>
  ["request_authority", "review_authority"].includes(e.operation);
export async function validateDisputeEntry(e) {
  resultAssert(
    e?.schema_version === "dispute-result-entry.v1" &&
      e.tenant_id === "tenant_intake_demo" &&
      e.command?.schema_version === "dispute-result-command.v1" &&
      e.operation === e.command.operation &&
      e.operation === e.data?.kind &&
      e.case_id === e.command.binding?.case_id &&
      e.record_key === e.command.binding.record_key &&
      e.idempotency_key === e.command.idempotency_key &&
      e.actor?.identity_id === resultRoles[e.operation] &&
      e.actor.tenant_id === e.tenant_id &&
      e.actor.status === "active" &&
      e.actor.identity_kind ===
        (e.operation.endsWith("check") ? "service" : "human") &&
      equal(e.versions, {
        engine: "dispute-result.v1",
        reader: "synthetic-dispute-source.v1",
        material: "dispute-authority-material.v1",
      }),
  );
  await bound(e);
  resultAssert(
    e.command_fingerprint === (await intakeHash(e.command)) &&
      e.id === `result_${e.command_fingerprint.slice(7)}` &&
      e.sequence ===
        e.command.binding.result_revision + (resultAuthority(e) ? 0 : 1) &&
      e.previous_entry_hash === e.command.binding.result_head,
  );
  if (e.operation.endsWith("check")) {
    const d = e.data;
    resultAssert(
      ["match", "mismatch", "inconclusive"].includes(d.comparison?.status) &&
        d.comparison.phase ===
          (e.operation === "basis_check" ? "basis" : "result") &&
        Array.isArray(d.comparison.reasons) &&
        d.observation?.recorded_at === e.recorded_at,
    );
    if (d.outcome)
      resultAssert(
        e.operation === "result_check" &&
          d.comparison.status === "match" &&
          d.outcome.accepted === false &&
          d.outcome.case_id === e.case_id &&
          d.outcome.verified_by_identity_id === e.actor.identity_id &&
          d.outcome.verified_at === e.recorded_at,
      );
    else
      resultAssert(
        e.operation !== "result_check" || d.comparison.status !== "match",
      );
  }
  return e;
}
export async function validateDisputeReceipt(v, command) {
  resultAssert(
    v?.schema_version === "dispute-result-receipt.v1" &&
      v.historical_only === true,
  );
  await validateDisputeEntry(v.entry);
  resultAssert(equal(v.entry.command, command));
  return v;
}
export function disputeHistory(view, candidateHash = view?.candidate_hash) {
  return (
    view?.history.filter(
      (e) =>
        e.hash === candidateHash || e.command.candidate_hash === candidateHash,
    ) ?? []
  );
}
export async function validateDisputeView(v, target) {
  resultAssert(
    v?.schema_version === "dispute-result-read.v1" &&
      v.simulation === true &&
      v.binding?.case_id === target.case_id &&
      v.binding.record_key === target.record_key &&
      v.subject?.case_id === target.case_id &&
      v.subject.record_key === target.record_key &&
      v.subject.tenant_id === "tenant_intake_demo" &&
      v.subject.entity === "entity_north" &&
      v.subject.customer === "Orchid" &&
      v.subject.dispute_id === "dispute-17" &&
      v.subject.invoice_id === "INV-101" &&
      v.subject.order_id === "PO-9" &&
      v.subject.delivery_id === "DEL-4" &&
      v.subject.amount_minor === 1500000 &&
      v.subject.currency === "USD" &&
      Array.isArray(v.history) &&
      Number.isFinite(Date.parse(v.evaluated_at)) &&
      v.current?.closure_permitted === false &&
      v.current.financial_write_permitted === false &&
      typeof v.current.accepted === "boolean" &&
      typeof v.current.verified === "boolean" &&
      Array.isArray(v.current.blockers) &&
      Array.isArray(v.current.remaining_obligations),
  );
  let last = null,
    lastPosition = -1;
  const candidates = new Set();
  for (const e of v.history) {
    await validateDisputeEntry(e);
    resultAssert(
      e.case_id === target.case_id && e.record_key === target.record_key,
    );
    if (e.operation === "candidate") candidates.add(e.hash);
    else if (e.operation !== "enroll")
      resultAssert(candidates.has(e.command.candidate_hash));
    // The fixed profile admits one record; O is Case-wide. Derived D6 receipts
    // share their bound O and carry a separate canonical authority position.
    resultAssert(
      e.sequence === (last?.sequence ?? 0) + (resultAuthority(e) ? 0 : 1) &&
        e.previous_entry_hash === (last?.hash ?? null),
    );
    if (resultAuthority(e)) {
      resultAssert(e.authority_position > lastPosition);
      lastPosition = e.authority_position;
    } else last = e;
  }
  resultAssert(
    v.binding.result_revision === (last?.sequence ?? 0) &&
      v.binding.result_head === (last?.hash ?? null) &&
      v.candidate_hash ===
        (v.history.findLast((e) => e.operation === "candidate")?.hash ?? null),
  );
  const a = v.authority;
  if (a) {
    resultAssert(
      a.schema_version === "authority-request-read-response.dispute.v1" &&
        a.simulation === true &&
        a.action_permission === false &&
        a.tenant_id === "tenant_intake_demo" &&
        a.case_id === target.case_id &&
        a.request_binding_hash === (await intakeHash(a.request)) &&
        a.request.review_material_hash === (await intakeHash(a.material)) &&
        a.request.proposed_consequence_hash ===
          (await intakeHash(a.material.consequence)) &&
        equal(a.material.basis.subject, v.subject),
    );
    let prev = null;
    for (const e of a.history) {
      const { event_hash, ...content } = e;
      resultAssert(
        event_hash === (await intakeHash(content)) &&
          e.request_binding_hash === a.request_binding_hash &&
          e.authority_request_id === a.authority_request_id &&
          e.review_revision === (prev?.review_revision ?? -1) + 1 &&
          e.previous_event_hash === (prev?.event_hash ?? null),
      );
      prev = e;
    }
    resultAssert(a.review_revision === prev?.review_revision);
    if (a.current.authorized)
      resultAssert(
        a.current.eligible === true &&
          a.current.lifecycle === "open" &&
          a.current.resolution?.outcome === "authorized" &&
          a.current.effective_approval_ids.length > 0 &&
          a.request.case_version === v.binding.case_version &&
          a.request.authority_state_revision ===
            v.binding.authority_state_revision &&
          a.request.expires_at > v.evaluated_at &&
          a.current.effective_approval_ids.every((id) =>
            a.history.some(
              (e) =>
                e.decision?.authority_decision_id === id &&
                e.decision.decision === "approve",
            ),
          ),
      );
  }
  const h = disputeHistory(v),
    check = h.findLast((e) => e.operation === "result_check"),
    d = h.findLast((e) => e.operation === "no_action"),
    accepted = h.findLast((e) => e.operation === "accept");
  if (v.current.verified)
    resultAssert(
      check?.data.comparison.status === "match" &&
        d &&
        check.command.decision_hash === d.hash &&
        Date.parse(v.evaluated_at) - Date.parse(check.recorded_at) < 900000 &&
        Date.parse(v.evaluated_at) >= Date.parse(check.recorded_at) &&
        d.data.basis.case_version === v.binding.case_version &&
        d.data.basis.catalog_hash === v.binding.catalog_hash &&
        v.binding.business_input_hash ===
          (await intakeHash({
            bundles: d.data.basis.business_bundle_hashes,
            commits: d.data.basis.business_commit_hashes,
          })) &&
        equal(v.outcome, check.data.outcome) &&
        !h.some((e) => ["reject", "reopen"].includes(e.operation)),
    );
  else resultAssert(v.outcome === null);
  if (v.current.accepted)
    resultAssert(
      v.current.verified &&
        a?.current.authorized &&
        accepted?.command.observation_hash === check?.hash &&
        accepted.command.decision_hash === d?.hash &&
        accepted.command.outcome_hash ===
          (await intakeHash(check.data.outcome)),
    );
  resultAssert(
    [
      "cash_collected",
      "credits_issued",
      "work_newly_attended_to",
      "human_attention_released",
    ].every((k) => v.proof_measures?.[k] === null) &&
      (v.current.accepted
        ? v.proof_measures.disputes_resolved === 1
        : [null, 0].includes(v.proof_measures.disputes_resolved)),
  );
  return v;
}
// Called only for a deliberate operator submission from an inspected read.
// No fetch, key replacement, authority calculation or automatic retry occurs here.
export async function draftDisputeCommand(v, operation, fields, key) {
  const h = disputeHistory(v),
    last = (op) => h.findLast((e) => e.operation === op),
    d = last("no_action"),
    check = last("result_check");
  const c = {
    schema_version: "dispute-result-command.v1",
    operation,
    binding: globalThis.structuredClone(v.binding),
    idempotency_key: key,
  };
  if (!["enroll", "candidate"].includes(operation))
    c.candidate_hash = v.candidate_hash;
  if (operation === "request_authority")
    c.basis_observation_hash = v.basis?.basis_observation_hash;
  if (["review_authority", "no_action"].includes(operation))
    c.review = {
      authority_request_id: v.authority?.authority_request_id,
      request_binding_hash: v.authority?.request_binding_hash,
      expected_review_revision: v.authority?.review_revision,
    };
  if (operation === "review_authority") {
    c.decision = fields.decision;
    c.reason = fields.reason;
  }
  if (operation === "no_action")
    c.basis_hash = await intakeHash(v.authority.material.basis);
  if (["report", "result_check", "accept"].includes(operation))
    c.decision_hash = d?.hash;
  if (operation === "report") {
    c.reason = fields.reason;
    c.claim = {
      source_id: d.data.basis.source.ar.object_id,
      source_version: d.data.basis.source.ar.version + 1,
      occurred_at: fields.occurred_at,
      source_timezone: "UTC",
      evidence_ref: fields.evidence_ref,
    };
  }
  if (operation === "accept") {
    c.observation_hash = check?.hash;
    c.outcome_hash = await intakeHash(check?.data.outcome);
    c.reason = fields.reason;
    c.commitments = [
      {
        id: "commitment_payment_follow_up",
        description: "Obtain payment status for the upheld disputed portion",
        owner_identity_id: "identity_dispute_morgan",
        due_at: fields.due_at,
        status: "owned",
        evidence_ref: `dispute-result://${d.hash}/payment-follow-up`,
      },
    ];
  }
  if (["reject", "reopen"].includes(operation)) c.reason = fields.reason;
  if (operation === "reopen") {
    c.acceptance_hash = last("accept")?.hash;
    c.observation_hash = check?.hash;
  }
  return c;
}
