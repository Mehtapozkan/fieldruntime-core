// This module is fixed at build time. No client module path or code is accepted.
import { parentPort, workerData } from "node:worker_threads";
import { prepareDisposition } from "./disposition-preparation.js";
import type { IntakeObject } from "./intake.js";
parentPort?.postMessage(prepareDisposition(workerData as IntakeObject));
