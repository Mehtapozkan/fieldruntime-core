# Field Runtime CLI

Local lifecycle commands for the credential-free evaluation appliance.

```bash
fr init ecc --demo
fr up
```

`init ecc --demo` creates `.fieldruntime/project.json`. The manifest selects the
ECC demo and fixes the appliance in simulation mode with external writes disabled.
An identical initialization is idempotent; an existing contradictory or unsafe
manifest is never overwritten.

`up` validates that manifest before invoking exactly:

```text
docker compose up --build --detach --wait
```

For PR4, both commands run from the cloned `fieldruntime-core` repository root.
`up` verifies the repository surface and pins `COMPOSE_FILE` to that root's
`compose.yaml`; an initialized unrelated directory is refused before Docker runs.
From a source checkout, use `pnpm fr init ecc --demo` and `pnpm fr up`.
After Compose reaches readiness, `up` prints the direct workbench URL:
`http://127.0.0.1:3210/`.

The CLI does not accept credentials, live mode, or an external-write option. Its
filesystem, current directory, output, and process runner are injected around the
exported `runCli` function so command behavior can be tested without Docker,
credentials, or network access.
