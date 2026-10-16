import { describe, expect, it } from 'vitest';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { registerControllerLearningTools } from '../src/mcp/controller-learning-tools.js';

// Pinned Batch 2/3/4 contract at 73e9fd270ee96fe7d9782b9e87ccc70dbbae986d:
// 75-tool cohort, excluding optional Memory v2 and external-controller registration.
const MANIFEST_BYTE_BUDGET = 128 * 1024;
const APPROX_TOKEN_BUDGET = 32_768;

function fullRuntimeStub(): any {
  return {
    memoryService: {},
    learningService: {},
    semanticIde: {},
    skillsService: {},
    phoneController: { enabled: true },
    codeIntelligence: {},
    webResearch: {},
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
    expect(entries).toHaveLength(75);
    const fingerprints = entries.map(([name, tool]) => fingerprint(name, tool));
    expect(new Set(entries.map(([name]) => name)).size).toBe(75);
    expect(fingerprints).toHaveLength(75);

    expect(entries.map(([name]) => name)).toEqual(expect.arrayContaining([
      'image_inspect',
      'memory_feedback',
      'memory_retirement_review',
      'memory_page',
      'memory_retrieval_diagnostics',
      'memory_export',
      'memory_import',
      'web_search',
      'web_open',
      'phone_game_inspect',
      'phone_game_manage',
    ]));

    const gameInspect = entries.find(([name]) => name === 'phone_game_inspect')?.[1];
    const gameManage = entries.find(([name]) => name === 'phone_game_manage')?.[1];
    expect(gameInspect?.annotations?.readOnlyHint).toBe(true);
    expect(gameManage?.annotations?.readOnlyHint).toBe(false);
    expect(Object.keys(jsonSchema(gameManage?.inputSchema).properties ?? {}))
      .toEqual(expect.arrayContaining(['action', 'gameId', 'sessionId', 'steps', 'semanticActionId']));

    const skills = entries.find(([name]) => name === 'skills')?.[1];
    expect(Object.keys(jsonSchema(skills?.inputSchema).properties ?? {})).toEqual(
      expect.arrayContaining(['action', 'name', 'sourcePath', 'evidenceRefs', 'candidateDigest', 'expectedActiveDigest', 'sourceChangeConfirmation',
        'query', 'limit', 'searchMode', 'offset', 'maxBytes']),
    );
    expect(jsonSchema(skills?.inputSchema).properties?.action?.enum).toEqual(expect.arrayContaining(['search', 'read']));
    expect(skills?.annotations?.readOnlyHint).toBe(false);

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

  it('keeps the full optional-cohort manifest inside the handshake budget', () => {
    const server = createAgentCoreMcpServer(undefined, {
      ...fullRuntimeStub(), artifactAuthorization: {}, memoryExperience: {},
    });
    // Register schemas only; no owner, task binding or invocation is fabricated.
    registerControllerLearningTools(server, undefined, undefined);
    const registrations = (server as any)._registeredTools ?? (server as any).registeredTools;
    const entries: Array<[string, any]> = registrations instanceof Map
      ? [...registrations.entries()] : Object.entries(registrations ?? {});
    expect(entries.map(([name]) => name)).toEqual(expect.arrayContaining([
      'memory_v2_read', 'memory_v2_write', 'controller_learning',
    ]));
    const bytes = Buffer.byteLength(JSON.stringify(wireManifest(entries)), 'utf8');
    expect(bytes).toBeLessThanOrEqual(MANIFEST_BYTE_BUDGET);
    expect(Math.ceil(bytes / 4)).toBeLessThanOrEqual(APPROX_TOKEN_BUDGET);
  });
});

it('removes transport-only description indentation without dropping tool guidance', async () => {
  const { RDC_TOOL_METADATA } = await import('../src/mcp/rdc-tool-metadata.js');
  for (const [name, tool] of registeredTools()) {
    const metadata = RDC_TOOL_METADATA[name as keyof typeof RDC_TOOL_METADATA];
    if (!metadata) continue;
    expect(tool.description).not.toMatch(/^[ \t]{24}/m);
    expect(tool.description).not.toMatch(/[ \t]+$/m);
    expect(tool.description).not.toMatch(/\n{3,}/);
    const words = (value: string) => value.replace(/\s+/g, ' ').trim();
    expect(words(tool.description)).toBe(words(metadata.description));
    const { title, ...behaviorHints } = metadata.annotations;
    expect(tool.title).toBe(metadata.title);
    expect(tool.annotations).toEqual(title === metadata.title ? behaviorHints : metadata.annotations);
  }
});
