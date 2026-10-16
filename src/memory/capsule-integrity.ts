import { isMandatoryWorkingItem, uniqueSourceRefs, workingItemRefs } from './capsule.js';
import { MemoryControllerError, stableDisclosureJson } from './disclosure.js';
import type { SourceRef, TaskCapsule, WorkingItem } from './experience-types.js';

/** Fail closed on internal compaction corruption; source text is never an instruction. */
export function assertCapsuleContentIntegrity(input: {
  workingState: WorkingItem[]; capsule: TaskCapsule; episodeRef: SourceRef;
}): void {
  const fail = (): never => { throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE'); };
  const same = (left: unknown, right: unknown) => stableDisclosureJson(left) === stableDisclosureJson(right);
  const { workingState, capsule, episodeRef } = input;
  const source = new Map(workingState.map(item => [item.id, item]));
  if (source.size !== workingState.length) fail();
  const represented = [...capsule.criticalItems, ...capsule.supportingItems];
  const ids = represented.map(item => item.id);
  if (new Set(ids).size !== ids.length || !same(capsule.criticalItems, workingState.filter(isMandatoryWorkingItem))) fail();
  for (const item of capsule.supportingItems) {
    if (isMandatoryWorkingItem(item) || !same(item, source.get(item.id))) fail();
  }
  const omitted = capsule.omittedSupportingItemIds;
  const expected = workingState.filter(item => !isMandatoryWorkingItem(item) && !ids.includes(item.id)).map(item => item.id);
  if (new Set(omitted).size !== omitted.length || !same([...omitted].sort(), expected.sort())) fail();
  const refs = uniqueSourceRefs([episodeRef, ...represented.flatMap(workingItemRefs)]);
  if (episodeRef.kind !== 'episode' || episodeRef.id !== capsule.episodeId || !same(capsule.sourceRefs, refs)) fail();
}
