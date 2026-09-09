import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GENERATED_NOTICE =
  'GENERATED FILE NOTICE: internal/web/assets/js/analytics_engine.js is generated from frontend/src/analytics_engine.ts; edit only the TypeScript source.';

describe('analytics_engine frontend contract', () => {
  const tsSource = readFileSync(
    join(import.meta.dir, '../src/analytics_engine.ts'),
    'utf8'
  );
  const generatedSource = readFileSync(
    join(import.meta.dir, '../../internal/web/assets/js/analytics_engine.js'),
    'utf8'
  );

  test('TypeScript source declares the generated-file notice and typed snapshot', () => {
    expect(tsSource).toContain(GENERATED_NOTICE);
    expect(tsSource).toContain('interface AnalyticsEngineSnapshot');
  });

  test('generated output preserves the notice and runtime behavior', () => {
    expect(generatedSource).toContain(GENERATED_NOTICE);
    expect(generatedSource).toContain('/api/system/analytics-engine');
    expect(generatedSource).toContain('async function loadAnalyticsEngineDiagnostics');
  });
});
