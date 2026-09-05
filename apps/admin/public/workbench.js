export const WORKBENCH_STEPS = Object.freeze([
  Object.freeze({ id: "case", label: "Case" }),
  Object.freeze({ id: "decision", label: "Decision" }),
  Object.freeze({ id: "act", label: "Act & Verify" }),
  Object.freeze({ id: "receipt", label: "Receipt" }),
]);

export const EXPECTED_FIXTURE_ID = "case_acme_sso_001";
export const EXPECTED_WALKTHROUGH_ID = "walkthrough_acme_sso_001";
export const WORKBENCH_REQUEST_TIMEOUT_MS = 8_000;

export const WORKBENCH_EVENTS = Object.freeze({
  VIEW_DECISION: "VIEW_DECISION",
  REVEAL_AUTHORITY: "REVEAL_AUTHORITY",
  OPEN_ACT_VERIFY: "OPEN_ACT_VERIFY",
  START_SIMULATION: "START_SIMULATION",
  CONNECTOR_REPORTED_SUCCESS: "CONNECTOR_REPORTED_SUCCESS",
  INDEPENDENT_READBACK_MISMATCH: "INDEPENDENT_READBACK_MISMATCH",
  OPEN_RECOVERY: "OPEN_RECOVERY",
  OPEN_RECEIPT: "OPEN_RECEIPT",
  NAVIGATE: "NAVIGATE",
  RESET: "RESET",
});

const SIMULATION_STATES = new Set([
  "idle",
  "running",
  "connector_success",
  "verification_failed",
  "recovery_open",
]);

function freezeState(state) {
  return Object.freeze({ ...state });
}

export function createInitialWorkbenchState() {
  return freezeState({
    activeStep: "case",
    furthestStep: 0,
    authorityRevealed: false,
    simulationState: "idle",
  });
}

function stepIndex(stepId) {
  return WORKBENCH_STEPS.findIndex(({ id }) => id === stepId);
}

function validState(state) {
  return (
    state !== null &&
    typeof state === "object" &&
    stepIndex(state.activeStep) >= 0 &&
    Number.isInteger(state.furthestStep) &&
    state.furthestStep >= 0 &&
    state.furthestStep < WORKBENCH_STEPS.length &&
    typeof state.authorityRevealed === "boolean" &&
    SIMULATION_STATES.has(state.simulationState)
  );
}

export function reduceWorkbenchState(state, event) {
  if (!validState(state)) {
    throw new TypeError("Workbench state is invalid");
  }
  if (event === null || typeof event !== "object") {
    throw new TypeError("Workbench event is invalid");
  }

  switch (event.type) {
    case WORKBENCH_EVENTS.VIEW_DECISION:
      if (state.activeStep !== "case") return state;
      return freezeState({
        ...state,
        activeStep: "decision",
        furthestStep: Math.max(state.furthestStep, 1),
      });

    case WORKBENCH_EVENTS.REVEAL_AUTHORITY:
      if (state.activeStep !== "decision" || state.authorityRevealed) {
        return state;
      }
      return freezeState({ ...state, authorityRevealed: true });

    case WORKBENCH_EVENTS.OPEN_ACT_VERIFY:
      if (state.activeStep !== "decision" || !state.authorityRevealed) {
        return state;
      }
      return freezeState({
        ...state,
        activeStep: "act",
        furthestStep: Math.max(state.furthestStep, 2),
      });

    case WORKBENCH_EVENTS.START_SIMULATION:
      if (state.activeStep !== "act" || state.simulationState !== "idle") {
        return state;
      }
      return freezeState({ ...state, simulationState: "running" });

    case WORKBENCH_EVENTS.CONNECTOR_REPORTED_SUCCESS:
      if (state.activeStep !== "act" || state.simulationState !== "running") {
        return state;
      }
      return freezeState({
        ...state,
        simulationState: "connector_success",
      });

    case WORKBENCH_EVENTS.INDEPENDENT_READBACK_MISMATCH:
      if (
        state.activeStep !== "act" ||
        state.simulationState !== "connector_success"
      ) {
        return state;
      }
      return freezeState({
        ...state,
        simulationState: "verification_failed",
      });

    case WORKBENCH_EVENTS.OPEN_RECOVERY:
      if (
        state.activeStep !== "act" ||
        state.simulationState !== "verification_failed"
      ) {
        return state;
      }
      return freezeState({ ...state, simulationState: "recovery_open" });

    case WORKBENCH_EVENTS.OPEN_RECEIPT:
      if (
        state.activeStep !== "act" ||
        state.simulationState !== "recovery_open"
      ) {
        return state;
      }
      return freezeState({
        ...state,
        activeStep: "receipt",
        furthestStep: 3,
      });

    case WORKBENCH_EVENTS.NAVIGATE: {
      const requested = stepIndex(event.step);
      if (
        requested < 0 ||
        requested > state.furthestStep ||
        state.simulationState === "running" ||
        state.simulationState === "connector_success"
      ) {
        return state;
      }
      return freezeState({ ...state, activeStep: event.step });
    }

    case WORKBENCH_EVENTS.RESET:
      return createInitialWorkbenchState();

    default:
      return state;
  }
}

export function deriveWorkbenchView(state) {
  if (!validState(state)) {
    throw new TypeError("Workbench state is invalid");
  }

  const activeIndex = stepIndex(state.activeStep);
  const stages = WORKBENCH_STEPS.map((step, index) =>
    Object.freeze({
      ...step,
      index,
      current: index === activeIndex,
      complete: index < activeIndex || index < state.furthestStep,
      available: index <= state.furthestStep,
    }),
  );

  let primaryAction = null;
  if (state.activeStep === "case") {
    primaryAction = {
      event: WORKBENCH_EVENTS.VIEW_DECISION,
      label: "Preview decision",
    };
  } else if (state.activeStep === "decision") {
    primaryAction = state.authorityRevealed
      ? {
          event: WORKBENCH_EVENTS.OPEN_ACT_VERIFY,
          label: "Preview Act & Verify",
        }
      : {
          event: WORKBENCH_EVENTS.REVEAL_AUTHORITY,
          label: "Reveal authority route",
        };
  } else if (state.activeStep === "act") {
    if (state.simulationState === "idle") {
      primaryAction = {
        event: WORKBENCH_EVENTS.START_SIMULATION,
        label: "Run guided simulation",
      };
    } else if (state.simulationState === "verification_failed") {
      primaryAction = {
        event: WORKBENCH_EVENTS.OPEN_RECOVERY,
        label: "Reveal safe recovery",
      };
    } else if (state.simulationState === "recovery_open") {
      primaryAction = {
        event: WORKBENCH_EVENTS.OPEN_RECEIPT,
        label: "Preview reconstructable receipt",
      };
    }
  }

  return Object.freeze({
    activeIndex,
    stages: Object.freeze(stages),
    primaryAction: primaryAction === null ? null : Object.freeze(primaryAction),
    interactionCount:
      state.activeStep === "case"
        ? 0
        : state.activeStep === "decision"
          ? state.authorityRevealed
            ? 2
            : 1
          : state.activeStep === "act"
            ? state.simulationState === "idle"
              ? 3
              : state.simulationState === "recovery_open"
                ? 5
                : 4
            : 6,
  });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new WorkbenchDataError(`${path} must be a non-empty string`);
  }
  return value;
}

