-- D-033: extend the existing append-only operation journal. Prior migrations and
-- all Case/review/source rows remain untouched. Enrollment is still explicit.
ALTER TABLE simulated_action_journal DROP CONSTRAINT simulated_action_journal_id_check;
DO $$
DECLARE old_schema_constraint text;
BEGIN
  SELECT conname INTO STRICT old_schema_constraint FROM pg_constraint
    WHERE conrelid = 'simulated_action_journal'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%simulated-action-journal-entry.v1%';
  EXECUTE format('ALTER TABLE simulated_action_journal DROP CONSTRAINT %I', old_schema_constraint);
END;
$$;
ALTER TABLE simulated_action_journal
  ADD CONSTRAINT simulated_journal_version CHECK (entry ? 'schema_version' AND (
    (entry ->> 'schema_version' IN ('simulated-action-journal-entry.v1', 'simulated-action-journal-entry.v2') AND id ~ '^attempt_[A-Za-z0-9_-]{1,119}$') OR
    (entry ->> 'schema_version' = 'simulated-credit-verification-entry.v1' AND id ~ '^verification_[A-Za-z0-9_-]{1,115}$' AND entry -> 'source' = 'null'::jsonb AND entry ? 'action_entry_hash')
  )),
  ADD COLUMN verified_action_hash text GENERATED ALWAYS AS (entry ->> 'action_entry_hash') STORED,
  ADD CONSTRAINT verification_action_binding FOREIGN KEY (verified_action_hash)
    REFERENCES simulated_action_journal (event_hash) DEFERRABLE INITIALLY DEFERRED;
