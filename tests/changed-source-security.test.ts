import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanChangedSourceSecurity } from '../src/code-intelligence/changed-source-security.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function temp() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'changed-source-security-'));
  roots.push(root);
  return root;
}
async function put(root: string, file: string, text: string) {
  const target = path.join(root, ...file.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
}
const ids = (scan: Awaited<ReturnType<typeof scanChangedSourceSecurity>>) => scan.findings.map(finding => finding.id);

// [rule id, file, line that must match, line that must stay clean]
const RULE_CASES: Array<[string, string, string, string]> = [
  ['AC.SECURITY.CODE.EVAL', 'a.ts', 'const v = eval(input);', 'const v = redis.eval(script);'],
  ['AC.SECURITY.SHELL.EXEC', 'a.ts', 'exec(`rm ${name}`);', 'const m = /a(b)/.exec(text);'],
  ['AC.SECURITY.SHELL.EXEC', 'a.ts', 'child_process.exec(cmd);', 'const hit = pattern.exec(line);'],
  ['AC.SECURITY.SHELL.EXEC', 'a.ts', 'const out = await exec(cmd);', 'private exec(args: string[]): Promise<void> {'],
  ['AC.SECURITY.SHELL.EXEC', 'a.py', 'os.system(cmd)', 'subprocess.run(["ls"])'],
  ['AC.SECURITY.SHELL.SPAWN', 'a.ts', "spawn(bin, args, { shell: true });", "spawn(bin, args, { shell: false });"],
  ['AC.SECURITY.TLS.DISABLED', 'a.ts', "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';", "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';"],
  ['AC.SECURITY.TLS.DISABLED', 'a.ts', 'https.request({ rejectUnauthorized: false });', '// NODE_TLS_REJECT_UNAUTHORIZED is documented here'],
  ['AC.SECURITY.TLS.DISABLED', 'a.py', 'requests.get(url, verify=False)', 'requests.get(url, verify=True)'],
  ['AC.SECURITY.DESERIALIZE.PICKLE', 'a.py', 'obj = pickle.loads(blob)', 'obj = json.loads(blob)'],
  ['AC.SECURITY.DESERIALIZE.UNSAFE', 'a.py', 'cfg = yaml.load(text)', 'cfg = yaml.load(text, Loader=yaml.SafeLoader)'],
  ['AC.SECURITY.HTML.RAW', 'a.tsx', '<div dangerouslySetInnerHTML={{ __html: html }} />', '<div>{html}</div>'],
  ['AC.SECURITY.DOM.SINK', 'a.ts', 'el.innerHTML = userHtml;', "el.innerHTML = '';"],
  ['AC.SECURITY.FILE.PERMISSIVE', 'a.ts', "fs.chmodSync(file, 0o777); chmod(file, 0o777)", 'fs.chmodSync(file, 0o644);'],
  ['AC.SECURITY.SECRET.LITERAL', 'a.ts', "const apiKey = 'abcd1234efgh5678';", "const apiKey = process.env.API_KEY;"],
  ['AC.SECURITY.KEY.PRIVATE', 'a.txt', '-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN PUBLIC KEY-----'],
  ['AC.SECURITY.CI.EXPRESSION', '.github/workflows/ci.yml', '        run: echo "${{ github.event.pull_request.title }}"', '          TITLE: ${{ github.event.pull_request.title }}'],
  ['AC.SECURITY.CRYPTO.ECB', 'a.py', 'cipher = AES.new(key, AES.MODE_ECB)', 'cipher = AES.new(key, AES.MODE_GCM)'],
  ['AC.SECURITY.CRYPTO.WEAK_HASH', 'a.ts', "createHash('md5').update(x)", "createHash('sha256').update(x)"],
  ['AC.SECURITY.COMPARE.SIGNATURE', 'a.ts', 'if (signature === expected) ok();', 'if (signature === undefined) return;'],
  ['AC.SECURITY.COMPARE.SIGNATURE', 'a.ts', 'if (headerHmac !== computed) reject();', "if (signature === 'zip') readZip();"],
  ['AC.SECURITY.JWT.NONE', 'a.ts', "jwt.verify(token, key, { algorithms: ['none'] });", "jwt.verify(token, key, { algorithms: ['RS256'] });"],
  ['AC.SECURITY.CORS.WILDCARD', 'a.ts', "res.setHeader('Access-Control-Allow-Origin', '*');", "res.setHeader('Access-Control-Allow-Origin', origin);"],
];

describe('changed-source security scanner', () => {
  it.each(RULE_CASES)('%s flags its pattern in %s and ignores the benign look-alike', async (id, file, positive, negative) => {
    const root = await temp();
    await put(root, file, `${positive}\n`);
    expect(ids(await scanChangedSourceSecurity({ root, files: [file] }))).toContain(id);
    await put(root, file, `${negative}\n`);
    expect(ids(await scanChangedSourceSecurity({ root, files: [file] }))).not.toContain(id);
  });

  it('does not report a clean scan when files were skipped, and keeps their history instead of resolving it', async () => {
    const root = await temp();
    await put(root, 'a.ts', 'const v = eval(input);\n');
    const first = await scanChangedSourceSecurity({ root, files: ['a.ts', 'b.ts'] });
    expect(first.findings).toHaveLength(1);
    expect(first.status).toBe('partial'); // b.ts is missing
    expect(first.skipped).toEqual([{ file: 'b.ts', reason: 'missing' }]);

    await put(root, 'a.ts', `// ${'x'.repeat(1024 * 1024)}\n`);
    const skipped = await scanChangedSourceSecurity({ root, files: ['a.ts', 'b.ts'] });
    expect(skipped.skipped.map(item => item.reason)).toEqual(['size-limit', 'missing']);
    expect(skipped.resolved).toEqual([]); // not re-scanned, so nothing may be called resolved
    expect(skipped.status).toBe('nothing-scanned');

    await put(root, 'a.ts', 'const v = eval(input);\n');
    const back = await scanChangedSourceSecurity({ root, files: ['a.ts', 'b.ts'] });
    expect(back.findings[0]?.lifecycle).toBe('still-present');
  });

  it('keeps a finding stable across line shifts and reports it resolved only after the file is scanned clean', async () => {
    const root = await temp();
    await put(root, 'a.ts', 'const v = eval(input);\n');
    const first = await scanChangedSourceSecurity({ root, files: ['a.ts'] });
    expect(first.findings[0]?.lifecycle).toBe('new');
    expect(first.status).toBe('complete');

    await put(root, 'a.ts', 'import x from "y";\n\n\nconst v = eval(input);\n');
    const shifted = await scanChangedSourceSecurity({ root, files: ['a.ts'] });
    expect(shifted.findings[0]).toMatchObject({ line: 4, lifecycle: 'still-present', key: first.findings[0]?.key });
    expect(shifted.resolved).toEqual([]);

    await put(root, 'a.ts', 'const v = 1;\n');
    const fixed = await scanChangedSourceSecurity({ root, files: ['a.ts'] });
    expect(fixed.findings).toEqual([]);
    expect(fixed.resolved).toEqual([first.findings[0]!.key]);
  });

  it('reports dropped files before the 128 cap and still accepts names that merely start with two dots', async () => {
    const root = await temp();
    await put(root, '..cache/a.ts', 'const v = eval(input);\n');
    const files = ['..cache/a.ts', ...Array.from({ length: 129 }, (_, index) => `missing-${index}.ts`)];
    const scan = await scanChangedSourceSecurity({ root, files });
    expect(scan).toMatchObject({ filesRequested: 130, filesDropped: 2, truncated: true, status: 'partial', filesScanned: 1 });
    expect(ids(scan)).toEqual(['AC.SECURITY.CODE.EVAL']);
    await expect(scanChangedSourceSecurity({ root, files: ['../escape.ts'] })).rejects.toThrow('SECURITY_ADVISORY_PATH_ESCAPE');
  });

  it('rejects project rules that can backtrack exponentially, including a quantified alternation', async () => {
    const root = await temp();
    await put(root, 'a.ts', 'aaaa\n');
    for (const pattern of ['(a|aa)+$', '(a+)+b', '(.*)\\1']) {
      await expect(scanChangedSourceSecurity({ root, files: ['a.ts'], rules: [{ id: 'PRJ.TEST.BAD', pattern, message: 'x' }] }))
        .rejects.toThrow('SECURITY_ADVISORY_RULE_REDOS_REJECTED');
    }
    const ok = await scanChangedSourceSecurity({ root, files: ['a.ts'], rules: [{ id: 'PRJ.TEST.OK', pattern: 'a{4}', message: 'four a' }] });
    expect(ids(ok)).toEqual(['PRJ.TEST.OK']);
  });

  it('scans only the code cells of a notebook and reports the cell index', async () => {
    const root = await temp();
    await put(root, 'n.ipynb', JSON.stringify({ cells: [
      { cell_type: 'markdown', source: ['eval(not code)\n'] },
      { cell_type: 'code', source: ['x = 1\n', 'eval(y)\n'] },
    ] }));
    await put(root, 'broken.ipynb', '{not json');
    const scan = await scanChangedSourceSecurity({ root, files: ['n.ipynb', 'broken.ipynb'] });
    expect(scan.findings).toHaveLength(1);
    expect(scan.findings[0]).toMatchObject({ id: 'AC.SECURITY.CODE.EVAL', cell: 1, line: 2 });
    expect(scan.skipped).toEqual([{ file: 'broken.ipynb', reason: 'notebook-unparseable' }]);
  });

  it('marks which findings sit on lines introduced by the change', async () => {
    const root = await temp();
    const git = (...args: string[]) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], { windowsHide: true });
    git('init');
    git('config', 'user.email', 'scanner-test@example.invalid');
    git('config', 'user.name', 'Scanner Test');
    await put(root, 'a.ts', 'const old = eval(a);\n');
    git('add', '.');
    git('commit', '-m', 'baseline');
    await put(root, 'a.ts', 'const old = eval(a);\nconst fresh = eval(b);\n');
    await put(root, 'b.ts', 'const brandNew = eval(c);\n');
    const scan = await scanChangedSourceSecurity({ root, files: ['a.ts', 'b.ts'] });
    const byLine = (file: string, line: number) => scan.findings.find(finding => finding.file === file && finding.line === line);
    expect(byLine('a.ts', 1)?.introducedByChange).toBe(false);
    expect(byLine('a.ts', 2)?.introducedByChange).toBe(true);
    expect(byLine('b.ts', 1)?.introducedByChange).toBe(true);
  });
});
