# Local Evaluation Operations

## Validate the repository

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate
docker compose config --quiet
```

## Start PostgreSQL

```bash
docker compose up -d postgres
docker compose ps
```

The database is reserved for PR4 persistence work. Current repository validation
does not require it.
The configured password and loopback port are for an isolated developer machine
only.

Stop the service without deleting its volume:

```bash
docker compose down
```

No command in this document connects to an external system or performs an external
write.
