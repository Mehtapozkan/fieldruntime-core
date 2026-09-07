# D-034 — One assisted invoice-dispute intake boundary

Status: **Proposed**. No human approval or implementation is recorded.
Prepared during D8-B's documentation reconciliation; not authorization to implement
D9 or use customer data. [Requirements I1/R1/P6](../product/requirements-implementation-matrix.md)
and the [canonical specification](../product/workflow-discovery.md) own the product
requirements. This record isolates the first-workflow/data decision for review.

## Proposed decision

Use one operator-reviewed commercial invoice-dispute queue as the first assisted
order-to-cash/Revenue ECC assignment: prepare evidence-backed dispositions and
coordinate review. Keep canonical Case and WorkEvent primitives and a coherent
upstream Case's system of record. Do not activate a new pack, change the frozen ECC
corpus, broaden Orchid's simulated credit profile or implement a second Case model.
The queue, buyer, process owner, operator, population window and objective/close
evidence must be confirmed before its operating contract is frozen. If the chosen
assignment cannot fit ECC, propose that exact first-workflow amendment separately.

D9-A should first specify a minimal input/provenance contract using synthetic
fixtures: one queue export plus supporting documents, source record/version and
business-object links, retained content/byte bindings, source occurrence time,
distinct ingestion and journal recording semantics, source timezone validation,
coverage/unknowns, reviewed matching and repeat-import handling. Preserve strict v0
schemas; any necessary fields get explicit versioned contracts, not implicit
reinterpretation. The existing engine's source identity/idempotency rules remain.

Before an assisted evaluation uses real samples, approve a **named, customer-scoped
local data boundary** for those particular exports/documents. The proposed default
is read/propose only, customer-authorized minimized/redacted exports in a private
workspace with explicitly permitted reviewers, retention and export/deletion rules.
No connector credentials, external writes, hosted customer service, provider upload,
cross-customer reuse, public repository fixtures/logs/screenshots or website upload.
Do not mistake the unauthenticated loopback preview for customer-data security.
Synthetic test catalogs cannot authenticate a real operator or grant business
authority. An approved data-handling plan does not enable consequential execution.

This is a scoped assisted-evaluation proposal, not a production-authentication or
enterprise-ingestion project. If adequate access/storage/retention controls cannot
be established for a sample, continue with synthetic or appropriately approved
redacted fixtures. Do not silently accept the risk or expand the public appliance.

## Concrete examples for review

- A supplied queue contains dispute `INV-101`, a referenced delivery and a CRM
  note. Preserve all source/version links and both conflicting claims. Propose the
  Case link; ambiguous matches await a reviewer. The packet can be evaluated for
  usefulness, but it grants no credit, collection or closure permission.
- Importing the same export again cannot duplicate its Cases/events. A changed
  delivery row under the same source identity must retain a version/conflict that
  an operator can review; it cannot overwrite prior evidence or inherit consent.
  D9-A must define the exact changed-row semantics before implementation.
- An export lacks its population denominator or start times. Show coverage gaps,
  not a zero exception rate or labor saving. Journal time is not ingestion time.
- A customer offers a live CRM login or unapproved sensitive attachment. It is
  outside this proposed export-only boundary; do not ingest or connect it. Establish
  the applicable later boundary rather than adding a hidden provider/connector.
- A reviewer accepts the packet. Record task usability under the future reviewed
  acceptance contract; do not relabel it as a verified business outcome. D-013 and
  D-033 still deny unsupported Case closure and external action.

## Compatibility and human approval point

D-001/D-007 keep Case-first ECC; D-011/D-012 and D-016 preserve source versus
journal identity and explicit attachment; D-027–D-031 permit formation/import
planning without inferred authority. D-005/D-023 and the frozen constitution
currently cover synthetic loopback evaluation only. **They do not approve real
customer samples.** Human approval of an explicit limited evaluation/data amendment
is required before crossing that boundary. Source precedence, identity/authority,
retention, intervention/correction promotion and complete closure rules cannot be
approved by a Discovery finding. D11 must bring concrete amendments if needed.

The decision to approve is: **may this one named customer queue be evaluated using
the reviewed private export-only, read/propose boundary, and does its assignment
remain within ECC?** Before approval, fill in the customer/data custodian, buyer
and workflow owner, sample/file set, permitted people/location, classification and
redaction, access controls, retention/deletion/export method, incident contact and
purpose. Those facts are currently unknown; no blanket permission is recorded.

D9-A's review must show source-byte/provenance reconstruction, repeat/changed import
examples, rejected unsupported/out-of-scope inputs, uncertain matching, portable
export, time/coverage semantics and isolation of customer knowledge from public
fixtures. D9-B may implement only the subsequently reviewed scope. Connected
read-only shadow operation stays D17–D18; production writes stay D20.

No runtime contract, migration, customer-data processing, release or deployment is
included in this decision record. Existing D8-B review/merge instructions remain.
