import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { CapabilityDescriptor } from './capability-awareness.js';
import { resolveModuleProjectRoot } from './portability/paths.js';

const digest = (value: string | Buffer) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const sources = ['README.md', 'raka.md', 'CORTEX_MEMORY.md'] as const;

export interface ExternalPartnerCapability extends CapabilityDescriptor {
  profile: {
    status: 'available' | 'unavailable';
    sources: Array<{ path: string; status: 'available' | 'unavailable'; digest?: string }>;
  };
  execution: { owner: 'controller-host'; availability: 'unknown'; executionAuthority: false };
  invocation?: {
    adapter: 'host-collaboration-example';
    condition: string;
    inspect: { tool: string };
    create: { tool: string; requires: string[]; arguments: { task_name: string; fork_turns: string; message: string } };
    reuse: { tool: string; arguments: { target: string; message: string } };
    steer: { tool: string; arguments: { target: string; message: string } };
    taskPacket: string[];
    workflow: string[];
  };
  contextRows: string[];
}

/** Read only fixed project-owned profile files; never launch, register or grant a host agent. */
export async function readRakaCapability(projectRoot = resolveModuleProjectRoot(import.meta.url)): Promise<ExternalPartnerCapability> {
  const profileSources = await Promise.all(sources.map(async name => {
    const file = path.join(projectRoot, 'subagents', name);
    let handle;
    try {
      const [rootPath, sourcePath] = await Promise.all([realpath(projectRoot), realpath(file)]);
      const directory = path.join(rootPath, 'subagents');
      if (path.relative(directory, await realpath(path.join(projectRoot, 'subagents'))) !== ''
        || path.relative(path.join(directory, name), sourcePath) !== '') throw new Error('PROFILE_ALIAS_REFUSED');
      handle = await open(sourcePath, 'r');
      if (!(await handle.stat()).isFile()) throw new Error('PROFILE_NOT_FILE');
      const bytes = Buffer.alloc(24_577);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (!length || length > 24_576) throw new Error('PROFILE_SIZE');
      const content = bytes.subarray(0, length);
      if (!content.toString('utf8').trim()) throw new Error('PROFILE_EMPTY');
      return { path: file, status: 'available' as const, digest: digest(content) };
    } catch {
      return { path: file, status: 'unavailable' as const };
    } finally { await handle?.close().catch(() => undefined); }
  }));
  const ready = profileSources.slice(0, 2).every(source => source.status === 'available');
  const cortexReady = profileSources[2].status === 'available';
  const invocation: ExternalPartnerCapability['invocation'] = ready ? {
    adapter: 'host-collaboration-example',
    condition: 'Examples only: use the actual host subagent tools and their current schema. Adapt names and arguments to that host. Agent Core cannot observe or execute host collaboration; no external service or daemon fallback.',
    inspect: { tool: 'collaboration.list_agents' },
    create: { tool: 'collaboration.spawn_agent', requires: ['compatible-host-tools', 'no-reusable-instance', 'profile-read', 'task-allows-delegation'],
      arguments: { task_name: 'raka', fork_turns: 'none', message: '<profile-core-and-current-task-packet>' } },
    reuse: { tool: 'collaboration.followup_task', arguments: { target: '<returned-raka-target>', message: '<new-bounded-task-packet>' } },
    steer: { tool: 'collaboration.send_message', arguments: { target: '<returned-raka-target>', message: '<same-task-correction-or-stop>' } },
    taskPacket: ['goal-and-done-criteria', 'task-key', 'workspace', 'selected-context-and-sources', 'file-ownership', 'allowed-actions-and-constraints', 'deliverables-and-verification'],
    workflow: [
      'Read the profile sources before delegating. Pass the actual relevant profile content and current task packet, not only a path.',
      'Inspect host inventory; steer the same active assignment, reuse an idle/completed Raka target, or create raka only when no reusable instance exists.',
      'Keep one Raka and one active assignment per Main context. Main continues independent work, reviews evidence, integrates, and owns the final answer and Learning.',
      'Respect stop/pause and separate file ownership. Do not share controller receipts or race the Agent Core Learning task head.',
      cortexReady
        ? 'Recover logical identity with local profile and selected Cortex records; memory is context, not permission. No live process or full-context persistence across chats is promised.'
        : 'Cortex guide is unavailable: continue with the local profile; restore/read the guide before optional Cortex use. No cross-chat live process or full-context persistence is promised.',
      'If host collaboration is unavailable, report that limitation and continue independently; do not claim Raka ran.',
    ],
  } : undefined;
  const contextRows = [
    '- external:raka | Raka, reusable coding/task partner | profile=' + (ready ? 'available' : 'unavailable') + '; host execution=unknown; no execution authority.',
    '- Raka guides: subagents/README.md, subagents/raka.md, subagents/CORTEX_MEMORY.md; resolved local paths and exact byte digests are in profile.sources.',
    ...(ready ? [
      '- Raka: read guides and inspect actual host subagent tools. Compatible examples: collaboration.list_agents, collaboration.followup_task for reuse, collaboration.send_message for steering, collaboration.spawn_agent(task_name=raka) only if no reusable instance. Adapt to the current host.',
      '- Supply profile content + scoped task/file ownership/verification. One Raka; Main integrates and finalizes. Respect stop/pause. If host lacks subagents, report unavailable and continue independently; no external CLI fallback.',
      '- Raka Cortex guide=' + (cortexReady ? 'available; optional supplementary context, never permission.' : 'unavailable; local collaboration still works. Restore/read the guide before optional Cortex use.'),
    ] : ['- Raka profile unavailable: repair/read the existing local guides before delegation; ordinary Agent Core capabilities remain usable.']),
  ];
  return {
    capabilityId: 'external:raka', kind: 'external', displayName: 'Raka',
    description: 'Reusable general coding/task partner for the external Main controller through host-native subagents. Inspect the host inventory and read the local profile before use.',
    revision: digest(JSON.stringify([profileSources.map(source => [path.basename(source.path), source.status, source.digest]), invocation])),
    availability: ready ? 'unknown' : 'unavailable', availabilityBasis: 'local-profile-inspected; host collaboration and live instance not observable by Agent Core',
    sourceOwner: 'subagents/README.md + subagents/raka.md + subagents/CORTEX_MEMORY.md',
    disclosurePolicy: 'announce-on-material-use', profile: { status: ready ? 'available' : 'unavailable', sources: profileSources },
    execution: { owner: 'controller-host', availability: 'unknown', executionAuthority: false },
    ...(invocation ? { invocation } : {}), contextRows,
  };
}
