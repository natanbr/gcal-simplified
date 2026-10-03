// ============================================================
// The phone payload never carries the pairing
// ------------------------------------------------------------
// Mission Control's state no longer keeps the pairing (hydration drops the copy
// v0.0.43 and earlier saved in settings: pairingCopy.test.tsx). This still runs
// the broadcast on a state that holds one, because the payload must be an
// explicit projection on its own: the channel is public, and one careless
// spread of `settings` would put whatever they hold on the wire inside every
// signed state-update, where a signature hides nothing. The same goes for the
// renewal-logged marker (settings.remotePairingRenewalLogged): it is
// bookkeeping of this machine, not state the phone draws.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRemoteSync } from './useRemoteSync';
import { initialState } from './mcReducer';
import type { MCState } from '../types';

const ROOM = '5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c7a90';
const KEY = 'q7Lk2mPz9XwR4tYb8NcV';
const invoke = vi.fn<NonNullable<Window['ipcRenderer']>['invoke']>(() => Promise.resolve(undefined));

const LOGGED_MARKER = '2026-09-28T09:00:00.000Z';
/** The copy an old build saved, as it would sit in the settings if anything ever kept it again. */
const oldPairingCopy = { remoteRoomId: ROOM, remoteKey: KEY };
const paired: MCState = { ...initialState, settings: { ...initialState.settings, ...oldPairingCopy, remotePairingRenewalLogged: LOGGED_MARKER } };

beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockClear();
    window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
});

afterEach(() => {
    vi.useRealTimers();
    delete window.ipcRenderer;
});

describe('remote payload — the pairing', () => {
    it('contains neither the pairing key nor the room id', () => {
        renderHook(() => useRemoteSync(paired));
        vi.advanceTimersByTime(1_000);

        const broadcasts = invoke.mock.calls.filter(([channel]) => channel === 'remote:sync-state');
        expect(broadcasts, 'no remote:sync-state broadcast happened').toHaveLength(1);
        const payload = JSON.stringify(broadcasts[0][1]);
        expect(payload).not.toContain(KEY);
        expect(payload).not.toContain(ROOM);
        expect(payload).not.toContain('remotePairingRenewalLogged');
        expect(payload).not.toContain(LOGGED_MARKER);
        expect(broadcasts[0][1]).not.toHaveProperty('settings');
    });
});
