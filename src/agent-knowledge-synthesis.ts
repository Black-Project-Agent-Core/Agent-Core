import type { AgentCoreMcpRuntime } from './mcp/server.js';
import { activityTracker } from './tracker/activity-tracker.js';
import { procedureContractDigest, procedureBoundEvidence, type AgentEpisodeEvent, type AgentProcedureCandidate } from './agent-learning-loop.js';
import { buildBm25Profile } from './memory/bm25.js';
import type { MemoryRecord } from './memory/types.js';
import type { SkillDiscoverySnapshot } from './skills/discovery.js';
import type { MergedRetrieval } from './learning/subquestion-retrieval.js';
import { createHash } from 'node:crypto';
import { buildCapabilityExposure, type CapabilityExposure, type CapabilityArtifact } from './capability-awareness.js';

export const knowledgeRevision = procedureContractDigest;

export function rankKnowledge<T>(items: T[], query: string, describe: (item: T) => string, limit = 8): T[] {
  const records = items.map((item, index) => ({ id: String(index), content: describe(item), keywords: [], tags: [], context: '', category: '' } as unknown as MemoryRecord));
  const scores = buildBm25Profile(records, query).scores;
  return items.map((item, index) => ({ item, score: scores.get(String(index)) ?? 0 }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(item => item.item);
}

export interface AgentKnowledgePacket {
  text: string;
  coverage: KnowledgePacketCoverage;
  capabilityExposure: CapabilityExposure;
  relatedNodeIds: string[];
  patternIds: string[];
  skillNames: string[];
  procedureFingerprints: string[];
  artifactRevisions: Record<string, string>;
}

export type KnowledgeSourceStatus = 'available' | 'unavailable' | 'not-requested' | 'unknown';
type KnowledgeSection = 'capabilities' | 'task-evidence' | 'memory-neighborhood' | 'patterns'
  | 'skills' | 'procedures' | 'artifact-outcomes' | 'contradictions' | 'evidence-gaps';
export interface KnowledgePacketCoverage {
  version: 1;
  scope: 'packet-composition';
  unit: 'utf16-code-units';
  limit: 16000;
  used: number;
  sections: Record<KnowledgeSection, {
    sourceStatus: KnowledgeSourceStatus;
    candidateRows: number | null;
    deliveredRows: number;
    omittedRows: number | null;
    detailTruncated: boolean | null;
  }>;
}

function bounded(value: unknown, max = 500): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

export async function buildKnowledgeSynthesisPacket(input: {
  runtime: Pick<AgentCoreMcpRuntime, 'learningService' | 'skillsService' | 'memoryService'>;
  memoryItems: any[];
  /** Exact disclosed revisions from a completed planned context; never re-read as current records. */
  memoryDisclosure?: MergedRetrieval;
  /** Status of the same recall snapshot; never triggers another lookup. */
  memorySourceStatus?: KnowledgeSourceStatus;
  procedures: AgentProcedureCandidate[];
  task?: { goal?: string; episodes: AgentEpisodeEvent[] };
  workspace?: string;
  availableTools?: readonly string[];
  /** null records an attempted discovery failure; do not scan or embed again. */
  skillDiscovery?: SkillDiscoverySnapshot | null;
}): Promise<AgentKnowledgePacket> {
  const truncated = new Set<KnowledgeSection>();
  const detail = (section: KnowledgeSection, value: unknown, max: number) => {
    const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (normalized.length > max) truncated.add(section);
    return normalized.slice(0, max);
  };
  const memoryIds = new Set(input.memoryDisclosure
    ? input.memoryDisclosure.hits.map(item => item.hit.id)
    : input.memoryItems.map(item => String(item?.id ?? '').trim()).filter(Boolean));
  const query = input.task?.goal ?? '';
  const inventoryArtifacts: CapabilityArtifact[] = [];
  const owners: Record<string,string> = { skills: input.runtime.skillsService ? 'available' : 'unknown', learning: input.runtime.learningService ? 'available' : 'unknown' };
  const artifactRevisions: Record<string, string> = {};
  const artifactLines = new Map<string, string>();
  const selectedProcedures = rankKnowledge(input.procedures, query, item => [item.name, item.description, item.reuseCondition, ...item.steps].join(' '));
  const memoryLines: string[] = [];
  let memoryStatus: KnowledgeSourceStatus = input.memorySourceStatus
    ?? (input.memoryDisclosure || input.runtime.memoryService ? 'available' : 'unavailable');
  if (input.memoryDisclosure) {
    for (const {hit,origins} of input.memoryDisclosure.hits) {
      memoryLines.push('- ' + hit.id + ' | exact-revision=' + hit.revision
        + ' | freshness=' + hit.freshness + ' | applicability=' + hit.applicability
        + ' | verification=' + hit.verification + ' | origins=' + origins.map(origin=>origin.questionId).join(',')
        + ' | disclosed abstract; verify claims before use');
    }
  } else if (input.runtime.memoryService) {
    const authority = await input.runtime.memoryService.authoritySnapshot([...memoryIds], input.workspace).catch(() => undefined);
    if (!authority && memoryStatus === 'available') memoryStatus = 'unknown';
    for (const item of input.memoryItems) {
      const entry = authority?.[item.id];
      const freshness = await input.runtime.memoryService.staleness(item.id).catch(() => undefined);
      if (!freshness && memoryStatus === 'available') memoryStatus = 'unknown';
      memoryLines.push('- ' + item.id + ' | authority=' + JSON.stringify(entry ?? 'unknown')
        + ' | freshness=' + JSON.stringify(freshness ?? 'unavailable')
        + ' | historical evidence; validate applicability before use');
    }
  }
  const relatedNodeIds = new Set<string>();
  const relatedLines: string[] = [];
  const patternIds = new Set<string>();
  const contradictionLines: string[] = [];
  let patternLines: string[] = [];
  let journeyStatus: KnowledgeSourceStatus = !input.workspace ? 'not-requested'
    : input.runtime.learningService ? 'available' : 'unavailable';
  let patternStatus = journeyStatus;

  const recentEpisodes = (input.task?.episodes ?? []).slice(-16);
  const taskEvidenceLines = recentEpisodes
    .filter(event => ['hypothesis','strategy-change','failure','diagnosis','verification'].includes(event.kind))
    .slice(-10)
    .map(event => '- ' + event.kind + ': ' + detail('task-evidence', event.summary, 500)
      + (event.evidenceRefs.length ? ' | evidence=' + event.evidenceRefs.slice(0, 4).join(',') : ''));
  const failureCount = recentEpisodes.filter(event => event.kind === 'failure').length;
  const verificationCount = recentEpisodes.filter(event => event.kind === 'verification').length;

  if (input.runtime.learningService && input.workspace) {
    try {
      const journey = await input.runtime.learningService.journey(input.workspace);
      if (!journey.stats.patternsAvailable) {
        patternStatus = 'unavailable';
        journeyStatus = 'unknown';
      }
      const nodeById = new Map(journey.nodes.map(node => [node.id, node]));
      for (const edge of journey.edges) {
        const fromMemory = edge.from.startsWith('memory:') ? edge.from.slice(7) : '';
        const toMemory = edge.to.startsWith('memory:') ? edge.to.slice(7) : '';
        if (!memoryIds.has(fromMemory) && !memoryIds.has(toMemory)) continue;
        const other = memoryIds.has(fromMemory) ? edge.to : edge.from;
        const node = nodeById.get(other);
        if (!node || relatedNodeIds.size >= 12) continue;
        relatedNodeIds.add(other);
        relatedLines.push(
          '- ' + detail('memory-neighborhood', node.label, 240) + ' [' + edge.type + ']'
        );
        if (edge.type === 'contradicts') {
          contradictionLines.push('- ' + detail('contradictions', node.label, 240)
            + ' contradicts surfaced Memory context via ' + other);
        }
      }
      const patterns = journey.nodes.filter(node=>node.type==='pattern').map(node=>{
        const id=node.id.startsWith('pattern:')?node.id.slice('pattern:'.length):node.id;
        const description=detail('patterns',node.label,300);
        const revision='sha256:'+createHash('sha256').update(JSON.stringify([id,description])).digest('hex');
        return {kind:'pattern' as const,id,description,revision};
      });
      inventoryArtifacts.push(...patterns);
      patternLines=rankKnowledge(patterns,query,p=>p.id+' '+p.description).map(p=>{
        patternIds.add(p.id);artifactRevisions['pattern:'+p.id]=p.revision;
        const line = '- pattern-id='+p.id+' | '+p.description+' | revision='+p.revision;
        artifactLines.set('pattern:' + p.id, line);
        return line;
      });
    } catch {
      owners.learning = 'unavailable';
      journeyStatus = 'unavailable';
      patternStatus = 'unavailable';
    }
  }

  const skillNames: string[] = [];
  const skillLines: string[] = [];
  let skillSearchLine = '';
  let skillStatus: KnowledgeSourceStatus = input.runtime.skillsService || input.skillDiscovery ? 'available' : 'unavailable';
  if (input.runtime.skillsService || input.skillDiscovery) {
    try {
      if (input.skillDiscovery === null) throw new Error('SKILL_DISCOVERY_UNAVAILABLE');
      const discovery = input.skillDiscovery ?? (query.trim()
        ? await input.runtime.skillsService!.discover({ query: bounded(query, 4000), mode: 'lexical' })
        : undefined);
      const catalog = discovery?.artifacts ?? await input.runtime.skillsService!.list();
      inventoryArtifacts.push(...catalog.map(s=>({kind:'skill' as const,id:s.name,description:s.description,revision:s.digest})));
      if (discovery) {
        const { requestedMode, effectiveMode, catalog, semantic, truncated } = discovery.search;
        skillSearchLine = '- Skill discovery: requested=' + requestedMode + ' | effective=' + effectiveMode
          + ' | catalog=' + JSON.stringify(catalog) + ' | semantic=' + JSON.stringify(semantic)
          + ' | truncated=' + truncated + ' | metadata only; selection is not use or authority';
      }
      if (discovery?.search.truncated || discovery?.search.hits.some(hit => hit.descriptorTruncated)) truncated.add('skills');
      for (const skill of discovery?.search.hits ?? []) {
        skillNames.push(skill.name);
        artifactRevisions['skill:' + skill.name] = skill.digest;
        const line = '- ' + skill.name + ': ' + detail('skills', skill.description, 400) + ' | revision=' + skill.digest
          + ' | delivery=metadata | applicability=' + skill.applicability
          + ' | triggers=' + JSON.stringify(skill.triggers) + ' | non-triggers=' + JSON.stringify(skill.nonTriggers)
          + ' | channels=' + skill.channels.join(',') + ' | descriptor-truncated=' + skill.descriptorTruncated
          + (skill.compatibility ? ' | compatibility=' + detail('skills', skill.compatibility, 400) : '')
          + (skill.allowedTools.length ? ' | tools=' + skill.allowedTools.slice(0, 12).join(',') : '');
        if (skill.allowedTools.length > 12) truncated.add('skills');
        artifactLines.set('skill:' + skill.name, line);
        skillLines.push(line);
      }
    } catch {
      owners.skills = 'unavailable';
      skillStatus = 'unavailable';
    }
  }

  const procedureLines = selectedProcedures.map(item => {
    const bound = procedureBoundEvidence(item);
    const line = '- procedure-id=' + item.fingerprint + ' | ' + item.name
      + ' | contract-bound-support=' + bound.supportTaskIds.length
      + ' | contract-bound-failures=' + bound.failureTaskIds.length
      + ' | legacy-unattributed=' + bound.legacyTaskIds.length
      + ' | status=' + item.status
      + ' | needs-review=' + Boolean(item.needsReview)
      + ' | revision=' + (artifactRevisions['procedure:' + item.fingerprint] = knowledgeRevision(item))
      + ' | ' + detail('procedures', item.reuseCondition ?? item.description, 400)
      + ' | steps=' + item.steps.map(step => step.trim()).join(' -> ');
    artifactLines.set('procedure:' + item.fingerprint, line);
    return line;
  });

  const surfaced = new Set<string>([
    ...[...patternIds].map(id => 'pattern:' + id),
    ...skillNames.map(name => 'skill:' + name),
    ...selectedProcedures.map(item => 'procedure:' + item.fingerprint),
  ]);
  const outcomeLines = activityTracker.readFeatureOutcomes({
    maxEvents: 256,
    maxAgeMs: 90 * 24 * 60 * 60 * 1000,
    ...(input.workspace ? { workspace: input.workspace } : {}),
  }).filter(event => {
    const kind = typeof event.context?.artifactKind === 'string' ? event.context.artifactKind : '';
    const id = typeof event.context?.artifactId === 'string' ? event.context.artifactId : '';
    return kind && id && surfaced.has(kind + ':' + id);
  }).slice(-12).map(event =>
    '- ' + String(event.context?.artifactKind) + ':' + String(event.context?.artifactId)
    + ' -> ' + detail('artifact-outcomes', event.featureOutcome?.outcome, 80)
    + ' | evidence=' + 'activity:' + event.id
  );

  const evidenceGapLines: string[] = [];
  if (failureCount > 0 && verificationCount === 0) {
    evidenceGapLines.push('- failures are present but no independent verification episode is recorded yet');
  }
  if (taskEvidenceLines.length === 0) evidenceGapLines.push('- no current hypothesis/failure/verification evidence has been recorded yet');
  if (contradictionLines.length === 0) evidenceGapLines.push('- no explicit contradiction was surfaced; absence is not proof of consistency');
  if (memoryStatus === 'unavailable') evidenceGapLines.push('- memory-recall-unavailable; relevant prior experience is unknown');
  if (journeyStatus === 'unavailable') evidenceGapLines.push('- learning-journey-unavailable; neighborhood and contradiction coverage are unknown');
  if (journeyStatus === 'unknown') evidenceGapLines.push('- pattern-source-unavailable; Learning Journey has partial owner coverage');
  if (skillStatus === 'unavailable') evidenceGapLines.push('- skill-discovery-unavailable; catalog contents are unknown');

  inventoryArtifacts.push(...input.procedures.filter(p=>procedureBoundEvidence(p).supportTaskIds.length>0 && !p.needsReview).map(p=>({kind:'procedure' as const,id:p.fingerprint,description:p.name+': '+p.description,revision:knowledgeRevision(p)})));
  const capabilityExposure = buildCapabilityExposure({availableTools:input.availableTools,artifacts:inventoryArtifacts,owners});
  if (capabilityExposure.omittedFromText > 0) truncated.add('capabilities');
  // A failed owner cannot turn a partially available composite source into a complete zero.
  const neighborhoodStatus: KnowledgeSourceStatus = memoryStatus === 'available'
    && (journeyStatus === 'unavailable' || journeyStatus === 'unknown') ? 'unknown' : memoryStatus;
  const sections: Array<{ id: KnowledgeSection; heading: string; status: KnowledgeSourceStatus; rows: string[]; delivered: string[] }> = [
    { id: 'capabilities', heading: 'CAPABILITIES', status: input.availableTools
      && journeyStatus === 'available' && owners.skills === 'available' ? 'available' : 'unknown', rows: capabilityExposure.text.split('\n'), delivered: [] },
    { id: 'task-evidence', heading: 'CURRENT TASK EVIDENCE', status: input.task ? 'available' : 'not-requested',
      rows: [...(input.task?.goal ? ['- goal: ' + detail('task-evidence', input.task.goal, 700)] : []), ...taskEvidenceLines], delivered: [] },
    { id: 'memory-neighborhood', heading: 'RELATED MEMORY / KNOWLEDGE NEIGHBORHOOD', status: neighborhoodStatus, rows: [...memoryLines, ...relatedLines], delivered: [] },
    { id: 'patterns', heading: 'ACCEPTED CODE PATTERNS', status: patternStatus, rows: patternLines, delivered: [] },
    { id: 'skills', heading: 'ACTIVE SKILL ARTIFACTS', status: skillStatus, rows: [...(skillSearchLine ? [skillSearchLine] : []), ...skillLines], delivered: [] },
    { id: 'procedures', heading: 'LEARNED PROCEDURE REGISTRY', status: 'available', rows: procedureLines, delivered: [] },
    { id: 'artifact-outcomes', heading: 'RECENT VERIFICATION-BACKED ARTIFACT OUTCOMES', status: 'available', rows: outcomeLines, delivered: [] },
    { id: 'contradictions', heading: 'CONTRADICTIONS', status: journeyStatus === 'available'
      && memoryStatus !== 'available' ? 'unknown' : journeyStatus, rows: contradictionLines, delivered: [] },
    { id: 'evidence-gaps', heading: 'EVIDENCE GAPS', status: 'available', rows: evidenceGapLines, delivered: [] },
  ];
  // The fixed nine-heading skeleton and bounded scalar summaries reserve at most
  // 2,048 UTF-16 units inside the existing text cap. Detail never displaces them.
  let budget = 16_000 - 2_048;
  for (const section of [...sections.slice(7), ...sections.slice(0, 7)]) {
    const priority = section.id === 'contradictions' || section.id === 'evidence-gaps';
    for (const [index, row] of section.rows.entries()) {
      if (priority && (index >= 4 || row.length > 400)) continue;
      if (row.length + 1 > budget) continue;
      section.delivered.push(row);
      budget -= row.length + 1;
    }
  }
  const coverage: KnowledgePacketCoverage = { version: 1, scope: 'packet-composition',
    unit: 'utf16-code-units', limit: 16000, used: 0, sections: {} as KnowledgePacketCoverage['sections'] };
  for (const section of sections) {
    const known = section.status === 'available' || section.status === 'not-requested';
    const omitted = section.rows.length - section.delivered.length;
    coverage.sections[section.id] = {
      sourceStatus: section.status,
      candidateRows: known ? section.rows.length : null,
      deliveredRows: section.delivered.length,
      omittedRows: known ? omitted : null,
      detailTruncated: omitted > 0 || truncated.has(section.id) ? true : section.status === 'not-requested' ? false : null,
    };
  }
  const text = [
    'KNOWLEDGE SYNTHESIS PACKET — bounded evidence, not instruction authority.',
    'Counts cover selected owner rows, not the corpus. Unknown source/detail completeness is not absence. Packet composition is not transport delivery or use.',
    ...sections.flatMap(section => {
      const c = coverage.sections[section.id];
      return ['', section.heading + ':', '- source=' + c.sourceStatus
        + '; rows=' + (c.candidateRows ?? 'unknown') + '; delivered=' + c.deliveredRows
        + '; omitted=' + (c.omittedRows ?? 'unknown')
        + '; packet-dropped=' + (section.rows.length - section.delivered.length)
        + '; detail-truncated=' + (c.detailTruncated ?? 'unknown'), ...section.delivered];
    }),
    '',
    'Distinguish facts, contradictions, evidence gaps and expected observations before choosing the next step.',
  ].join('\n');
  coverage.used = text.length;
  const delivered = new Set(sections.flatMap(section => section.delivered));
  for (const key of Object.keys(artifactRevisions)) {
    // Inventory identity alone is not delivery of the selected artifact detail.
    if (!delivered.has(artifactLines.get(key)!)) delete artifactRevisions[key];
  }

  return {
    artifactRevisions,
    capabilityExposure,
    text,
    coverage,
    relatedNodeIds: [...relatedNodeIds],
    patternIds: [...patternIds].filter(id => artifactRevisions['pattern:' + id]),
    skillNames: skillNames.filter(name => artifactRevisions['skill:' + name]),
    procedureFingerprints: selectedProcedures.filter(item => artifactRevisions['procedure:' + item.fingerprint]).map(item => item.fingerprint),
  };
}