function requiredArray(value, path) {
  if (!Array.isArray(value)) {
    throw new WorkbenchDataError(`${path} must be an array`);
  }
  return value;
}

function optionalGuideText(guide, key, fallback) {
  const candidate = isObject(guide) ? guide[key] : undefined;
  return typeof candidate === "string" && candidate.length <= 240
    ? candidate
    : fallback;
}

export class WorkbenchDataError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkbenchDataError";
  }
}

export function buildWorkbenchModel(fixtureResponse, walkthroughResponse) {
  if (!isObject(fixtureResponse)) {
    throw new WorkbenchDataError("Fixture response must be an object");
  }
  if (
    fixtureResponse.authoritative !== false ||
    fixtureResponse.replayable !== false
  ) {
    throw new WorkbenchDataError(
      "Workbench requires an explicitly non-authoritative, non-replayable fixture",
    );
  }
  if (fixtureResponse.fixture_id !== EXPECTED_FIXTURE_ID) {
    throw new WorkbenchDataError(
      "Fixture identity does not match this walkthrough",
    );
  }

  const document = fixtureResponse.document;
  if (!isObject(document)) {
    throw new WorkbenchDataError("Fixture document must be an object");
  }

  const caseRecord = document.case;
  if (!isObject(caseRecord)) {
    throw new WorkbenchDataError("Fixture case must be an object");
  }
  const evidence = requiredArray(document.evidence, "fixture.evidence");
  const artifacts = requiredArray(document.artifacts, "fixture.artifacts");
  const packets = requiredArray(
    document.decision_packets,
    "fixture.decision_packets",
  );
  const proposals = requiredArray(
    document.action_proposals,
    "fixture.action_proposals",
  );
  const commitments = requiredArray(
    document.commitments,
    "fixture.commitments",
  );

  if (evidence.length < 4) {
    throw new WorkbenchDataError(
      "Fixture must contain at least four evidence sources",
    );
  }
  const packet = packets[0];
  if (!isObject(packet)) {
    throw new WorkbenchDataError("Fixture must contain a decision packet");
  }
  const conflict = artifacts.find(
    (artifact) => isObject(artifact) && artifact.type === "conflict",
  );
  if (!isObject(conflict) || !isObject(conflict.value)) {
    throw new WorkbenchDataError("Fixture must contain a structured conflict");
  }
  const customerUpdate = proposals.find(
    (proposal) =>
      isObject(proposal) && proposal.action_type === "customer_communication",
  );
  if (!isObject(customerUpdate) || !isObject(customerUpdate.payload)) {
    throw new WorkbenchDataError(
      "Fixture must contain a customer communication proposal",
    );
  }

  if (!isObject(walkthroughResponse)) {
    throw new WorkbenchDataError("Walkthrough response must be an object");
  }
  let guideDocument;
  if (isObject(walkthroughResponse)) {
    const walkthroughDocument = isObject(walkthroughResponse.document)
      ? walkthroughResponse.document
      : walkthroughResponse;
    const documentWalkthroughId = walkthroughDocument.walkthrough_id;
    const walkthroughId =
      typeof walkthroughResponse.walkthrough_id === "string"
        ? walkthroughResponse.walkthrough_id
        : typeof documentWalkthroughId === "string"
          ? documentWalkthroughId
          : typeof walkthroughDocument.id === "string"
            ? walkthroughDocument.id
            : undefined;
    if (
      walkthroughId !== EXPECTED_WALKTHROUGH_ID ||
      documentWalkthroughId !== EXPECTED_WALKTHROUGH_ID
    ) {
      throw new WorkbenchDataError(
        "Walkthrough identity does not match this workbench",
      );
    }
    if (isObject(walkthroughResponse.document)) {
      if (
        typeof walkthroughResponse.walkthrough_hash !== "string" ||
        !/^sha256:[a-f0-9]{64}$/.test(walkthroughResponse.walkthrough_hash)
      ) {
        throw new WorkbenchDataError("Walkthrough record hash is invalid");
      }
      if (
        walkthroughResponse.fixture_id !== EXPECTED_FIXTURE_ID ||
        walkthroughResponse.fixture_hash !== fixtureResponse.fixture_hash
      ) {
        throw new WorkbenchDataError(
          "Walkthrough record does not match the fixture identity and hash",
        );
      }
      if (
        walkthroughResponse.authoritative !== false ||
        walkthroughResponse.replayable !== false ||
        walkthroughResponse.production_receipt !== false
      ) {
        throw new WorkbenchDataError(
          "Walkthrough record must be non-authoritative, non-replayable, and not a production receipt",
        );
      }
    }
    const safety = walkthroughDocument.safety;
    if (
      !isObject(safety) ||
      safety.synthetic !== true ||
      safety.simulation !== true ||
      safety.authoritative !== false ||
      safety.replayable !== false ||
      safety.external_writes !== false ||
      safety.authority_effects !== false ||
      safety.production_receipt !== false
    ) {
      throw new WorkbenchDataError(
        "Walkthrough safety boundary is missing or unsafe",
      );
    }
    const sourceFixture = walkthroughDocument.source_fixture;
    if (
      !isObject(sourceFixture) ||
      sourceFixture.fixture_id !== EXPECTED_FIXTURE_ID ||
      sourceFixture.case_id !== EXPECTED_FIXTURE_ID ||
      sourceFixture.fixture_hash !== fixtureResponse.fixture_hash
    ) {
      throw new WorkbenchDataError(
        "Walkthrough source fixture binding does not match",
      );
    }
    guideDocument = walkthroughDocument;
  }
  const sourceOrder = [
    "fixture_slack",
    "fixture_linear",
    "fixture_crm",
    "fixture_policy_registry",
  ];
  const sortedEvidence = [...evidence].sort((left, right) => {
    const leftIndex = isObject(left) ? sourceOrder.indexOf(left.source) : -1;
    const rightIndex = isObject(right) ? sourceOrder.indexOf(right.source) : -1;
    return (
      (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex)
    );
  });

  const sources = sortedEvidence.slice(0, 4).map((item, index) => {
    if (!isObject(item)) {
      throw new WorkbenchDataError(
        `fixture.evidence[${index}] must be an object`,
      );
    }
    return Object.freeze({
      id: requiredString(item.id, `fixture.evidence[${index}].id`),
      source: requiredString(item.source, `fixture.evidence[${index}].source`),
      excerpt: requiredString(
        item.excerpt,
        `fixture.evidence[${index}].excerpt`,
      ),
      authorityRank: item.authority_rank,
      freshness: requiredString(
        item.freshness_status,
        `fixture.evidence[${index}].freshness_status`,
      ),
      provenance: requiredString(
        item.provenance_label,
        `fixture.evidence[${index}].provenance_label`,
      ),
      version: requiredString(
        item.version,
        `fixture.evidence[${index}].version`,
      ),
      retrievedAt:
        typeof item.retrieved_at === "string" ? item.retrieved_at : null,
    });
  });

  const options = proposals.map((item, index) => {
    if (!isObject(item) || !isObject(item.payload)) {
      throw new WorkbenchDataError(
        `fixture.action_proposals[${index}] must contain a payload`,
      );
    }
    return Object.freeze({
      id: requiredString(item.id, `fixture.action_proposals[${index}].id`),
      type: requiredString(
        item.action_type,
        `fixture.action_proposals[${index}].action_type`,
      ),
      target: requiredString(
        item.target,
        `fixture.action_proposals[${index}].target`,
      ),
      payload: Object.freeze({ ...item.payload }),
      payloadHash: requiredString(
        item.payload_hash,
        `fixture.action_proposals[${index}].payload_hash`,
      ),
      risk: requiredString(
        item.risk_level,
        `fixture.action_proposals[${index}].risk_level`,
      ),
      approvals: Object.freeze([
        ...requiredArray(item.required_approval_roles, "required approvals"),
      ]),
      idempotencyKey: requiredString(
        item.idempotency_key,
        `fixture.action_proposals[${index}].idempotency_key`,
      ),
    });
  });

  let guideCase;
  let guideDecision;
  let guideAct;
  let guideReceipt;
  let guideFailure;
  let guideRecovery;
  if (guideDocument !== undefined) {
    const stages = guideDocument.stages;
    if (!isObject(stages)) {
      throw new WorkbenchDataError("Walkthrough stages must be an object");
    }
    guideCase = stages.case;
    guideDecision = stages.decision;
    guideAct = stages.act_verify;
    guideReceipt = stages.receipt_preview;
    if (
      !isObject(guideCase) ||
      !isObject(guideDecision) ||
      !isObject(guideAct) ||
      !isObject(guideReceipt)
    ) {
      throw new WorkbenchDataError("Walkthrough is missing a required stage");
    }
    const guideOptions = requiredArray(
      guideDecision.options,
      "walkthrough.stages.decision.options",
    );
    if (guideOptions.length !== options.length) {
      throw new WorkbenchDataError("Walkthrough option count does not match");
    }
    for (const option of guideOptions) {
      if (!isObject(option)) {
        throw new WorkbenchDataError("Walkthrough option must be an object");
      }
      const sourceAction = options.find(({ id }) => id === option.action_id);
      if (
        sourceAction === undefined ||
        sourceAction.payloadHash !== option.payload_hash
      ) {
        throw new WorkbenchDataError(
          "Walkthrough option is not bound to its source action",
        );
      }
    }
    const selected = guideAct.selected_action;
    if (
      !isObject(selected) ||
      selected.action_id !== customerUpdate.id ||
      selected.payload_hash !== customerUpdate.payload_hash ||
      selected.idempotency_key !== customerUpdate.idempotency_key
    ) {
      throw new WorkbenchDataError(
        "Walkthrough selected action binding does not match",
      );
    }
    const attempts = requiredArray(
      guideAct.attempts,
      "walkthrough.stages.act_verify.attempts",
    );
    guideFailure = attempts[0];
    guideRecovery = attempts[1];
    if (!isObject(guideFailure) || !isObject(guideRecovery)) {
      throw new WorkbenchDataError(
        "Walkthrough must contain failure and recovery attempts",
      );
    }
    const failureReadback = guideFailure.independent_readback;
    const recoveryReadback = guideRecovery.independent_readback;
    if (
      !isObject(failureReadback) ||
      failureReadback.result !== "mismatch" ||
      !isObject(recoveryReadback) ||
      recoveryReadback.result !== "match" ||
      guideAct.external_effect_count !== 0 ||
      guideAct.production_receipt_emitted !== false
    ) {
      throw new WorkbenchDataError(
        "Walkthrough verification or external-effect boundary is invalid",
      );
    }
  }

  const guideTrace = requiredArray(
    isObject(guideReceipt) ? guideReceipt.trace : undefined,
    "walkthrough.stages.receipt_preview.trace",
  );
  const correctionPreview = isObject(guideReceipt?.correction_preview)
    ? guideReceipt.correction_preview
    : undefined;
  const expectedTrace = [
    ["evidence", conflict.id],
    ["recommendation", packet.id],
    ["authority", customerUpdate.id],
    ["payload", customerUpdate.id],
    ["connector_response", guideFailure?.attempt_id],
    ["independent_verification", guideFailure?.attempt_id],
    ["effect_rejection", guideFailure?.attempt_id],
    ["accepted_simulated_result", guideRecovery?.attempt_id],
    ["correction", correctionPreview?.correction_id],
  ];
  if (guideTrace.length !== expectedTrace.length) {
    throw new WorkbenchDataError(
      "Walkthrough must contain the exact nine-step receipt trace",
    );
  }
  for (const [index, entry] of guideTrace.entries()) {
    const expected = expectedTrace[index];
    if (
      !isObject(entry) ||
      expected === undefined ||
      entry.kind !== expected[0] ||
      entry.ref_id !== expected[1]
    ) {
      throw new WorkbenchDataError(
        `Walkthrough receipt trace ${String(index)} is not bound to its source`,
      );
    }
  }

  return Object.freeze({
    fixtureId: requiredString(fixtureResponse.fixture_id, "fixture_id"),
    fixtureHash: requiredString(fixtureResponse.fixture_hash, "fixture_hash"),
    case: Object.freeze({
      id: requiredString(caseRecord.id, "fixture.case.id"),
      customer: "Acme Aero",
      issue: "SSO rollout blocked",
      state: requiredString(caseRecord.state, "fixture.case.state"),
      severity: requiredString(caseRecord.severity, "fixture.case.severity"),
      owner: requiredString(
        caseRecord.owner_identity_id,
        "fixture.case.owner_identity_id",
      ),
      dueAt: requiredString(caseRecord.due_at, "fixture.case.due_at"),
      version: caseRecord.version,
    }),
    sources: Object.freeze(sources),
    conflict: Object.freeze({
      claim: requiredString(conflict.value.claim, "conflict.value.claim"),
      sourceState: requiredString(
        conflict.value.source_state,
        "conflict.value.source_state",
      ),
    }),
    decision: Object.freeze({
      summary: requiredString(packet.summary, "decision_packet.summary"),
      recommendation: requiredString(
        packet.recommendation,
        "decision_packet.recommendation",
      ),
      requiredAuthority: Object.freeze([
        ...requiredArray(packet.required_authority, "required_authority"),
      ]),
    }),
    options: Object.freeze(options),
    selectedActionId: customerUpdate.id,
    commitment:
      commitments.length > 0 && isObject(commitments[0])
        ? Object.freeze({ ...commitments[0] })
        : null,
    guide: Object.freeze({
      eyebrow: optionalGuideText(
        guideDocument,
        "eyebrow",
        "Strategic customer escalation",
      ),
      caseTitle: optionalGuideText(
        guideCase,
        "title",
        "One case. Four sources. One contradiction.",
      ),
      caseNarrative: optionalGuideText(
        guideCase,
        "narrative",
        "Four sources converge around one customer commitment. Provenance, freshness, and authority remain visible.",
      ),
      decisionTitle: optionalGuideText(
        guideDecision,
        "title",
        "The recommendation is easy. Authority is the work.",
      ),
      actTitle: optionalGuideText(
        guideAct,
        "title",
        "A success response is not a verified result.",
      ),
      receiptTitle: optionalGuideText(
        guideReceipt,
        "title",
        "The whole decision can be reconstructed — as a preview, not a production receipt.",
      ),
      verificationMessage:
        "Independent read-back found no customer update, so the simulated effect was rejected. A connector acknowledgement cannot prove that the exact customer record changed.",
      recoveryMessage:
        "Independent read-back now matches the bounded customer update. The same payload and prior attempt lineage remain bound. The effect is accepted in simulation only; deployment remains unverified and the authoritative case remains unchanged.",
      receiptTrace: Object.freeze(
        guideTrace.map((entry) =>
          Object.freeze({
            kind: requiredString(entry.kind, "receipt trace kind"),
            label: requiredString(entry.label, "receipt trace label"),
          }),
        ),
      ),
      correctionStatement:
        isObject(guideReceipt?.correction_preview) &&
        typeof guideReceipt.correction_preview.statement === "string"
          ? guideReceipt.correction_preview.statement
          : "Require independent read-back before accepting an adapter result.",
      learningTitle:
        isObject(guideReceipt?.learning_candidate_preview) &&
        typeof guideReceipt.learning_candidate_preview.title === "string"
          ? guideReceipt.learning_candidate_preview.title
          : "Add silent connector success to held-out evaluations.",
      recoveryObservedMessage:
        isObject(guideRecovery?.independent_readback) &&
        isObject(guideRecovery.independent_readback.observed_value) &&
        typeof guideRecovery.independent_readback.observed_value.message ===
          "string"
          ? guideRecovery.independent_readback.observed_value.message
          : "Deployment is still being verified.",
    }),
  });
}

