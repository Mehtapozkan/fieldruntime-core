# Domain

Provider-neutral deterministic vocabulary and rules. No provider SDK, connector,
database client, or model output type may enter this package.

`resolveAuthority(...)` is the pure D6-B business-authority resolver. It binds an
Authority Request to one exact Case version and consequence hash, selects one
current rank-one policy, evaluates its threshold rule, resolves scoped authority
records and delegations, and counts only exact prior Authority Decisions. It
returns a deeply immutable `authority-resolution-result.v0` value with satisfied
and outstanding requirements or an explicit fail-closed outcome.

The resolver accepts its complete state and canonical as-of time as inputs. It
does not read a database, invoke a provider, infer authority from role labels or
history, execute actions, or mutate Case state.
