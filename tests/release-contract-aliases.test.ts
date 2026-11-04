import { expect, it } from 'vitest';
import { compareMcpContracts } from '../scripts/release/mcp-contract.mjs';

const base = `export const browserControl = z.object({ action:z.enum(['open','observe']), url:z.string().optional() });`;
const schemas = (original = base) => `${original}
export const externalBrowserControl = z.object({ ...browserControl.shape,
  action:z.enum(['open','observe','conversation_read']), read:z.string().optional() });`;
function source(declaration: string, original = base, selector = 'native ? schemas.browserControl : schemas.externalBrowserControl') {
  const files: Record<string, string> = {
    'src/mcp/server.ts': `import * as schemas from './rdc-schemas.js';
      export function register(runtime) { ${declaration}
        tool(server, 'browser_control', 'Browser', ${selector}, handler);
      }`,
    'src/mcp/rdc-schemas.ts': schemas(original),
  };
  return async (file: string) => files[file] ?? null;
}
const baseline = () => source('', base, 'schemas.browserControl');

it('selects the external browser schema for the current shared-Native const alias', async () => {
  const current = source('const native = Boolean(runtime.nativeTaskId) || runtime.sharedNativeRegistry === true;');
  const result = await compareMcpContracts(current, baseline());
  expect(result.currentCount).toBe(1);
  expect(result.breakingEvidence).toBe(false);
  expect(result.toolChanges).toContainEqual(expect.objectContaining({ name: 'browser_control', addedParams: ['read'] }));
});

it('accepts the earlier simple Native alias without losing external inherited fields', async () => {
  const current = source('const native = Boolean(runtime.nativeTaskId);', base.replace('url:z.string().optional()', 'other:z.string().optional()'));
  const result = await compareMcpContracts(current, baseline());
  expect(result.breakingEvidence).toBe(true);
  expect(result.toolChanges).toContainEqual(expect.objectContaining({ removedParams: ['url'] }));
});

it('refuses unknown or mutable aliases rather than guessing a branch', async () => {
  for (const declaration of [
    'const native = runtime.featureFlag;',
    'let native = Boolean(runtime.nativeTaskId);',
    'const native = Boolean(runtime.nativeTaskId) || runtime.unknownFlag === true;',
    'const Boolean = () => true; const native = Boolean(runtime.nativeTaskId);',
  ]) {
    const current = source(declaration);
    await expect(compareMcpContracts(current, baseline())).rejects.toThrow(/MCP_CONTRACT_UNSUPPORTED_CONDITION/);
  }
});

it('does not borrow an alias from a different function or an outer shadowed binding', async () => {
  for (const text of [
    `const native = Boolean(runtime.nativeTaskId); function register(runtime,native) { tool(server,'browser_control','Browser',native ? schemas.browserControl : schemas.externalBrowserControl,handler); }`,
    `function other(runtime) { const native = Boolean(runtime.nativeTaskId); } function register(runtime) { tool(server,'browser_control','Browser',native ? schemas.browserControl : schemas.externalBrowserControl,handler); }`,
  ]) {
    const read = async (file: string) => file === 'src/mcp/server.ts'
      ? `import * as schemas from './rdc-schemas.js'; ${text}`
      : file === 'src/mcp/rdc-schemas.ts' ? schemas() : null;
    await expect(compareMcpContracts(read, baseline())).rejects.toThrow(/MCP_CONTRACT_UNSUPPORTED_CONDITION/);
  }
});
