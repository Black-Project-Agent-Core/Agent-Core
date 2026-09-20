import { describe, expect, it } from 'vitest';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';

const MANIFEST_BYTE_BUDGET = 120_000;
const APPROX_TOKEN_BUDGET = 30_000;

function fullRuntimeStub(): any {
  return {
    memoryService: {},
    learningService: {},
    hermesPartner: {},
    semanticIde: {},
    phoneController: { enabled: true },
    codeIntelligence: {},
  };
}

function registeredTools(): Array<[string, any]> {
  const server = createAgentCoreMcpServer(undefined, fullRuntimeStub());
  const registrations = (server as any)._registeredTools ?? (server as any).registeredTools;
  return registrations instanceof Map ? [...registrations.entries()] : Object.entries(registrations ?? {});
}
function jsonSchema(value: any): Record<string, any> {
  if (value?.toJSONSchema) return value.toJSONSchema();
  return {};
}

function fingerprint(name: string, tool: any): unknown {
  const schema = jsonSchema(tool.inputSchema);
  const properties = Object.fromEntries(
    Object.entries(schema.properties ?? {})
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    name,
    properties,
    required: [...(schema.required ?? [])].sort(),
    annotations: tool.annotations ?? {},
  };
}

function wireManifest(entries: Array<[string, any]>): unknown {
  return {
    tools: entries
      .map(([name, tool]) => ({
        name,
        title: tool.title,
        description: tool.description,
        inputSchema: jsonSchema(tool.inputSchema),
        annotations: tool.annotations ?? {},
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
describe('MCP public manifest contract', () => {
  it('keeps the complete production tool surface deterministic and schema-fingerprintable', () => {
    const entries = registeredTools();
    expect(entries).toHaveLength(62);
    const fingerprints = entries.map(([name, tool]) => fingerprint(name, tool));
    expect(new Set(entries.map(([name]) => name)).size).toBe(62);
    expect(fingerprints).toHaveLength(62);

    const recent = entries.find(([name]) => name === 'get_recent_tool_calls')?.[1];
    const recentProps = Object.keys(jsonSchema(recent?.inputSchema).properties ?? {});
    expect(recentProps).toEqual(expect.arrayContaining(['compact', 'failuresOnly']));
  });

  it('keeps the serialized tools/list-equivalent payload inside the reviewed handshake budget', () => {
    const manifest = JSON.stringify(wireManifest(registeredTools()));
    const bytes = Buffer.byteLength(manifest, 'utf8');
    const approximateTokens = Math.ceil(bytes / 4);
    expect(bytes).toBeLessThanOrEqual(MANIFEST_BYTE_BUDGET);
    expect(approximateTokens).toBeLessThanOrEqual(APPROX_TOKEN_BUDGET);
  });
});
