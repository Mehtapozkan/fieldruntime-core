export const CASE_STATES = Object.freeze([
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
] as const);

export type CaseState = (typeof CASE_STATES)[number];

export const CASE_TRANSITIONS = Object.freeze({
  detected: Object.freeze(["qualifying", "dismissed"] as const),
  qualifying: Object.freeze(["enriching", "dismissed", "blocked"] as const),
  enriching: Object.freeze(["needs_review", "blocked", "failed"] as const),
  blocked: Object.freeze(["enriching", "needs_review", "cancelled"] as const),
  needs_review: Object.freeze(["ready", "blocked", "cancelled"] as const),
  ready: Object.freeze(["executing", "monitoring", "cancelled"] as const),
  executing: Object.freeze(["monitoring", "verifying", "failed"] as const),
  monitoring: Object.freeze(["needs_review", "verifying", "failed"] as const),
  verifying: Object.freeze(["resolved", "needs_review", "failed"] as const),
  resolved: Object.freeze(["learning_review"] as const),
  learning_review: Object.freeze(["closed"] as const),
  failed: Object.freeze(["ready", "blocked", "cancelled"] as const),
  dismissed: Object.freeze([] as const),
  cancelled: Object.freeze([] as const),
  closed: Object.freeze([] as const),
}) satisfies Readonly<Record<CaseState, readonly CaseState[]>>;

const CASE_STATE_SET = new Set<string>(CASE_STATES);

export function isCaseState(value: string): value is CaseState {
  return CASE_STATE_SET.has(value);
}

export function canTransition(from: string, to: string): boolean {
  if (!isCaseState(from) || !isCaseState(to)) {
    return false;
  }

  return (CASE_TRANSITIONS[from] as readonly CaseState[]).includes(to);
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid Field Runtime case transition: ${from} -> ${to}`);
  }
}
