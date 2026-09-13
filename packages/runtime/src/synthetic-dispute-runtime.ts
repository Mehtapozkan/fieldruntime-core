import {
  assertValidSyntheticDisputeContract,
  immutableJson,
  canonicalJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  intakeObject as o,
  intakeList as list,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
import { authorityTransaction } from "./postgres-authority-store.js";
import {
  PostgresDisputeResultStore,
  loadDisputeStore,
} from "./postgres-dispute-result-store.js";
import {
  normalizeSyntheticDisputeProfile,
  type SyntheticDisputeRole,
} from "./synthetic-dispute-profile.js";
import { validateDisputeExport, readDispute } from "./dispute-result.js";
import type { SyntheticDisputeSourcePort } from "./synthetic-dispute-source.js";
import type { SqlPool } from "./postgres-store.js";
export interface SyntheticDisputeRuntimeOptions {
  readonly pool: SqlPool;
  readonly profile: unknown;
  readonly source: SyntheticDisputeSourcePort;
  /** Trusted host/session identity context, never a field in business commands. */
  readonly actorIdentityId: () => string;
  readonly now: () => Date;
}
export interface SyntheticDisputeRuntime {
  /** Host-only setup: do not mount as a normal business command endpoint. */
  enroll(command: unknown): Promise<Obj>;
  submit(command: unknown): Promise<Obj>;
  read(): Promise<Obj>;
  export(): Promise<Obj>;
  workerInput(): Promise<Obj>;
}
const roleFor = (op: unknown): SyntheticDisputeRole =>
  String(op).includes("check")
    ? "verifier"
    : ["review_authority", "no_action"].includes(String(op))
      ? "decision"
      : op === "report"
        ? "reporter"
        : ["accept", "reject", "reopen"].includes(String(op))
          ? "recipient"
          : "operator";
/** Binds one immutable enrollment to the existing PostgreSQL D-039 interpreter. */
export function createSyntheticDisputeRuntime(
  options: SyntheticDisputeRuntimeOptions,
): SyntheticDisputeRuntime {
  const profile = normalizeSyntheticDisputeProfile(options.profile),
    subject = o(profile.subject),
    roles = o(profile.roles);
  ensure(
    typeof options.source.read === "function" &&
      options.source.profileId === o(profile.source).profile_id &&
      Object.keys(options.source).every((k) =>
        ["profileId", "read"].includes(k),
      ),
    "SOURCE_PORT_REQUIRED",
    "Trusted host must supply exactly the enrolled read-only synthetic port",
  );
  const read = options.source.read.bind(options.source),
    store = new PostgresDisputeResultStore(options.pool, read, profile);
  const check = (value: unknown, enroll: boolean): Obj => {
    assertValidSyntheticDisputeContract("command", value);
    const c = o(immutableJson(value)),
      binding = o(c.binding);
    ensure(
      (c.operation === "enroll") === enroll,
      "HOST_ENROLLMENT_REQUIRED",
      "Enrollment is a separate trusted host operation",
    );
    ensure(
      binding.case_id === subject.case_id &&
        binding.record_key === subject.record_key &&
        binding.profile_hash === sha256Json(profile),
      "NOT_ENROLLED",
      "Command is outside the configured immutable subject/profile",
    );
    ensure(
      options.actorIdentityId() === o(roles[roleFor(c.operation)]).identity_id,
      "REVIEWER_INELIGIBLE",
      "Trusted session is not the named actor for this operation",
    );
    return c;
  };
  return Object.freeze({
    enroll: async (c: unknown) =>
      immutableJson(await store.submit(check(c, true), options.now)),
    submit: async (c: unknown) =>
      immutableJson(await store.submit(check(c, false), options.now)),
    read: async () =>
      immutableJson(
        await store.read(
          String(subject.case_id),
          String(subject.record_key),
          options.now,
        ),
      ),
    export: async () =>
      immutableJson(
        await store.export(
          String(subject.case_id),
          String(subject.record_key),
          options.now,
        ),
      ),
    // No source read, full profile, role data, expected result, or result/acceptance
    // history crosses this separately selected worker-facing projection.
    workerInput: () =>
      authorityTransaction(options.pool, true, async (c) => {
        const s = await loadDisputeStore(c, profile),
          i = s.work.pack.discovery.intake;
        const commits = i.commits.filter(
          (x) =>
            x.case_id === subject.case_id &&
            x.record_key === subject.record_key,
        );
        ensure(
          commits.length > 0,
          "CASE_BINDING_REQUIRED",
          "Worker input requires an existing committed record",
        );
        const refs: Obj[] = [],
          records: Obj[] = [];
        for (const commit of commits) {
          const bundle = i.bundles.find(
            (b) => b.id === o(commit.selection).bundle_id,
          );
          ensure(bundle, "RESULT_INTEGRITY", "Committed bundle is missing");
          const record = list(bundle.records).find(
            (r) => r.record_key === subject.record_key,
          );
          ensure(record, "RESULT_INTEGRITY", "Committed record is missing");
          records.push(o(record.cells));
          for (const a of list(bundle.artifacts).filter(
            (a) =>
              a.role === "support" &&
              (o(commit.selection).support_document_ids as unknown[]).includes(
                a.document_id,
              ),
          )) {
            const ref = {
              artifact_hash: a.byte_hash,
              document_id: a.document_id,
              locator: a.derived_from,
              text: a.derived_text,
            };
            if (!refs.some((r) => canonicalJson(r) === canonicalJson(ref)))
              refs.push(ref);
          }
        }
        return immutableJson({
          schema_version: "synthetic-dispute-worker-input.v1",
          case_id: subject.case_id,
          record_key: subject.record_key,
          records,
          evidence: refs,
        });
      }),
  });
}
/** Complete privileged audit material. Validation grants no live permission. */
export function validateSyntheticDisputeExport(value: unknown): Obj {
  assertValidSyntheticDisputeContract("export", value);
  validateDisputeExport(value);
  return immutableJson(o(value));
}
export function replaySyntheticDisputeExport(
  value: unknown,
  caseId: string,
  recordKey: string,
  at: string,
): Obj {
  const state = validateDisputeExport(validateSyntheticDisputeExport(value));
  return immutableJson(readDispute(state, caseId, recordKey, at));
}
