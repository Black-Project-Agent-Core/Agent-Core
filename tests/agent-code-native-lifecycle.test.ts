import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const agentCodeRoot = path.join(repoRoot, 'SubProject', 'Agent-Code');
const controllerPath = path.join(agentCodeRoot, 'src-tauri', 'src', 'agent_core.rs');
const mainPath = path.join(agentCodeRoot, 'src-tauri', 'src', 'main.rs');
const statusTypePath = path.join(agentCodeRoot, 'src', 'app', 'agent-core-control.ts');
const controller = readFileSync(controllerPath, 'utf8');
const tauriMain = readFileSync(mainPath, 'utf8');

const LEGACY_PATTERNS = [
  /agent-core-launcher\.ps1/i,
  /agent-core-tray\.ps1/i,
  /launch-agent-core-hidden\.vbs/i,
  /Agent Core Tray Manager/i,
  /legacy/i,
  /passive/i,
  /AGENT_CORE_MEMORY_[A-Z_]*(PATH|BACKEND)/,
];

describe('Agent Code native Windows lifecycle contract', () => {
  // The shipped controller binary is machine-local and untracked, so a fresh checkout can only
  // assert the recipe that produces it.
  it('builds the native controller from a tracked Windows Tauri recipe', () => {
    const tauriConfig = JSON.parse(readFileSync(path.join(agentCodeRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    expect(tauriConfig.bundle.active).toBe(true);
    expect(tauriConfig.bundle.targets).toBe('all');
    const agentCodePackage = JSON.parse(readFileSync(path.join(agentCodeRoot, 'package.json'), 'utf8'));
    expect(agentCodePackage.scripts['build:windows:x64']).toBe('bash scripts/build-windows-x64.sh');
    const buildScript = readFileSync(path.join(agentCodeRoot, 'scripts', 'build-windows-x64.sh'), 'utf8');
    expect(buildScript).toContain('npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc');
    expect(buildScript).toContain('scripts/check-windows-artifact.sh');
    const artifactCheck = readFileSync(path.join(agentCodeRoot, 'scripts', 'check-windows-artifact.sh'), 'utf8');
    expect(artifactCheck).toContain('src-tauri/target/x86_64-pc-windows-msvc/release');
    expect(artifactCheck).toContain('IMAGE_FILE_MACHINE_AMD64');
  });

  it('exposes the whole Agent Core lifecycle through the native controller', () => {
    for (const surface of [
      'pub fn start_bundle',
      'pub fn restart_agent_core',
      'pub fn restart_tunnel',
      'pub fn restart_all',
      'pub fn reset_oauth',
      'pub fn toggle_autostart',
      'pub fn exit_agent_core',
      'pub fn request_running_on_app_launch',
      'pub fn spawn_watchdog',
      'pub fn status',
    ]) {
      expect(controller, `${surface} must stay part of the native lifecycle surface`).toContain(surface);
    }
    for (const command of [
      'agent_core_control_status',
      'agent_core_start',
      'agent_core_restart_mcp',
      'agent_core_restart_tunnel',
      'agent_core_restart_all',
      'agent_core_reset_oauth',
      'agent_core_toggle_autostart',
      'agent_core_exit',
    ]) {
      expect(tauriMain).toContain(command);
    }
    expect(tauriMain).toContain('request_running_on_app_launch');
    expect(tauriMain).toContain('spawn_watchdog');
  });

  it('serializes lifecycle mutations behind an owner lock and adopts only identity-matched children', () => {
    expect(controller).toContain('lifecycle.lock');
    expect(controller).toContain('fn with_lifecycle_lock');
    expect(controller).toContain('watchdog.lock');
    expect(controller).toMatch(/fn adopt_existing_if_safe[\s\S]*?probe\.identity_match && probe\.healthy/);
    expect(controller).toContain('Refused to stop {} because the recorded process identity no longer matches');
    expect(controller).toContain('Another Agent Code process is performing an Agent Core lifecycle action');
  });

  it('manages exactly one native autostart task pointing at the Agent Code executable', () => {
    expect(controller).toContain('const NATIVE_AUTOSTART_TASK: &str = "Agent Code Agent Core Controller";');
    expect(controller.match(/AUTOSTART_TASK: &str/g)).toHaveLength(1);
    expect(controller).toContain('--agent-core-background');
    expect(controller).toContain('New-ScheduledTaskTrigger -AtLogOn');
    expect(controller).toContain('LogonType Interactive');
    expect(controller).toContain('RunLevel Limited');
    expect(controller).toMatch(/fn preferred_agent_code_executable[\s\S]*?env::current_exe\(\)/);
    expect(tauriMain).toContain('--agent-core-background');
  });

  it('injects the file-native Agent Core runtime contract with no database path', () => {
    expect(controller).toContain('.env("AGENT_CORE_HOME"');
    expect(controller).toContain('.env("AGENT_CORE_DATA_DIR"');
    expect(controller).toContain('.env("AGENT_CORE_MEMORY_ENABLED", "true")');
    expect(controller).toContain('.env("AGENT_CORE_ALLOWED_ROOTS"');
    expect(controller).toContain('.env("AGENT_CORE_SHUTDOWN_REQUEST_PATH"');
    expect(controller).not.toMatch(/AGENT_CORE_MEMORY_[A-Z_]*(PATH|BACKEND)/);
    expect(controller.match(/\.env\("AGENT_CORE_MEMORY_[A-Z_]+"/g)).toEqual(['.env("AGENT_CORE_MEMORY_ENABLED"']);
  });

  it('blocks runtime preparation while a portable package operation is active', () => {
    expect(controller).toMatch(/fn prepare_runtime[\s\S]*?pack_lock_active\(&self\.root\)\?/);
    expect(controller).toContain('Runtime preparation is blocked until packaging finishes');
  });

  it('keeps no legacy controller branch in the native lifecycle or its status payload', () => {
    for (const pattern of LEGACY_PATTERNS) {
      expect(controller, `agent_core.rs must not mention ${pattern}`).not.toMatch(pattern);
    }
    const statusType = readFileSync(statusTypePath, 'utf8');
    expect(statusType).not.toMatch(/legacy|nativeControlEnabled/i);
    expect(controller).not.toContain('legacy_controller_detected_for_root');
  });

  it('leaves no PowerShell/BAT/VBS lifecycle entrypoint in the workspace', () => {
    const forbidden = /^(start-agent-core\.(bat|ps1|sh)|agent-core\.(bat|ps1)|agent-core-launcher\.ps1|agent-core-tray\.ps1|launch-agent-core-hidden\.vbs|install-agent-core-tray\.bat|uninstall-agent-core-tray\.bat|install-agent-core-autostart\.ps1|uninstall-agent-core-autostart\.ps1)$/i;
    for (const dir of [repoRoot, path.join(repoRoot, 'scripts', 'windows'), agentCodeRoot]) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        expect(entry.name, `${path.join(dir, entry.name)} is a legacy lifecycle entrypoint`).not.toMatch(forbidden);
      }
    }
    expect(readdirSync(agentCodeRoot).filter((entry) => entry.startsWith('backup-pre-'))).toEqual([]);
  });

  // Filesystem behavior is exercised by the Rust relocation test; this checks the UI contract.
  it('connects root rebinding to the native controller bootstrap', () => {
    const reconcile = controller.match(/fn reconcile_bootstrap_state[\s\S]*?\n    fn /)?.[0] ?? '';
    expect(reconcile, 'reconcile_bootstrap_state must exist').not.toBe('');
    expect(reconcile).toContain('install-state.json');
    expect(reconcile).toContain('!same_path_str(&state.root, &self.root)');

    const relocation = reconcile.slice(reconcile.indexOf('if relocated {'), reconcile.indexOf('let state = NativeBootstrapState'));
    expect(relocation).toContain('fs::remove_file(self.state_path())');
    expect(controller).toContain('fn relocated_root_preserves_durable_files_and_rebinds_native_state');

    expect(controller).toMatch(/fn write_locator_root[\s\S]*?join\("AgentCore"\)[\s\S]*?join\("root\.txt"\)/);
    expect(controller).toMatch(/fn prepare_runtime[\s\S]*?reconcile_bootstrap_state[\s\S]*?write_locator_root/);
  });

  it('pins Node downloads and resolves the tunnel only from its bundle or explicit override', () => {
    expect(controller).toContain('const MINIMUM_NODE_VERSION: (u32, u32, u32) = (24, 15, 0);');
    expect(controller).toContain('const PREFERRED_NODE_VERSION: &str = "24.16.0";');
    expect(controller).toContain('https://nodejs.org/dist/v{PREFERRED_NODE_VERSION}');
    expect(controller).toContain('resolve_tunnel_runtime(root, env::var_os("AGENT_CORE_TUNNEL_EXE").as_deref())');
    expect(controller).toContain('root.join("tunnel-client").join("tunnel-client.exe")');
    expect(controller).toContain('scripts/tunnel/build-admin-client.ps1');
    expect(controller).not.toContain('find_in_path("tunnel-client.exe")');
    expect(controller).not.toContain('install_portable_tunnel');
    expect(controller).not.toContain('tunnel-client/releases/download');
    const enginesNode = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).engines.node;
    expect(enginesNode).toBe('>=24.15.0');
  });

  it('keeps the tunnel profile portable across project moves', () => {
    const templatePath = path.join(repoRoot, 'tunnel-client', 'agent-core.example.yaml');
    expect(existsSync(templatePath)).toBe(true);
    const profiles = [readFileSync(templatePath, 'utf8')];
    const operatorProfilePath = path.join(repoRoot, 'tunnel-client', 'agent-core.yaml');
    if (existsSync(operatorProfilePath)) profiles.push(readFileSync(operatorProfilePath, 'utf8'));
    for (const profile of profiles) {
      expect(profile).toContain('file:secrets/control-plane-api-key-restored.txt');
      expect(profile).not.toMatch(/file:[A-Z]:[\\/]/i);
    }
  });
});
