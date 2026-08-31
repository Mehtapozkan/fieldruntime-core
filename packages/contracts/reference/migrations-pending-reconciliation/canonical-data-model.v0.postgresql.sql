-- Field Runtime Escalation and Commitment Control - canonical data model v0
-- Implementation baseline. IDs are application-issued text identifiers for portability.
-- Enable and tailor PostgreSQL row-level security before any live deployment.

BEGIN;

CREATE TABLE tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','suspended','deleted')),
  data_region text,
  retention_policy_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identities (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  identity_type text NOT NULL CHECK (identity_type IN ('human','agent','service','organization')),
  display_name text NOT NULL,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE scopes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  scope_type text NOT NULL,
  external_ref text,
  parent_scope_id text REFERENCES scopes(id),
  classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scope_type, external_ref)
);

CREATE TABLE role_assignments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  identity_id text NOT NULL REFERENCES identities(id),
  role_code text NOT NULL,
  scope_id text REFERENCES scopes(id),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE workflow_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  workflow_type text NOT NULL,
  version text NOT NULL,
  decision_graph_ref text NOT NULL,
  authority_matrix_ref text NOT NULL,
  policy_bundle_ref text,
  eval_suite_ref text,
  status text NOT NULL CHECK (status IN ('draft','shadow','active','retired','rolled_back')),
  approved_by text REFERENCES identities(id),
  approved_at timestamptz,
  rollback_to_version_id text REFERENCES workflow_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workflow_type, version)
);

CREATE TABLE coordination_cases (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  workflow_version_id text NOT NULL REFERENCES workflow_versions(id),
  workflow_type text NOT NULL,
  customer_ref text,
  issue_fingerprint text,
  state text NOT NULL,
  severity text CHECK (severity IN ('low','medium','high','critical')),
  owner_id text REFERENCES identities(id),
  scope_ids text[] NOT NULL,
  due_at timestamptz,
  accepted_outcome_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  CHECK (array_length(scope_ids, 1) >= 1)
);
CREATE INDEX coordination_cases_tenant_state_idx ON coordination_cases(tenant_id, state, severity, due_at);
CREATE INDEX coordination_cases_issue_idx ON coordination_cases(tenant_id, customer_ref, issue_fingerprint);

CREATE TABLE case_participants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text NOT NULL REFERENCES coordination_cases(id),
  identity_id text NOT NULL REFERENCES identities(id),
  case_role text NOT NULL,
  authority_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, identity_id, case_role)
);

CREATE TABLE work_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text REFERENCES coordination_cases(id),
  source text NOT NULL,
  source_event_id text NOT NULL,
  actor_id text REFERENCES identities(id),
  scope_ids text[] NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  payload_ref text,
  classification text NOT NULL DEFAULT 'internal',
  UNIQUE (tenant_id, source, source_event_id)
);

CREATE TABLE evidence_refs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text NOT NULL REFERENCES coordination_cases(id),
  source text NOT NULL,
  resource_uri text NOT NULL,
  source_version text,
  authority_rank integer NOT NULL CHECK (authority_rank BETWEEN 1 AND 5),
  freshness text,
  occurred_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  scope_ids text[] NOT NULL,
  content_hash text NOT NULL,
  excerpt text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, resource_uri, content_hash)
);

CREATE TABLE artifacts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text NOT NULL REFERENCES coordination_cases(id),
  artifact_type text NOT NULL,
  status text NOT NULL,
  value jsonb NOT NULL,
  confidence numeric(5,4),
  claim_type text NOT NULL CHECK (claim_type IN ('fact','inference','recommendation')),
  evidence_ids text[] NOT NULL DEFAULT '{}',
  valid_from timestamptz,
  valid_to timestamptz,
  created_by text REFERENCES identities(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (claim_type <> 'fact' OR array_length(evidence_ids,1) >= 1)
);

CREATE TABLE decision_packets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text NOT NULL REFERENCES coordination_cases(id),
  version integer NOT NULL,
  current_truth jsonb NOT NULL,
  gaps_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation jsonb,
  required_authority jsonb NOT NULL,
  deadline timestamptz,
  evidence_ids text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, version)
);

