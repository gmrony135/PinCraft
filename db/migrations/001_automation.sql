BEGIN;
-- This migration is safe to re-run. No credentials or sample success rows.
CREATE TABLE IF NOT EXISTS pincraft_auto_schema (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS pincraft_auto_settings (
  user_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  topics jsonb NOT NULL CHECK (jsonb_typeof(topics) = 'array' AND jsonb_array_length(topics) BETWEEN 1 AND 20),
  topic_source text NOT NULL DEFAULT 'rotation' CHECK (topic_source IN ('rotation','google_trends')),
  trend_region text NOT NULL DEFAULT 'BD',
  topic_index bigint NOT NULL DEFAULT 0,
  next_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  credentials text,
  connection_summary jsonb,
  connection_version integer NOT NULL DEFAULT 0,
  verify_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pincraft_auto_jobs (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES pincraft_auto_settings(user_id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  day_key date NOT NULL,
  topic text NOT NULL,
  topic_metadata jsonb,
  connection_version integer NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','generating','generated','publishing','blog_published','posting','success','retry','failed','attention','cancelled')),
  content jsonb,
  blog_id text,
  blog_url text,
  pin_id text,
  pin_url text,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  retry_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scheduled_at)
);
CREATE INDEX IF NOT EXISTS pincraft_auto_due ON pincraft_auto_settings(next_run_at) WHERE enabled;
CREATE INDEX IF NOT EXISTS pincraft_auto_jobs_user ON pincraft_auto_jobs(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS pincraft_auto_jobs_day ON pincraft_auto_jobs(user_id, completed_at) WHERE state='success';
CREATE INDEX IF NOT EXISTS pincraft_auto_jobs_retry ON pincraft_auto_jobs(retry_at, lease_until) WHERE state NOT IN ('success','failed','attention','cancelled');
CREATE UNIQUE INDEX IF NOT EXISTS pincraft_auto_one_open_job ON pincraft_auto_jobs(user_id) WHERE state IN ('pending','generating','generated','publishing','blog_published','posting','retry');
CREATE TABLE IF NOT EXISTS pincraft_auto_logs (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES pincraft_auto_settings(user_id) ON DELETE CASCADE,
  job_id uuid REFERENCES pincraft_auto_jobs(id) ON DELETE SET NULL,
  event text NOT NULL,
  status text NOT NULL CHECK (status IN ('info','success','error','warning')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pincraft_auto_logs_user ON pincraft_auto_logs(user_id, id DESC);
CREATE TABLE IF NOT EXISTS pincraft_auto_heartbeat (
  name text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL,
  last_finished_at timestamptz,
  last_status text NOT NULL,
  execution_id text
);
INSERT INTO pincraft_auto_schema(version) VALUES(1) ON CONFLICT DO NOTHING;
COMMIT;
