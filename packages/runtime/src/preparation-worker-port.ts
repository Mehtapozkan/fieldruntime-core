import { Worker } from "node:worker_threads";
import type { IntakeObject as Obj } from "./intake.js";
export interface PreparationExecution {
  readonly completion: Promise<unknown>;
  readonly cancel: () => void;
}
export type PreparationPort = (input: Obj) => PreparationExecution;
export const fixedPreparationPort: PreparationPort = (input) => {
  const worker = new Worker(
    new URL("./preparation-worker-thread.js", import.meta.url),
    {
      workerData: input,
      env: {},
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
      },
    },
  );
  const completion = new Promise<unknown>((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0)
        reject(new Error("Fixed preparation worker exited without a result"));
    });
  });
  return {
    completion,
    cancel: (): void => {
      void worker.terminate();
    },
  };
};
