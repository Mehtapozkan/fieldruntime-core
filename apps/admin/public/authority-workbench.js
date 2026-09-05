import {
  createReviewClient,
  requestBlocked,
  SEATS,
  PROPOSALS,
  DEMO_UPDATE,
  preparationStep,
} from "./authority-client.js";
import {
  canExecuteCredit,
  creditMatchesPacket,
  latestInvocation,
  latestCheck,
  creditReason,
} from "./credit-client.js";

function el(tag, text, className, attrs = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs))
    if (value !== false && value !== undefined)
      node.setAttribute(key, value === true ? "" : String(value));
  return node;
}
function box(className, ...children) {
  const node = el("div", undefined, className);
  node.append(...children.filter(Boolean));
  return node;
}
function button(label, action, disabled = false, primary = false, attrs = {}) {
  return el(
    "button",
    label,
    `button ${primary ? "button--primary" : "button--secondary"}`,
    {
      type: "button",
      "data-review-action": action,
      "aria-label": label || undefined,
      disabled,
      ...attrs,
    },
  );
}
const money = (minor) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
const time = (instant) =>
  `${new Date(instant).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "medium" })} UTC`;
const title = (value) =>
  String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
function named(identity) {
  const key = identity?.identity_id?.replace("identity_d6_", "");
  return SEATS[key] ?? "Other reviewer";
}
function intro(kicker, heading, description) {
  return box(
    "stage-intro",
    box("", el("span", kicker, "stage-kicker"), el("h2", heading)),
    el("p", description),
  );
}
function card(heading, ...children) {
  const node = el("section", undefined, "review-card");
  node.append(el("h3", heading), ...children);
  return node;
}
function details(label, content) {
  const node = el("details", undefined, "review-details");
  node.append(el("summary", label), content);
  return node;
}
const reviewerName = (value) =>
  ({
    finance_approver: "Finance",
    executive_sponsor: "Executive",
    business_approver: "Business",
  })[value] ?? title(value);
const reviewerOrder = (item) =>
  ({ finance_approver: 0, executive_sponsor: 1, business_approver: 2 })[
    item.authority_class
  ] ?? 3;
const sourceName = (value) =>
  ({
    synthetic_customer_report: "Customer report",
    synthetic_operations_report: "Operations report",
  })[value] ?? title(value);

// Summarize validated server projections. This never decides reviewer eligibility.
export function reviewProgress(state) {
  const { packet } = state;
  if (state.pending || state.needsRefresh)
    return {
      heading: "Refresh required — current eligibility unconfirmed",
      next: state.pending
        ? "Recover the saved command with an exact retry before another decision."
        : "Refresh, inspect what changed, then choose whether to submit a new decision.",
    };
  const attempt =
    latestInvocation(state.credit) ??
    (state.creditReceipt?.outcome === "simulated_action_recorded"
      ? state.creditReceipt
      : null);
  if (attempt) {
    const proof = latestCheck(state.credit);
    const differentRequest =
      attempt.authority_request_id !== packet.authority_request_id
        ? " The recorded $15,000 operation belongs to an earlier request; it does not execute this proposal."
        : "";
    const invalidation = packet.current.reason_codes.includes("stale_case")
      ? " The Case changed; prior approvals no longer apply."
      : packet.current.reason_codes.includes("authority_state_changed")
        ? " Authority changed; fresh review is required before any new execution."
        : packet.current.reason_codes.includes("request_expired")
          ? " The request expired; its earlier approvals no longer apply."
          : "";
    return {
      heading: state.creditNeedsRefresh
        ? "Credit history needs refresh"
        : proof
          ? {
              verified_simulated_effect:
                "Simulated credit independently checked",
              mismatch: "Mismatch — inspect the simulated source",
              inconclusive: "Check inconclusive",
            }[proof.comparison.outcome]
          : attempt.source
            ? "Simulated credit recorded; independent check needed"
            : "Simulated action recorded; effect unconfirmed",
      next: `${state.creditNeedsRefresh ? "The last confirmed history is retained. Refresh to check current state." : proof?.comparison.outcome === "verified_simulated_effect" ? "The retained check matched the credit effect." : "Next: check the simulated source and inspect the independent result."} Customer impact remains unconfirmed and the Case remains unresolved.${differentRequest}${invalidation}${packet.current.lifecycle !== "open" ? ` This request is ${packet.current.lifecycle}; historical verification remains available.` : ""}`,
    };
  }
  const lifecycle = packet.current.lifecycle;
  if (
    state.credit &&
    packet.review_revision === 0 &&
    preparationStep(state.caseRecord)
  )
    return {
      heading: "Prepare the synthetic Case before fresh review",
      next: "Use the explicit preparation steps below, then create a fresh request. Earlier approvals cannot transfer.",
    };
  if (lifecycle !== "open")
    return {
      heading: {
        rejected: "Request rejected",
        superseded: "Request replaced",
        escalated: "Request escalated",
      }[lifecycle],
      next:
        lifecycle === "superseded"
          ? "Inspect the replacement and review it afresh. No approvals transfer."
          : "This request is closed to further decisions. A fresh request needs fresh review.",
    };
  if (packet.current.reason_codes.includes("stale_case"))
    return {
      heading: "Case changed — fresh review needed",
      next: "Prior approvals no longer apply. Inspect the changed evidence and create a fresh request.",
    };
  if (packet.current.reason_codes.includes("authority_state_changed"))
    return {
      heading: "Authority changed — fresh review needed",
      next: "The review requirements may have changed. Create a fresh request and review it again.",
    };
  if (packet.current.reason_codes.includes("request_expired"))
    return {
      heading: "Request expired — fresh review needed",
      next: "Earlier approvals no longer apply. Create a fresh request to review the proposed credit.",
    };
  if (packet.current.authorized)
    return {
      heading: "Approvals complete; credit not recorded",
      next: "Inspect the simulated credit prerequisites below. Approvals alone do not record a credit or resolve the Case.",
    };
  if (!packet.current.eligible)
    return {
      heading: "Review needs attention",
      next: "Authority is unresolved. The server checks whether the selected reviewer may reject, modify or escalate.",
    };
  const requirements = [
    ...packet.current.resolution.authority_requirements,
  ].sort((a, b) => reviewerOrder(a) - reviewerOrder(b));
  const done = requirements
    .filter((item) => item.status === "satisfied")
    .map((item) => reviewerName(item.authority_class));
  const waiting = requirements
    .filter((item) => item.status !== "satisfied")
    .map((item) => reviewerName(item.authority_class));
  return {
    heading: done.length
      ? `${done.join(" and ")} approved — ${waiting.join(" and ")} needed`
      : "Awaiting review",
    next: `Next: ${waiting.join(" and ")} review the proposal and uncertainty.`,
  };
}

