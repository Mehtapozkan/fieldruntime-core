-- Accepted D-034 amendment: successful no-op keys are command metadata.
-- Original successful keys already reside in immutable bundles/receipts.
-- Historical no-op keys were never retained and cannot be backfilled.
CREATE TABLE intake_request_bindings (
  tenant_id text NOT NULL CHECK (tenant_id = 'tenant_intake_demo'),
  intake_scope_id text NOT NULL CHECK (intake_scope_id = 'scope_invoice_disputes'),
  operation text NOT NULL CHECK (operation IN ('prepare', 'commit')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  recorded_at text NOT NULL,
  binding_hash text NOT NULL CHECK (binding_hash ~ '^sha256:[0-9a-f]{64}$'),
  binding jsonb NOT NULL,
  PRIMARY KEY (tenant_id, intake_scope_id, operation, idempotency_key),
  CHECK (binding ->> 'schema_version' = 'intake-request-binding.v1'),
  CHECK (binding ->> 'tenant_id' IS NOT DISTINCT FROM tenant_id),
  CHECK (binding ->> 'intake_scope_id' IS NOT DISTINCT FROM intake_scope_id),
  CHECK (binding ->> 'operation' IS NOT DISTINCT FROM operation),
  CHECK (binding ->> 'idempotency_key' IS NOT DISTINCT FROM idempotency_key),
  CHECK (binding #>> '{request,idempotency_key}' IS NOT DISTINCT FROM idempotency_key),
  CHECK (binding ->> 'request_fingerprint' IS NOT DISTINCT FROM request_fingerprint),
  CHECK (binding ->> 'recorded_at' IS NOT DISTINCT FROM recorded_at),
  CHECK (binding ->> 'hash' IS NOT DISTINCT FROM binding_hash),
  CHECK (binding #>> '{result,status}' = CASE operation WHEN 'prepare' THEN 'already_retained' ELSE 'already_committed' END)
);
CREATE TRIGGER intake_request_bindings_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON intake_request_bindings
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
-- Runtime rehydrates and checks all original/no-op keys under the singleton lock.
-- Deferred checks also reject a colliding original key or a missing result target.
CREATE FUNCTION enforce_intake_request_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM intake_request_bindings k WHERE
      (k.operation = 'prepare' AND (
        EXISTS (SELECT 1 FROM intake_bundles b WHERE b.tenant_id=k.tenant_id AND b.preparation_key=k.idempotency_key)
        OR NOT EXISTS (SELECT 1 FROM intake_bundles b WHERE b.tenant_id=k.tenant_id AND b.id=k.binding #>> '{result,bundle_id}' AND b.bundle_hash=k.binding #>> '{result,bundle_hash}')
      )) OR (k.operation = 'commit' AND (
        EXISTS (SELECT 1 FROM intake_commits r WHERE r.tenant_id=k.tenant_id AND r.idempotency_key=k.idempotency_key)
        OR NOT EXISTS (SELECT 1 FROM intake_commits r WHERE r.tenant_id=k.tenant_id AND r.id=k.binding #>> '{result,receipt_id}' AND r.receipt_hash=k.binding #>> '{result,receipt_hash}')
      ))
  ) THEN RAISE EXCEPTION 'intake request key or original result conflict'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER intake_request_key_pair AFTER INSERT ON intake_request_bindings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_intake_request_binding();
CREATE CONSTRAINT TRIGGER intake_preparation_key_pair AFTER INSERT ON intake_bundles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_intake_request_binding();
CREATE CONSTRAINT TRIGGER intake_commit_key_pair AFTER INSERT ON intake_commits
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_intake_request_binding();
