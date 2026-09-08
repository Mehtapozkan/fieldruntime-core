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
            "Another tab has an unresolved intake command. Recover the saved original submission before starting another; nothing new was submitted.",
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
    state.needsRefresh = false;
    if (view)
      window.localStorage.setItem(
        "fieldruntime.intake.navigation.v1",
        view.bundle.id,
      );
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
      saved && [`${ROOT}/preparations`, `${ROOT}/commits`].includes(saved.path),
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
    try {
      const result = await request(saved.path, saved.body);
      if (saved.path.endsWith("commits")) {
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
      state.confirmed = result;
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
        await refresh(result.receipt?.selection.bundle_id ?? result.bundle_id);
      } catch (error) {
        state.needsRefresh = true;
        state.error = `Confirmed ${result.receipt ? "Case receipt" : "preparation"} retained. Current view could not be refreshed: ${error.message}`;
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
    load: () =>
      run(async () => {
        state.pending = (await storage.get()) ?? null;
        await refresh(
          window.localStorage.getItem("fieldruntime.intake.navigation.v1") ??
            undefined,
        );
      }),
    refresh: (id) => run(() => refresh(id)),
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
