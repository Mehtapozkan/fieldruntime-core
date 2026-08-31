import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import {
  assertTransition,
  canTransition,
  CASE_STATES,
  CASE_TRANSITIONS,
} from "../dist/packages/domain/src/index.js";

const read = async (path) =>
  readFile(new URL(`../packages/ecc-pack/${path}`, import.meta.url), "utf8");

const workflow = parse(await read("workflows/contract.v0.yaml"));
const graph = parse(await read("workflows/decision-graph.v0.yaml"));
const evaluationSchema = JSON.parse(
  await read("evals/evaluation-case.v0.schema.json"),
);
const evaluationCases = (await read("evals/ecc.v0.jsonl"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

const compose = parse(
  await readFile(new URL("../compose.yaml", import.meta.url), "utf8"),
);

test("domain states and transitions exactly match the ECC workflow contract", () => {
  assert.deepEqual(Object.keys(workflow.states), [...CASE_STATES]);
  for (const state of CASE_STATES) {
    assert.deepEqual([...CASE_TRANSITIONS[state]], workflow.states[state]);
  }
});

test("transition helpers allow declared moves and reject authority shortcuts", () => {
  assert.equal(canTransition("verifying", "resolved"), true);
  assert.equal(canTransition("needs_review", "executing"), false);
  assert.throws(
    () => assertTransition("needs_review", "executing"),
    /Invalid Field Runtime case transition/,
  );
});

test("the decision graph uses only declared case states", () => {
  assert.equal(graph.entry_node, "N0");
  const allowed = new Set(CASE_STATES);
  const graphStates = graph.nodes
    .map((node) => node.state_enter)
    .filter((state) => state !== undefined);

  assert.ok(graphStates.every((state) => allowed.has(state)));
});

test("the imported v0.1.0 graph remains blocked from activation until state parity is repaired", () => {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const illegalEdges = [];

  for (const node of graph.nodes) {
    for (const transition of node.transitions) {
      const destination = nodeById.get(transition.to);
      if (
        destination === undefined ||
        destination.state_enter === node.state_enter
      ) {
        continue;
      }

      const allowed = workflow.states[node.state_enter] ?? [];
      if (!allowed.includes(destination.state_enter)) {
        illegalEdges.push(
          `${node.id}:${node.state_enter}->${destination.id}:${destination.state_enter}`,
        );
      }
    }
  }

  assert.deepEqual(illegalEdges, [
    "N5:needs_review->N3:enriching",
    "N6:needs_review->N7:executing",
    "N6:needs_review->N3:enriching",
    "N7:executing->N4:blocked",
    "N8:monitoring->N4:blocked",
    "N9:verifying->N10:learning_review",
    "N9:verifying->N4:blocked",
  ]);

  const entered = new Set(graph.nodes.map((node) => node.state_enter));
  assert.deepEqual(
    ["ready", "resolved", "failed"].filter((state) => !entered.has(state)),
    ["ready", "resolved", "failed"],
  );
});

test("all 30 synthetic evaluations satisfy their schema", () => {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
  });
  addFormats(ajv);
  const validate = ajv.compile(evaluationSchema);

  assert.equal(evaluationCases.length, 30);
  assert.equal(new Set(evaluationCases.map(({ id }) => id)).size, 30);
  for (const evaluationCase of evaluationCases) {
    assert.equal(
      validate(evaluationCase),
      true,
      `${evaluationCase.id}: ${JSON.stringify(validate.errors, null, 2)}`,
    );
  }
});

test("the evaluation suite contains the critical authority and resilience sentinels", () => {
  const byId = new Map(evaluationCases.map((item) => [item.id, item]));
  const required = [
    "FR-EVAL-007",
    "FR-EVAL-008",
    "FR-EVAL-010",
    "FR-EVAL-015",
    "FR-EVAL-026",
    "FR-EVAL-027",
    "FR-EVAL-028",
    "FR-EVAL-029",
    "FR-EVAL-030",
  ];

  assert.ok(required.every((id) => byId.has(id)));
  assert.equal(byId.get("FR-EVAL-007").expected.case_behavior, "dedupe");
  assert.equal(
    byId.get("FR-EVAL-008").expected.case_behavior,
    "security_reject",
  );
  assert.equal(byId.get("FR-EVAL-026").expected.final_state, "verifying");
  assert.equal(byId.get("FR-EVAL-027").expected.final_state, "resolved");
  assert.equal(
    byId.get("FR-EVAL-028").expected.case_behavior,
    "security_reject_action",
  );
  assert.equal(
    byId.get("FR-EVAL-030").expected.learning_candidate.promotion_status,
    "rejected",
  );
});

test("the local database is loopback-only and uses evaluation credentials", () => {
  const postgres = compose.services.postgres;

  assert.equal(postgres.image, "postgres:17-alpine");
  assert.deepEqual(postgres.ports, ["127.0.0.1:5432:5432"]);
  assert.match(postgres.environment.POSTGRES_PASSWORD, /local-evaluation-only/);
  assert.ok(postgres.healthcheck);
});
