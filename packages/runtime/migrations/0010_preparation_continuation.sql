-- Accepted D-038: additive version admission only. No historical entry is rewritten.
ALTER TABLE preparation_pack_selection DROP CONSTRAINT pack_selection_supported_version;
ALTER TABLE preparation_pack_selection ADD CONSTRAINT pack_selection_supported_version
  CHECK (entry ->> 'schema_version' IN ('pack-selection-entry.v1','pack-selection-entry.v2','pack-selection-entry.v3'));
DO $$ DECLARE constraint_name text; BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid='preparation_work_journal'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%schema_version%'
  LOOP EXECUTE format('ALTER TABLE preparation_work_journal DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;
ALTER TABLE preparation_work_journal ADD CONSTRAINT preparation_work_supported_version
  CHECK (entry ->> 'schema_version' IN ('preparation-work-entry.v1','preparation-work-entry.v2'));
