# Invoice-dispute Challenge: proposed customer comparison protocol

**Synthetic rehearsal implemented; customer comparisons not run. Real-customer
processing is unapproved.** This is the first bounded D13 delivery, not an outcome,
ROI or production-authentication product. The [report](challenge-report.md) is a
read-only view of retained evidence. No individual pack, task or business action
is approved by this protocol.

## Assignment and acceptance, before selecting the sample

Proposed buyer: the accountable accounts-receivable/credit-control process owner;
proposed operator: an invoice-dispute analyst. The actual customer, buyer, operator,
finance/measurement owner and data custodian remain **unnamed**. They must agree
that the invoice-dispute assignment fits their workflow and confirm the acceptance
criteria before an evaluation, rather than selecting criteria after seeing results.

The narrow task is to prepare a cited evidence-request packet for an unresolved
invoice dispute: scoped delivery claims, source discrepancies, missing governing
terms and owners, an unsent follow-up and a clear next human action. It must not
choose a credit, infer non-delivery from missing confirmation or resolve the dispute.

A reviewer accepts **task usefulness** only when the packet identifies the correct
record/entity, includes all material conflicting and missing inputs, supports claims
with applicable citations, labels source reports/unknowns, avoids invented ownership
or governing rules, and offers a usable unsent request. Record accept/reject/modify/
escalate, the exact packet and reason, consequential omissions/errors, correction
rounds, and any missing inputs that prevent a fair review. A failed, interrupted or
unfinished task stays in the cohort; do not score it as an accepted outcome.

## Cohort, baseline and fair comparison

1. Pre-register one workflow boundary, entity/region, period and eligibility rule,
   including normal and exceptional records where available. Retain an exact input
   manifest and the complete eligible count. Start with up to 25 distinct exception
   Cases, documenting the Case/record relationship. An exception-selected sample
   **cannot establish an overall exception rate**. Multiple records in one Case,
   repeated preparations and retries do not create new cohort members. Preserve
   exclusions, unavailable source inputs and all open/failed work.
2. Collect a manual baseline **before intervention** using an observed comparable
   task, not recollected ideal time. Proposed observation window: ten business days
   for preparation/review, followed by up to 30 calendar days to observe acceptance,
   reopen/reversal and any separately evidenced business result. Dates, working-time
   conventions and extension policy require customer agreement; do not backfill
   missing observations with zero or drop unresolved Cases at the window boundary.
3. Compare manual work, the fixed Field Runtime preparation and a generic assistant
   on the **same allowed source material and target deliverable**, with the same
   tool access, evidence cut-off and pre-agreed time/token/cost ceilings. In this
   rehearsal all three have local files only, no external messages/writes. The
   runtime makes zero model calls. The generic assistant's model/version/prompt,
   tool permissions and budget would be recorded; none has been run or chosen yet.
   A model/provider run on real material needs its own permitted-processing approval.
4. Prefer a balanced randomized assignment of comparable records/operators and
   blind packet review where practical. If the same operator handles the same
   record twice, disclose recall/order effects; counterbalance order and do not
   treat the second pass as an independent baseline. Match evidence sufficiency,
   complexity and operator readiness; retain unmatched strata as incomparable.
5. Record paired quality and effort results, distributions/coverage and failures,
   not only the best packet. If review, correction or support consumes the apparent
   gain, narrow or improve the assignment before allocating more work. A generic
   assistant comparison must not hide its human prompting/verification costs.

The useful-packet-within-ten-minutes target is an **experiment**, measured from
explicit task start to a packet passing the agreed review, including correction and
support; report both wall-clock intervals and active effort, labelled separately.
The returning-second-batch / two returning design partners / one paid-continuation
targets are proposed experiments, **not achieved customer traction or PMF**.

## Five proof measures and effort accounting

| Separate measure         | Evidence and denominator required before a claim                                                                                                                                              | Current rehearsal                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Cash collected           | Matched posted cash receipts, obligation/cohort, currency, period, gross cash and reversals; credit value/invoice principal excluded                                                          | Unknown; no cash-source observation                                                                    |
| Disputes resolved        | Unique dispute IDs, agreed close definition and accountable customer acceptance, reopen history, complete eligible/open denominator                                                           | Unknown; task acceptance is not dispute resolution                                                     |
| Credits issued           | Unique posted credits, currency/amount, independent source observation, originating attempt, reversals and coverage; synthetic separated from real                                            | Unknown in this preparation archive; D7 synthetic credit records are a separate evidence path          |
| Work newly attended to   | Unique eligible records, established lookback showing no prior substantive attention, newly useful progress and coverage; include withdrawn/retracted claims                                  | Unknown; import, repeat run and acceptance alone do not establish previously unattended work           |
| Human attention released | Signed comparable baseline minus **all** active person-minutes for preparation, review, correction, verification and founder/support; non-overlapping per-person intervals; failures included | Unknown aggregate; a retained scripted negative note demonstrates capture, not measured customer labor |

