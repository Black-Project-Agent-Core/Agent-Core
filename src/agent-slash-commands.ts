/**
 * Pure parser for the Native chat composer "/" menu (v1: active catalog Skills only).
 * "/compact" is handled by the UI through its own endpoint and therefore never matches here.
 */
export interface SlashSkillSelection {
  /** Exact catalog name of the chosen active Skill. */
  skill: string;
  /** Text the user typed after the Skill name, trimmed; empty when there was none. */
  rest: string;
}

const SLASH_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export function parseSlashSelection(prompt: string, activeSkillNames: readonly string[]): SlashSkillSelection | null {
  if (typeof prompt !== 'string') return null;
  const text = prompt.trimStart();
  if (!text.startsWith('/')) return null;
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) return null;
  const name = match[1]!;
  if (!SLASH_NAME.test(name) || name.toLowerCase() === 'compact') return null;
  const wanted = name.toLowerCase();
  const skill = activeSkillNames.find(candidate => typeof candidate === 'string' && candidate.toLowerCase() === wanted);
  if (!skill) return null;
  return { skill, rest: (match[2] ?? '').trim() };
}
