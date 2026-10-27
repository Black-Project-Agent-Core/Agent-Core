import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

// After the launcher window opens, the restart worker asks GET /health and prints one 'Kesiapan:' line;
// the wrapper copies it into the receipt. It is a report: it must not change the exit code. The static
// tests run everywhere; the behavioural tests run the real functions in Windows PowerShell 5.1.

const run = promisify(execFile);
const WORKER = path.resolve('scripts/windows/Restart-Agent-Core.ps1');
const WRAPPER = path.resolve('scripts/windows/Invoke-Agent-Core-Restart.ps1');
const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
  await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
async function scratch() { const dir = await mkdtemp(path.join(os.tmpdir(), 'restart-readiness-')); roots.push(dir); return dir; }
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const utf16 = (text: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);

/** Runs `lines` in Windows PowerShell with the named functions lifted out of their script by AST. */
async function powershell(imports: Array<{ file: string; names: string[] }>, lines: string[]): Promise<any[]> {
  const dir = await scratch();
  const script = [
    `Set-StrictMode -Version Latest`, `$ErrorActionPreference = 'Stop'`,
    ...imports.flatMap(({ file, names }) => [
      `$ast = [System.Management.Automation.Language.Parser]::ParseFile(${q(file)}, [ref]$null, [ref]$null)`,
      `foreach ($name in @(${names.map(q).join(',')})) {`,
      `  $fn = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)`,
      `  if (-not $fn) { throw "missing function $name" }`,
      `  Invoke-Expression $fn.Extent.Text`, `}`,
    ]),
    `function Emit($value) { Write-Output ('R:' + (ConvertTo-Json -Compress -Depth 4 $value)) }`,
    ...lines,
  ].join('\n');
  const file = path.join(dir, 'run.ps1');
  await writeFile(file, script);
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
    { windowsHide: true, encoding: 'utf8', timeout: 90_000 });
  return stdout.split(/\r?\n/).filter(line => line.startsWith('R:')).map(line => JSON.parse(line.slice(2)));
}
const WORKER_FUNCTIONS = ['Get-HealthReply', 'ConvertTo-UtcDateTime', 'Get-ReadinessVerdict', 'Wait-CoreReadiness'];

