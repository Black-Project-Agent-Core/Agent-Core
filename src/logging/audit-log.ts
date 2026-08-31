import type { RouteMode, RouteTier } from '../capabilities/route-types.js';
import type { CapabilityRisk } from '../capabilities/types.js';
import { AuditJournal, type AuditJournalOptions, type AuditJournalStatus } from '../observability/audit-journal.js';

export interface AuditEvent {
  timestamp: string;
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  keyId: string | null;
  keyName: string | null;
}

export interface RoutingAuditEvent {
  event: 'route.created' | 'route.validated' | 'route.rejected' | 'route.skill_loaded';
  routeContextId: string;
  principalId: string;
  tier?: RouteTier;
  mode?: RouteMode;
  risk?: CapabilityRisk;
  capabilityIds?: string[];
  skillIds?: string[];
  toolName?: string;
  errorCode?: string;
  timestamp: string;
}

export interface AuditLogger {
  log(event: AuditEvent): Promise<void>;
}

export interface RoutingAuditLogger {
  logRouting(event: RoutingAuditEvent): void;
}

export interface RuntimeAuditLogger {
  logRuntime(category: string, event: string, data?: Record<string, unknown>): void;
}

export const NOOP_ROUTING_AUDIT_LOGGER: RoutingAuditLogger = {
  logRouting: () => {},
};

export const NOOP_RUNTIME_AUDIT_LOGGER: RuntimeAuditLogger = {
  logRuntime: () => {},
};

export class FileAuditLogger implements AuditLogger, RoutingAuditLogger, RuntimeAuditLogger {
  readonly journal: AuditJournal;
  readonly filePath: string;

  constructor(logDir: string, options: AuditJournalOptions = {}) {
    this.journal = new AuditJournal(logDir, options);
    this.filePath = this.journal.filePath;
  }

  async log(event: AuditEvent): Promise<void> {
    const { timestamp, ...data } = event;
    this.journal.enqueue({ category: 'http', event: 'request.completed', timestamp, data });
  }

  logRouting(event: RoutingAuditEvent): void {
    const { event: name, timestamp, ...data } = event;
    this.journal.enqueue({ category: 'routing', event: name, timestamp, data });
  }

  logRuntime(category: string, event: string, data: Record<string, unknown> = {}): void {
    this.journal.enqueue({ category, event, data });
  }

  drain(): Promise<void> {
    return this.journal.drain();
  }

  close(): Promise<void> {
    return this.journal.close();
  }

  status(): AuditJournalStatus {
    return this.journal.status();
  }
}
