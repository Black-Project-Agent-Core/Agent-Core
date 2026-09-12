import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeWorkflowProjectionRecord } from '../src/memory/file-native/workflow-projection.js';
import { engineeringSourceRecordId, hydrateEngineeringSourceBlobs, validateEngineeringSourceBlob } from '../src/memory/file-native/workflow-source-projection.js';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { sanitizeStructured } from '../src/memory/record-types.js';

const roots: string[] = [];
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const computed = 'const token = `${nodeLabel}_${stream.toUpperCase()}`;';
const blob = (content: string) => ({ kind: 'engineering-source-v1' as const, schemaVersion: 1 as const, version: 1 as const,
  principalId: 'source-principal', projectId: 'source-project', taskId: 'source-task', content, bytes: Buffer.byteLength(content), sourceHash: hash(content) });
const project = (record: ReturnType<typeof blob>) => makeWorkflowProjectionRecord('workflow-contracts',
  engineeringSourceRecordId(record, record.sourceHash), record, { principalId: record.principalId, projectId: record.projectId });

afterEach(async () => {
  const temporaryRoot = path.resolve(os.tmpdir());
  for (const root of roots.splice(0)) {
    const resolved = path.resolve(root), relative = path.relative(temporaryRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.dirname(resolved) !== temporaryRoot
      || !path.basename(resolved).startsWith('ac-source-credential-')) throw new Error('Unexpected source credential fixture cleanup path');
    await rm(resolved, { recursive: true, force: true });
  }
});

describe('credential-safe engineering source projection', () => {
  it('preserves a computed template label and its exact hash through projection and cache hydration', async () => {
    const source = `export function label(nodeLabel, stream) {\n  ${computed}\n  return token;\n}\n`;
    const record = blob(source), projected = project(record);
    expect(validateEngineeringSourceBlob(record)).toEqual(record);
    expect(projected.document).toEqual(record);
    expect(sanitizeStructured({ content: source })).not.toEqual({ content: source });
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-source-credential-')); roots.push(root);
    await hydrateEngineeringSourceBlobs(resolveFileNativeMemoryPaths(root), [projected.document]);
    const hydrated = await readFile(path.join(root, 'runtime/craft/sources/blobs', `${record.sourceHash}.txt`), 'utf8');
    expect(hydrated).toBe(source); expect(hash(hydrated)).toBe(record.sourceHash);
    await hydrateEngineeringSourceBlobs(resolveFileNativeMemoryPaths(root), [projected.document]);
    expect(await readFile(path.join(root, 'runtime/craft/sources/blobs', `${record.sourceHash}.txt`), 'utf8')).toBe(source);
  });

  it('tracks nested unrelated templates and object braces without exempting declaration-looking string content', () => {
    const nested = 'const unrelated = `outer ${format({label: `inner ${nodeLabel}`})}`;';
    const source = `${nested}\n${computed}`;
    expect(project(blob(source)).document.content).toBe(source);
    const nestedLiteral = 'const unrelated = `outer ${format({label: "const token = `${nodeLabel}`;"})}`;';
    expect(() => validateEngineeringSourceBlob(blob(`${nestedLiteral}\n${computed}`))).toThrow('WORKFLOW_PROJECTION_SECRET_DETECTED');
  });

  it.each([
    'const token = "literal-credential";',
    'const token = `literal-credential`;',
    'const token = `literal-credential_${nodeLabel}`;',
    'const token = `${"literal-credential"}`;',
    'const token = `${getToken("literal-credential")}`;',
    'const token = `${nodeLabel + stream}`;',
    'const token = `${nodeLabel}`',
    'const token = `${nodeLabel}',
    'const token = `${nodeLabel}\\u0061`;',
    'const api_key = `${nodeLabel}`;',
    'const password = `${nodeLabel}`;',
  ])('retains conservative rejection for literal or unproven source: %s', source => {
    expect(() => validateEngineeringSourceBlob(blob(source))).toThrow('WORKFLOW_PROJECTION_SECRET_DETECTED');
  });

  it.each([
    `// ${computed}`,
    `/* ${computed} */`,
    `/* ${computed}`,
    `const example = '${computed}';`,
    `const expression = /${computed}/;`,
    `${computed}\nconst ratio = numerator / denominator;`,
    `${computed}\nconst view = <div />;`,
    `#!/usr/bin/env node\n${computed}`,
  ])('does not exempt declarations inside noncode or ambiguous lexical contexts: %s', source => {
    expect(() => validateEngineeringSourceBlob(blob(source))).toThrow('WORKFLOW_PROJECTION_SECRET_DETECTED');
  });

  it.each([
    `${computed}\nconst other = 'sb_secret_embedded_fixture';`,
    `${computed}\nconst other = 'Bearer embeddedcredentialfixture';`,
    `${computed}\nconst password = 'embedded-credential';`,
    'const token = `${sb_secret_embedded_fixture}`;',
    'const token = `${source.sb_secret_embedded_fixture}`;',
  ])('does not mask independent high-signal or embedded secrets: %s', source => {
    expect(() => validateEngineeringSourceBlob(blob(source))).toThrow('WORKFLOW_PROJECTION_SECRET_DETECTED');
  });

  it.each(['principalId', 'projectId', 'taskId'] as const)('keeps metadata credential checks independent for %s', field => {
    const record = { ...blob(computed), [field]: 'token=metadata-secret' };
    expect(() => validateEngineeringSourceBlob(record)).toThrow('WORKFLOW_PROJECTION_SECRET_DETECTED');
    expect(() => project(record)).toThrow('WORKFLOW_PROJECTION_RECORD_INVALID');
  });

  it('retains byte/hash and restore validation without rewriting an invalid blob', async () => {
    const record = blob(computed);
    expect(() => validateEngineeringSourceBlob({ ...record, sourceHash: hash('different') })).toThrow('WORKFLOW_SOURCE_PROJECTION_HASH_INVALID');
    expect(() => validateEngineeringSourceBlob({ ...record, bytes: record.bytes + 1 })).toThrow('WORKFLOW_SOURCE_PROJECTION_HASH_INVALID');
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-source-credential-invalid-')); roots.push(root);
    await expect(hydrateEngineeringSourceBlobs(resolveFileNativeMemoryPaths(root), [{ ...record, content: 'different' }]))
      .rejects.toThrow('WORKFLOW_SOURCE_PROJECTION_HASH_INVALID');
  });
});
