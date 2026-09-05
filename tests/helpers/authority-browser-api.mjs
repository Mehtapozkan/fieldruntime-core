import assert from "node:assert/strict";
import * as runtime from "../../dist/packages/runtime/src/index.js";
import { handleApiRequest } from "../../dist/apps/api/src/handler.js";
import {
  createReviewClient,
  TENANT,
  CASE_ID,
} from "../../apps/admin/public/authority-client.js";

export function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    keys: () => [...values.keys()],
  };
}

export function browserApiHarness(editCatalog = () => {}) {
  let cases = runtime.emptyCaseEngine(),
    ids = 0;
  let now = new Date("2026-09-06T16:00:00.000Z");
  const dependencies = { now: () => now, nextId: (kind) => `${kind}_${++ids}` };
  const data = structuredClone(runtime.syntheticAuthorityCatalog());
  editCatalog(data);
  const catalog = runtime.reviewSnapshot("catalog", {
    schema_version: "authority-catalog.v1",
    tenant_id: TENANT,
    revision: 1,
    previous_catalog_hash: null,
    after_review_position: 0,
    recorded_at: now.toISOString(),
    data: runtime.normalizeAuthorityCatalogData(data, TENANT),
  });
  let authority = { entries: [], snapshots: [catalog] };
  const head = {
    tenant_id: TENANT,
    revision: 1,
    snapshot_hash: catalog.hash,
    last_recorded_at: now.toISOString(),
  };
  function caseCommand(command) {
    const result = runtime.executeCaseCommand(cases, command, dependencies);
    cases = result.state;
    return result;
  }
  function review(command, seat) {
    runtime.assertAuthorityStateIntegrity(authority, cases, [head]);
    const result = runtime.executeAuthorityCommand(
      authority,
      cases,
      head,
      command,
      seat,
      dependencies,
    );
    authority = result.state;
    runtime.assertAuthorityStateIntegrity(authority, cases, [head]);
    return result;
  }
  const calls = [],
    storage = memoryStorage();
  let drop = false,
    forged = false;
  const fetcher = async (path, options) => {
    calls.push({ path, ...options });
    const result = await handleApiRequest(
      {
        path,
        method: options.method,
        headers: options.headers,
        body: options.body,
      },
      {
        authority: {
          create: (command) => review(command, "operator"),
          decide: review,
          read: (_tenant, id) =>
            runtime.readAuthorityRequest(authority, cases, head, id, now),
          catalogRevision: () => head.revision,
        },
        executeCaseCommand: (_tenant, command) => caseCommand(command),
        getCase: (tenant, id) => runtime.getCase(cases, tenant, id),
        getJournal: (tenant, id) => runtime.getCase(cases, tenant, id)?.journal,
        listCases: () => cases.cases,
        isReady: () => true,
        getEvaluationFixture: () => undefined,
        getGuidedWalkthrough: () => undefined,
      },
    );
    if (options.method === "POST" && drop) {
      drop = false;
      throw new Error("lost acknowledgement after commit");
    }
    const body =
      options.method === "POST" && forged
        ? { status: "applied", receipt: { result: { authorized: true } } }
        : result.body;
    forged = false;
    return new globalThis.Response(JSON.stringify(body), {
      status: result.status,
      headers: result.headers,
    });
  };
  return {
    calls,
    fetcher,
    storage,
    caseCommand,
    advance(ms) {
      now = new Date(now.valueOf() + ms);
    },
    client() {
      return createReviewClient({
        fetcher,
        storage,
        nextKey: () => `key-${++ids}`,
      });
    },
    dropNextWrite() {
      drop = true;
    },
    forgeNextResponse() {
      forged = true;
    },
    snapshot: () => JSON.stringify({ cases, authority, head, ids }),
    get requests() {
      return authority.entries.filter((entry) => entry.request);
    },
    get caseVersion() {
      return runtime.getCase(cases, TENANT, CASE_ID)?.document.case.version;
    },
    get entries() {
      return authority.entries;
    },
    assertIntegrity() {
      assert.doesNotThrow(() =>
        runtime.assertAuthorityStateIntegrity(authority, cases, [head]),
      );
    },
  };
}
