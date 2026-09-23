// ============================================================
// The phone must not be told a lapsed suspension is still running
// ------------------------------------------------------------
// The remote payload copied `status` and `suspendedUntil` verbatim, so after a
// suspension ran out the phone kept receiving `status: 'suspended'` — the same
// never-lifting bug as the desktop card, one hop further away. The payload is
// an outbound projection: it sends what is in force at broadcast time. Every
// broadcast (including the one a reconnecting phone requests) re-derives it.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRemoteSync } from './useRemoteSync';
import { initialState } from './mcReducer';
import type { MCState, PrivilegeCard } from '../types';

const HOUR = 60 * 60 * 1000;
const invoke = vi.fn<NonNullable<Window['ipcRenderer']>['invoke']>(() => Promise.resolve(undefined));

function withKnife(status: PrivilegeCard['status'], suspendedUntil: string | null): MCState {
    return {
        ...initialState,
        privileges: initialState.privileges.map(p => (p.id === 'knife' ? { ...p, status, suspendedUntil } : p)),
    };
}

/** The privileges array from the most recent `remote:sync-state` broadcast. */
function broadcastPrivileges(): Array<Pick<PrivilegeCard, 'id' | 'status' | 'suspendedUntil'>> {
    const call = invoke.mock.calls.filter(c => c[0] === 'remote:sync-state').at(-1);
    expect(call, 'no remote:sync-state broadcast happened').toBeDefined();
    const payload = call![1] as { privileges: Array<Pick<PrivilegeCard, 'id' | 'status' | 'suspendedUntil'>> };
    return payload.privileges;
}

const knifeIn = (privs: ReturnType<typeof broadcastPrivileges>) => privs.find(p => p.id === 'knife');

beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockClear();
    window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
});

afterEach(() => {
    vi.useRealTimers();
    delete window.ipcRenderer;
});

describe('remote payload — privileges', () => {
    it('sends an expired suspension as active with no end time', () => {
        renderHook(() => useRemoteSync(withKnife('suspended', new Date(Date.now() - HOUR).toISOString())));
        vi.advanceTimersByTime(1_000);
        expect(knifeIn(broadcastPrivileges())).toMatchObject({ status: 'active', suspendedUntil: null });
    });

    it('sends a running suspension unchanged (negative)', () => {
        const until = new Date(Date.now() + HOUR).toISOString();
        renderHook(() => useRemoteSync(withKnife('suspended', until)));
        vi.advanceTimersByTime(1_000);
        expect(knifeIn(broadcastPrivileges())).toMatchObject({ status: 'suspended', suspendedUntil: until });
    });
});
