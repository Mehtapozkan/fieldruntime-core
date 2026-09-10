import { immutableJson, canonicalJson } from "../../contracts/src/index.js";
import {
  intakeObject as o,
  requireIntake as ensure,
  INTAKE_TENANT,
  type IntakeObject as Obj,
} from "./intake.js";
import { json } from "./authority-review-types.js";
import { reviewSnapshot } from "./authority-review.js";
import {
  authorityTransaction,
  loadAuthorityStore,
  writeAuthorityRow,
  writerRevision,
  journalColumns,
  persistSnapshot,
} from "./postgres-authority-store.js";
import { loadWorkStore } from "./postgres-preparation-work-store.js";
import {
  loadDisputeEvidence,
  disputeColumns,
} from "./postgres-dispute-evidence.js";
import {
  PostgresStoreError,
  type SqlClient,
  type SqlPool,
} from "./postgres-store.js";
import {
  applyDisputeCommand,
  disputeNeedsSource,
  withDisputeAuthority,
  assertDisputeState,
  disputeBinding,
  disputeContext,
  disputeDuplicate,
  disputeReceipt,
  disputeSubject,
  catalogData,
  normalizeDisputeCommand,
  readDispute,
  exportDispute,
  type DisputeState,
} from "./dispute-result.js";
import { disputeActor, disputeCatalog } from "./dispute-profile.js";
import {
  fixedDisputeReader,
  observeDisputeSource,
  type DisputeReader,
} from "./dispute-source.js";
export async function loadDisputeStore(c: SqlClient): Promise<DisputeState> {
  try {
    const work = await loadWorkStore(c),
      stored = await loadAuthorityStore(c),
      entries = await loadDisputeEvidence(c);
    const state = withDisputeAuthority({
      work,
      authority: stored.authority,
      heads: stored.heads,
      entries,
    });
    assertDisputeState(state);
    return state;
  } catch (error) {
    if (error instanceof PostgresStoreError) throw error;
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "Dispute result failed canonical reconstruction",
      { cause: error },
    );
  }
}
export class PostgresDisputeResultStore {
  constructor(
    readonly pool: SqlPool,
    readonly reader: DisputeReader = fixedDisputeReader,
  ) {}
  async assertReady(): Promise<void> {
    await authorityTransaction(this.pool, true, loadDisputeStore);
  }
  read(caseId: string, key: string, now: () => Date): Promise<Obj> {
    return authorityTransaction(this.pool, true, async (c) =>
      readDispute(await loadDisputeStore(c), caseId, key, now().toISOString()),
    );
  }
  export(caseId: string, key: string, now: () => Date): Promise<Obj> {
    return authorityTransaction(this.pool, true, async (c) => {
      const s = await loadDisputeStore(c);
      readDispute(s, caseId, key, now().toISOString());
      return exportDispute(s);
    });
  }
  async submit(value: unknown, now: () => Date): Promise<Obj> {
    const command = normalizeDisputeCommand(value),
      binding = o(command.binding),
      caseId = String(binding.case_id),
      key = String(binding.record_key),
      op = String(command.operation);
    const needsRead = disputeNeedsSource(command);
    const pre = await authorityTransaction(this.pool, true, async (c) => {
      const s = await loadDisputeStore(c),
        duplicate = disputeDuplicate(s, command);
      if (duplicate) return { duplicate, at: "" };
      ensure(
        canonicalJson(binding) ===
          canonicalJson(disputeBinding(s, caseId, key)),
        "BINDING_CONFLICT",
        "Reviewed Case/catalog/input/result head changed",
      );
      const at = now().toISOString();
      ensure(
        at >= String(disputeContext(s, caseId).clock_floor),
        "CLOCK_REGRESSION",
        "Preflight clock regressed",
      );
      if (needsRead)
        disputeActor(
          catalogData(s),
          "verifier",
          disputeSubject(s, caseId, key),
          at,
        );
      return { at };
    });
    if (pre.duplicate) return pre.duplicate;
    // File bytes are read independently, with no writer transaction or adapter success input.
    const first = needsRead ? await observeDisputeSource(this.reader) : null,
      observedAt = now().toISOString();
    ensure(
      observedAt >= pre.at,
      "CLOCK_REGRESSION",
      "Observation time regressed",
    );
    return authorityTransaction(this.pool, false, async (c) => {
      const s = await loadDisputeStore(c),
        duplicate = disputeDuplicate(s, command);
      if (duplicate) return duplicate;
      const beforeRead = now().toISOString();
      ensure(
        beforeRead >= observedAt,
        "CLOCK_REGRESSION",
        "Writer time regressed",
      );
      if (needsRead)
        disputeActor(
          catalogData(s),
          "verifier",
          disputeSubject(s, caseId, key),
          beforeRead,
        );
      const recheck = needsRead
          ? await observeDisputeSource(this.reader)
          : null,
        at = now().toISOString();
      ensure(at >= beforeRead, "CLOCK_REGRESSION", "Recording clock regressed");
      const observation = needsRead
        ? {
            started_at: pre.at,
            observed_at: observedAt,
            recorded_at: at,
            read: first,
            recheck,
          }
        : null;
      let catalog: ReturnType<typeof reviewSnapshot> | undefined;
      if (op === "enroll") {
        const subject = disputeSubject(s, caseId, key),
          prior = s.heads.find((h) => h.tenant_id === INTAKE_TENANT),
          data = disputeCatalog(subject, prior ? catalogData(s) : undefined);
        catalog = reviewSnapshot(
          "catalog",
          json({
            schema_version: "authority-catalog.v1",
            tenant_id: INTAKE_TENANT,
            revision: (prior?.revision ?? 0) + 1,
            previous_catalog_hash: prior?.snapshot_hash ?? null,
            after_review_position: s.authority.entries.length,
            recorded_at: at,
            data,
          }),
        );
      }
      const generated = applyDisputeCommand(
          s,
          command,
          at,
          observation,
          catalog?.hash ?? null,
        ),
        entry = generated.entry;
      if (catalog) {
        await persistSnapshot(c, catalog);
        const prior = s.heads.find((h) => h.tenant_id === INTAKE_TENANT);
        if (prior)
          await writeAuthorityRow(
            c,
            "/* fr:result-catalog-update */ UPDATE authority_catalog SET revision=$2,snapshot_hash=$3,last_recorded_at=$4 WHERE tenant_id=$1 AND revision=$5",
            [
              INTAKE_TENANT,
              catalog.content.revision,
              catalog.hash,
              at,
              prior.revision,
            ],
          );
        else
          await writeAuthorityRow(
            c,
            "/* fr:result-catalog-insert */ INSERT INTO authority_catalog(tenant_id,revision,snapshot_hash,last_recorded_at) VALUES($1,$2,$3,$4)",
            [INTAKE_TENANT, catalog.content.revision, catalog.hash, at],
          );
      }
      if (generated.authority) {
        const a = generated.authority;
        for (const snap of a.state.snapshots)
          if (!s.authority.snapshots.some((x) => x.hash === snap.hash))
            await persistSnapshot(c, snap);
        for (const e of a.entries) {
          const cols = { ...journalColumns(e, a.state), entry: e },
            names = Object.keys(cols);
          await writeAuthorityRow(
            c,
            `/* fr:result-authority-insert */ INSERT INTO authority_request_journal(${names.join(",")}) VALUES(${names.map((_, i) => `$${String(i + 1)}`).join(",")})`,
            Object.values(cols),
          );
        }
      }
      if (!generated.authority) {
        const cols = disputeColumns(entry),
          names = Object.keys(cols);
        await writeAuthorityRow(
          c,
          `/* fr:result-insert */ INSERT INTO dispute_result_journal(${names.join(",")}) VALUES(${names.map((_, i) => `$${String(i + 1)}`).join(",")})`,
          Object.values(cols),
        );
      }
      await writeAuthorityRow(
        c,
        "/* fr:result-clock */ UPDATE authority_catalog SET last_recorded_at=$2 WHERE tenant_id=$1",
        [INTAKE_TENANT, at],
      );
      await writerRevision(c);
      const persisted = await loadDisputeStore(c);
      ensure(
        persisted.entries.some(
          (e) => canonicalJson(e) === canonicalJson(entry),
        ),
        "RESULT_INTEGRITY",
        "Result evidence did not persist exactly",
      );
      return immutableJson(disputeReceipt(entry));
    });
  }
}
