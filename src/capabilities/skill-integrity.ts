import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

/** Instruction admission verifies bytes and audit provenance, never program behavior. */
export function readAuditedSkill(capabilityDir: string, id: string, skillPath: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('Capability ID is not a safe provenance key');
  const root = realpathSync(path.join(capabilityDir, 'normalized', 'skills'));
  const file = realpathSync(skillPath);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Skill resolves outside its normalized source directory');
  const provenance = JSON.parse(readFileSync(path.join(capabilityDir, 'provenance', `${id}.json`), 'utf8'));
  const bytes = readFileSync(file);
  if (provenance.capabilityId !== id || provenance.metadataInspected !== true
    || provenance.riskScanCompleted !== true || provenance.analysisLevel !== 'instruction_metadata'
    || provenance.behaviorVerified !== false || provenance.license?.status !== 'verified'
    || provenance.risk !== 'low' || provenance.sourceContentSha256 !== createHash('sha256').update(bytes).digest('hex')) {
    throw new Error('Skill bytes or instruction audit provenance changed; inspect and normalize the source again');
  }
  return bytes.toString('utf8');
}
