# v0 Threat Model

Scope: local synthetic evaluation only. This is not a production threat-model
claim.

| Threat                         | v0 control                                                    | Required sentinel        |
| ------------------------------ | ------------------------------------------------------------- | ------------------------ |
| Cross-tenant evidence exposure | Tenant and scope on case/evidence; deny on mismatch           | FR-EVAL-008              |
| Agent bypasses authority       | Models propose only; future Action Gateway is sole write path | FR-EVAL-028              |
| Duplicate event or effect      | Tenant/source event uniqueness and action idempotency         | FR-EVAL-007, FR-EVAL-010 |
| Unverified closure             | Deterministic transition plus accepted evidenced outcome      | FR-EVAL-026, FR-EVAL-027 |
| Incomplete financial authority | Exact role set and payload-bound approvals                    | FR-EVAL-015              |
| Runaway model/tool use         | Explicit budget stop and partial packet                       | FR-EVAL-029              |
| Unsafe learning promotion      | Eval, replay, named approval, version, rollback               | FR-EVAL-030              |

v0 contains no live connector credentials or external write path. Before any live
read or staged write, add tenant-isolation policies, secret handling, connector
signature verification, payload logging redaction, kill-switch tests, backup and
restore, and an independently reviewed deployment threat model.
