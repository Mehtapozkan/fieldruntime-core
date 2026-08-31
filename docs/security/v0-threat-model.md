# v0 Threat Model

Scope: local synthetic evaluation only. This is not a production threat-model
claim.

| Threat                         | Target v0 control                                              | Current implementation                                              | Required sentinel        |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------ |
| Cross-tenant evidence exposure | Authenticated tenant isolation plus case/evidence scope checks | WorkEvent tenant/scope checks; no authenticated tenant boundary yet | FR-EVAL-008              |
| Agent bypasses authority       | Models propose only; Action Gateway is sole write path         | Contract/evaluation sentinel only; no external write path           | FR-EVAL-028              |
| Duplicate event or effect      | Source-event uniqueness and action idempotency                 | Source identity and same-key retries; external effects absent       | FR-EVAL-007, FR-EVAL-010 |
| Unverified closure             | Transition plus independently accepted evidenced outcome       | Every transition to `resolved` is denied pending proof engine       | FR-EVAL-026, FR-EVAL-027 |
| Incomplete financial authority | Exact role set and recomputed payload-bound approvals          | Claimed executed actions fail closed; authority engine absent       | FR-EVAL-015              |
| Runaway model/tool use         | Explicit budget stop and partial packet                        | Contract and evaluation sentinel only                               | FR-EVAL-029              |
| Unsafe learning promotion      | Eval, replay, named approval, version, rollback                | Contract and evaluation sentinel only                               | FR-EVAL-030              |

v0 contains no live connector credentials or external write path. Before any live
read or staged write, add tenant-isolation policies, secret handling, connector
signature verification, payload logging redaction, kill-switch tests, backup and
restore, and an independently reviewed deployment threat model.
