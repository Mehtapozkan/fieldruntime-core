// Read-only resource accounting. Count source occurrences, never just unique bytes.
import { canonicalJson } from "../../contracts/src/index.js";
import {
  intakeObject as o,
  intakeList as l,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
import {
  WORK_LIMITS,
  CONTINUATION_LIMITS,
} from "./preparation-worker-profile.js";
import type { PackState } from "./preparation-pack.js";
export function preparationResources(
  s: PackState,
  artifact: Obj,
  profile: Obj,
): { bundles: Obj[]; preflight: Obj } {
  const manifest = o(o(artifact.binding).manifest),
    key = String(manifest.record_key);
  const ids = [
    ...new Set([
      String(manifest.bundle_id),
      ...l(artifact.sources).map((x) => String(x.bundle_id)),
    ]),
  ].sort();
  const bundles = ids.map((id) => {
    const b = s.discovery.intake.bundles.find((b) => b.id === id);
    ensure(b, "WORK_INTEGRITY", "A required retained bundle is unavailable");
    return b;
  });
  const selected = bundles.find((b) => b.id === manifest.bundle_id);
  const record =
    selected && l(selected.records).find((r) => r.record_key === key);
  ensure(record, "WORK_INTEGRITY", "The exact selected record is unavailable");
  const associated = (a: Obj): boolean =>
    a.role === "support" &&
    l(a.associations).some(
      (x) =>
        x.entity === record.entity &&
        ((x.kind === "record" && x.id === record.source_record_id) ||
          l(record.business_objects).some(
            (b) => b.kind === x.kind && b.id === x.id,
          )),
    );
  const allowed = new Set(profile.read_scope_ids as string[]);
  const reasons: string[] = [];
  for (const b of bundles) {
    if (
      [
        ...(b.scope_ids as string[]),
        ...l(b.artifacts).flatMap((a) => a.scope_ids as string[]),
      ].some((scope) => !allowed.has(scope))
    )
      reasons.push(
        `Full read scope is unavailable for retained bundle ${String(b.id)}.`,
      );
  }
  // Bind every source to the complete bundle; no best-two selection or truncation.
  for (const source of l(artifact.sources)) {
    const b = bundles.find((b) => b.id === source.bundle_id);
    ensure(
      b && l(b.artifacts).some((a) => a.byte_hash === source.artifact_hash),
      "WORK_INTEGRITY",
      "A cited artifact is outside the bound retained bundles",
    );
  }
  const deliveries = new Set(
    l(record.business_objects)
      .filter((b) => b.kind === "delivery")
      .map((b) => String(b.id)),
  );
  const ambiguous = l(o(artifact.material).source_claims).some(
    (c) =>
      c.applicable_record_key === key &&
      ["ambiguous_excerpt", "retained_only"].includes(String(c.meaning)),
  );
  const counts = {
    questions: deliveries.size + 1 + (!deliveries.size || ambiguous ? 1 : 0),
    retained_bundles: bundles.length,
    coverage_rows: bundles.reduce(
      (n, b) => n + Number(o(b.coverage).physical_records),
      0,
    ),
    associated_support_artifacts: bundles.reduce(
      (n, b) => n + l(b.artifacts).filter(associated).length,
      0,
    ),
    parsed_utf8_bytes: bundles.reduce(
      (n, b) =>
        n +
        l(b.artifacts)
          .filter((a) => a.interpretation !== "retained_only")
          .reduce((m, a) => m + Number(a.byte_length), 0),
      0,
    ),
  };
  const budget = [
    "preparation-pack.v3",
    "preparation-pack.v4",
    "preparation-pack.v5",
    "preparation-pack.v6",
  ].includes(String(artifact.schema_version))
    ? CONTINUATION_LIMITS
    : WORK_LIMITS;
  const limits = Object.fromEntries(
    Object.keys(counts).map((k) => [k, budget[k as keyof typeof budget]]),
  );
  for (const [k, count] of Object.entries(counts))
    if (count > Number(limits[k]))
      reasons.push(
        `Preparation resource limit: ${k} ${String(count)} exceeds ${String(limits[k])}; no evidence was omitted or truncated.`,
      );
  return {
    bundles,
    preflight: {
      eligible: reasons.length === 0,
      reasons,
      counts,
      limits,
      bundle_ids: ids,
      permission_granted: false,
    },
  };
}
export function requirePreparationResources(preflight: Obj): void {
  ensure(
    preflight.eligible,
    "WORK_INPUT_LIMIT",
    (preflight.reasons as string[]).join(" "),
  );
}
export function exactBundleBindings(bundles: readonly Obj[]): Obj[] {
  return bundles
    .map((b) => ({ bundle_id: b.id, bundle_hash: b.hash }))
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
}
