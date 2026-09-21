export const AGENT_EVENT_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_external_observations (
  agent_id TEXT PRIMARY KEY NOT NULL,
  parent_agent_id TEXT,
  provider TEXT NOT NULL CHECK(provider IN ('codex', 'claude_code')),
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  session_id TEXT,
  label TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('starting','running','completed','exited','failed','cancelled','stopped','timed_out','termination_unverified')),
  current_activity TEXT,
  tool_name TEXT,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_external_observations_recent
  ON agent_external_observations(updated_at DESC, agent_id ASC);

CREATE INDEX IF NOT EXISTS idx_agent_external_observations_expiry
  ON agent_external_observations(expires_at ASC);

CREATE TABLE IF NOT EXISTS agent_external_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('registered','started','updated','heartbeat','spawned','tool_started','tool_completed','completed','failed','disconnected')),
  provider TEXT NOT NULL CHECK(provider IN ('codex', 'claude_code')),
  workspace_id TEXT NOT NULL,
  state TEXT NOT NULL,
  current_activity TEXT,
  tool_name TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_external_events_recent
  ON agent_external_events(timestamp DESC, event_id DESC);
`;