const FIXTURE_ENDPOINT = "/v0/evaluation-fixtures/ecc/case_acme_sso_001";
const WALKTHROUGH_ENDPOINT =
  "/v0/evaluation-walkthroughs/ecc/walkthrough_acme_sso_001";

const SOURCE_PRESENTATION = Object.freeze({
  fixture_slack: Object.freeze({
    name: "Slack",
    glyph: "SL",
    className: "slack",
  }),
  fixture_linear: Object.freeze({
    name: "Linear",
    glyph: "LN",
    className: "linear",
  }),
  fixture_crm: Object.freeze({ name: "CRM", glyph: "CR", className: "crm" }),
  fixture_policy_registry: Object.freeze({
    name: "Policy registry",
    glyph: "PL",
    className: "policy",
  }),
});

const STAGE_DESCRIPTIONS = Object.freeze({
  case: "4 sources",
  decision: "3 options",
  act: "simulated",
  receipt: "reconstructable",
});

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.id) node.id = options.id;
  if (options.type) node.type = options.type;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value !== undefined && value !== null) {
        node.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
}

function titleCase(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanIdentity(value) {
  const known = {
    user_jane: "Jane · Case owner",
    user_sam: "Sam · Engineering",
  };
  return known[value] ?? titleCase(value.replace(/^user_/, ""));
}

function formattedDueAt(value) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
      timeZoneName: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function shortHash(value) {
  if (typeof value !== "string" || value.length < 24) return String(value);
  return `${value.slice(0, 17)}…${value.slice(-8)}`;
}

export function optionPresentation(action) {
  if (action.type === "independent_readback") {
    return {
      order: "01 · First",
      title: "Verify deployment",
      description:
        "Read current engineering state before any customer claim is allowed forward.",
      recommended: true,
    };
  }
  if (action.type === "customer_communication") {
    return {
      order: "02 · Then",
      title: "Prepare customer update",
      description: `Preview an evidence-linked message. ${action.approvals.join(" + ")} must authorize the exact payload.`,
      recommended: false,
    };
  }
  if (action.type !== "financial_remedy") {
    throw new WorkbenchDataError("Decision option type is unavailable");
  }
  const amount = action.payload?.amount;
  const currency = action.payload?.currency;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    throw new WorkbenchDataError("Financial remedy payload is invalid");
  }
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
  return {
    order: "03 · Exception",
    title: `Offer ${formattedAmount} credit`,
    description:
      "A material commercial commitment crosses delegated authority limits.",
    recommended: false,
  };
}

