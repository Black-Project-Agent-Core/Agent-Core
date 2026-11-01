/** MCP text content carrying pretty-printed JSON. */
export function jsonTextResult(value: unknown): any {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** MCP error content with the "Error: " prefix every tool uses. */
export function errorTextResult(message: string): any {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}
