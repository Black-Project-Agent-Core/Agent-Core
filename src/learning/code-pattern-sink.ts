import type { CallToolResult } from '@modelcontextprotocol/client';
import type { CodeIntelligenceService } from '../code-intelligence/service.js';
import { parseCallToolResultJson } from '../mcp/call-tool-result.js';
import type { LearningCandidate } from './types.js';
import type { LearningCaptureResult, LearningSink, LearningSinkHealth } from './sink.js';

function providerErrorText(result: CallToolResult, fallback: string): string {
  const message = (result.content ?? [])
    .filter((item): item is Extract<(typeof result.content)[number], { type: 'text' }> => item.type === 'text')
    .map((item) => String(item.text ?? '').trim())
    .filter(Boolean)
    .join(' | ')
    .replace(/\s*# elapsed_ms=.*$/m, '')
    .trim();
  return message ? `${fallback}: ${message.slice(0, 2_000)}` : fallback;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function patternTriggerText(pattern: any): string {
  return String(
    pattern?.trigger?.natural_language
    ?? pattern?.trigger?.naturalLanguage
    ?? '',
  ).trim();
}

function patternSteps(pattern: any): string[] {
  return Array.isArray(pattern?.steps)
    ? pattern.steps.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [];
}

function candidateSteps(candidate: LearningCandidate): string[] {
  return candidate.steps?.length ? candidate.steps : [candidate.content];
}

function candidateExemplars(candidate: LearningCandidate): string[] {
  const explicit = candidate.exemplars ?? [];
  const evidenceEntities = candidate.evidenceRefs
    .filter((value) => value.toLowerCase().startsWith('grafel:'))
    .map((value) => value.slice('grafel:'.length).trim())
    .filter(Boolean);
  return [...new Set([...explicit, ...evidenceEntities].map((value) => value.trim()).filter(Boolean))];
}

function candidateTrigger(candidate: LearningCandidate): {
  natural_language: string;
  keywords?: string[];
} {
  const naturalLanguage = candidate.reuseCondition?.trim()
    || candidate.title?.trim()
    || candidate.content.trim();
  const keywords = [...new Set((candidate.tags ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 32);
  return {
    natural_language: naturalLanguage,
    ...(keywords.length ? { keywords } : {}),
  };
}

export class CodePatternLearningSink implements LearningSink {
  readonly name = 'grafel-patterns';

  constructor(private readonly code?: CodeIntelligenceService) {}

  async isAvailable(): Promise<boolean> {
    if (!this.code?.enabled || !this.code.capabilities().patterns) return false;
    const health = await this.code.health(true);
    return health.status === 'available' && health.index === 'current';
  }

  async health(): Promise<LearningSinkHealth> {
    if (!this.code?.enabled) return { available: false, issue: 'Code Intelligence unavailable' };
    if (!this.code.capabilities().patterns) return { available: false, issue: 'Grafel patterns capability unavailable' };
    const health = await this.code.health(true);
    const available = health.status === 'available' && health.index === 'current';
    return { available, ...(available ? {} : { issue: health.issue ?? `Grafel index is ${health.index}` }) };
  }

  classifySupport(candidate: LearningCandidate): boolean {
    return candidate.kind === 'code-pattern';
  }

  async findDuplicates(candidate: LearningCandidate): Promise<Array<{ id?: string; reason: string }>> {
    if (!candidate.workspace || !await this.isAvailable()) return [];
    const trigger = candidateTrigger(candidate);
    const expectedSteps = candidateSteps(candidate).map(normalized);
    const result = await this.code!.callProviderTool('grafel_patterns', {
      kind: 'code',
      action: 'query',
      text: trigger.natural_language,
      limit: 10,
    }, { context: { workspace: candidate.workspace } });
    if (result.isError) throw new Error(providerErrorText(result, 'Grafel pattern query failed'));
    const payload = parseCallToolResultJson(result) as any;
    const patterns = Array.isArray(payload?.patterns) ? payload.patterns : [];
    const targetTrigger = normalized(trigger.natural_language);
    return patterns
      .filter((pattern: any) => {
        if (pattern?.reject_reason) return false;
        if (normalized(patternTriggerText(pattern)) !== targetTrigger) return false;
        const actualSteps = patternSteps(pattern).map(normalized);
        return actualSteps.length === expectedSteps.length
          && actualSteps.every((step, index) => step === expectedSteps[index]);
      })
      .map((pattern: any) => ({
        id: String(pattern?.id ?? pattern?.pattern_id ?? '') || undefined,
        reason: 'equivalent Grafel pattern already exists',
      }));
  }

  async capture(candidate: LearningCandidate): Promise<LearningCaptureResult> {
    if (!candidate.workspace) throw new Error('Code-pattern learning requires workspace');
    const steps = candidateSteps(candidate);
    const exemplars = candidateExemplars(candidate);
    if (!exemplars.length) {
      throw new Error('Code-pattern learning requires at least one verified Grafel entity exemplar; provenance evidenceRefs are not entity exemplars');
    }

    for (const exemplar of exemplars) {
      const inspected = await this.code!.callProviderTool('grafel_inspect', {
        entity_id: exemplar,
      }, { context: { workspace: candidate.workspace } });
      if (inspected.isError) {
        throw new Error(providerErrorText(inspected, `Grafel exemplar is not resolvable: ${exemplar}`));
      }
    }

    const result = await this.code!.callProviderTool('grafel_patterns', {
      kind: 'code',
      action: 'record',
      trigger: candidateTrigger(candidate),
      steps,
      exemplars,
      category: 'code',
    }, { context: { workspace: candidate.workspace } });
    if (result.isError) throw new Error(providerErrorText(result, 'Grafel pattern capture failed'));
    const payload = parseCallToolResultJson(result) as any;
    return { id: String(payload?.pattern_id ?? payload?.id ?? '') || undefined, raw: payload };
  }

  async samplePatterns(workspace?: string): Promise<any[]> {
    if (!workspace || !await this.isAvailable()) return [];
    const result = await this.code!.callProviderTool('grafel_patterns', {
      kind: 'code',
      action: 'query',
      text: '*',
      limit: 50,
      include_private: true,
    }, { context: { workspace } });
    if (result.isError) throw new Error(providerErrorText(result, 'Grafel pattern sampling failed'));
    const payload = parseCallToolResultJson(result) as any;
    const idTable = payload?._id_table && typeof payload._id_table === 'object'
      ? payload._id_table as Record<string, string>
      : {};
    return (Array.isArray(payload?.patterns) ? payload.patterns : [])
      .filter((pattern: any) => !pattern?.reject_reason && pattern?.is_candidate !== true)
      .map((pattern: any) => ({
        ...pattern,
        exemplars: Array.isArray(pattern?.exemplars)
          ? pattern.exemplars.map((value: unknown) => idTable[String(value)] ?? String(value))
          : [],
      }));
  }
}
