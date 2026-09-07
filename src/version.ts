/**
 * Single source of truth for the Agent Core development/release identity.
 *
 * Every version probe (MCP serverInfo, agent_core_status, /health, GitHub Fabric User-Agent,
 * connection metadata) derives from this constant so the identity cannot drift between sites.
 * `scripts/release/check-release.mjs` requires this literal to match package.json and rejects any
 * other version literal under src/.
 */
export const AGENT_CORE_VERSION = '0.7.0';
export const AGENT_CORE_USER_AGENT = `Agent-Core/${AGENT_CORE_VERSION}`;
