/**
 * Density and ancestor/subtree selection adapted from web-content-extractor:
 * https://github.com/wrtnlabs/web-content-extractor/tree/4cdefff7726a9612bb828d1416becfc5715f8310
 * src/compute-text-density.ts and src/extract-content.ts.
 * Copyright (c) 2025 Wrtn Technologies. MIT; see THIRD_PARTY_NOTICES.md.
 */
import { NodeHtmlMarkdown, type TranslatorConfigFactory } from 'node-html-markdown';

export interface MainHtmlSelection {
  html: string;
  scope: 'full' | 'main';
  reason: string;
  retainedTextChars?: number;
  droppedTextChars?: number;
}

// Read only the public hook's DOM-shaped surface, without importing its parser.
interface TreeNode {
  nodeType: number;
  childNodes: ArrayLike<TreeNode>;
  tagName?: string;
  textContent?: string | null;
  text?: string;
  outerHTML?: string;
}

interface Stat {
  node: TreeNode;
  tag: string;
  parent?: Stat;
  children: Stat[];
  order: number;
  end: number;
  excluded: boolean;
  text: number;
  linkText: number;
  directNonLinkText: number;
  tags: number;
  links: number;
  density: number;
  densitySum: number;
  maximum: Stat;
}

const MAX_NODES = 10_000;
const MAX_DEPTH = 128;
const MAX_ROOTS = 8;
const MIN_MAIN_TEXT = 300;
const STRUCTURAL_HOOKS = 'html,body,main,article,section,div,header,footer,nav,aside';
// These have no rendered text in the existing converter; they are not stripped
// from the original HTML or from a selected subtree.
const NON_CONTENT = new Set(['HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT']);
const PROTECTED_STRUCTURE = new Set([
  'TABLE', 'UL', 'OL', 'DL', 'PRE', 'CODE', 'P', 'BLOCKQUOTE', 'CITE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGURE', 'FIGCAPTION',
  'DETAILS', 'SUMMARY', 'TIME', 'ADDRESS', 'IMG', 'SVG', 'MATH',
]);
const CONTENTLESS_EVIDENCE = new Set(['IMG', 'SVG', 'MATH']);

function contains(parent: Stat, child: Stat): boolean {
  return parent.order <= child.order && child.order < parent.end;
}

