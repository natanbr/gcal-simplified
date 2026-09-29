// ============================================================
// The phone payload never carries the pairing
// ------------------------------------------------------------
// The pairing key and room id also live in Mission Control's own state
// (settings.remoteKey / settings.remoteRoomId, copied from settings:get at
// mount so the Remote tab can draw the QR code). The broadcast payload is an
// explicit projection, and the channel is public: one careless spread of
// `settings` would put the key back on the wire inside every signed
// state-update, where a signature hides nothing.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRemoteSync } from './useRemoteSync';
import { initialState } from './mcReducer';
import type { MCState } from '../types';

const ROOM = '5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c7a90';
const KEY = 'q7Lk2mPz9XwR4tYb8NcV';
const invoke = vi.fn<NonNullable<Window['ipcRenderer']>['invoke']>(() => Promise.resolve(undefined));

const paired: MCState = { ...initialState, settings: { ...initialState.settings, remoteRoomId: ROOM, remoteKey: KEY } };

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
    });
});
