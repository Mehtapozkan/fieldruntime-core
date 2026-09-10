import {
  disputeHistory,
  disputePath,
  draftDisputeCommand,
} from "./intake-client.js";

// Presentation of validated server evidence. This module neither selects source
// state nor calculates authority. Each button is a deliberate, purpose-specific command.
export function resultPanel({
  state: s,
  client,
  el,
  button: baseButton,
  detail,
  input,
  act,
  draft,
  focus,
}) {
  const button = (label, fn, primary) => {
    const b = baseButton(label, fn, primary);
    b.setAttribute("aria-label", label);
    return b;
  };
  const target = s.discoveryTarget,
    matches =
      s.dispute?.binding.case_id === target.case_id &&
      s.dispute.binding.record_key === target.record_key,
    v = matches ? s.dispute : null,
    current = !!v && !s.disputeNeedsRefresh && !s.needsRefresh,
    confirmed = s.disputeConfirmed?.entry,
    receipt =
      confirmed?.case_id === target.case_id &&
      confirmed?.record_key === target.record_key
        ? confirmed
        : null,
    box = el("section", undefined, "review-card dispute-result");
  box.append(
    el(
      "h2",
      v
        ? "Orchid / DEL-4 — follow the disputed portion"
        : "Selected dispute — result unavailable",
    ),
  );
  const refresh = button(
    "Refresh result evidence",
    act(async () => {
      await client.refreshDispute();
      focus();
    }),
  );
  refresh.disabled = s.busy;
  if (!v) {
    box.append(
      el(
        "p",
        "Same-dispute result unavailable. Only the explicitly committed North / Orchid / dispute-17 / INV-101 / PO-9 / DEL-4 record is supported. Another record or an unconfirmed read cannot inherit its proof or acceptance.",
      ),
      el(
        "p",
        s.disputeError ?? "Read current result evidence before any submission.",
        "review-notice",
      ),
      refresh,
    );
    if (receipt)
      box.append(
        detail("Confirmed original result receipt — historical only", receipt),
      );
    return box;
  }
  const history = [...v.history];
  if (receipt && !history.some((e) => e.hash === receipt.hash))
    history.push(receipt);
  history.sort(
    (a, b) =>
      a.sequence - b.sequence ||
      Number(["request_authority", "review_authority"].includes(a.operation)) -
        Number(
          ["request_authority", "review_authority"].includes(b.operation),
        ) ||
      a.authority_position - b.authority_position,
  );
  const candidate = history.findLast((e) => e.operation === "candidate"),
    h = disputeHistory({ history, candidate_hash: candidate?.hash }),
    last = (op) => h.findLast((e) => e.operation === op),
    checked = last("result_check"),
    basisCheck = last("basis_check"),
    noAction = last("no_action"),
    acceptance = last("accept"),
    retainedAcceptance =
      acceptance ?? history.findLast((e) => e.operation === "accept"),
    rejected = last("reject"),
    reopened = last("reopen"),
    authority = v.candidate_hash === candidate?.hash ? v.authority : null,
    comparison = checked ?? basisCheck,
    blocked = !current || s.busy || !!s.pending;
  box.dataset.state = current ? v.current.status : "unconfirmed";
  const columns = el("div", undefined, "result-focus"),
    summary = el("div"),
    controls = el("div", undefined, "review-form result-controls");
  summary.append(
    el("p", "$15,000.00 disputed portion · INV-101 · North", "review-issue"),
    el(
      "p",
      "Supported proposal: uphold this portion without adjustment. No credit, payment or message is produced.",
    ),
  );
  const workMatches =
      s.work?.case_id === target.case_id &&
      s.work.record_key === target.record_key,
    run = workMatches ? s.work.invocations.at(-1) : null;
  if (run?.result) {
    const prepared = el("details", undefined, "result-prepared");
    prepared.append(
      el("summary", "Actual prepared work & complete unsent follow-up"),
      el("pre", run.result.follow_up.draft),
    );
    for (const id of run.result.follow_up.draft_citation_ids) {
      const source = s.work.sources.find((c) => c.id === id);
      if (source)
        prepared.append(
          el("p", source.name),
          el("blockquote", source.excerpt ?? "Retained only; no extraction"),
          detail("Retained source citation", source),
        );
    }
    prepared.append(detail("Exact preparation and task-review binding", run));
    summary.append(
      el(
        "p",
        `Preparation recorded${run.review ? `; task review: ${run.review.command.decision}` : "; usefulness review pending"}. This is historical preparation, not business consent.`,
      ),
      el(
        "blockquote",
        run.result.follow_up.requests[0]?.text ?? run.result.follow_up.draft,
      ),
      prepared,
    );
  } else
    summary.append(
      el(
        "p",
        "No prepared packet is available in this read. Use the existing descriptive review, publication and explicit preparation controls below; result enrollment does not prepare work.",
      ),
    );
  const title = reopened
    ? "Result reopened — prior acceptance is historical"
    : rejected
      ? "Business result rejected"
      : checked
        ? `Last confirmed check: ${checked.data.comparison.status === "match" ? "synthetic disposition matched" : checked.data.comparison.status === "mismatch" ? "disposition mismatch" : "result inconclusive"}`
        : noAction
          ? "No-financial-action decision recorded"
          : basisCheck
            ? `Original proof check: ${basisCheck.data.comparison.status === "match" ? "matched synthetic basis" : basisCheck.data.comparison.status}`
            : "Original proof and terms still need checking";
  summary.append(el("h3", title, "result-confirmed-title"));
  const next = el(
    "a",
    current
      ? `Next: ${v.current.next_action}`
      : "Next: refresh evidence or recover the original command",
    "result-next-link",
  );
  next.href = "#dispute-result-controls";
  controls.id = "dispute-result-controls";
  controls.tabIndex = -1;
  summary.append(next);

  if (comparison) {
    summary.append(
      el(
        "p",
        `Checked by the independent synthetic verifier at ${new Date(comparison.recorded_at).toLocaleString()}. This receipt records that observation, not permission now.`,
      ),
    );
    const c = comparison.data.comparison,
      observed = c.observed;
    const evidence = el("div", undefined, "result-comparison");
    evidence.append(
      el(
        "p",
        checked
          ? "Expected: the exact DEL-4 portion upheld without adjustment, no linked credit, and the recorded decision's reference."
          : "Expected: original DEL-4 proof, complete allocation and grounds, and applicable governing terms.",
      ),
    );
    if (observed) {
      evidence.append(
        el(
          "p",
          `Observed AR: ${observed.ar?.status ?? "unavailable"}. Payment: ${observed.ar?.payment_status ?? "unknown"}.`,
        ),
        el(
          "p",
          `Delivery proof: ${observed.pod ? `${observed.pod.object_id}, ${observed.pod.valid && !observed.pod.rescinded ? "reported valid" : "invalid or rescinded"}; ${observed.pod.quantity} units, ${observed.pod.line_id}` : "unavailable"}.`,
        ),
        el("p", observed.terms?.clause ?? "Governing terms unavailable."),
      );
    } else
      evidence.append(
        el(
          "p",
          "No usable source observation. This is not evidence of absence.",
        ),
      );
    for (const reason of c.reasons)
      evidence.append(el("p", reason, "review-notice"));
    evidence.append(
      detail(
        "Compared source objects, original proof & exact observation",
        comparison.data,
      ),
    );
    summary.append(evidence);
  } else
    summary.append(
      el(
        "p",
        "The retained status note is not original delivery proof. The worker has not searched external systems. A deliberate basis check can read only the fixed synthetic source; other access, terms and ownership require a person.",
        "review-notice",
      ),
    );
  if (retainedAcceptance) {
    const reviewed = el("div", undefined, "result-acceptance");
    reviewed.append(
      el(
        "p",
        `Robin — synthetic business recipient — recorded acceptance at ${new Date(retainedAcceptance.recorded_at).toLocaleString()}. ${current && v.current.accepted ? "This exact synthetic disposition remains accepted in the refreshed view." : "Historical acceptance only; current acceptance is not established."}`,
      ),
    );
    for (const c of retainedAcceptance.command.commitments)
      reviewed.append(
        el(
          "p",
          `Remaining payment-status follow-up: ${c.description}. Owner: Morgan (synthetic). Due: ${new Date(c.due_at).toLocaleString()}. ${c.status}; completion is unproven.`,
        ),
      );
    reviewed.append(
      detail(
        "Business acceptance, attribution and commitments",
        retainedAcceptance,
      ),
    );
    summary.append(reviewed);
  }
  if (receipt)
    summary.append(
      el(
        "p",
        `Confirmed ${receipt.operation.replaceAll("_", " ")} receipt retained · ${new Date(receipt.recorded_at).toLocaleString()}.`,
        "result-receipt review-muted",
      ),
      detail("Newest confirmed submission", receipt),
    );
  if (!current)
    controls.append(
      el(
        "p",
        "Current eligibility is unconfirmed. Refresh and inspect changes before a new decision; retained receipts do not grant permission.",
        "review-notice",
      ),
    );
  if (s.disputeError) controls.append(el("p", s.disputeError, "review-notice"));
  controls.append(
    el("h3", "Next supported action"),
    el(
      "p",
      current
        ? v.current.next_action
        : "Refresh current evidence or recover the original pending command.",
    ),
    el(
      "p",
      current
        ? `Responsible role: ${v.current.responsible_role}.`
        : "Current responsible role is unconfirmed.",
    ),
  );
  if (current)
    for (const reason of v.current.blockers)
      if (!comparison?.data.comparison.reasons.includes(reason))
        controls.append(el("p", reason, "review-notice"));
  const send = (operation, fields = () => ({})) =>
    act(async () => {
      const c = await draftDisputeCommand(
        v,
        operation,
        fields(),
        `result-${globalThis.crypto.randomUUID()}`,
      );
      await client.writeDispute(c);
      focus();
    });
  const add = (
    where,
    label,
    operation,
    fields,
    disabled = false,
    primary = false,
  ) => {
    const b = button(label, send(operation, fields), primary);
    b.disabled = blocked || disabled;
    where.append(b);
    return b;
  };
  const text = (where, label, key, value = "", type = "text") => {
    const f = input(label, type, draft[key] ?? value);
    if (type === "datetime-local") f.node.step = "0.001";
    f.node.oninput = () => (draft[key] = f.node.value);
    where.append(f.wrap);
    return () => f.node.value.trim();
  };
  const reason = (value) => {
    if (!value) throw new Error("Give a reason for this explicit decision.");
    return value;
  };
  if (!history.some((e) => e.operation === "enroll")) {
    controls.append(
      el(
        "p",
        "Setup: explicitly bind this imported record to the synthetic result roles and fixed source. Enrollment changes the catalog and invalidates older authority requests.",
      ),
    );
    add(
      controls,
      "Enroll this exact synthetic dispute",
      "enroll",
      undefined,
      false,
      true,
    );
  } else if (!candidate)
    add(
      controls,
      "Create result candidate",
      "candidate",
      undefined,
      false,
      true,
    );
  else {
    if (!noAction && !rejected && !reopened) {
      add(
        controls,
        "Check original proof and terms",
        "basis_check",
        undefined,
        false,
        !v.basis,
      );
      if (!authority)
        add(
          controls,
          "Request business authority",
          "request_authority",
          undefined,
          !v.basis,
          !!v.basis,
        );
      if (authority) {
        const review = el("details", undefined, "result-authority");
        review.open =
          !authority.current.authorized &&
          authority.current.lifecycle === "open";
        review.append(
          el(
            "summary",
            authority.current.authorized
              ? "Morgan approval recorded — review or intervene"
              : "Morgan's business authority review",
          ),
          el(
            "p",
            "The bound policy requires the named North AR decision owner, Morgan. One explicit approval; no delegation. A synthetic role is not authentication.",
          ),
          el("p", authority.material.recommendation),
          detail("Exact consequence, policy and immutable consent material", {
            request: authority.request,
            material: authority.material,
          }),
        );
        const r = text(
          review,
          "Business authority review reason",
          "authorityReason",
        );
        for (const [decision, label] of [
          ["approve", "Approve no-adjustment decision"],
          ["reject", "Reject authority request"],
          ["modify", "Replace authority request — fresh review"],
          ["escalate", "Escalate authority request"],
        ])
          add(
            review,
            label,
            "review_authority",
            () => ({ decision, reason: reason(r()) }),
            authority.current.lifecycle !== "open",
            decision === "approve",
          );
        review.append(
          el(
            "p",
            "Replacement stays within the same no-adjustment proposal, creates a fresh unapproved request and transfers no approval.",
          ),
        );
        controls.append(review);
        add(
          controls,
          "Record no-financial-action decision",
          "no_action",
          undefined,
          !authority.current.authorized,
          authority.current.authorized,
        );
      }
    }
    // Historical checks and terminal interventions have their own server checks.
    // Whole-request execution eligibility never disables them.
    if (noAction) {
      if (!last("report") && !rejected && !reopened) {
        const report = el("details", undefined, "result-report");
        report.open = !checked;
        report.append(
          el("summary", "Report an outside-runtime disposition"),
          el(
            "p",
            "Synthetic reporter only. Reporting does not change the source, verify success or send a message.",
          ),
        );
        const r = text(report, "What was reported?", "reportReason"),
          ref = text(report, "Report evidence reference", "reportRef"),
          at = text(
            report,
            "Reported occurrence (UTC)",
            "reportAt",
            v.evaluated_at.slice(0, -1),
            "datetime-local",
          );
        add(report, "Record reported disposition", "report", () => ({
          reason: reason(r()),
          evidence_ref: reason(ref()),
          occurred_at: new Date(at() + "Z").toISOString(),
        }));
        controls.append(report);
      }
      add(
        controls,
        "Check disposition source",
        "result_check",
        undefined,
        false,
        !v.current.verified,
      );
      if (!v.current.verified || !authority?.current.authorized)
        controls.append(
          el(
            "p",
            "Business acceptance unavailable: a fresh exact source match and current authority are required. A report or earlier acceptance cannot fill the gap.",
            "review-notice",
          ),
        );
      else if (!v.current.accepted && !rejected && !reopened) {
        const accept = el("section", undefined, "result-business-review");
        accept.append(
          el("h4", "Robin's separate business acceptance"),
          el(
            "p",
            "Accept only this synthetic disputed portion and exact checked result. Morgan retains the payment-status follow-up; payment and DEL-5 remain unresolved.",
          ),
        );
        const r = text(accept, "Business acceptance reason", "acceptReason"),
          due = text(
            accept,
            "Payment follow-up due (UTC)",
            "due",
            "",
            "datetime-local",
          );
        add(
          accept,
          "Accept this exact business result",
          "accept",
          () => ({
            reason: reason(r()),
            due_at: new Date(due() + "Z").toISOString(),
          }),
          false,
          true,
        );
        controls.append(accept);
      }
    }
    // Retain supported authority interventions after the no-action receipt too.
    if (noAction && authority?.current.lifecycle === "open") {
      const intervention = el("details");
      intervention.append(el("summary", "Morgan: review or intervene"));
      const r = text(
        intervention,
        "Business authority intervention reason",
        "interventionReason",
      );
      for (const decision of ["reject", "modify", "escalate"])
        add(
          intervention,
          `${decision === "modify" ? "Replace" : decision[0].toUpperCase() + decision.slice(1)} authority after recorded decision`,
          "review_authority",
          () => ({ decision, reason: reason(r()) }),
        );
      controls.append(intervention);
    }
    const manage = el("details", undefined, "result-interventions");
    manage.append(
      el("summary", "Business rejection, reopening or a fresh candidate"),
    );
    const r = text(manage, "Business intervention reason", "businessReason");
    if (!acceptance && !rejected && !reopened)
      add(manage, "Reject business result", "reject", () => ({
        reason: reason(r()),
      }));
    if (acceptance && !reopened) {
      add(
        manage,
        "Reopen accepted result",
        "reopen",
        () => ({ reason: reason(r()) }),
        !checked ||
          checked.data.comparison.status !== "mismatch" ||
          checked.sequence <= acceptance.sequence,
      );
      manage.append(
        el(
          "p",
          "Reopening requires a later reliable independent mismatch. An unavailable read leaves status unknown; it is not a reversal.",
        ),
      );
    }
    manage.append(
      el(
        "p",
        "A fresh candidate preserves prior history, requires its own evidence check and approval, and transfers no consent.",
      ),
    );
    add(manage, "Create fresh result candidate", "candidate");
    controls.append(manage);
  }
  controls.append(refresh);
  columns.append(summary, controls);
  box.append(columns);
  box.append(
    el(
      "p",
      "Payment remains unknown. DEL-5 is a separate dispute; customer impact and complete Case closure remain unproven. Source checking here uses synthetic fixtures, not customer systems.",
      "review-muted",
    ),
  );
  const records = el("details", undefined, "result-history");
  records.append(
    el(
      "summary",
      "Result history, independent evidence & five separate measures",
    ),
  );
  for (const e of history)
    records.append(
      detail(
        `${e.operation.replaceAll("_", " ")} · ${new Date(e.recorded_at).toLocaleString()} · synthetic ${e.actor.identity_id.replace("identity_", "").replaceAll("_", " ")}`,
        e,
      ),
    );
  const measures = el("dl");
  for (const [key, value] of Object.entries(v.proof_measures))
    measures.append(
      el("dt", key.replaceAll("_", " ")),
      el(
        "dd",
        current && value !== null
          ? `${value} synthetic disputed record(s) at this read`
          : "Unknown",
      ),
    );
  records.append(
    measures,
    el(
      "p",
      "These measures are separate. No savings, cash or attention release is inferred from a packet or disputed principal. Preparation effort and costs per verified business outcome remain unmeasured.",
    ),
    detail("Current read bindings and authority evidence", v),
  );
  const exportLink = el("a", "Download portable business-result evidence");
  exportLink.href = disputePath(target) + "&representation=export";
  box.append(records, exportLink);
  return box;
}
