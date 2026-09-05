import {
  createReviewClient,
  requestBlocked,
  explain,
  SEATS,
  PROPOSALS,
  DEMO_UPDATE,
  CASE_ID,
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
    maximumFractionDigits: 0,
  }).format(minor / 100);
const time = (instant) =>
  `${new Date(instant).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "medium" })} UTC`;
const title = (value) =>
  String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
function named(identity) {
  const key = identity?.identity_id?.replace("identity_d6_", "");
  return SEATS[key] ?? identity?.identity_id ?? "Runtime operator";
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
function list(items) {
  const node = el("ul", undefined, "review-list");
  for (const item of items) node.append(el("li", item));
  return node;
}
function details(label, content) {
  const node = el("details", undefined, "review-details");
  node.append(el("summary", label), content);
  return node;
}
function bindings(packet) {
  return box(
    "review-binding",
    el(
      "b",
      `Case C${packet.case_version} · Review R${packet.review_revision} · Catalog S${packet.authority_state_revision}`,
    ),
    el(
      "small",
      `Request binds C${packet.request.case_version} / S${packet.request.authority_state_revision}. Expires ${time(packet.request.expires_at)}.`,
    ),
    details(
      "Exact request binding",
      box(
        "",
        el("code", packet.authority_request_id),
        el("code", packet.request_binding_hash),
        el(
          "small",
          `Policy ${packet.request.policy_reference.policy_id} / ${packet.request.policy_reference.policy_version}`,
        ),
      ),
    ),
  );
}
function materialView(packet) {
  const material = packet.material;
  const evidence = material.evidence.map(({ work_event: event, content }) =>
    card(
      title(content.source),
      el("p", content.body),
      el("p", content.conflict, "review-warning-copy"),
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
    ),
  );
  return box(
    "review-material",
    box(
      "review-proposal",
      el("span", "Exact proposed customer credit", "eyebrow"),
      el("strong", money(material.consequence.amount_minor), "review-amount"),
      el("p", material.consequence.account_ref),
    ),
    box("review-grid", ...evidence),
    box(
      "review-grid",
      card(
        "Conflicts retained for consent",
        list(
          material.conflicts.map(
            (item) => `${item.description} (${item.source_ref})`,
          ),
        ),
      ),
      card("Unknowns", list(material.unknowns)),
    ),
    card(
      "Recommendation · not a fact or an authorization",
      el("p", material.recommendation),
      el("small", material.freshness_basis),
    ),
  );
}
function requirementsView(packet) {
  const requirements = packet.current.resolution?.authority_requirements ?? [];
  const group = box("review-grid");
  for (const requirement of requirements) {
    group.append(
      card(
        title(requirement.authority_class),
        el(
          "span",
          `${requirement.satisfied_approval_ids.length} / ${requirement.required_approval_count} approvals · ${title(requirement.status)}`,
          "micro-pill",
        ),
        el(
          "p",
          `Eligible principals: ${requirement.eligible_approvers.map((item) => named(item.identity)).join(", ")}`,
        ),
        el("small", `Policy rule: ${requirement.policy_rule_ref}`),
      ),
    );
  }
  if (!requirements.length)
    group.append(
      card(
        "Current requirements unavailable",
        el(
          "p",
          "The current result does not expose an approvable route. The server independently checks whether a reviewer can reject, modify or escalate.",
        ),
      ),
    );
  return group;
}

export function mountAuthorityWorkbench() {
  const $ = (id) => document.querySelector(`#${id}`);
  const stage = $("stage-content"),
    nav = $("stage-navigation");
  $("announcement").classList.add("announcement--sr-only");
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
    ["safeguard", "Changed evidence", "See exact-version protection"],
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
      el("h3", "Record a human review · synthetic seats"),
      el(
        "p",
        "The server checks this seat against current authority. Selecting a seat grants no privilege.",
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
    form.append(
      el(
        "p",
        `Consent binds the displayed request and C${state.packet.case_version}/R${state.packet.review_revision}/S${state.packet.authority_state_revision}. It does not prove screen inspection.`,
        "review-muted",
      ),
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
          el("span", `R${entry.review_revision}`, "micro-pill"),
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
        el("code", DEMO_UPDATE.payload_ref),
        el("code", DEMO_UPDATE.content_hash),
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
        "After attaching: refresh the packet, inspect the stale-Case reason, then explicitly create a fresh request and collect both approvals again.",
      ),
    );
  }
  function render(state) {
    $("loading-state").hidden = true;
    $("error-state").hidden = true;
    $("workbench-content").hidden = false;
    $("case-eyebrow").textContent = "Persistent synthetic authority review";
    $("case-heading").textContent = "Orchid / Customer credit review";
    $("case-id").textContent = CASE_ID;
    $("case-owner").textContent = "Synthetic operator";
    $("case-due").textContent = state.packet
      ? time(state.packet.request.expires_at)
      : "Request not initialized";
    $("case-mode").textContent = "Persistent review · execution off";
    $("case-due-label").textContent = "REQUEST EXPIRY";
    $("experience-mode").textContent = "Persistent synthetic review";
    $("state-pill").parentElement.setAttribute("aria-label", "Request status");
    $("severity-pill").textContent = "Synthetic";
    $("state-pill").textContent = state.packet
      ? title(state.packet.current.lifecycle)
      : "Ready to initialize";
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
    navigation.append(
      el("a", "Legacy action simulation ↗", "review-legacy-link", {
        href: "/?view=legacy",
      }),
    );
    nav.replaceChildren(navigation);
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
    content.append(notice);
    if (!state.packet) {
      content.append(
        intro(
          "01 / Governed review",
          "A $15,000 credit. Two accountable decisions.",
          "Create one synthetic Case through the runtime, inspect its immutable Decision Packet, then record Finance and Executive approval.",
        ),
        box(
          "review-proposal",
          el("span", "Orchid · Synthetic customer", "eyebrow"),
          el("strong", "$15,000", "review-amount"),
          el(
            "p",
            "Customer-reported impact is not independently confirmed. No credit can be executed or Case closed from this experience.",
          ),
        ),
        button(
          "Start or reopen $15,000 review",
          "initialize",
          state.busy || !!state.pending,
          true,
        ),
        el(
          "p",
          "Explicit, idempotent initialization. Opening this page does not create a Case or request.",
          "review-muted",
        ),
      );
    } else {
      const packet = state.packet;
      const status =
        state.needsRefresh || state.pending
          ? "Refresh required — current eligibility unconfirmed"
          : packet.current.authorized
            ? "Approvals complete — execution unavailable"
            : requestBlocked(packet)
              ? `Request ${packet.current.lifecycle === "open" ? "ineligible" : packet.current.lifecycle} — no effective approvals`
              : "Review remains open — server checks every decision";
      content.append(
        box(
          "review-current",
          el("h2", status, undefined, { id: "review-current-status" }),
          el(
            "small",
            `Packet evaluated ${time(packet.evaluated_at)}${state.needsRefresh ? " · previously reviewed snapshot" : ""}`,
          ),
          button("Refresh packet", "refresh", state.busy),
          bindings(packet),
        ),
      );
      if (!state.needsRefresh && requestBlocked(packet)) {
        content.append(
          box(
            "review-notice review-notice--error",
            ...packet.current.reason_codes.map((code) =>
              el("p", explain(code)),
            ),
            button(
              `Create fresh ${money(packet.material.consequence.amount_minor)} request`,
              "fresh",
              state.busy || !!state.pending,
              true,
            ),
            el(
              "small",
              "A new binding starts at R0 with no transferred approvals.",
            ),
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
          intro(
            "01 / Decision Packet",
            "Inspect the exact work before consenting",
            "Credit, evidence, conflicts, unknowns and recommendation are reconstructed from the immutable request.",
          ),
          materialView(packet),
          requirementsView(packet),
          formView(state),
        );
      if (state.receipt?.historical)
        content.append(
          card(
            "Last response · historical receipt",
            el(
              "p",
              `Recorded review R${state.receipt.review_revision} at ${time(state.receipt.recorded_at)}. This receipt is not current authorization.`,
            ),
            el("code", state.receipt.journal_entry_id),
            el("small", `Request ${state.receipt.authority_request_id}`),
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
                : el(
                    "small",
                    "The current packet is shown above; this receipt remains historical.",
                  ),
          ),
        );
      content.append(
        box(
          "review-execution-lock",
          el("b", "Execution and Case closure unavailable"),
          el(
            "p",
            "Approvals record synthetic consent only. The Action Gateway and independent closure proof are not implemented.",
          ),
        ),
      );
    }
    stage.replaceChildren(content);
    stage.setAttribute("aria-busy", String(state.busy));
    if (state.requestId) {
      const url = new globalThis.URL(window.location.href);
      url.searchParams.set("request", state.requestId);
      window.history.replaceState(null, "", url);
    }
    const announcement = state.error ?? state.message;
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
    stage.focus({ preventScroll: true });
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
      .then(() => stage.focus({ preventScroll: true }));
  });
  render(client.state);
  void client.start(
    new globalThis.URL(window.location.href).searchParams.get("request"),
  );
}
