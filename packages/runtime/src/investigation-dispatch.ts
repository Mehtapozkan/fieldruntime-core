// Explicit interpreter dispatch; never reinterpret historical fake-provider receipts.
import * as old from "./investigation.js";
import * as next from "./investigation-comparison.js";
import { intakeObject as o, type IntakeObject as Obj } from "./intake.js";
const modern = (input: Obj): boolean =>
  o(input.binding).worker_implementation_id === "disposition-investigation.v2";
export const isInvestigation = (p: Obj): boolean =>
  old.isInvestigation(p) ||
  p.implementation_id === "disposition-investigation.v2";
export const investigationRequest = (input: Obj): Obj =>
  modern(input)
    ? next.comparisonRequest(input)
    : old.investigationRequest(input);
export const investigationReservation = (
  entries: readonly Obj[],
  input: Obj,
  profile: Obj,
): Obj =>
  modern(input)
    ? next.comparisonReservation(entries, input, profile)
    : old.investigationReservation(entries, input, profile);
export const investigationFailure = (input: Obj, status?: string): Obj =>
  modern(input)
    ? next.comparisonFailure(input, status)
    : old.investigationFailure(input, status);
export const investigationResponse = (input: Obj, response: unknown): Obj =>
  modern(input)
    ? next.comparisonResponse(input, response)
    : old.investigationResponse(input, response);
export const validateInvestigationEvidence = (
  input: Obj,
  value: unknown,
): Obj =>
  modern(input)
    ? next.validateComparisonEvidence(input, value)
    : old.validateInvestigationEvidence(input, value);
export const investigationResult = (input: Obj, evidence: Obj): Obj | null =>
  modern(input)
    ? next.comparisonResult(input, evidence)
    : old.investigationResult(input, evidence);
