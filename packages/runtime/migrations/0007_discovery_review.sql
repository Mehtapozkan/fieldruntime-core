-- Accepted D-035. Descriptive review only. Preserve 0001–0006 checksums.
CREATE TABLE discovery_review_journal (
  tenant_id text NOT NULL CHECK (tenant_id = 'tenant_intake_demo'),
  intake_scope_id text NOT NULL CHECK (intake_scope_id = 'scope_invoice_disputes'),
  case_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  id text PRIMARY KEY CHECK (id ~ '^discovery_review_[0-9a-f]{64}$'),
  entry_hash text NOT NULL UNIQUE CHECK (entry_hash ~ '^sha256:[0-9a-f]{64}$'),
  previous_entry_hash text REFERENCES discovery_review_journal(entry_hash) DEFERRABLE INITIALLY DEFERRED,
  operation text NOT NULL CHECK (operation IN ('annotate','confirm')),
  idempotency_key text NOT NULL,
  command_fingerprint text NOT NULL CHECK (command_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  recorded_at text NOT NULL,
  entry jsonb NOT NULL,
  UNIQUE (tenant_id,case_id,sequence),
  UNIQUE (tenant_id,intake_scope_id,operation,idempotency_key),
  FOREIGN KEY (tenant_id,case_id) REFERENCES case_projections(tenant_id,case_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((sequence=1) = (previous_entry_hash IS NULL)),
  CHECK (entry ->> 'schema_version' = 'discovery-review-entry.v1'),
  CHECK (entry ->> 'tenant_id' IS NOT DISTINCT FROM tenant_id),
  CHECK (entry ->> 'intake_scope_id' IS NOT DISTINCT FROM intake_scope_id),
  CHECK (entry ->> 'case_id' IS NOT DISTINCT FROM case_id),
  CHECK (entry ->> 'sequence' IS NOT DISTINCT FROM sequence::text),
  CHECK (entry ->> 'id' IS NOT DISTINCT FROM id),
  CHECK (entry ->> 'hash' IS NOT DISTINCT FROM entry_hash),
  CHECK (entry ->> 'previous_entry_hash' IS NOT DISTINCT FROM previous_entry_hash),
  CHECK (entry ->> 'operation' IS NOT DISTINCT FROM operation),
  CHECK (entry ->> 'idempotency_key' IS NOT DISTINCT FROM idempotency_key),
  CHECK (entry ->> 'command_fingerprint' IS NOT DISTINCT FROM command_fingerprint),
  CHECK (entry ->> 'recorded_at' IS NOT DISTINCT FROM recorded_at)
);
CREATE TRIGGER discovery_review_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON discovery_review_journal
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
-- Later canonical writes must not be backdated across a retained descriptive review.
-- Equality is allowed: exact anchors/chain sequences, not timestamps, retain ordering.
CREATE FUNCTION preserve_discovery_clock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at_time text; floor_time text;
BEGIN
  IF TG_TABLE_NAME = 'case_journal' THEN
    at_time := NEW.recorded_at;
    SELECT max(recorded_at) INTO floor_time FROM discovery_review_journal
      WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id;
  ELSE
    IF TG_TABLE_NAME='intake_bundles' THEN at_time := NEW.retained_at;
    ELSE at_time := NEW.recorded_at; END IF;
    SELECT max(recorded_at) INTO floor_time FROM discovery_review_journal WHERE tenant_id=NEW.tenant_id;
  END IF;
  IF at_time < floor_time THEN RAISE EXCEPTION 'Discovery clock regression'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_discovery_clock BEFORE INSERT ON case_journal FOR EACH ROW EXECUTE FUNCTION preserve_discovery_clock();
CREATE TRIGGER bundle_discovery_clock BEFORE INSERT ON intake_bundles FOR EACH ROW EXECUTE FUNCTION preserve_discovery_clock();
CREATE TRIGGER commit_discovery_clock BEFORE INSERT ON intake_commits FOR EACH ROW EXECUTE FUNCTION preserve_discovery_clock();
