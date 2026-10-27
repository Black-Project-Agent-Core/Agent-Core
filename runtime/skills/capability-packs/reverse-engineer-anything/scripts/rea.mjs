#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const [major, minor] = process.versions.node.split(".").map(Number);
const supported = (major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26;
if (!supported) {
  console.error("REA requires Node 22.19+, 24.11+, or 26+. Reuse a compatible Node runtime.");
  process.exitCode = 1;
} else {
  try {
    const explicit = process.env.AGENT_CORE_REA_SKILL_ROOT?.trim();
    const skillRoot=fileURLToPath(new URL('../',import.meta.url));
    let hostRoot;
    if(!explicit&&path.basename(path.dirname(skillRoot))==='catalog'){
      const linkFile=path.resolve(skillRoot,'../../tooling/reverse-engineer-anything.json');
      try {
        const link=JSON.parse(await readFile(linkFile,'utf8'));
        if(link.version!==1||link.name!=='reverse-engineer-anything'||link.runtimeVersion!=='6.5.0'||typeof link.skillRoot!=='string'||!path.isAbsolute(link.skillRoot))
          throw new Error('Agent Core REA host tooling link is invalid or differs from the pinned runtime.');
        hostRoot=link.skillRoot;
      }catch(error){if(error.code!=='ENOENT')throw error;}
    }
    const candidates = explicit ? [path.resolve(explicit)] : hostRoot ? [hostRoot] : [...new Set([
      skillRoot,
      ...(process.env.CODEX_HOME ? [path.join(process.env.CODEX_HOME,"skills","reverse-engineer-anything")] : []),
      path.join(os.homedir(),".codex","skills","reverse-engineer-anything"),
      path.join(os.homedir(),".agents","skills","reverse-engineer-anything"),
    ])];
    let root;
    for (const candidate of candidates) {
      const tooling=path.join(candidate,"tooling","rea");
      try {
        const installed=JSON.parse(await readFile(path.join(tooling,"node_modules","rea-agents","package.json"),"utf8"));
        const manifest=JSON.parse(await readFile(path.join(tooling,"package.json"),"utf8"));
        if(manifest.dependencies?.["rea-agents"]!=="6.5.0"||installed.version!=="6.5.0")
          throw new Error("Installed REA differs from the pinned skill dependency 6.5.0.");
        root=tooling;break;
      } catch(error) {
        if(error.code!=="ENOENT"||explicit||candidate===hostRoot)throw error;
      }
    }
    if(!root)throw new Error("Pinned REA runtime not found. Set AGENT_CORE_REA_SKILL_ROOT to its owning skill folder or restore that folder's tooling/rea lockfile.");
    const child = spawn(process.execPath, [path.join(root,"node_modules","rea-agents","scripts","rea.mjs"),
      ...process.argv.slice(2)], { stdio: "inherit", cwd: process.cwd(), windowsHide: true });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    const detach = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.once("error", (error) => {
      detach();
      console.error(`Could not start REA: ${error.message}`);
      process.exitCode = 1;
    });
    child.once("exit", (code, signal) => {
      detach();
      process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
    });
  } catch (error) {
    console.error(`REA runtime unavailable: ${error.message}`);
    console.error('Restore only the owning skill runtime with npm ci --prefix "<skill-folder>/tooling/rea" --ignore-scripts --no-audit --no-fund. No automatic download or provider setup was attempted.');
    process.exitCode = 1;
  }
}
