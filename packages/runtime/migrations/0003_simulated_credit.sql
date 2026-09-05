-- D-033: no changes to existing Case/review tables or migration checksums.
CREATE TABLE simulated_action_journal (
  id text PRIMARY KEY CHECK (id ~ '^attempt_[A-Za-z0-9_-]{1,119}$'),
  sequence bigint NOT NULL UNIQUE CHECK (sequence BETWEEN 1 AND 9007199254740991),
  tenant_id text NOT NULL CHECK (tenant_id = 'tenant_orchid'),
  case_id text NOT NULL CHECK (case_id = 'case_d6_workbench'),
  slot text NOT NULL CHECK (slot = 'service_remedy'),
  authority_request_id text NOT NULL,
  review_revision bigint NOT NULL CHECK (review_revision >= 0),
  review_head_hash text NOT NULL,
  case_version bigint NOT NULL CHECK (case_version >= 1),
  case_head_hash text NOT NULL,
  catalog_hash text NOT NULL,
  authority_state_revision bigint NOT NULL CHECK (authority_state_revision >= 1),
  authority_position bigint NOT NULL CHECK (authority_position >= 0),
  recorded_at text NOT NULL,
  previous_event_hash text,
  event_hash text NOT NULL UNIQUE,
  envelope_hash text NOT NULL,
  idempotency_key text NOT NULL,
  command_fingerprint text NOT NULL,
  entry jsonb NOT NULL,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, case_id, slot, id),
  CHECK (entry ?& ARRAY['id','sequence','tenant_id','case_id','slot','authority_request_id','review_revision','review_head_hash','case_version','case_head_hash','catalog_hash','authority_state_revision','authority_position','recorded_at','previous_event_hash','event_hash','envelope_hash','idempotency_key','command_fingerprint']),
  CHECK (entry ->> 'schema_version' = 'simulated-action-journal-entry.v1'),
  CHECK (entry ->> 'id' IS NOT DISTINCT FROM id::text),
  CHECK (entry ->> 'sequence' IS NOT DISTINCT FROM sequence::text),
  CHECK (entry ->> 'tenant_id' IS NOT DISTINCT FROM tenant_id::text),
  CHECK (entry ->> 'case_id' IS NOT DISTINCT FROM case_id::text),
  CHECK (entry ->> 'slot' IS NOT DISTINCT FROM slot::text),
  CHECK (entry ->> 'authority_request_id' IS NOT DISTINCT FROM authority_request_id::text),
  CHECK (entry ->> 'review_revision' IS NOT DISTINCT FROM review_revision::text),
  CHECK (entry ->> 'review_head_hash' IS NOT DISTINCT FROM review_head_hash::text),
  CHECK (entry ->> 'case_version' IS NOT DISTINCT FROM case_version::text),
  CHECK (entry ->> 'case_head_hash' IS NOT DISTINCT FROM case_head_hash::text),
  CHECK (entry ->> 'catalog_hash' IS NOT DISTINCT FROM catalog_hash::text),
  CHECK (entry ->> 'authority_state_revision' IS NOT DISTINCT FROM authority_state_revision::text),
  CHECK (entry ->> 'authority_position' IS NOT DISTINCT FROM authority_position::text),
  CHECK (entry ->> 'recorded_at' IS NOT DISTINCT FROM recorded_at::text),
  CHECK (entry ->> 'previous_event_hash' IS NOT DISTINCT FROM previous_event_hash::text),
  CHECK (entry ->> 'event_hash' IS NOT DISTINCT FROM event_hash::text),
  CHECK (entry ->> 'envelope_hash' IS NOT DISTINCT FROM envelope_hash::text),
  CHECK (entry ->> 'idempotency_key' IS NOT DISTINCT FROM idempotency_key::text),
  CHECK (entry ->> 'command_fingerprint' IS NOT DISTINCT FROM command_fingerprint::text),
  FOREIGN KEY (previous_event_hash) REFERENCES simulated_action_journal (event_hash) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, case_id, case_version, case_head_hash)
    REFERENCES case_journal (tenant_id, case_id, sequence, event_hash) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, authority_request_id, review_revision, review_head_hash)
    REFERENCES authority_request_journal (tenant_id, authority_request_id, review_revision, event_hash) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, catalog_hash) REFERENCES authority_snapshots (tenant_id, snapshot_hash) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE simulated_credit_source (
  tenant_id text NOT NULL CHECK (tenant_id = 'tenant_orchid'),
  case_id text NOT NULL CHECK (case_id = 'case_d6_workbench'),
  slot text NOT NULL CHECK (slot = 'service_remedy'),
  origin_attempt_id text NOT NULL UNIQUE,
  row_hash text NOT NULL UNIQUE,
  source_row jsonb NOT NULL,
  PRIMARY KEY (tenant_id, case_id, slot),
  CHECK (source_row ->> 'schema_version' = 'simulated-credit-source-row.v1'),
  CHECK (source_row #>> '{target,tenant_id}' IS NOT DISTINCT FROM tenant_id),
  CHECK (source_row #>> '{target,case_id}' IS NOT DISTINCT FROM case_id),
  CHECK (source_row #>> '{target,slot}' IS NOT DISTINCT FROM slot),
  CHECK (source_row ->> 'origin_attempt_id' IS NOT DISTINCT FROM origin_attempt_id),
  CHECK (source_row ->> 'row_hash' IS NOT DISTINCT FROM row_hash),
  FOREIGN KEY (tenant_id, case_id, slot, origin_attempt_id)
    REFERENCES simulated_action_journal (tenant_id, case_id, slot, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION enforce_simulated_source_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recorded jsonb;
BEGIN
  IF TG_TABLE_NAME = 'simulated_credit_source' THEN
    SELECT entry -> 'source' INTO recorded FROM simulated_action_journal WHERE id = NEW.origin_attempt_id;
    IF recorded IS DISTINCT FROM NEW.source_row THEN RAISE EXCEPTION 'source/action pair mismatch'; END IF;
  ELSIF NEW.entry -> 'source' <> 'null'::jsonb THEN
    SELECT source_row INTO recorded FROM simulated_credit_source WHERE origin_attempt_id = NEW.id;
    IF recorded IS DISTINCT FROM NEW.entry -> 'source' THEN RAISE EXCEPTION 'action/source pair missing'; END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER simulated_source_pair AFTER INSERT ON simulated_credit_source
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_simulated_source_pair();
CREATE CONSTRAINT TRIGGER simulated_action_pair AFTER INSERT ON simulated_action_journal
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_simulated_source_pair();
CREATE TRIGGER simulated_action_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON simulated_action_journal
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
CREATE TRIGGER simulated_source_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON simulated_credit_source
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
