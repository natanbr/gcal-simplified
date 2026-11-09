// ============================================================
// The diagnostics folder's write queue (electron/serial-queue.ts).
//
// One job at a time, in order, never on the caller's stack, bounded. The trap it
// closes: a "draining" flag set by `draining ??= drain()` and cleared in drain's
// finally. A drain that finished before its first await (a job with nothing to
// await, like a write skipped because the folder was turned off) cleared the
// flag before ??= stored the settled promise, and the queue never drained
// again: every later batch waited for ever, then was dropped as queue-full.
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { serialQueue } from './serial-queue';

const deferred = () => {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
};

describe('serialQueue', () => {
    it('keeps running after a job that had nothing to await', async () => {
        const queue = serialQueue(32, vi.fn());
        const ran: string[] = [];

        queue.add(() => { ran.push('skipped: nothing to write'); });
        await queue.idle();
        queue.add(async () => { ran.push('the next write'); });
        await queue.idle();

        expect(ran).toEqual(['skipped: nothing to write', 'the next write']);
    });

    it('never runs a job on the caller\'s stack', async () => {
        const queue = serialQueue(32, vi.fn());
        let ran = false;

        queue.add(() => { ran = true; });

        expect(ran).toBe(false);
        await queue.idle();
        expect(ran).toBe(true);
    });

    it('runs one job at a time, in the order they came', async () => {
        const queue = serialQueue(32, vi.fn());
        const first = deferred();
        const events: string[] = [];

        queue.add(async () => { events.push('first starts'); await first.promise; events.push('first ends'); });
        queue.add(async () => { events.push('second starts'); });
        await Promise.resolve();
        await Promise.resolve();
        expect(events).toEqual(['first starts']);

        first.resolve();
        await queue.idle();
        expect(events).toEqual(['first starts', 'first ends', 'second starts']);
    });

    it('reports a job that throws or rejects, and runs the next', async () => {
        const onError = vi.fn();
        const queue = serialQueue(32, onError);
        let ran = false;

        queue.add(() => { throw new Error('sync'); });
        queue.add(() => Promise.reject(new Error('async')));
        queue.add(() => { ran = true; });
        await queue.idle();

        expect(onError).toHaveBeenCalledTimes(2);
        expect(ran).toBe(true);
    });

    it('holds at most the one in progress and maxWaiting behind it; then it refuses', async () => {
        const queue = serialQueue(3, vi.fn());
        const hung = deferred();
        const ran: number[] = [];

        expect(queue.add(() => hung.promise)).toBe(true);
        const accepted = [1, 2, 3, 4, 5].map(n => queue.add(() => { ran.push(n); }));
        expect(accepted).toEqual([true, true, true, false, false]);

        hung.resolve();
        await queue.idle();
        expect(ran).toEqual([1, 2, 3]);
        expect(queue.add(() => { ran.push(6); })).toBe(true); // room again once they ran
        await queue.idle();
        expect(ran).toEqual([1, 2, 3, 6]);
    });
});
