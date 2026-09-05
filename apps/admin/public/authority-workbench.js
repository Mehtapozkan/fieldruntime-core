import {
  createReviewClient,
  requestBlocked,
  SEATS,
  PROPOSALS,
  DEMO_UPDATE,
  preparationStep,
  caseReceiptEvidence,
} from "./authority-client.js";
import {
  canExecuteCredit,
  creditMatchesPacket,
  selectedInvocation,
  selectedCheck,
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
  const attempt = selectedInvocation(state);
  if (attempt) {
    const proof = selectedCheck(state, attempt);
    const differentRequest =
      attempt.authority_request_id !== packet.authority_request_id
        ? " This recorded operation belongs to an earlier request; it does not execute this proposal."
        : "";
    return {
      heading: proof
        ? checkLabel(proof)
        : attempt.source
          ? "Simulated credit recorded; independent check needed"
          : "Simulated action recorded; independent check needed",
      next:
        (proof?.comparison.outcome === "verified_simulated_effect"
          ? "The retained check matched the simulated credit effect."
          : proof?.comparison.outcome === "mismatch"
            ? "Inspect the discrepancy before choosing a fresh source check."
            : "Check the simulated source to establish whether the credit exists.") +
        differentRequest,
    };
  }
  if (state.pending || state.needsRefresh)
    return {
      heading: "Refresh required — current eligibility unconfirmed",
      next: state.pending
        ? "Recover the saved command with an exact retry before another decision."
        : "Refresh, inspect what changed, then choose whether to submit a new decision.",
    };
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
      next: "Next: record the proposed credit in the simulated source.",
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

const checkLabel = (proof) =>
  ({
    verified_simulated_effect: "Simulated credit independently checked",
    mismatch: "Last confirmed check: credit mismatch",
    inconclusive: "Check inconclusive",
  })[proof.comparison.outcome];
function checkEvidence(proof, includeMatch = false) {
  const evidence = box(
    "review-check-evidence",
    el("p", `Check recorded ${time(proof.recorded_at)}.`, "review-check-time"),
  );
  if (
    includeMatch ||
    proof.comparison.outcome !== "verified_simulated_effect"
  ) {
    const rows = proof.observation.raw.rows;
    const observed = Array.isArray(rows)
      ? rows
          .map((row) => {
            const source = row?.source_row;
            return source?.payload
              ? `${source.payload.amount_minor / 100} ${source.payload.currency} · ${source.target?.account_ref === "synthetic://accounts/orchid" ? "Orchid" : "different account"} · ${source.origin_attempt_id === proof.command.attempt_id ? "expected attempt" : "different attempt"}`
              : "Unreadable source row";
          })
          .join("; ") || "No credit found"
      : "Unknown — no usable source read";
    evidence.append(
      el(
        "p",
        "Expected: one $15,000 USD credit to Orchid in this Case’s service-remedy slot, attributed to the recorded attempt.",
      ),
      el("p", `Observed: ${observed}.`),
      el(
        "p",
        proof.comparison.reason_codes.map(creditReason).join(" "),
        "review-muted",
      ),
    );
  }
  return evidence;
}
const refreshFailed = (state) =>
  !!state.creditError || !!state.error?.includes("could not be refreshed");
function eligibilityView(state) {
  const unknown =
    state.pending || state.needsRefresh || state.creditNeedsRefresh;
  const reasons = state.packet.current.reason_codes;
  const text = unknown
    ? "Current eligibility unconfirmed."
    : reasons.includes("stale_case")
      ? "Case changed — prior approvals no longer apply."
      : reasons.includes("authority_state_changed")
        ? "Authority changed — fresh review is required."
        : reasons.includes("request_expired")
          ? "Request expired — fresh review is required."
          : state.packet.current.lifecycle !== "open"
            ? `Request ${state.packet.current.lifecycle}; new execution is unavailable.`
            : state.credit?.source
              ? "Another credit is blocked; the source slot is occupied."
              : canExecuteCredit({ ...state, busy: false })
                ? "The last refresh confirmed execution eligibility."
                : "New execution is unavailable; inspect the prerequisites below.";
  const node = box(
    `review-eligibility${refreshFailed(state) ? " review-notice review-notice--error" : ""}`,
    el("b", `${refreshFailed(state) ? "Refresh failed. " : ""}${text}`),
    el(
      "small",
      "Confirmed history is not current permission. Refresh before a new execution; historical source checks remain available.",
    ),
  );
  node.setAttribute("data-current-eligibility", "");
  node.tabIndex = -1;
  if (refreshFailed(state)) {
    node.setAttribute("role", "alert");
    node.append(
      details(
        "Read failure details",
        el("p", state.creditError ?? state.error),
      ),
    );
  }
  return node;
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
  const savedStage = new globalThis.URL(window.location.href).searchParams.get(
    "stage",
  );
  let active = ["packet", "history", "safeguard"].includes(savedStage)
      ? savedStage
      : "packet",
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
    ["history", "History", "Case progress & evidence"],
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
    if (
      state.packet.historical_evaluations.some(
        (entry) => entry.result.authorized,
      )
    ) {
      const disclosure = details("Review or intervene", form);
      disclosure.setAttribute(
        "data-review-intervention",
        state.packet.authority_request_id,
      );
      const previous = stage.querySelector("details[data-review-intervention]");
      disclosure.open =
        previous?.dataset.reviewIntervention ===
          state.packet.authority_request_id && previous.open;
      return disclosure;
    }
    return form;
  }
  function creditView(state) {
    const credit = state.credit;
    const attempt = selectedInvocation(state);
    const retained = state.creditReceipt;
    const latest = selectedCheck(state, attempt);
    const blocked = state.busy || !!state.pending;
    const section = card("Simulated credit");
    section.id = "credit-controls";
    if (state.creditError && !attempt)
      section.append(
        el(
          "p",
          "Credit history could not be refreshed. Refresh before recording a credit.",
          "review-notice review-notice--error",
          { role: "alert" },
        ),
        details("Read failure details", el("p", state.creditError)),
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
    }
    section.append(
      details(
        "Technical action and verification evidence",
        box(
          "",
          el(
            "p",
            "Fresh checks use a new key and the server-selected independent verifier. They do not require current execution permission. Uncertain submissions must recover the original command and key.",
          ),
          el(
            "p",
            "A fresh financial attempt requires the latest independent absence evidence plus current authority. An occupied slot blocks another credit. No financial retry is automatic.",
          ),
          ...(credit ? [el("pre", JSON.stringify(credit, null, 2))] : []),
          ...(attempt
            ? [
                details(
                  "Selected committed attempt",
                  el("pre", JSON.stringify(attempt, null, 2)),
                ),
              ]
            : []),
          ...(retained
            ? [
                details(
                  "Confirmed submission receipt",
                  el("pre", JSON.stringify(retained, null, 2)),
                ),
              ]
            : []),
        ),
      ),
    );
    return section;
  }
  function historyView(state) {
    const packet = state.packet,
      receipt = caseReceiptEvidence(state);
    const identityName = (identity) =>
      identity
        ? ({
            identity_d6_operator: "Demo operator",
            identity_d7_credit_executor: "Credit executor",
            identity_d7_credit_verifier: "Independent verifier",
          }[identity.identity_id] ?? named(identity))
        : "Attribution unavailable";
    const raw = (label, value) =>
      details(label, el("pre", JSON.stringify(value, null, 2)));
    const list = el("ol", undefined, "case-receipt-stages");
    function add(key, heading, summary, body, note) {
      const item = el("li", undefined, "review-card");
      const disclosure = details(heading, body);
      disclosure.dataset.receiptStage = key;
      disclosure
        .querySelector("summary")
        .append(el("span", summary, "receipt-stage-summary"));
      item.append(disclosure);
      if (note) item.append(note);
      list.append(item);
    }
    const creator = receipt.reviews[0];
    add(
      "proposal",
      "Proposed work",
      `${money(packet.material.consequence.amount_minor)} credit to Orchid`,
      box(
        "",
        el(
          "p",
          `Request retained ${time(packet.request.requested_at)} · ${identityName(creator?.identity)} · synthetic.`,
        ),
        materialView(packet),
        raw("Request binding and recorded creator", {
          request: packet.request,
          entry: creator?.entry,
          identity: creator?.identity,
        }),
        raw("Case journal · its own recorded sequence", receipt.caseEntries),
      ),
      box(
        "receipt-uncertainty",
        el("p", packet.material.evidence[0].content.body),
        ...packet.material.conflicts.map((c) =>
          el("p", c.description, "review-warning-copy"),
        ),
        ...packet.material.unknowns.map((unknown) =>
          el("p", unknown, "review-muted"),
        ),
      ),
    );
    const decisions = el("ol", undefined, "review-history");
    for (const item of receipt.decisions) {
      const { entry, evaluation, identity } = item,
        vote = entry.decision;
      const row = el("li");
      row.dataset.receiptDecision = vote.authority_decision_id;
      row.append(
        el("h3", `${identityName(identity)} · ${title(vote.decision)}`),
        el(
          "small",
          `Synthetic ${identity?.identity_kind ?? "identity"} · recorded ${time(entry.recorded_at)}`,
        ),
        el(
          "p",
          vote.decision !== "approve"
            ? "Terminal decision recorded; no approval transfer."
            : item.applies === null
              ? "Current applicability unconfirmed."
              : item.applies
                ? "Counts in the latest reconciled review."
                : "Not effective in the latest review.",
        ),
        ...(vote.reason ? [el("p", vote.reason)] : []),
        raw("Canonical identity, consent and evaluation evidence", {
          identity,
          entry,
          evaluation,
        }),
      );
      if (vote.replacement_authority_request_id)
        row.append(
          button("Open unapproved replacement", "open", state.busy, false, {
            "data-request-id": vote.replacement_authority_request_id,
          }),
        );
      decisions.append(row);
    }
    const decisionSummary = receipt.decisions.length
      ? receipt.decisions
          .map(
            (d) =>
              `${identityName(d.identity)} ${{ approve: "approved", reject: "rejected", modify: "modified", escalate: "escalated" }[d.entry.decision.decision]}`,
          )
          .join(" · ")
      : "No decisions recorded for this request";
    add(
      "decisions",
      "Human review",
      decisionSummary,
      box(
        "",
        decisions,
        el("p", policyExplanation(packet)),
        raw(
          "Bound policy and review requirements",
          packet.current.resolution?.authority_requirements ??
            packet.historical_evaluations[0].inputs.resolution.policies,
        ),
      ),
      el(
        "small",
        receipt.reconciled
          ? packet.current.authorized
            ? "Approvals complete in the latest reconciled review; execution is a separate check."
            : packet.current.eligible
              ? `Awaiting ${packet.current.resolution.authority_requirements
                  .filter((r) => r.status !== "satisfied")
                  .map((r) => reviewerName(r.authority_class))
                  .join(" and ")} review.`
              : `Latest review: ${title(packet.current.lifecycle)}. ${packet.current.reason_codes.map(creditReason).join(" ")}`
          : "Recorded decisions retained; current applicability unconfirmed.",
        "review-muted",
      ),
    );
    const actionRows = el("ol", undefined, "review-history");
    for (const entry of receipt.attempts) {
      const row = el("li");
      row.dataset.receiptAttempt = entry.id;
      row.append(
        el(
          "h3",
          entry.outcome === "denied"
            ? "Simulated action denied"
            : "Simulated action recorded",
        ),
        el(
          "small",
          `Recorded ${time(entry.recorded_at)} · ${identityName(receipt.identities.get(entry.id))} · synthetic service.`,
        ),
        el(
          "p",
          "Explicit execute command; the initiating person is not authenticated or recorded by this receipt.",
        ),
        ...(entry.authority_request_id !== packet.authority_request_id
          ? [
              el(
                "p",
                "Bound to another request; it did not execute the selected proposal.",
              ),
              button("Inspect action's request", "open", state.busy, false, {
                "data-request-id": entry.authority_request_id,
              }),
            ]
          : []),
        el(
          "p",
          entry.outcome === "denied"
            ? entry.envelope.reason_codes.map(creditReason).join(" ")
            : entry.source
              ? "A simulated source row was recorded atomically. Adapter acknowledgment is not verification."
              : "The invocation was recorded without a source row; an independent check is needed.",
        ),
        raw("Exact action, identity and request evidence", entry),
      );
      actionRows.append(row);
    }
    const attempt = receipt.latestAttempt,
      proof = receipt.latestCheck;
    add(
      "action",
      "Simulated action",
      attempt
        ? attempt.outcome === "denied"
          ? "Latest attempt denied"
          : attempt.source
            ? "Simulated credit recorded"
            : "Invocation recorded; effect unconfirmed"
        : "No confirmed action in loaded history",
      actionRows,
      attempt && attempt.authority_request_id !== packet.authority_request_id
        ? el(
            "p",
            "This action belongs to another request; it did not execute the selected proposal.",
            "review-muted",
          )
        : undefined,
    );
    const checkRows = el("ol", undefined, "review-history");
    for (const entry of receipt.checks) {
      const row = el("li");
      row.dataset.receiptCheck = entry.id;
      row.append(
        el(
          "h3",
          `${entry.id === proof?.id ? "Latest matching check" : "Historical check"} · ${title(entry.comparison.outcome)}`,
        ),
        el(
          "small",
          `${identityName(receipt.identities.get(entry.id))} · synthetic service. Observed ${time(entry.observation.observed_at)}; recorded ${time(entry.recorded_at)}.`,
        ),
        checkEvidence(entry, true),
        raw("Observation, verifier and originating attempt", entry),
      );
      checkRows.append(row);
    }
    add(
      "verification",
      "Independent check",
      proof
        ? checkLabel(proof)
        : attempt?.outcome === "denied"
          ? "Latest attempt was denied; earlier checks remain history"
          : "No check confirmed for the latest attempt",
      checkRows,
      proof
        ? checkEvidence(proof, true)
        : el(
            "small",
            "An older attempt's check does not prove a newer attempt.",
            "review-muted",
          ),
    );
    const next = state.pending
      ? "Recover the original command with an exact retry."
      : !receipt.reconciled
        ? "Refresh to reconcile the views. Historical source checks remain available in the controls."
        : attempt &&
            attempt.authority_request_id !== packet.authority_request_id &&
            !requestBlocked(packet)
          ? "Review the selected proposal afresh. Earlier action and check evidence belongs to its original request."
          : attempt
            ? proof?.comparison.outcome === "verified_simulated_effect"
              ? "Review the remaining impact and acceptance gaps; a fresh source check is available."
              : "Inspect the result and request an independent source check from the controls."
            : canExecuteCredit({ ...state, busy: false })
              ? "Record the simulated credit when ready."
              : preparationStep(state.caseRecord)
                ? "Explicitly prepare the original Case, then create a fresh review."
                : requestBlocked(packet)
                  ? "Create a fresh request and obtain fresh consent."
                  : "Review the evidence and record the outstanding human decision.";
    add(
      "remaining",
      "Still unresolved",
      "Customer impact and acceptance remain unproven; the Case is unresolved.",
      box(
        "",
        el(
          "p",
          "The Case remains unresolved. External writes and Case closure remain blocked.",
        ),
        el(
          "p",
          "Labor time, cost, savings and recovered revenue are not measured. The proposed credit amount is not money saved or revenue gained.",
        ),
        raw("Current server evaluations · informational only", {
          review: packet.current,
          operation: state.credit?.current,
        }),
      ),
      box(
        "",
        el("p", next, "review-next-action"),
        button("Open review and action controls", "stage", state.busy, true, {
          "data-open-stage": "packet",
        }),
      ),
    );
    const root = box(
      "case-receipt",
      intro(
        "02 / History",
        "Case progress and evidence",
        "A read-only account of recorded work. Historical evidence never grants current permission.",
      ),
      box(
        "review-refresh",
        button("Refresh receipt", "refresh", state.busy),
        el("small", `Review evaluated ${time(packet.evaluated_at)}`),
      ),
      el(
        "p",
        receipt.reconciled
          ? "Loaded bindings agree; current eligibility is still rechecked on submission."
          : "Incomplete or stale view — current applicability unconfirmed.",
        receipt.reconciled
          ? "review-muted"
          : "review-notice review-notice--error",
        {
          "data-receipt-status": receipt.reconciled
            ? "reconciled"
            : "incomplete",
        },
      ),
      ...(receipt.issues.length
        ? [
            details(
              "Why this view is incomplete",
              box("", ...receipt.issues.map((issue) => el("p", issue))),
            ),
          ]
        : []),
      list,
      el(
        "p",
        "Review revisions and the action/check sequence preserve their own recorded order. Equal timestamps do not establish order across separate journals.",
        "review-muted",
      ),
    );
    root.dataset.caseReceipt = "";
    root.querySelector("h2").id = "review-current-status";
    root.querySelector("h2").tabIndex = -1;
    if (packet.request.predecessor_authority_request_id)
      root.append(
        button("Inspect predecessor history", "open", state.busy, false, {
          "data-request-id": packet.request.predecessor_authority_request_id,
        }),
      );
    const other = receipt.relatedRequests.filter(
      (id) => id !== packet.request.predecessor_authority_request_id,
    );
    if (other.length)
      root.append(
        details(
          "Other referenced request history",
          box(
            "",
            ...other.map((id) =>
              button("Inspect referenced request", "open", state.busy, false, {
                "data-request-id": id,
              }),
            ),
          ),
        ),
      );
    if (
      state.receipt?.historical &&
      (state.receipt.authority_request_id !== packet.authority_request_id ||
        state.receipt.review_revision > packet.review_revision)
    )
      root.append(
        card(
          state.receipt.authority_request_id === packet.authority_request_id
            ? "Confirmed review submission; history refresh incomplete"
            : "Confirmed review submission · another request",
          el(
            "p",
            `Recorded ${time(state.receipt.recorded_at)}. This submission is not counted again or treated as current permission.`,
          ),
          raw("Confirmed submission receipt", state.receipt),
        ),
      );
    return root;
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
    const showNotice = state.error || state.pending || state.busy;
    if (!state.packet) {
      if (state.creditReceipt) {
        const receipt = state.creditReceipt;
        const proof = receipt.comparison ? receipt : null;
        const confirmed = card(
          proof ? checkLabel(proof) : "Confirmed historical receipt",
          ...(proof
            ? [
                el("small", "Confirmed historical receipt"),
                checkEvidence(proof),
              ]
            : [
                el(
                  "p",
                  receipt.outcome === "simulated_action_recorded"
                    ? "Simulated action recorded; independent check needed."
                    : "The simulated credit was denied and retained in history.",
                ),
              ]),
          details(
            "Accepted receipt",
            el("pre", JSON.stringify(receipt, null, 2)),
          ),
        );
        confirmed.setAttribute("data-confirmed-credit", "");
        content.append(
          confirmed,
          el(
            "p",
            "Current eligibility unconfirmed. This historical receipt does not grant permission.",
            "review-muted",
          ),
        );
      }
      if (showNotice) content.append(notice);
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
      const attempt = selectedInvocation(state);
      const proof = selectedCheck(state, attempt);
      if (active !== "history")
        content.append(
          box(
            "review-current",
            el("h2", progress.heading, undefined, {
              id: "review-current-status",
              tabindex: "-1",
              "data-credit-result": proof?.comparison.outcome,
            }),
            ...(proof
              ? [checkEvidence(proof)]
              : attempt
                ? [
                    el(
                      "p",
                      `Action recorded ${time(attempt.recorded_at)}.`,
                      "review-check-time",
                    ),
                  ]
                : []),
            el("p", progress.next, "review-next-action"),
            requirementsView(state),
            box(
              "review-refresh",
              button("Refresh packet", "refresh", state.busy),
              el(
                "small",
                state.needsRefresh || state.pending
                  ? "Previously loaded view"
                  : `Review refreshed ${time(packet.evaluated_at)}`,
              ),
            ),
          ),
        );
      if (proof && active !== "history")
        content
          .querySelector(".review-current")
          .setAttribute("data-confirmed-credit", "");
      if (attempt && active !== "history")
        content.append(eligibilityView(state));
      if (
        showNotice &&
        !(
          active !== "history" &&
          attempt &&
          state.error?.includes("could not be refreshed") &&
          !state.pending &&
          !state.busy
        )
      )
        content.append(notice);
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
      if (active === "history") content.append(historyView(state));
      else if (active === "safeguard") content.append(safeguardView(state));
      else
        content.append(
          box(
            "review-overview",
            summaryView(packet),
            box(
              "review-controls",
              ...(packet.current.authorized ||
              selectedInvocation(state) ||
              preparationStep(state.caseRecord)
                ? [creditView(state), formView(state)]
                : [formView(state), creditView(state)]),
            ),
          ),
          card("Why these reviewers", el("p", policyExplanation(packet))),
          materialView(packet),
        );
      if (active === "safeguard") content.append(creditView(state));
      if (active !== "history") content.append(bindings(packet));
      if (
        active !== "history" &&
        state.receipt?.historical &&
        !state.creditReceipt
      )
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
    if (active !== "history" || !state.packet)
      content.append(
        box(
          "review-execution-lock",
          el(
            "b",
            "Local simulation only · External writes and Case closure blocked",
          ),
          el(
            "p",
            "The Case remains unresolved. A simulated credit does not establish customer impact, acceptance or recovered revenue.",
          ),
        ),
      );
    stage.replaceChildren(content);
    stage.setAttribute("aria-busy", String(state.busy));
    if (state.requestId) {
      const url = new globalThis.URL(window.location.href);
      url.searchParams.set("request", state.requestId);
      url.searchParams.set("stage", active);
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
      active = control.dataset.stage ?? control.dataset.openStage;
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
