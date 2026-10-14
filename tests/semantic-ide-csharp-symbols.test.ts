import { describe, expect, it } from 'vitest';
import { createProviderAdapter } from '../src/semantic-ide/provider-registry.js';
const adapter = createProviderAdapter({ id: 'csharp', adapter: 'csharp', command: 'unused', extensions: ['.cs'], languageIds: { '.cs': 'csharp' } });
describe('S4-P1 C# property/method normalization', () => {
  it.each([
    ['Name : string', 'Name', ': string'],
    ['Position : (int X, string Y)', 'Position', ': (int X, string Y)'],
    ['Lookup : Dictionary<string, (int X, (int Y, int Z) Pair)>', 'Lookup', ': Dictionary<string, (int X, (int Y, int Z) Pair)>'],
    ['Get() : (int X, string Y)', 'Get', '() : (int X, string Y)'],
    ['Add(int, int) : int', 'Add', '(int, int) : int'],
    ['Widget(int)', 'Widget', '(int)'],
    ['Value  :  (int A, int B)', 'Value', ': (int A, int B)'],
  ])('%s', (input, name, detail) => expect(adapter.normalizeSymbol(input, 7)).toEqual({ name, detail }));
  it('preserves explicit detail', () => expect(adapter.normalizeSymbol('Position : (int A, int B)', 7, 'provider-detail')).toEqual({ name: 'Position', detail: 'provider-detail' }));
  it('retains unnamed fallback', () => expect(adapter.normalizeSymbol('', 7)).toEqual({ name: '' }));
});
