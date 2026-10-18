import { describe, expect, it } from 'vitest';
import { buildVersionEdits, parseProductVersion, plannedStableTarget } from '../scripts/release/release-lib.mjs';

describe('source prerelease identity',()=>{
  it('accepts beta source versions while keeping native numeric identity stable',async()=>{
    expect(parseProductVersion('0.15.0-beta.4')).toEqual({stable:'0.15.0',prerelease:'beta.4'});
    const edits=await buildVersionEdits('0.15.0-beta.4');
    expect(edits).toHaveLength(6);
    const csproj=edits.find(e=>e.file.endsWith('.csproj'))!.content;
    expect(csproj).toContain('<InformationalVersion>0.15.0-beta.4</InformationalVersion>');
    expect(csproj).toContain('<FileVersion>0.15.0.0</FileVersion>');
    expect(csproj).not.toContain('<FileVersion>0.15.0-beta.4.0</FileVersion>');
  });
  it('keeps retained feature intents within the current beta target',()=>{
    expect(plannedStableTarget('0.15.0-beta.3','minor','0.14.0')).toBe('0.15.0');
    expect(plannedStableTarget('0.15.0-beta.3','patch','0.14.0')).toBe('0.15.0');
    expect(()=>plannedStableTarget('0.15.0-beta.3','major','0.14.0')).toThrow(/target/);
    expect(plannedStableTarget('0.14.0','minor')).toBe('0.15.0');
  });
  it('rejects malformed versions before constructing edits',()=>{
    for(const value of ['0.15.0-beta.04','0.15.0-','0.15.0-beta..4','../0.15.0','0.15.0 beta.4'])expect(()=>parseProductVersion(value)).toThrow();
  });
});
