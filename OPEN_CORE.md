# Open Core Boundary

Field Runtime's goal is customer ownership, provider choice, and inspectable
operational authority—not lock-in.

## Apache-licensed core

This repository currently makes its published files available under Apache License
2.0. The public/open Core may contain meaningful contracts and reference
implementations for:

- the canonical Case;
- evidence and provenance;
- identity and delegation vocabulary;
- authority contracts and reference behavior;
- action-gateway interfaces;
- independent-verification interfaces;
- receipt and outcome schemas;
- correction, replay, and evaluation;
- Intake and Case Formation contracts, including safe existing-Case mapping;
- Worker adapter and Worker Pack contracts; and
- a local evaluation workbench.

The current repository implements only the evaluation components identified in
`STATUS.md`, including canonical Case and journal contracts, deterministic Case
state and integrity rules, PostgreSQL evaluation persistence, the loopback-only
appliance, the ECC synthetic pack and Production Test, receipts, and the Guided
Workbench. Listing a possible open Core component does not claim that it is
implemented today.

Organizations can inspect, modify, self-host, test providers against, and export
from this core under the license terms.

## Commercial and managed products

Field Runtime may separately offer software and services that are not contained in
this repository, including:

- hosted Intake and Operational Legibility services;
- a managed Runtime Builder;
- customer-specific Organization Runtime Packs and configuration;
- production identity and policy operations;
- a managed worker fleet;
- certified production connectors;
- enterprise Control, fleet administration, upgrades, backup, and high
  availability;
- governed production action operations; and
- customer-specific outcome intelligence, certification, support, implementation,
  and managed services.

The Field Runtime trademarks remain governed by `TRADEMARKS.md`. Commercial terms
do not narrow the Apache 2.0 rights granted for files actually published here.

## Current product boundary

The open repository is still an evaluation preview. It uses synthetic data,
simulated authority, and no external writes. Production authority must be earned
through later, explicitly documented milestones.
