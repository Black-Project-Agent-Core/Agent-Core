import { afterEach, expect, it, vi } from 'vitest';
import { PointerActions } from '../src/rdc/browser-control/pointer-actions.js';
afterEach(() => vi.useRealTimers());

it('schedules a same-target release at the five-second drag deadline even with a missing movement ack', async () => {
  vi.useFakeTimers();
  const events: any[] = [], pointer = new PointerActions();
  const client = { close() {}, async send(method: string, params: any) {
    events.push({ method, ...params, time: Date.now() });
    if (params.type === 'mouseMoved' && params.buttons === 1) await new Promise(() => undefined);
    return {};
  } };
  const action = pointer.execute(client, { operation: 'DRAG', durationMs: 100 }, { x: 10, y: 10 }, [{ x: 20, y: 20 }]);
  const rejected = expect(action).rejects.toThrow('INPUT_CANCELLED');
  await vi.advanceTimersByTimeAsync(5000); await rejected;
  const pressed = events.find(e => e.type === 'mousePressed'), released = events.find(e => e.type === 'mouseReleased');
  expect(released.time - pressed.time).toBe(5000);
  expect(released).toMatchObject({ x: 20, y: 20, button: 'left', buttons: 0, modifiers: 0 });
  expect(events.filter(e => e.type === 'mouseReleased')).toHaveLength(1);
});

it('marks release acknowledgement loss uncertain without replaying a pressed gesture', async () => {
  const events: string[] = [], pointer = new PointerActions();
  await expect(pointer.execute({ close() {}, async send(_method, params) {
    events.push(String(params?.type));
    if (params?.type === 'mouseReleased') throw new Error('connection lost');
    return {};
  } }, { operation: 'CLICK' }, { x: 10, y: 10 })).rejects.toThrow('MUTATION_UNCERTAIN');
  expect(events).toEqual(['mouseMoved', 'mousePressed', 'mouseReleased']);
});
