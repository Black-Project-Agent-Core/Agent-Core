import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProviderFailure } from './providers/types.js';
import type { SubAgentCoreProviderConfig, SubAgentCoreProviderId } from './types.js';

export interface SelectedKeySlot { provider: SubAgentCoreProviderId; index: number; slotRef: string; value: string; }
type SlotHealth = 'active' | 'cooldown' | 'invalid';
interface SlotState { health: SlotHealth; cooldownUntil?: number; lastUsedAt?: number; lastFailureKind?: string; lastFailureStatus?: number; modelLocks?: Record<string, { kind: string; createdAt: number }>; }
interface PersistedState { version: 1; slots: Record<string, SlotState>; }
export interface KeyPoolStatusSlot { slotRef: string; envName: string; index: number; health: SlotHealth; cooldownUntil?: number; lastUsedAt?: number; lastFailureKind?: string; lastFailureStatus?: number; modelLocks: string[]; }

export class ProviderKeyPool {
  private state: PersistedState = { version: 1, slots: {} };
  private opened = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly providers: Record<SubAgentCoreProviderId, SubAgentCoreProviderConfig>, private readonly statePath: string) {}

  private async open(): Promise<void> {
    if (this.opened) return;
    this.opened = true;
    try {
      const parsed = JSON.parse(await readFile(this.statePath, 'utf8')) as PersistedState;
      if (parsed?.version === 1 && parsed.slots && typeof parsed.slots === 'object') this.state = parsed;
    } catch {}
  }

  private slotState(ref: string): SlotState { return this.state.slots[ref] ??= { health: 'active', modelLocks: {} }; }

  private async persist(): Promise<void> {
    const data = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.statePath), { recursive: true });
      const temporary = `${this.statePath}.${process.pid}.tmp`;
      await writeFile(temporary, data, 'utf8');
      await rename(temporary, this.statePath);
    });
    await this.writeChain;
  }

  async select(provider: SubAgentCoreProviderId, model: string, requestedSlot: 'auto' | number = 'auto', exclude: ReadonlySet<string> = new Set()): Promise<SelectedKeySlot | null> {
    await this.open();
    const config = this.providers[provider];
    const now = Date.now();
    const candidates = config.keySlots.filter((slot) => {
      const ref = `${provider}:${slot.index}`;
      if (exclude.has(ref)) return false;
      if (requestedSlot !== 'auto' && slot.index !== requestedSlot) return false;
      const state = this.slotState(ref);
      if (state.health === 'invalid') return false;
      if (state.cooldownUntil && state.cooldownUntil > now) return false;
      if (state.cooldownUntil && state.cooldownUntil <= now) {
        state.health = 'active';
        delete state.cooldownUntil; delete state.lastFailureKind; delete state.lastFailureStatus;
      }
      if (state.modelLocks?.[model]) return false;
      return true;
    });
    candidates.sort((left, right) => {
      const leftAt = this.slotState(`${provider}:${left.index}`).lastUsedAt ?? 0;
      const rightAt = this.slotState(`${provider}:${right.index}`).lastUsedAt ?? 0;
      return leftAt - rightAt || left.index - right.index;
    });
    const selected = candidates[0];
    if (!selected) return null;
    const slotRef = `${provider}:${selected.index}`;
    this.slotState(slotRef).lastUsedAt = now;
    await this.persist();
    return { provider, index: selected.index, slotRef, value: selected.value };
  }

  async recordSuccess(selected: SelectedKeySlot): Promise<void> {
    await this.open();
    const state = this.slotState(selected.slotRef);
    if (state.health !== 'invalid') state.health = 'active';
    delete state.cooldownUntil; delete state.lastFailureKind; delete state.lastFailureStatus;
    await this.persist();
  }

  async recordFailure(selected: SelectedKeySlot, failure: ProviderFailure): Promise<void> {
    await this.open();
    const state = this.slotState(selected.slotRef);
    state.lastFailureKind = failure.kind;
    if (failure.status !== undefined) state.lastFailureStatus = failure.status;
    if (failure.kind === 'model_entitlement' && failure.model) {
      state.modelLocks ??= {};
      state.modelLocks[failure.model] = { kind: failure.kind, createdAt: Date.now() };
    } else if (failure.kind === 'auth' || failure.kind === 'credits_exhausted') {
      state.health = 'invalid'; delete state.cooldownUntil;
    } else if (failure.kind === 'rate_limit') {
      state.health = 'cooldown'; state.cooldownUntil = Date.now() + Math.max(1_000, failure.retryAfterMs ?? 60_000);
    } else if (failure.kind === 'forbidden') {
      state.health = 'cooldown'; state.cooldownUntil = Date.now() + 60_000;
    } else if (failure.kind === 'server' || failure.kind === 'network' || failure.kind === 'timeout') {
      state.health = 'cooldown'; state.cooldownUntil = Date.now() + 5_000;
    }
    await this.persist();
  }

  async reset(provider: SubAgentCoreProviderId, index: number, model?: string): Promise<void> {
    await this.open();
    const ref = `${provider}:${index}`;
    const state = this.slotState(ref);
    if (model) { if (state.modelLocks) delete state.modelLocks[model]; }
    else this.state.slots[ref] = { health: 'active', modelLocks: {} };
    await this.persist();
  }

  async status(): Promise<Record<SubAgentCoreProviderId, KeyPoolStatusSlot[]>> {
    await this.open();
    const result = {} as Record<SubAgentCoreProviderId, KeyPoolStatusSlot[]>;
    for (const provider of Object.keys(this.providers) as SubAgentCoreProviderId[]) {
      result[provider] = this.providers[provider].keySlots.map((slot) => {
        const ref = `${provider}:${slot.index}`;
        const state = this.slotState(ref);
        return { slotRef: ref, envName: slot.envName, index: slot.index, health: state.health,
          ...(state.cooldownUntil === undefined ? {} : { cooldownUntil: state.cooldownUntil }),
          ...(state.lastUsedAt === undefined ? {} : { lastUsedAt: state.lastUsedAt }),
          ...(state.lastFailureKind === undefined ? {} : { lastFailureKind: state.lastFailureKind }),
          ...(state.lastFailureStatus === undefined ? {} : { lastFailureStatus: state.lastFailureStatus }),
          modelLocks: Object.keys(state.modelLocks ?? {}).sort() };
      });
    }
    return result;
  }
}