function actionForModel(model) {
  const action = model.options.find(({ id }) => id === model.selectedActionId);
  if (!action) throw new WorkbenchDataError("Selected action is unavailable");
  return action;
}

export function authorityExceptionForModel(model) {
  const action = model.options.find(({ type }) => type === "financial_remedy");
  if (action === undefined || action.approvals.length < 2) {
    throw new WorkbenchDataError("Financial authority route is unavailable");
  }
  return action;
}

function stageIntro(kicker, heading, description, headingId) {
  const headingGroup = element("div", {}, [
    element("span", { className: "stage-kicker", text: kicker }),
    element("h2", { text: heading, attrs: { id: headingId } }),
  ]);
  return element("div", { className: "stage-intro" }, [
    headingGroup,
    element("p", { text: description }),
  ]);
}

function primaryAction(view, hint) {
  if (view.primaryAction === null) return null;
  const button = element("button", {
    className: "button button--primary",
    text: view.primaryAction.label,
    type: "button",
    attrs: { "data-workbench-event": view.primaryAction.event },
  });
  return element("div", { className: "stage-action" }, [
    element("span", { className: "stage-action__hint", text: hint }),
    button,
  ]);
}

function sourceCard(source) {
  const presentation = SOURCE_PRESENTATION[source.source] ?? {
    name: titleCase(source.source),
    glyph: "SO",
    className: "crm",
  };
  const conflictSource = ["fixture_slack", "fixture_linear"].includes(
    source.source,
  );
  const authority =
    source.authorityRank === 1
      ? "Rank 1 · authoritative"
      : `Rank ${String(source.authorityRank)} · source claim`;
  return element(
    "article",
    {
      className: `source-card${conflictSource ? " source-card--conflict" : ""}`,
      attrs: { "aria-label": `${presentation.name} evidence` },
    },
    [
      element("div", { className: "source-card__top" }, [
        element("span", { className: "source-name" }, [
          element("i", {
            className: `source-glyph source-glyph--${presentation.className}`,
            text: presentation.glyph,
            attrs: { "aria-hidden": "true" },
          }),
          element("span", { text: presentation.name }),
        ]),
        element("span", {
          className: `micro-pill${source.freshness === "live" ? " micro-pill--safe" : ""}`,
          text: source.freshness,
        }),
      ]),
      element("blockquote", { text: `“${source.excerpt}”` }),
      element("div", { className: "source-card__meta" }, [
        element("span", { text: authority }),
        element("span", { text: titleCase(source.provenance) }),
      ]),
    ],
  );
}

