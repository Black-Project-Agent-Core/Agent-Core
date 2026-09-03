import { describe, expect, it } from 'vitest';
import {
  FeatureAnatomyError,
  buildFeatureAnatomy,
  type FeatureSparepart,
} from '../src/crafting/feature-anatomy.js';
import type { SourceEvidence, SourceGroundingReceipt } from '../src/crafting/source-grounding.js';

function evidence(id: string, role: SourceEvidence['role'], sourcePath: string, symbol?: string): SourceEvidence {
  return {
    evidenceId: id,
    referenceId: 'donor',
    referenceIdentityHash: '1'.repeat(64),
    sourcePath,
    ...(symbol ? { symbol } : {}),
    contentHash: '2'.repeat(64),
    role,
    observation: `${role} evidence`,
  };
}

const entry = evidence('e-entry', 'entry_point', 'src/feature.ts', 'feature');
const dependency = evidence('e-dep', 'dependency', 'src/helper.ts', 'helper');
const testEvidence = evidence('e-test', 'test', 'tests/feature.test.ts', 'feature test');
const receipt: SourceGroundingReceipt = {
  receiptId: 'grounding:fixture', referenceSetHash: 'a'.repeat(64), featureContractHash: 'b'.repeat(64),
  evidence: [entry, dependency, testEvidence], inspectedSourceFiles: ['src/feature.ts', 'src/helper.ts'],
  inspectedTests: ['tests/feature.test.ts'], completeness: 'sufficient', missingEvidence: [],
};
function sparepart(id: string, item: SourceEvidence, role: string): FeatureSparepart {
  return {
    sparepartId: id,
    referenceId: item.referenceId,
    sourcePath: item.sourcePath,
    ...(item.symbol ? { symbol: item.symbol } : {}),
    role,
    evidenceRefs: [item.evidenceId],
  };
}

describe('Real Steel connected feature anatomy', () => {
  it('rejects a one-file anatomy when grounding proves connected implementation pieces exist', () => {
    expect(() => buildFeatureAnatomy({
      receipt,
      spareparts: [sparepart('s-entry', entry, 'entry')],
      connections: [],
      coverage: [],
    })).toThrow(FeatureAnatomyError);
  });

  it('accepts bounded factual CALLS and TESTS connections when every edge cites grounding evidence', () => {
    const anatomy = buildFeatureAnatomy({
      receipt,
      spareparts: [
        sparepart('s-entry', entry, 'entry'),
        sparepart('s-dep', dependency, 'dependency'),
        sparepart('s-test', testEvidence, 'test'),
      ],
      connections: [
        { from: 's-entry', to: 's-dep', relation: 'CALLS', evidenceRefs: ['e-entry', 'e-dep'] },
        { from: 's-test', to: 's-entry', relation: 'TESTS', evidenceRefs: ['e-test', 'e-entry'] },
      ],
      coverage: [],
    });
    expect(anatomy.status).toBe('ready');
    expect(anatomy.connections.map((item) => item.relation)).toEqual(['CALLS', 'TESTS']);
  });

  it('distinguishes explicit not_required evidence from unknown evidence', () => {
    const notRequired = buildFeatureAnatomy({
      receipt,
      spareparts: [sparepart('s-entry', entry, 'entry'), sparepart('s-dep', dependency, 'dependency')],
      connections: [{ from: 's-entry', to: 's-dep', relation: 'IMPORTS', evidenceRefs: ['e-dep'] }],
      coverage: [{ evidenceId: 'e-test', status: 'not_required', reason: 'test behavior intentionally replaced by host acceptance' }],
    });
    expect(notRequired.status).toBe('ready');
    expect(notRequired.notRequiredEvidence).toEqual(['e-test']);

    const unknown = buildFeatureAnatomy({
      receipt,
      spareparts: [sparepart('s-entry', entry, 'entry'), sparepart('s-dep', dependency, 'dependency')],
      connections: [{ from: 's-entry', to: 's-dep', relation: 'IMPORTS', evidenceRefs: ['e-dep'] }],
      coverage: [{ evidenceId: 'e-test', status: 'unknown', reason: 'test dependency not resolved yet' }],
    });
    expect(unknown.status).toBe('blocked');
    expect(unknown.unknownEvidence).toEqual(['e-test']);
  });

  it('rejects spareparts or connections that cite evidence outside the grounding ledger', () => {
    expect(() => buildFeatureAnatomy({
      receipt,
      spareparts: [{ ...sparepart('s-entry', entry, 'entry'), evidenceRefs: ['lexical-only-hit'] }],
      connections: [], coverage: [],
    })).toThrow(FeatureAnatomyError);
  });
  it('normalizes sparepart/connection order into a deterministic anatomy identity', () => {
    const spareparts = [sparepart('s-entry', entry, 'entry'), sparepart('s-dep', dependency, 'dependency')];
    const connection = { from: 's-entry', to: 's-dep', relation: 'CONFIGURES' as const, evidenceRefs: ['e-entry', 'e-dep'] };
    const coverage = [{ evidenceId: 'e-test', status: 'not_required' as const, reason: 'not part of requested runtime' }];
    const left = buildFeatureAnatomy({ receipt, spareparts, connections: [connection], coverage });
    const right = buildFeatureAnatomy({ receipt, spareparts: [...spareparts].reverse(), connections: [connection], coverage });
    expect(right.anatomyId).toBe(left.anatomyId);
  });

  it('fails closed when anatomy exceeds configured bounds', () => {
    const many = Array.from({ length: 3 }, (_, index) => ({
      ...sparepart(`s-${index}`, entry, 'entry'),
      sparepartId: `s-${index}`,
    }));
    expect(() => buildFeatureAnatomy({
      receipt,
      spareparts: many,
      connections: [],
      coverage: [
        { evidenceId: 'e-dep', status: 'not_required', reason: 'bounded fixture' },
        { evidenceId: 'e-test', status: 'not_required', reason: 'bounded fixture' },
      ],
      limits: { maxSpareparts: 2, maxConnections: 4 },
    })).toThrow(FeatureAnatomyError);
  });
});
