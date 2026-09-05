-- D-032: a separate request stream. 0001 and Case version semantics are intact.
CREATE TABLE authority_snapshots (
  tenant_id text NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^sha256:[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('catalog', 'material', 'evaluation')),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  PRIMARY KEY (tenant_id, snapshot_hash),
  UNIQUE (tenant_id, snapshot_hash, kind),
  CHECK (content ->> 'tenant_id' IS NOT NULL AND content ->> 'tenant_id' = tenant_id),
  CHECK (content ->> 'schema_version' IS NOT NULL AND content ->> 'schema_version' =
    CASE kind WHEN 'catalog' THEN 'authority-catalog.v1'
      WHEN 'material' THEN 'authority-review-material.v1' ELSE 'authority-evaluation.v1' END)
);

CREATE TABLE authority_catalog (
  tenant_id text PRIMARY KEY,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  snapshot_hash text NOT NULL,
  snapshot_kind text NOT NULL DEFAULT 'catalog' CHECK (snapshot_kind = 'catalog'),
  last_recorded_at text NOT NULL CHECK (last_recorded_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'),
  FOREIGN KEY (tenant_id, snapshot_hash, snapshot_kind)
    REFERENCES authority_snapshots (tenant_id, snapshot_hash, kind) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE authority_request_journal (
  id text PRIMARY KEY CHECK (id ~ '^review_[A-Za-z0-9_-]{1,119}$'),
  position bigint NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 9007199254740991),
  tenant_id text NOT NULL,
  case_id text NOT NULL,
  case_version bigint NOT NULL CHECK (case_version >= 1),
  case_head_hash text NOT NULL,
  authority_request_id text NOT NULL CHECK (authority_request_id ~ '^request_[A-Za-z0-9_-]{1,119}$'),
  review_revision bigint NOT NULL CHECK (review_revision BETWEEN 0 AND 9007199254740991),
  authority_decision_id text UNIQUE CHECK (authority_decision_id IS NULL OR authority_decision_id ~ '^decision_[A-Za-z0-9_-]{1,119}$'),
  request_binding_hash text NOT NULL CHECK (request_binding_hash ~ '^sha256:[0-9a-f]{64}$'),
  previous_event_hash text,
  previous_revision bigint GENERATED ALWAYS AS (CASE WHEN review_revision > 0 THEN review_revision - 1 ELSE NULL END) STORED,
  creation_revision bigint GENERATED ALWAYS AS (0) STORED,
  event_hash text NOT NULL CHECK (event_hash ~ '^sha256:[0-9a-f]{64}$'),
  evaluation_snapshot_hash text NOT NULL,
  evaluation_kind text NOT NULL DEFAULT 'evaluation' CHECK (evaluation_kind = 'evaluation'),
  material_snapshot_hash text NOT NULL,
  material_kind text NOT NULL DEFAULT 'material' CHECK (material_kind = 'material'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 512),
  command_fingerprint text NOT NULL CHECK (command_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  replaces_entry_id text,
  replacement_creation_entry_id text,
  entry jsonb NOT NULL CHECK (jsonb_typeof(entry) = 'object'),
  UNIQUE (tenant_id, authority_request_id, review_revision),
  UNIQUE (tenant_id, authority_request_id, review_revision, event_hash),
  UNIQUE (tenant_id, authority_request_id, review_revision, request_binding_hash, case_id, case_version),
  UNIQUE (tenant_id, case_id, id),
  CHECK ((review_revision = 0 AND previous_event_hash IS NULL AND authority_decision_id IS NULL)
    OR (review_revision > 0 AND previous_event_hash IS NOT NULL AND authority_decision_id IS NOT NULL)),
  CHECK (entry ?& ARRAY['schema_version', 'id', 'position', 'tenant_id', 'case_id', 'authority_request_id', 'review_revision',
    'event_hash', 'request_binding_hash', 'previous_event_hash', 'evaluation_snapshot_hash', 'idempotency_key', 'command_fingerprint']),
  CHECK (entry ->> 'schema_version' = 'authority-request-journal-entry.v1'),
  CHECK (entry ->> 'id' IS NOT DISTINCT FROM id),
  CHECK (entry ->> 'position' IS NOT DISTINCT FROM position::text),
  CHECK (entry ->> 'tenant_id' IS NOT DISTINCT FROM tenant_id),
  CHECK (entry ->> 'case_id' IS NOT DISTINCT FROM case_id),
  CHECK (entry ->> 'authority_request_id' IS NOT DISTINCT FROM authority_request_id),
  CHECK (entry ->> 'review_revision' IS NOT DISTINCT FROM review_revision::text),
  CHECK (entry ->> 'event_hash' IS NOT DISTINCT FROM event_hash),
  CHECK (entry ->> 'request_binding_hash' IS NOT DISTINCT FROM request_binding_hash),
  CHECK (entry ->> 'previous_event_hash' IS NOT DISTINCT FROM previous_event_hash),
  CHECK (entry ->> 'evaluation_snapshot_hash' IS NOT DISTINCT FROM evaluation_snapshot_hash),
  CHECK (entry ->> 'idempotency_key' IS NOT DISTINCT FROM idempotency_key),
  CHECK (entry ->> 'command_fingerprint' IS NOT DISTINCT FROM command_fingerprint),
  CHECK (entry ->> 'replaces_entry_id' IS NOT DISTINCT FROM replaces_entry_id),
  CHECK (entry ->> 'replacement_creation_entry_id' IS NOT DISTINCT FROM replacement_creation_entry_id),
  CHECK (entry #>> '{decision,authority_decision_id}' IS NOT DISTINCT FROM authority_decision_id),
  CHECK (COALESCE(entry #>> '{request,case_version}', entry #>> '{decision,case_version}') IS NOT DISTINCT FROM case_version::text),
  FOREIGN KEY (tenant_id, case_id, case_version, case_head_hash)
    REFERENCES case_journal (tenant_id, case_id, sequence, event_hash) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, authority_request_id, previous_revision, previous_event_hash)
    REFERENCES authority_request_journal (tenant_id, authority_request_id, review_revision, event_hash) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, authority_request_id, creation_revision, request_binding_hash, case_id, case_version)
    REFERENCES authority_request_journal (tenant_id, authority_request_id, review_revision, request_binding_hash, case_id, case_version) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, evaluation_snapshot_hash, evaluation_kind)
    REFERENCES authority_snapshots (tenant_id, snapshot_hash, kind) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, material_snapshot_hash, material_kind)
    REFERENCES authority_snapshots (tenant_id, snapshot_hash, kind) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, case_id, replaces_entry_id)
    REFERENCES authority_request_journal (tenant_id, case_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, case_id, replacement_creation_entry_id)
    REFERENCES authority_request_journal (tenant_id, case_id, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX authority_command_idempotency
  ON authority_request_journal (tenant_id, idempotency_key) WHERE replaces_entry_id IS NULL;
CREATE UNIQUE INDEX authority_replacement_once
  ON authority_request_journal (replaces_entry_id) WHERE replaces_entry_id IS NOT NULL;

CREATE FUNCTION enforce_authority_replacement_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE partner authority_request_journal;
BEGIN
  IF NEW.replacement_creation_entry_id IS NOT NULL THEN
    SELECT * INTO partner FROM authority_request_journal WHERE id = NEW.replacement_creation_entry_id;
    IF partner.id IS NULL OR partner.replaces_entry_id IS DISTINCT FROM NEW.id
      OR partner.authority_request_id IS DISTINCT FROM NEW.entry #>> '{decision,replacement_authority_request_id}'
      OR partner.entry #>> '{request,predecessor_authority_request_id}' IS DISTINCT FROM NEW.authority_request_id
      OR partner.position <> NEW.position + 1 OR partner.review_revision <> 0
      OR partner.command_fingerprint <> NEW.command_fingerprint
      OR partner.idempotency_key <> NEW.idempotency_key
      OR NEW.entry #>> '{decision,decision}' IS DISTINCT FROM 'modify' THEN
      RAISE EXCEPTION 'invalid atomic authority replacement';
    END IF;
  ELSIF NEW.entry #>> '{decision,decision}' = 'modify' THEN
    RAISE EXCEPTION 'modify requires an atomic replacement';
  END IF;
  IF NEW.replaces_entry_id IS NOT NULL THEN
    SELECT * INTO partner FROM authority_request_journal WHERE id = NEW.replaces_entry_id;
    IF partner.replacement_creation_entry_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'orphan authority replacement';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER authority_replacement_pair AFTER INSERT ON authority_request_journal
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_authority_replacement_pair();

CREATE FUNCTION enforce_authority_catalog_advance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id OR NEW.last_recorded_at < OLD.last_recorded_at
    OR NOT ((NEW.revision = OLD.revision AND NEW.snapshot_hash = OLD.snapshot_hash)
      OR (NEW.revision = OLD.revision + 1 AND NEW.snapshot_hash <> OLD.snapshot_hash)) THEN
    RAISE EXCEPTION 'authority catalog or clock regressed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER authority_catalog_advance BEFORE UPDATE ON authority_catalog
  FOR EACH ROW EXECUTE FUNCTION enforce_authority_catalog_advance();
CREATE TRIGGER authority_catalog_no_removal BEFORE DELETE OR TRUNCATE ON authority_catalog
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
CREATE TRIGGER authority_journal_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON authority_request_journal
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
CREATE TRIGGER authority_snapshots_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON authority_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
