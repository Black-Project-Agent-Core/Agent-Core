export interface JsonToolResultLike {
  content?: readonly unknown[] | null;
  structuredContent?: unknown;
  isError?: boolean;
}

export function parseCallToolResultJson(result: JsonToolResultLike): unknown {
  if (result.isError) return null;

  for (const item of result.content ?? []) {
    if (!item || typeof item !== 'object') continue;
    const block = item as { type?: unknown; text?: unknown };
    if (block.type !== 'text' || typeof block.text !== 'string') continue;
    try {
      return JSON.parse(block.text);
    } catch {
      // A later text block or structuredContent may still be usable.
    }
  }

  const structured = result.structuredContent;
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
    return structured;
  }
  return null;
}
