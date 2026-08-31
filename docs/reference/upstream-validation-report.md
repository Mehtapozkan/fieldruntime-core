# Field Runtime ECC v0 - Validation Report

**Date:** 2026-08-26  
**Package version:** 0.1.0

- PASS: `01_Product_Contract_v0.yaml` parses as YAML.
- PASS: `02_Workflow_Contract_v0.yaml` parses as YAML.
- PASS: `03_Decision_Graph_v0.yaml` parses as YAML.
- PASS: `04_Authority_Matrix_v0.yaml` parses as YAML.
- PASS: canonical data model JSON Schema is valid Draft 2020-12.
- PASS: evaluation case JSON Schema is valid Draft 2020-12.
- PASS: all 30 evaluation fixtures validate against the evaluation case schema.
- PASS: exactly 30 unique, sequential evaluation case IDs are present.
- PASS: every Decision Graph transition points to a declared node or terminal node.
- PASS: all fixture expected final states are declared workflow states.
- PASS: authority matrix role columns and permission codes are complete and valid.
- PASS: `03_Decision_Graph_v0.png` was generated.
- PASS: `05_Canonical_Data_Model_v0.png` was generated.
- PASS: `05_Canonical_Data_Model_v0.postgresql.sql` was generated.

## Result

**PASS - structural and schema checks only. NOT APPROVED for runtime activation;
see Contract Parity and Precedence.**
