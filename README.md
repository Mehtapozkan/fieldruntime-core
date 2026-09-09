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
The merged failure walkthrough demonstrates the safeguards with isolated test fixtures.
Merged D8-C clarifies current attention, Case ownership and the selected reviewer’s
policy requirement in the same view. Merged D9-B adds explicit synthetic
CSV/document preparation, reviewed Case create/attach, retained provenance and safe
reimport under [Accepted D-034](docs/architecture/d9-assisted-intake-boundary.md).
Real customer activation remains unapproved.

> **Evaluation Preview** — Synthetic cases. Simulated authority. No external writes.
> Not production software. Selecting a synthetic reviewer seat is not authentication.

## What works today

Main includes D9-B and D10-B (PR #32, merged at `953d49ec`): a cited synthetic
workflow brief, consequential questions and persistent descriptive answers/corrections/
confirmations. It uses zero model calls. See the [Discovery walkthrough](docs/guides/synthetic-discovery.md).
**D11-A/B and corrected Accepted D-036 are merged (PRs #33/#34, main `6bfc94e2`):** one fixed preparation pack, separate synthetic publication, withdrawal,
guarded rollback and portable history. [Try the pack walkthrough](docs/guides/synthetic-preparation-pack.md).
[D12-A](docs/guides/d12-preparation-worker-design.md) is an Accepted design on this review branch; worker execution and proof/correction capture await D12-B implementation.
The historical prerelease has the smaller boundary described under [Distribution](#distribution).

| Functionality                                     | Workbench                                                                                                | API / runtime                                                                                           | Availability                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Case and evidence history                         | Explicit Orchid initialization; retained sources, uncertainty and changed-evidence demonstration         | Canonical PostgreSQL Case commands and replay                                                           | Main                                                                                  |
| Decision Packet and human review                  | Finance/Executive approve; reject, modify or escalate; reload history                                    | Deterministic authority, exact C/R/S and immutable consent; replacements start unapproved               | Main (D6)                                                                             |
| Record simulated credit                           | Explicit preparation and **Record simulated credit**                                                     | Scoped enrollment, one bound $15,000 Orchid credit, atomic source/action history                        | Main (D7-B/D7-D)                                                                      |
| Independently check credit                        | **Check simulated source**; match, mismatch or inconclusive result; exact retry after uncertain response | Separate verifier and source read; retained evidence and restart replay                                 | Main (D7-C/D7-D)                                                                      |
| ECC and legacy illustration                       | Separate Acme fixture story; illustrated action, verification and outcome screens                        | Thirty frozen synthetic cases and deterministic evaluation                                              | Main and historical prerelease; legacy screens never invoke runtime action/check APIs |
| Case progress and evidence receipt                | Expand proposal, attributed decisions, action, independent observation and unresolved gaps in History    | Reuses existing Case, review and action/check reads; no new records or permission                       | Main (D8-A)                                                                           |
| Failure walkthrough and measurement readiness     | Existing failure/result views remain unchanged                                                           | Five selected PostgreSQL/API control and failure fixtures with evidence output                          | Main (D8-B)                                                                           |
| Synthetic file intake                             | Explicit prepare, review target, commit and reopen; source citations and gaps                            | Scoped bytes, deterministic reimports, atomic Case/provenance receipts, portable replay                 | Main (D9-B); real data unapproved                                                     |
| Cited workflow preparation and descriptive review | Open retained intake, inspect seven records/six outputs, answer/correct/confirm and reopen history       | Deterministic brief, exact Case/material/review bindings, one immutable journal and portable provenance | Main (D10-B); not in historical prerelease; complete Discovery remains pending        |
| Reviewed preparation pack                         | Compact intake panel: inspect, publish, compare, withdraw, roll back and export                          | Strict fixed template, scoped publication profile, exact current basis and immutable selection replay   | Main (D11-B); not in historical prerelease; no worker execution                       |
| Accepted outcome, economics and complete closure  | Unavailable                                                                                              | Incomplete-proof closure denied; no recovered-revenue or customer-impact proof                          | Future                                                                                |

An approval is not an effect. A verified simulated credit establishes only the
credit row's expected account, Case, amount, currency and originating attempt. It
does not verify the customer's original impact claim, acceptance, recovered revenue
or resolution. Reads create no durable changes; historical receipts never grant
current permission.

## Try current source

Requirements: Node.js **24.19.0** (retained intake replay uses tzdata `2026b`), pnpm **11.24.0**, Docker with Compose v2 and a running
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

For **merged synthetic Discovery**, open the existing intake entry at
<http://127.0.0.1:3210/?view=intake>. Explicitly prepare the sample, review its Case
commit, then **Open workflow brief**. Save a descriptive answer and confirm its
stated purpose separately. [Executable API steps, migration and desktop/390px captures](docs/guides/synthetic-discovery.md).
Descriptive confirmation does not enroll intake Cases for financial actions or publish a pack.
The merged **Preparation pack** panel provides explicit
publication after that review; [its guide](docs/guides/synthetic-preparation-pack.md) covers
changes, stale withdrawal and exact recovery.

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

To try merged synthetic intake, open `/?view=intake` on current main. Use **Use synthetic sample → Prepare selected synthetic
files → Review this candidate → Inspect exact commit → Commit reviewed material**.
[Exact API/retry/export walkthrough and migration limits](docs/guides/synthetic-intake.md).
Intake does not enroll imported Cases for credit review or execution.

## Separate walkthroughs

**Persistent Orchid review:** the default page uses canonical runtime evidence,
requests and human decisions. Finance/Executive progress is read from the API;
browser state never grants authority. Explicit action and independent-check controls
use those APIs. Main includes the read-only Case receipt; recorded history remains
distinct from current authority.

**Legacy Acme fixture simulation:** choose **Legacy action simulation** or open
`/?view=legacy`. The six-action story illustrates a connector claiming success,
a missing effect, read-back, recovery and receipts. Those screens are presentation
only: they record no human approval, action, verification or outcome in runtime
history. They remain isolated from Orchid.
[Legacy five-minute walkthrough](docs/guides/5-minute-evaluation.md).

![Legacy Acme fixture illustration; not the runtime-backed Orchid review](docs/assets/guided-workbench-preview.svg)

## Public roadmap

- **D6 — Governed Case Session:** merged, within the synthetic environment:
  persistent Decision Packets, deterministic authority and human review.
- **D7 — Controlled Action + Independent Verification:** bounded action merged;
  independent verification and Workbench controls merged, including explicit
  preparation, retries and problem guidance.
- **D8-A — Case progress and evidence receipt:** merged in PR #26.
- **D8-B — Failure walkthrough and measurement readiness:** merged in PR #27.
  Remaining D8 accepted-outcome/economics work is planned. A read-only evidence
  receipt supplies neither accepted outcomes nor economic measurements.
- **D8-C — Attention presentation:** merged in PR #28; selected-seat “Why you?”,
  separate recorded Case owner and reconciled current attention. Existing milestones,
  uncertainty, permitted interventions and recovery remain. [Walkthrough and captures](apps/admin/README.md#d8-c-operator-attention-and-visual-review).
- **D9 — Synthetic intake:** merged in PR #30, including retained bytes, explicit
  Case create/attach, successful-key bindings and cross-tab recovery. [Try intake](docs/guides/synthetic-intake.md).
- **D10–D12:** [D10-A / Accepted D-035](docs/architecture/d10-discovery-preparation-review.md)
  and D10-B are merged, providing a bounded cited brief and descriptive
  review with seven record views, six outputs, gap-driven questions and redesign.
  The broader Operational Legibility requirements remain incomplete.
  [Try Discovery](docs/guides/synthetic-discovery.md). Full evidenced routes, governing
  rules and measurement coverage remain incomplete. D11-B publication is merged;
  [D12-A / Accepted D-037](docs/architecture/d12-bounded-preparation-worker.md) designs
  a bounded worker and separate proof/correction capture. No D12 implementation exists.
  Real-data activation remains unapproved.
- **D13 — Customer proof:** planned 25-Case Challenge and Operating Capacity Map.
  Assisted evaluations may begin during D9–D12 within an approved data boundary;
  measured quality, total effort and repeat use determine continuation. Connected
  shadow operation and production writes retain their later gates.

Production authentication, real connectors, provider adapters, general workers,
external actions and complete Case closure remain unimplemented. Later distribution
and production capabilities require their own evidence and decisions; a general
Action Gateway is not supplied by the one-credit synthetic operation.

Delivery labels are not GitHub pull request numbers. [PLAN.md](PLAN.md) retains the
full sequence and exit criteria; [STATUS.md](STATUS.md) records what is implemented
and validated. Planned functionality is not an available product or release promise.
The [canonical specification](docs/product/workflow-discovery.md) and
[single requirement/gaps matrix](docs/product/requirements-implementation-matrix.md)
retain the Discovery, Business Loop and measurement requirements. Business Loops
describe recurring Cases, not another runtime or a currently implemented platform.

The merged [failure walkthrough and measurement-readiness note](docs/guides/d8-failure-walkthrough.md)
uses disposable test fixtures on main. It covers a
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

Merging source changes does not update that immutable tag or release. This D10-B implementation PR
publishes no new release or deployment. The source-clone appliance is the supported
trial path; standalone installers, signed artifacts, SBOM/provenance and production
operations remain future work. Workspace packages remain registry-private.

The public website's synthetic queue story is a separate illustration, not this
appliance's persistent population or a measured automation rate. Its wording/build
status needs a separate ownership and copy audit; this PR does not edit or deploy
the site. No simulated credit proves recovered revenue or an accepted business outcome.

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
