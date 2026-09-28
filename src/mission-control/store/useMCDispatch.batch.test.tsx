// ============================================================
// The logging interceptor sees every dispatch before it, not the last render
// ------------------------------------------------------------
// useMCDispatch builds each log line from the state it will apply to. It used
// to read the state of the last render, so two dispatches before a re-render
// both logged the balance from before the first (review of 7761584, 2026-09-28).
// The provider now keeps one pending state that every intercepted dispatch
// advances with the same reducer, reset to the committed state on each render.
//
// verifiedRedBy (2026-09-28, each production mutation undone afterwards):
//   - delete the provider's `pending.current = pendingFrom(state)` → the
//     raw-dispatch case logs the balance without the raw +3;
//   - currentPending folds without clearing its queue → the three-dispatch case
//     applies the first action twice;
//   - fold with the unwrapped `_mcReducer` → the cream case logs no lock line;
//   - queue `action` instead of `actionWithTimestamp` → the source case.
// ============================================================

import { render, act } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCStoreProvider } from './MCStoreProvider';
import { useMCDispatch, useMCState, useMCStore } from './useMCStore';
import { initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

let live: MCState = initialState;
let dispatch: (a: MCAction) => void = () => {};
/** The provider's raw dispatch: no log, not queued (the heartbeat's and the pairing-key save's path). */
let raw: (a: MCAction) => void = () => {};
function Probe() {
    live = useMCState();
    dispatch = useMCDispatch();
    raw = useMCStore().dispatch;
    return null;
}

const added = () => live.activityLogs.filter(l => l.message === 'Manual token added'); // newest first

afterEach(() => { localStorage.clear(); });

describe('useMCDispatch — dispatches in one batch', () => {
    it("the second dispatch's log line sees the first one's effect", () => {
        render(<MCStoreProvider><Probe /></MCStoreProvider>);
        const start = live.bankCount;
        act(() => {
            dispatch({ type: 'ADD_TOKEN' });
            dispatch({ type: 'ADD_TOKEN' });
        });

        expect(live.bankCount).toBe(start + 2);
        expect(added().map(l => l.bankTokens)).toEqual([start + 2, start + 1]);
    });

    it('three in one batch: each earlier action is applied exactly once', () => {
        render(<MCStoreProvider><Probe /></MCStoreProvider>);
        const start = live.bankCount;
        act(() => {
            dispatch({ type: 'ADD_TOKEN' });
            dispatch({ type: 'ADD_TOKEN' });
            dispatch({ type: 'ADD_TOKEN' });
        });

        expect(live.bankCount).toBe(start + 3);
        expect(added().map(l => l.bankTokens)).toEqual([start + 3, start + 2, start + 1]);
    });

    it("folds with the full reducer wrapper: the cream task it injects is there for the next line", () => {
        // syncCreamTask runs in the exported mcReducer's wrapper, not in the cases.
        render(<MCStoreProvider><Probe /></MCStoreProvider>);
        act(() => {
            dispatch({ type: 'SET_SETTINGS', settings: { creamTaskEnabled: true, creamTaskSchedule: 'evening' } });
            dispatch({ type: 'LOCK_TASK', missionPhase: 'evening', taskId: 'cream' });
        });

        expect(live.activityLogs[0]?.message).toMatch(/^Task locked: Cream/);
    });
});

describe('useMCDispatch — across renders', () => {
    it('a later render starts from the committed state, including a raw dispatch the queue never saw', () => {
        render(<MCStoreProvider><Probe /></MCStoreProvider>);
        const start = live.bankCount;
        act(() => { dispatch({ type: 'ADD_TOKEN' }); });
        act(() => { raw({ type: 'ADD_TOKENS', amount: 3, source: 'manual', timestamp: new Date().toISOString() }); });
        act(() => { dispatch({ type: 'REMOVE_TOKEN' }); });

        expect(live.bankCount).toBe(start + 3);
        expect(live.activityLogs[0]).toMatchObject({ message: 'Manual token removed', bankTokens: start + 3 });
    });

    it('queues the stamped action, the very object React receives (structural)', () => {
        // Queuing the unstamped one would fold without the timestamp: no mood sync,
        // and a clock read at fold time instead of the dispatch's own instant.
        const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'useMCStore.tsx'), 'utf-8');
        expect(source).toMatch(/queue\.push\(actionWithTimestamp\);\s*dispatch\(actionWithTimestamp\);/);
    });
});
