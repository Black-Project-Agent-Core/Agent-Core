import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import type { NamedAction } from './types.js';

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'device';
}

/**
 * Local, durable store of calibrated tap coordinates for the ADB transport, giving
 * feature parity with the gateway/device-app named-action + macro system without
 * needing the on-device app. One JSON file per device id under the phone data dir.
 */
export class NamedActionStore {
  constructor(private readonly dir: string, private readonly deviceId: string) {}

  private file(): string {
    return path.join(this.dir, `actions-${sanitize(this.deviceId)}.json`);
  }

  private async readMap(): Promise<Record<string, NamedAction>> {
    try {
      const raw = await readFile(this.file(), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, NamedAction>;
      return {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  private async writeMap(map: Record<string, NamedAction>): Promise<void> {
    const target = this.file();
    await writeOwnedFileAtomic(target, `${JSON.stringify(map, null, 2)}\n`, { mode: 0o600 });
  }

  async list(): Promise<NamedAction[]> {
    const map = await this.readMap();
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string): Promise<NamedAction | undefined> {
    const map = await this.readMap();
    return map[name];
  }

  async put(name: string, x: number, y: number, verified: boolean): Promise<NamedAction> {
    const map = await this.readMap();
    const action: NamedAction = { name, x, y, verified, updatedAt: Date.now() };
    map[name] = action;
    await this.writeMap(map);
    return action;
  }
}
