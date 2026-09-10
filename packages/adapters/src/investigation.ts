// Optional D-040 adapter: hermetic transport injection only. No fetch, SDK,
// credential loading or live activation switch exists in this implementation.
import { investigationRequest } from "../../runtime/src/investigation.js";
import type { PreparationPort } from "../../runtime/src/preparation-worker-port.js";
import type { IntakeObject as Obj } from "../../runtime/src/intake.js";
export type FakeInvestigationTransport = (
  request: Obj,
  signal: AbortSignal,
) => Promise<string>;
export function hermeticInvestigationPort(
  transport: FakeInvestigationTransport,
): PreparationPort {
  return (input) => {
    const controller = new AbortController();
    const request = investigationRequest(input);
    // Exactly one invocation. The durable parent claims the start/reservation first.
    return {
      completion: Promise.resolve().then(() =>
        transport(request, controller.signal),
      ),
      cancel: (): void => {
        controller.abort();
      },
    };
  };
}
export function liveInvestigationPort(): never {
  throw new Error(
    "Live investigation activation is unavailable: separate custodian, exact model, data-control, pricing and spending approval is required.",
  );
}
