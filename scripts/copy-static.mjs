import { cp, mkdir } from "node:fs/promises";

const directories = [
  "packages/contracts/schemas",
  "packages/contracts/openapi",
  "packages/ecc-pack/fixtures",
  "packages/runtime/migrations",
];

for (const directory of directories) {
  const source = new URL(`../${directory}/`, import.meta.url);
  const destination = new URL(`../dist/${directory}/`, import.meta.url);
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });
}
