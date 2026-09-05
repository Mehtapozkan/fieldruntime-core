import {
  assertValidSimulatedCreditV2Contract,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  AuthorityReviewError,
  json,
  string,
  type ObjectValue,
} from "./authority-review-types.js";
import {
  authorityTransaction,
  loadAuthorityStore,
  writeAuthorityRow,
  writerRevision,
} from "./postgres-authority-store.js";
import { CREDIT_COLUMNS } from "./postgres-credit-evidence.js";
import {
  creditAssert,
  creditFloor,
  CREDIT_TARGET,
  type CreditContext,
} from "./simulated-credit.js";
import {
  observationFrontier,
  sourceObservation,
  unavailableObservation,
  verificationAttempt,
  verificationEntry,
  verifierAuthority,
} from "./credit-verification.js";
import type { SqlClient, SqlPool } from "./postgres-store.js";
import type { CreditDependencies } from "./postgres-simulated-credit-store.js";

async function readSource(client: SqlClient): Promise<ObjectValue> {
  const result = await client.query<Record<string, unknown>>(
    "/* fr:verification-read-source */ SELECT tenant_id, case_id, slot, origin_attempt_id, row_hash, source_row FROM simulated_credit_source WHERE tenant_id = $1 AND case_id = $2 AND slot = $3 ORDER BY origin_attempt_id LIMIT 2",
    [CREDIT_TARGET.tenant_id, CREDIT_TARGET.case_id, CREDIT_TARGET.slot],
  );
  try {
    return sourceObservation(result.rows);
  } catch {
    return json({ status: "malformed", rows: null, hash: null });
  }
}
function duplicate(
  state: CreditContext,
  command: ObjectValue,
): ObjectValue | undefined {
  const original = state.credit.entries.find(
    (e) => e.idempotency_key === command.idempotency_key,
  );
  return original
    ? original.command_fingerprint === sha256Json(command)
      ? json({ status: "duplicate", historical_only: true, receipt: original })
      : json({ status: "conflict", code: "idempotency_conflict" })
    : undefined;
}
function check(state: CreditContext, command: ObjectValue, at: string): void {
  creditAssert(state.credit.version === 2, "verification migration missing");
  const attempt = verificationAttempt(state, command),
    head = state.heads.find((h) => h.tenant_id === CREDIT_TARGET.tenant_id);
  creditAssert(attempt && head, "verification attempt binding invalid");
  if (at < creditFloor(state, head))
    throw new AuthorityReviewError(
      "CLOCK_REGRESSION",
      "verification clock regressed",
    );
  verifierAuthority(state, head.snapshot_hash, at, attempt);
}
export class PostgresCreditVerificationStore {
  constructor(
    readonly pool: SqlPool,
    readonly readerPool: SqlPool,
  ) {
    creditAssert(
      pool !== readerPool,
      "verification requires a separate read-only connection pool",
    );
  }
  async verify(
    input: unknown,
    dependencies: CreditDependencies,
  ): Promise<ObjectValue> {
    assertValidSimulatedCreditV2Contract("verify_command", input);
    const command = json(input);
    // History-only hydration validates every canonical journal and retained source
    // record while permitting this negative-proof path to inspect physical source
    // drift. Execution, ordinary GET and readiness retain strict source checks.
    const preflight = await authorityTransaction(
      this.pool,
      true,
      async (client) => {
        const state = await loadAuthorityStore(client, true, true);
        const original = duplicate(state, command);
        if (original) return { result: original };
        if (!verificationAttempt(state, command))
          return {
            result: json({
              status: "conflict",
              code: "attempt_binding_conflict",
            }),
          };
        const at = dependencies.now().toISOString();
        try {
          check(state, command, at);
        } catch (error) {
          if (!(
            error instanceof AuthorityReviewError &&
            error.code === "VERIFIER_INELIGIBLE"
          ))
            throw error;
          return {
            result: json({ status: "denied", code: "verifier_ineligible" }),
          };
        }
        return { state, at };
      },
    );
    if (preflight.result) return preflight.result;
    // Fallback records a failed read, never absence. No source write capability
    // or adapter handle is available on this dedicated read-only path.
    let observation = observationFrontier(
      preflight.state,
      unavailableObservation(),
      preflight.at,
    );
    try {
      observation = await authorityTransaction(
        this.readerPool,
        true,
        async (client) => {
          await client.query("SET LOCAL statement_timeout = '5s'");
          const state = await loadAuthorityStore(client, true, true);
          const readStartedAt = dependencies.now().toISOString();
          if (readStartedAt < preflight.at)
            throw new AuthorityReviewError(
              "CLOCK_REGRESSION",
              "read start clock regressed",
            );
          check(state, command, readStartedAt);
          const raw = await readSource(client);
          const at = dependencies.now().toISOString();
          if (at < readStartedAt)
            throw new AuthorityReviewError(
              "CLOCK_REGRESSION",
              "observation clock regressed",
            );
          check(state, command, at);
          return observationFrontier(state, raw, at);
        },
      );
    } catch (error) {
      if (
        error instanceof AuthorityReviewError &&
        error.code === "VERIFIER_INELIGIBLE"
      )
        return json({ status: "denied", code: "verifier_ineligible" });
      if (error instanceof AuthorityReviewError) throw error;
      // Database/transport errors have no authoritative source observation.
    }
    return authorityTransaction(this.pool, false, async (client) => {
      const before = await loadAuthorityStore(client, true, true);
      const original = duplicate(before, command);
      if (original) return original;
      const recordingStartedAt = dependencies.now().toISOString();
      if (recordingStartedAt < string(observation.observed_at))
        throw new AuthorityReviewError(
          "CLOCK_REGRESSION",
          "recording start clock regressed",
        );
      try {
        check(before, command, recordingStartedAt);
      } catch (error) {
        if (!(
          error instanceof AuthorityReviewError &&
          error.code === "VERIFIER_INELIGIBLE"
        ))
          throw error;
        return json({ status: "denied", code: "verifier_ineligible" });
      }
      // A failed writer-side read is retained as inconclusive after restoring
      // the transaction; failure to restore aborts the entire command.
      await client.query("SAVEPOINT verification_observation");
      let recording: ObjectValue;
      try {
        recording = await readSource(client);
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT verification_observation");
        recording = unavailableObservation();
      }
      await client.query("RELEASE SAVEPOINT verification_observation");
      const at = dependencies.now().toISOString();
      if (at < recordingStartedAt || at < preflight.at)
        throw new AuthorityReviewError(
          "CLOCK_REGRESSION",
          "verification recording clock regressed",
        );
      try {
        check(before, command, at);
      } catch (error) {
        if (!(
          error instanceof AuthorityReviewError &&
          error.code === "VERIFIER_INELIGIBLE"
        ))
          throw error;
        return json({ status: "denied", code: "verifier_ineligible" });
      }
      const head = before.heads.find(
        (h) => h.tenant_id === CREDIT_TARGET.tenant_id,
      );
      creditAssert(head, "verification catalog missing");
      const entry = verificationEntry(
        before,
        command,
        observation,
        recording,
        at,
        creditFloor(before, head),
        dependencies.nextId(),
      );
      const names = [...CREDIT_COLUMNS, "entry"];
      await writeAuthorityRow(
        client,
        `/* fr:verification-insert-journal */ INSERT INTO simulated_action_journal (${names.join(", ")}) VALUES (${names.map((_, i) => `$${String(i + 1)}`).join(", ")})`,
        [...CREDIT_COLUMNS.map((key) => entry[key]), entry],
      );
      await writeAuthorityRow(
        client,
        "/* fr:verification-clock */ UPDATE authority_catalog SET last_recorded_at = $2 WHERE tenant_id = $1 AND revision = $3 AND snapshot_hash = $4",
        [command.tenant_id, at, head.revision, head.snapshot_hash],
      );
      await writerRevision(client);
      await loadAuthorityStore(client, true, true);
      return json({ status: "applied", historical_only: true, receipt: entry });
    });
  }
}
