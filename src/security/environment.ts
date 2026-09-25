// Reconstructed from surviving local dist; emitted runtime parity checked.
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
export function buildMachineShellEnv(overrides: NodeJS.ProcessEnv = {}, source: NodeJS.ProcessEnv = process.env) {
    const output = { ...source };
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
