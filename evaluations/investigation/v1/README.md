# Frozen synthetic investigation evaluation v1

The 24 held-out records and rubric are frozen before the first adapter prompt.
`SHA256SUMS` binds the exact files; changes require a new evaluation version, never
a replacement after inspecting failures. No prompt/runtime code may import holdout
answers. Hermetic conformance tests do not establish model usefulness.

Comparison arms: unchanged deterministic preparation, bounded investigation and a
generic assistant, on identical permitted retained inputs and equal allowed budgets.
A blinded operator scores interpretation as well as citations. No comparison has
run; the 18/24 target is an experiment. Invalid/unavailable/timeout/open work remains
in the denominator. The scoped records are input specifications for disposable intake
fixtures, not customer data or historical routes. Boundary variants retain complete
input occurrences and test refusal; never clip a record to get a passing score.

Development material is separate in `../development/`; the model sees neither this
rubric nor expected answers. Live activation and evaluation spending remain unapproved.
