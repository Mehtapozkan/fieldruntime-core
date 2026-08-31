export const CASE_STATES = [
  "detected",
  "qualifying",
  "enriching",
  "blocked",
  "needs_review",
  "ready",
  "executing",
  "monitoring",
  "verifying",
  "resolved",
  "learning_review",
  "failed",
  "dismissed",
  "cancelled",
  "closed",
] as const;

export type CaseState = (typeof CASE_STATES)[number];

export const CASE_TRANSITIONS = {
  detected: ["qualifying", "dismissed"],
  qualifying: ["enriching", "dismissed", "blocked"],
  enriching: ["needs_review", "blocked", "failed"],
  blocked: ["enriching", "needs_review", "cancelled"],
  needs_review: ["ready", "blocked", "cancelled"],
  ready: ["executing", "monitoring", "cancelled"],
  executing: ["monitoring", "verifying", "failed"],
  monitoring: ["needs_review", "verifying", "failed"],
  verifying: ["resolved", "needs_review", "failed"],
  resolved: ["learning_review"],
  learning_review: ["closed"],
  failed: ["ready", "blocked", "cancelled"],
  dismissed: [],
  cancelled: [],
  closed: [],
} as const satisfies Record<CaseState, readonly CaseState[]>;

export function isCaseState(value: string): value is CaseState {
  return (CASE_STATES as readonly string[]).includes(value);
}

export function canTransition(from: CaseState, to: CaseState): boolean {
  return (CASE_TRANSITIONS[from] as readonly CaseState[]).includes(to);
}

export function assertTransition(from: CaseState, to: CaseState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid Field Runtime case transition: ${from} -> ${to}`);
  }
}
