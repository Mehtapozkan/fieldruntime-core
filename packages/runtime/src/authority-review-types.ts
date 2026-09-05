import {
  immutableJson,
  type JsonValue,
  type ReviewObject,
} from "../../contracts/src/index.js";

export type ObjectValue = ReviewObject;
export const REVIEW_VERSIONS = Object.freeze({
  engine: "authority-review-engine.v1",
  resolver: "authority-resolution.d6c.v2",
  projection: "authority-packet.v1",
});
export type ReviewVersions = {
  readonly engine: "authority-review-engine.v1";
  readonly resolver:
    "authority-resolution.d6c.v1" | "authority-resolution.d6c.v2";
  readonly projection: "authority-packet.v1";
};
export type ReviewActor =
  "operator" | "business" | "finance" | "executive" | "finance_delegate";
export type SnapshotKind = "catalog" | "material" | "evaluation";
export interface ReviewSnapshot {
  readonly tenant_id: string;
  readonly hash: string;
  readonly kind: SnapshotKind;
  readonly content: ObjectValue;
}
export interface AuthorityState {
  readonly entries: readonly ObjectValue[];
  readonly snapshots: readonly ReviewSnapshot[];
}
export interface AuthorityCatalogHead {
  readonly tenant_id: string;
  readonly revision: number;
  readonly snapshot_hash: string;
  readonly last_recorded_at: string;
}
export interface ReviewDependencies {
  readonly now: () => Date;
  readonly nextId: (kind: "request" | "review" | "decision") => string;
}
export class AuthorityReviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthorityReviewError";
  }
}
export function object(value: unknown): ObjectValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthorityReviewError(
      "REVIEW_INTEGRITY",
      "expected a JSON object",
    );
  }
  return value as ObjectValue;
}
export function string(value: unknown): string {
  if (typeof value !== "string")
    throw new AuthorityReviewError("REVIEW_INTEGRITY", "expected a string");
  return value;
}
export function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AuthorityReviewError(
      "REVIEW_INTEGRITY",
      "expected a nonnegative safe integer",
    );
  }
  return value;
}
export function objects(value: unknown): ObjectValue[] {
  if (!Array.isArray(value))
    throw new AuthorityReviewError("REVIEW_INTEGRITY", "expected an array");
  return (value as unknown[]).map(object);
}
export function json(value: unknown): ObjectValue {
  return object(immutableJson(value));
}
export function list(value: JsonValue | undefined): readonly JsonValue[] {
  return Array.isArray(value) ? (value as readonly JsonValue[]) : [];
}
