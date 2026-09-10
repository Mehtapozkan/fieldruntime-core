-- Accepted D-039. One supporting history; existing Case/intake/review data is retained.
CREATE TABLE dispute_result_journal (
 tenant_id text NOT NULL CHECK (tenant_id='tenant_intake_demo'),
 case_id text NOT NULL,
 record_key text NOT NULL CHECK (record_key ~ '^sha256:[0-9a-f]{64}$'),
 sequence bigint NOT NULL CHECK(sequence BETWEEN 1 AND 9007199254740991),
 id text NOT NULL UNIQUE,
 entry_hash text NOT NULL UNIQUE,
 previous_entry_hash text,
 previous_sequence bigint GENERATED ALWAYS AS (CASE WHEN sequence>1 THEN sequence-1 ELSE NULL END) STORED,
 operation text NOT NULL CHECK (operation NOT IN ('request_authority','review_authority')),
 idempotency_key text NOT NULL,
 command_fingerprint text NOT NULL,
 recorded_at text NOT NULL,
 authority_position bigint NOT NULL,
 authority_state_revision bigint NOT NULL,
 entry jsonb NOT NULL CHECK(jsonb_typeof(entry)='object'),
 PRIMARY KEY(tenant_id,case_id,sequence),
 UNIQUE(tenant_id,case_id,sequence,entry_hash),
 UNIQUE(tenant_id,operation,idempotency_key),
 CHECK((sequence=1 AND previous_entry_hash IS NULL) OR (sequence>1 AND previous_entry_hash IS NOT NULL)),
 CHECK(entry ?& ARRAY['schema_version','tenant_id','case_id','record_key','sequence','id','hash','previous_entry_hash','operation','idempotency_key','command_fingerprint','recorded_at','authority_position','authority_state_revision']),
 CHECK(entry->>'schema_version'='dispute-result-entry.v1'),
 CHECK(entry->>'tenant_id'=tenant_id AND entry->>'case_id'=case_id AND entry->>'record_key'=record_key),
 CHECK(entry->>'sequence'=sequence::text AND entry->>'id'=id AND entry->>'hash'=entry_hash),
 CHECK(entry->>'previous_entry_hash' IS NOT DISTINCT FROM previous_entry_hash),
 CHECK(entry->>'operation'=operation AND entry->>'idempotency_key'=idempotency_key AND entry->>'command_fingerprint'=command_fingerprint),
 CHECK(entry->>'recorded_at'=recorded_at AND entry->>'authority_position'=authority_position::text AND entry->>'authority_state_revision'=authority_state_revision::text),
 FOREIGN KEY(tenant_id,case_id,previous_sequence,previous_entry_hash) REFERENCES dispute_result_journal(tenant_id,case_id,sequence,entry_hash) DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER dispute_result_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON dispute_result_journal
 FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
-- Admit a separately validated material interpreter, without editing applied 0002.
DO $$ DECLARE n text; BEGIN
 FOR n IN SELECT conname FROM pg_constraint WHERE conrelid='authority_snapshots'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%schema_version%'
 LOOP EXECUTE format('ALTER TABLE authority_snapshots DROP CONSTRAINT %I',n); END LOOP;
 FOR n IN SELECT conname FROM pg_constraint WHERE conrelid='authority_request_journal'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%schema_version%' AND pg_get_constraintdef(oid) NOT LIKE '%?&%'
 LOOP EXECUTE format('ALTER TABLE authority_request_journal DROP CONSTRAINT %I',n); END LOOP;
END $$;
ALTER TABLE authority_snapshots ADD CONSTRAINT authority_snapshot_supported_version CHECK (
 content->>'schema_version' IS NOT NULL AND
 ((kind='catalog' AND content->>'schema_version'='authority-catalog.v1') OR
 (kind='material' AND content->>'schema_version' IN ('authority-review-material.v1','authority-review-material.dispute.v1')) OR
 (kind='evaluation' AND content->>'schema_version' IN ('authority-evaluation.v1','authority-evaluation.dispute.v1'))));
ALTER TABLE authority_request_journal ADD CONSTRAINT authority_journal_supported_version CHECK(entry->>'schema_version' IN ('authority-request-journal-entry.v1','authority-request-journal-entry.dispute.v1'));
