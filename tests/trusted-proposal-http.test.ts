import { createServer } from 'node:http';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { memoryTaskFixture } from './memory/memory-task-test-utils.js';
import { acknowledgeControllerContract } from './controller-contract-fixture.js';
import { FileKeyStore } from '../src/auth/key-store.js';
import { SkillService } from '../src/skills/service.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';

it('carries live proposal authority through authenticated HTTP, the MCP factory and exact-revision lifecycle', async () => {
  const f = await memoryTaskFixture();
  const keys = new FileKeyStore(path.join(f.root, 'runtime/bridge-auth'));
  const key = await keys.create('fixture-controller');
  await keys.setSkillProposalApprover(key.metadata.id, 'agent-core', true);
  const skills = await SkillService.initialize(f.root, async file => file);
  f.learning.attachSkills(skills);
  const proposal = await f.learning.upsertSkillProposal({ workspace: 'agent-core', name: 'fixture-review', taskId: 'source-task',
    purpose: 'Review exact source.', triggers: ['review source'], nonTriggers: ['deploy'], steps: ['Read source', 'Check result'],
    allowedTools: [], expectedBenefit: 'Consistency, not measured.', limitations: ['No execution authority.'],
    implementation: 'Existing SkillService.', acceptance: ['Valid artifact.'], evidenceRefs: [] });
  const authorize = vi.fn((id: string, workspace: string) => keys.canApproveSkillProposal(id, workspace));
  const server = createServer(createHttpHandler({ keyStore: keys,
    security: new HttpSecurityPolicy({ publicBaseUrl: null, protectedResourceUrl: null, trustProxy: false, allowedOrigins: [] }),
    mcpHandler: createMcpHttpHandler({ memoryExperience: f.memory as any, memoryService: f.memory as any,
      learningService: f.learning, skillsService: skills, externalControllerLearning: f.external,
      proposalDecisionAuthorizer: authorize }) }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw Error('No listener');
    const raw = async (name: string, args: unknown) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: 'POST', headers: {
        authorization: `Bearer ${key.key}`, 'content-type': 'application/json', accept: 'application/json,text/event-stream',
        'x-agent-core-session-id': 'trusted-proposal-http-fixture',
      }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
      expect(response.ok).toBe(true);
      const text = await response.text(), event = text.split('\n').find(line => line.startsWith('data:'));
      const rpc = JSON.parse(event ? event.slice(5) : text);
      expect(rpc.error).toBeUndefined();
      return rpc.result;
    };
    const contractSession = await acknowledgeControllerContract(raw);
    const started = await raw('controller_learning', { action: 'episode', episodeOperation: 'start', taskKey: 'approve-fixture',
      workspace: 'agent-core', description: 'Approve exact isolated fixture.', contractSession });
    expect(started.isError).not.toBe(true);
    const input = { action: 'decide_proposal', workspace: 'agent-core', proposalId: proposal.id, proposalDigest: proposal.revisionDigest,
      decision: 'approve', decisionScope: 'build-and-activate', confirmation: 'APPROVE_SKILL_PROPOSAL', contractSession,
      principalId: 'forged-client-argument' };
    const result = await raw('skills', input);
    expect(result.isError).not.toBe(true);
    const approved = JSON.parse(result.content[0].text);
    expect(approved.artifactStatus).toBe('catalog-active');
    expect(approved.decisions[0].controllerId).toBe(key.metadata.id);
    expect(authorize).toHaveBeenCalledWith(key.metadata.id, 'agent-core');
    expect((await skills.inspect('fixture-review')).digest).toBe(approved.artifactDigest);
    await keys.setSkillProposalApprover(key.metadata.id, 'agent-core', false);
    const revoked = await raw('skills', input);
    expect(revoked.isError).toBe(true);
    expect(revoked.content[0].text).toContain('SKILL_PROPOSAL_CONTROLLER_NOT_AUTHORIZED');
    expect((await f.learning.skillProposals())[0].decisions).toHaveLength(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (path.dirname(f.root) !== path.resolve('runtime/tmp') || !path.basename(f.root).startsWith('memory-task-')) throw Error('Unsafe fixture cleanup');
    await rm(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 60_000);
