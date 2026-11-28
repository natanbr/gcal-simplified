// ============================================================
// Two saves at the same instant that each cover a window each get their line
// (review of PR 209, Codex)
// ------------------------------------------------------------
// The "not started" line is decided from the state the reducer produces
// (savedIntoWindowLog.ts). It used to take "this save stamped nothing" from
// an unchanged stamp STRING, so a second save made in the same millisecond that
// covered another window wrote no line: a covered window with no trace. Now it
// asks which window the save added. Main suite: settings-covers-window-log.test.tsx.
// ============================================================

import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../MCStoreProvider';
import { useMCDispatch, useMCState } from '../useMCStore';
import { initialState, mcReducer } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import type { MCAction, MCSettings, MCState } from '../../types';

const at = (h: number, m: number) => new Date(2026, 10, 16, h, m, 0, 0).toISOString();
const save = (settings: Partial<MCSettings>, timestamp: string): MCAction => ({ type: 'SET_SETTINGS', settings, timestamp });

describe('a second save at the same instant', () => {
    it('that covers another window writes its own line', () => {
        const first = mcReducer(initialState, save({ morningStartsAt: '06:59' }, at(7, 0)));
        expect(createLogEntry(save({ morningStartsAt: '06:50' }, at(7, 0)), first)?.message)
            .toMatch(/^Morning mission not started: its 06:50 window/);
    });

    it('that covers nothing writes no "not started" line, only its start change', () => {
        const first = mcReducer(initialState, save({ morningStartsAt: '06:59' }, at(7, 0)));
        expect(createLogEntry(save({ morningStartsAt: '07:30' }, at(7, 0)), first)?.message).toBe('Morning start changed 06:59 → 07:30');
    });

    it('that covers again the window an earlier one covered writes its line (06:59, 07:01, 06:59 at 07:00)', () => {
        // The third save opens 06:59 again; the window keeps its earliest save, here the identical
        // {07:00, 06:59}, so a line that looked for a new entry by content found none (Codex).
        const first = mcReducer(initialState, save({ morningStartsAt: '06:59' }, at(7, 0)));
        const ahead = mcReducer(first, save({ morningStartsAt: '07:01' }, at(7, 0)));
        expect(createLogEntry(save({ morningStartsAt: '07:01' }, at(7, 0)), first)?.message, 'precondition: 07:01 is still ahead').toBe('Morning start changed 06:59 → 07:01');
        const back = save({ morningStartsAt: '06:59' }, at(7, 0));
        expect(mcReducer(ahead, back).missions[0].savedIntoWindows, 'precondition: the entry is unchanged').toEqual(first.missions[0].savedIntoWindows);
        expect(createLogEntry(back, ahead)?.message).toMatch(/^Morning mission not started: its 06:59 window/);
    });
});

describe('through the store', () => {
    let live: MCState = initialState;
    let dispatch: (a: MCAction) => void = () => {};
    function Probe() {
        live = useMCState();
        dispatch = useMCDispatch();
        return null;
    }

    beforeEach(() => { localStorage.clear(); render(<MCStoreProvider><Probe /></MCStoreProvider>); });
    afterEach(() => { localStorage.clear(); });

    it('two saves in the same millisecond, each into a window: two lines', () => {
        act(() => { dispatch(save({ morningStartsAt: '06:59' }, at(7, 0))); });
        act(() => { dispatch(save({ morningStartsAt: '06:50' }, at(7, 0))); });
        expect(live.activityLogs.filter(l => /mission not started/.test(l.message)).map(l => l.message.slice(0, 40)))
            .toEqual(['Morning mission not started: its 06:50 w', 'Morning mission not started: its 06:59 w']);
    });
});
