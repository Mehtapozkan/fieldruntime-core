import { createIntakeClient } from "./intake-client.js";
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
  function render() {
    const s = client.state;
    stage.replaceChildren();
    const intro = el(
      "p",
      "Turn a synthetic dispute export into explicitly reviewed Case evidence. Customer impact, ownership and population completeness may remain unknown.",
      "review-issue",
    );
    stage.append(intro);
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
          "No unconfirmed commit is treated as accepted. Retry the saved command to recover its original result.",
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
    if (s.confirmed) {
      const r = s.confirmed.receipt,
        confirmed = el("section", undefined, "review-card intake-confirmed");
      confirmed.setAttribute("role", "status");
      confirmed.append(
        el(
          "h2",
          r
            ? s.confirmed.status === "committed"
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
    if (s.view) {
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
      stage.append(coverage);
      if (candidateIndex !== null) {
        const form = review(s);
        if (form) stage.append(form);
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
        if (c.commits.length)
          card.append(
            detail("Earlier requests to create or attach evidence", c.commits),
          );
        candidates.append(card);
      }
      stage.append(candidates);
      const evidence = el("section", undefined, "review-card");
      evidence.append(
        el("h2", "Retained sources"),
        el(
          "p",
          "Reported documents can support a reviewed association; their content cannot grant authority.",
        ),
      );
      for (const a of v.bundle.artifacts) evidence.append(source(a));
      stage.append(evidence);
      const again = el("details");
      again.append(
        el("summary", "Prepare another export or repeat import"),
        newPreparation(s),
      );
      stage.append(again);
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
