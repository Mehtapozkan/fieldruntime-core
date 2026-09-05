# D8-B: failure walkthrough and measurement readiness

This walkthrough runs five existing PostgreSQL/API fixtures: one legitimate
success control and four failures. The same cases remain in full CI. It adds only
assertions and diagnostic evidence to the existing test host; no appliance fault
controls, runtime contracts, migrations, dependencies or production capabilities.

An operator explicitly launches the tests; the harness then submits synthetic
commands, including simulated reviewer decisions. This is not autonomous customer
work or proof of human inspection. A passing test means the asserted safeguard
worked, not that a customer's problem was resolved. Fixed fixture clocks and
runner durations are not business-performance measurements.

## Run the five scenarios

Use Node 24, pnpm 11.24.0 and a **disposable local PostgreSQL** instance. From this
review branch's repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
export D7_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:55432/postgres
d8b_scenarios='^(D7 denies changed evidence$|D7-C (exact independent source read,|adapter success without source is a mismatch;|unavailable reads are inconclusive,)|D7-D execute: saved exact command)'
node --test --test-reporter=spec --test-name-pattern="$d8b_scenarios" scripts/simulated-credit-postgres.test.mjs
```

The URL is PostgreSQL, not an appliance HTTP endpoint. Each existing `fixture()`
creates a random `d7_test_*` schema, applies the existing checksum-bound migrations
there, explicitly prepares/enrolls/reviews its own Orchid Case, serves an ephemeral
loopback API and drops only its own schema on teardown. It never selects or rewrites
an evaluator's Case. Do not run the normal appliance's `applied` smoke or reset an
evaluator's volume to demonstrate failures. A forcibly interrupted test can leave
its disposable schema; discard the test instance after use.

If PostgreSQL is not already available, this optional Bash sequence starts a fresh
container using the repository's pinned image on an allocated loopback port. Run
it after install/build; it cleans up only the container it creates:

```bash
(
  set -euo pipefail
  d8b_image=$(node --input-type=module -e 'import fs from "node:fs"; import YAML from "yaml"; process.stdout.write(YAML.parse(fs.readFileSync("compose.yaml", "utf8")).services.postgres.image)')
  d8b_pg=$(docker run --detach --rm --publish 127.0.0.1::5432 \
    --env POSTGRES_USER=fieldruntime --env POSTGRES_PASSWORD=local-evaluation-only \
    --env POSTGRES_DB=postgres "$d8b_image")
  trap 'docker stop "$d8b_pg" >/dev/null' EXIT
  for i in {1..30}; do
    if docker exec "$d8b_pg" pg_isready -h 127.0.0.1 -U fieldruntime -d postgres >/dev/null; then break; fi
    sleep 1
  done
  docker exec "$d8b_pg" pg_isready -h 127.0.0.1 -U fieldruntime -d postgres
  d8b_port=$(docker port "$d8b_pg" 5432/tcp | cut -d: -f2)
  export D7_POSTGRES_URL="postgresql://fieldruntime:local-evaluation-only@127.0.0.1:$d8b_port/postgres"
  d8b_scenarios='^(D7 denies changed evidence$|D7-C (exact independent source read,|adapter success without source is a mismatch;|unavailable reads are inconclusive,)|D7-D execute: saved exact command)'
  node --test --test-reporter=spec --test-name-pattern="$d8b_scenarios" scripts/simulated-credit-postgres.test.mjs
)
```

Success requires **five tests passed, zero failed**, with all five named scenarios
and their `D8-B` evidence lines present. Zero selected tests or a setup error is
not a successful demonstration. Assertions make unexpected authorization, false
verification or duplicate effects exit nonzero. Expected denial, mismatch and
inconclusive results pass their assertions. Do not suppress failures with `|| true`.

## Read the results

Every `D8-B` line contains actual fixture results: original command/key and C/R/S,
request/action/envelope hashes, recorded time, synthetic service attribution,
adapter acknowledgment, source row and independent observation/comparison where
applicable. These are diagnostic excerpts, **not new canonical receipts**. Entry
hashes identify the complete records validated during the run. Teardown deletes
the fixture; these excerpts are not a standalone replay archive. Rerun the tests
to reproduce reconstruction. Generated retry keys and hashes can differ between
runs; each exact retry preserves its own original bytes/key. Evidence from different
fixtures must not be joined by repeated synthetic IDs.

| Scenario / attempted operation                                                  | Expected and observed assertion result                                                                                                      | Supporting evidence                                                                                                                                      | Permitted recovery                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legitimate control: Finance and Executive approve; execute; independently check | HTTP 200 `applied`; `verified_simulated_effect`; exactly one source credit                                                                  | Exact target/payload/origin, distinct verifier/read connection, observation and entry hashes; unchanged C/R/S; restart and exact retry preserve evidence | Inspect the credit and remaining impact/acceptance gaps. No closure permission.                                                                                                                                                                                                                               |
| Changed evidence after approval: submit the original execute command            | HTTP 409 `denied`; `case_version_conflict` and `stale_case`; adapter `not_invoked`; zero source rows                                        | Command C=4/R=2/S=2, current C=5/R=2/S=2, no effective approval IDs, denial/envelope hashes                                                              | Refresh and inspect changed evidence. Explicitly create a fresh request and obtain fresh decisions; never silently rebase consent.                                                                                                                                                                            |
| Adapter returns success without inserting credit: independently check           | Verification HTTP 200 `applied`, comparison `mismatch`, `source_absent`, `absence_proven: true`                                             | Adapter `success` with null source; separate authoritative observation has zero rows; premature fresh execution is denied                                | Only latest independent absence for the latest invocation plus current authority permits an explicit fresh attempt. The fixture exercises this and proves an occupied slot blocks another credit. Its final recovery credit is recorded; this scenario does not claim a successful check of that new attempt. |
| Source read throws: independently check                                         | Verification HTTP 200 `applied`, comparison `inconclusive`, raw status `unavailable`, `absence_proven: false`; fresh financial retry denied | Retained failed-read observation and comparison; exact retry after restart returns that same proof                                                       | Restore read availability, then deliberately check with a new verification key. The fixture's fresh check proves absence; the earlier error never does.                                                                                                                                                       |
| Execute response lost after commit: reopen, restart and retry                   | Client initially unconfirmed; byte-identical retry returns HTTP 200 `duplicate` and the original receipt; one credit before and after       | Saved original command/key, identical receipt hash, one attempt, full durable-state comparison across retry                                              | Recover the original command. A duplicate is historical evidence, not current permission. Do not generate a new financial key because of a timeout.                                                                                                                                                           |

The fault mechanisms are the existing fixture's injected adapter, reader hook and
response-dropping fetch wrapper. They are unavailable through the ordinary API.
Unavailable observation is distinct from a test host's direct source-row count:
even when the test knows there are zero rows, that knowledge cannot authorize retry.

For the existing browser versions, install Chromium and run:

```sh
pnpm exec playwright install chromium
D7_WORKBENCH_BROWSER=1 node --test --test-name-pattern='^D7-D browser:' scripts/simulated-credit-postgres.test.mjs
```

This runs all eight browser scenarios against the still-running disposable
PostgreSQL URL. The optional container block removes its instance on exit: to use
that block for browser checks, install Chromium first and replace its five-test
command with the browser command above before running the block.
The [receipt walkthrough and desktop/390px captures](d8-case-receipt-handoff.md)
show how the merged Workbench presents retained mismatch, inconclusive, changed
evidence and uncertain outcomes. This change introduces no new UI or screenshots.

## Measurement readiness

| Question                           | Facts available now                                                                                                      | Evidence required before reporting a metric                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What was recorded?                 | Decisions and synthetic identity attribution; attempts; independent observations; exact bindings and recorded timestamps | Real operational use and agreed interpretation of each event. Synthetic fixture records establish behavior only.                                                                                                       |
| Did cycle time improve?            | Recorded boundaries within known request/action history                                                                  | Defined start/end events and completeness; comparable baseline and Case mix; real observation periods and outcome quality. Separate waiting, handoff and active work. Equal timestamps do not order separate journals. |
| Was human labor saved?             | Attributed submissions, not active effort                                                                                | Measured active human effort, interruptions, supervision and rework for both assisted and comparable baseline Cases. Timestamp differences are not labor time.                                                         |
| What is cost per accepted outcome? | Recorded attempt/check counts, not operating costs or accepted outcomes                                                  | Actual infrastructure/provider costs, labor rates and effort, shared-cost allocation, and a defined population of evidenced accepted outcomes including failed/reworked Cases.                                         |
| Was business impact achieved?      | One bounded simulated credit may be independently checked                                                                | Customer acceptance, independent evidence of real impact and attributable business results. A simulated $15,000 credit is not recovered revenue or money saved.                                                        |

Missing measurements are **unknown, not zero**. No cycle-time improvement, labor
savings, cost per accepted outcome or ROI is reported here. Acceptance, real impact
and complete closure proof remain unimplemented; D8 economics is not complete.

See [STATUS](../../STATUS.md) and the implementation PR for actual local and
final-commit CI results. Docker provisioning was unavailable locally; no local
container-run claim is made. Hosted CI retains the full PostgreSQL/API, browser,
restart and Compose/appliance checks. Current source remains Apache-2.0; this PR
does not update the historical evaluation prerelease or release/deploy anything.