function renderCaseStage(model, view) {
  const policySource = model.sources.find(
    ({ source }) => source === "fixture_policy_registry",
  );
  if (policySource === undefined) {
    throw new WorkbenchDataError("Policy evidence is unavailable");
  }
  const sourceField = element(
    "div",
    {
      className: "source-field",
      attrs: { "aria-label": "Converged evidence" },
    },
    model.sources.map(sourceCard),
  );
  const conflict = element("aside", { className: "conflict-card" }, [
    element("span", {
      className: "conflict-card__flag",
      text: "Conflict detected",
    }),
    element("h3", { text: "One case. Two incompatible truths." }),
    element("p", {
      text: "Field Runtime does not average the sources or let a model choose. The higher-authority live record blocks the claim.",
    }),
    element("div", { className: "conflict-compare" }, [
      element("div", { className: "conflict-compare__row" }, [
        element("small", { text: "Slack says" }),
        element("b", { text: model.conflict.claim }),
      ]),
      element("div", { className: "conflict-compare__row" }, [
        element("small", { text: "Linear says" }),
        element("b", { text: model.conflict.sourceState }),
      ]),
    ]),
  ]);
  return element(
    "section",
    { attrs: { "aria-labelledby": "case-stage-heading" } },
    [
      stageIntro(
        "Stage 1 · Case",
        model.guide.caseTitle,
        model.guide.caseNarrative,
        "case-stage-heading",
      ),
      element("div", { className: "source-layout" }, [sourceField, conflict]),
      element("div", { className: "insight-bar" }, [
        element("p", {}, [
          element("b", { text: "Closure is already constrained. " }),
          document.createTextNode(
            "No customer claim can pass while live engineering state contradicts it.",
          ),
        ]),
        element("span", {
          className: "micro-pill",
          text: `Policy ${policySource.version} ${policySource.freshness}`,
        }),
      ]),
      primaryAction(view, "1 of 6 · no typing required"),
    ],
  );
}

function decisionOption(action) {
  const presentation = optionPresentation(action);
  const approvalLabels =
    action.approvals.length === 0
      ? ["No approval · read only"]
      : action.approvals;
  return element(
    "article",
    {
      className: `decision-option${presentation.recommended ? " decision-option--recommended" : ""}`,
    },
    [
      element("div", { className: "decision-option__tag" }, [
        element("span", { text: presentation.order }),
        element("span", { text: `${action.risk} risk` }),
      ]),
      element("h3", { text: presentation.title }),
      element("p", { text: presentation.description }),
      element(
        "div",
        { className: "decision-option__authority" },
        approvalLabels.map((approval) =>
          element("span", {
            className: `micro-pill${action.approvals.length === 0 ? " micro-pill--safe" : action.risk === "critical" ? " micro-pill--critical" : ""}`,
            text: approval,
          }),
        ),
      ),
    ],
  );
}

function authorityPanel(model) {
  const selectedAction = actionForModel(model);
  const authorityException = authorityExceptionForModel(model);
  const nodes = [
    [
      "Prepared",
      humanIdentity(model.case.owner),
      "Evidence-linked proposal ready",
    ],
    [
      "Waiting",
      selectedAction.approvals.join(" + "),
      "Exact customer message · approval not recorded",
    ],
    [
      "Blocked",
      authorityException.approvals.join(" + "),
      `${optionPresentation(authorityException).title} requires every listed role`,
    ],
    [
      "Gate",
      "Field Runtime",
      "Not eligible until the exact required role passes",
    ],
  ];
  return element("section", { className: "authority-panel" }, [
    element("div", { className: "authority-panel__head" }, [
      element("h3", {
        text: "Authority follows the consequence — not the model.",
      }),
      element("p", {
        text: "This guided view reveals who would be required. It does not record an approval or grant authority.",
      }),
    ]),
    element(
      "div",
      {
        className: "authority-route",
        attrs: { "aria-label": "Authority route" },
      },
      nodes.map(([label, name, detail], index) =>
        element(
          "div",
          {
            className: `authority-node${index === 3 ? " authority-node--gate" : ""}`,
          },
          [
            element("small", { text: label }),
            element("b", { text: name }),
            element("span", { text: detail }),
          ],
        ),
      ),
    ),
  ]);
}

function renderDecisionStage(model, state, view) {
  const recommendation = element("div", { className: "recommendation-card" }, [
    element("div", {}, [
      element("small", { text: "Evidence-linked recommendation" }),
      element("p", { text: model.decision.recommendation }),
    ]),
    element("span", {
      className: "micro-pill micro-pill--safe",
      text: "Proposal only",
    }),
  ]);
  const children = [
    stageIntro(
      "Stage 2 · Decision",
      model.guide.decisionTitle,
      "The model may prepare options. Policy and named people determine which consequences could proceed.",
      "decision-stage-heading",
    ),
    recommendation,
    element(
      "div",
      {
        className: "decision-grid",
        attrs: { "aria-label": "Decision options" },
      },
      model.options.map(decisionOption),
    ),
  ];
  if (state.authorityRevealed) children.push(authorityPanel(model));
  children.push(
    primaryAction(
      view,
      state.authorityRevealed
        ? "3 of 6 · continue without granting approval"
        : "2 of 6 · preview only",
    ),
  );
  return element(
    "section",
    { attrs: { "aria-labelledby": "decision-stage-heading" } },
    children,
  );
}

