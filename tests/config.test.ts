import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses local-only network, project-local storage, and production-ready execution defaults', () => {
    const baseDir = path.resolve('F:\\Projects\\Agent-Core');
    const config = loadConfig({}, baseDir);

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8765);
    expect(config.dataDir).toBe(path.resolve(baseDir, 'data'));
    expect(config.logDir).toBe(path.resolve(baseDir, 'logs'));
    expect(config.capabilityDir).toBe(path.resolve(baseDir, 'capabilities'));
    expect(config.allowedRoots).toEqual([baseDir]);
    expect(config.httpSecurity).toEqual({
      publicBaseUrl: null,
      trustProxy: false,
      allowedOrigins: [],
    });
    expect(config.mcp).toEqual({ protocolMode: 'dual' });
    expect(config.observability).toEqual({
      audit: {
        queueCapacity: 4096,
        maxFileBytes: 16 * 1024 * 1024,
        maxRotatedFiles: 16,
        retentionMs: 30 * 24 * 60 * 60 * 1000,
      },
    });
    expect(config.execution).toEqual({
      enabled: true,
      dbPath: path.join(baseDir, 'runtime', 'execution', 'agent-core-execution.sqlite'),
      logRoot: path.join(baseDir, 'runtime', 'execution', 'runs'),
      maxConcurrency: 4,
      maxNodes: 128,
      maxOutputBytes: 64 * 1024 * 1024,
      waitMaxMs: 60_000,
      busyTimeoutMs: 5_000,
    });
    expect(config.github).toEqual({
      enabled: true,
      apiBaseUrl: 'https://api.github.com',
      apiVersion: '2026-03-10',
      tokenFile: path.join(baseDir, 'secrets', 'github', 'gh-token.txt'),
      packagesTokenFile: path.join(baseDir, 'secrets', 'github', 'packages-token.txt'),
      requestTimeoutMs: 30_000,
      gitTimeoutMs: 120_000,
    });
  });

  it('accepts explicit environment overrides including execution and github settings', () => {
    const config = loadConfig({
      AGENT_CORE_HOST: '0.0.0.0',
      AGENT_CORE_PORT: '9999',
      AGENT_CORE_DATA_DIR: 'F:\\CustomData',
      AGENT_CORE_LOG_DIR: 'F:\\CustomLogs',
      AGENT_CORE_CAPABILITY_DIR: 'F:\\AgentCoreCapabilities',
      AGENT_CORE_ALLOWED_ROOTS: 'F:\\Projects;F:\\Design',
      AGENT_CORE_PUBLIC_BASE_URL: 'https://agent-core.example.test/',
      AGENT_CORE_TRUST_PROXY: 'true',
      AGENT_CORE_MCP_ALLOWED_ORIGINS: 'https://app.example.test;LOCALHOST;https://app.example.test:8443',
      AGENT_CORE_MCP_PROTOCOL_MODE: 'legacy',
      AGENT_CORE_AUDIT_QUEUE_CAPACITY: '2048',
      AGENT_CORE_AUDIT_MAX_FILE_BYTES: '1048576',
      AGENT_CORE_AUDIT_MAX_ROTATED_FILES: '8',
      AGENT_CORE_AUDIT_RETENTION_MS: '1234567',
      AGENT_CORE_EXECUTION_ENABLED: 'true',
      AGENT_CORE_EXECUTION_DB_PATH: 'F:\\Exec\\execution.sqlite',
      AGENT_CORE_EXECUTION_LOG_ROOT: 'F:\\Exec\\runs',
      AGENT_CORE_EXECUTION_MAX_CONCURRENCY: '8',
      AGENT_CORE_EXECUTION_MAX_NODES: '64',
      AGENT_CORE_EXECUTION_MAX_OUTPUT_BYTES: '2097152',
      AGENT_CORE_EXECUTION_WAIT_MAX_MS: '45000',
      AGENT_CORE_EXECUTION_BUSY_TIMEOUT_MS: '7000',
      AGENT_CORE_GITHUB_ENABLED: 'false',
      AGENT_CORE_GITHUB_API_BASE_URL: 'https://github.example.test/api/v3/',
      AGENT_CORE_GITHUB_API_VERSION: '2026-03-10',
      AGENT_CORE_GITHUB_TOKEN_FILE: 'F:\\Secrets\\github.txt',
      AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE: 'F:\\Secrets\\packages.txt',
      AGENT_CORE_GITHUB_REQUEST_TIMEOUT_MS: '11111',
      AGENT_CORE_GITHUB_GIT_TIMEOUT_MS: '22222',
    }, 'F:\\Ignored');

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(9999);
    expect(config.dataDir).toBe(path.resolve('F:\\CustomData'));
    expect(config.logDir).toBe(path.resolve('F:\\CustomLogs'));
    expect(config.capabilityDir).toBe(path.resolve('F:\\AgentCoreCapabilities'));
    expect(config.allowedRoots).toEqual([
      path.resolve('F:\\Projects'),
      path.resolve('F:\\Design'),
    ]);
    expect(config.httpSecurity).toEqual({
      publicBaseUrl: 'https://agent-core.example.test',
      trustProxy: true,
      allowedOrigins: ['app.example.test', 'localhost'],
    });
    expect(config.mcp).toEqual({ protocolMode: 'legacy' });
    expect(config.observability).toEqual({
      audit: {
        queueCapacity: 2048,
        maxFileBytes: 1_048_576,
        maxRotatedFiles: 8,
        retentionMs: 1_234_567,
      },
    });
    expect(config.execution).toEqual({
      enabled: true,
      dbPath: path.resolve('F:\\Exec\\execution.sqlite'),
      logRoot: path.resolve('F:\\Exec\\runs'),
      maxConcurrency: 8,
      maxNodes: 64,
      maxOutputBytes: 2 * 1024 * 1024,
      waitMaxMs: 45_000,
      busyTimeoutMs: 7_000,
    });
    expect(config.github).toEqual({
      enabled: false,
      apiBaseUrl: 'https://github.example.test/api/v3',
      apiVersion: '2026-03-10',
      tokenFile: path.resolve('F:\\Secrets\\github.txt'),
      packagesTokenFile: path.resolve('F:\\Secrets\\packages.txt'),
      requestTimeoutMs: 11_111,
      gitTimeoutMs: 22_222,
    });
  });


  it('rejects unsafe public base URLs and malformed allowed origins', () => {
    expect(() => loadConfig({ AGENT_CORE_PUBLIC_BASE_URL: 'ftp://agent-core.example.test' }, 'F:\\Ignored'))
      .toThrow('AGENT_CORE_PUBLIC_BASE_URL must use http or https');
    expect(() => loadConfig({ AGENT_CORE_PUBLIC_BASE_URL: 'https://user@agent-core.example.test' }, 'F:\\Ignored'))
      .toThrow('AGENT_CORE_PUBLIC_BASE_URL must not include credentials');
    expect(() => loadConfig({ AGENT_CORE_PUBLIC_BASE_URL: 'https://agent-core.example.test/base' }, 'F:\\Ignored'))
      .toThrow('AGENT_CORE_PUBLIC_BASE_URL must be an origin without a path');
    expect(() => loadConfig({ AGENT_CORE_MCP_ALLOWED_ORIGINS: 'https://app.example.test/path' }, 'F:\\Ignored'))
      .toThrow('AGENT_CORE_MCP_ALLOWED_ORIGINS contains an invalid origin');
  });

  it('rejects unsupported MCP protocol modes', () => {
    expect(() => loadConfig({ AGENT_CORE_MCP_PROTOCOL_MODE: 'modern-only' }, 'F:\\Ignored'))
      .toThrow('AGENT_CORE_MCP_PROTOCOL_MODE must be dual or legacy');
  });

  it('rejects execution output byte limits above the hard one-gibibyte ceiling', () => {
    expect(() => loadConfig({ AGENT_CORE_EXECUTION_MAX_OUTPUT_BYTES: String(1024 * 1024 * 1024 + 1) }, 'F:\\Ignored'))
      .toThrow('AGENT_CORE_EXECUTION_MAX_OUTPUT_BYTES must be between 1 and 1073741824');
  });

  it('rejects non-http github api base urls', () => {
    expect(() => loadConfig({ AGENT_CORE_GITHUB_API_BASE_URL: 'file:///tmp/api' }, 'F:\\Ignored'))
      .toThrow('AGENT_CORE_GITHUB_API_BASE_URL must use http or https');
  });
});
