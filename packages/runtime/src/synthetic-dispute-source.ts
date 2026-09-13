import {
  assertValidSyntheticDisputeContract,
  assertUniqueJsonKeys,
  canonicalJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  intakeBytesHash,
  intakeObject as o,
  type IntakeObject as Obj,
} from "./intake.js";
import { unavailableDisputeRead, sourceSubject } from "./dispute-source.js";
/** Trusted host supplies only read(); never a path, URL, credentials or mutation handle. */
export interface SyntheticDisputeSourcePort {
  readonly profileId: string;
  read(): Promise<Uint8Array>;
}
export function rawSyntheticDisputeRead(bytes: Uint8Array): Obj {
  if (bytes.length > 131072) return unavailableDisputeRead();
  const raw = {
    bytes_base64: Buffer.from(bytes).toString("base64"),
    byte_hash: intakeBytesHash(bytes),
  };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assertUniqueJsonKeys(text);
    const source: unknown = JSON.parse(text);
    assertValidSyntheticDisputeContract("source", source);
    return { status: "read", ...raw, source };
  } catch {
    return { status: "malformed", ...raw, source: null };
  }
}
export async function observeSyntheticDisputeSource(
  reader: () => Promise<Uint8Array>,
): Promise<Obj> {
  try {
    return rawSyntheticDisputeRead(await reader());
  } catch {
    return unavailableDisputeRead();
  }
}
export function compareSyntheticDisputeSource(
  profile: Obj,
  subject: Obj,
  read: Obj,
  recheck: Obj,
  at: string,
  phase: "basis" | "result",
  basis: Obj | null,
  decisionHash: string | null,
  decisionAt: string | null = null,
  observedAt = at,
): Obj {
  const expected = sourceSubject(subject),
    observed = read.source,
    reasons: string[] = [];
  let status = "match";
  const fail = (reason: string, uncertain = false): void => {
    reasons.push(reason);
    status =
      uncertain || status === "inconclusive" ? "inconclusive" : "mismatch";
  };
  if (read.status !== "read" || recheck.status !== "read")
    fail("Source unavailable or malformed; absence is not established", true);
  if (canonicalJson(read) !== canonicalJson(recheck))
    fail("Source changed during observation", true);
  if (observed !== null) {
    const source = o(observed),
      config = o(profile.source),
      pod = source.pod === null ? null : o(source.pod),
      terms = source.terms === null ? null : o(source.terms),
      ar = source.ar === null ? null : o(source.ar);
    if (source.profile_id !== config.profile_id)
      fail("Source belongs to another enrolled port", true);
    for (const [name, value, id] of [
      ["proof", pod, config.proof_object_id],
      ["terms", terms, config.terms_object_id],
      ["result", ar, config.object_id],
    ] as const) {
      if (!value) {
        fail(`Authoritative ${name} object absent`);
        continue;
      }
      if (
        value.object_id !== id ||
        canonicalJson(value.subject) !== canonicalJson(expected)
      )
        fail(`${name} is not the exact enrolled subject/source object`, true);
    }
    if (
      pod &&
      (!pod.valid ||
        pod.rescinded ||
        canonicalJson(pod.evidence_refs) !==
          canonicalJson(profile.evidence_refs))
    )
      fail(
        "Retained governed proof is invalid, rescinded or differently bound",
      );
    if (
      terms &&
      (!terms.valid ||
        terms.clause_id !== config.clause_id ||
        terms.clause !== config.governing_term ||
        String(terms.effective_from) > at ||
        at >= String(terms.effective_until))
    )
      fail("Exact enrolled governing term is invalid, changed or expired");
    if (ar) {
      if (!ar.grounds_complete)
        fail("Complete dispute grounds are unknown", true);
      if (String(ar.event_at) > observedAt)
        fail("Source event is in the future", true);
      if (ar.adjustment_minor !== 0 || canonicalJson(ar.credit_ids) !== "[]")
        fail("Result contains a financial adjustment or credit");
      if (phase === "basis") {
        if (
          ar.status !== "open" ||
          canonicalJson(ar.active_grounds) !== canonicalJson([config.ground]) ||
          canonicalJson(ar.disposed_grounds) !== "[]"
        )
          fail("Exact active enrolled ground is required");
      } else if (basis) {
        const prior = o(o(basis.source).ar);
        if (decisionAt === null)
          fail("Trusted decision issuance time is missing", true);
        else if (String(ar.event_at) < decisionAt)
          fail("Result predates the authorized decision");
        if (
          sha256Json(pod) !== sha256Json(o(basis.source).pod) ||
          sha256Json(terms) !== sha256Json(o(basis.source).terms)
        )
          fail("Proof or governing term changed since authority was granted");
        if (ar.status !== "deduction_withdrawn")
          fail("Independent source has no withdrawn deduction");
        else if (ar.prior_hash === null || ar.prior_version === null)
          fail("Result transition lineage is missing", true);
        else if (
          ar.prior_hash !== sha256Json(prior) ||
          ar.prior_version !== prior.version ||
          ar.version !== Number(prior.version) + 1 ||
          ar.decision_reference !== decisionHash ||
          canonicalJson(ar.active_grounds) !== "[]" ||
          canonicalJson(ar.disposed_grounds) !== canonicalJson([config.ground])
        )
          fail(
            "Observed transition differs from the exact authorized no-adjustment disposition",
          );
      } else fail("Exact authorized basis is missing", true);
    }
  }
  return { status, reasons, expected, observed, phase };
}
