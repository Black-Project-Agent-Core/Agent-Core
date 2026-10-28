// Read-only audit of the text every session loads (AGENTS.md, server instructions, capability pack descriptors)
// and of the tool manifest. It measures and lists; it changes nothing and gates nothing.
// Usage: node scripts/verify/agents-md-audit.mjs   (build first for the manifest and instruction sections)
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bytes = text => Buffer.byteLength(text, 'utf8');
const exists = async target => access(target).then(() => true, () => false);
const top = (rows, count) => rows.sort((a, b) => b.bytes - a.bytes).slice(0, count);

const PATH_ROOTS = ['src', 'docs', 'scripts', 'runtime', 'tests', 'subagents', '.changeset', '.github'];

function sections(lines) {
  const found = [];
  let current = { heading: '(before first heading)', bytes: 0, line: 1 };
  lines.forEach((line, index) => {
    if (/^##\s/.test(line)) { found.push(current); current = { heading: line.replace(/^##\s+/, '').slice(0, 100), bytes: 0, line: index + 1 }; }
    current.bytes += bytes(line) + 1;
  });
  found.push(current);
  return found;
}

function duplicates(lines) {
  const seen = new Map();
  lines.forEach((line, index) => {
    const text = line.trim();
    if (text.length < 60) return;
    seen.set(text, [...(seen.get(text) ?? []), index + 1]);
  });
  return [...seen].filter(([, at]) => at.length > 1)
    .map(([text, at]) => ({ lines: at.slice(0, 6), bytes: bytes(text) * (at.length - 1), text: text.slice(0, 90) }));
}

async function missingPaths(text) {
  const candidates = new Set();
  for (const [, token] of text.matchAll(/`([^`\n]+)`/g)) {
    const cleaned = token.replace(/^<PROJECT_ROOT>[\\/]/, '').replace(/\\/g, '/').replace(/[.,;:]+$/, '');
    if (/[*<>{}$()\s]/.test(cleaned)) continue;
    const [first] = cleaned.split('/');
    if (cleaned.includes('/') && PATH_ROOTS.includes(first)) candidates.add(cleaned);
  }
  const missing = [];
  for (const candidate of candidates) if (!await exists(path.join(root, candidate))) missing.push(candidate);
  return missing.sort();
}

async function packCost() {
  const dir = path.join(root, 'runtime', 'skills', 'capability-packs');
  const packs = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const text = await readFile(path.join(dir, entry.name, 'SKILL.md'), 'utf8').catch(() => null);
    if (text === null) { packs.push({ name: entry.name, bytes: 0, descriptorBytes: 0, missing: true }); continue; }
    const description = /^description:\s*(.*)$/m.exec(text)?.[1] ?? '';
    packs.push({ name: entry.name, bytes: bytes(text), descriptorBytes: bytes(entry.name) + bytes(description) });
  }
  return {
    packs: packs.length,
    skillMdBytes: packs.reduce((sum, pack) => sum + pack.bytes, 0),
    descriptorBytes: packs.reduce((sum, pack) => sum + pack.descriptorBytes, 0),
    largest: top(packs.map(({ name, bytes: size }) => ({ name, bytes: size })), 8),
  };
}

// Same registration the contract test uses: schemas only, no owner, task binding or invocation.
async function manifestAndInstructions() {
  const serverFile = path.join(root, 'dist', 'mcp', 'server.js');
  if (!await exists(serverFile)) return { unavailable: 'dist/mcp/server.js is missing; run npm run build first' };
  const { createAgentCoreMcpServer } = await import(pathToFileURL(serverFile).href);
  const { registerControllerLearningTools } = await import(pathToFileURL(path.join(root, 'dist', 'mcp', 'controller-learning-tools.js')).href);
  const server = createAgentCoreMcpServer(undefined, {
    memoryService: {}, learningService: {}, semanticIde: {}, skillsService: {}, phoneController: { enabled: true },
    codeIntelligence: {}, webResearch: {}, artifactAuthorization: {}, memoryExperience: {},
  });
  registerControllerLearningTools(server, undefined, undefined);
  const registered = server._registeredTools ?? server.registeredTools;
  const entries = registered instanceof Map ? [...registered.entries()] : Object.entries(registered ?? {});
  const rows = entries.map(([name, tool]) => {
    const wire = { name, title: tool.title, description: tool.description,
      inputSchema: tool.inputSchema?.toJSONSchema ? tool.inputSchema.toJSONSchema() : {}, annotations: tool.annotations ?? {} };
    return { name, bytes: bytes(JSON.stringify(wire)) };
  });
  const total = bytes(JSON.stringify({ tools: rows }));
  const instructions = server.server?._instructions ?? '';
  return {
    manifest: {
      tools: rows.length,
      toolBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
      budgetBytes: 128 * 1024,
      largest: top(rows, 15),
      names: rows.map(row => row.name).sort(),
      note: `names-only envelope adds ${total} bytes; toolBytes is the sum of per-tool wire entries`,
    },
    instructions: {
      chars: instructions.length,
      bytes: bytes(instructions),
      firstControllerContractAt: instructions.indexOf('controller_contract'),
      lastControllerContractAt: instructions.lastIndexOf('controller_contract'),
    },
  };
}

const agentsPath = path.join(root, 'AGENTS.md');
const text = await readFile(agentsPath, 'utf8');
const lines = text.split(/\r?\n/);
const heads = sections(lines);
const live = await manifestAndInstructions().catch(error => ({ unavailable: String(error?.message ?? error).slice(0, 200) }));
const toolNames = new Set(live.manifest?.names ?? []);
const toolLike = new Set([...text.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\(/g)].map(match => match[1]));
if (live.manifest) delete live.manifest.names;

const report = {
  agentsMd: {
    bytes: bytes(text),
    lines: lines.length,
    largestSections: top(heads.map(({ heading, bytes: size, line }) => ({ heading, bytes: size, line })), 10),
    duplicateLines: duplicates(lines).sort((a, b) => b.bytes - a.bytes).slice(0, 10),
    // Paths that AGENTS.md names only to forbid them (for example the alternative Skill homes) are expected here.
    missingPaths: await missingPaths(text),
    toolLikeNamesNotInManifest: toolNames.size ? [...toolLike].filter(name => !toolNames.has(name)).sort() : 'manifest unavailable',
  },
  capabilityPacks: await packCost(),
  ...live,
  notChecked: [
    'instruction pairs that may contradict each other (needs reading, not a pattern)',
    'the character limit a given client applies to server instructions (not measured here)',
  ],
};
console.log(JSON.stringify(report, null, 2));
