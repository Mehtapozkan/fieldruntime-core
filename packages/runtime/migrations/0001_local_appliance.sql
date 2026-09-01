-- Field Runtime Core PR4 local-appliance persistence.
--
-- The journal is the immutable idempotency ledger: every entry contains the
-- tenant-scoped idempotency key, command fingerprint, result disposition, and
-- target case. Source-event identity remains a separate immutable index because
-- it must reject fresh-key replays across cases.

CREATE TABLE runtime_writer_lock (
  singleton_id smallint PRIMARY KEY CHECK (singleton_id = 1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

INSERT INTO runtime_writer_lock (singleton_id, revision) VALUES (1, 0);

CREATE TABLE case_projections (
  tenant_id text NOT NULL,
  case_id text NOT NULL,
  version bigint NOT NULL CHECK (version >= 1),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  journal_sequence bigint NOT NULL CHECK (journal_sequence >= 1),
  journal_head_hash text NOT NULL CHECK (
    journal_head_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  PRIMARY KEY (tenant_id, case_id),
  CHECK (journal_sequence = version),
  CHECK (
    document #>> '{case,id}' IS NOT NULL
    AND document #>> '{case,id}' = case_id
  ),
  CHECK (
    document #>> '{case,tenant_id}' IS NOT NULL
    AND document #>> '{case,tenant_id}' = tenant_id
  ),
  CHECK (
    document #>> '{case,version}' IS NOT NULL
    AND jsonb_typeof(document #> '{case,version}') = 'number'
    AND (document #>> '{case,version}')::bigint = version
  )
);

CREATE TABLE case_journal (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  case_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 1),
  case_version bigint NOT NULL CHECK (case_version >= 1),
  event_type text NOT NULL CHECK (
    event_type IN (
      'case.created',
      'case.work_event_attached',
      'case.state_transitioned',
      'case.transition_rejected'
    )
  ),
  recorded_at text NOT NULL CHECK (
    recorded_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  ),
  idempotency_key text NOT NULL CHECK (
    length(idempotency_key) BETWEEN 1 AND 512
  ),
  command_fingerprint text NOT NULL CHECK (
    command_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  causation_event_id text,
  causation_sequence bigint CHECK (causation_sequence >= 1),
  previous_event_hash text CHECK (
    previous_event_hash IS NULL
    OR previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  previous_sequence bigint GENERATED ALWAYS AS (sequence - 1) STORED,
  event_hash text NOT NULL CHECK (event_hash ~ '^sha256:[0-9a-f]{64}$'),
  entry jsonb NOT NULL CHECK (jsonb_typeof(entry) = 'object'),
  UNIQUE (tenant_id, case_id, id),
  UNIQUE (tenant_id, case_id, sequence),
  UNIQUE (tenant_id, case_id, sequence, id),
  UNIQUE (tenant_id, case_id, sequence, event_hash),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (case_version = sequence),
  CHECK (
    (sequence = 1 AND previous_event_hash IS NULL)
    OR (sequence > 1 AND previous_event_hash IS NOT NULL)
  ),
  CHECK (
    (causation_event_id IS NULL AND causation_sequence IS NULL)
    OR (
      causation_event_id IS NOT NULL
      AND causation_sequence IS NOT NULL
      AND causation_sequence < sequence
    )
  ),
  CHECK (
    entry ?& ARRAY[
      'id',
      'tenant_id',
      'case_id',
      'sequence',
      'case_version',
      'event_type',
      'recorded_at',
      'idempotency_key',
      'command_fingerprint',
      'previous_event_hash',
      'event_hash'
    ]
  ),
  CHECK (
    jsonb_typeof(entry -> 'id') = 'string'
    AND entry ->> 'id' IS NOT DISTINCT FROM id
  ),
  CHECK (
    jsonb_typeof(entry -> 'tenant_id') = 'string'
    AND entry ->> 'tenant_id' IS NOT DISTINCT FROM tenant_id
  ),
  CHECK (
    jsonb_typeof(entry -> 'case_id') = 'string'
    AND entry ->> 'case_id' IS NOT DISTINCT FROM case_id
  ),
  CHECK (
    jsonb_typeof(entry -> 'sequence') = 'number'
    AND entry ->> 'sequence' IS NOT DISTINCT FROM sequence::text
  ),
  CHECK (
    jsonb_typeof(entry -> 'case_version') = 'number'
    AND entry ->> 'case_version' IS NOT DISTINCT FROM case_version::text
  ),
  CHECK (
    jsonb_typeof(entry -> 'event_type') = 'string'
    AND entry ->> 'event_type' IS NOT DISTINCT FROM event_type
  ),
  CHECK (
    jsonb_typeof(entry -> 'recorded_at') = 'string'
    AND entry ->> 'recorded_at' IS NOT DISTINCT FROM recorded_at
  ),
  CHECK (
    jsonb_typeof(entry -> 'idempotency_key') = 'string'
    AND entry ->> 'idempotency_key' IS NOT DISTINCT FROM idempotency_key
  ),
  CHECK (
    jsonb_typeof(entry -> 'command_fingerprint') = 'string'
    AND entry ->> 'command_fingerprint'
      IS NOT DISTINCT FROM command_fingerprint
  ),
  CHECK (
    jsonb_typeof(entry -> 'event_hash') = 'string'
    AND entry ->> 'event_hash' IS NOT DISTINCT FROM event_hash
  ),
  CHECK (
    (
      causation_event_id IS NULL
      AND NOT (entry ? 'causation_event_id')
    )
    OR (
      causation_event_id IS NOT NULL
      AND jsonb_typeof(entry -> 'causation_event_id') = 'string'
      AND entry ->> 'causation_event_id'
        IS NOT DISTINCT FROM causation_event_id
    )
  ),
  CHECK (
    (
      previous_event_hash IS NULL
      AND jsonb_typeof(entry -> 'previous_event_hash') = 'null'
    )
    OR (
      previous_event_hash IS NOT NULL
      AND jsonb_typeof(entry -> 'previous_event_hash') = 'string'
    )
  ),
  CHECK (
    entry ->> 'previous_event_hash' IS NOT DISTINCT FROM previous_event_hash
  ),
  FOREIGN KEY (tenant_id, case_id)
    REFERENCES case_projections (tenant_id, case_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (
    tenant_id, case_id, previous_sequence, previous_event_hash
  ) REFERENCES case_journal (
    tenant_id, case_id, sequence, event_hash
  ) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (
    tenant_id, case_id, causation_sequence, causation_event_id
  ) REFERENCES case_journal (
    tenant_id, case_id, sequence, id
  )
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE case_projections
  ADD CONSTRAINT case_projection_journal_head_fk
  FOREIGN KEY (tenant_id, case_id, journal_sequence, journal_head_hash)
  REFERENCES case_journal (tenant_id, case_id, sequence, event_hash)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE source_event_identities (
  tenant_id text NOT NULL,
  source text NOT NULL CHECK (length(source) > 0),
  source_event_id text NOT NULL CHECK (length(source_event_id) > 0),
  work_event_fingerprint text NOT NULL CHECK (
    work_event_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  case_id text NOT NULL,
  journal_entry_id text NOT NULL UNIQUE,
  create_binding_fingerprint text CHECK (
    create_binding_fingerprint IS NULL
    OR create_binding_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  PRIMARY KEY (tenant_id, source, source_event_id),
  FOREIGN KEY (tenant_id, case_id)
    REFERENCES case_projections (tenant_id, case_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, case_id, journal_entry_id)
    REFERENCES case_journal (tenant_id, case_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX source_event_case_idx
  ON source_event_identities (tenant_id, case_id);

-- Audit IDs are embedded in the Case projection and journal payload. This
-- registry makes their global disjointness with journal IDs enforceable by the
-- database rather than relying on an in-process scan alone.
CREATE TABLE runtime_emitted_ids (
  id text PRIMARY KEY,
  record_kind text NOT NULL CHECK (record_kind IN ('journal', 'audit')),
  tenant_id text NOT NULL,
  case_id text NOT NULL,
  journal_entry_id text NOT NULL,
  UNIQUE (journal_entry_id, record_kind),
  CHECK (record_kind <> 'journal' OR id = journal_entry_id),
  FOREIGN KEY (tenant_id, case_id)
    REFERENCES case_projections (tenant_id, case_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, case_id, journal_entry_id)
    REFERENCES case_journal (tenant_id, case_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE evaluation_demo_fixtures (
  fixture_id text NOT NULL,
  pack_version text NOT NULL,
  pack_id text NOT NULL,
  tenant_id text NOT NULL,
  case_id text NOT NULL,
  fixture_hash text NOT NULL CHECK (
    fixture_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  PRIMARY KEY (fixture_id),
  CHECK (pack_id = 'ecc'),
  CHECK (fixture_id = case_id),
  CHECK (
    document #>> '{tenant,id}' IS NOT NULL
    AND jsonb_typeof(document #> '{tenant,id}') = 'string'
    AND document #>> '{tenant,id}' = tenant_id
  ),
  CHECK (
    document #>> '{case,id}' IS NOT NULL
    AND jsonb_typeof(document #> '{case,id}') = 'string'
    AND document #>> '{case,id}' = case_id
  ),
  CHECK (
    document #>> '{workflow_version,version}' IS NOT NULL
    AND jsonb_typeof(document #> '{workflow_version,version}') = 'string'
    AND document #>> '{workflow_version,version}' = pack_version
  )
);

CREATE FUNCTION deny_runtime_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER case_journal_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON case_journal
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();

CREATE TRIGGER source_event_identities_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON source_event_identities
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();

CREATE TRIGGER runtime_emitted_ids_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON runtime_emitted_ids
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();

CREATE TRIGGER evaluation_demo_fixtures_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON evaluation_demo_fixtures
  FOR EACH STATEMENT EXECUTE FUNCTION deny_runtime_append_only_mutation();
