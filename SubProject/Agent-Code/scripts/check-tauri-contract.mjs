import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const configUrl = new URL('../src-tauri/tauri.conf.json', import.meta.url);
const windowsConfigUrl = new URL('../src-tauri/tauri.windows.conf.json', import.meta.url);
const packageUrl = new URL('../package.json', import.meta.url);
const bootstrapUrl = new URL('./codespace-bootstrap.sh', import.meta.url);
const windowsBuildUrl = new URL('./build-windows-x64.sh', import.meta.url);
const makensisWrapperUrl = new URL('./toolchain/makensis', import.meta.url);
const buildRsUrl = new URL('../src-tauri/build.rs', import.meta.url);

const config = JSON.parse(await readFile(configUrl, 'utf8'));
const windowsConfig = JSON.parse(await readFile(windowsConfigUrl, 'utf8'));
const packageJson = JSON.parse(await readFile(packageUrl, 'utf8'));
const bootstrap = await readFile(bootstrapUrl, 'utf8');
const windowsBuild = await readFile(windowsBuildUrl, 'utf8');
const makensisWrapper = await readFile(makensisWrapperUrl, 'utf8');
const buildRs = await readFile(buildRsUrl, 'utf8');
const [window] = config.app.windows;

assert.equal(config.productName, 'Agent Code');
assert.equal(config.identifier, 'com.pitchlook.agentcode');
assert.equal(config.app.windows.length, 1);
assert.equal(window.width, 1280);
assert.equal(window.height, 800);
assert.equal(window.minWidth, 900);
assert.equal(window.minHeight, 620);
assert.equal(window.resizable, true);
assert.equal(window.decorations, true);
assert.equal(config.build.frontendDist, '../dist');

assert.deepEqual(windowsConfig.bundle.targets, ['nsis']);
assert.equal(packageJson.scripts['build:windows:x64'], 'bash scripts/build-windows-x64.sh');
assert.match(windowsBuild, /NSISDIR/);
assert.match(windowsBuild, /TOOLCHAIN_DIR/);
assert.match(windowsBuild, /\/toolchain/);
assert.match(windowsBuild, /PATH=/);
assert.match(windowsBuild, /cargo-xwin/);
assert.match(windowsBuild, /x86_64-pc-windows-msvc/);
assert.match(makensisWrapper, /NSISDIR/);
assert.match(makensisWrapper, /\/usr\/bin\/makensis/);
assert.match(buildRs, /WindowsAttributes::new/);
assert.match(buildRs, /app_manifest/);
assert.doesNotMatch(buildRs, /Microsoft\.Windows\.Common-Controls/);
for (const required of [
  'nsis',
  'lld',
  'llvm',
  'clang',
  'x86_64-pc-windows-msvc',
  'cargo-xwin',
]) {
  assert.match(bootstrap, new RegExp(required.replaceAll('-', '\\-')));
}
assert.match(bootstrap, /Dir::Etc::sourcelist/);
assert.match(bootstrap, /Dir::Etc::sourceparts=-/);
assert.match(bootstrap, /primary Ubuntu/i);
assert.match(bootstrap, /apt\.llvm\.org/);
assert.match(bootstrap, /LLVM_VERSION=20/);
assert.match(bootstrap, /clang-cl/);
assert.match(bootstrap, /llvm-rc/);
assert.match(bootstrap, /llvm-lib/);
assert.match(bootstrap, /lld-link/);
assert.match(bootstrap, /cargo install --locked --version 0\.23\.1 cargo-xwin/);
assert.match(bootstrap, /NSIS_VERSION=3\.08/);
assert.match(bootstrap, /nsis-3\/nsis-3\.zip/);
assert.match(bootstrap, /1bb9fc85ee5b220d3869325dbb9d191dfe6537070f641c30fbb275c97051fd0c/);
assert.match(bootstrap, /ln -sf/);

console.log('tauri-contract: PASS');
