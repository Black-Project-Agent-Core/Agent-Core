import * as z from 'zod/v4';

const filename = z.string().min(1).max(5000);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const engineeringGapSchema = z.strictObject({ path: filename, reason: z.string().min(1).max(200) });
export const engineeringCoverageSchema = z.strictObject({
  complete: z.boolean(), truncated: z.boolean(), exclusions: z.array(filename).max(20_000),
  gaps: z.array(engineeringGapSchema).max(20_000), inventoryHash: digest,
});
export const engineeringEntrySchema = z.strictObject({ path: filename, hash: digest, bytes: z.number().int().nonnegative() });
export const engineeringFacilitiesSchema = z.strictObject({
  nodeVersion: z.string().min(1).max(100), platform: z.string().min(1).max(100), builtins: z.array(z.string().min(1).max(200)).max(300),
  dependencies: z.array(z.strictObject({ name: z.string().min(1).max(300), declaredVersion: z.string().min(1).max(1000),
    manifestPath: filename, manifestHash: digest, installedVersion: z.string().min(1).max(200).optional(),
    installedManifestPath: filename.optional(), installedManifestHash: digest.optional(),
  })).max(1000),
});
export const engineeringInventorySchema = z.strictObject({
  root: filename, entries: z.array(engineeringEntrySchema).max(10_000), coverage: engineeringCoverageSchema, facilities: engineeringFacilitiesSchema,
});
export const engineeringMatchSchema = z.strictObject({ path: filename, line: z.number().int().positive(), preview: z.string().max(1000), sourceHash: digest });
export const engineeringDiscoveryResultSchema = z.strictObject({
  inventory: engineeringInventorySchema, query: z.string().min(1).max(2000),
  matches: z.array(engineeringMatchSchema).max(10_000), coverage: engineeringCoverageSchema, facilities: engineeringFacilitiesSchema,
});
export const engineeringSymbolSchema = z.strictObject({
  id: digest, name: z.string().min(1).max(1000), path: filename,
  line: z.number().int().positive(), sourceHash: digest,
});
export const engineeringCallerSchema = z.strictObject({
  symbolId: digest, path: filename, line: z.number().int().positive(), sourceHash: digest,
  kind: z.enum(['call', 'reference']),
});
export const engineeringImpactResultSchema = z.strictObject({
  inventory: engineeringInventorySchema, targets: z.array(filename).max(300),
  symbols: z.array(engineeringSymbolSchema).max(10_000), callers: z.array(engineeringCallerSchema).max(20_000),
  coverage: engineeringCoverageSchema, analysisLevel: z.enum(['semantic_tsjs', 'lexical', 'mixed']),
  limitations: z.array(engineeringGapSchema).max(20_000),
});
export type EngineeringCoverage = z.infer<typeof engineeringCoverageSchema>;
export type EngineeringGap = z.infer<typeof engineeringGapSchema>;
export type EngineeringEntry = z.infer<typeof engineeringEntrySchema>;
export type EngineeringFacilities = z.infer<typeof engineeringFacilitiesSchema>;
export type EngineeringInventoryRecord = z.infer<typeof engineeringInventorySchema>;
/** Raw captured documents stay in-process; they are not part of persisted evidence. */
export interface EngineeringInventory extends EngineeringInventoryRecord {
  documents: Map<string, string>;
  /** Safe document exclusions seen by the collector, distinct from protected/private exclusions. */
  nonCodePaths?: ReadonlySet<string>;
}
export type EngineeringDiscoveryResult = z.infer<typeof engineeringDiscoveryResultSchema>;
export type EngineeringImpactResult = z.infer<typeof engineeringImpactResultSchema>;
export type EngineeringSymbol = z.infer<typeof engineeringSymbolSchema>;
export type EngineeringCaller = z.infer<typeof engineeringCallerSchema>;
export function engineeringInventoryRecord(inventory: EngineeringInventory): EngineeringInventoryRecord {
  return { root: inventory.root, entries: inventory.entries, coverage: inventory.coverage, facilities: inventory.facilities };
}
