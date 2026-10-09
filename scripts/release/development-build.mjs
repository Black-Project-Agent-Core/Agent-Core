import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseProductVersion } from './release-lib.mjs';

export function developmentBuildSteps(root, launcherOut, dotnet) {
  const node = path.join(root, 'runtime/node/node.exe');
  const npm = path.join(root, 'runtime/node/node_modules/npm/bin/npm-cli.js');
  return [
    {command: node, args: [npm, 'run', 'build'], cwd: root},
    {command: node, args: [npm, 'run', 'build'], cwd: path.join(root, 'src/ui')},
    {command: dotnet, args: ['publish', path.join(root, 'src/launcher/AgentCore.Launcher.csproj'),
      '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true',
      '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-o', launcherOut], cwd: root},
  ];
}

function run({command, args, cwd}, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, env: {...process.env, ...env}, windowsHide: true, stdio: 'inherit'});
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

export async function buildDevelopmentRuntime(root, productVersion) {
  const {stableVersion} = parseProductVersion(productVersion);
  const temp = path.join(root, 'runtime/tmp');
  await fs.mkdir(temp, {recursive: true});
  const launcherOut = await fs.mkdtemp(path.join(temp, 'prerelease-launcher-'));
  const cleanup = () => fs.rm(launcherOut, {recursive: true, force: true});
  const localDotnet = path.join(root, 'runtime/dotnet-sdk/dotnet.exe');
  const dotnet = await fs.access(localDotnet).then(() => localDotnet, () => 'dotnet');
  try {
    for (const step of developmentBuildSteps(root, launcherOut, dotnet)) await run(step);
    const launcherPath = path.join(launcherOut, 'Agent Core.exe');
    await run({command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      '$v=(Get-Item -LiteralPath $env:AGENT_CORE_PRE_LAUNCHER).VersionInfo; if($v.ProductVersion -ne $env:AGENT_CORE_PRE_PRODUCT -or $v.FileVersion -ne $env:AGENT_CORE_PRE_FILE){throw "Fresh launcher version does not match source identity"}'], cwd: root},
    {AGENT_CORE_PRE_LAUNCHER: launcherPath, AGENT_CORE_PRE_PRODUCT: productVersion, AGENT_CORE_PRE_FILE: `${stableVersion}.0`});
    return {launcherPath, cleanup};
  } catch (error) {
    await cleanup();
    throw error;
  }
}
