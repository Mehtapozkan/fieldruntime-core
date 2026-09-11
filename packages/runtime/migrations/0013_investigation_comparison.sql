-- D-040 evaluation readiness: explicit mock HTTP comparison versions only.
-- No live activation, provider credential, source write or historical rewrite.
ALTER TABLE preparation_pack_selection DROP CONSTRAINT pack_selection_supported_version;
ALTER TABLE preparation_pack_selection ADD CONSTRAINT pack_selection_supported_version
  CHECK (entry ->> 'schema_version' IN ('pack-selection-entry.v1','pack-selection-entry.v2','pack-selection-entry.v3','pack-selection-entry.v4','pack-selection-entry.v5'));
ALTER TABLE preparation_work_journal DROP CONSTRAINT preparation_work_supported_version;
ALTER TABLE preparation_work_journal ADD CONSTRAINT preparation_work_supported_version
  CHECK (entry ->> 'schema_version' IN ('preparation-work-entry.v1','preparation-work-entry.v2','preparation-work-entry.v3','preparation-work-entry.v4'));
