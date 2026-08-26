// ============================================================
// Mission Control — durable audit trail bridge
// ------------------------------------------------------------
// This bridge is the answer to "the logs aren't accurate enough to tell me what
// happened". If it double-writes, drops entries, or loses the tail on quit, the
// record it produces is worse than useless — it is misleading.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuditTrail } from './useAuditTrail';
import { initialState } from './mcReducer';
import type { MCState, ActivityLogEntry } from '../types';

const invoke = vi.fn();

function stubIpc() {
    (window as unknown as { ipcRenderer: unknown }).ipcRenderer = {
        invoke,
        on: vi.fn(() => vi.fn()),
    };
}

let seq = 0;
function entry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
    return {
        id: `log-${seq++}`,
        timestamp: new Date('2026-08-19T10:00:00.000Z').toISOString(),
        icon: '🪙',
        message: 'token added',
        type: 'manual',
        ...overrides,
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

describe('useAuditTrail', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        invoke.mockReset();
        invoke.mockResolvedValue(undefined);
        stubIpc();
    });

    afterEach(() => {
        vi.useRealTimers();
        delete (window as unknown as { ipcRenderer?: unknown }).ipcRenderer;
    });

    it('mirrors a log entry to disk', async () => {
        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });

        rerender({ s: stateWith([entry({ message: 'first event' })]) });
        await vi.advanceTimersByTimeAsync(1100);

        expect(appended().some(e => e.msg === 'first event')).toBe(true);
    });

    it('never writes the same entry twice across re-renders', async () => {
        const log = entry({ message: 'only once' });
        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });

        rerender({ s: stateWith([log]) });
        await vi.advanceTimersByTimeAsync(1100);
        // Same logs array contents, new object identity — a normal re-render.
        rerender({ s: stateWith([log]) });
        rerender({ s: stateWith([log]) });
        await vi.advanceTimersByTimeAsync(1100);

        expect(appended().filter(e => e.msg === 'only once')).toHaveLength(1);
    });

    it('never re-mirrors entries restored from a previous session (restart)', async () => {
        // A populated ring at MOUNT means localStorage restored it — the
        // previous session already mirrored those entries. Re-appending them
        // every launch duplicated the durable trail once per restart.
        const restored = [entry({ message: 'yesterday b' }), entry({ message: 'yesterday a' })];
        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith(restored) },
        });
        await vi.advanceTimersByTimeAsync(1100);

        expect(appended().filter(e => e.ev !== 'SESSION_START')).toHaveLength(0);

        // A genuinely new entry after mount is still mirrored — exactly once.
        rerender({ s: stateWith([entry({ message: 'fresh today' }), ...restored]) });
        await vi.advanceTimersByTimeAsync(1100);

        const nonSession = appended().filter(e => e.ev !== 'SESSION_START');
        expect(nonSession.map(e => e.msg)).toEqual(['fresh today']);
    });

    it('chunks an oversized flush to the main-side 100-entry append cap', async () => {
        // electron/audit-log.ts truncates any batch past 100 entries; a single
        // >100 flush silently lost its newest entries.
        const many = Array.from({ length: 150 }, (_, i) => entry({ message: `burst ${i}` }));
        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });

        rerender({ s: stateWith(many) });
        await vi.advanceTimersByTimeAsync(1100);

        const batches = invoke.mock.calls
            .filter(([channel, batch]) => channel === 'audit:append' &&
                (batch as Array<{ ev: string }>).every(e => e.ev !== 'SESSION_START'))
            .map(([, batch]) => batch as Array<{ msg: string }>);
        expect(batches.every(b => b.length <= 100)).toBe(true);
        expect(batches.flat()).toHaveLength(150);
    });

    it('writes oldest-first so the file reads chronologically', async () => {
        // activityLogs is newest-first in the store; the file must not be.
        const older = entry({ message: 'older', timestamp: '2026-08-19T10:00:00.000Z' });
        const newer = entry({ message: 'newer', timestamp: '2026-08-19T11:00:00.000Z' });

        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });
        rerender({ s: stateWith([newer, older]) });
        await vi.advanceTimersByTimeAsync(1100);

        const written = appended().filter(e => e.msg === 'older' || e.msg === 'newer');
        expect(written.map(e => e.msg)).toEqual(['older', 'newer']);
    });

    it('carries attribution and balances into the record', async () => {
        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });

        rerender({
            s: stateWith([entry({
                message: 'mood token earned',
                source: 'auto',
                delta: 2,
                bankTokens: 7,
                gameTokens: 3,
                totalTokens: 9,
            })]),
        });
        await vi.advanceTimersByTimeAsync(1100);

        const record = appended().find(e => e.msg === 'mood token earned');
        expect(record).toMatchObject({ src: 'auto', d: 2, bank: 7, game: 3, total: 9 });
    });

    it('falls back to the legacy isRemote flag when source is absent', async () => {
        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });

        rerender({ s: stateWith([entry({ message: 'from phone', isRemote: true })]) });
        await vi.advanceTimersByTimeAsync(1100);

        expect(appended().find(e => e.msg === 'from phone')?.src).toBe('remote');
    });

    it('strips markdown emphasis so the file stays plain text', async () => {
        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });

        rerender({ s: stateWith([entry({ message: '1 token added to **🎮 Game**' })]) });
        await vi.advanceTimersByTimeAsync(1100);

        expect(appended().some(e => e.msg === '1 token added to 🎮 Game')).toBe(true);
    });

    it('records a session marker so restarts are visible in the trail', async () => {
        renderHook(() => useAuditTrail(stateWith([])));
        await vi.advanceTimersByTimeAsync(1100);

        expect(appended().some(e => e.ev === 'SESSION_START')).toBe(true);
    });

    it('batches a burst into a single write', async () => {
        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });

        // Three state updates inside the debounce window.
        rerender({ s: stateWith([entry({ message: 'a' })]) });
        rerender({ s: stateWith([entry({ message: 'b' }), entry({ message: 'a' })]) });
        rerender({ s: stateWith([entry({ message: 'c' }), entry({ message: 'b' }), entry({ message: 'a' })]) });
        await vi.advanceTimersByTimeAsync(1100);

        const logWrites = invoke.mock.calls.filter(
            ([channel, batch]) => channel === 'audit:append' &&
                (batch as Array<{ ev: string }>).every(e => e.ev !== 'SESSION_START')
        );
        expect(logWrites).toHaveLength(1);
    });

    it('flushes pending entries on unmount instead of losing them', async () => {
        const { rerender, unmount } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });

        rerender({ s: stateWith([entry({ message: 'last gasp' })]) });
        // Unmount BEFORE the debounce fires — a quit mid-window.
        unmount();

        expect(appended().some(e => e.msg === 'last gasp')).toBe(true);
    });

    it('does nothing when there is no IPC bridge (browser dev mode)', async () => {
        delete (window as unknown as { ipcRenderer?: unknown }).ipcRenderer;

        expect(() => {
            renderHook(() => useAuditTrail(stateWith([entry()])));
        }).not.toThrow();
    });

    it('survives an IPC failure without breaking the app', async () => {
        invoke.mockRejectedValue(new Error('disk full'));

        const { rerender } = renderHook(({ s }) => useAuditTrail(s), {
            initialProps: { s: stateWith([]) },
        });

        rerender({ s: stateWith([entry({ message: 'doomed' })]) });
        await expect(vi.advanceTimersByTimeAsync(1100)).resolves.not.toThrow();
    });
});
