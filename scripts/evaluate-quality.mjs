import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { evaluateRoutingQuality } from '../dist/evaluation/routing-quality.js';
import { evaluateMemoryQuality } from '../dist/evaluation/memory-quality.js';
import { buildQualityScorecard, qualityExitCode, stableQualityJson } from '../dist/evaluation/quality-gate.js';

function parseArgs(argv) {
  const allowed = new Set(['--gate']);
  for (const arg of argv) {
    if (!allowed.has(arg)) throw new Error(`QUALITY_ARGUMENT_INVALID:${arg}`);
  }
  return { gate: argv.includes('--gate') };
}

function sourceCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function loadJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [routingCorpus, routingCapabilities, memoryCorpus] = await Promise.all([
    loadJson('../tests/fixtures/quality/routing-corpus.json'),
    loadJson('../tests/fixtures/quality/routing-capabilities.json'),
    loadJson('../tests/fixtures/quality/memory-corpus.json'),
  ]);
  const [routing, memory] = await Promise.all([
    evaluateRoutingQuality(routingCorpus, routingCapabilities),
    evaluateMemoryQuality(memoryCorpus),
  ]);
  const scorecard = buildQualityScorecard(sourceCommit(), routing, memory);
  process.stdout.write(stableQualityJson(scorecard));
  process.exitCode = qualityExitCode(scorecard, options.gate);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`);
  process.exitCode = 2;
});
