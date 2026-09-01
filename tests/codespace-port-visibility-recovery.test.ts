import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Codespaces forwarded-port self-healing', () => {
  it('reissues a successful visibility mutation when GitHub still reports the port as private', () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'agent-core-codespace-port-'));
    const fakeBin = path.join(temp, 'bin');
    execFileSync('mkdir', ['-p', fakeBin]);
    const stateFile = path.join(temp, 'state');
    const mutationFile = path.join(temp, 'mutations');
    writeFileSync(stateFile, 'private\n');
    writeFileSync(mutationFile, '0\n');

    const gh = path.join(fakeBin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env bash
set -euo pipefail
state_file=${JSON.stringify(stateFile)}
mutation_file=${JSON.stringify(mutationFile)}
if [[ "$1 $2" == "codespace ports" && "$3" == "-c" ]]; then
  visibility="$(tr -d '\\n' < "$state_file")"
  printf '[{"sourcePort":8765,"visibility":"%s","browseUrl":"https://example-8765.app.github.dev"}]\\n' "$visibility"
  exit 0
fi
if [[ "$1 $2 $3" == "codespace ports visibility" ]]; then
  count="$(tr -d '\\n' < "$mutation_file")"
  count=$((count + 1))
  printf '%s\\n' "$count" > "$mutation_file"
  if (( count >= 2 )); then printf 'public\\n' > "$state_file"; fi
  exit 0
fi
printf 'unexpected gh args: %s\\n' "$*" >&2
exit 99
`);
    chmodSync(gh, 0o755);

    const output = execFileSync('bash', ['-lc', `
      export PATH=${JSON.stringify(`${fakeBin}:${process.env.PATH ?? ''}`)}
      export CODESPACE_NAME=test-codespace
      export AGENT_CORE_CODESPACE_PORT=8765
      source scripts/codespace/common.sh
      ensure_codespace_port_public 4 0
      printf 'mutations=%s visibility=%s\\n' "$(cat ${JSON.stringify(mutationFile)})" "$(codespace_port_visibility)"
    `], { cwd: root, encoding: 'utf8' });

    expect(output).toContain('mutations=2');
    expect(output).toContain('visibility=public');
    expect(readFileSync(mutationFile, 'utf8').trim()).toBe('2');
  });
});
