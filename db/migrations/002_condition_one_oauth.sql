BEGIN;
ALTER TABLE pincraft_auto_settings ADD COLUMN IF NOT EXISTS interval_minutes integer NOT NULL DEFAULT 120 CHECK (interval_minutes BETWEEN 30 AND 1440 AND interval_minutes % 30 = 0);
ALTER TABLE pincraft_auto_settings ADD COLUMN IF NOT EXISTS daily_limit integer NOT NULL DEFAULT 10 CHECK (daily_limit BETWEEN 1 AND 10);
ALTER TABLE pincraft_auto_settings ADD COLUMN IF NOT EXISTS posting_mode text NOT NULL DEFAULT 'queue' CHECK (posting_mode IN ('queue','generated'));
ALTER TABLE pincraft_auto_settings ADD COLUMN IF NOT EXISTS pinterest_board_id text;
ALTER TABLE pincraft_auto_settings ADD COLUMN IF NOT EXISTS pinterest_board_name text;
ALTER TABLE pincraft_auto_settings ADD COLUMN IF NOT EXISTS blogger_blog_id text;
ALTER TABLE pincraft_auto_settings ADD COLUMN IF NOT EXISTS blogger_blog_url text;
ALTER TABLE pincraft_auto_settings ADD COLUMN IF NOT EXISTS blogger_blog_name text;

CREATE TABLE IF NOT EXISTS pincraft_oauth_connections (
  user_id text NOT NULL REFERENCES pincraft_auto_settings(user_id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('pinterest','blogger')),
  encrypted_tokens text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','reconnect_required','disconnected')),
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  token_version integer NOT NULL DEFAULT 1,
  refresh_lease uuid,
  refresh_lease_until timestamptz,
  last_refreshed_at timestamptz,
  last_error text,
  revocation_status text NOT NULL DEFAULT 'not_requested' CHECK (revocation_status IN ('not_requested','revoked','manual_required','unconfirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,provider),
  CHECK (status <> 'connected' OR encrypted_tokens IS NOT NULL),
  CHECK (provider <> 'pinterest' OR status <> 'connected' OR expires_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pincraft_oauth_refresh_due ON pincraft_oauth_connections(expires_at,refresh_expires_at) WHERE provider='pinterest' AND status='connected';
CREATE TABLE IF NOT EXISTS pincraft_oauth_attempts (
  state_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES pincraft_auto_settings(user_id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('pinterest','blogger')),
  browser_hash text NOT NULL,
  connection_revision integer NOT NULL,
  pkce_envelope text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pincraft_oauth_attempts_owner ON pincraft_oauth_attempts(user_id,provider,created_at DESC);
CREATE INDEX IF NOT EXISTS pincraft_oauth_attempts_expiry ON pincraft_oauth_attempts(expires_at);

ALTER TABLE pincraft_auto_jobs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'generated' CHECK (kind IN ('generated','queued_pin'));
ALTER TABLE pincraft_auto_jobs ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE pincraft_auto_jobs ADD COLUMN IF NOT EXISTS destination_url text;
ALTER TABLE pincraft_auto_jobs ADD COLUMN IF NOT EXISTS board_id text;
ALTER TABLE pincraft_auto_jobs ADD COLUMN IF NOT EXISTS blog_target_id text;
ALTER TABLE pincraft_auto_jobs ADD COLUMN IF NOT EXISTS blog_target_url text;
ALTER TABLE pincraft_auto_jobs ADD COLUMN IF NOT EXISTS request_key uuid;
ALTER TABLE pincraft_auto_jobs ADD COLUMN IF NOT EXISTS uncertain_step text CHECK (uncertain_step IN ('article','pin'));
ALTER TABLE pincraft_auto_jobs DROP CONSTRAINT IF EXISTS pincraft_auto_jobs_state_check;
ALTER TABLE pincraft_auto_jobs ADD CONSTRAINT pincraft_auto_jobs_state_check CHECK (state IN ('queued','pending','generating','generated','publishing','blog_published','posting','success','retry','failed','attention','cancelled'));
ALTER TABLE pincraft_auto_jobs DROP CONSTRAINT IF EXISTS pincraft_auto_jobs_user_id_scheduled_at_key;
CREATE UNIQUE INDEX IF NOT EXISTS pincraft_auto_generated_slot ON pincraft_auto_jobs(user_id,scheduled_at) WHERE kind='generated';
CREATE UNIQUE INDEX IF NOT EXISTS pincraft_auto_queue_request ON pincraft_auto_jobs(user_id,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS pincraft_auto_queue_due ON pincraft_auto_jobs(user_id,scheduled_at,created_at) WHERE state='queued';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pincraft_auto_schema WHERE version=2) THEN
    -- Legacy manually pasted provider credentials are not silently converted
    -- into OAuth consent. Erase that entire old secret bundle and pause safely.
    UPDATE pincraft_auto_jobs SET uncertain_step=CASE WHEN state='posting' OR blog_url IS NOT NULL THEN 'pin' ELSE 'article' END,
      state='attention',lease_token=NULL,lease_until=NULL,error_code='legacy_connection_removed',
      error_message='Legacy publishing credentials were removed. Inspect the original remote destination and explicitly abandon or verify this job before enabling OAuth posting.'
      WHERE state IN ('publishing','posting','attention') OR (blog_url IS NOT NULL AND state NOT IN ('success','failed','cancelled'));
    UPDATE pincraft_auto_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,
      error_message='Unpublished legacy job paused during the password-free OAuth migration. Its cloud draft remains saved.'
      WHERE state IN ('pending','generating','generated','blog_published','retry');
    UPDATE pincraft_auto_settings SET enabled=false,credentials=NULL,connection_summary=NULL,
      last_error=CASE WHEN credentials IS NOT NULL THEN 'Connect Pinterest and Blogger using their own OAuth consent pages. Re-enter the optional AI API key for generated articles.' ELSE last_error END,
      connection_version=connection_version+1,updated_at=now();
  END IF;
END $$;
INSERT INTO pincraft_auto_schema(version) VALUES(2) ON CONFLICT DO NOTHING;
COMMIT;
