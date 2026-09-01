# Open Core Boundary

Field Runtime's goal is customer ownership, provider choice, and inspectable
operational authority—not lock-in.

## Apache-licensed core

This repository makes the following evaluation components available under Apache
License 2.0:

- Canonical Case, journal, workflow, and evaluation contracts.
- Deterministic case state, scope, idempotency, replay, and integrity rules.
- PostgreSQL evaluation persistence and the loopback-only local appliance.
- The ECC synthetic workflow pack, fixtures, Production Test, and receipts.
- The Guided Workbench and bounded adapter interfaces added to this repository.

Organizations can inspect, modify, self-host, test providers against, and export
from this core under the license terms.

## Commercial and managed products

Field Runtime may separately offer software and services that are not contained in
this repository, including:

- Managed control planes, fleet administration, upgrades, backup, and high
  availability.
- Enterprise identity, SSO, SCIM, tenancy administration, and policy operations.
- Certified live connector packs and governed production action gateways.
- Hosted evaluation, observability, economic analysis, certification, support, and
  implementation services.

The Field Runtime trademarks remain governed by `TRADEMARKS.md`. Commercial terms
do not narrow the Apache 2.0 rights granted for files actually published here.

## Current product boundary

The open repository is still an evaluation preview. It uses synthetic data,
simulated authority, and no external writes. Production authority must be earned
through later, explicitly documented milestones.
