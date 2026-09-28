// ============================================================
// The logging interceptor sees every dispatch before it, not the last render
// ------------------------------------------------------------
// useMCDispatch builds each log line from the state it will apply to. It used
// to read the state of the last render, so two dispatches before a re-render
// both logged the balance from before the first (review of 7761584, 2026-09-28).
// The provider now keeps one pending state that every intercepted dispatch
// advances with the same reducer, reset to the committed state on each render.
// ============================================================

import { render, act } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MCStoreProvider } from './MCStoreProvider';
import { useMCDispatch, useMCState } from './useMCStore';
import { initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

let live: MCState = initialState;
let dispatch: (a: MCAction) => void = () => {};
function Probe() {
    live = useMCState();
    dispatch = useMCDispatch();
    return null;
}

afterEach(() => { localStorage.clear(); });

describe('useMCDispatch — two dispatches in one batch', () => {
    it("the second dispatch's log line sees the first one's effect", () => {
        render(<MCStoreProvider><Probe /></MCStoreProvider>);
        const start = live.bankCount;
        act(() => {
            dispatch({ type: 'ADD_TOKEN' });
            dispatch({ type: 'ADD_TOKEN' });
        });

        expect(live.bankCount).toBe(start + 2);
        const added = live.activityLogs.filter(l => l.message === 'Manual token added'); // newest first
        expect(added.map(l => l.bankTokens)).toEqual([start + 2, start + 1]);
    });

    it('a later render starts from the committed state again', () => {
        render(<MCStoreProvider><Probe /></MCStoreProvider>);
        const start = live.bankCount;
        act(() => { dispatch({ type: 'ADD_TOKEN' }); });
        act(() => { dispatch({ type: 'REMOVE_TOKEN' }); });

        expect(live.activityLogs[0]).toMatchObject({ message: 'Manual token removed', bankTokens: start });
    });
});
