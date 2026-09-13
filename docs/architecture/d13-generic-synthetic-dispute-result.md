# D-041 — Versioned synthetic dispute result enrollment

Status: Accepted for this bounded implementation by the owner's September 12, 2026 assignment.

Stack from open Core PR #44 at 038b8d44b2e5cb4eb2ad1efd5c798d752161bc8a. Preserve PRs #40–#44, D-039 v1, applied migrations and Platform. No model/provider, credentials, customer data, messages, financial writes, merge, release, deployment or Case Receipt work.

Add strict result v2 and authority material v2, with a host-configured immutable profile binding an existing canonical Case and exact retained intake record/evidence, policy hash/version, named separated roles, one no-adjustment disposition and a read-only synthetic source. Normal business commands cannot select enrollment, source, policy or identities. Explicit host enrollment records the profile in the existing result journal; all subsequent commands bind its hash.

Reuse the existing D-039 command interpreter, D6 resolver, writer transaction, result journal and replay, dispatching profile/source interpretation by recorded version. Do not copy the lifecycle into a parallel engine. Add only version admission to existing PostgreSQL constraints; no new table. V1 schema bytes, source interpretation, receipts and exact retries remain unchanged.

The synthetic Case Lab fixture fixes 2026-09-07 UTC, arrival 14:43, deadline 15:00, unloading 15:27, an arrival-based term, invoice 1000000/payment 960000/dispute 40000 minor units. This is supplied policy/evidence, not language interpretation. Reported disposition is not source observation; a matching source is not business acceptance. Later reliable mismatch permits explicit reopen, retaining history and removing current success. Closure stays denied.

Worker input is a separate read projection of already-retained, committed record evidence. It excludes the source port, verifier state and result/acceptance history. Full result export is privileged audit material, never worker context. New source interpretation compares both independent reads and preserves unavailable/malformed/changing as inconclusive.

Required validation covers exact bindings, role and caller-input attacks, source failures, retry/stale heads, acceptance/reversal, persisted restart/export, historical v1, ECC and negative control. Final validation and public entrypoints are recorded in the handoff guide. Stop after the separate open draft Core PR.
