import { evaluateEngineeringArtifact } from '../learning/outcome-safe-engineering.js';
import { readEvidenceSnapshot } from '../verification/evidence-snapshot.js';

export const WORKFLOW_VERIFIER_REVISION = 'agent-core-controlled-workflow/v2-declarative';
export interface WorkflowVerificationManifest {
  taskId: string;
  case: { path: string; digest: string };
  answerPath: string;
}
// Derived from host-owned Learning state. No MCP action may register an oracle.
const manifests = new Map<string, WorkflowVerificationManifest>();
export function registerWorkflowVerification(manifest: WorkflowVerificationManifest): void {
  if (!manifest.taskId || !manifest.case?.path || !/^sha256:[a-f0-9]{64}$/.test(manifest.case.digest)
    || !manifest.answerPath) throw new Error('WORKFLOW_VERIFICATION_MANIFEST_INVALID');
  manifests.set(manifest.taskId, structuredClone(manifest));
}
export interface WorkflowCase {
  domain: 'engineering' | 'research';
  tests?: Array<{ input: unknown; expected: unknown }>;
  facts?: Array<{ key: string; value: string; source: string; supersedes?: string[] }>;
}

/** Independent, deterministic checks against the harness's sealed case/corpus. No network. */
export function verifyWorkflowAnswer(test: WorkflowCase, answer: string) {
  try {
    if (test.domain === 'engineering') {
      if (!test.tests?.length || test.tests.length > 100) throw new Error('invalid-test-cases');
      const checks = test.tests.map(item => {
        const actual = JSON.stringify(evaluateEngineeringArtifact(answer,item.input));
        return actual === JSON.stringify(item.expected);
      });
      return { verdict: checks.every(Boolean) ? 'pass' as const : 'fail' as const, checks, unsupportedClaims: 0 };
    }
    if (test.domain !== 'research' || !test.facts?.length) throw new Error('invalid-corpus');
    const claims = JSON.parse(answer) as Array<{ key: string; value: string; source: string; contradictions: string[] }>;
    if (!Array.isArray(claims) || claims.length > 100) throw new Error('invalid-claims');
    const unsupportedClaims = claims.filter(claim => !test.facts!.some(fact => fact.key === claim.key
      && fact.value === claim.value && fact.source === claim.source)).length;
    const checks = test.facts.map(fact => claims.filter(claim => claim.key === fact.key).length === 1
      && claims.some(claim => claim.key === fact.key && claim.value === fact.value && claim.source === fact.source
        && JSON.stringify([...(claim.contradictions ?? [])].sort()) === JSON.stringify([...(fact.supersedes ?? [])].sort())));
    return { verdict: checks.every(Boolean) && unsupportedClaims === 0 ? 'pass' as const : 'fail' as const, checks, unsupportedClaims };
  } catch { return { verdict: 'fail' as const, checks: [false], unsupportedClaims: 1 }; }
}

export async function recheckWorkflowReport(ref: string, expectedTaskId?: string): Promise<'pass' | 'fail' | 'unavailable'> {
  const match = /^verification:(.+)#(sha256:[a-f0-9]{64})$/i.exec(ref);
  if (!match) return 'unavailable';
  try {
    const report = await readEvidenceSnapshot(match[1]!);
    if (report.digest !== match[2]!.toLowerCase()) return 'unavailable';
    const value = JSON.parse(report.text);
    if (value.verifierRevision !== WORKFLOW_VERIFIER_REVISION) return 'unavailable';
    if (expectedTaskId && value.taskId !== expectedTaskId) return 'unavailable';
    const registered = manifests.get(value.taskId);
    if (!registered || value.case?.path !== registered.case.path || value.case?.digest !== registered.case.digest
      || value.answer?.path !== registered.answerPath) return 'unavailable';
    const [test, answer] = await Promise.all([readEvidenceSnapshot(value.case.path), readEvidenceSnapshot(value.answer.path)]);
    if (test.digest !== value.case.digest || answer.digest !== value.answer.digest) return 'unavailable';
    return verifyWorkflowAnswer(JSON.parse(test.text), answer.text).verdict;
  } catch { return 'unavailable'; }
}
