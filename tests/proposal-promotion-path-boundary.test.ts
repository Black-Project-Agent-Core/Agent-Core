import { expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './skill-proposal-fixture.js';
import { resolveProposalPromotion } from '../src/learning/proposal-promotion.js';

it.each(['relative', 'absolute', 'filename'] as const)('does not retarget a %s file with a different extension', async reference => {
  const f = await fixture(), file = path.join(f.root, 'docs/proposals/native-continuity.md');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '# Native Continuity\nStatus: PROPOSED\n\nKeep the existing owners.\n');
  const target = reference === 'relative' ? 'docs/proposals/native-continuity.md'
    : reference === 'absolute' ? file : 'native-continuity.md';
  const result = await resolveProposalPromotion({ prompt: 'Promote proposal ' + target + '.bak', reader: f.learning.proposalDocuments() });
  expect(result?.status).toBe('not-found');
  expect(result?.binding).toBeUndefined();
});

it.each(['relative', 'absolute', 'filename'] as const)('accepts sentence punctuation after an exact %s file', async reference => {
  const f = await fixture(), file = path.join(f.root, 'docs/proposals/native-continuity.md');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '# Native Continuity\nStatus: PROPOSED\n\nKeep the existing owners.\n');
  const target = reference === 'relative' ? 'docs/proposals/native-continuity.md'
    : reference === 'absolute' ? file : 'native-continuity.md';
  const result = await resolveProposalPromotion({ prompt: 'Promote proposal ' + target + '.', reader: f.learning.proposalDocuments() });
  expect(result).toMatchObject({ status: 'selected', binding: { path: file } });
});

it('does not ignore an unknown explicit file next to an existing titled proposal', async () => {
  const f = await fixture(), file = path.join(f.root, 'docs/proposals/native-continuity.md');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '# Native Continuity\nStatus: PROPOSED\n\nKeep the existing owners.\n');
  const result = await resolveProposalPromotion({ prompt: 'Promote proposal Native Continuity dan docs/proposals/missing.md',
    reader: f.learning.proposalDocuments() });
  expect(result?.status).not.toBe('selected');
  expect(result?.binding).toBeUndefined();
});

it('uses a recorded history referent without treating supporting Markdown links as proposal targets', async () => {
  const f = await fixture(), file = path.join(f.root, 'docs/proposals/native-continuity.md');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '# Native Continuity\nStatus: PROPOSED\n\nKeep the existing owners.\n');
  const result = await resolveProposalPromotion({ prompt: 'Promote proposal yang tadi', reader: f.learning.proposalDocuments(),
    history: [{ role: 'assistant', content: `Proposal: [Native Continuity](${file}). Supporting source: docs/CODEBASE.md and docs/proposals/REVIEW-GUIDE.md.` }] });
  expect(result).toMatchObject({ status: 'selected', binding: { path: file } });
});
