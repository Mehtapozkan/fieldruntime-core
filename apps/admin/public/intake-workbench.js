import {
  createIntakeClient,
  packPath,
  workPath,
  intakeHash,
} from "./intake-client.js";
const el = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};
const button = (text, action, primary = false) => {
  const b = el("button", text, `button${primary ? " button--primary" : ""}`);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
};
const detail = (title, value) => {
  const d = el("details", undefined, "review-card intake-details");
  d.append(
    el("summary", title),
    el(
      "pre",
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
    ),
  );
  return d;
};
const input = (label, type = "text", value = "") => {
  const wrap = el("label", label),
    node = el("input");
  node.type = type;
  node.value = value;
  wrap.append(node);
  return { wrap, node };
};
const select = (label, options, value = "") => {
  const wrap = el("label", label),
    node = el("select");
  for (const [id, name] of options) {
    const option = el("option", name);
    option.value = id;
    node.append(option);
  }
  node.value = value;
  wrap.append(node);
  return { wrap, node };
};
const human = (v) =>
  ({
    population_unconfirmed: "Population completeness is unconfirmed",
    active_effort_unmeasured: "Active human effort is not measured",
    relationships_unconfirmed:
      "Object relationships are reported, not independently confirmed",
    source_occurrence_unknown: "Business occurrence time is unknown",
    source_snapshot_unknown: "Export time is unknown",
    population_window_unknown: "Population window is unknown",
    target_reviewed: "Review the target and its existing ownership",
    support_unconfirmed: "Supporting claims remain unconfirmed",
    contradictory_source_revision:
      "The same reported version contains changed material",
  })[v] ?? v.replaceAll("_", " ");
const entity = (v) => (v === "entity_north" ? "North entity" : "South entity");
const money = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(v) / 100,
  );
