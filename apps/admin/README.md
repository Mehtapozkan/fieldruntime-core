# Guided Workbench

The browser workbench opens directly into the synthetic Acme SSO escalation. It
is a four-stage, no-typing walkthrough:

- **Case** converges Slack, Linear, CRM, and policy evidence without hiding the
  Slack-versus-Linear conflict.
- **Decision** shows three proposed paths and reveals the people and policy gates
  that would govern each consequence.
- **Act & Verify** previews the exact fixture payload and runs a deterministic
  silent-failure simulation. A connector reports success; an independently
  identified fixture read-back finds no change, so the simulated effect is
  rejected and cannot serve as case-resolution proof. The authoritative case
  remains `needs_review`.
- **Receipt** reconstructs the simulation trace, safe recovery, correction
  preview, and unpromoted learning candidate.

The UI fetches the immutable fixture and its schema-bound guided walkthrough from
same-origin GET endpoints. A missing, unsafe, cross-bound, or malformed record
closes the workbench with an explicit error. It does not fall back to invented
case data.

## Safety boundary

`Synthetic`, `Guided simulation`, and `External writes off` remain visible at all
times. UI controls preview or reveal data and run a local deterministic
simulation; they do not record approval, call the case-command endpoint, create a
production receipt, or perform an external effect.

The workbench uses accessible vanilla HTML, CSS, and one ES module. It has no
runtime dependency, external asset, third-party font, analytics call, inline
script, or inline style. The state reducer and boundary model builder are exported
from `public/workbench.js` for direct Node testing.
