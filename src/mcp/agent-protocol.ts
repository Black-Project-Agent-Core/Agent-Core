import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const AGENTS_PATH = fileURLToPath(new URL('../../AGENTS.md', import.meta.url));

export function loadAgentProtocol(): string {
  let content: string;
  try {
    content = readFileSync(AGENTS_PATH, 'utf8').trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Mandatory Agent Core contract could not be read: ${AGENTS_PATH}: ${reason}`);
  }

  if (!content) {
    throw new Error(`Mandatory Agent Core contract is empty: ${AGENTS_PATH}`);
  }

  return content;
}