function simulationRank(simulationState) {
  return {
    idle: 0,
    running: 1,
    connector_success: 2,
    verification_failed: 3,
    recovery_open: 4,
  }[simulationState];
}

function simulationStep(number, title, detail, visualState, stateLabel) {
  return element(
    "div",
    { className: `simulation-step ${visualState}`.trim() },
    [
      element("span", {
        className: "simulation-step__icon",
        text:
          visualState === "is-success"
            ? "✓"
            : visualState === "is-failed"
              ? "!"
              : number,
        attrs: { "aria-hidden": "true" },
      }),
      element("div", {}, [
        element("b", { text: title }),
        element("p", { text: detail }),
      ]),
      element("span", {
        className: "simulation-step__state",
        text: stateLabel,
      }),
    ],
  );
}

function payloadCard(action) {
  return element("article", { className: "payload-card" }, [
    element("div", { className: "payload-card__head" }, [
      element("h3", { text: "Exact payload preview" }),
      element("span", { text: "Synthetic · read only" }),
    ]),
    element("div", { className: "payload-target", text: action.target }),
    element("pre", {
      className: "payload-code",
      text: JSON.stringify(action.payload, null, 2),
    }),
    element("div", { className: "payload-binding" }, [
      element("span", {}, [
        element("small", { text: "Payload hash" }),
        element("b", {
          text: shortHash(action.payloadHash),
          attrs: { title: action.payloadHash },
        }),
      ]),
      element("span", {}, [
        element("small", { text: "Idempotency" }),
        element("b", {
          text: action.idempotencyKey,
          attrs: { title: action.idempotencyKey },
        }),
      ]),
    ]),
  ]);
}

function simulationCard(model, state) {
  const rank = simulationRank(state.simulationState);
  const connectorVisual =
    rank === 1 ? "is-running" : rank >= 2 ? "is-success" : "";
  const connectorLabel =
    rank === 1 ? "running" : rank >= 2 ? "200 success" : "waiting";
  const verifierVisual =
    rank === 2 ? "is-running" : rank >= 3 ? "is-failed" : "";
  const verifierLabel =
    rank === 2 ? "reading back" : rank >= 3 ? "mismatch" : "waiting";
  const gateVisual = rank >= 3 ? "is-success" : "";
  const gateLabel = rank >= 3 ? "effect rejected" : "waiting";
  const body = element("div", { className: "simulation-card__body" }, [
    element("div", { className: "simulation-timeline" }, [
      simulationStep(
        "1",
        "Payload bound",
        "Target, body, declared payload hash, and idempotency key stay fixed.",
        rank >= 1 ? "is-success" : "",
        rank >= 1 ? "ready" : "waiting",
      ),
      simulationStep(
        "2",
        "Fixture connector",
        "Returns an apparently successful response to the simulated write.",
        connectorVisual,
        connectorLabel,
      ),
      simulationStep(
        "3",
        "Independent read-back",
        "A separately identified verifier checks current source state.",
        verifierVisual,
        verifierLabel,
      ),
      simulationStep(
        "4",
        "Effect acceptance gate",
        "A connector response cannot prove that the exact customer record changed.",
        gateVisual,
        gateLabel,
      ),
    ]),
  ]);
  return element("article", { className: "simulation-card" }, [
    element("div", { className: "simulation-card__head" }, [
      element("h3", { text: "Action / verification separation" }),
      element("span", { text: "Deterministic fixture" }),
    ]),
    body,
  ]);
}

function verificationStop(model) {
  return element("section", { className: "verification-stop" }, [
    element("span", {
      className: "verification-stop__mark",
      text: "!",
      attrs: { "aria-hidden": "true" },
    }),
    element("div", {}, [
      element("h3", {
        text: "Connector said success. The customer record did not change.",
      }),
      element("p", { text: model.guide.verificationMessage }),
    ]),
    element("span", {
      className: "verification-stop__state",
      text: "Effect rejected · case open",
    }),
  ]);
}

function recoveryPanel(model) {
  return element("section", { className: "recovery-panel" }, [
    element("div", { className: "recovery-panel__head" }, [
      element("div", {}, [
        element("h3", { text: "Exact effect verified after a safe retry" }),
        element("p", { text: model.guide.recoveryMessage }),
      ]),
      element("span", {
        className: "micro-pill micro-pill--safe",
        text: "Accepted in simulation only",
      }),
    ]),
    element("div", { className: "recovery-steps" }, [
      element("span", {}, [
        element("b", { text: "01" }),
        document.createTextNode("Retry same simulated effect identity"),
      ]),
      element("span", {}, [
        element("b", { text: "02" }),
        document.createTextNode("Preserve the prior attempt lineage"),
      ]),
      element("span", {}, [
        element("b", { text: "03" }),
        document.createTextNode(
          `Independent read-back matches: “${model.guide.recoveryObservedMessage}”`,
        ),
      ]),
    ]),
    element("p", {
      className: "recovery-panel__boundary",
      text: "Authoritative case state is unchanged: needs review. No approval, external effect, production receipt, or case transition was created.",
    }),
  ]);
}

function renderActStage(model, state, view) {
  const action = actionForModel(model);
  const children = [
    stageIntro(
      "Stage 3 · Act & Verify",
      model.guide.actTitle,
      "This simulation isolates the bounded customer-update effect; it does not claim deployment was verified or close the Acme case.",
      "act-stage-heading",
    ),
    element("div", { className: "payload-layout" }, [
      payloadCard(action),
      simulationCard(model, state),
    ]),
  ];
  const rank = simulationRank(state.simulationState);
  if (rank >= 3) children.push(verificationStop(model));
  if (state.simulationState === "recovery_open") {
    children.push(recoveryPanel(model));
  }
  const actionArea = primaryAction(
    view,
    state.simulationState === "idle"
      ? "4 of 6 · no external request will be made"
      : state.simulationState === "verification_failed"
        ? "5 of 6 · reveal the bounded recovery"
        : "6 of 6 · inspect the simulation evidence",
  );
  if (actionArea) children.push(actionArea);
  return element(
    "section",
    { attrs: { "aria-labelledby": "act-stage-heading" } },
    children,
  );
}

function receiptNode(index, label, title, detail, stop = false) {
  return element(
    "article",
    { className: `receipt-node${stop ? " receipt-node--stop" : ""}` },
    [
      element("small", {
        text: `${String(index).padStart(2, "0")} · ${label}`,
      }),
      element("h4", { text: title }),
      element("p", { text: detail }),
    ],
  );
}

