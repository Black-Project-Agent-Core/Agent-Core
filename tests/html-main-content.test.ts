import { expect, it } from 'vitest';
import { selectMainHtml } from '../src/rdc/document-projection/html-main-content.js';
import { htmlToMarkdown } from '../src/rdc/document-projection/helpers.js';

const body = 'Useful source evidence '.repeat(40);
it('selects explicit semantic main while preserving default Markdown structures', () => {
  const result = selectMainHtml(`<html><body><nav>Navigation</nav><main><h1>Title</h1><p>${body}</p><ul><li>First</li></ul><pre><code>let n = 1;</code></pre><table><tr><th>Key</th></tr><tr><td>Value</td></tr></table></main></body></html>`);
  expect(result.scope).toBe('main'); expect(result.reason).toBe('semantic-main');
  expect(result.html).not.toContain('Navigation');
  const markdown=htmlToMarkdown(result.html, 'https://example.org/source');
  for (const text of ['# Title', 'First', 'let n = 1;', 'Key', 'Value']) expect(markdown).toContain(text);
  expect(result.retainedTextChars! + result.droppedTextChars!).toBeGreaterThan(result.retainedTextChars!);
});
it('falls back honestly on competing semantic regions and bounded traversal', () => {
  for (const [html, reason] of [
    [`<main>${body}</main><article>${body}</article>`, 'competing-main-regions'],
    [`<div>${'<span>x</span>'.repeat(10_001)}</div>`, 'node-limit'],
    [`${'<div>'.repeat(130)}${body}${'</div>'.repeat(130)}`, 'depth-limit'],
  ]) {
    const result=selectMainHtml(html!);
    expect(result).toMatchObject({html,scope:'full',reason});
  }
});
it('retains a correction outside a density candidate rather than silently dropping it', () => {
  const html=`<div><div>${'<a href="/">Navigation item</a>'.repeat(70)}</div><section><p>${body.repeat(3)}</p></section><aside><p>Correction: source revoked.</p></aside></div>`;
  const result=selectMainHtml(html);
  expect(result.scope).toBe('full');expect(result.html).toContain('source revoked');
});
it.each([
  '<div>Correction: result was false.</div>',
  'Correction: result was false.',
])('retains non-link correction text outside density roots: %s', correction => {
  const content = `<section>${`<p>${body}</p>`.repeat(3)}</section>`;
  const navigation = `<nav>${'<a href="/">Navigation item</a>'.repeat(40)}</nav>`;
  const withoutCorrection = `<div>${navigation}${content}</div>`;
  expect(selectMainHtml(withoutCorrection).scope).toBe('main');
  const html = `<div>${navigation}${content}${correction}</div>`;
  expect(selectMainHtml(html)).toMatchObject({
    html, scope: 'full', reason: 'protected-content-outside-selection', droppedTextChars: 0,
  });
});
