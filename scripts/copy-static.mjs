import { cp, mkdir } from "node:fs/promises";

const source = new URL("../packages/contracts/schemas/", import.meta.url);
const destination = new URL(
  "../dist/packages/contracts/schemas/",
  import.meta.url,
);

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