const uid = () => `intake-${globalThis.crypto.randomUUID()}`;
async function encoded(file) {
  const bytes = new globalThis.Uint8Array(await file.arrayBuffer());
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return window.btoa(text);
}
export function mountIntakeWorkbench() {
  document.querySelector(".shell").classList.add("intake-shell");
  const content = document.querySelector("#workbench-content");
  document.querySelector("#loading-state").hidden = true;
  content.hidden = false;
  content.classList.add("workbench--review");
  document.querySelector(".workbench").classList.add("workbench-shell--review");
  document.querySelector("#experience-mode").textContent =
    "Persistent synthetic intake";
  document.querySelector(".stage-rail__eyebrow").textContent =
    "Assisted intake";
  document.querySelector(".stage-rail__foot").textContent =
    "Explicit review · no external writes";
  const nav = document.querySelector("#stage-navigation");
  nav.replaceChildren();
  for (const [href, text] of [
    ["/?view=intake", "Prepare & review"],
    ["/", "Orchid credit walkthrough"],
  ]) {
    const a = el("a", text, "stage-button");
    a.href = href;
    nav.append(a);
  }
  const heading = el("header", undefined, "case-header");
  heading.append(el("h1", "Invoice disputes / Review received evidence"));
  heading.querySelector("h1").id = "case-heading";
  const stage = el("div", undefined, "runtime-review intake-workbench");
  stage.id = "stage-content";
  stage.tabIndex = -1;
  content.replaceChildren(heading, stage);
  let files = [],
    candidateIndex = null,
    draft = null,
    localError = null;
  const client = createIntakeClient({ changed: render });
  function act(fn) {
    return () => {
      localError = null;
      Promise.resolve()
        .then(fn)
        .catch((e) => {
          localError = e.message;
          render();
        });
    };
  }
  function source(document) {
    const box = el("details", undefined, "intake-source");
    box.append(
      el(
        "summary",
        `${document.name} · ${document.interpretation === "retained_only" ? "retained only — no extraction" : document.interpretation === "text" ? "interpreted as plain text" : "CSV source"}`,
      ),
    );
    if (document.derived_text !== null)
      box.append(el("pre", document.derived_text));
    const a = el("a", "Download original received bytes");
    a.href = `/v1/intake/artifacts/${document.byte_hash.slice(7)}`;
    a.download = "";
    box.append(a, detail("Source binding & locator", document));
    return box;
  }
  function newPreparation(state) {
    const form = el("section", undefined, "review-form");
    form.append(
      el("h2", "Prepare synthetic files"),
      el(
        "p",
        "Receive one CSV queue and associated documents. Preparation retains bytes and findings; it does not create a Case.",
      ),
    );
    const upload = input("Queue CSV", "file"),
      support = input("Supporting documents (optional)", "file");
    upload.node.accept = ".csv";
    support.node.accept = ".txt,.md,.pdf,.png,.jpg,.jpeg";
    support.node.multiple = true;
    upload.node.addEventListener("change", () => {
      files = files.filter((x) => x.role !== "queue");
      if (upload.node.files[0])
        files.unshift({
          file: upload.node.files[0],
          role: "queue",
          id: "queue",
          associations: [],
        });
      render();
    });
    support.node.addEventListener("change", () => {
      files = files.filter((x) => x.role !== "support");
      for (const file of support.node.files)
        files.push({
          file,
          role: "support",
          id: file.name.replace(/\.[^.]+$/, ""),
          associations: [],
        });
      render();
    });
    form.append(upload.wrap, support.wrap);
    const sample = button(
      "Use synthetic sample",
      act(async () => {
        files = [];
        for (const [name, role, type] of [
          ["orchid.csv", "queue", "text/csv"],
          ["note-17.txt", "support", "text/plain"],
        ]) {
          const r = await fetch(`/intake-sample/${name}`);
          if (!r.ok) throw new Error("Synthetic sample unavailable");
          files.push({
            file: new globalThis.File([await r.blob()], name, { type }),
            role,
            id: role === "queue" ? "queue" : "note-17",
            associations:
              role === "queue"
                ? []
                : [
                    {
                      entity: "entity_north",
                      kind: "record",
                      id: "dispute-17",
                    },
                  ],
          });
        }
        render();
      }),
    );
    form.append(sample);
    const metadata = [];
    for (const file of files) {
      const section = el("div", undefined, "intake-file");
      section.append(
        el(
          "strong",
          `${file.file.name} · ${file.file.size} received bytes selected`,
        ),
      );
      const id = input("Stable document ID", "text", file.id);
      id.node.addEventListener("input", () => {
        file.id = id.node.value;
      });
      section.append(id.wrap);
      if (file.role === "support") {
        const associations = el("textarea");
        associations.value = JSON.stringify(file.associations, null, 2);
        associations.rows = 4;
        const advanced = el("details");
        advanced.open = file.associations.length === 0;
        advanced.append(
          el("summary", "Document associations (entity, record or object ID)"),
          el(
            "p",
            'Use explicit claims such as [{"entity":"entity_north","kind":"record","id":"dispute-17"}]. Unassociated documents remain retained but cannot support a row.',
          ),
          associations,
        );
        associations.setAttribute(
          "aria-label",
          `Associations for ${file.file.name}`,
        );
        metadata.push(() => {
          file.associations = JSON.parse(associations.value);
        });
        section.append(advanced);
      }
      form.append(section);
    }
    const claims = el("details", undefined, "intake-claims");
    claims.append(el("summary", "Optional export and population claims"));
    const snapshot = input("Export time with offset"),
      zone = input("Export timezone (UTC or IANA)"),
      population = input("Declared population count", "number"),
      coverage = select(
        "Claimed coverage",
        [
          ["unknown", "Unknown"],
          ["partial", "Partial"],
          ["full", "Full — unconfirmed"],
        ],
        "unknown",
      ),
      start = input("Population window start with offset"),
      end = input("Population window end with offset"),
      windowZone = input("Population window timezone");
    for (const x of [
      snapshot,
      zone,
      population,
      coverage,
      start,
      end,
      windowZone,
    ])
      claims.append(x.wrap);
    form.append(claims);
    const submit = button(
      "Prepare selected synthetic files",
      act(async () => {
        metadata.forEach((read) => read());
        const media = {
          csv: "text/csv",
          txt: "text/plain",
          md: "text/markdown",
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
        };
        const artifacts = [];
        for (const f of files)
          artifacts.push({
            role: f.role,
            document_id: f.id,
            name: f.file.name,
            media_type:
              media[f.file.name.split(".").at(-1).toLowerCase()] ??
              "application/octet-stream",
            bytes_base64: await encoded(f.file),
            declared_hash: null,
            associations: f.associations,
          });
        candidateIndex = null;
        draft = null;
        await client.write("preparations", {
          schema_version: "intake-prepare.v1",
          profile_id: "invoice-dispute-intake.v1",
          idempotency_key: uid(),
          claims: {
            snapshot_at: snapshot.node.value || null,
            snapshot_timezone: zone.node.value || null,
            coverage: coverage.node.value,
            population_count:
              population.node.value === ""
                ? null
                : Number(population.node.value),
            population_window:
              start.node.value || end.node.value || windowZone.node.value
                ? {
                    start: start.node.value,
                    end: end.node.value,
                    timezone: windowZone.node.value,
                  }
                : null,
          },
          artifacts,
        });
      }),
      true,
    );
    submit.disabled =
      state.busy ||
      !!state.pending ||
      state.needsRefresh ||
      !files.some((x) => x.role === "queue");
    form.append(
      el(
        "p",
        "CSV: 1 MiB / 2,000 rows; TXT or Markdown: 512 KiB each. PDF, PNG and JPEG: retain only, up to 5 MiB each. At most 16 supporting documents / 20 MiB total. No Office, email, archive or URL imports.",
        "review-muted",
      ),
      submit,
    );
    return form;
  }
  function review(state) {
    const v = state.view,
      c = v.candidates[candidateIndex];
    if (!c) return null;
    if (!draft)
      draft = {
        target: "",
        reason: "",
        acks: false,
        support: [...c.support_document_ids],
        links: [...c.reviewed_links],
      };
    const box = el("section", undefined, "review-form intake-review");
    box.append(
      el(
        "h2",
        `Review ${c.record.cells.customer_ref} / ${c.record.cells.invoice_id}`,
      ),
      el(
        "p",
        `${money(c.record.cells.amount_minor)} reported dispute · ${entity(c.record.entity)}. This is source material, not an approved credit.`,
      ),
    );
    const gaps = el("ul", undefined, "review-list");
    for (const code of c.required_acknowledgments)
      if (code !== "active_effort_unmeasured")
        gaps.append(el("li", human(code)));
    box.append(gaps);
    const options = [
      ["", "Choose one target explicitly"],
      ...c.targets.map((x, i) => [
        String(i),
        `Attach to ${entity(c.record.entity)} Case · version ${x.case_version} · ${human(x.reason)} · owner ${x.owner_identity_id ?? "Unconfirmed"}`,
      ]),
    ];
    if (!c.commits.length)
      options.push([
        "create",
        "Create one coordination Case · owner Unconfirmed",
      ]);
    const target = select("Proposed Case target", options, draft.target);
    target.node.addEventListener("change", () => {
      draft.target = target.node.value;
      client.invalidate();
      render();
    });
    box.append(target.wrap);
    box.append(
      el(
        "p",
        `Upstream reference: ${c.record.upstream_case_ref?.id ?? "Not supplied"}. Reported owner: ${c.record.reported_owner ?? "Unknown"}; this does not set canonical ownership.`,
      ),
    );
    const support = el("details");
    support.append(
      el("summary", "Review supporting documents and object links"),
    );
    for (const id of c.support_document_ids) {
      const item = input(`Include ${id}`, "checkbox");
      item.node.checked = draft.support.includes(id);
      item.node.addEventListener("change", () => {
        draft.support = item.node.checked
          ? [...draft.support, id]
          : draft.support.filter((x) => x !== id);
        client.invalidate();
      });
      support.append(item.wrap);
    }
    for (const [i, link] of c.reviewed_links.entries()) {
      const item = input(
        `Retain reported link: ${link.from} → ${link.to}`,
        "checkbox",
      );
      item.node.checked = draft.links.some(
        (x) => JSON.stringify(x) === JSON.stringify(link),
      );
      item.node.addEventListener("change", () => {
        draft.links = item.node.checked
          ? [...draft.links, link]
          : draft.links.filter(
              (x) => JSON.stringify(x) !== JSON.stringify(link),
            );
        client.invalidate();
      });
      item.node.id = `intake-link-${i}`;
      support.append(item.wrap);
    }
    box.append(support);
    const reason = el("label", "Review reason / corrections or exclusions"),
      text = el("textarea");
    text.value = draft.reason;
    text.rows = 3;
    reason.append(text);
    text.addEventListener("input", () => {
      draft.reason = text.value;
      client.invalidate();
    });
    box.append(reason);
    const ack = input(
      "I reviewed the source gaps, entity and target; these claims remain unconfirmed",
      "checkbox",
    );
    ack.node.checked = draft.acks;
    ack.node.addEventListener("change", () => {
      draft.acks = ack.node.checked;
      client.invalidate();
    });
    box.append(ack.wrap);
    const preview = button(
      "Inspect exact commit",
      act(async () => {
        if (!draft.target || !draft.reason.trim() || !draft.acks)
          throw new Error(
            "Choose a target, give a reason and acknowledge the findings before inspection.",
          );
        const chosen = c.targets[Number(draft.target)],
          target =
            draft.target === "create"
              ? { mode: "create", expected_case_version: 0 }
              : {
                  mode: "attach",
                  case_id: chosen.case_id,
                  expected_case_version: chosen.case_version,
                };
        await client.preview({
          schema_version: "intake-review.v1",
          bundle_id: v.bundle.id,
          expected_bundle_hash: v.bundle.hash,
          record_key: c.record_key,
          expected_source_revision: c.record.source_revision,
          support_document_ids: draft.support,
          reviewed_links: draft.links,
          target,
          expected_prior_intake_binding: c.prior_intake_binding,
          prior_selection_hash: c.commits.at(-1)?.review_material_hash ?? null,
          acknowledgments: c.required_acknowledgments,
          reason: draft.reason,
        });
      }),
      !state.preview,
    );
    preview.disabled =
      state.busy || !!state.pending || state.needsRefresh || !c.can_review;
    box.append(preview);
    if (state.preview) {
      const p = state.preview.response,
        m = p.review_material,
        confirm = el("div", undefined, "review-notice");
      confirm.append(
        el(
          "h3",
          m.target.mode === "create"
            ? "Ready to create one Case"
            : "Ready to append reviewed evidence",
        ),
        el(
          "p",
          `${m.record.cells.customer_ref} · ${entity(m.record.entity)} · ${m.record.cells.invoice_id}. ${m.support.length} supporting document(s), ${m.reviewed_links.length} reported object link(s). Canonical ownership is preserved. No approval, action or closure is granted.`,
        ),
        detail("Exact consent material and bindings", m),
      );
      const commit = button(
        "Commit reviewed material",
        act(async () => {
          if (!client.state.preview)
            throw new Error("Selection changed. Inspect exact commit again.");
          const saved = client.state.preview;
          await client.write("commits", {
            ...saved.review,
            schema_version: "intake-selection.v1",
            expected_material_key: saved.response.material_key,
            expected_consent_hash: saved.response.consent_hash,
            idempotency_key: uid(),
          });
          draft = null;
        }),
        true,
      );
      commit.disabled = state.busy || !!state.pending || state.needsRefresh;
      confirm.append(commit);
      box.append(confirm);
    }
    box.append(detail("Source claims and precise row locators", c.record));
    return box;
  }
  let workDraft = {};
  function workPanel(s) {
    const box = el("section", undefined, "review-card preparation-work"),
      v = s.work,
      target = s.discoveryTarget;
    const matches =
      v?.case_id === target.case_id && v?.record_key === target.record_key;
    const current =
      matches && !s.needsRefresh && !s.workNeedsRefresh && !s.packNeedsRefresh;
    const confirmed =
      s.workConfirmed?.entry.case_id === target.case_id &&
      s.workConfirmed?.entry.record_key === target.record_key
        ? s.workConfirmed.entry
        : null;
    const latest = matches ? v.invocations.at(-1) : null;
    const newer =
      confirmed?.event === "started" &&
      !v?.history.some((e) => e.hash === confirmed.hash);
    const r = newer ? null : latest?.result;
    const title = r
      ? `${r.subject.customer} / ${r.subject.record_id} — evidence-request packet`
      : "Prepare the evidence request";
    box.append(el("h2", title));
    box.dataset.state = newer
      ? "unrefreshed"
      : latest?.review
        ? `task-${latest.review.command.decision}`
        : (latest?.outcome ?? "ready");
    if (workDraft.target !== target.case_id + "|" + target.record_key)
      workDraft = { target: target.case_id + "|" + target.record_key };
    const d = workDraft;
    const base = () => ({
      invocation_id: latest.invocation_id,
      expected_work_revision: v.work_revision,
      expected_work_head: v.work_head,
      idempotency_key: uid(),
    });
    const send = (command) =>
      act(async () => {
        await client.writeWork(command());
        const focus =
          stage.querySelector('[role="alert"]') ??
          stage.querySelector(".preparation-work h2");
        focus?.setAttribute("tabindex", "-1");
        focus?.focus();
      });
    const blocked = !current || s.busy || !!s.pending;
    const receiptNotice = confirmed
      ? el(
          "p",
          `Confirmed ${human(confirmed.event)} receipt · ${new Date(confirmed.recorded_at).toLocaleString()}. ${current ? "Current eligibility is shown separately." : "Current permission is unconfirmed; the original receipt is retained."}`,
          "work-confirmed review-notice",
        )
      : null;
    if (s.workError) box.append(el("p", s.workError, "review-notice"));
    const columns = el("div", undefined, "work-focus"),
      summary = el("div"),
      controls = el("section", undefined, "review-form work-controls");
    if (r) {
      summary.append(
        el(
          "p",
          `${r.subject.currency} ${(r.subject.disputed_amount_minor / 100).toLocaleString("en-US")} disputed source amount. No credit is recommended.`,
          "review-issue",
        ),
      );
      const delivery = r.evidence_checklist.filter(
        (c) => c.subject.kind === "delivery",
      );
      for (const c of delivery)
        summary.append(el("p", `${c.subject.id}: ${c.finding}`));
      summary.append(
        el(
          "p",
          "Checklist, reconciliation and unsent follow-up prepared. Terms, accountable business owner and impact remain unconfirmed.",
          "review-muted",
        ),
      );
      const progress = latest.review
        ? {
            approve: "Task accepted for preparation",
            reject: "Task rejected",
            modify: "Modification requested",
            escalate: "Task escalated — no message sent",
          }[latest.review.command.decision]
        : "Preparation complete — human task review needed";
      summary.append(el("h3", progress, "work-progress"));
      if (!current || !latest.current_usable)
        summary.append(
          el(
            "p",
            !current
              ? "Current applicability could not be refreshed."
              : "This result is historical and cannot currently be accepted or used. " +
                  latest.reasons.join(" "),
            "review-notice",
          ),
        );
      controls.append(
        el(
          "p",
          "Synthetic task reviewer: intake operator. Accept preparation usefulness only.",
        ),
      );
      if (!latest.review) {
        const reason = input("Task review reason", "text", d.reason ?? ""),
          proposal = input(
            "Proposed modification (required for modify)",
            "text",
            d.proposal ?? "",
          );
        reason.node.oninput = () => (d.reason = reason.node.value);
        proposal.node.oninput = () => (d.proposal = proposal.node.value);
        controls.append(reason.wrap);
        const actions = el("div", undefined, "work-actions");
        for (const [decision, label] of [
          ["approve", "Accept preparation packet"],
          ["reject", "Reject packet"],
          ["modify", "Request modification"],
          ["escalate", "Escalate for human attention"],
        ]) {
          const b = button(
            label,
            send(() => {
              if (!d.reason?.trim())
                throw new Error("Give a task review reason.");
              return {
                schema_version: "preparation-task-review.v1",
                operation: "task_review",
                purpose: "preparation_usefulness",
                ...base(),
                result_hash: latest.result_hash,
                decision,
                reason: d.reason,
                ...(decision === "modify"
                  ? { replacement_proposal: d.proposal ?? "" }
                  : {}),
              };
            }),
            decision === "approve",
          );
          b.disabled =
            blocked ||
            (decision === "approve"
              ? !latest.can_accept
              : !latest.can_intervene);
          actions.append(b);
        }
        controls.append(actions, proposal.wrap);
      } else
        controls.append(
          el(
            "p",
            `Recorded by synthetic ${human(latest.review.actor.identity_id.replace("identity_", ""))} at ${new Date(latest.review.recorded_at).toLocaleString()}. This task review is terminal; corrections remain available.`,
          ),
        );
    } else {
      const a = s.pack?.candidate,
        selected = s.view?.candidates.find(
          (c) => c.record_key === target.record_key,
        )?.record;
      summary.append(
        el(
          "p",
          selected
            ? `${selected.cells.customer_ref} / ${selected.source_record_id} · ${money(selected.cells.amount_minor)} disputed source amount.`
            : "One selected synthetic record and its explicitly associated evidence.",
          "review-issue",
        ),
      );
      if (a)
        summary.append(
          el(
            "p",
            a.loop_outputs.find((o) => o.id === "Human Intervention Map").text,
          ),
        );
      summary.append(
        el(
          "p",
          "Prepare a cited checklist, scoped reconciliation and unsent evidence request. No credit recommendation, message or financial effect.",
        ),
      );
      controls.append(
        el(
          "h3",
          latest?.outcome === "started"
            ? "Preparation pending — inspect or interrupt"
            : latest?.outcome === "failed"
              ? "Preparation failed — no usable packet"
              : "Next: explicitly prepare this record",
        ),
      );
      if (!current || !v?.current.can_start)
        controls.append(
          el(
            "p",
            (current
              ? v.current.reasons
              : ["Refresh to inspect current eligibility"]
            ).join(" "),
            "review-notice",
          ),
        );
    }
    const fresh = button(
      latest ? "Prepare a fresh packet" : "Prepare evidence-request packet",
      send(() => ({
        schema_version: "preparation-work-command.v1",
        operation: "start",
        binding: v.candidate_binding,
        expected_work_revision: v.work_revision,
        expected_work_head: v.work_head,
        replaces_invocation: v.invocations.at(-1)?.invocation_id ?? null,
        idempotency_key: uid(),
      })),
      !r,
    );
    fresh.disabled = blocked || !v?.current.can_start;
    if (!r) controls.append(fresh);
    else {
      const again = el("details");
      again.append(
        el("summary", "Prepare again — new explicit invocation"),
        el(
          "p",
          "A new run retains the previous result and starts without task acceptance.",
        ),
        fresh,
      );
      controls.append(again);
    }
    if (latest?.can_interrupt) {
      const reason = input("Interruption reason", "text", d.interrupt ?? "");
      reason.node.oninput = () => (d.interrupt = reason.node.value);
      const b = button(
        "Interrupt pending preparation",
        send(() => ({
          schema_version: "preparation-interruption.v1",
          operation: "interrupt",
          ...base(),
          reason: d.interrupt ?? "",
        })),
      );
      b.disabled = blocked;
      controls.append(reason.wrap, b);
    }
    columns.append(summary, controls);
    box.append(columns);
    if (receiptNotice) box.append(receiptNotice);
    const cite = (ids) => {
      const node = el("details", undefined, "intake-source");
      node.append(el("summary", "Supporting citations"));
      for (const id of [...new Set(ids)]) {
        const source = v.sources.find((x) => x.id === id);
        if (source) {
          node.append(el("p", `${source.name} · ${source.interpretation}`));
          if (source.excerpt) node.append(el("blockquote", source.excerpt));
          node.append(detail("Source locator and binding", source));
        }
      }
      return node;
    };
    if (r) {
      const draft = el("details", undefined, "review-card work-draft");
      draft.append(
        el("summary", "Inspect the unsent follow-up"),
        el("pre", r.follow_up.draft),
        cite(r.follow_up.draft_citation_ids),
      );
      box.append(draft);
      const evidence = el("details", undefined, "review-card work-evidence");
      evidence.append(
        el("summary", "Checklist, scoped reconciliation & step evidence"),
      );
      for (const c of r.evidence_checklist)
        evidence.append(
          el("h4", `${c.subject.id} · ${human(c.status)}`),
          el("p", c.finding),
          cite(c.citation_ids),
        );
      for (const c of r.reconciliation)
        evidence.append(
          el(
            "p",
            `${c.field}: ${c.values.map((x) => x || "(not supplied)").join(" / ")}${c.conflicting ? " — conflicting values" : ""}`,
          ),
          cite(c.citation_ids),
        );
      evidence.append(
        detail("Bounded coverage, related context and completed steps", {
          coverage: r.coverage,
          related_context: r.related_context,
          steps: r.steps,
        }),
      );
      box.append(evidence);
      const corrections = el(
        "details",
        undefined,
        "review-card work-correction",
      );
      corrections.append(
        el(
          "summary",
          "Correct preparation wording / review evaluation candidate",
        ),
      );
      const after = input(
          "Corrected first evidence request",
          "text",
          d.after ?? "",
        ),
        reason = input("Correction reason", "text", d.correctionReason ?? "");
      after.node.oninput = () => (d.after = after.node.value);
      reason.node.oninput = () => (d.correctionReason = reason.node.value);
      const original = r.follow_up.requests[0];
      corrections.append(
        el("p", `Original: ${original.text}`),
        el(
          "p",
          "Wording proposal only. New source facts require intake/description review and separate publication. This does not edit the result or promote a worker.",
        ),
        after.wrap,
        reason.wrap,
      );
      const correct = button(
        "Record wording correction",
        act(async () => {
          await client.writeWork({
            schema_version: "purpose_limited_preparation_correction.v1",
            operation: "correction",
            purpose: "preparation_usefulness",
            ...base(),
            binding_hash: await intakeHash(latest.binding),
            original_result_hash: latest.result_hash,
            target: "/follow_up/requests/0/text",
            before: original.text,
            after: d.after ?? "",
            classification: "knowledge_bearing",
            primary_reason: "MISSING_KNOWLEDGE",
            reason: d.correctionReason ?? "",
            citation_ids: original.citation_ids,
            evidence_limits: [
              "Proposed wording; no new source fact or business authority",
            ],
          });
        }),
      );
      correct.disabled = blocked;
      corrections.append(correct);
      const all = v.history.filter(
        (e) => e.invocation_id === latest.invocation_id,
      );
      for (const e of all.filter((e) => e.event === "correction")) {
        const reviewed = all.find(
          (x) =>
            x.event === "evaluation_review" &&
            x.command.correction_entry_hash === e.hash,
        );
        corrections.append(
          el(
            "h4",
            reviewed
              ? `Evaluation candidate ${reviewed.command.decision === "approve" ? "accepted" : "rejected"} — no promotion`
              : "Evaluation candidate awaits independent review",
          ),
          el("p", e.command.after),
          detail("Original correction and candidate", e),
        );
        if (!reviewed) {
          corrections.append(
            el(
              "p",
              "Independent synthetic evaluation reviewer: preparation publication reviewer. This selects a regression candidate only.",
            ),
          );
          const why = input(
              "Evaluation review reason",
              "text",
              d.evalReason ?? "",
            ),
            tests = input("Synthetic test references", "text", d.tests ?? "");
          why.node.oninput = () => (d.evalReason = why.node.value);
          tests.node.oninput = () => (d.tests = tests.node.value);
          corrections.append(why.wrap, tests.wrap);
          for (const decision of ["approve", "reject"]) {
            const b = button(
              decision === "approve"
                ? "Accept evaluation candidate"
                : "Reject evaluation candidate",
              send(() => ({
                schema_version: "preparation-evaluation-review.v1",
                operation: "evaluation_review",
                purpose: "synthetic_evaluation_candidate",
                ...base(),
                correction_entry_hash: e.hash,
                candidate_id: e.candidate.id,
                expected_candidate_revision: e.candidate.revision,
                expected_test_case_hash: e.candidate.test_case_hash,
                decision,
                reason: d.evalReason ?? "",
                test_references: (d.tests ?? "").split("\n").filter(Boolean),
              })),
            );
            b.disabled = blocked;
            corrections.append(b);
          }
        }
      }
      box.append(corrections);
    }
    if (latest) {
      const proof = el("details", undefined, "review-card work-proof");
      proof.append(
        el("summary", "Proof readiness & separate costs"),
        el(
          "p",
          "Cash, resolved disputes, credits, newly attended work and human attention are separate. Missing measurements remain unknown; waiting is not human effort. No aggregate value or savings is computed.",
        ),
      );
      if (r)
        proof.append(
          detail("Five readiness measures and named costs", {
            measures: r.proof_readiness,
            costs: r.cost_evidence,
            execution: r.execution_facts,
          }),
        );
      const notes = matches
        ? v.history.filter(
            (e) =>
              e.event === "proof_note" && e.record_key === target.record_key,
          )
        : [];
      for (const e of notes) {
        const n = e.command.note,
          replaced = notes.some(
            (x) =>
              x.command.note.supersedes_entry_hash === e.hash ||
              x.command.note.reversal_of_entry_hash === e.hash ||
              x.command.note.reopens_entry_hash === e.hash,
          );
        proof.append(
          el(
            "p",
            `${e.invocation_id === (newer ? confirmed.invocation_id : latest?.invocation_id) ? "This invocation" : "Historical invocation"} · ${human(n.measure)}: ${n.value === null ? "unknown" : `${n.value} ${n.unit}`} · synthetic ${n.qualification}${replaced ? " · superseded / reversed / reopened history" : ""}${n.overlap_entry_hashes.length ? " · overlapping evidence, do not add" : ""}`,
          ),
          detail("Exact note, coverage, lineage and attribution", e),
        );
      }
      const note = el("label", "Synthetic proof note (strict JSON)"),
        text = el("textarea");
      text.rows = 8;
      text.value = d.note ?? "";
      text.placeholder =
        "Paste one bounded note using the API guide; unknown values must be null.";
      text.oninput = () => (d.note = text.value);
      note.append(text);
      proof.append(note);
      const save = button(
        "Record synthetic proof note",
        act(async () => {
          await client.writeWork({
            schema_version: "preparation-proof-note.v1",
            operation: "proof_note",
            purpose: "synthetic_measurement_readiness",
            ...base(),
            binding_hash: await intakeHash(latest.binding),
            result_hash: latest.result_hash,
            note: JSON.parse(d.note ?? ""),
            reason:
              "Explicit operator-supplied synthetic measurement note; no business outcome proof",
          });
        }),
      );
      save.disabled = blocked || latest.outcome === "started";
      proof.append(save);
      box.append(proof);
    }
    if (matches) {
      const history = detail(
        "Earlier invocations, exact bindings, timing & immutable history",
        v.history,
      );
      box.append(history);
      const download = el("a", "Download portable preparation history");
      download.href = workPath(target) + "&representation=export";
      box.append(download);
    }
    if (confirmed)
      box.append(detail("Exact confirmed preparation-work receipt", confirmed));
    box.append(
      el(
        "p",
        "Synthetic preparation only. Customer impact is unverified; financial authority, external actions and Case closure remain blocked.",
        "review-muted",
      ),
    );
    return box;
  }
  let discoveryDraft = null;
  function discoveryFocus() {
    const n =
      stage.querySelector("[role=alert]") ??
      stage.querySelector(".discovery-result h2") ??
      stage.querySelector(".discovery-brief h2");
    n?.setAttribute("tabindex", "-1");
    n?.focus();
  }
  let packDraft;
  function packPanel(s) {
    const box = el("section", undefined, "review-card preparation-pack"),
      v = s.pack;
    box.append(el("h2", "Preparation pack"));
    const target = s.discoveryTarget;
    const current =
      v &&
      !s.packNeedsRefresh &&
      !s.needsRefresh &&
      v.target.bundle_id === target.bundle_id &&
      v.target.record_key === target.record_key &&
      v.target.case_id === (target.case_id ?? null);
    const receipt = s.packConfirmed?.entry;
    if (receipt?.case_id === target.case_id) {
      const result = el("section", undefined, "pack-result");
      result.role = "status";
      result.dataset.revision = String(receipt.sequence);
      result.append(
        el(
          "h3",
          `${receipt.operation === "withdraw" ? "Withdrawal" : receipt.operation === "rollback" ? "Rollback" : "Publication"} recorded`,
        ),
        el(
          "p",
          `Confirmed at ${new Date(receipt.recorded_at).toLocaleString()}. ${current ? "Current selection is shown separately below." : "Current selection could not be confirmed. This historical receipt grants no current permission."}`,
        ),
        detail("Exact confirmed selection receipt", receipt),
      );
      box.append(result);
    }
    const status = current ? v.current.status : "unavailable";
    box.dataset.state = status;
    const labels = {
      proposed: "Proposed — separate publication needed",
      published_for_preparation: s.work?.invocations.length
        ? "Published for preparation — work history below"
        : "Published for preparation — worker not started",
      stale: "Stale — previous publication cannot be used",
      withdrawn: "Withdrawn — no pack selected",
      unavailable: "Current selection unavailable",
    };
    box.append(el("h3", labels[status], "pack-state"));
    if (s.packError)
      box.append(
        el("p", `Pack refresh unavailable: ${s.packError}`, "review-notice"),
      );
    if (
      !v ||
      v.target.bundle_id !== target.bundle_id ||
      v.target.record_key !== target.record_key ||
      v.target.case_id !== (target.case_id ?? null)
    ) {
      box.append(
        el(
          "p",
          "Refresh retained evidence to inspect this record’s candidate and current selection. No publication is assumed.",
        ),
      );
      return box;
    }
    const a = v.candidate,
      selected = v.selected_artifact;
    const grid = el("div", undefined, "pack-focus"),
      summary = el("div"),
      controls = el("div", undefined, "review-form pack-controls");
    if (a) {
      summary.append(
        el("p", a.template.objective, "review-issue"),
        el(
          "p",
          a.loop_outputs.find((o) => o.id === "Human Intervention Map").text,
        ),
        el(
          "p",
          a.loop_outputs.find((o) => o.id === "Population").text,
          "review-muted",
        ),
      );
      summary.append(
        el(
          "p",
          a.binding.confirmation_entry_hash
            ? "This candidate reuses its bound, recorded workflow description. Publication is a separate decision; current eligibility is shown above."
            : "Fresh descriptive confirmation is needed before publication. Unknowns and disputes remain visible; confirmation does not settle them.",
        ),
      );
      const citations = el("details", undefined, "intake-source");
      citations.append(el("summary", "Pack findings and cited evidence"));
      for (const claim of a.loop_outputs) {
        citations.append(
          el("h4", claim.id),
          el("p", claim.text),
          el(
            "p",
            `${claim.process_view} · ${claim.claim_state}`,
            "review-muted",
          ),
        );
        for (const ref of claim.citation_ids) {
          const c = a.sources.find((c) => c.id === ref),
            part = el("details", undefined, "intake-source");
          part.append(
            el(
              "summary",
              `${c.name} · ${c.locator.record === null ? "associated document" : `source row ${c.locator.record}`}`,
            ),
            el("pre", c.excerpt ?? "Retained only — no extraction"),
          );
          const link = el("a", "Download cited original bytes");
          link.href = `/v1/intake/artifacts/${c.artifact_hash.slice(7)}`;
          part.append(link, detail("Citation binding", c));
          citations.append(part);
        }
      }
      summary.append(citations);
      if (selected && v.candidate_hash !== v.selected_artifact_hash) {
        const changes = el("details", undefined, "intake-source");
        changes.append(el("summary", "Exact changes from the selected pack"));
        for (const c of v.comparison) {
          changes.append(
            el("h4", human(c.field)),
            detail("Before / after", {
              before: selected[c.field],
              after: a[c.field],
            }),
          );
        }
        summary.append(
          el(
            "p",
            "The current candidate differs from the selected artifact. Review the changed description and bindings; previous approval does not transfer.",
            "review-notice",
          ),
          changes,
        );
      }
    }
    if (v.current.reasons.length)
      summary.append(el("p", v.current.reasons.join(" "), "review-notice"));
    const next = !current
      ? "Refresh and inspect current selection, or recover the original submission."
      : status === "published_for_preparation"
        ? "Inspect or withdraw this selection. Worker execution is not implemented."
        : v.current.can_publish
          ? "Inspect the candidate, then explicitly publish it for preparation."
          : a && !a.binding.confirmation_entry_hash
            ? "Correct the description if needed, then record fresh descriptive confirmation above. Return here for separate publication."
            : "Resolve the stated basis or reviewer restriction; withdrawal uses its own eligibility checks.";
    controls.append(el("h3", "Next action"), el("p", next));
    controls.append(
      el(
        "p",
        "Synthetic preparation publisher · a separate server-controlled demo profile, not authenticated sign-in.",
        "review-muted",
      ),
    );
    const draftKey = `${v.target.case_id}:${v.selection_head}:${v.candidate_hash}`;
    if (!packDraft || packDraft.key !== draftKey)
      packDraft = {
        key: draftKey,
        reason: "",
        until: new Date(Date.parse(v.evaluated_at) + 3600000)
          .toISOString()
          .slice(0, 16),
        acknowledged: false,
      };
    const d = packDraft,
      reason = input("Selection reason", "text", d.reason);
    reason.node.maxLength = 2000;
    reason.node.addEventListener("input", () => (d.reason = reason.node.value));
    const until = input("Preparation expiry (UTC)", "datetime-local", d.until);
    until.node.addEventListener("input", () => (d.until = until.node.value));
    const consent = input(
      "I reviewed this exact candidate for preparation only",
      "checkbox",
    );
    consent.node.checked = d.acknowledged;
    consent.node.addEventListener(
      "change",
      () => (d.acknowledged = consent.node.checked),
    );
    const write = (operation, artifactHash = v.candidate_hash, artifact = a) =>
      act(async () => {
        if (!d.reason.trim())
          throw new Error("Give a reason for this selection change.");
        if (operation !== "withdraw" && (!d.acknowledged || !d.until))
          throw new Error(
            "Review the exact candidate and choose its preparation expiry before publication or rollback.",
          );
        const command = {
          schema_version: v.schema_version.endsWith(".v2")
            ? "pack-selection-command.v2"
            : "pack-selection-command.v1",
          operation,
          pack_id: v.pack_id,
          expected_selection_revision: v.selection_revision,
          expected_selection_head: v.selection_head,
          expected_publication_profile_hash: v.publication_profile_hash,
          artifact_hash:
            operation === "withdraw" ? v.selected_artifact_hash : artifactHash,
          reason: d.reason,
          idempotency_key: uid(),
          ...(operation === "withdraw"
            ? {}
            : {
                expected_basis: artifact.binding,
                effective_until: new Date(`${d.until}:00.000Z`).toISOString(),
                effective_until_source_timezone: "UTC",
              }),
        };
        await client.writePack(command);
        const focus =
          stage.querySelector('[role="alert"]') ??
          stage.querySelector(".pack-result h3");
        focus?.setAttribute("tabindex", "-1");
        focus?.focus();
      });
    const disabled = !current || s.busy || !!s.pending;
    controls.append(reason.wrap);
    if (a) {
      controls.append(until.wrap, consent.wrap);
      const publish = button("Publish for preparation", write("publish"), true);
      publish.disabled = disabled || !v.current.can_publish;
      controls.append(publish);
    }
    if (selected) {
      const withdraw = button("Withdraw selected pack", write("withdraw"));
      withdraw.disabled = disabled || !v.current.can_withdraw;
      controls.append(withdraw);
      if (v.current.withdrawal_reasons.length)
        controls.append(
          el("p", v.current.withdrawal_reasons.join(" "), "review-notice"),
        );
    }
    grid.append(summary, controls);
    box.append(grid);
    const history = el("details", undefined, "intake-source");
    history.append(
      el(
        "summary",
        `Selection history and guarded rollback (${v.history.length} entries)`,
      ),
    );
    for (const e of v.history) {
      const part = el("section", undefined, "intake-source");
      part.append(
        el(
          "h4",
          `${human(e.operation)} · ${new Date(e.recorded_at).toLocaleString()}`,
        ),
        el("p", `Synthetic preparation publisher. ${e.command.reason}`),
        detail("Immutable artifact, exact basis and publication evidence", e),
      );
      const rollback = v.rollback_candidates.find(
        (r) => r.artifact_hash === e.artifact_hash,
      );
      if (e.artifact && rollback) {
        const b = button(
          "Roll back to this retained artifact",
          write("rollback", e.artifact_hash, e.artifact),
        );
        b.disabled = disabled || !rollback.eligible;
        part.append(
          el(
            "p",
            "Rollback is a new publication decision. Inspect this retained artifact and supply the reason, expiry and consent above. It must match the current basis.",
          ),
          b,
        );
        if (rollback.reasons.length)
          part.append(el("p", rollback.reasons.join(" "), "review-muted"));
      }
      history.append(part);
    }
    const exportLink = el("a", "Download portable pack and review evidence");
    exportLink.href = `${packPath(v.target)}&representation=export`;
    box.append(
      history,
      detail("Template, current candidate and technical bindings", v),
      exportLink,
      el(
        "p",
        "Preparation configuration only: no worker dispatch, model calls, business authority or Case closure. Source reports do not verify customer impact.",
        "review-muted",
      ),
    );
    return box;
  }
  function discoveryPanel(s) {
    const v = s.discovery,
      m = v.material,
      a = m.assignment,
      box = el("section", undefined, "discovery-brief");
    const shell = el("div", undefined, "discovery-focus"),
      summary = el("section", undefined, "review-card"),
      controls = el("section", undefined, "review-form discovery-controls");
    summary.append(
      el(
        "p",
        "Revenue-linked assignment · Synthetic descriptive review",
        "review-muted",
      ),
      el("h2", `${a.customer_ref} / ${a.invoice_id}`),
      el(
        "p",
        `${new Intl.NumberFormat("en-US", { style: "currency", currency: a.currency }).format(a.amount_minor / 100)} reported dispute · ${entity(a.entity)}`,
        "review-issue",
      ),
      el("p", a.objective),
    );
    const dependency = m.findings.find((f) => f.id === "R3"),
      conflict = m.findings.find((f) => f.id === "R4");
    summary.append(el("p", dependency.text, "review-notice"));
    if (conflict.claim_state === "disputed")
      summary.append(el("p", conflict.text, "review-notice"));
    const correction = m.annotations.find((n) => n.target_id === "R3");
    if (correction)
      summary.append(
        el(
          "p",
          `Operator-reported correction (${correction.state}): ${correction.text}`,
        ),
      );
    summary.append(
      el(
        "p",
        `Accountable owner unconfirmed${a.reported_owner ? `; source reports ${a.reported_owner}` : ""}. Customer impact and a valid disposition remain unproven.`,
      ),
    );
    const sources = el("details", undefined, "intake-source");
    sources.append(el("summary", "Cited evidence for this finding"));
    const refSet = new Set([
      ...dependency.citation_ids,
      ...(conflict.claim_state === "disputed" ? conflict.citation_ids : []),
    ]);
    for (const c of m.sources.filter((c) => refSet.has(c.id)))
      sources.append(
        el("strong", c.name),
        el("p", c.excerpt ?? "Retained only — no content extraction"),
        detail("Original source locator", c),
      );
    summary.append(sources);
    const current = !s.needsRefresh && !s.pending,
      purposes = current ? v.current.confirmed_purposes : [];
    const next = !v.current.can_record
      ? "Commit this record to an explicitly chosen Case before saving answers."
      : !current
        ? "Refresh and inspect current inputs, or recover the saved original submission."
        : purposes.includes("discovery_description")
          ? purposes.includes("improvement_discussion")
            ? "Descriptions recorded. Resolve the evidence and ownership gaps before any proposed handoff."
            : "Review the proposed improvement; its controls and baseline remain unconfirmed."
          : m.annotations.length
            ? "Review the saved answers, then explicitly confirm the description or continue correcting it."
            : "Clarify the consequential delivery-evidence question; unknown and disputed answers are allowed.";
    controls.append(el("h3", "Next: descriptive review"), el("p", next));
    if (v.current.requires_fresh_review)
      controls.append(el("p", v.current.reasons.join(" "), "review-notice"));
    if (v.current.can_record) {
      if (
        !discoveryDraft ||
        discoveryDraft.material !== v.material_hash ||
        discoveryDraft.revision !== v.binding.expected_discovery_revision
      )
        discoveryDraft = {
          material: v.material_hash,
          revision: v.binding.expected_discovery_revision,
          target: "Q1",
          state: "unknown",
          text: "",
          reason: "",
          purpose: "discovery_description",
          confirmReason: "",
        };
      const d = discoveryDraft,
        form = el("div"),
        target = select(
          "Answer a question or correct a finding",
          [
            ...m.questions.map((q) => [q.id, `${q.id} · ${q.prompt}`]),
            ...m.findings.map((f) => [f.id, `${f.id} · Correct ${f.title}`]),
          ],
          d.target,
        );
      const prompt = el(
        "p",
        m.questions.find((q) => q.id === d.target)?.prompt ??
          m.findings.find((f) => f.id === d.target)?.text,
        "discovery-question",
      );
      target.node.addEventListener("change", () => {
        d.target = target.node.value;
        prompt.textContent =
          m.questions.find((q) => q.id === d.target)?.prompt ??
          m.findings.find((f) => f.id === d.target)?.text;
      });
      const state = select(
        "Answer state",
        [
          ["answered", "Answered — operator reported"],
          ["unknown", "Unknown"],
          ["disputed", "Disputed"],
        ],
        d.state,
      );
      state.node.addEventListener("change", () => (d.state = state.node.value));
      const answer = el("label", "Descriptive answer or correction"),
        text = el("textarea");
      text.rows = 3;
      text.maxLength = 2000;
      text.value = d.text;
      text.addEventListener("input", () => (d.text = text.value));
      answer.append(text);
      const reason = el("label", "Reason and evidence limits"),
        r = el("textarea");
      r.rows = 2;
      r.maxLength = 2000;
      r.value = d.reason;
      r.addEventListener("input", () => (d.reason = r.value));
      reason.append(r);
      form.append(target.wrap, prompt, state.wrap, answer, reason);
      const cite = el("details");
      cite.append(el("summary", "Select supporting citations (optional)"));
      const selected = new Set(d.citations ?? []);
      for (const c of m.sources) {
        const item = input(
          `${c.name} · ${c.locator.record === null ? "document" : `source row ${c.locator.record}`}`,
          "checkbox",
        );
        item.node.checked = selected.has(c.id);
        item.node.addEventListener("change", () => {
          if (item.node.checked) selected.add(c.id);
          else selected.delete(c.id);
          d.citations = [...selected];
        });
        cite.append(item.wrap);
      }
      form.append(cite);
      const save = button(
        "Save descriptive answer",
        act(async () => {
          if (!d.text.trim() || !d.reason.trim())
            throw new Error(
              "Give an answer (unknown is valid) and explain its evidence limits.",
            );
          if (selected.size > 16)
            throw new Error(
              "Select at most 16 supporting citations for this answer.",
            );
          await client.writeDiscovery({
            schema_version: "discovery-review-command.v1",
            ...v.binding,
            operation: "annotate",
            idempotency_key: uid(),
            reason: d.reason,
            changes: [
              {
                target_id: d.target,
                state: d.state,
                text: d.text,
                reason: d.reason,
                citation_ids: [...selected],
              },
            ],
          });
          discoveryFocus();
        }),
        !purposes.includes("discovery_description"),
      );
      save.disabled = s.busy || !!s.pending || s.needsRefresh;
      form.append(save);
      if (purposes.includes("discovery_description")) {
        const more = el("details");
        more.append(
          el("summary", "Answer or correct the recorded description"),
          form,
        );
        controls.append(more);
      } else controls.append(form);
      const consent = el("details", undefined, "discovery-consent");
      consent.append(
        el("summary", "Confirm a description or improvement discussion"),
        el(
          "p",
          "Save answers first, then review the refreshed material. This records descriptive consent only; it does not resolve disagreements or grant authority.",
        ),
      );
      const purpose = select(
        "Descriptive purpose",
        [
          ["discovery_description", "Workflow description"],
          ["improvement_discussion", "Improvement discussion"],
        ],
        d.purpose,
      );
      purpose.node.addEventListener(
        "change",
        () => (d.purpose = purpose.node.value),
      );
      const why = input("Confirmation reason", "text", d.confirmReason);
      why.node.maxLength = 2000;
      why.node.addEventListener(
        "input",
        () => (d.confirmReason = why.node.value),
      );
      const confirm = button(
        "Record descriptive confirmation",
        act(async () => {
          if (!d.confirmReason.trim())
            throw new Error(
              "Explain why this description is suitable for the selected purpose.",
            );
          await client.writeDiscovery({
            schema_version: "discovery-review-command.v1",
            ...v.binding,
            operation: "confirm",
            purpose: d.purpose,
            reason: d.confirmReason,
            idempotency_key: uid(),
          });
          discoveryFocus();
        }),
      );
      confirm.disabled = s.busy || !!s.pending || s.needsRefresh;
      consent.append(purpose.wrap, why.wrap, confirm);
      controls.append(consent);
    } else
      controls.append(
        el(
          "p",
          "Use “Review this candidate”, inspect the exact intake commit, and explicitly create or select a Case. Discovery does not create one automatically.",
        ),
      );
    if (!v.current.can_record)
      controls.append(
        button(
          "Review Case preparation",
          () => {
            candidateIndex = s.view.candidates.findIndex(
              (c) => c.record_key === v.binding.record_key,
            );
            draft = null;
            client.closeDiscovery();
            render();
            stage
              .querySelector(".intake-review h2")
              ?.setAttribute("tabindex", "-1");
            stage.querySelector(".intake-review h2")?.focus();
          },
          true,
        ),
      );
    shell.append(summary, controls);
    const workerMode = s.pack?.schema_version === "pack-selection-read.v2";
    if (workerMode && purposes.includes("discovery_description")) {
      const completed = el("details", undefined, "review-card");
      completed.append(
        el("summary", "Description reviewed — inspect or correct"),
        shell,
      );
      box.append(completed);
    } else box.append(shell);
    const packs = packPanel(s);
    if (workerMode && s.pack.selected_artifact_hash) {
      const published = el("details", undefined, "review-card");
      published.append(
        el("summary", "Publication & withdrawal — inspect or change"),
        packs,
      );
      box.append(published);
    } else box.append(packs);
    if (workerMode && s.discoveryTarget?.case_id) box.prepend(workPanel(s));
    if (
      s.discoveryConfirmed?.entry.case_id === v.binding.case_id &&
      s.discoveryConfirmed.entry.command.bundle_id === v.binding.bundle_id &&
      s.discoveryConfirmed.entry.command.record_key === v.binding.record_key
    ) {
      const e = s.discoveryConfirmed.entry,
        result = el("section", undefined, "review-card discovery-result");
      result.role = "status";
      result.dataset.revision = String(e.sequence);
      result.append(
        el(
          "h2",
          e.operation === "annotate"
            ? "Descriptive answer recorded"
            : "Descriptive confirmation recorded",
        ),
        el(
          "p",
          `Recorded by the synthetic intake operator at ${new Date(e.recorded_at).toLocaleString()}. ${current ? (e.material_hash === v.material_hash ? "This receipt matches the refreshed descriptive material." : "This receipt is historical; it does not confirm the current material.") : "The receipt is confirmed; current applicability has not been refreshed."}`,
        ),
        detail("Exact historical receipt", e),
      );
      box.append(result);
    }
    const progress = el(
      "p",
      !current
        ? "Current descriptive status is unconfirmed. Retained receipts remain historical evidence."
        : purposes.length
          ? `Recorded for: ${purposes.map((p) => (p === "discovery_description" ? "workflow description" : "improvement discussion")).join(" and ")}. This is not completed Discovery or a verified outcome.`
          : "Draft description — explicit confirmation remains available; questions may remain unknown or disputed.",
      "review-muted",
    );
    box.append(progress);
    if (m.annotations.length) {
      const notes = el("section", undefined, "review-card");
      notes.append(el("h3", "Current operator-reported answers"));
      for (const n of m.annotations)
        notes.append(
          el("p", `${n.target_id} · ${n.state}: ${n.text}`),
          el("p", `Reason: ${n.reason}`, "review-muted"),
        );
      box.append(notes);
    }
    const records = el("details", undefined, "review-card");
    records.append(
      el("summary", "Seven Discovery records and six loop outputs"),
    );
    for (const f of m.findings) {
      const part = el("section", undefined, "intake-source");
      part.append(
        el("h3", `${f.id} · ${f.title}`),
        el("p", f.text),
        el(
          "p",
          `${f.process_view} process · ${f.evidence_type} evidence · ${f.claim_state} claim`,
          "review-muted",
        ),
      );
      const q = m.questions.filter((q) => q.record_id === f.id);
      for (const x of q)
        part.append(
          el("p", x.prompt),
          el(
            "p",
            `Needed: ${x.needed_evidence}. Proposed owner: ${x.proposed_owner} (unconfirmed).`,
          ),
        );
      records.append(part);
    }
    for (const o of m.loop_outputs)
      records.append(
        el("h3", o.id),
        el("p", o.text),
        el("p", `${o.process_view} · ${o.claim_state}`, "review-muted"),
      );
    box.append(records);
    const improvement = el("details", undefined, "review-card");
    improvement.append(
      el("summary", "Proposed improvement — redesign before allocation"),
    );
    for (const p of m.improvements)
      improvement.append(
        el("h3", p.change.charAt(0).toUpperCase() + p.change.slice(1)),
        el("p", p.proposal),
        el("p", `Retained control: ${p.control}`),
        el("p", `Then allocate: ${p.allocation}`),
        el("p", `Evidence needed: ${p.measurement_needed}`, "review-muted"),
      );
    improvement.append(el("p", m.measurement_note));
    box.append(improvement);
    const evidence = el("details", undefined, "review-card");
    evidence.append(
      el("summary", "Complete cited sources and competing claims"),
      el(
        "p",
        "Related records remain context. A shared customer or invoice label does not make their evidence apply to this dispute; inspect the record and explicit delivery associations.",
      ),
    );
    for (const c of m.sources) {
      const part = el("details", undefined, "intake-source");
      part.append(
        el("summary", c.name),
        el("pre", c.excerpt ?? "Retained only — no extraction"),
      );
      const link = el("a", "Download original source bytes");
      link.href = `/v1/intake/artifacts/${c.artifact_hash.slice(7)}`;
      part.append(link, detail("Citation, scope and source time", c));
      evidence.append(part);
    }
    evidence.append(
      detail("Source-reported values and evidence conditions", m.source_claims),
    );
    box.append(evidence);
    const history = el("details", undefined, "review-card");
    history.append(
      el("summary", `Descriptive review history (${v.history.length} entries)`),
    );
    for (const e of v.history) {
      const part = el("section", undefined, "intake-source"),
        applicable = e.material_hash === v.material_hash && current;
      part.append(
        el(
          "h3",
          `${e.operation === "annotate" ? "Annotation" : "Confirmation"} · ${new Date(e.recorded_at).toLocaleString()}`,
        ),
        el(
          "p",
          `Synthetic intake operator · ${applicable ? "matches this material" : "historical material; no current confirmation inferred"}`,
        ),
      );
      if (e.operation === "annotate")
        for (const change of e.command.changes) {
          part.append(
            el("p", `${change.target_id} · ${change.state}: ${change.text}`),
            el("p", `Reason: ${change.reason}`),
          );
          const carry = button("Use this answer in a new draft", () => {
            if (!discoveryDraft) return;
            discoveryDraft = {
              ...discoveryDraft,
              target: change.target_id,
              state: change.state,
              text: change.text,
              reason: change.reason,
              citations: change.citation_ids.filter((id) =>
                m.sources.some((c) => c.id === id),
              ),
            };
            render();
            stage.querySelector(".discovery-controls textarea")?.focus();
          });
          carry.disabled =
            !v.current.can_record || s.busy || !!s.pending || s.needsRefresh;
          part.append(carry);
        }
      part.append(
        detail("Original reviewed material, citations and attribution", e),
      );
      history.append(part);
    }
    history.append(
      el(
        "p",
        "Historical answers remain inspectable. Carry-forward only fills a new draft; save it against refreshed inputs and confirm separately.",
      ),
    );
    box.append(
      history,
      detail("Technical bindings and implementation versions", {
        binding: v.binding,
        manifest: m.manifest,
        current: v.current,
      }),
    );
    const download = el("a", "Download portable Discovery evidence");
    download.href = `/v1/intake/bundles/${v.binding.bundle_id}/discovery?record_key=${encodeURIComponent(v.binding.record_key)}${v.binding.case_id ? `&case_id=${v.binding.case_id}` : ""}&representation=export`;
    box.append(download);
    return box;
  }
  function render() {
    const s = client.state;
    stage.replaceChildren();
    const intro = el(
      "p",
      "Turn a synthetic dispute export into explicitly reviewed Case evidence. Customer impact, ownership and population completeness may remain unknown.",
      "review-issue",
    );
    if (!s.discovery) stage.append(intro);
    heading.querySelector("h1").textContent = s.discovery
      ? "Invoice disputes / Workflow brief"
      : "Invoice disputes / Review received evidence";
    if (s.error || localError) {
      const notice = el("div", s.error ?? localError, "review-notice");
      notice.role = "alert";
      stage.append(notice);
    }
    if (s.pending) {
      const recovery = el("section", undefined, "review-card");
      recovery.append(
        el("h2", "Original submission needs recovery"),
        el(
          "p",
          "One intake, Discovery, pack or preparation-work command is shared across tabs. Recover these exact saved bytes and key; completion in another tab does not authorize a different submission.",
        ),
        button(
          "Recover original submission",
          act(() => client.retry()),
          true,
        ),
        detail("Exact saved retry command", s.pending),
      );
      stage.append(recovery);
    }
    if (s.confirmed && !s.discovery) {
      const r = s.confirmed.receipt,
        confirmed = el("section", undefined, "review-card intake-confirmed");
      confirmed.setAttribute("role", "status");
      confirmed.append(
        el(
          "h2",
          r
            ? s.confirmed.status === "committed" && !s.recovered
              ? "Material reviewed into Case"
              : "Original Case receipt recovered"
            : "Preparation retained — review still required",
        ),
      );
      if (r) {
        confirmed.append(
          el(
            "p",
            `${r.review_material.record.cells.customer_ref} / ${r.review_material.record.cells.invoice_id} · Case version ${r.case_version} · ${r.recorded_at}. Recorded by the synthetic intake operator. This historical receipt grants no current authority.`,
          ),
          detail("Retained commit receipt", r),
        );
      }
      stage.append(confirmed);
    }
    const refresh = button(
      "Refresh retained evidence",
      act(async () => {
        draft = null;
        await client.refresh();
      }),
    );
    refresh.disabled = s.busy;
    stage.append(refresh);
    if (
      s.workConfirmed &&
      (!s.discoveryTarget ||
        s.workConfirmed.entry.case_id !== s.discoveryTarget.case_id ||
        s.workConfirmed.entry.record_key !== s.discoveryTarget.record_key)
    ) {
      stage.append(
        el(
          "p",
          "A preparation-work receipt is confirmed for the original record. Current applicability has not been refreshed.",
          "review-notice",
        ),
        detail("Confirmed original work receipt", s.workConfirmed),
      );
    }
    if (s.discovery) stage.append(discoveryPanel(s));
    if (s.view) {
      const retained = el("details", undefined, "discovery-intake-details");
      retained.append(
        el("summary", "Intake records, Case preparation and original sources"),
      );
      if (s.discovery) stage.append(retained);
      const intakeStage = s.discovery ? retained : stage;
      const v = s.view,
        cover = v.bundle.coverage,
        coverage = el("section", undefined, "review-card");
      coverage.append(
        el(
          "h2",
          `${cover.valid_records} of ${cover.distinct_records} distinct records interpreted and eligible for review`,
        ),
        el(
          "p",
          `${cover.physical_records} physical rows · ${cover.duplicate_records} duplicate rows · ${cover.invalid_records} invalid records. ${v.coverage.committed_records} of ${cover.distinct_records} records have retained Case receipts; ${v.coverage.uncommitted_records} remain uncommitted.`,
        ),
        el(
          "p",
          `Population claim: ${cover.source_population_claim ?? "unknown"}; ${cover.source_coverage_claim} export. Completeness and active human effort are unmeasured.`,
        ),
        detail("Preparation, parser versions and four time meanings", v.bundle),
      );
      intakeStage.append(coverage);
      if (candidateIndex !== null) {
        const form = review(s);
        if (form) intakeStage.append(form);
      }
      const candidates = el("section", undefined, "review-card");
      candidates.append(el("h2", "Choose a candidate to review"));
      for (const [i, c] of v.candidates.entries()) {
        const card = el("div", undefined, "intake-candidate");
        card.append(
          el(
            "h3",
            `${c.record.cells.customer_ref || "Customer missing"} / ${c.record.cells.invoice_id || "Invoice missing"}`,
          ),
          el(
            "p",
            `${entity(c.record.entity)} · ${money(c.record.cells.amount_minor)} reported dispute · ${c.commits.length} recorded intake receipt(s)`,
          ),
          el(
            "p",
            c.targets.length > 1
              ? `${c.targets.length} possible targets: explicit choice required`
              : c.targets.length === 1
                ? `One ${human(c.targets[0].reason)} candidate; review still required`
                : "No committed match; a scoped coordination Case can be proposed",
          ),
        );
        for (const f of c.record.findings)
          card.append(el("p", `${f.field}: ${f.message}`, "review-notice"));
        const choose = button(
          "Review this candidate",
          () => {
            candidateIndex = i;
            draft = null;
            client.closeDiscovery();
            client.invalidate();
            render();
            stage
              .querySelector(".intake-review h2")
              ?.setAttribute("tabindex", "-1");
            stage.querySelector(".intake-review h2")?.focus();
          },
          true,
        );
        choose.disabled = !c.can_review || s.busy || !!s.pending;
        card.append(choose);
        const openBrief = button(
          "Open workflow brief",
          act(async () => {
            const receipt = c.commits
              .filter((r) => r.selection.bundle_id === v.bundle.id)
              .at(-1);
            await client.openDiscovery({
              bundle_id: v.bundle.id,
              record_key: c.record_key,
              case_id: receipt?.case_id ?? null,
            });
            discoveryDraft = null;
            render();
            discoveryFocus();
          }),
        );
        openBrief.disabled = !c.can_review || s.busy;
        card.append(openBrief);
        if (c.commits.length)
          card.append(
            detail("Earlier requests to create or attach evidence", c.commits),
          );
        candidates.append(card);
      }
      intakeStage.append(candidates);
      const evidence = el("section", undefined, "review-card");
      evidence.append(
        el("h2", "Retained sources"),
        el(
          "p",
          "Reported documents can support a reviewed association; their content cannot grant authority.",
        ),
      );
      for (const a of v.bundle.artifacts) evidence.append(source(a));
      intakeStage.append(evidence);
      const again = el("details");
      again.append(
        el("summary", "Prepare another export or repeat import"),
        newPreparation(s),
      );
      intakeStage.append(again);
    } else stage.append(newPreparation(s));
    if (s.list.length) {
      const history = el("section", undefined, "review-card");
      history.append(el("h2", "Reopen a preparation"));
      for (const b of s.list) {
        const open = button(
          `${b.name} · ${b.records} records · ${b.retained_at}`,
          act(async () => {
            candidateIndex = null;
            draft = null;
            await client.refresh(b.id);
          }),
        );
        open.disabled = s.busy;
        history.append(open);
      }
      const exportLink = el("a", "Download portable synthetic evidence export");
      exportLink.href = "/v1/intake/export";
      history.append(exportLink);
      stage.append(history);
    }
    stage.append(
      el(
        "p",
        "Synthetic operator seat; selecting files does not authenticate anyone. Real customer activation is unapproved. Imported amounts are disputed source claims, not credit authority or recovered revenue. Case closure and external actions remain blocked.",
        "review-muted",
      ),
    );
  }
  render();
  void client.load();
  return client;
}
