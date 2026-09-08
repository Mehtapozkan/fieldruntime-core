-- Accepted D-034. New supporting records only; previous checksums are unchanged.
CREATE TABLE intake_artifacts (
  tenant_id text NOT NULL CHECK (tenant_id = 'tenant_intake_demo'),
  byte_hash text NOT NULL CHECK (byte_hash ~ '^sha256:[0-9a-f]{64}$'),
  bytes bytea NOT NULL CHECK (octet_length(bytes) <= 5242880),
  PRIMARY KEY (tenant_id, byte_hash)
);
CREATE TABLE intake_bundles (
  tenant_id text NOT NULL CHECK (tenant_id = 'tenant_intake_demo'),
  id text NOT NULL CHECK (id ~ '^intake_bundle_[0-9a-f]{64}$'),
  bundle_hash text NOT NULL UNIQUE CHECK (bundle_hash ~ '^sha256:[0-9a-f]{64}$'),
  preparation_key text NOT NULL,
  preparation_fingerprint text NOT NULL,
  ingested_at text NOT NULL,
  retained_at text NOT NULL,
  bundle jsonb NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, preparation_key),
  CHECK (bundle ->> 'schema_version' = 'intake-bundle.v1'),
  CHECK (bundle ->> 'tenant_id' IS NOT DISTINCT FROM tenant_id),
  CHECK (bundle ->> 'id' IS NOT DISTINCT FROM id),
  CHECK (bundle ->> 'hash' IS NOT DISTINCT FROM bundle_hash),
  CHECK (bundle ->> 'preparation_key' IS NOT DISTINCT FROM preparation_key),
  CHECK (bundle ->> 'preparation_fingerprint' IS NOT DISTINCT FROM preparation_fingerprint),
  CHECK (bundle ->> 'ingested_at' IS NOT DISTINCT FROM ingested_at),
  CHECK (bundle ->> 'retained_at' IS NOT DISTINCT FROM retained_at)
);
CREATE TABLE intake_commits (
  tenant_id text NOT NULL CHECK (tenant_id = 'tenant_intake_demo'),
  id text PRIMARY KEY CHECK (id ~ '^intake_commit_[0-9a-f]{64}$'),
  sequence bigint NOT NULL UNIQUE CHECK (sequence BETWEEN 1 AND 9007199254740991),
  receipt_hash text NOT NULL UNIQUE CHECK (receipt_hash ~ '^sha256:[0-9a-f]{64}$'),
  bundle_id text NOT NULL,
  record_key text NOT NULL,
  material_key text NOT NULL,
  case_root text NOT NULL,
  upstream_key text,
  case_id text NOT NULL,
  case_version bigint NOT NULL,
  journal_entry_id text NOT NULL UNIQUE REFERENCES case_journal (id) DEFERRABLE INITIALLY DEFERRED,
  journal_entry_hash text NOT NULL,
  previous_intake_hash text REFERENCES intake_commits (receipt_hash) DEFERRABLE INITIALLY DEFERRED,
  idempotency_key text NOT NULL,
  command_fingerprint text NOT NULL,
  recorded_at text NOT NULL,
  receipt jsonb NOT NULL,
  UNIQUE (tenant_id, material_key),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, bundle_id) REFERENCES intake_bundles (tenant_id, id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (receipt ->> 'schema_version' = 'intake-commit.v1'),
  CHECK (receipt ->> 'tenant_id' IS NOT DISTINCT FROM tenant_id),
  CHECK (receipt ->> 'id' IS NOT DISTINCT FROM id),
  CHECK (receipt ->> 'sequence' IS NOT DISTINCT FROM sequence::text),
  CHECK (receipt ->> 'hash' IS NOT DISTINCT FROM receipt_hash),
  CHECK (receipt #>> '{selection,bundle_id}' IS NOT DISTINCT FROM bundle_id),
  CHECK (receipt ->> 'record_key' IS NOT DISTINCT FROM record_key),
  CHECK (receipt ->> 'material_key' IS NOT DISTINCT FROM material_key),
  CHECK (receipt ->> 'case_root' IS NOT DISTINCT FROM case_root),
  CHECK (receipt ->> 'upstream_key' IS NOT DISTINCT FROM upstream_key),
  CHECK (receipt ->> 'case_id' IS NOT DISTINCT FROM case_id),
  CHECK (receipt ->> 'case_version' IS NOT DISTINCT FROM case_version::text),
  CHECK (receipt ->> 'journal_entry_id' IS NOT DISTINCT FROM journal_entry_id),
  CHECK (receipt ->> 'journal_entry_hash' IS NOT DISTINCT FROM journal_entry_hash),
  CHECK (receipt ->> 'previous_intake_hash' IS NOT DISTINCT FROM previous_intake_hash),
  CHECK (receipt ->> 'idempotency_key' IS NOT DISTINCT FROM idempotency_key),
  CHECK (receipt ->> 'command_fingerprint' IS NOT DISTINCT FROM command_fingerprint),
  CHECK (receipt ->> 'recorded_at' IS NOT DISTINCT FROM recorded_at)
);
CREATE FUNCTION enforce_intake_case_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal jsonb; proof jsonb; event jsonb;
BEGIN
  IF TG_TABLE_NAME = 'case_journal' THEN
    journal := NEW.entry;
  ELSE
    SELECT entry INTO journal FROM case_journal WHERE id = NEW.journal_entry_id;
  END IF;
  event := CASE WHEN journal ->> 'event_type' = 'case.created'
    THEN journal #> '{payload,document,events,0}' ELSE journal #> '{payload,work_event}' END;
  IF TG_TABLE_NAME = 'intake_commits' OR event ->> 'source' = 'fieldruntime_intake' THEN
    SELECT receipt INTO proof FROM intake_commits WHERE journal_entry_id = journal ->> 'id';
    IF proof IS NULL OR event ->> 'source' IS DISTINCT FROM 'fieldruntime_intake'
      OR journal ->> 'event_hash' IS DISTINCT FROM proof ->> 'journal_entry_hash'
      OR journal ->> 'case_id' IS DISTINCT FROM proof ->> 'case_id'
      OR event ->> 'content_hash' IS DISTINCT FROM proof ->> 'review_material_hash'
      OR journal ->> 'recorded_at' IS DISTINCT FROM proof ->> 'recorded_at'
    THEN RAISE EXCEPTION 'intake/Case evidence pair missing or inconsistent'; END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER intake_case_pair AFTER INSERT ON case_journal
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_intake_case_pair();
CREATE CONSTRAINT TRIGGER intake_receipt_pair AFTER INSERT ON intake_commits
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_intake_case_pair();
CREATE TRIGGER intake_artifacts_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON intake_artifacts
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
CREATE TRIGGER intake_bundles_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON intake_bundles
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
CREATE TRIGGER intake_commits_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON intake_commits
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