function receiptDetail(model, action, kind) {
  if (kind === "evidence") {
    return `“${model.conflict.claim}” conflicts with “${model.conflict.sourceState}.”`;
  }
  if (kind === "recommendation") return model.decision.recommendation;
  if (kind === "authority") {
    return `The exact customer-message effect requires ${action.approvals.join(" + ")}.`;
  }
  if (kind === "payload") {
    return `Declared payload ${shortHash(action.payloadHash)} and idempotency key ${action.idempotencyKey} stayed fixed across both simulated attempts.`;
  }
  if (kind === "connector_response") {
    return "The simulated connector reported success.";
  }
  if (kind === "independent_verification") {
    return "An independently identified fixture verifier read back no customer update.";
  }
  if (kind === "effect_rejection") return model.guide.verificationMessage;
  if (kind === "accepted_simulated_result") {
    return model.guide.recoveryMessage;
  }
  if (kind === "correction") return model.guide.correctionStatement;
  throw new WorkbenchDataError("Receipt trace kind is unavailable");
}

function renderReceiptStage(model) {
  const action = actionForModel(model);
  const chain = model.guide.receiptTrace;
  return element(
    "section",
    { attrs: { "aria-labelledby": "receipt-stage-heading" } },
    [
      stageIntro(
        "Stage 4 · Receipt",
        model.guide.receiptTitle,
        "See what happened, why the result was rejected, and which safe move survived — then inspect the complete trace.",
        "receipt-stage-heading",
      ),
      element("div", { className: "receipt-hero" }, [
        element("div", {}, [
          element("h3", {
            text: "Field Runtime caught the gap between ‘sent’ and done.",
          }),
          element("p", {
            text: "The connector returned success. Independent read-back found no customer update, so Field Runtime rejected the effect, kept the Acme case in needs review, and preserved a safe retry with the same payload and attempt lineage.",
          }),
        ]),
        element("div", {
          className: "receipt-hero__seal",
          text: "Simulation\ntrace",
        }),
      ]),
      element(
        "div",
        {
          className: "receipt-chain",
          attrs: { "aria-label": "Reconstructable receipt chain" },
        },
        chain.map((entry, index) =>
          receiptNode(
            index + 1,
            titleCase(entry.kind),
            entry.kind === "effect_rejection"
              ? "Effect rejected"
              : entry.kind === "accepted_simulated_result"
                ? "Recovery matched"
                : titleCase(entry.kind),
            receiptDetail(model, action, entry.kind),
            ["independent_verification", "effect_rejection"].includes(
              entry.kind,
            ),
          ),
        ),
      ),
      element("section", { className: "learning-preview" }, [
        element("div", {}, [
          element("small", { text: "Correction preview · append only" }),
          element("p", { text: model.guide.correctionStatement }),
        ]),
        element("div", {}, [
          element("small", { text: "Learning candidate · not promoted" }),
          element("p", { text: model.guide.learningTitle }),
        ]),
      ]),
      element("div", { className: "receipt-footer" }, [
        element("div", { className: "effect-accepted" }, [
          element("small", { text: "Simulated effect" }),
          element("b", { text: "ACCEPTED · after verified retry" }),
        ]),
        element("div", { className: "case-held" }, [
          element("small", { text: "Authoritative case" }),
          element("b", { text: "UNCHANGED · needs review" }),
        ]),
        element(
          "details",
          { className: "receipt-proof receipt-proof--details" },
          [
            element("summary", { text: "Technical integrity details" }),
            element("code", {
              text: model.fixtureHash,
              attrs: { title: model.fixtureHash },
            }),
          ],
        ),
      ]),
      element("div", { className: "stage-action" }, [
        element("span", {
          className: "stage-action__hint",
          text: "6 guided actions · 0 external writes · 0 approvals recorded",
        }),
        element("button", {
          className: "button button--quiet",
          text: "Restart guided simulation",
          type: "button",
          attrs: { "data-workbench-event": WORKBENCH_EVENTS.RESET },
        }),
      ]),
    ],
  );
}

function renderStage(model, state, view) {
  if (state.activeStep === "case") return renderCaseStage(model, view);
  if (state.activeStep === "decision") {
    return renderDecisionStage(model, state, view);
  }
  if (state.activeStep === "act") return renderActStage(model, state, view);
  return renderReceiptStage(model);
}

