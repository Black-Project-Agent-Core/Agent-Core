import { describe, expect, it } from 'vitest';
import {
  ExecutionPolicyError,
  assertExecutionIntentAllowed,
  evaluateExecutionIntent,
} from '../src/runtime/command-policy.js';

describe('structured execution command policy', () => {
  it('rejects a direct blocked command with a stable reason code and no raw command echo', () => {
    const decision = evaluateExecutionIntent({ command: 'diskpart', source: 'execution' });
    expect(decision).toEqual({
      allowed: false,
      code: 'EXECUTION_POLICY_BLOCKED_COMMAND',
      riskClass: 'blocked',
      executable: 'diskpart',
      interpreterClass: 'none',
      characteristics: ['disk_admin'],
    });
    expect(decision).not.toHaveProperty('command');
  });

  it.each([
    ['cmd /c diskpart', 'cmd'],
    ['powershell.exe -NoProfile -Command "shutdown /s /t 0"', 'powershell'],
    ["powershell -Command 'bcdedit /enum'", 'powershell'],
  ])('rejects blocked nested interpreter command %s', (command, interpreterClass) => {
    const decision = evaluateExecutionIntent({ command, source: 'operational' });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('EXECUTION_POLICY_BLOCKED_NESTED_COMMAND');
    expect(decision.riskClass).toBe('blocked');
    expect(decision.interpreterClass).toBe(interpreterClass);
    expect(decision.characteristics).toContain('nested_interpreter');
  });

  it('classifies a normal local command as bounded without changing compatibility', () => {
    expect(evaluateExecutionIntent({ command: 'node -e "console.log(1)"', source: 'execution' })).toEqual({
      allowed: true,
      code: 'EXECUTION_POLICY_ALLOWED_BOUNDED',
      riskClass: 'bounded',
      executable: 'node',
      interpreterClass: 'none',
      characteristics: [],
    });
  });

  it.each([
    ['git fetch origin', ['network', 'repository']],
    ['npm install', ['network', 'package_manager']],
    ['curl https://example.test', ['network']],
  ])('classifies open-world command %s deterministically', (command, characteristics) => {
    const first = evaluateExecutionIntent({ command, source: 'execution' });
    const second = evaluateExecutionIntent({ command, source: 'execution' });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      allowed: true,
      code: 'EXECUTION_POLICY_ALLOWED_OPEN_WORLD',
      riskClass: 'open_world',
      characteristics,
    });
  });

  it('throws a typed policy error while returning the decision for allowed commands', () => {
    const allowed = assertExecutionIntentAllowed({ command: 'node --version', source: 'operational' });
    expect(allowed.code).toBe('EXECUTION_POLICY_ALLOWED_BOUNDED');

    try {
      assertExecutionIntentAllowed({ command: 'shutdown now', source: 'execution' });
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutionPolicyError);
      expect(error).toMatchObject({ code: 'EXECUTION_POLICY_BLOCKED_COMMAND' });
    }
  });
});
