import { createIntakeClient, packPath } from "./intake-client.js";
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
      published_for_preparation:
        "Published for preparation — worker not started",
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
          schema_version: "pack-selection-command.v1",
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
    box.append(shell, packPanel(s));
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
          "One intake, Discovery or pack command is shared across tabs. Recover these exact saved bytes and key; completion in another tab does not authorize a different submission.",
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