describe('worker and wrapper agree on the readiness line', () => {
  it('the worker reports after the window opens, inside its own try, and never touches the exit code', async () => {
    const worker = await readFile(WORKER, 'utf8');
    // From the call to the end of the main try block, whose own catch (at column 0) is what sets the exit code.
    const start = worker.indexOf('Wait-CoreReadiness -Url');
    const section = worker.slice(start, worker.indexOf('\ncatch {', start));
    expect(section.length).toBeGreaterThan(200);
    expect(section).toContain('Write-Host $readiness.Line');
    expect(section).toMatch(/catch \{ Write-Host "Kesiapan: tidak diketahui/);
    expect(section).not.toMatch(/\$exitCode\s*=/);
    expect(worker.indexOf('Satu jendela Agent Core terbuka')).toBeLessThan(worker.indexOf('Wait-CoreReadiness -Url'));
    // The verdict names exactly three states.
    const states = [...worker.matchAll(/& \$verdict '([^']+)'/g)].map(match => match[1]);
    expect(new Set(states)).toEqual(new Set(['belum menjawab', 'menjawab tidak sesuai', 'siap']));
  });

  it('the wrapper reads that prefix into the receipt and budgets for the poll', async () => {
    const wrapper = await readFile(WRAPPER, 'utf8');
    const worker = await readFile(WORKER, 'utf8');
    expect(wrapper).toContain("StartsWith('Kesiapan:'");
    expect(wrapper).toContain('readiness = $workerReadiness');
    // Worker poll (default timeout + one request + one sleep) must fit inside the wrapper's wait.
    const workerDefault = Number(/\$ReadinessTimeoutSeconds = (\d+)/.exec(worker)?.[1]);
    const wrapperBudget = Number(/\$readinessBudgetSeconds = (\d+)/.exec(wrapper)?.[1]);
    expect(workerDefault).toBeGreaterThan(0);
    expect(wrapperBudget).toBeGreaterThanOrEqual(workerDefault + 3 + 1);
    expect(wrapper).toContain('$StopTimeoutSeconds + $StartTimeoutSeconds + $readinessBudgetSeconds + 90');
  });
});

describe.runIf(process.platform === 'win32')('Get-ReadinessVerdict', () => {
  it('reads only status and the process just launched, and ignores the description blocks', async () => {
    const results = await powershell([{ file: WORKER, names: WORKER_FUNCTIONS }], [
      `$now = [DateTime]::UtcNow`,
      `$launched = $now.AddSeconds(-30)`,
      `$fresh = $now.AddSeconds(-5).ToString('o')`,
      `$old = $now.AddMinutes(-5).ToString('o')`,
      `function Reply($status, $body) { [pscustomobject]@{ Reached = $true; Status = $status; Body = $body; Error = '' } }`,
      `$cases = [ordered]@{`,
      `  refused  = [pscustomobject]@{ Reached = $false; Status = 0; Body = ''; Error = 'ConnectFailure' }`,
      `  http401  = Reply 401 ''`,
      `  html     = Reply 200 'not json at all'`,
      `  nostatus = Reply 200 '{"version":"1"}'`,
      `  degraded = Reply 200 '{"status":"degraded"}'`,
      `  oldbuild = Reply 200 '{"status":"ok","version":"0.15.0"}'`,
      `  fresh    = Reply 200 ('{"status":"ok","process":{"pid":77,"startedAt":"' + $fresh + '"},"build":{"stale":false}}')`,
      `  stale    = Reply 200 ('{"status":"ok","process":{"pid":77,"startedAt":"' + $fresh + '"},"build":{"stale":true}}')`,
      `  unknown  = Reply 200 ('{"status":"ok","process":{"pid":77,"startedAt":"' + $fresh + '"},"build":{"stale":null,"issue":"DIST_NOT_FOUND"}}')`,
      `  elder    = Reply 200 ('{"status":"ok","process":{"pid":9,"startedAt":"' + $old + '"},"build":{"stale":false}}')`,
      `  badtime  = Reply 200 '{"status":"ok","process":{"pid":9,"startedAt":"yesterday-ish"}}'`,
      `  described = Reply 200 ('{"status":"ok","memory":{"status":"unavailable"},"phone":{"status":"unavailable"},"process":{"pid":5,"startedAt":"' + $fresh + '"},"build":{"stale":false}}')`,
      `}`,
      `$out = [ordered]@{}`,
      `foreach ($key in $cases.Keys) { $v = Get-ReadinessVerdict -Reply $cases[$key] -LaunchedAtUtc $launched; $out[$key] = @{ State = $v.State; Detail = $v.Detail } }`,
      `Emit $out`,
    ]);
    const verdict = results[0];
    expect(verdict.refused).toMatchObject({ State: 'belum menjawab', Detail: 'ConnectFailure' });
    expect(verdict.http401).toMatchObject({ State: 'menjawab tidak sesuai', Detail: 'HTTP 401' });
    expect(verdict.html).toMatchObject({ State: 'menjawab tidak sesuai', Detail: 'isi jawaban tidak terbaca' });
    expect(verdict.nostatus.State).toBe('menjawab tidak sesuai');
    expect(verdict.degraded).toMatchObject({ State: 'menjawab tidak sesuai', Detail: 'status degraded' });
    expect(verdict.oldbuild).toMatchObject({ State: 'siap', Detail: 'identitas proses tidak tersedia (build lama)' });
    expect(verdict.fresh.State).toBe('siap');
    expect(verdict.fresh.Detail).toMatch(/^PID 77 mulai \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z; dist basi: tidak$/);
    expect(verdict.stale.Detail).toMatch(/dist basi: ya$/);
    expect(verdict.unknown.Detail).toMatch(/dist basi: tidak diketahui$/);
    expect(verdict.elder.State).toBe('menjawab tidak sesuai');
    expect(verdict.elder.Detail).toMatch(/lebih tua dari peluncuran \(PID 9 mulai /);
    expect(verdict.badtime).toMatchObject({ State: 'menjawab tidak sesuai', Detail: 'waktu mulai proses tidak terbaca' });
    // memory and phone say "unavailable"; a restart cannot be blamed for that, so the verdict is still siap.
    expect(verdict.described.State).toBe('siap');
  });
});

describe.runIf(process.platform === 'win32')('Wait-CoreReadiness against a real listener', () => {
  async function listen(handler: Parameters<typeof createServer>[1]) {
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('reports siap, a persistent error, silence, nothing listening, and recovery from a slow start', async () => {
    let flaky = 0;
    const base = await listen((request, response) => {
      const url = request.url ?? '';
      if (url === '/ok') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ status: 'ok', process: { pid: 4242, startedAt: new Date(Date.now() - 5_000).toISOString() }, build: { stale: false } }));
      } else if (url === '/err') { response.statusCode = 500; response.end('boom'); }
      else if (url === '/hang') { /* accept and never answer */ }
      else if (url === '/flaky') {
        flaky += 1;
        if (flaky <= 2) { response.statusCode = 503; response.end('starting'); return; }
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ status: 'ok' }));
      } else { response.statusCode = 404; response.end(); }
    });
    const closed = createServer();
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve));
    const closedPort = (closed.address() as AddressInfo).port;
    await new Promise(resolve => closed.close(resolve));

    const results = await powershell([{ file: WORKER, names: WORKER_FUNCTIONS }], [
      `$launched = [DateTime]::UtcNow.AddSeconds(-30)`,
      `function Probe($url) { $r = Wait-CoreReadiness -Url $url -TimeoutSeconds 3 -LaunchedAtUtc $launched -RequestTimeoutSeconds 1 -PollMilliseconds 200; @{ State = $r.State; Line = $r.Line } }`,
      `$out = [ordered]@{}`,
      `$out.ok = Probe ${q(base + '/ok')}`,
      `$out.err = Probe ${q(base + '/err')}`,
      `$out.hang = Probe ${q(base + '/hang')}`,
      `$out.closed = Probe ${q(`http://127.0.0.1:${closedPort}/health`)}`,
      `$out.flaky = Probe ${q(base + '/flaky')}`,
      `Emit $out`,
    ]);
    const out = results[0];
    expect(out.ok.State).toBe('siap');
    expect(out.ok.Line).toMatch(/^Kesiapan: siap \(PID 4242 mulai .*dist basi: tidak; \d+ dtk\)$/);
    expect(out.err.State).toBe('menjawab tidak sesuai');
    expect(out.err.Line).toContain('HTTP 500');
    expect(out.hang.State).toBe('belum menjawab');
    expect(out.hang.Line).toContain('Timeout');
    expect(out.closed.State).toBe('belum menjawab');
    // Windows keeps retrying a refused loopback connect for about two seconds, so a short request
    // timeout reports Timeout and a longer one ConnectFailure. Both mean nothing answered.
    expect(out.closed.Line).toMatch(/Timeout|ConnectFailure/);
    expect(out.flaky.State).toBe('siap');
    expect(flaky).toBe(3);
  }, 90_000);
});