function inspectTree(root: TreeNode, html: string): MainHtmlSelection {
  const stats: Stat[] = [];
  let visited = 0;
  let limit: string | undefined;
  const stop = Symbol('selection-limit');

  function collect(node: TreeNode, parent: Stat | undefined, depth: number, inLink: boolean): void {
    if (++visited > MAX_NODES || depth > MAX_DEPTH) {
      limit = visited > MAX_NODES ? 'node-limit' : 'depth-limit';
      throw stop;
    }
    if (node.nodeType === 3) {
      if (parent && !parent.excluded) {
        // Count each decoded leaf once, excluding whitespace. Aggregation below
        // reuses these counts rather than rescanning text at every ancestor.
        const length = (node.textContent ?? node.text ?? '').replace(/\s/g, '').length;
        parent.text += length;
        if (inLink) parent.linkText += length;
        else parent.directNonLinkText += length;
      }
      return;
    }
    if (![1, 9, 11].includes(node.nodeType)) return;
    const tag = (node.tagName ?? '').toUpperCase();
    const stat: Stat = {
      node, tag, parent, children: [], order: stats.length, end: 0,
      excluded: Boolean(parent?.excluded || NON_CONTENT.has(tag)),
      text: 0, linkText: 0, directNonLinkText: 0, tags: 0, links: 0, density: 0, densitySum: 0,
      maximum: undefined as unknown as Stat,
    };
    stat.maximum = stat;
    stats.push(stat);
    parent?.children.push(stat);
    for (let i = 0; i < node.childNodes.length; i += 1) {
      collect(node.childNodes[i]!, stat, depth + 1, inLink || tag === 'A');
    }
    stat.end = stats.length;
  }

  try {
    collect(root, undefined, 0, false);
  } catch (error) {
    if (error !== stop) throw error;
    return { html, scope: 'full', reason: limit! };
  }
  const rootStat = stats[0];
  if (!rootStat) return { html, scope: 'full', reason: 'tree-unavailable' };
  for (let i = stats.length - 1; i >= 0; i -= 1) {
    const stat = stats[i]!;
    if (stat.excluded || !stat.parent) continue;
    stat.parent.text += stat.text;
    stat.parent.linkText += stat.linkText;
    stat.parent.tags += stat.tags + (stat.tag ? 1 : 0);
    stat.parent.links += stat.links + (stat.tag === 'A' ? 1 : 0);
  }
  const full = (reason: string): MainHtmlSelection => ({
    html, scope: 'full', reason, retainedTextChars: rootStat.text, droppedTextChars: 0,
  });
  const selected = (roots: Stat[], reason: string): MainHtmlSelection => {
    const parts = roots.map(stat => stat.node.outerHTML);
    if (parts.some(part => typeof part !== 'string' || !part)) return full('tree-unavailable');
    const retained = roots.reduce((sum, stat) => sum + stat.text, 0);
    return {
      html: parts.join('\n'), scope: 'main', reason,
      retainedTextChars: retained, droppedTextChars: rootStat.text - retained,
    };
  };
  if (!rootStat.text) return full('no-text');

  const semantic: Stat[] = [];
  for (const stat of stats) {
    if (stat.excluded || !['MAIN', 'ARTICLE'].includes(stat.tag)) continue;
    if (!semantic.some(ancestor => contains(ancestor, stat))) semantic.push(stat);
  }
  if (semantic.length > 1) return full('competing-main-regions');
  if (semantic.length === 1) {
    const main = semantic[0]!;
    if (main.text < MIN_MAIN_TEXT) return full('semantic-main-too-short');
    return selected([main], main.tag === 'MAIN' ? 'semantic-main' : 'semantic-article');
  }

  // Adapt the donor's text/tag density and link-density penalty to one bounded,
  // post-order aggregation. These scores select candidates, not confidence.
  const rootLinkRatio = rootStat.linkText / rootStat.text;
  for (const stat of stats) {
    if (stat.excluded) continue;
    stat.density = stat.text / Math.max(1, stat.tags);
    if (stat.tag === 'A') {
      const logBase = Math.log(
        (stat.text / Math.max(1, stat.text - stat.linkText)) * stat.linkText
        + rootLinkRatio * stat.text + 1e-3,
      );
      const logArg = ((stat.text / Math.max(1, stat.linkText)) * Math.max(1, stat.tags))
        / Math.max(1, stat.links);
      stat.density *= Math.log(Math.max(1, logArg)) / Math.log(Math.max(2, logBase));
    }
    if (stat.parent) stat.parent.densitySum += stat.density;
  }
  for (let i = stats.length - 1; i >= 0; i -= 1) {
    const stat = stats[i]!;
    if (stat.parent && stat.maximum.densitySum > stat.parent.maximum.densitySum) {
      stat.parent.maximum = stat.maximum;
    }
  }
  const strongest = rootStat.maximum;
  let threshold = strongest.density;
  for (let parent = strongest.parent; parent; parent = parent.parent) {
    threshold = Math.min(threshold, parent.density);
  }
  let roots: Stat[] = [];
  const pending = [rootStat];
  while (pending.length) {
    const stat = pending.pop()!;
    if (stat.excluded || !stat.text || stat.density < threshold) continue;
    const candidate = stat.maximum;
    if (!roots.some(ancestor => contains(ancestor, candidate))) {
      roots = roots.filter(child => !contains(candidate, child));
      roots.push(candidate);
      if (roots.length > MAX_ROOTS) return full('root-limit');
    }
    for (let i = stat.children.length - 1; i >= 0; i -= 1) pending.push(stat.children[i]!);
  }
  if (!roots.length) return full('no-density-candidate');
  roots.sort((a, b) => a.order - b.order);
  const retained = roots.reduce((sum, stat) => sum + stat.text, 0);
  const retainedLinks = roots.reduce((sum, stat) => sum + stat.linkText, 0);
  const retainedNonLinks = retained - retainedLinks;
  // Conservative Agent Core thresholds, not donor constants or quality claims.
  if (retainedNonLinks < MIN_MAIN_TEXT) return full('insufficient-main-text');
  if (retainedNonLinks < 0.65 * (rootStat.text - rootStat.linkText)) return full('insufficient-non-link-coverage');
  if (retainedLinks > 0.35 * retained) return full('link-heavy-selection');
  if (retained > 0.85 * rootStat.text) return full('insufficient-reduction');
  for (const stat of stats) {
    if (stat.excluded || roots.some(ancestor => contains(ancestor, stat))) continue;
    // Tag names cannot establish that outside prose is safe to discard. Keep
    // even bare or custom-container text unless a semantic main was explicit.
    if (stat.directNonLinkText > 0 || (PROTECTED_STRUCTURE.has(stat.tag)
        && (stat.text > 0 || CONTENTLESS_EVIDENCE.has(stat.tag)))) {
      return full('protected-content-outside-selection');
    }
  }
  return selected(roots, 'text-density');
}

/** Select only on explicit main requests; the caller still uses default HTML translators. */
export function selectMainHtml(html: string): MainHtmlSelection {
  let result: MainHtmlSelection | undefined;
  const inspected = Symbol('tree-inspected');
  const hook: TranslatorConfigFactory = ({ visitor }) => {
    const root = visitor.rootNode as unknown as TreeNode;
    if (!root || !root.childNodes) result = { html, scope: 'full', reason: 'tree-unavailable' };
    else result = inspectTree(root, html);
    // This prepass needs the public tree, not an extra Markdown conversion.
    // Do not reuse ctx.base: it cannot preserve replaced built-in factories.
    throw inspected;
  };
  try {
    NodeHtmlMarkdown.translate(html, { preferNativeParser: false }, { [STRUCTURAL_HOOKS]: hook });
  } catch (error) {
    if (error !== inspected) return { html, scope: 'full', reason: 'selection-unavailable' };
  }
  // Selection is fail-soft. Actual conversion errors still surface when the
  // caller converts the original/selected HTML with the unmodified converter.
  return result ?? { html, scope: 'full', reason: 'hook-unavailable' };
}
