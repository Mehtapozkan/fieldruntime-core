import {
  assertValidSimulatedCreditContract,
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
  creditEntry,
  creditSource,
  evaluateCredit,
  readCredit,
  CREDIT_TARGET,
} from "./simulated-credit.js";
import type { SqlPool } from "./postgres-store.js";

export interface CreditDependencies {
  readonly now: () => Date;
  readonly nextId: () => string;
}
// Internal test seam, not an API/provider interface. The capability can insert
// only the one server-bound row in the currently held transaction.
export type SimulatedCreditAdapter = (
  insertExactCredit: () => Promise<void>,
) => Promise<"success" | "uncertain">;
const insertAdapter: SimulatedCreditAdapter = async (insert) => {
  await insert();
  return "success";
};
export class PostgresSimulatedCreditStore {
  constructor(
    readonly pool: SqlPool,
    private readonly adapter: SimulatedCreditAdapter = insertAdapter,
  ) {}
  async execute(
    input: unknown,
    dependencies: CreditDependencies,
  ): Promise<ObjectValue> {
    assertValidSimulatedCreditContract("command", input);
    const command = json(input);
    if (
      command.tenant_id !== CREDIT_TARGET.tenant_id ||
      command.case_id !== CREDIT_TARGET.case_id
    )
      throw new AuthorityReviewError(
        "CREDIT_INPUT_INVALID",
        "unsupported simulated operation",
      );
    return authorityTransaction(this.pool, false, async (client) => {
      const before = await loadAuthorityStore(client, true);
      const original = before.credit.entries.find(
        (e) => e.idempotency_key === command.idempotency_key,
      );
      if (original)
        return original.command_fingerprint === sha256Json(command)
          ? json({
              status: "duplicate",
              historical_only: true,
              receipt: original,
            })
          : json({ status: "conflict", code: "idempotency_conflict" });
      const creation = before.authority.entries.find(
        (e) =>
          e.authority_request_id === command.authority_request_id &&
          e.case_id === command.case_id &&
          e.review_revision === 0,
      );
      if (!creation)
        return json({ status: "conflict", code: "request_not_found" });
      const initial = dependencies.now().toISOString();
      const preliminary = evaluateCredit(before, command, initial);
      // Sample after the writer lock and expensive eligibility work, immediately
      // before issuing the transaction-scoped invocation. No async gap follows.
      const at = dependencies.now().toISOString();
      if (at < initial || at < string(preliminary.clock_floor))
        throw new AuthorityReviewError(
          "CLOCK_REGRESSION",
          "simulated action clock regressed",
        );
      const envelope =
        at === initial ? preliminary : evaluateCredit(before, command, at);
      const id = dependencies.nextId();
      let source: ObjectValue | null = null;
      let report: "not_invoked" | "success" | "uncertain" = "not_invoked";
      // Validate ID and prospective entry before granting even this narrow write.
      creditEntry(
        before,
        envelope,
        id,
        envelope.authorized ? "success" : "not_invoked",
        null,
      );
      if (envelope.authorized === true) {
        let used = false,
          closed = false;
        const insertExactCredit = async (): Promise<void> => {
          creditAssert(
            !used && !closed,
            "adapter capability reused or invoked after return",
          );
          used = true;
          source = creditSource(id, at);
          await writeAuthorityRow(
            client,
            "/* fr:credit-insert-source */ INSERT INTO simulated_credit_source (tenant_id, case_id, slot, origin_attempt_id, row_hash, source_row) VALUES ($1,$2,$3,$4,$5,$6)",
            [
              CREDIT_TARGET.tenant_id,
              CREDIT_TARGET.case_id,
              CREDIT_TARGET.slot,
              id,
              source.row_hash,
              source,
            ],
          );
        };
        try {
          report = await this.adapter(insertExactCredit);
        } finally {
          closed = true;
        }
      }
      const entry = creditEntry(before, envelope, id, report, source);
      const names = [...CREDIT_COLUMNS, "entry"];
      await writeAuthorityRow(
        client,
        `/* fr:credit-insert-journal */ INSERT INTO simulated_action_journal (${names.join(", ")}) VALUES (${names.map((_, i) => `$${String(i + 1)}`).join(", ")})`,
        [...CREDIT_COLUMNS.map((key) => entry[key]), entry],
      );
      await writeAuthorityRow(
        client,
        "/* fr:credit-clock */ UPDATE authority_catalog SET last_recorded_at = $2 WHERE tenant_id = $1 AND revision = $3 AND snapshot_hash = $4",
        [
          command.tenant_id,
          at,
          entry.authority_state_revision,
          entry.catalog_hash,
        ],
      );
      await writerRevision(client);
      await loadAuthorityStore(client, true);
      return json({
        status: envelope.authorized ? "applied" : "denied",
        historical_only: true,
        receipt: entry,
      });
    });
  }
  async read(
    tenant: string,
    caseId: string,
    now: () => Date = () => new Date(),
  ): Promise<ObjectValue | undefined> {
    if (tenant !== CREDIT_TARGET.tenant_id || caseId !== CREDIT_TARGET.case_id)
      return undefined;
    return authorityTransaction(this.pool, true, async (client) => {
      const state = await loadAuthorityStore(client, true);
      return readCredit(state, now());
    });
  }
  async assertReady(): Promise<void> {
    await authorityTransaction(this.pool, true, async (client) => {
      await loadAuthorityStore(client, true);
    });
  }
}
