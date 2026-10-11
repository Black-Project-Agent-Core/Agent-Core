import { z } from 'zod/v3';
import type { BrowserTransport } from './extension-bridge.js';

const pointSchema = z.object({ x: z.number().finite().min(0), y: z.number().finite().min(0) }).strict();
export const pointerRequestSchema = z.object({
  operation: z.enum(['POINTER_MOVE', 'HOVER', 'CLICK', 'DRAG', 'SCROLL']),
  captureId: z.string().uuid().optional(), targetId: z.string().min(1).max(256).optional(),
  documentId: z.string().min(1).max(128).optional(), geometryVersion: z.string().min(1).max(128).optional(),
  x: z.number().finite().min(0).optional(), y: z.number().finite().min(0).optional(),
  path: z.array(pointSchema).min(1).max(119).optional(),
  durationMs: z.number().int().min(0).max(5000).optional(),
  deltaX: z.number().finite().min(-4000).max(4000).optional(),
  deltaY: z.number().finite().min(-4000).max(4000).optional(),
  toActionId: z.string().min(1).max(64).optional(),
}).strict().superRefine((value, ctx) => {
  const coordinates = [value.captureId, value.targetId, value.documentId, value.geometryVersion, value.x, value.y];
  if (coordinates.some(v => v !== undefined) && coordinates.some(v => v === undefined))
    ctx.addIssue({ code: 'custom', message: 'coordinates require captureId, targetId, documentId, geometryVersion, x and y' });
  if (value.operation === 'DRAG') {
    if (value.captureId ? !value.path || value.toActionId !== undefined : !value.toActionId || value.path !== undefined)
      ctx.addIssue({ code: 'custom', message: 'DRAG requires either capture path or observed toActionId' });
  } else if (value.path !== undefined || value.toActionId !== undefined || value.durationMs !== undefined)
    ctx.addIssue({ code: 'custom', message: 'path, toActionId and durationMs are DRAG-only' });
  if (value.operation === 'SCROLL') {
    if (!(value.deltaX || value.deltaY)) ctx.addIssue({ code: 'custom', message: 'SCROLL requires a nonzero delta' });
  } else if (value.deltaX !== undefined || value.deltaY !== undefined)
    ctx.addIssue({ code: 'custom', message: 'deltaX and deltaY are SCROLL-only' });
});
export type BrowserPointerRequest = z.infer<typeof pointerRequestSchema>;
export interface PointerPoint { x: number; y: number }

/** A complete, cancellable page gesture. Never owns or moves the OS cursor. */
export class PointerActions {
  private active?: { cancel: AbortController; release: () => Promise<void> };

  async execute(client: BrowserTransport, request: BrowserPointerRequest, start: PointerPoint,
    path: PointerPoint[] = [], assertLive: () => void = () => undefined): Promise<void> {
    if (this.active) throw new Error('BROWSER_CONTROL_POINTER_IN_FLIGHT');
    if (path.length > 119 || (request.durationMs ?? 0) > 5000) throw new Error('BROWSER_CONTROL_POINTER_LIMIT');
    const cancel = new AbortController(); let point = start, held = false, released: Promise<void> | undefined;
    const release = () => !held ? Promise.resolve() : released ??= client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1, modifiers: 0,
    }).then(() => undefined);
    const active = { cancel, release }; this.active = active;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (cancel.signal.aborted) throw new Error('BROWSER_CONTROL_INPUT_CANCELLED');
      assertLive();
    };
    const send = async (params: Record<string, unknown>) => {
      check();
      // Cancel can interrupt a missing acknowledgement; release is queued after the pending press.
      await new Promise<void>((resolve, reject) => {
        const stop = () => reject(new Error('BROWSER_CONTROL_INPUT_CANCELLED'));
        cancel.signal.addEventListener('abort', stop, { once: true });
        client.send('Input.dispatchMouseEvent', params).then(() => resolve(), reject)
          .finally(() => cancel.signal.removeEventListener('abort', stop));
      });
      check();
    };
    const delay = async (ms: number) => {
      check();
      if (ms <= 0) return;
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); cancel.signal.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, ms); cancel.signal.addEventListener('abort', done, { once: true });
      });
      check();
    };
    let failure: unknown;
    try {
      await send({ type: 'mouseMoved', ...point, button: 'none', buttons: 0, modifiers: 0 });
      if (request.operation === 'CLICK' || request.operation === 'DRAG') {
        held = true;
        deadline = setTimeout(() => { cancel.abort(); void release().catch(() => undefined); }, 5000);
        const startedAt = Date.now();
        await send({ type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1, modifiers: 0 });
        if (request.operation === 'DRAG') {
          const duration = request.durationMs ?? 250;
          for (let i = 0; i < path.length; i++) {
            await delay(Math.max(0, startedAt + duration * (i + 1) / path.length - Date.now()));
            point = path[i];
            await send({ type: 'mouseMoved', ...point, button: 'left', buttons: 1, modifiers: 0 });
          }
        }
      } else if (request.operation === 'SCROLL') {
        await send({ type: 'mouseWheel', ...point, button: 'none', buttons: 0, modifiers: 0,
          deltaX: request.deltaX ?? 0, deltaY: request.deltaY ?? 0 });
      }
    } catch (error) { failure = error; }
    finally {
      if (deadline) clearTimeout(deadline);
      try { await release(); } catch { failure = new Error('BROWSER_CONTROL_MUTATION_UNCERTAIN'); }
      if (this.active === active) this.active = undefined;
    }
    if (failure) {
      if (failure instanceof Error && /BROWSER_CONTROL_(INPUT_CANCELLED|PAUSED|SESSION_CLOSED)/.test(failure.message)) throw failure;
      throw new Error('BROWSER_CONTROL_MUTATION_UNCERTAIN');
    }
  }

  async close(): Promise<void> {
    const active = this.active; if (!active) return;
    active.cancel.abort();
    try { await active.release(); } catch { throw new Error('BROWSER_CONTROL_MUTATION_UNCERTAIN'); }
  }
}
