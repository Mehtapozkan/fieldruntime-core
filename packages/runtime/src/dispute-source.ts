import { readFile } from "node:fs/promises";
import {
  assertValidDisputeResultContract,
  assertUniqueJsonKeys,
  canonicalJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  intakeBytesHash,
  intakeObject as o,
  type IntakeObject as Obj,
} from "./intake.js";
export type DisputeReader = () => Promise<Uint8Array>;
// One compiled path, no caller path, URL, credentials or write handle.
export const fixedDisputeReader: DisputeReader = () =>
  readFile(
    new URL("../fixtures/dispute-result-source.v1.json", import.meta.url),
  );
export function rawDisputeRead(bytes: Uint8Array): Obj {
  const raw = {
    bytes_base64: Buffer.from(bytes).toString("base64"),
    byte_hash: intakeBytesHash(bytes),
  };
  if (bytes.length > 131072) return unavailableDisputeRead();
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const source: unknown = JSON.parse(text);
    assertUniqueJsonKeys(text);
    assertValidDisputeResultContract("source", source);
    return { status: "read", ...raw, source };
  } catch {
    return { status: "malformed", ...raw, source: null };
  }
}
export function unavailableDisputeRead(): Obj {
  return {
    status: "unavailable",
    bytes_base64: "",
    byte_hash: intakeBytesHash(Buffer.alloc(0)),
    source: null,
  };
}
export async function observeDisputeSource(
  reader: DisputeReader,
): Promise<Obj> {
  try {
    return rawDisputeRead(await reader());
  } catch {
    return unavailableDisputeRead();
  }
}
export function sourceSubject(subject: Obj): Obj {
  return Object.fromEntries(
    Object.entries(subject).filter(
      ([k]) => !["tenant_id", "case_id", "record_key"].includes(k),
    ),
  );
}
export function compareDisputeSource(
  subject: Obj,
  read: Obj,
  recheck: Obj,
  at: string,
  phase: "basis" | "result",
  basis: Obj | null,
  decisionHash: string | null,
): Obj {
  const expected = sourceSubject(subject),
    observed = read.source,
    reasons: string[] = [];
  let status = "match";
  const fail = (reason: string, uncertain = false): void => {
    reasons.push(reason);
    status = uncertain
      ? "inconclusive"
      : status === "inconclusive"
        ? status
        : "mismatch";
  };
  if (read.status !== "read" || recheck.status !== "read")
    fail("Source unavailable or malformed; absence is not established", true);
  if (canonicalJson(read) !== canonicalJson(recheck))
    fail("Source changed during observation", true);
  if (observed !== null) {
    const s = o(observed),
      pod = s.pod === null ? null : o(s.pod),
      terms = s.terms === null ? null : o(s.terms),
      ar = s.ar === null ? null : o(s.ar);
    for (const [name, v] of [
      ["POD", pod],
      ["terms", terms],
      ["AR", ar],
    ] as const) {
      if (!v) {
        fail(`Authoritative ${name} object absent`);
        continue;
      }
      const objectId = { POD: "POD-4", terms: "TERMS-N1", AR: "AR-dispute-17" }[
        name
      ];
      if (v.object_id !== objectId)
        fail(`${name} response is not the allowlisted source object`, true);
      const scoped = o(v.subject);
      if (
        scoped.dispute_id !== expected.dispute_id ||
        scoped.entity !== expected.entity
      )
        fail(`${name} read is attributed to another record or entity`, true);
      else if (canonicalJson(scoped) !== canonicalJson(expected))
        fail(
          `${name} subject/allocation does not match the exact disputed portion`,
        );
    }
    if (pod) {
      if (
        pod.issuer !== "Synthetic carrier fixture" ||
        pod.custodian !== "Synthetic delivery registry"
      )
        fail("Original POD custody is not the approved synthetic source", true);
      if (
        !pod.valid ||
        pod.rescinded ||
        !pod.allocation_complete ||
        pod.quantity !== 10 ||
        pod.line_id !== "line-4"
      )
        fail("Original delivery proof is rescinded, incomplete or invalid");
      const bytes = Buffer.from(String(pod.original_bytes_base64), "base64");
      const original = {
        subject: pod.subject,
        recipient: pod.recipient,
        line_id: pod.line_id,
        quantity: pod.quantity,
        delivered_at: pod.event_at,
      };
      if (
        !bytes.length ||
        intakeBytesHash(bytes) !== pod.original_hash ||
        bytes.toString("utf8") !== canonicalJson(original)
      )
        fail(
          "Original POD bytes do not establish the claimed receipt/allocation",
        );
      if (String(pod.event_at) > at)
        fail("Delivery event is in the future", true);
    }
    if (
      terms &&
      terms.clause !==
        "Synthetic test term: uphold only the matched delivered portion with no other active dispute ground; payment obligations remain."
    )
      fail("Governing clause differs from the fixed approved synthetic rule");
    if (
      terms &&
      (!terms.valid ||
        String(terms.effective_from) > String(pod ? pod.event_at : at) ||
        String(terms.effective_from) > at ||
        String(terms.effective_until) <= at)
    )
      fail("Applicable governing terms are unavailable or expired");
    if (ar) {
      if (!ar.grounds_complete)
        fail("Complete dispute grounds are not established", true);
      if (String(ar.event_at) > at) fail("AR event is in the future", true);
      if (ar.adjustment_minor !== 0 || canonicalJson(ar.credit_ids) !== "[]")
        fail("Disposition includes an adjustment or associated credit");
      if (phase === "basis") {
        if (
          ar.status !== "open" ||
          canonicalJson(ar.active_grounds) !== '["non_delivery"]' ||
          canonicalJson(ar.disposed_grounds) !== "[]"
        )
          fail(
            "This path requires only the complete active non-delivery ground",
          );
      } else if (basis) {
        const prior = o(o(basis.source).ar);
        if (
          sha256Json(pod) !== sha256Json(o(basis.source).pod) ||
          sha256Json(terms) !== sha256Json(o(basis.source).terms)
        )
          fail("Governing POD or terms changed since the authorized basis");
        if (ar.status !== "upheld_no_adjustment")
          fail("Authoritative AR state has no upheld no-adjustment result");
        else if (ar.prior_hash === null || ar.prior_version === null)
          fail("Result transition lineage is missing", true);
        else if (
          ar.prior_hash !== sha256Json(prior) ||
          ar.prior_version !== prior.version ||
          ar.version !== Number(prior.version) + 1 ||
          ar.decision_reference !== decisionHash ||
          canonicalJson(ar.active_grounds) !== "[]" ||
          canonicalJson(ar.disposed_grounds) !== '["non_delivery"]'
        )
          fail(
            "Observed AR transition does not match the authorized no-adjustment decision",
          );
      } else fail("Exact authorized basis is missing", true);
    }
  }
  return { status, reasons, expected, observed, phase };
}
