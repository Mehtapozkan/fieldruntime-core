# D-038 — Bounded preparation after newly supplied evidence

Status: **Accepted — implementation authorized, not yet implemented.**

## Human approval

On 2026-09-09 the owner approved this decision as documented at
`639889f677a83a522996dd241d5082ddbadfc1bf`:

> I approve D-038 as documented at `639889f677a83a522996dd241d5082ddbadfc1bf`, limited to explicitly versioned synthetic preparation across at most two exact retained bundles, resource preflight and the proposed additive compatibility migration.

The approval requires useful DEL-4 continuation after fresh descriptive review and
separate publication, independent new task acceptance, resource-aware preflight/
Workbench/Challenge reporting, complete occurrence limits and read scope, and retained
version/retry/restart compatibility. DEL-5 and all five separate proof measures remain
unaffected. It excludes real-customer processing, external retrieval or messages,
financial actions, business-outcome/closure contracts, release and deployment.
This approval does not itself publish a pack or accept a preparation result.

The existing [D13 follow-through rehearsal](../guides/challenge-follow-through.md)
uses Accepted D-034–D-037 as written. It retains new DEL-4 evidence, fresh description
and separate publication, then asserts the present `WORK_INPUT_LIMIT` refusal.
D-037's accepted one-bundle limit and historical interpreters remain unchanged.

## Accepted decision

Permit an **explicitly versioned synthetic preparation artifact/worker input** to
read at most **two exact retained bundles**, including the selected bundle, solely
to re-prepare the same scoped invoice-dispute task after supplied evidence. Require
fresh descriptive review, compatible artifact and separate publication. Preserve
all cited historical claims; do not discard old material to fit the bound.

This approves no individual publication, task acceptance, customer processing,
external retrieval/message, business disposition, financial action or Case closure.
No new identity purpose, tenant or supporting journal is proposed.

## Concrete scope and version barrier

For Orchid dispute-17, bundle A supplied the original CSV and gap packet. Bundle B
retains the CSV and new record-associated DEL-4 note. Correct Discovery v2 and the
current pack retain citations from A and B. The current worker counts these as two
bundles even when CSV bytes are shared, and refuses under its one-bundle contract.
Changing a constant under old versions would silently change their execution meaning.

Propose fixed `invoice-dispute-preparation.v3` / `preparation-pack.v3`, with strict
`pack-selection-command.v3` and `pack-selection-entry.v3` branches. Use
`preparation-worker-input.v2`, `preparation-work-command.v2`, `preparation-work.v2`,
`preparation-work-entry.v2`, and matching receipt/read/export v2 branches for the new
binding. Select `disposition-code.v3` under a fixed server-controlled worker profile
v2; retain the same synthetic identities and grant purposes. Existing v1/v2
interpretations and denial/replay stay intact;
no old publication gains the new capacity. The packet remains the same bounded
checklist, reconciliation and unsent request, with disposition abstention.

The new input binds the selected record, exact Case/C/head, current Discovery basis,
publication P/head, work U/head and **each participating bundle ID/hash plus original
artifact locators**. All sources required by the published artifact must fit; no
best-two selection, truncation, source winner or hidden carry-forward. Preserve
record/delivery associations and genuine opposing reports across bundles. Selecting
newer source text never resolves a conflict or proves delivery.

Limits across the whole input: at most two bundles, 200 physical queue-row occurrences,
20 associated support occurrences, 2 MiB parsed UTF-8, 64 questions, 256 KiB result and
five seconds computation. Count occurrences conservatively across bundles even when
bytes are shared; deduplicate report business coverage by record identity separately.
Whole-bundle read scope must be permitted. A third cited bundle remains an explicit
limit, not permission for a general history scan or larger worker. Later continuation
beyond this bound requires a separately justified decision; history cannot be deleted.

Validate resource eligibility on the read-only preflight **and again at start**;
`can_start` must not invite a command already known to exceed this bound. Recheck
current scope, identity, effectivity, C/D/P/U and exact inputs at start and terminal
transaction. Capture computation before writer waiting. No model/external tool calls,
scheduler, background resume or automatic financial retry.

Reuse the existing supporting U journal and retained bytes. Migration 0009 constrains
selection entries to v1/v2 and work entries to v1. Propose additive checksum migration
0010 to admit the new strict versions in those existing tables; no new table, change
to applied checksums or rewritten entry. New versions replay with their original budget
and interpreter. Old commands and failed/pending/history stay reconstructable.
Exact keys return original receipts without renewed permission; cross-tab claims,
interruption and late-result fencing remain unchanged. Reads/exports are side-effect free.

## Smaller valid alternative and unresolved choice

**Available now:** retain/attach the evidence, inspect fresh Discovery, and let a
person prepare the follow-up using the existing unsent agenda. Keep the worker's
one-bundle refusal visible. This needs no new runtime boundary and is the recommended
path until this proposal is approved. It does not establish a business outcome.

Approve the two-bundle version only if one additional evidenced worker preparation
is useful enough to justify the compatibility/migration work. It does not solve an
unbounded sequence of customer replies. Do not create compacted authoritative snapshots
or remove old citations as a shortcut; that would be another interpretation boundary.

Acceptance: F1–F7 in the linked guide, including two-bundle success after fresh consent,
third-bundle/aggregate overflow denial, historical v1/v2 replay, no transferred approval,
wrong association, same-subject conflicts, stale input, concurrent commands, exact retry,
restart and unchanged financial/verification/closure guards. Existing D6–D12 and ECC
remain required. New proof/acceptance or imported-dispute business-disposition contracts
are explicitly outside this amendment and need their own concrete decision first.
