-- D-041: admit explicit result/authority v2 in existing immutable journals.
-- No table, backfill, old checksum change, or history rewrite.
DO $$ DECLARE n text; BEGIN
 FOR n IN SELECT conname FROM pg_constraint WHERE conrelid='dispute_result_journal'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%schema_version%' AND pg_get_constraintdef(oid) NOT LIKE '%?&%'
 LOOP EXECUTE format('ALTER TABLE dispute_result_journal DROP CONSTRAINT %I',n); END LOOP;
END $$;
ALTER TABLE dispute_result_journal ADD CONSTRAINT dispute_result_supported_version
 CHECK(entry->>'schema_version' IN ('dispute-result-entry.v1','dispute-result-entry.v2'));
ALTER TABLE authority_snapshots DROP CONSTRAINT authority_snapshot_supported_version;
ALTER TABLE authority_snapshots ADD CONSTRAINT authority_snapshot_supported_version CHECK (
 content->>'schema_version' IS NOT NULL AND
 ((kind='catalog' AND content->>'schema_version'='authority-catalog.v1') OR
 (kind='material' AND content->>'schema_version' IN ('authority-review-material.v1','authority-review-material.dispute.v1','authority-review-material.dispute.v2')) OR
 (kind='evaluation' AND content->>'schema_version' IN ('authority-evaluation.v1','authority-evaluation.dispute.v1','authority-evaluation.dispute.v2'))));
ALTER TABLE authority_request_journal DROP CONSTRAINT authority_journal_supported_version;
ALTER TABLE authority_request_journal ADD CONSTRAINT authority_journal_supported_version
 CHECK(entry->>'schema_version' IN ('authority-request-journal-entry.v1','authority-request-journal-entry.dispute.v1','authority-request-journal-entry.dispute.v2'));
