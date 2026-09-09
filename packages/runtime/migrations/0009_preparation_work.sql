-- Accepted D-037. Extend the same selection stream without changing 0001–0008.
DO $$ DECLARE constraint_name text; BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid='preparation_pack_selection'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%schema_version%'
  LOOP EXECUTE format('ALTER TABLE preparation_pack_selection DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;
ALTER TABLE preparation_pack_selection ADD CONSTRAINT pack_selection_supported_version
  CHECK (entry ->> 'schema_version' IN ('pack-selection-entry.v1','pack-selection-entry.v2'));
CREATE TABLE preparation_work_journal (
  tenant_id text NOT NULL CHECK (tenant_id='tenant_intake_demo'),
  case_id text NOT NULL,
  record_key text NOT NULL CHECK (record_key ~ '^sha256:[a-f0-9]{64}$'),
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  id text PRIMARY KEY,
  entry_hash text NOT NULL UNIQUE,
  previous_entry_hash text REFERENCES preparation_work_journal(entry_hash) DEFERRABLE INITIALLY DEFERRED,
  invocation_id text NOT NULL,
  event text NOT NULL CHECK (event IN ('started','terminal_result','interrupt','task_review','correction','evaluation_review','proof_note')),
  idempotency_key text,
  command_fingerprint text,
  recorded_at text NOT NULL,
  entry jsonb NOT NULL,
  UNIQUE (tenant_id,case_id,sequence),
  UNIQUE (tenant_id,case_id,event,idempotency_key),
  FOREIGN KEY (tenant_id,case_id) REFERENCES case_projections(tenant_id,case_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((sequence=1) = (previous_entry_hash IS NULL)),
  CHECK ((event='terminal_result') = (idempotency_key IS NULL)),
  CHECK ((event='terminal_result') = (command_fingerprint IS NULL)),
  CHECK (entry ->> 'schema_version' = 'preparation-work-entry.v1'),
  CHECK (entry ->> 'tenant_id' IS NOT DISTINCT FROM tenant_id),
  CHECK (entry ->> 'case_id' IS NOT DISTINCT FROM case_id),
  CHECK (entry ->> 'record_key' IS NOT DISTINCT FROM record_key),
  CHECK (entry ->> 'sequence' IS NOT DISTINCT FROM sequence::text),
  CHECK (entry ->> 'id' IS NOT DISTINCT FROM id),
  CHECK (entry ->> 'hash' IS NOT DISTINCT FROM entry_hash),
  CHECK (entry ->> 'previous_entry_hash' IS NOT DISTINCT FROM previous_entry_hash),
  CHECK (entry ->> 'invocation_id' IS NOT DISTINCT FROM invocation_id),
  CHECK (entry ->> 'event' IS NOT DISTINCT FROM event),
  CHECK (entry ->> 'idempotency_key' IS NOT DISTINCT FROM idempotency_key),
  CHECK (entry ->> 'command_fingerprint' IS NOT DISTINCT FROM command_fingerprint),
  CHECK (entry ->> 'recorded_at' IS NOT DISTINCT FROM recorded_at)
);
CREATE UNIQUE INDEX preparation_one_start ON preparation_work_journal(tenant_id,case_id,invocation_id) WHERE event='started';
CREATE UNIQUE INDEX preparation_one_terminal ON preparation_work_journal(tenant_id,case_id,invocation_id) WHERE event IN ('terminal_result','interrupt');
CREATE UNIQUE INDEX preparation_one_review ON preparation_work_journal(tenant_id,case_id,invocation_id) WHERE event='task_review';
CREATE TRIGGER preparation_work_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON preparation_work_journal
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
CREATE FUNCTION preserve_preparation_work_clock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at_time text; floor_time text;
BEGIN
  IF TG_TABLE_NAME='intake_bundles' THEN at_time := NEW.retained_at;
  ELSE at_time := NEW.recorded_at; END IF;
  SELECT max(recorded_at) INTO floor_time FROM preparation_work_journal WHERE tenant_id=NEW.tenant_id;
  IF at_time < floor_time THEN RAISE EXCEPTION 'Preparation work clock regression'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_work_clock BEFORE INSERT ON case_journal FOR EACH ROW EXECUTE FUNCTION preserve_preparation_work_clock();
CREATE TRIGGER bundle_work_clock BEFORE INSERT ON intake_bundles FOR EACH ROW EXECUTE FUNCTION preserve_preparation_work_clock();
CREATE TRIGGER commit_work_clock BEFORE INSERT ON intake_commits FOR EACH ROW EXECUTE FUNCTION preserve_preparation_work_clock();
CREATE TRIGGER request_binding_work_clock BEFORE INSERT ON intake_request_bindings FOR EACH ROW EXECUTE FUNCTION preserve_preparation_work_clock();
CREATE TRIGGER discovery_work_clock BEFORE INSERT ON discovery_review_journal FOR EACH ROW EXECUTE FUNCTION preserve_preparation_work_clock();
CREATE TRIGGER selection_work_clock BEFORE INSERT ON preparation_pack_selection FOR EACH ROW EXECUTE FUNCTION preserve_preparation_work_clock();
CREATE TRIGGER work_work_clock BEFORE INSERT ON preparation_work_journal FOR EACH ROW EXECUTE FUNCTION preserve_preparation_work_clock();
