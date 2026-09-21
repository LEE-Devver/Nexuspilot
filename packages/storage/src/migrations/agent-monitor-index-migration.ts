export const AGENT_MONITOR_INDEX_MIGRATION_SQL = `
CREATE INDEX IF NOT EXISTS idx_agent_swarms_recent ON agent_swarms(updated_at DESC, created_at DESC, id DESC);
`;