describe.runIf(process.platform === 'win32')('Get-WorkerReadiness (receipt side)', () => {
  it('takes the last Kesiapan line from a UTF-16 log, and null when there is none or no log', async () => {
    const dir = await scratch();
    const withLine = path.join(dir, 'a.log');
    const without = path.join(dir, 'b.log');
    const empty = path.join(dir, 'c.log');
    await writeFile(withLine, utf16('Satu jendela Agent Core terbuka (PID 9).\nKesiapan: belum menjawab (Timeout; 61 dtk)\nKesiapan: siap (PID 1 mulai 2026-10-25T10:00:00Z; dist basi: tidak; 12 dtk)\nSelesai: ok\n'));
    await writeFile(without, utf16('GAGAL: sesuatu\nSelesai: gagal\n'));
    await writeFile(empty, utf16('Kesiapan:   \nSelesai: ok\n'));
    const [result] = await powershell([{ file: WRAPPER, names: ['Get-WorkerReadiness'] }], [
      `Emit ([ordered]@{`,
      `  last = Get-WorkerReadiness -LogPath ${q(withLine)}`,
      `  none = Get-WorkerReadiness -LogPath ${q(without)}`,
      `  blank = Get-WorkerReadiness -LogPath ${q(empty)}`,
      `  missing = Get-WorkerReadiness -LogPath ${q(path.join(dir, 'nope.log'))}`,
      `})`,
    ]);
    expect(result.last).toBe('siap (PID 1 mulai 2026-10-25T10:00:00Z; dist basi: tidak; 12 dtk)');
    expect(result.none).toBeNull();
    expect(result.blank).toBeNull();
    expect(result.missing).toBeNull();
  });
});
