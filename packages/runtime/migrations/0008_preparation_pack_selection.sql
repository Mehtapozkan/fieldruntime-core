-- Accepted D-036. Preparation selection only. Preserve every 0001–0007 checksum.
CREATE TABLE preparation_pack_selection (
  tenant_id text NOT NULL CHECK (tenant_id = 'tenant_intake_demo'),
  pack_id text NOT NULL CHECK (pack_id = 'pack_synthetic_invoice_dispute_north'),
  case_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  id text PRIMARY KEY CHECK (id ~ '^pack_selection_[0-9a-f]{64}$'),
  entry_hash text NOT NULL UNIQUE CHECK (entry_hash ~ '^sha256:[0-9a-f]{64}$'),
  previous_entry_hash text REFERENCES preparation_pack_selection(entry_hash) DEFERRABLE INITIALLY DEFERRED,
  operation text NOT NULL CHECK (operation IN ('publish','withdraw','rollback')),
  idempotency_key text NOT NULL,
  command_fingerprint text NOT NULL CHECK (command_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  recorded_at text NOT NULL,
  entry jsonb NOT NULL,
  UNIQUE (tenant_id,pack_id,sequence),
  UNIQUE (tenant_id,pack_id,operation,idempotency_key),
  FOREIGN KEY (tenant_id,case_id) REFERENCES case_projections(tenant_id,case_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((sequence=1) = (previous_entry_hash IS NULL)),
  CHECK (entry ->> 'schema_version' = 'pack-selection-entry.v1'),
  CHECK (entry ->> 'tenant_id' IS NOT DISTINCT FROM tenant_id),
  CHECK (entry ->> 'pack_id' IS NOT DISTINCT FROM pack_id),
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
CREATE TRIGGER pack_selection_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON preparation_pack_selection
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
-- The shared writer lock orders commands; this guard prevents later canonical
-- inputs from being backdated across retained selection evidence. Equal times do
-- not establish cross-journal ordering and do not replace exact anchors.
CREATE FUNCTION preserve_preparation_pack_clock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at_time text; floor_time text;
BEGIN
  IF TG_TABLE_NAME='intake_bundles' THEN at_time := NEW.retained_at;
  ELSE at_time := NEW.recorded_at; END IF;
  SELECT max(recorded_at) INTO floor_time FROM preparation_pack_selection
    WHERE tenant_id=NEW.tenant_id;
  IF at_time < floor_time THEN RAISE EXCEPTION 'Preparation pack clock regression'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_pack_clock BEFORE INSERT ON case_journal FOR EACH ROW EXECUTE FUNCTION preserve_preparation_pack_clock();
CREATE TRIGGER bundle_pack_clock BEFORE INSERT ON intake_bundles FOR EACH ROW EXECUTE FUNCTION preserve_preparation_pack_clock();
CREATE TRIGGER commit_pack_clock BEFORE INSERT ON intake_commits FOR EACH ROW EXECUTE FUNCTION preserve_preparation_pack_clock();
CREATE TRIGGER request_binding_pack_clock BEFORE INSERT ON intake_request_bindings FOR EACH ROW EXECUTE FUNCTION preserve_preparation_pack_clock();
CREATE TRIGGER discovery_pack_clock BEFORE INSERT ON discovery_review_journal FOR EACH ROW EXECUTE FUNCTION preserve_preparation_pack_clock();
