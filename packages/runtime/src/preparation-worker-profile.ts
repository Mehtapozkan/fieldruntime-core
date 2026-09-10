import profileV4 from "../../contracts/src/preparation-worker-profile.v4.json" with { type: "json" };
import profileV3 from "../../contracts/src/preparation-worker-profile.v3.json" with { type: "json" };
import profileV2 from "../../contracts/src/preparation-worker-profile.v2.json" with { type: "json" };
import profile from "../../contracts/src/preparation-worker-profile.v1.json" with { type: "json" };
import {
  assertValidPreparationWorkContract,
  assertValidPreparationWorkV2Contract,
  assertValidPreparationWorkV3Contract,
  assertValidPreparationWorkV4Contract,
  assertValidIdentityReference,
  canonicalJson,
  immutableJson,
} from "../../contracts/src/index.js";
import {
  INTAKE_TENANT,
  INTAKE_SCOPES,
  intakeObject as o,
  intakeList as l,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
export const WORK_LIMITS = Object.freeze({
  selected_records: 1,
  retained_bundles: 1,
  coverage_rows: 200,
  associated_support_artifacts: 20,
  parsed_utf8_bytes: 2097152,
  questions: 64,
  result_bytes: 262144,
  steps: 4,
  computation_ms: 5000,
});
export const CONTINUATION_LIMITS = Object.freeze({
  ...WORK_LIMITS,
  retained_bundles: 2,
});
export function syntheticComparisonProfile(
  arm: "bounded_investigation" | "generic_assistant" = "bounded_investigation",
): Obj {
  return immutableJson({
    ...profileV4,
    investigation: { ...profileV4.investigation, arm },
  });
}
export function syntheticInvestigationProfile(): Obj {
  return immutableJson(profileV3);
}
export function syntheticContinuationProfile(): Obj {
  return immutableJson(profileV2);
}
export const WORK_MEASURES = [
  "cash_collected",
  "disputes_resolved",
  "credits_issued",
  "work_newly_attended_to",
  "human_attention_released",
] as const;
export function syntheticWorkerProfile(): Obj {
  return immutableJson(profile);
}
export function workIdentity(p: Obj, id: string, kind: string): Obj {
  if (p.schema_version === "synthetic-preparation-worker.v4")
    assertValidPreparationWorkV4Contract("profile", p);
  else if (p.schema_version === "synthetic-preparation-worker.v3")
    assertValidPreparationWorkV3Contract("profile", p);
  else if (p.schema_version === "synthetic-preparation-worker.v2")
    assertValidPreparationWorkV2Contract("profile", p);
  else assertValidPreparationWorkContract("profile", p);
  const found = new Map<string, Obj>();
  for (const value of l(p.identities)) {
    assertValidIdentityReference(value);
    const key = String(value.identity_id),
      old = found.get(key);
    ensure(
      !old || canonicalJson(old) === canonicalJson(value),
      "WORK_ACTOR_REQUIRED",
      "Contradictory canonical identities cannot establish work eligibility",
    );
    found.set(key, value);
  }
  const actor = found.get(id);
  ensure(
    actor &&
      actor.tenant_id === INTAKE_TENANT &&
      actor.identity_kind === kind &&
      actor.status === "active",
    "WORK_ACTOR_REQUIRED",
    "The current canonical synthetic actor is not eligible",
  );
  return actor;
}
export function assertWorkReader(p: Obj): Obj {
  const actor = workIdentity(p, "identity_intake_operator", "human");
  ensure(
    canonicalJson([...(p.read_scope_ids as string[])].sort()) ===
      canonicalJson([...INTAKE_SCOPES].sort()),
    "SCOPE_CONFLICT",
    "Full North and South input read scope is required",
  );
  return actor;
}
export function workActor(
  p: Obj,
  purpose:
    | "prepare_disposition_packet"
    | "review_preparation_task"
    | "review_synthetic_evaluation_candidate",
  at: string,
): Obj {
  assertWorkReader(p);
  const id =
    purpose === "prepare_disposition_packet"
      ? "identity_disposition_worker_demo"
      : purpose === "review_preparation_task"
        ? "identity_intake_operator"
        : "identity_pack_reviewer_demo";
  const actor = workIdentity(
    p,
    id,
    purpose === "prepare_disposition_packet" ? "service" : "human",
  );
  ensure(
    canonicalJson(p.work_scope_ids) === canonicalJson(["scope_entity_north"]),
    "SCOPE_CONFLICT",
    "Work is restricted to the selected synthetic North record",
  );
  const grants = l(p.grants),
    identities = new Map<string, Obj>();
  for (const g of grants) {
    const key = canonicalJson([g.identity_id, g.purpose]);
    const old = identities.get(key);
    ensure(
      !old || canonicalJson(old) === canonicalJson(g),
      "WORK_ACTOR_REQUIRED",
      "Contradictory purpose grants cannot establish eligibility",
    );
    identities.set(key, g);
  }
  const g = identities.get(canonicalJson([id, purpose]));
  ensure(
    g &&
      g.status === "active" &&
      String(g.effective_from) <= at &&
      at < String(g.effective_until),
    "WORK_ACTOR_REQUIRED",
    "The synthetic purpose-specific grant is not currently effective",
  );
  ensure(
    new Date(String(o(g).effective_from)).toISOString() === g.effective_from &&
      new Date(String(g.effective_until)).toISOString() === g.effective_until,
    "WORK_ACTOR_REQUIRED",
    "Use canonical grant effectivity",
  );
  return actor;
}
