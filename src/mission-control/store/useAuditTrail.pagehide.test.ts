// ============================================================
// The audit trail sends its queued lines when the page goes away (2026-11-08)
// ------------------------------------------------------------
// Lines are sent to electron/audit-log.ts 1 s after the last one. Closing the
// window, or a quit (the auto-updater's quitAndInstall included), fires
// pagehide but unmounts nothing, so the unmount flush never ran there: a line
// logged in the last second before a quit never reached the file.
// e2e/mc-save-on-close.spec.ts is the real-Electron half.
// ============================================================

import { createElement, useEffect, useRef, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { useAuditTrail } from './useAuditTrail';
import { initialState } from './mcReducer';
import type { MCState, ActivityLogEntry } from '../types';

const invoke = vi.fn();

let seq = 0;
function entry(message: string): ActivityLogEntry {
    return {
        id: `log-${seq++}`,
        timestamp: new Date('2026-11-08T10:00:00.000Z').toISOString(),
        icon: '🪙',
        message,
        type: 'manual',
    };
}

function stateWith(logs: ActivityLogEntry[]): MCState {
    return { ...initialState, activityLogs: logs };
}

/** All entries written by `audit:append` calls, flattened. */
function appended(): Array<Record<string, unknown>> {
    return invoke.mock.calls
        .filter(([channel]) => channel === 'audit:append')
        .flatMap(([, batch]) => batch as Array<Record<string, unknown>>);
}

const sentWith = (msg: string) => appended().filter(e => e.msg === msg);
const pageHide = () => window.dispatchEvent(new Event('pagehide'));

/** Mount the bridge with an empty log, as a launch does. */
function mount() {
    return renderHook(({ s }) => useAuditTrail(s), { initialProps: { s: stateWith([]) } });
}

function AuditHost({ state, children }: { state: MCState; children?: ReactNode }) {
    useAuditTrail(state);
    return children;
}

/**
 * Fires pagehide from its own passive effect when a line is added. A child's
 * effects run before its parent's, so this is a pagehide that lands after React
 * committed the line and before the bridge's effects ran: a line from a timer,
 * IPC or the phone, then a quit in the same frame.
 */
function HideOnNewLine({ lines }: { lines: number }) {
    const first = useRef(lines);
    useEffect(() => {
        if (lines !== first.current) window.dispatchEvent(new Event('pagehide'));
    }, [lines]);
    return null;
}

const hostWith = (s: MCState) =>
    createElement(AuditHost, { state: s }, createElement(HideOnNewLine, { lines: s.activityLogs.length }));

describe('useAuditTrail when the page goes away (window closed, app quit)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        invoke.mockReset();
        invoke.mockResolvedValue(undefined);
        window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
    });

    afterEach(() => {
        vi.useRealTimers();
        delete window.ipcRenderer;
    });

    it('sends a queued entry at once, before the debounce would have, and drops the debounce', async () => {
        const { rerender } = mount();
        await vi.advanceTimersByTimeAsync(1100); // the session marker is out of the way

        rerender({ s: stateWith([entry('closed at once')]) });
        await vi.advanceTimersByTimeAsync(200);
        expect(sentWith('closed at once'), 'precondition: the debounce has not sent it yet').toHaveLength(0);
        pageHide();

        expect(sentWith('closed at once')).toHaveLength(1);
        expect(vi.getTimerCount(), 'the debounce timer was cleared').toBe(0);
    });

    it('sends a line when the pagehide lands before the bridge\'s effects ran (the frame after a commit)', async () => {
        const { rerender } = render(hostWith(stateWith([])));
        await vi.advanceTimersByTimeAsync(1100);

        act(() => { rerender(hostWith(stateWith([entry('same frame')]))); });

        expect(sentWith('same frame')).toHaveLength(1);
    });

    it('sends nothing when nothing is queued (negative)', async () => {
        const { rerender } = mount();
        rerender({ s: stateWith([entry('already sent')]) });
        await vi.advanceTimersByTimeAsync(1100);
        const callsBefore = invoke.mock.calls.length;

        pageHide();

        expect(invoke.mock.calls.length).toBe(callsBefore);
    });

    it('does not send the same entry again when the debounce would have fired (negative)', async () => {
        const { rerender } = mount();
        rerender({ s: stateWith([entry('exactly once')]) });
        pageHide();
        expect(sentWith('exactly once')).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(2000);

        expect(sentWith('exactly once')).toHaveLength(1);
    });

    it('a failed send at pagehide leaves no unhandled rejection (negative)', async () => {
        vi.useRealTimers(); // unhandledRejection fires after the microtask queue drains: wait one real macrotask
        // A plain function, not vi.fn: vitest handles every promise a mock returns (to record how it settled),
        // so a rejection from a mock is never unhandled and the missing .catch would pass.
        const tried: unknown[][] = [];
        window.ipcRenderer = {
            invoke: (...args: unknown[]) => { tried.push(args); return Promise.reject(new Error('disk full')); },
            on: () => () => {},
        };
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        try {
            const { rerender } = mount();
            rerender({ s: stateWith([entry('doomed at quit')]) });
            pageHide();
            await new Promise(resolve => setTimeout(resolve, 0));
        } finally {
            process.off('unhandledRejection', unhandled);
        }

        expect(tried.filter(([channel]) => channel === 'audit:append'), 'the send was tried').toHaveLength(1);
        expect(unhandled).not.toHaveBeenCalled();
    });

    it('keeps the 100-entry chunks on the pagehide send too', async () => {
        const many = Array.from({ length: 150 }, (_, i) => entry(`quit burst ${i}`));
        const { rerender } = mount();
        await vi.advanceTimersByTimeAsync(1100);
        const callsBefore = invoke.mock.calls.length;

        rerender({ s: stateWith(many) });
        pageHide();

        const batches = invoke.mock.calls.slice(callsBefore)
            .filter(([channel]) => channel === 'audit:append')
            .map(([, batch]) => batch as unknown[]);
        expect(batches.map(b => b.length)).toEqual([100, 50]);
    });

    it('stops listening when it unmounts (negative)', () => {
        const add = vi.spyOn(window, 'addEventListener');
        const remove = vi.spyOn(window, 'removeEventListener');
        const { unmount } = mount();
        const added = add.mock.calls.filter(([type]) => type === 'pagehide').map(([, fn]) => fn);
        expect(added).toHaveLength(1);

        unmount();

        const removed = remove.mock.calls.filter(([type]) => type === 'pagehide').map(([, fn]) => fn);
        expect(removed).toEqual(added);
        add.mockRestore();
        remove.mockRestore();
    });

    it('debounces lines logged after a pagehide, and a second pagehide sends at once (lifecycle: the page came back)', async () => {
        const first = entry('before the hide');
        const second = entry('after it came back');
        const { rerender } = mount();
        rerender({ s: stateWith([first]) });
        pageHide();
        expect(sentWith('before the hide')).toHaveLength(1);

        rerender({ s: stateWith([second, first]) });
        await vi.advanceTimersByTimeAsync(500);
        expect(sentWith('after it came back'), 'sent before the debounce ran out').toHaveLength(0);
        await vi.advanceTimersByTimeAsync(600);
        expect(sentWith('after it came back')).toHaveLength(1);

        rerender({ s: stateWith([entry('at the second hide'), second, first]) });
        pageHide();
        expect(sentWith('at the second hide'), 'the second pagehide sent at once').toHaveLength(1);
        expect(sentWith('before the hide')).toHaveLength(1);
    });
});
