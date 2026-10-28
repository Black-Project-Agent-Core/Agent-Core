import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// UP-13 / GCB-17: the theme is a contract that can be tested without opening a window. Reads the stylesheet only.
// jsdom gives import.meta.url a non-file scheme, so the folder comes from the working directory (src/ui or the repository root).
const dir = [path.resolve('src'), path.resolve('src', 'ui', 'src')].map(folder => `${folder}${path.sep}`).find(folder => existsSync(`${folder}index.css`)) ?? '';
const css = readFileSync(`${dir}index.css`, 'utf8');
const tokens = new Map<string, string>();
for (const match of (/:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '').matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) tokens.set(match[1], match[2]);

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (foreground: string, background: string) => {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
};
const token = (name: string) => {
  const value = tokens.get(name);
  if (!value) throw new Error(`missing token --${name}`);
  return value;
};

const surfaces = ['bg', 'bg-deep', 'panel', 'panel-2', 'panel-3'];
const textTokens = ['text', 'text-2', 'muted', 'cyan', 'green', 'amber', 'red', 'offline'];

describe('UI theme contract', () => {
  it('declares the opaque tokens the checks below depend on', () => {
    for (const name of [...surfaces, ...textTokens, 'cyan-2', 'purple']) expect(tokens.has(name)).toBe(true);
  });

  it.each(textTokens)('--%s keeps at least 4.5:1 against every surface', name => {
    for (const surface of surfaces) {
      expect(contrast(token(name), token(surface)), `${name} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the focus ring (--cyan) at 3:1 or more against every surface', () => {
    for (const surface of surfaces) expect(contrast(token('cyan'), token(surface)), surface).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline\s*:/);
  });

  it('never uses the two tokens that fall below 4.5:1 on some surface as text colour', () => {
    // --cyan-2 and --purple are fine for borders and fills. If one becomes a text colour, raise it or pick another token.
    const sources = readdirSync(dir).filter(name => /\.(css|tsx)$/.test(name) && !name.endsWith('.test.tsx'));
    const offenders = sources.filter(name => /(?<![-\w])color\s*:\s*['"]?var\(--(?:cyan-2|purple)\)/.test(readFileSync(`${dir}${name}`, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('loads nothing from an external address through the stylesheet', () => {
    expect(css).not.toMatch(/@import\s+(?:url\()?['"]?(?:https?:)?\/\//i);
    expect(css).not.toMatch(/url\(\s*['"]?(?:https?:)?\/\//i);
  });
});
