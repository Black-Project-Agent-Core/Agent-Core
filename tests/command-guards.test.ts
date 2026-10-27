import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configManager } from '../src/rdc/config-manager.js';
import { commandManager } from '../src/rdc/command-manager.js';
import { catastrophicDeleteTarget, normalizeCommandName, persistenceAdvisory, splitSegments } from '../src/rdc/command-guards.js';
import { canonicalPathKey, hazardousWindowsPath, isProtectedPath } from '../src/semantic-ide/path-safety.js';
import { validatePath } from '../src/rdc/tools/filesystem.js';
import { describeExitCode, stripAnsi } from '../src/rdc/terminal-output.js';

afterEach(() => vi.restoreAllMocks());

const projectRoot = path.resolve(import.meta.dirname, '..');
const BLOCKED = ['sudo', 'reg', 'format', 'net', 'sc', 'dd', 'diskpart'];
const useBlocklist = () => vi.spyOn(configManager, 'getConfig').mockResolvedValue({ blockedCommands: BLOCKED } as never);

describe('command blocklist', () => {
  it.each([
    ['sudo ls', false],
    ['SUDO ls', false],
    ['/usr/bin/sudo ls', false],
    ['reg add HKCU\\Software\\x', false],
    ['reg.exe add HKCU\\Software\\x', false],
    ['"C:\\Windows\\System32\\reg.exe" query HKLM', false],
    ['"C:\\Program Files\\Tools\\net.exe" user', false],
    ['& "C:\\Windows\\System32\\reg.exe" query HKLM', false],
    ['ls; format c:', false],
    ['echo ok && sudo reboot', false],
    ['echo ok\nsudo reboot', false],
    ['echo ok\r\nreg query HKLM', false],
    ['A=1 sudo ls', false],
    ['echo $(sudo ls)', false],
    ['echo `sudo ls`', false],
    ['ls | sudo tee out', false],
    ['(sudo ls)', false],
    ['git status', true],
    ['echo reg', true],
    ['grep -r "sudo" src', true],
    ['echo "line one\nsudo line two inside quotes"', true],
    ['Format-Table -AutoSize', true],
    ['dir C:\\formatted', true],
  ])('%j allowed=%s', async (command, allowed) => {
    useBlocklist();
    expect(await commandManager.validateCommand(command)).toBe(allowed);
  });

  it('fails closed when the configuration cannot be read', async () => {
    vi.spyOn(configManager, 'getConfig').mockRejectedValue(new Error('config unreadable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await commandManager.validateCommand('git status')).toBe(false);
  });
});

describe('command helpers', () => {
  it('names an executable once, whatever its quoting, folder or extension', () => {
    for (const token of ['reg', 'REG.EXE', '"C:\\Windows\\System32\\reg.exe"', "'./reg.cmd'", '/usr/bin/reg']) expect(normalizeCommandName(token)).toBe('reg');
  });
  it('splits on separators and newlines outside quotes only', () => {
    expect(splitSegments('a; b && c | d\ne "f; g" \'h & i\'')).toEqual(['a', 'b', 'c', 'd', 'e "f; g" \'h & i\'']);
  });
});

describe('catastrophic delete guard', () => {
  const profile = process.env.USERPROFILE ?? os.homedir();
  const windows = process.env.SystemRoot ?? 'C:\\Windows';
  const refused = [
    'C:\\', 'E:\\', 'E:/', 'E:', 'C:\\*', 'C:\\*.*', '/', windows, `${windows}\\*`, `"${windows}"`,
    'C:\\Program Files', 'C:\\Program Files\\*', profile, '%USERPROFILE%', '$env:USERPROFILE', '~', path.dirname(profile),
    projectRoot, `${projectRoot}\\*`, path.dirname(projectRoot),
  ];
  it.each(refused)('refuses removing %s', raw => {
    const target = /\s/.test(raw) && !raw.startsWith('"') ? `"${raw}"` : raw; // an unquoted space would be two targets
    for (const command of [`rm -rf ${target}`, `Remove-Item -Recurse -Force -Path ${target}`, `rd /s /q ${target}`, `del /f /s /q ${target}`, `echo start; rmdir ${target}`]) {
      expect(catastrophicDeleteTarget(command), command).toBeDefined();
    }
  });

  it.each([
    'rm -rf node_modules',
    'rm -rf ./build ../other',
    `Remove-Item -Recurse "${path.join(projectRoot, 'runtime', 'tmp', 'scratch')}"`,
    `del ${path.join(profile, 'Downloads', 'old.zip')}`,
    `rd /s /q "${path.join(profile, 'Desktop', 'junk')}"`,
    `rm -rf ${path.join(projectRoot, 'runtime', 'tmp')}${path.sep}*`,
    'echo rm -rf C:\\',
    'grep -r "rm -rf /" docs',
    'dir C:\\',
    'git clean -fd',
  ])('allows %s', command => {
    expect(catastrophicDeleteTarget(command)).toBeUndefined();
  });

  it('reports what it matched without echoing control characters', () => {
    expect(catastrophicDeleteTarget('rm -rf C:\\')).toEqual({ target: 'C:\\', label: 'a drive root' });
    expect(catastrophicDeleteTarget('rm -rf %USERPROFILE%')?.label).toBe('the user profile');
  });
});

describe('persistence advisory', () => {
  it.each([
    ['Add-Content $PROFILE "x"', 'PowerShell profile'],
    ['copy a.bat "C:\\Users\\x\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"', 'Startup folder'],
    ['echo x > .git/hooks/pre-commit', 'git hook'],
    ['Set-ItemProperty HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run -Name x', 'Run key'],
    ['schtasks /create /tn x /tr y', 'scheduled task'],
  ])('flags %j', (command, label) => {
    expect(persistenceAdvisory(command)).toContain(label);
  });
  it('stays quiet for ordinary commands', () => {
    for (const command of ['git status', 'npm test', 'dir', 'echo profile']) expect(persistenceAdvisory(command)).toBeUndefined();
  });
});

describe.skipIf(process.platform !== 'win32')('protected path spellings', () => {
  const protectedName = 'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT';
  it.each([
    `E:\\x\\${protectedName}`,
    `e:/x/${protectedName.toLowerCase()}/a.txt`,
    `E:\\x\\${protectedName}.`,
    `E:\\x\\${protectedName} `,
    `E:\\x\\${protectedName}...\\a`,
    `E:\\x\\${protectedName}::$INDEX_ALLOCATION\\a`,
    `E:\\x\\${protectedName}:stream`,
    `\\\\?\\E:\\x\\${protectedName}\\a`,
    `\\\\.\\E:\\x\\${protectedName}`,
  ])('treats %j as protected', value => {
    expect(isProtectedPath(value)).toBe(true);
  });
  it('does not widen the match to other names', () => {
    for (const value of [`E:\\x\\${protectedName}-copy`, 'E:\\x\\DO NOT TOUCH', 'E:\\x\\y']) expect(isProtectedPath(value)).toBe(false);
  });
  it.each([
    ['\\\\?\\C:\\x', 'nt-namespace'], ['\\\\.\\PhysicalDrive0', 'nt-namespace'], ['\\??\\C:\\x', 'nt-namespace'],
    ['\\\\server\\share\\a', 'unc-share'], ['//server/share/a', 'unc-share'],
    ['C:\\x\\file.txt:stream', 'alternate-data-stream'], ['file.txt::$DATA', 'alternate-data-stream'],
  ])('flags %j as %s', (value, reason) => {
    expect(hazardousWindowsPath(value)).toBe(reason);
  });
  it('leaves ordinary Windows paths alone', () => {
    for (const value of ['C:\\x\\file.txt', 'C:/x/file.txt', 'relative\\file.txt', '.\\a', '~/a', 'E:\\']) expect(hazardousWindowsPath(value)).toBeUndefined();
  });
  it('makes the file tools refuse a hazardous spelling before touching the disk', async () => {
    await expect(validatePath('\\\\server\\share\\a.txt')).rejects.toThrow('UNC shares are refused');
    await expect(validatePath('C:\\x\\a.txt:hidden')).rejects.toThrow('alternate data streams are refused');
    await expect(validatePath('\\\\?\\C:\\x')).rejects.toThrow('NT namespace and device paths are refused');
  });
  it('keeps one key for the spellings of one location', () => {
    expect(canonicalPathKey('\\\\?\\E:\\X\\Y.\\')).toBe(canonicalPathKey('e:/x/y'));
    expect(canonicalPathKey('\\\\?\\UNC\\server\\share\\a')).toBe(canonicalPathKey('\\\\server\\share\\a'));
  });
});

describe('terminal output helpers', () => {
  it('strips color, cursor and title sequences and nothing else', () => {
    expect(stripAnsi('\u001b[31mred\u001b[0m \u001b[2K\u001b[1;1Hok \u001b]0;title\u0007done')).toBe('red ok done');
    expect(stripAnsi('plain [31m text')).toBe('plain [31m text');
  });
  it('names the NTSTATUS behind a crash exit code and stays silent otherwise', () => {
    expect(describeExitCode(3221225477)).toBe(' (0xC0000005 STATUS_ACCESS_VIOLATION)');
    expect(describeExitCode(-1073741819)).toBe(' (0xC0000005 STATUS_ACCESS_VIOLATION)');
    expect(describeExitCode(0)).toBe('');
    expect(describeExitCode(1)).toBe('');
    expect(describeExitCode(null)).toBe('');
  });
});
