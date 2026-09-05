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

The implemented inventory is in [README.md](README.md#what-works-today) and
[STATUS.md](STATUS.md): canonical Case history, PostgreSQL persistence, synthetic
Decision Packets and human review, deterministic authority, the bounded simulated
credit API and the ECC evaluation. D7-C independent verification is implemented on
the review branch; Workbench action/check controls remain pending. These current
source capabilities are not all in the historical published prerelease. Listing a
possible Core component above does not claim it is implemented today.

Organizations can inspect, modify, self-host, test providers against, and export
from this core under the license terms.

## Potential commercial and managed offerings

Field Runtime may separately offer software and services that are not contained in
this repository. This is a potential offering, not an implemented product list or
claim that these services are available today. Possibilities include:

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