Record elapsed/waiting/handoff intervals separately. Overlapping waits do not add up
to cycle time and are never human labor; shared human contributions must be attributed
once with overlap references, not double counted across Cases or measures. Retain
negative results, reopening, reversals, corrections, exclusions and coverage gaps.

Costs: record **model/tool**, **infrastructure**, **direct human**, **founder/support**
and **setup/integration/training** separately, each with unit/currency, source,
measurement versus estimate, owner, period, coverage and one-time/recurring treatment.
Zero model calls is not evidence of zero infrastructure, human or support cost. Keep
setup separate from recurring delivery; do not allocate the same support effort to
both direct labor and founder support. Any allocation basis must be explicit.

Preparation effort per accepted packet uses all attributable task effort (including
failed/open/rejected attempts) divided by distinct accepted packet IDs, with repeat
packets disclosed separately from unique records. Effort per independently verified,
customer-accepted business outcome needs a **different** evidenced denominator and
all downstream effort. With no such outcome, report unavailable, not zero cost.
Before claiming cycle-time improvement, labor savings or cost per accepted outcome,
obtain the baseline, complete effort/cost coverage, compatible cohorts and independent
outcome/customer-acceptance evidence. Timestamp differences cannot supply them.

## Proposed real-data activation sheet — not approved

Complete these fields under [Accepted D-034's real-data boundary](../architecture/d9-assisted-intake-boundary.md#real-customer-activation-and-deletion-boundary).
The synthetic approval does not authorize a customer session with real files.

| Approval item                         | Concrete proposed arrangement                                                                                                                                                                                                                                 | Missing customer decision / activation gate                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose and responsible people        | One named invoice-dispute preparation evaluation; buyer/process owner, operator, data custodian, assisted evaluator, incident and deletion owner named                                                                                                        | Names, ECC/workflow fit, lawful export/processing authority and acceptance criteria                                                                                                                                    |
| File custody and permitted processing | Custodian exports and minimizes/redacts a fixed manifest, retaining private lineage to originals. Parse only approved CSV/TXT/MD fields; retain supported opaque bytes only if necessary. No model/provider upload, external tools, source writes or messages | Exact manifest, classification, excluded personal/commercial fields, export permissions, permitted operations and people                                                                                               |
| Identity and tenant mapping           | Appliance has `tenant_intake_demo`, synthetic seats and entity North/South; worker preparation is North-only. Seats are not authentication. Use a dedicated synthetic rehearsal until an explicitly approved mapping/identity arrangement exists              | Customer entity/scope/record mapping, private access enforcement, suitability of synthetic seat attribution. Do not silently relabel customer entities as North or pretend a synthetic reviewer authenticates a person |
| Access and storage                    | Customer-dedicated encrypted local machine/account, isolated evaluation database, named OS access, loopback only, no cloud sync/public demo/CI/log uploads; inventory operator downloads and exports                                                          | Device/location, encryption and accounts, permitted people, incident handling, export recipients and any backup obligations                                                                                            |
| Retention and deletion                | Proposed complete-copy disposal within 30 days after evaluation end and at most 90 days after first ingestion, earlier on custodian instruction; any extension explicitly approved                                                                            | Dates, owner/method, downloaded archives/reports, caches/backups and deletion confirmation; customer custody of permitted portable copy                                                                                |
| Unsupported requirements              | Stop if shared hosting, selective erasure, legal hold, provider processing, real authentication or new scope isolation is required                                                                                                                            | Specific separate decision/amendment and approval before implementing or activating the new boundary                                                                                                                   |

Actual supported intake: one strict UTF-8 CSV (1 MiB, 2,000 rows, fixed columns),
TXT/MD parsed as text (512 KiB each), PDF/PNG/JPEG retained-only (5 MiB each; no OCR,
PDF extraction or malware certification), at most 16 supports/20 MiB total. No Office,
email, archives or URL fetching. The worker is narrower: one selected record, at
most 200 physical queue rows, 20 associated supports, 2 MiB parsed input, four fixed
steps, 64 questions, 256 KiB result and five-second computation bound. Fit and actual
limits must be checked before approving a session; a queue snapshot cannot establish
historical routes, waiting or active effort. Retained-only bytes do not establish
parsed content. Governing terms and accountable owners still need people.

Disposal covers the isolated dataset, bytes, journals, indexes, reports/exports,
caches/downloads and controlled backups. After disposal this copy cannot replay;
do not promise indefinite reconstruction and full deletion together. No new access,
retention, tenant or persistence boundary is implemented by this D13 report.

## Next dependencies

Review the synthetic report and definitions first. Then name a customer and complete
this activation sheet; collect a baseline and approve the comparable assignment
before any real ingestion. Run and report the manual/generic-assistant comparisons
only within approved data/tool limits. Verify separate business outcomes and measured
costs before an economics claim. A paid next batch or bounded 30-day evaluation is an
explicit customer choice; no external action, outreach, release or deployment is
performed by this work. The public Apache-2.0 reference remains usable independently
of any potential commercial offering.
