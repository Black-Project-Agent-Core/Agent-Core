/** Native diagnostic truth boundary: invalid is never an alias for an empty report. */
export type DiagnosticPayload =
  | { valid: true; items: unknown[] }
  | { valid: false; reason: string };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function coordinate(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}
function position(value: unknown): boolean {
  return record(value) && coordinate(value.line, 0) && coordinate(value.character, 0);
}
export function validateDiagnosticItems(value: unknown): DiagnosticPayload {
  if (!Array.isArray(value)) return { valid: false, reason: 'DIAGNOSTICS_NOT_ARRAY' };
  for (const item of value) {
    if (!record(item) || typeof item.message !== 'string' || !record(item.range)
      || !position(item.range.start) || !position(item.range.end)) {
      return { valid: false, reason: 'DIAGNOSTIC_REQUIRED_SHAPE_INVALID' };
    }
  }
  // Preserve optional fields and range direction exactly as the provider supplied them.
  return { valid: true, items: [...value] };
}
export function decodeTsServerDiagnostics(raw: unknown): DiagnosticPayload {
  if (!record(raw) || !Array.isArray(raw.body)) return { valid: false, reason: 'TSSERVER_BODY_NOT_ARRAY' };
  const items: unknown[] = [];
  for (const item of raw.body) {
    if (!record(item) || typeof item.text !== 'string' || !record(item.start) || !record(item.end)
      || !coordinate(item.start.line, 1) || !coordinate(item.start.offset, 1)
      || !coordinate(item.end.line, 1) || !coordinate(item.end.offset, 1)) {
      return { valid: false, reason: 'TSSERVER_DIAGNOSTIC_REQUIRED_SHAPE_INVALID' };
    }
    items.push({ ...item,
      range: { start: { line: item.start.line - 1, character: item.start.offset - 1 },
        end: { line: item.end.line - 1, character: item.end.offset - 1 } },
      message: item.text,
      severity: item.category === 'error' ? 1 : item.category === 'warning' ? 2 : item.category === 'suggestion' ? 4 : 3,
      source: 'typescript',
    });
  }
  return { valid: true, items };
}