export async function fetchJson(
  endpoint,
  timeoutMs = WORKBENCH_REQUEST_TIMEOUT_MS,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("Workbench request timeout must be a positive integer");
  }
  const controller = new globalThis.AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new WorkbenchDataError(
        `The local evaluation API returned ${String(response.status)}`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new WorkbenchDataError("The local API did not return JSON");
    }
    try {
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new WorkbenchDataError(
          "The local evaluation API did not respond in time",
        );
      }
      throw new WorkbenchDataError("The local API returned malformed JSON", {
        cause: error,
      });
    }
  } catch (error) {
    if (error instanceof WorkbenchDataError) throw error;
    if (controller.signal.aborted) {
      throw new WorkbenchDataError(
        "The local evaluation API did not respond in time",
      );
    }
    throw new WorkbenchDataError(
      "The local evaluation API could not be reached",
      { cause: error },
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function bootstrapBrowserWorkbench() {
  document.querySelector("#experience-mode").textContent =
    "Legacy simulation · no recorded reviews";
  const nodes = {
    loading: document.querySelector("#loading-state"),
    error: document.querySelector("#error-state"),
    errorMessage: document.querySelector("#error-message"),
    retry: document.querySelector("#retry-button"),
    content: document.querySelector("#workbench-content"),
    stage: document.querySelector("#stage-content"),
    navigation: document.querySelector("#stage-navigation"),
    counter: document.querySelector("#interaction-counter"),
    announcement: document.querySelector("#announcement"),
    eyebrow: document.querySelector("#case-eyebrow"),
    heading: document.querySelector("#case-heading"),
    severity: document.querySelector("#severity-pill"),
    caseState: document.querySelector("#state-pill"),
    caseId: document.querySelector("#case-id"),
    owner: document.querySelector("#case-owner"),
    due: document.querySelector("#case-due"),
  };

  if (Object.values(nodes).some((node) => node === null)) return;

  let model;
  let state = createInitialWorkbenchState();
  let simulationToken = 0;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  function announce(message) {
    nodes.announcement.textContent = "";
    window.setTimeout(() => {
      nodes.announcement.textContent = message;
    }, 20);
  }

  function renderNavigation(view) {
    const list = element("div", { className: "stage-list" });
    for (const stage of view.stages) {
      const transient = ["running", "connector_success"].includes(
        state.simulationState,
      );
      const button = element(
        "button",
        {
          className: `stage-button${stage.complete ? " is-complete" : ""}`,
          type: "button",
          attrs: {
            "data-stage": stage.id,
            ...(stage.current ? { "aria-current": "step" } : {}),
            ...(stage.available && !transient ? {} : { disabled: "" }),
            "aria-label": `${stage.label}, ${STAGE_DESCRIPTIONS[stage.id]}${stage.current ? ", current stage" : ""}`,
          },
        },
        [
          element("span", {
            className: "stage-button__index",
            text: stage.complete
              ? "✓"
              : String(stage.index + 1).padStart(2, "0"),
            attrs: { "aria-hidden": "true" },
          }),
          element("span", { className: "stage-button__copy" }, [
            element("b", { text: stage.label }),
            element("small", { text: STAGE_DESCRIPTIONS[stage.id] }),
          ]),
        ],
      );
      list.append(button);
    }
    nodes.navigation.replaceChildren(list);
  }

  function render({ focusStage = false } = {}) {
    if (!model) return;
    const view = deriveWorkbenchView(state);
    renderNavigation(view);
    nodes.counter.textContent = `${String(view.interactionCount)} of 6 guided actions`;
    nodes.stage.replaceChildren(renderStage(model, state, view));
    if (focusStage) nodes.stage.focus({ preventScroll: true });
  }

  function dispatch(event, { focusStage = true } = {}) {
    const previousState = state;
    state = reduceWorkbenchState(state, event);
    if (state === previousState) return;
    render({ focusStage });
    if (event.type === WORKBENCH_EVENTS.VIEW_DECISION) {
      announce("Decision stage opened. Three options are ready for review.");
    } else if (event.type === WORKBENCH_EVENTS.REVEAL_AUTHORITY) {
      announce("Authority route revealed. This does not record an approval.");
    } else if (event.type === WORKBENCH_EVENTS.OPEN_ACT_VERIFY) {
      announce("Act and Verify stage opened. External writes remain off.");
    } else if (event.type === WORKBENCH_EVENTS.OPEN_RECOVERY) {
      announce("Safe recovery path revealed. The case remains open.");
    } else if (event.type === WORKBENCH_EVENTS.OPEN_RECEIPT) {
      announce("Reconstructable simulation receipt opened.");
    } else if (event.type === WORKBENCH_EVENTS.RESET) {
      simulationToken += 1;
      announce("Guided simulation restarted.");
    }
  }

  function runSimulation() {
    dispatch({ type: WORKBENCH_EVENTS.START_SIMULATION });
    announce("Guided simulation running. No external request is being made.");
    const token = ++simulationToken;
    const connectorDelay = prefersReducedMotion ? 40 : 720;
    const verifierDelay = prefersReducedMotion ? 80 : 1550;
    window.setTimeout(() => {
      if (token !== simulationToken) return;
      dispatch(
        { type: WORKBENCH_EVENTS.CONNECTOR_REPORTED_SUCCESS },
        { focusStage: false },
      );
      announce(
        "Fixture connector reported success. Independent read-back started.",
      );
    }, connectorDelay);
    window.setTimeout(() => {
      if (token !== simulationToken) return;
      dispatch(
        { type: WORKBENCH_EVENTS.INDEPENDENT_READBACK_MISMATCH },
        { focusStage: false },
      );
      nodes.stage
        .querySelector(
          `button[data-workbench-event="${WORKBENCH_EVENTS.OPEN_RECOVERY}"]`,
        )
        ?.focus({ preventScroll: true });
      announce(
        "Independent read-back found no customer update. The simulated effect was rejected and the case remains needs review.",
      );
    }, verifierDelay);
  }

  nodes.navigation.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-stage]");
    if (!button) return;
    dispatch({
      type: WORKBENCH_EVENTS.NAVIGATE,
      step: button.dataset.stage,
    });
  });

  nodes.stage.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-workbench-event]");
    if (!button) return;
    const eventType = button.dataset.workbenchEvent;
    if (eventType === WORKBENCH_EVENTS.START_SIMULATION) {
      runSimulation();
      return;
    }
    dispatch({ type: eventType });
  });

  async function load() {
    simulationToken += 1;
    nodes.loading.hidden = false;
    nodes.error.hidden = true;
    nodes.content.hidden = true;
    try {
      const [fixture, walkthrough] = await Promise.all([
        fetchJson(FIXTURE_ENDPOINT),
        fetchJson(WALKTHROUGH_ENDPOINT),
      ]);
      model = buildWorkbenchModel(fixture, walkthrough);
      state = createInitialWorkbenchState();
      nodes.eyebrow.textContent = model.guide.eyebrow;
      nodes.heading.replaceChildren(
        document.createTextNode(`${model.case.customer} `),
        element("span", { text: "/" }),
        document.createTextNode(` ${model.case.issue}`),
      );
      nodes.severity.textContent = titleCase(model.case.severity);
      nodes.caseState.textContent = titleCase(model.case.state);
      nodes.caseId.textContent = model.case.id;
      nodes.owner.textContent = humanIdentity(model.case.owner);
      nodes.due.textContent = formattedDueAt(model.case.dueAt);
      nodes.loading.hidden = true;
      nodes.content.hidden = false;
      render();
    } catch (error) {
      model = undefined;
      nodes.loading.hidden = true;
      nodes.error.hidden = false;
      nodes.content.hidden = true;
      nodes.navigation.replaceChildren();
      nodes.errorMessage.textContent =
        error instanceof WorkbenchDataError
          ? `${error.message}. The workbench stays closed rather than displaying unverified case data.`
          : "The workbench stays closed when its source data cannot be verified.";
    }
  }

  nodes.retry.addEventListener("click", () => void load());
  void load();
}

if (typeof document !== "undefined") {
  if (
    new globalThis.URL(window.location.href).searchParams.get("view") ===
    "legacy"
  ) {
    bootstrapBrowserWorkbench();
  } else {
    void import("./authority-workbench.js")
      .then(({ mountAuthorityWorkbench }) => mountAuthorityWorkbench())
      .catch(() => {
        document.querySelector("#loading-state").hidden = true;
        document.querySelector("#workbench-content").hidden = true;
        document.querySelector("#error-state").hidden = false;
        document.querySelector("#error-state h1").textContent =
          "The persistent review could not be loaded.";
        document.querySelector("#error-message").textContent =
          "No decision is assumed. Reload to recover the server state and any saved retry.";
        const retry = document.querySelector("#retry-button");
        retry.textContent = "Reload review";
        retry.addEventListener("click", () => window.location.reload());
      });
  }
}