function bindings(packet) {
  return details(
    "Technical details · bindings and replay",
    box(
      "review-binding",
      el(
        "b",
        `Case C${packet.case_version} · Review R${packet.review_revision} · Catalog S${packet.authority_state_revision}`,
      ),
      el(
        "small",
        `Request binds C${packet.request.case_version} / S${packet.request.authority_state_revision}. Expires ${time(packet.request.expires_at)}.`,
      ),
      el("code", packet.case_id),
      el("code", packet.material.consequence.account_ref),
      el("code", packet.authority_request_id),
      el("code", packet.request_binding_hash),
      el(
        "small",
        `Policy ${packet.request.policy_reference.policy_id} / ${packet.request.policy_reference.policy_version}`,
      ),
      el("small", `Evaluated ${time(packet.evaluated_at)}.`),
      details(
        "Bound policy content",
        el(
          "pre",
          JSON.stringify(
            packet.historical_evaluations[0].inputs.resolution?.policies ?? [],
            null,
            2,
          ),
        ),
      ),
      el(
        "p",
        "Consent binds this request and prior review history. These records do not prove that a person inspected a screen.",
      ),
    ),
  );
}
function materialView(packet) {
  const material = packet.material;
  const evidence = material.evidence.map(
    ({ work_event: event, content }, index) => {
      const source = card(
        sourceName(content.source),
        el("p", content.body),
        el(
          "small",
          `Observed ${time(content.observed_at)} · ${content.source_timezone}`,
        ),
        details(
          "Citation and provenance",
          box(
            "",
            el("code", event.payload_ref),
            el("code", event.content_hash),
            el(
              "small",
              `Source event ${event.source_event_id} · ${event.source}`,
            ),
          ),
        ),
      );
      source.id = `review-source-${index}`;
      source.tabIndex = -1;
      return source;
    },
  );
  return box(
    "review-material",
    el("h3", "Linked evidence"),
    box("review-grid", ...evidence),
    details(
      "Retained recommendation and evidence basis",
      box(
        "",
        el("p", material.recommendation),
        el("p", material.freshness_basis),
      ),
    ),
  );
}
function requirementsView(state) {
  const { packet } = state;
  const requirements = packet.current.resolution?.authority_requirements ?? [];
  const group = el("ul", undefined, "review-requirements", {
    "aria-label": "Required reviewers",
  });
  for (const requirement of [...requirements].sort(
    (a, b) => reviewerOrder(a) - reviewerOrder(b),
  )) {
    const verified =
      !state.pending && !state.needsRefresh && packet.current.eligible;
    const done = verified && requirement.status === "satisfied";
    const status = !verified ? "Check needed" : done ? "Approved" : "Needed";
    group.append(
      el(
        "li",
        `${reviewerName(requirement.authority_class)} · ${status}`,
        done ? "review-requirement--done" : "review-requirement--needed",
      ),
    );
  }
  return group;
}
function policyExplanation(packet) {
  const initial = packet.historical_evaluations[0];
  // The server-selected rule references come from the request's retained initial
  // evaluation. Show its bound policy explanation, never use it as current rights.
  const policies = initial.inputs.resolution?.policies;
  const ref = packet.request.policy_reference;
  const policy =
    Array.isArray(policies) &&
    policies.find(
      (item) =>
        item.policy_id === ref.policy_id &&
        item.policy_version === ref.policy_version,
    );
  const requirements = initial.result.resolution?.authority_requirements;
  if (!policy || !Array.isArray(policy.rules) || !Array.isArray(requirements))
    return "The bound policy's reviewer explanation is unavailable. Inspect the retained policy in technical details.";
  const refs = [...new Set(requirements.map((item) => item.policy_rule_ref))];
  const descriptions = refs.map((ref) => {
    const rule = policy.rules.find(
      (item) => `${policy.source_ref}#${item.rule_id}` === ref,
    );
    const condition = rule?.condition;
    if (
      !condition ||
      condition.currency !== "USD" ||
      !Number.isSafeInteger(condition.minimum_amount_minor) ||
      !Array.isArray(rule.requirements)
    )
      return null;
    const minimum = condition.minimum_amount_minor;
    const range =
      minimum % 100 === 1
        ? `above ${money(minimum - 1)}`
        : `from ${money(minimum)}`;
    const maximum = condition.maximum_amount_minor;
    if (maximum !== undefined && !Number.isSafeInteger(maximum)) return null;
    const names = rule.requirements.map((item) =>
      typeof item.authority_class === "string"
        ? reviewerName(item.authority_class)
        : null,
    );
    if (names.some((item) => !item)) return null;
    const namedFinance = rule.requirements.some(
      (item) =>
        Array.isArray(item.named_approver_identity_ids) &&
        item.named_approver_identity_ids.includes("identity_d6_finance"),
    );
    return `The bound policy requires ${names.join(" and ")} for proposed credits ${range}${maximum === undefined ? "" : ` through ${money(maximum)}`}.${namedFinance ? " Finance is a named reviewer; its delegate cannot fill that seat here." : ""}`;
  });
  return descriptions.length && descriptions.every(Boolean)
    ? descriptions.join(" ")
    : "Review requirements were identified by the bound policy. Inspect the retained policy in technical details.";
}
function summaryView(packet) {
  const material = packet.material;
  const uncertainty = el("ul", undefined, "review-list");
  for (const conflict of material.conflicts) {
    const index = material.evidence.findIndex(
      (item) => item.work_event.payload_ref === conflict.source_ref,
    );
    const item = el("li", conflict.description);
    if (index >= 0)
      item.append(
        document.createTextNode(" "),
        el(
          "a",
          sourceName(material.evidence[index].content.source),
          undefined,
          { href: `#review-source-${index}` },
        ),
      );
    uncertainty.append(item);
  }
  for (const unknown of material.unknowns)
    uncertainty.append(el("li", unknown));
  const requirements =
    packet.historical_evaluations[0].result.resolution
      ?.authority_requirements ?? [];
  return card(
    "The decision",
    el("p", material.evidence[0].content.body, "review-issue"),
    el("h4", "Material uncertainty"),
    uncertainty,
    el(
      "small",
      `${material.evidence.length} linked sources · retained conflicts · ${requirements.length} review requirements`,
      "review-muted",
    ),
  );
}

