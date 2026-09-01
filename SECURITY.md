# Security Policy

## Release boundary

Field Runtime Core `0.1.x` is an evaluation preview. It is designed for a
single-machine, loopback-only, synthetic demonstration with external writes off.
It is not a production service and must not be exposed to a LAN or the public
internet.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
security advisory flow:

<https://github.com/Mehtapozkan/fieldruntime-core/security/advisories/new>

Include the affected commit or version, reproduction steps, impact, and any known
workaround. Do not include real customer data, credentials, or production payloads.

The maintainers will acknowledge a complete report when practical, investigate it,
and coordinate disclosure after a fix or documented mitigation is available. The
evaluation preview has no support or remediation SLA.

## Supported versions

| Version                        | Support                       |
| ------------------------------ | ----------------------------- |
| `0.1.x` evaluation preview     | Security fixes when practical |
| Unreleased development commits | No support commitment         |

## Explicit exclusions

This policy does not turn the evaluation preview into a production, compliance,
availability, or security-certified product. The threat model and known gaps remain
authoritative.
