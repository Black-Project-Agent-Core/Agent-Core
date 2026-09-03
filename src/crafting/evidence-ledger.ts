import type { SourceEvidence, SourceGroundingReceipt } from './source-grounding.js';

export class EvidenceLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceLedgerError';
  }
}

export class EvidenceLedger {
  private readonly evidence = new Map<string, SourceEvidence>();

  constructor(readonly receipt: SourceGroundingReceipt) {
    for (const item of receipt.evidence) {
      if (this.evidence.has(item.evidenceId)) {
        throw new EvidenceLedgerError(`Duplicate source evidence: ${item.evidenceId}`);
      }
      this.evidence.set(item.evidenceId, structuredClone(item));
    }
  }

  has(evidenceId: string): boolean {
    return this.evidence.has(evidenceId);
  }

  require(evidenceRefs: string[], label: string): SourceEvidence[] {
    if (evidenceRefs.length === 0) throw new EvidenceLedgerError(`${label} requires evidence`);
    return evidenceRefs.map((evidenceId) => {
      const item = this.evidence.get(evidenceId);
      if (!item) throw new EvidenceLedgerError(`${label} cites unknown evidence: ${evidenceId}`);
      return structuredClone(item);
    });
  }
  ids(): string[] {
    return [...this.evidence.keys()].sort();
  }
}