CREATE TABLE action_proposals (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text NOT NULL REFERENCES coordination_cases(id),
  decision_packet_id text REFERENCES decision_packets(id),
  action_type text NOT NULL,
  target text NOT NULL,
  operation text NOT NULL,
  preview jsonb NOT NULL,
  payload_hash text NOT NULL,
  risk_level text NOT NULL,
  required_approval_policy text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','pending_approval','approved','rejected','expired','executed','failed','cancelled')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE approvals (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  proposal_id text NOT NULL REFERENCES action_proposals(id),
  approver_id text NOT NULL REFERENCES identities(id),
  authority_role text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','modified','requested_evidence','escalated')),
  reason text,
  approved_payload_hash text,
  policy_version text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE action_receipts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  proposal_id text NOT NULL REFERENCES action_proposals(id),
  provider text NOT NULL,
  external_ref text,
  status text NOT NULL,
  request_hash text NOT NULL,
  response_ref text,
  attempt integer NOT NULL DEFAULT 1,
  executed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, request_hash)
);

CREATE TABLE commitments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text NOT NULL REFERENCES coordination_cases(id),
  description text NOT NULL,
  recipient_ref text,
  owner_id text NOT NULL REFERENCES identities(id),
  due_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed','approved','active','overdue','completed','transferred','cancelled')),
  approval_id text REFERENCES approvals(id),
  completion_evidence_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX commitments_due_idx ON commitments(tenant_id, status, due_at);

CREATE TABLE intelligence_receipts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text NOT NULL REFERENCES coordination_cases(id),
  operation text NOT NULL,
  model_provider text,
  model_name text,
  prompt_or_policy_version text,
  context_evidence_ids text[] NOT NULL DEFAULT '{}',
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cached_tokens bigint NOT NULL DEFAULT 0,
  cost_usd numeric(18,6) NOT NULL DEFAULT 0,
  latency_ms bigint,
  result_artifact_ids text[] NOT NULL DEFAULT '{}',
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outcomes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text NOT NULL REFERENCES coordination_cases(id),
  outcome_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted','not_accepted','partial','unknown')),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids text[] NOT NULL,
  verified_by text NOT NULL REFERENCES identities(id),
  verified_at timestamptz NOT NULL,
  value_usd numeric(18,2),
  CHECK (array_length(evidence_ids,1) >= 1)
);

CREATE TABLE corrections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text NOT NULL REFERENCES coordination_cases(id),
  actor_id text NOT NULL REFERENCES identities(id),
  target_type text NOT NULL,
  target_id text NOT NULL,
  before_value jsonb,
  after_value jsonb NOT NULL,
  reason text NOT NULL,
  failure_class text NOT NULL,
  evidence_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE learning_candidates (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  source_case_id text NOT NULL REFERENCES coordination_cases(id),
  correction_id text REFERENCES corrections(id),
  candidate_type text NOT NULL CHECK (candidate_type IN ('scoped_memory','evaluation_case','skill','routing_rule','policy_change','workflow_change')),
  scope_ids text[] NOT NULL,
  content jsonb NOT NULL,
  evidence_ids text[] NOT NULL,
  eval_status text NOT NULL DEFAULT 'not_run',
  promotion_status text NOT NULL DEFAULT 'candidate',
  target_ref text,
  proposed_version text,
  rollback_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE eval_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  candidate_id text REFERENCES learning_candidates(id),
  suite_id text NOT NULL,
  suite_version text NOT NULL,
  baseline_version text,
  candidate_version text,
  status text NOT NULL,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  failed_case_ids text[] NOT NULL DEFAULT '{}',
  artifact_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_entries (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  case_id text REFERENCES coordination_cases(id),
  actor_id text REFERENCES identities(id),
  actor_type text NOT NULL,
  operation text NOT NULL,
  target_ref text NOT NULL,
  before_hash text,
  after_hash text,
  policy_version text,
  workflow_version text,
  trace_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entries_case_time_idx ON audit_entries(tenant_id, case_id, occurred_at);

CREATE TABLE outbox_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX outbox_unpublished_idx ON outbox_events(created_at) WHERE published_at IS NULL;

-- Illustrative RLS activation. Add application-specific policies using authenticated tenant/scope claims.
ALTER TABLE identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordination_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;

COMMIT;
