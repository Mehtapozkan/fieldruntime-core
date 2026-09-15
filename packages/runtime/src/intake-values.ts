export type IntakeObject = Record<string, unknown>;
export class IntakeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IntakeError";
  }
}
export function requireIntake(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new IntakeError(code, message);
}
export function intakeObject(value: unknown): IntakeObject {
  requireIntake(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "INTAKE_INTEGRITY",
    "Expected a record",
  );
  return value as IntakeObject;
}
export function intakeList(value: unknown): readonly IntakeObject[] {
  requireIntake(Array.isArray(value), "INTAKE_INTEGRITY", "Expected records");
  return value.map(intakeObject);
}
