import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HookManager } from '../dist/hooks/manager.js';

describe('hooks manager', () => {
  it('dispatches handlers in registration order and supports async handlers', async () => {
    const events: string[] = [];
    const manager = new HookManager({
      context: () => ({
        sessionId: 's1',
        cwd: '/tmp',
        model: 'm1',
        harness: 'h1',
        endpoint: 'http://localhost:8080/v1',
      }),
    });

    manager.on('ask_start', async ({ askId }) => {
      await new Promise((r) => setTimeout(r, 5));
      events.push(`a:${askId}`);
    }, 't1');
    manager.on('ask_start', ({ askId }) => {
      events.push(`b:${askId}`);
    }, 't2');

    await manager.emit('ask_start', { askId: 'x1', instruction: 'hello' });

    assert.deepEqual(events, ['a:x1', 'b:x1']);
  });

  it('isolates handler errors in non-strict mode', async () => {
    const manager = new HookManager({
      strict: false,
      logger: () => {},
      context: () => ({
        sessionId: 's1',
        cwd: '/tmp',
        model: 'm1',
        harness: 'h1',
        endpoint: 'http://localhost:8080/v1',
      }),
    });

    let called = false;
    manager.on('turn_start', () => {
      throw new Error('boom');
    }, 'broken');
    manager.on('turn_start', () => {
      called = true;
    }, 'next');

    await manager.emit('turn_start', { askId: 'a1', turn: 1 });
    assert.equal(called, true);
  });

  it('throws on handler errors in strict mode', async () => {
    const manager = new HookManager({
      strict: true,
      context: () => ({
        sessionId: 's1',
        cwd: '/tmp',
        model: 'm1',
        harness: 'h1',
        endpoint: 'http://localhost:8080/v1',
      }),
    });

    manager.on('turn_start', () => {
      throw new Error('boom');
    }, 'broken');

    await assert.rejects(
      manager.emit('turn_start', { askId: 'a1', turn: 1 }),
      /handler failed/i,
    );
  });
});
