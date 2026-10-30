// Reconstructed from surviving local dist; emitted runtime parity checked.
import os from 'node:os';
import path from 'node:path';
import { isSensitiveKey } from './redaction.js';
const agentCoreOwnedSecretKeys = new Set<string>();
export function recordAgentCoreOwnedSecretKey(key: string) {
    if (isSensitiveKey(key))
        agentCoreOwnedSecretKeys.add(key);
}
export function recordNewRootEnvSecrets(beforeKeys: Set<string>, after: NodeJS.ProcessEnv) {
    for (const key of Object.keys(after)) {
        if (!beforeKeys.has(key) && isSensitiveKey(key))
            agentCoreOwnedSecretKeys.add(key);
    }
}
export function getAgentCoreOwnedSecretKeys() {
    return [...agentCoreOwnedSecretKeys].sort();
}
export function buildOwnedChildEnv(overrides: NodeJS.ProcessEnv = {}, source: NodeJS.ProcessEnv = process.env) {
    const output: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined || isSensitiveKey(key))
            continue;
        output[key] = value;
    }
    for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined)
            output[key] = value;
    }
    return output;
}
/**
 * The profile folder of the account that runs Agent Core. The launcher points HOME and USERPROFILE at runtime/home
 * so Core's own caches stay in the project; the account's real profile does not move, and the OS still reports it.
 */
export function realUserHome(): string {
    try {
        return os.userInfo().homedir || os.homedir();
    }
    catch {
        return os.homedir();
    }
}
function setEnvKey(env: NodeJS.ProcessEnv, name: string, value: string) {
    for (const key of Object.keys(env)) {
        if (key.toLowerCase() === name.toLowerCase())
            delete env[key];
    }
    env[name] = value;
}
/** A shell the owner or Native asks for is the owner's shell: it sees the real profile, not Core's redirected one. */
function restoreUserProfileEnv(env: NodeJS.ProcessEnv) {
    const home = realUserHome();
    setEnvKey(env, 'HOME', home);
    if (process.platform === 'win32') {
        setEnvKey(env, 'USERPROFILE', home);
        setEnvKey(env, 'APPDATA', path.join(home, 'AppData', 'Roaming'));
        setEnvKey(env, 'LOCALAPPDATA', path.join(home, 'AppData', 'Local'));
    }
}
export function buildMachineShellEnv(overrides: NodeJS.ProcessEnv = {}, source: NodeJS.ProcessEnv = process.env) {
    const output = { ...source };
    // Only Core's own environment is redirected; an explicit source is used as given.
    if (source === process.env)
        restoreUserProfileEnv(output);
    for (const key of agentCoreOwnedSecretKeys)
        delete output[key];
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined)
            delete output[key];
        else
            output[key] = value;
    }
    return output;
}
