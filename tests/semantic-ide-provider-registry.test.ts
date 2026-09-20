import { describe, expect, it } from 'vitest';
import {
  createProviderAdapter,
  mergeProviderDefinitions,
  selectProviderDefinition,
} from '../src/semantic-ide/provider-registry.js';
import type { SemanticLanguageServerDefinition } from '../src/semantic-ide/types.js';

function def(
  id: string,
  extension: string,
  options: Partial<SemanticLanguageServerDefinition> = {},
): SemanticLanguageServerDefinition {
  return {
    id,
    extensions: [extension],
    languageIds: { [extension]: id },
    command: process.execPath,
    args: [],
    ...options,
  };
}

describe('Semantic IDE provider registry', () => {
  it('keeps explicit file definitions above config definitions and built-ins', () => {
    const built = def('same', '.x', { priority: 900, command: 'built' });
    const inline = def('same', '.x', { priority: 0, command: 'inline' });
    const file = def('same', '.x', { priority: 0, command: 'file' });
    const merged = mergeProviderDefinitions([built], [inline], [file]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.command).toBe('file');
    expect(merged[0]?.priority).toBeGreaterThanOrEqual(2000);
  });

  it('uses priority first and language composition as a deterministic tie breaker', () => {
    const low = def('low', '.x', { priority: 1 });
    const high = def('high', '.x', { priority: 2 });
    expect(selectProviderDefinition('C:\\fixture', 'C:\\fixture\\file.x', undefined, [low, high], new Map()).definition.id)
      .toBe('high');

    const left = def('left', '.x', { priority: 5 });
    const right = def('right', '.x', { priority: 5 });
    expect(selectProviderDefinition('/fixture', '/fixture/file.x', undefined, [left, right], new Map([
      ['left', 0.2],
      ['right', 0.8],
    ])).definition.id).toBe('right');
  });

  it('provides deterministic TypeScript client/init policy with background ATA disabled', () => {
    const definition = def('typescript', '.ts', {
      adapter: 'typescript',
      initializationOptions: { tsserver: { path: 'fixture' } },
    });
    const adapter = createProviderAdapter(definition);
    const initialization = adapter.initializationOptions(definition);
    expect(initialization).toMatchObject({
      tsserver: { path: 'fixture' },
      disableAutomaticTypingAcquisition: true,
    });
    expect(adapter.clientCapabilities({ sentinel: true })).not.toHaveProperty('sentinel');
    expect(adapter.retryOnContentModified).toEqual([]);
  });

  it('normalizes C# and PowerShell symbols only through their provider adapters', () => {
    const csharp = createProviderAdapter(def('csharp', '.cs', { adapter: 'csharp' }));
    expect(csharp.normalizeSymbol('Add(int, int) : int', 6)).toMatchObject({ name: 'Add' });

    const powershell = createProviderAdapter(def('powershell', '.ps1', { adapter: 'powershell' }));
    expect(powershell.normalizeSymbol('function Invoke-Thing($x)', 12)).toMatchObject({ name: 'Invoke-Thing' });

    const generic = createProviderAdapter(def('generic', '.x', { adapter: 'generic' }));
    expect(generic.normalizeSymbol('Add(int, int) : int', 6).name).toBe('Add(int, int) : int');
  });

  it('returns deterministic typed C# workspace/configuration values', () => {
    const csharp = createProviderAdapter(def('csharp', '.cs', { adapter: 'csharp' }));
    const result = csharp.configurationResponse({
      items: [
        { section: 'tab_width' },
        { section: 'insert_final_newline' },
        { section: 'csharp_enable_something' },
        { section: 'unknown' },
      ],
    });
    expect(result).toEqual([4, true, false, null]);
  });
});
