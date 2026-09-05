import {
  createReviewClient,
  requestBlocked,
  SEATS,
  PROPOSALS,
  DEMO_UPDATE,
} from "./authority-client.js";

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
  const lifecycle = packet.current.lifecycle;
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
      heading: "Approvals complete — execution unavailable",
      next: "All required decisions are recorded. The proposed credit has not been executed and the Case is not resolved.",
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
      "p",
      `Prepared for review: ${material.evidence.length} linked source${material.evidence.length === 1 ? "" : "s"}, retained conflicts and ${requirements.length} identified review requirement${requirements.length === 1 ? "" : "s"}.`,
      "review-muted",
    ),
    el("h4", "Why these reviewers"),
    el("p", policyExplanation(packet)),
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
    getItem: (key) => window.sessionStorage.getItem(key),
    setItem: (key, value) => window.sessionStorage.setItem(key, value),
  };
  const stages = [
    ["packet", "Decision Packet", "Credit, evidence & approvals"],
    ["history", "Review history", "Recorded decisions & consent"],
    ["safeguard", "Changed evidence", "Fresh evidence, fresh review"],
  ];
  function formView(state) {
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
        disabled,
      }),
    );
    return form;
  }
  function historyView(packet) {
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
    return box(
      "",
      intro(
        "02 / Immutable history",
        "What was decided, and on what basis",
        "These records are historical evidence. Only a fresh packet describes current eligibility.",
      ),
      history,
      details("Consent material for this request", materialView(packet)),
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
    $("case-mode").textContent = "Persistent review · execution off";
    $("case-due-label").textContent = "REQUEST EXPIRY";
    $("experience-mode").textContent = "Persistent review";
    $("state-pill").parentElement.setAttribute("aria-label", "Request status");
    $("severity-pill").textContent = "Synthetic";
    $("severity-pill").hidden = true;
    $("state-pill").hidden = true;
    $("interaction-counter").textContent = "D6 · Persistent review";
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
      if (packet.request.predecessor_authority_request_id)
        content.append(
          button("Inspect predecessor history", "open", state.busy, false, {
            "data-request-id": packet.request.predecessor_authority_request_id,
          }),
        );
      if (active === "history") content.append(historyView(packet));
      else if (active === "safeguard") content.append(safeguardView(state));
      else
        content.append(
          box("review-overview", summaryView(packet), formView(state)),
          materialView(packet),
        );
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
        el("b", "Execution and Case closure unavailable"),
        el("p", "This review issues no credit and does not resolve the Case."),
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
  client = createReviewClient({ storage, onChange: render });
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
    if (event.target.name === "seat") seat = event.target.value;
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