export function mountAuthorityWorkbench() {
  const $ = (id) => document.querySelector(`#${id}`);
  const stage = $("stage-content"),
    nav = $("stage-navigation");
  $("announcement").classList.add("announcement--sr-only");
  $("workbench-content").classList.add("workbench--review");
  document.querySelector(".workbench").classList.add("workbench-shell--review");
  document.querySelector(".case-meta").hidden = true;
  $("experience-mode")
    .closest(".safety-rail")
    .classList.add("safety-rail--review");
  let active = "packet",
    seat = "finance",
    decision = "approve",
    reason = "",
    replacement = "credit_12000";
  let lastAnnouncement = "",
    client;
  const storage = {
    getItem: (key) =>
      window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    },
    keys: () => Object.keys(window.localStorage),
  };
  const stages = [
    ["packet", "Decision Packet", "Credit, evidence & approvals"],
    ["history", "History", "Decisions, action & checks"],
    ["safeguard", "Changed evidence", "Fresh evidence, fresh review"],
  ];
  function formView(state) {
    const prior = state.packet.history.find(
      (entry) =>
        entry.decision?.decision === "approve" &&
        entry.decision.approver_identity?.identity_id === `identity_d6_${seat}`,
    );
    const disabled =
      state.busy ||
      !!state.pending ||
      state.needsRefresh ||
      requestBlocked(state.packet);
    const form = el("form", undefined, "review-form", {
      "aria-label": "Record synthetic review",
    });
    const seatSelect = el("select", undefined, undefined, {
      id: "review-seat",
      name: "seat",
      disabled,
    });
    for (const [value, label] of Object.entries(SEATS))
      seatSelect.append(
        el("option", `${label} · synthetic seat`, undefined, {
          value,
          selected: value === seat,
        }),
      );
    const decisionSelect = el("select", undefined, undefined, {
      id: "review-decision",
      name: "decision",
      "aria-describedby": "review-decision-help",
      disabled,
    });
    for (const value of ["approve", "reject", "modify", "escalate"])
      decisionSelect.append(
        el("option", title(value), undefined, {
          value,
          selected: value === decision,
        }),
      );
    const label = (name, id, input) =>
      box("review-field", el("label", name, undefined, { for: id }), input);
    form.append(
      el("h3", "Your review"),
      el(
        "p",
        "Synthetic seats are for this local demo, not authentication. The server checks each reviewer.",
        "review-muted",
      ),
      box(
        "review-grid",
        label("Reviewer", "review-seat", seatSelect),
        label("Decision", "review-decision", decisionSelect),
      ),
    );
    if (prior)
      form.append(
        el(
          "p",
          `${SEATS[seat]} approval is already recorded. It is historical; current reviewer progress is shown above. You may still choose reject, modify or escalate while this request permits it.`,
          "review-recorded-approval",
          { role: "status" },
        ),
      );
    if (decision !== "approve") {
      const textarea = el("textarea", reason, undefined, {
        id: "review-reason",
        name: "reason",
        required: true,
        maxlength: 2000,
        rows: 3,
        disabled,
      });
      form.append(label("Reason (required)", "review-reason", textarea));
    }
    if (decision === "modify") {
      const select = el("select", undefined, undefined, {
        id: "review-replacement",
        name: "replacement",
        required: true,
        disabled,
      });
      for (const [value, amount] of Object.entries(PROPOSALS))
        if (value !== state.packet.material.proposal_key)
          select.append(
            el("option", `${amount} credit`, undefined, {
              value,
              selected: value === replacement,
            }),
          );
      form.append(
        label(
          "Replacement proposal · starts without approvals",
          "review-replacement",
          select,
        ),
      );
    }
    const descriptions = {
      approve:
        "Approve this exact proposed credit and retained material. Approval does not execute it.",
      reject:
        "Reject and end this request. Earlier approvals will no longer apply.",
      modify:
        "Replace this proposal with a different credit. The replacement starts without approvals.",
      escalate:
        "End this request for escalation. No authority is granted; a fresh request needs fresh review.",
    };
    form.append(
      el("p", descriptions[decision], "review-muted", {
        id: "review-decision-help",
      }),
      el("button", `Record ${decision}`, "button button--primary", {
        type: "submit",
        "aria-label": `Record ${decision}`,
        disabled: disabled || (decision === "approve" && !!prior),
      }),
    );
    return form;
  }
  function creditView(state) {
    const credit = state.credit;
    const attempt = latestInvocation(credit);
    const retained = state.creditReceipt;
    const latest =
      retained?.comparison &&
      (!latestCheck(credit) || retained.sequence > latestCheck(credit).sequence)
        ? retained
        : latestCheck(credit);
    const blocked = state.busy || !!state.pending;
    const section = card(
      "Simulated credit",
      el(
        "p",
        "Record the approved Orchid credit, then check the resulting source independently. Customer impact remains unconfirmed; the Case remains unresolved.",
        "review-muted",
      ),
    );
    section.id = "credit-controls";
    if (state.creditError)
      section.append(
        el("p", state.creditError, "review-notice review-notice--error", {
          role: "alert",
        }),
      );
    const step = preparationStep(state.caseRecord);
    if (step)
      section.append(
        box(
          "review-prerequisite",
          el("b", "Prepare before fresh review"),
          el(
            "p",
            "The original demo Case must pass through qualification, enrichment and review readiness. Each explicit step changes the Case and invalidates earlier approvals. Then create a fresh request.",
          ),
          button(
            `Prepare Case: ${title(step)}`,
            "prepare",
            blocked || state.needsRefresh,
            true,
          ),
        ),
      );
    const reasons = credit?.current?.reason_codes ?? [];
    if (reasons.some((r) => /executor|evaluator|verifier/.test(r)))
      section.append(
        el(
          "p",
          "Local enrollment or service eligibility needs attention. Open Local setup below, enroll the fixed synthetic operation, then refresh and review any changed catalog.",
          "review-prerequisite",
        ),
      );
    if (reasons.includes("case_state_ineligible") && !step)
      section.append(
        el(
          "p",
          "This Case is outside the operation’s review-ready state. The Workbench will not silently move a changed Case. Inspect its history and use the documented Case-command API.",
          "review-prerequisite",
        ),
      );
    if (
      !credit ||
      reasons.some((r) => /service|executor|evaluator|verifier/.test(r))
    )
      section.append(
        details(
          "Local setup · enroll the synthetic operation",
          box(
            "",
            el(
              "p",
              "Run this deliberate, idempotent command in the appliance, then refresh. Enrollment changes the catalog; create a fresh request and collect fresh approvals if needed.",
            ),
            el(
              "code",
              "docker compose exec core node dist/packages/cli/src/cli.js d7 enroll --demo",
            ),
          ),
        ),
      );
    if (latest) {
      const labels = {
        verified_simulated_effect: "Simulated credit independently checked",
        mismatch: "Mismatch — simulated source differs",
        inconclusive: "Check inconclusive",
      };
      section.append(
        el("h4", labels[latest.comparison.outcome], undefined, {
          "data-credit-result": latest.comparison.outcome,
        }),
        el(
          "p",
          `Historical check recorded ${time(latest.recorded_at)}. ${latest.comparison.outcome === "verified_simulated_effect" ? "The independent read matched the account, Case, credit slot, $15,000 USD and originating attempt." : latest.comparison.reason_codes.map(creditReason).join(" ")}`,
        ),
      );
      if (latest.comparison.outcome !== "verified_simulated_effect") {
        const rows = latest.observation.raw.rows;
        const observed = Array.isArray(rows)
          ? rows
              .map((row) => {
                const s = row?.source_row;
                return s?.payload
                  ? `${s.payload.amount_minor / 100} ${s.payload.currency} · ${s.target?.account_ref === "synthetic://accounts/orchid" ? "Orchid" : "different account"} · ${s.origin_attempt_id === latest.command.attempt_id ? "expected attempt" : "different attempt"}`
                  : "Unreadable source row";
              })
              .join("; ") || "No credit found"
          : "Unknown — no usable source read";
        section.append(
          el(
            "p",
            "Expected: one $15,000 USD credit to Orchid in this Case’s service-remedy slot, attributed to the recorded attempt.",
          ),
          el("p", `Observed: ${observed}.`),
        );
      }
    } else if (attempt || retained?.outcome === "simulated_action_recorded")
      section.append(
        el("h4", "Simulated action recorded; independent check needed"),
        el(
          "p",
          "The adapter acknowledgment is not verification. Check the simulated source to establish whether the credit exists.",
        ),
      );
    else if (state.packet.current.authorized)
      section.append(el("h4", "Approvals complete; credit not recorded"));
    if (retained?.outcome === "denied")
      section.append(
        el(
          "p",
          `The attempted credit was denied and retained in history. ${retained.envelope.reason_codes.map(creditReason).join(" ")}`,
          "review-notice review-notice--error",
        ),
      );
    if (attempt || retained?.outcome === "simulated_action_recorded")
      section.append(
        button(
          latest ? "Check simulated source again" : "Check simulated source",
          "verify-credit",
          blocked,
          !latest || latest.comparison.outcome !== "verified_simulated_effect",
        ),
        el(
          "small",
          "A fresh check uses a new key and the server-selected independent verifier. It does not need current execution permission.",
          "review-muted",
        ),
      );
    if (!credit?.source) {
      const fresh = !!attempt;
      section.append(
        button(
          fresh ? "Record fresh simulated attempt" : "Record simulated credit",
          "execute-credit",
          !canExecuteCredit(state),
          !attempt,
        ),
      );
      if (fresh)
        section.append(
          el(
            "small",
            "A fresh financial attempt is explicit and requires the latest independent absence evidence plus current approvals. An occupied slot always blocks another credit.",
            "review-muted",
          ),
        );
      if (credit?.current && !creditMatchesPacket(credit, state.packet))
        section.append(
          el(
            "p",
            "The operation references a different request or review revision. Refresh and inspect the matching request before recording a credit.",
          ),
          button(
            "Open operation’s current review",
            "open-credit-review",
            blocked,
          ),
        );
      if (reasons.length)
        section.append(
          details(
            "Execution prerequisites",
            box("", ...reasons.map((r) => el("p", creditReason(r)))),
          ),
        );
    } else
      section.append(
        el(
          "p",
          "The credit slot is occupied. Another credit is blocked.",
          "review-muted",
        ),
      );
    if (credit)
      section.append(
        details(
          "Technical action and verification evidence",
          el("pre", JSON.stringify(credit, null, 2)),
        ),
      );
    if (retained)
      section.append(
        details(
          "Confirmed submission receipt · historical evidence",
          el("pre", JSON.stringify(retained, null, 2)),
        ),
      );
    return section;
  }
  function historyView(packet, credit) {
    const history = el("ol", undefined, "review-history");
    for (const [index, entry] of packet.history.entries()) {
      const evaluation = packet.historical_evaluations[index],
        vote = entry.decision;
      const item = el("li");
      item.append(
        box(
          "review-history-heading",

          el(
            "h3",
            vote
              ? `${named(vote.approver_identity)} · ${title(vote.decision)}`
              : "Request created",
          ),
        ),
        el("small", time(entry.recorded_at)),
        vote?.reason
          ? el("p", vote.reason)
          : el(
              "p",
              vote
                ? "Consent recorded for the exact request binding."
                : "Immutable credit and cited material retained.",
            ),
        el(
          "p",
          `Historical evaluation: ${evaluation.result.authorized ? "approvals complete then" : title(evaluation.result.lifecycle)}. This is not current permission.`,
          "review-muted",
        ),
        details(
          "Recorded binding and replay evidence",
          box(
            "",
            el("small", `Review R${entry.review_revision}`),
            el("code", entry.request_binding_hash),
            el("code", entry.event_hash),
            el(
              "p",
              `Bound prior R${vote?.expected_review_revision ?? 0} · C${vote?.case_version ?? packet.request.case_version}`,
            ),
            el(
              "small",
              `Resolver ${evaluation.implementation_versions.resolver} · evaluated ${time(evaluation.recorded_at)}`,
            ),
            el("pre", JSON.stringify(evaluation.inputs, null, 2)),
          ),
        ),
      );
      if (vote?.replacement_authority_request_id)
        item.append(
          button("Open unapproved replacement", "open", false, false, {
            "data-request-id": vote.replacement_authority_request_id,
          }),
        );
      history.append(item);
    }
    const operationHistory = el("ol", undefined, "review-history");
    for (const entry of [
      ...(credit?.attempts ?? []),
      ...(credit?.verifications ?? []),
    ].sort((a, b) => a.sequence - b.sequence)) {
      const label = entry.comparison
        ? {
            verified_simulated_effect: "Independent check matched",
            mismatch: "Independent check found a mismatch",
            inconclusive: "Independent check was inconclusive",
          }[entry.comparison.outcome]
        : entry.outcome === "denied"
          ? "Simulated action denied"
          : "Simulated action recorded; verification separate";
      const item = el("li");
      item.append(
        el("h4", label),
        el("small", time(entry.recorded_at)),
        details(
          "Historical entry and exact bindings",
          el("pre", JSON.stringify(entry, null, 2)),
        ),
      );
      operationHistory.append(item);
    }
    return box(
      "",
      intro(
        "02 / Immutable history",
        "What was decided, and on what basis",
        "These records are historical evidence. Only a fresh packet describes current eligibility.",
      ),
      history,
      details("Consent material for this request", materialView(packet)),
      ...(operationHistory.childElementCount
        ? [
            card(
              "Case action and check history · historical evidence",
              el(
                "p",
                "This Case’s operation history can reference an earlier request. It does not grant current permission.",
              ),
              operationHistory,
            ),
          ]
        : []),
    );
  }
  function safeguardView(state) {
    const added = state.caseRecord?.document.events.some(
      (event) => event.id === DEMO_UPDATE.id,
    );
    return box(
      "",
      intro(
        "03 / Exact-version safeguard",
        "New evidence means a new review",
        "Appending retained evidence advances the Case version. The old request and its approvals remain inspectable but stop being effective.",
      ),
      card(
        "Retained synthetic operations update",
        el(
          "p",
          "New operational evidence changes the estimated interruption duration.",
        ),
        el(
          "p",
          "Operational duration differs from the original customer report.",
          "review-warning-copy",
        ),
        details(
          "Citation and provenance",
          box(
            "",
            el("code", DEMO_UPDATE.payload_ref),
            el("code", DEMO_UPDATE.content_hash),
          ),
        ),
        button(
          added
            ? "Retained evidence already attached"
            : "Attach evidence · invalidate prior approvals",
          "evidence",
          added || state.busy || !!state.pending || state.needsRefresh,
          true,
        ),
      ),
      el(
        "p",
        "After attaching, the current packet is checked automatically. Inspect the change, then explicitly create a fresh request and collect fresh approvals.",
      ),
    );
  }
  function render(state) {
    $("loading-state").hidden = true;
    $("error-state").hidden = true;
    $("workbench-content").hidden = false;
    $("case-eyebrow").textContent = "Proposed customer credit";
    const account =
      !state.packet ||
      state.packet.material.consequence.account_ref ===
        "synthetic://accounts/orchid"
        ? "Orchid"
        : "Customer";
    $("case-heading").textContent =
      `${account} / ${state.packet ? money(state.packet.material.consequence.amount_minor) : "$15,000"} proposed credit`;
    $("case-owner").textContent = "Synthetic operator";
    $("case-due").textContent = state.packet
      ? time(state.packet.request.expires_at)
      : "Request not initialized";
    $("case-mode").textContent = "Persistent review · simulated credit";
    $("case-due-label").textContent = "REQUEST EXPIRY";
    $("experience-mode").textContent = "Persistent review";
    $("state-pill").parentElement.setAttribute("aria-label", "Request status");
    $("severity-pill").textContent = "Synthetic";
    $("severity-pill").hidden = true;
    $("state-pill").hidden = true;
    $("interaction-counter").textContent =
      "Persistent review · simulated credit";
    const navigation = box("stage-list");
    for (const [id, name, description] of stages) {
      const control = button("", "stage", !state.packet || state.busy, false, {
        "data-stage": id,
        ...(active === id ? { "aria-current": "step" } : {}),
      });
      control.className = "stage-button";
      control.append(
        el(
          "span",
          String(stages.findIndex(([key]) => key === id) + 1).padStart(2, "0"),
          "stage-button__index",
        ),
        box("stage-button__copy", el("b", name), el("small", description)),
      );
      navigation.append(control);
    }
    const legacyLink = el(
      "a",
      "Legacy action simulation ↗",
      "review-legacy-link",
      {
        href: "/?view=legacy",
      },
    );
    nav.replaceChildren(navigation, legacyLink);
    const content = box("runtime-review");
    const notice = box(
      `review-notice${state.error ? " review-notice--error" : ""}`,
      el(
        "p",
        state.busy
          ? "Checking the local runtime…"
          : (state.error ?? state.message),
      ),
    );
    notice.tabIndex = -1;
    if (state.error) notice.setAttribute("role", "alert");
    if (state.pending) {
      const command = JSON.parse(state.pending.body);
      notice.append(
        el(
          "small",
          `Unconfirmed ${command.decision ?? command.type} · ${state.pending.seat ?? "synthetic operator"}`,
        ),
        details(
          "Original command retained for exact retry",
          el("pre", state.pending.body),
        ),
        button("Retry exact command", "retry", state.busy, true),
      );
    }
    if (state.error || state.pending || state.busy) content.append(notice);
    if (!state.packet) {
      content.append(
        intro(
          "01 / Governed review",
          "Review a proposed credit, with uncertainty intact",
          "Start the Orchid review to load retained evidence and the policy-selected reviewers. Then choose whether to approve, reject, modify or escalate.",
        ),
        el(
          "p",
          "This demo reviews a proposed service credit after an interruption. The retained customer report does not independently establish impact or justify the proposed amount.",
        ),
        button(
          "Start or reopen $15,000 review",
          "initialize",
          state.busy || !!state.pending,
          true,
        ),
        el(
          "p",
          "Initialization is explicit and idempotent. Opening or refreshing the page creates nothing.",
          "review-muted",
        ),
        ...(state.requestId
          ? [button("Refresh packet", "refresh", state.busy)]
          : []),
      );
    } else {
      const packet = state.packet;
      const progress = reviewProgress(state);
      content.append(
        box(
          "review-current",
          el("h2", progress.heading, undefined, {
            id: "review-current-status",
            tabindex: "-1",
          }),
          el("p", progress.next, "review-next-action"),
          requirementsView(state),
          box(
            "review-refresh",
            button("Refresh packet", "refresh", state.busy),
            el(
              "small",
              state.needsRefresh || state.pending
                ? "Previously loaded view"
                : `Checked ${time(packet.evaluated_at)}`,
            ),
          ),
        ),
      );
      if (!state.needsRefresh && requestBlocked(packet)) {
        content.append(
          box(
            "review-notice review-notice--error",

            button(
              `Create fresh ${money(packet.material.consequence.amount_minor)} request`,
              "fresh",
              state.busy || !!state.pending,
              true,
            ),
            el("small", "A fresh request starts without approvals."),
          ),
        );
      }
      if (
        packet.request.predecessor_authority_request_id &&
        active === "history"
      )
        content.append(
          button("Inspect predecessor history", "open", state.busy, false, {
            "data-request-id": packet.request.predecessor_authority_request_id,
          }),
        );
      if (active === "history")
        content.append(historyView(packet, state.credit));
      else if (active === "safeguard") content.append(safeguardView(state));
      else
        content.append(
          box(
            "review-overview",
            summaryView(packet),
            box(
              "review-controls",
              ...(packet.current.authorized ||
              latestInvocation(state.credit) ||
              preparationStep(state.caseRecord)
                ? [creditView(state), formView(state)]
                : [formView(state), creditView(state)]),
            ),
          ),
          card("Why these reviewers", el("p", policyExplanation(packet))),
          materialView(packet),
        );
      if (active !== "packet") content.append(creditView(state));
      content.append(bindings(packet));
      if (state.receipt?.historical)
        content.append(
          card(
            "Last response · historical receipt",
            el(
              "p",
              `${state.receipt.review_revision === 0 ? "Request created" : "Decision recorded"} at ${time(state.receipt.recorded_at)}. This confirms the submission, not current eligibility.`,
            ),
            details(
              "Receipt identifiers",
              box(
                "",
                el("code", state.receipt.journal_entry_id),
                el("code", state.receipt.authority_request_id),
                el("small", `Review R${state.receipt.review_revision}`),
              ),
            ),
            state.receipt.replacement_authority_request_id
              ? button(
                  "Open unapproved replacement",
                  "open",
                  state.busy,
                  false,
                  {
                    "data-request-id":
                      state.receipt.replacement_authority_request_id,
                  },
                )
              : state.needsRefresh
                ? button(
                    "Refresh before next decision",
                    "refresh",
                    state.busy || !!state.pending,
                  )
                : el("small", "Current eligibility is shown above."),
          ),
        );
    }
    content.append(
      box(
        "review-execution-lock",
        el("b", "Local simulation only · Case closure blocked"),
        el(
          "p",
          "A checked simulated credit does not establish customer impact, recovered revenue, acceptance or a resolved Case. No external action is available.",
        ),
      ),
    );
    stage.replaceChildren(content);
    stage.setAttribute("aria-busy", String(state.busy));
    if (state.requestId) {
      const url = new globalThis.URL(window.location.href);
      url.searchParams.set("request", state.requestId);
      window.history.replaceState(null, "", url);
    }
    const announcement =
      state.error ??
      (state.packet && !state.busy
        ? `${reviewProgress(state).heading}. ${reviewProgress(state).next}`
        : state.message);
    if (announcement !== lastAnnouncement) {
      $("announcement").textContent = announcement;
      lastAnnouncement = announcement;
    }
  }
  client = createReviewClient({
    storage,
    onChange: render,
    creditEnabled: true,
  });
  const click = async (event) => {
    const control = event.target.closest("button[data-review-action]");
    if (!control || control.disabled) return;
    const action = control.dataset.reviewAction;
    if (action === "stage") {
      active = control.dataset.stage;
      render(client.state);
      stage.focus();
      return;
    }
    if (action === "initialize") await client.initialize();
    if (action === "refresh") await client.refresh();
    if (action === "retry") await client.retry();
    if (action === "evidence") await client.attachEvidence();
    if (action === "prepare") await client.prepareCase();
    if (action === "execute-credit") await client.executeCredit();
    if (action === "verify-credit") await client.verifyCredit();
    if (action === "open-credit-review") {
      active = "packet";
      await client.refresh(
        client.state.credit.current.bindings.authority_request_id,
      );
    }
    if (action === "fresh") {
      active = "packet";
      decision = "approve";
      reason = "";
      await client.freshRequest();
    }
    if (action === "open") {
      active = control.textContent.includes("replacement")
        ? "packet"
        : "history";
      decision = "approve";
      reason = "";
      await client.refresh(control.dataset.requestId);
    }
    (
      stage.querySelector(
        client.state.error || client.state.pending
          ? ".review-notice"
          : "#review-current-status",
      ) ?? stage
    ).focus({ preventScroll: true });
  };
  nav.addEventListener("click", (event) => void click(event));
  stage.addEventListener("click", (event) => void click(event));
  stage.addEventListener("input", (event) => {
    if (event.target.name === "reason") reason = event.target.value;
  });
  stage.addEventListener("change", (event) => {
    if (event.target.name === "seat") {
      seat = event.target.value;
      render(client.state);
      stage.querySelector("#review-seat")?.focus();
    }
    if (event.target.name === "decision") {
      decision = event.target.value;
      if (replacement === client.state.packet.material.proposal_key)
        replacement = Object.keys(PROPOSALS).find((key) => key !== replacement);
      render(client.state);
      stage.querySelector("#review-decision")?.focus();
    }
    if (event.target.name === "replacement") replacement = event.target.value;
  });
  stage.addEventListener("submit", (event) => {
    event.preventDefault();
    void client
      .decide(seat, decision, reason, replacement)
      .then(() =>
        (
          stage.querySelector(
            client.state.error || client.state.pending
              ? ".review-notice"
              : "#review-current-status",
          ) ?? stage
        ).focus({ preventScroll: true }),
      );
  });
  render(client.state);
  void client.start(
    new globalThis.URL(window.location.href).searchParams.get("request"),
  );
}
