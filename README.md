# Field Runtime Core

Field Runtime Core is an Apache-2.0-licensed **Enterprise Case Runtime** for
consequential operational work. It keeps a complete case—evidence, conflicts,
people, decisions and their history—outside any model or worker session. Models
may propose; deterministic policy and attributable human review control authority.

The working implementation is a local, credential-free synthetic appliance. You
can review Orchid's **proposed $15,000 credit** and retain its decisions in
PostgreSQL. The merged API records one bounded simulated credit and independently
checks its source through the Workbench, with explicit actions and recoverable
retries. History provides a compact, inspectable Case progress and evidence receipt.
This D8-B review branch documents reproducible failure demonstrations and measurement
readiness using the existing test fixtures. It adds no runtime capability.

> **Evaluation Preview** — Synthetic cases. Simulated authority. No external writes.
> Not production software. Selecting a synthetic reviewer seat is not authentication.

## What works today

“Main” includes D8-A [PR #26](https://github.com/Mehtapozkan/fieldruntime-core/pull/26)
at `4ce7175556b2a0ecf954ec5a57677a591050db2c`. **D8-B’s failure walkthrough and
measurement-readiness note are implemented for review here.** The historical prerelease has
a smaller boundary described under [Distribution](#distribution).

| Functionality                                    | Workbench                                                                                                | API / runtime                                                                             | Availability                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Case and evidence history                        | Explicit Orchid initialization; retained sources, uncertainty and changed-evidence demonstration         | Canonical PostgreSQL Case commands and replay                                             | Main                                                                                  |
| Decision Packet and human review                 | Finance/Executive approve; reject, modify or escalate; reload history                                    | Deterministic authority, exact C/R/S and immutable consent; replacements start unapproved | Main (D6)                                                                             |
| Record simulated credit                          | Explicit preparation and **Record simulated credit**                                                     | Scoped enrollment, one bound $15,000 Orchid credit, atomic source/action history          | Main (D7-B/D7-D)                                                                      |
| Independently check credit                       | **Check simulated source**; match, mismatch or inconclusive result; exact retry after uncertain response | Separate verifier and source read; retained evidence and restart replay                   | Main (D7-C/D7-D)                                                                      |
| ECC and legacy illustration                      | Separate Acme fixture story; illustrated action, verification and outcome screens                        | Thirty frozen synthetic cases and deterministic evaluation                                | Main and historical prerelease; legacy screens never invoke runtime action/check APIs |
| Case progress and evidence receipt               | Expand proposal, attributed decisions, action, independent observation and unresolved gaps in History    | Reuses existing Case, review and action/check reads; no new records or permission         | Main (D8-A)                                                                           |
| Failure walkthrough and measurement readiness    | Existing failure/result views remain unchanged                                                           | Five selected PostgreSQL/API control and failure fixtures with evidence output            | This review branch (D8-B)                                                             |
| Accepted outcome, economics and complete closure | Unavailable                                                                                              | Incomplete-proof closure denied; no recovered-revenue or customer-impact proof            | Future                                                                                |

An approval is not an effect. A verified simulated credit establishes only the
credit row's expected account, Case, amount, currency and originating attempt. It
does not verify the customer's original impact claim, acceptance, recovered revenue
or resolution. Reads create no durable changes; historical receipts never grant
current permission.

## Try current source

Requirements: Node.js 24, pnpm **11.24.0**, Docker with Compose v2 and a running
daemon, and free local ports 3210/5432. If needed, install the pinned pnpm with
`npm install --global pnpm@11.24.0`.

```sh
git clone https://github.com/Mehtapozkan/fieldruntime-core.git
cd fieldruntime-core
```

The clone opens main, which includes the synthetic review/action/check walkthrough
and read-only receipt:

```sh
pnpm install --frozen-lockfile
pnpm fr init ecc --demo
pnpm fr up
pnpm fr d7 enroll --demo
```

Open <http://127.0.0.1:3210/>. Choose **Start or reopen $15,000 review**, explicitly
prepare the original Case through the three shown steps, then **Create fresh
$15,000 request**. Inspect uncertainty; record Finance then Executive approval.
Choose **Record simulated credit**, then **Check simulated source**. Reload to
reconstruct the same history. Open **History → Case progress and evidence** for the compact
receipt; expand each stage for its recorded evidence. [Desktop/390px receipt handoff](docs/guides/d8-case-receipt-handoff.md).
[Executable walkthrough and problem/retry guidance](apps/admin/README.md).

Initialization and enrollment are deliberate and idempotent. Case/catalog changes
invalidate earlier approvals; no approvals transfer to fresh requests. Opening or
refreshing creates nothing. Pending commands survive reopening in the same browser
profile; retain site storage while a response is uncertain. For the merged APIs,
use the [API walkthrough](docs/guides/simulated-credit-api.md). Neither walkthrough
silently resets an occupied credit slot or moves a changed Case.

The API and PostgreSQL are loopback-only. `fr up` builds the selected source and
applies checksum-bound migrations; it refuses unsafe configuration. For an existing
preview volume, read the API guide's migration/backup limits before upgrading.
[Shutdown, retained data and troubleshooting](docs/operations/local-evaluation.md).

Without Docker you can build and evaluate the deterministic contracts and fixtures:

```sh
pnpm install --frozen-lockfile
pnpm validate
pnpm eval:ecc
pnpm eval:ecc -- --negative-control # expected exit 1 from failed safety assertions
```

These commands alone do not start persistent review or test PostgreSQL. Repository
CI also exercises real PostgreSQL/API, restart, Compose and Workbench browser paths.
[Validation evidence and remaining limits](STATUS.md).

## Two separate walkthroughs

**Persistent Orchid review:** the default page uses canonical runtime evidence,
requests and human decisions. Finance/Executive progress is read from the API;
browser state never grants authority. Explicit action and independent-check controls use those APIs. This branch adds
the read-only Case receipt; recorded history remains distinct from current authority.

**Legacy Acme fixture simulation:** choose **Legacy action simulation** or open
`/?view=legacy`. The six-action story illustrates a connector claiming success,
a missing effect, read-back, recovery and receipts. Those screens are presentation
only: they record no human approval, action, verification or outcome in runtime
history. They remain isolated from Orchid, even on this review branch.
[Legacy five-minute walkthrough](docs/guides/5-minute-evaluation.md).

![Legacy Acme fixture illustration; not the runtime-backed Orchid review](docs/assets/guided-workbench-preview.svg)

## Public roadmap

- **D6 — Governed Case Session:** merged, within the synthetic environment:
  persistent Decision Packets, deterministic authority and human review.
- **D7 — Controlled Action + Independent Verification:** bounded action merged;
  independent verification and Workbench controls merged, including explicit
  preparation, retries and problem guidance.
- **D8-A — Case progress and evidence receipt:** merged in PR #26.
- **D8-B — Failure walkthrough and measurement readiness:** implemented for review here.
  Remaining D8 accepted-outcome/economics work is planned. A read-only evidence
  receipt supplies neither accepted outcomes nor economic measurements.
- **D9–D12:** future Case formation/import, Operational Legibility, reviewed runtime
  configuration and only then a general worker runtime. No automatic Case matching
  or external Case import exists today.

Production authentication, real connectors, provider adapters, general workers,
external actions and complete Case closure remain unimplemented. Later distribution
and production capabilities require their own evidence and decisions; a general
Action Gateway is not supplied by the one-credit synthetic operation.

Delivery labels are not GitHub pull request numbers. [PLAN.md](PLAN.md) retains the
full sequence and exit criteria; [STATUS.md](STATUS.md) records what is implemented
and validated. Planned functionality is not an available product or release promise.

For this review branch’s [failure walkthrough and measurement-readiness note](docs/guides/d8-failure-walkthrough.md),
select `feat/d8b-failure-walkthrough` and use disposable test fixtures. It covers a
legitimate success control, stale consent, silent adapter failure, unavailable reads
and exact lost-response retry. It does not measure labor savings or business value.

## Distribution

Current source is public under the [Apache License 2.0](LICENSE). The published
[evaluation prerelease `v0.1.0-evaluation-preview.0`](https://github.com/Mehtapozkan/fieldruntime-core/releases/tag/v0.1.0-evaluation-preview.0)
is the **September 1, 2026** snapshot at
[`3db1b4bf0304e67e1ef51be785d1f81b906016b3`](https://github.com/Mehtapozkan/fieldruntime-core/commit/3db1b4bf0304e67e1ef51be785d1f81b906016b3).
It includes the Case engine, PostgreSQL appliance, ECC evaluation and legacy fixture
Workbench. **It does not include persistent D6 review or the D7 action/verification
APIs.** To evaluate that version, use a separate clone and select the tag before
installation:

```sh
git switch --detach v0.1.0-evaluation-preview.0
```

Then follow the [tag-pinned guide](https://github.com/Mehtapozkan/fieldruntime-core/blob/v0.1.0-evaluation-preview.0/docs/guides/5-minute-evaluation.md)
after its clone step. Use a separate fresh appliance volume; do not downgrade an
upgraded database. The tag-pinned page alone does not select the cloned revision.

Merging source changes does not update that immutable tag or release. This D8-B PR
publishes no new release or deployment. The source-clone appliance is the supported
trial path; standalone installers, signed artifacts, SBOM/provenance and production
operations remain future work. Workspace packages remain registry-private.

[OPEN_CORE.md](OPEN_CORE.md) describes a **potential** commercial offering, not an
implemented product inventory. Its terms do not narrow the rights to published
source. See also [security](SECURITY.md), [trademarks](TRADEMARKS.md) and the preserved
[historical release notes](docs/releases/v0.1.0-evaluation-preview.md).

## Repository and product direction

`apps/api` serves the loopback API and Workbench; `apps/worker` runs transactional
commands in-process. `packages/runtime` owns the engine and PostgreSQL persistence,
`packages/domain` deterministic rules, `packages/contracts` boundary schemas,
`packages/cli` appliance commands and `packages/ecc-pack` the frozen evaluation.

The broader goal is a governed Case spanning evidence, authority, action,
verification, outcome, receipt and correction, while preserving upstream systems
of record and replaceable providers. The current implementation covers the bounded
synthetic functions above; it is not that complete production platform or a hosted
service. Learn more at [fieldruntime.ai](https://fieldruntime.ai).

Before contributing, read [AGENTS.md](AGENTS.md), then its required documents in
order. [PRODUCT_SPEC.md](PRODUCT_SPEC.md) defines the product boundary;
[DECISIONS.md](DECISIONS.md) records architectural approvals.
