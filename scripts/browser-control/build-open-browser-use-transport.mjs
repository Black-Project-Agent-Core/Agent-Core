import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'src', 'rdc', 'browser-control', 'open-browser-use-stdio.go');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceSha256 = hash(await readFile(source));
const builderSha256 = hash(await readFile(fileURLToPath(import.meta.url)));
const target = process.platform + '-' + process.arch;
const goos = { win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform];
const goarch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
if (!goos || !goarch) throw new Error('Open Browser Use transport: unsupported build target ' + target);
const runtime = path.join(root, 'runtime', 'browser-control', 'open-browser-use', target);
const binary = 'transport-' + sourceSha256.slice(0, 16) + (process.platform === 'win32' ? '.exe' : '');
const output = path.join(runtime, binary);
const manifestPath = path.join(runtime, 'build.json');
try {
  const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (previous.version === 1 && previous.target === target && previous.sourceSha256 === sourceSha256
    && previous.builderSha256 === builderSha256 && previous.binary === binary && previous.binarySha256 === hash(await readFile(output))) {
    console.log('Open Browser Use internal transport: current (' + target + ')');
    process.exit(0);
  }
} catch { /* First build or changed source; no active socket/host state is touched. */ }

await mkdir(runtime, { recursive: true });
const cache = path.join(root, 'runtime', 'cache', 'open-browser-use-go');
await mkdir(cache, { recursive: true });
const environment = { ...process.env, CGO_ENABLED: '0', GOWORK: 'off', GOTOOLCHAIN: 'local',
  GOPROXY: 'off', GOSUMDB: 'off', GOCACHE: cache, GOOS: goos, GOARCH: goarch, GOFLAGS: '', GOENV: 'off' };
const temporary = output + '.building-' + process.pid;
let goVersion;
try {
  goVersion = execFileSync('go', ['version'], { cwd: root, env: environment, encoding: 'utf8', windowsHide: true }).trim();
  execFileSync('go', ['build', '-trimpath', '-buildvcs=false', '-ldflags=-s -w', '-o', temporary, source],
    { cwd: root, env: environment, stdio: 'pipe', windowsHide: true, timeout: 180000 });
  const binarySha256 = hash(await readFile(temporary));
  await rename(temporary, output);
  const manifest = { version: 1, target, binary, sourceSha256, builderSha256, binarySha256, goVersion };
  const staging = manifestPath + '.building-' + process.pid;
  await writeFile(staging, JSON.stringify(manifest, null, 2) + '\n');
  await rename(staging, manifestPath);
  console.log(JSON.stringify({ internalBrowserTransport: 'built', ...manifest }));
} catch (error) {
  await rm(temporary, { force: true }).catch(() => {});
  console.error('Open Browser Use transport build failed; requires the existing Go toolchain. No toolchain is downloaded.');
  if (error.stderr) console.error(String(error.stderr).slice(0,4000));
  process.exitCode = 1;
}
