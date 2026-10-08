export type NumericProvenanceKind = 'verified-input' | 'operator-supplied' | 'analysis-derived';
export type NumericTransform = 'exact' | 'rounded-1' | 'rounded-2' | 'rounded-3' | 'rounded-4' | 'percent';

export interface NumericSource {
  source: string;
  kind: NumericProvenanceKind;
  transform: NumericTransform;
  originalValue: number;
}
export interface NumericRegistryEntry {
  value: number;
  sources: NumericSource[];
  omittedSources: number;
}

const MAX_ENTRIES = 4096;
const MAX_SOURCES_PER_VALUE = 32;

function assertFinite(value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('NUMERIC_PROVENANCE_NONFINITE');
}
function key(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}
function sourceKey(source: NumericSource): string {
  return [source.source, source.kind, source.transform, source.originalValue].join('\0');
}

export class VerifiedValueRegistry {
  private readonly entries = new Map<string, NumericRegistryEntry>();

  add(value: number, source: string, kind: NumericProvenanceKind, variants = true): void {
    assertFinite(value);
    if (!source || source.length > 1000) throw new Error('NUMERIC_PROVENANCE_SOURCE_INVALID');
    this.addOne(value, { source, kind, transform: 'exact', originalValue: value });
    if (!variants) return;
    for (const places of [1, 2, 3, 4] as const) {
      const rounded = Number(value.toFixed(places));
      if (rounded !== value) this.addOne(rounded, {
        source, kind, transform: ('rounded-' + places) as NumericTransform, originalValue: value,
      });
    }
    if (Math.abs(value) <= 1 && value !== 0) {
      this.addOne(value * 100, { source, kind, transform: 'percent', originalValue: value });
    }
  }

  private addOne(value: number, source: NumericSource): void {
    assertFinite(value);
    const k = key(value);
    let entry = this.entries.get(k);
    if (!entry) {
      if (this.entries.size >= MAX_ENTRIES) throw new Error('NUMERIC_PROVENANCE_ENTRY_LIMIT');
      entry = { value, sources: [], omittedSources: 0 };
      this.entries.set(k, entry);
    }
    const seen = new Set(entry.sources.map(sourceKey));
    if (!seen.has(sourceKey(source))) {
      if (entry.sources.length >= MAX_SOURCES_PER_VALUE) entry.omittedSources += 1;
      else entry.sources.push(source);
    }
  }

  lookup(value: number, options: { absoluteTolerance?: number; relativeTolerance?: number } = {}): NumericRegistryEntry[] {
    assertFinite(value);
    const absoluteTolerance = options.absoluteTolerance ?? 0;
    const relativeTolerance = options.relativeTolerance ?? 0;
    if (!Number.isFinite(absoluteTolerance) || absoluteTolerance < 0 || absoluteTolerance > 1) throw new Error('NUMERIC_PROVENANCE_ABS_TOLERANCE_INVALID');
    if (!Number.isFinite(relativeTolerance) || relativeTolerance < 0 || relativeTolerance > 0.05) throw new Error('NUMERIC_PROVENANCE_REL_TOLERANCE_INVALID');
    const matches: NumericRegistryEntry[] = [];
    for (const entry of this.entries.values()) {
      const delta = Math.abs(value - entry.value);
      const allowed = Math.max(absoluteTolerance, relativeTolerance * Math.max(1, Math.abs(entry.value)));
      if (delta <= allowed) matches.push({ value: entry.value, sources: entry.sources.map(item => ({ ...item })), omittedSources: entry.omittedSources });
    }
    return matches.sort((a, b) => a.value - b.value);
  }

  toJSON(): { schemaVersion: 1; entries: NumericRegistryEntry[] } {
    return {
      schemaVersion: 1,
      entries: [...this.entries.values()]
        .sort((a, b) => a.value - b.value)
        .map(entry => ({ value: entry.value, sources: entry.sources.map(item => ({ ...item })), omittedSources: entry.omittedSources })),
    };
  }
}

export function collectNumericLeaves(
  value: unknown,
  registry: VerifiedValueRegistry,
  sourcePrefix: string,
  kind: NumericProvenanceKind,
  pathParts: string[] = [],
): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NUMERIC_PROVENANCE_NONFINITE');
    registry.add(value, sourcePrefix + ':' + (pathParts.join('.') || '$'), kind);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNumericLeaves(item, registry, sourcePrefix, kind, [...pathParts, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [name, item] of Object.entries(value as Record<string, unknown>)) {
    collectNumericLeaves(item, registry, sourcePrefix, kind, [...pathParts, name]);
  }
}
