import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as ts from 'typescript-lsp-runtime';
import { describe, expect, it } from 'vitest';
import * as publicSchemas from '../src/mcp/rdc-schemas.js';
import { toolArgSchemas } from '../src/rdc/tools/schemas.js';

const ROOT = path.resolve('.');
const SERVER_FILE = path.join(ROOT, 'src', 'mcp', 'server.ts');

type Registration = { toolName: string; schemaExport: string };

function schemaKeys(schema: any): string[] {
  let current = schema;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const shape = current?.shape
      ?? current?.def?.shape
      ?? (typeof current?._def?.shape === 'function' ? current._def.shape() : current?._def?.shape);
    if (shape) return Object.keys(shape).sort();
    current = current?._def?.schema ?? current?._def?.innerType ?? current?.def?.innerType;
  }
  return [];
}
function deriveRdcRegistrations(source: string): Registration[] {
  const sf = ts.createSourceFile(SERVER_FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: Registration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'tool') {
      const toolName = node.arguments[1];
      const schema = node.arguments[3];
      if (
        toolName && ts.isStringLiteralLike(toolName)
        && schema && ts.isPropertyAccessExpression(schema)
        && ts.isIdentifier(schema.expression) && schema.expression.text === 'schemas'
      ) {
        found.push({ toolName: toolName.text, schemaExport: schema.name.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found.sort((a, b) => a.toolName.localeCompare(b.toolName));
}
describe('MCP schema contract auto-derivation', () => {
  it('derives every RDC registration and keeps public schemas aligned with handler parser schemas', async () => {
    const source = await readFile(SERVER_FILE, 'utf8');
    const registrations = deriveRdcRegistrations(source);
    expect(registrations).toHaveLength(26);

    for (const registration of registrations) {
      const publicSchema = (publicSchemas as Record<string, unknown>)[registration.schemaExport];
      const parserSchema = toolArgSchemas[registration.toolName];
      expect(publicSchema, `${registration.toolName} public schema missing`).toBeTruthy();
      expect(parserSchema, `${registration.toolName} parser schema missing`).toBeTruthy();
      expect(schemaKeys(publicSchema), `${registration.toolName} public/parser parameter drift`)
        .toEqual(schemaKeys(parserSchema));
    }
  });

  it('guards the compact failure-evidence parameters that previously drifted from tools/list', () => {
    expect(schemaKeys((publicSchemas as any).getRecentToolCalls))
      .toEqual(expect.arrayContaining(['compact', 'failuresOnly']));
  });
});
