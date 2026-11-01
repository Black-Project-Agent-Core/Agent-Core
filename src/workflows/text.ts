import { createHash } from 'node:crypto';

/** Stable Mermaid-safe node id: a plain identifier stays as is, anything else becomes a short hash. */
export const diagramId = (value: string) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value) ? value : `n-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;

/** Escapes text for HTML and SVG text nodes and attribute values. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
