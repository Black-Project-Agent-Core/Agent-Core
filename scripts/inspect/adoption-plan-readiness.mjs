import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  let planPath;
  let referencePath;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') json = true;
    else if (arg === '--reference') {
      i += 1;
      if (i >= argv.length) throw new Error('REFERENCE_PATH_VALUE_REQUIRED');
      referencePath = argv[i];
    } else if (!planPath) planPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!planPath) throw new Error('PLAN_PATH_REQUIRED');
  return { planPath, referencePath, json };
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function check(id, ok, detail) {
  return { id, ok: Boolean(ok), detail };
}

function gitRead(referencePath) {
  const result = {
    requested: true,
    path: referencePath,
    status: 'incomplete',
    branch: null,
    head: null,
    origin: null,
    dirty: null,
    error: null,
  };
  try {
    const info = statSync(referencePath);
    if (!info.isDirectory()) throw new Error('REFERENCE_NOT_DIRECTORY');
    const run = args => execFileSync(
      'git',
      ['-c', `safe.directory=${referencePath}`, '-C', referencePath, ...args],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    result.head = run(['rev-parse', 'HEAD']);
    result.branch = run(['branch', '--show-current']);
    result.origin = run(['remote', 'get-url', 'origin']);
    result.dirty = run(['status', '--porcelain']).length > 0;
    result.status = 'complete';
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

function inspectPlan(planPath, referencePath) {
  const absolutePlan = path.resolve(planPath);
  const text = readFileSync(absolutePlan, 'utf8');
  const proposalIds = [...text.matchAll(/^##\s+([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+)\b/gm)]
    .map(match => match[1]);
  const checks = [
    check('proposal-status', /Status:\s*\*\*PROPOSAL\b/i.test(text), 'proposal status declared'),
    check('reference-source', /^Reference:\s*`[^`]+`/mi.test(text), 'reference path declared'),
    check('upstream', /^Upstream:\s*`https?:\/\//mi.test(text), 'upstream declared'),
    check('source-pin', /\b[0-9a-f]{40}\b/i.test(text), '40-hex source ref present'),
    check('license', /^License:\s*.+/mi.test(text), 'license note declared'),
    check('proposal-ids', proposalIds.length > 0, proposalIds.length ? proposalIds.join(', ') : 'none'),
    check('owner-boundary', /\bOwner:\s*|##\s+Integration boundary/i.test(text), 'Agent Core owner/boundary declared'),
    check('target-files', /`(?:src|scripts)[\\/]/i.test(text), 'target source/tooling paths declared'),
    check('acceptance', /acceptance/i.test(text), 'acceptance criteria declared'),
    check('activation-boundary', /activation[^\n]{0,120}(?:separate|explicit)|restart[^\n]{0,120}(?:separate|explicit)/i.test(text), 'activation/restart boundary declared'),
    check('release-impact', /release/i.test(text), 'release impact declared'),
    check('compat-impact', /compat/i.test(text), 'compatibility impact declared'),
    check('rejected-deferred', /rejected|deferred/i.test(text), 'rejected/deferred families declared'),
    check('reference-disposition', /##\s+Reference disposition/i.test(text), 'reference disposition declared'),
  ];
  const reference = referencePath ? gitRead(path.resolve(referencePath)) : {
    requested: false,
    status: 'not-requested',
  };
  const missing = checks.filter(item => !item.ok).map(item => item.id);
  if (reference.requested && reference.status !== 'complete') missing.push('reference-git-evidence');
  return {
    status: missing.length ? 'incomplete' : 'ready',
    plan: {
      path: absolutePlan,
      sha256: sha256(text),
      bytes: Buffer.byteLength(text),
      proposalIds,
    },
    reference,
    checks,
    missing,
    advisoryOnly: true,
    mutationsPerformed: false,
  };
}

function human(report) {
  const lines = [
    `status: ${report.status}`,
    `plan: ${report.plan.path}`,
    `sha256: ${report.plan.sha256}`,
    `proposalIds: ${report.plan.proposalIds.join(', ') || 'none'}`,
  ];
  if (report.reference.requested) {
    lines.push(
      `reference: ${report.reference.status}`,
      `head: ${report.reference.head ?? 'unavailable'}`,
      `dirty: ${report.reference.dirty ?? 'unknown'}`,
    );
  }
  if (report.missing.length) lines.push(`missing: ${report.missing.join(', ')}`);
  return lines.join('\n');
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = inspectPlan(args.planPath, args.referencePath);
  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (report.status !== 'ready') {
      process.stderr.write(`adoption-plan-readiness: incomplete: ${report.missing.join(', ')}\n`);
    }
  } else {
    process.stdout.write(human(report) + '\n');
  }
  process.exitCode = report.status === 'ready' ? 0 : 2;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({
      status: 'incomplete',
      error: message,
      advisoryOnly: true,
      mutationsPerformed: false,
    }, null, 2) + '\n');
  } else {
    process.stderr.write(`adoption-plan-readiness: ${message}\n`);
  }
  process.exitCode = 2;
}