// ============================================================
// The one-time activity-log line for an automatic pairing renewal, and the
// pairing Mission Control state keeps from settings:get.
// ------------------------------------------------------------
// A hand-built ADD_LOG (it describes no action, so createLogEntry never
// derives it), dispatched from the provider's existing mount-time settings:get.
// "Already logged" is a marker in Mission Control state (settings
// .remotePairingRenewalLogged = the renewal time it logged), not a search of
// the 200-entry log: after CLEAR, or 200 newer lines, the search came up empty
// and the line came back at every start, into the audit trail too. The pairing
// itself never enters Mission Control state: pairingCopy.test.tsx.
// settings:get throws while the settings file cannot be read: then nothing
// changes and there is no unhandled rejection.
// ============================================================

import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { pendingRenewalAt, pairingRenewedLogEntry, renewalLoggedMarker, renewalToMark, PAIRING_RENEWED_LOG_MESSAGE } from './pairingRenewal';
import { MCStoreProvider } from './MCStoreProvider';
import { useMCState, useMCDispatch, STORAGE_KEY, loadPersistedState } from './useMCStore';
import { initialState } from './mcReducer';
import type { ActivityLogEntry } from '../types';

const RENEWED_AT = '2026-09-28T09:00:00.000Z';
const LATER = '2026-10-05T18:30:00.000Z';
const LOG_ID = `pairing-renewed-${RENEWED_AT}`;
const V2 = { remoteRoomId: 'room-v2', remoteKey: 'key-v2', remotePairingVersion: 2 };
let settings: unknown = {};
let settingsError: Error | null = null;
const invoke = vi.fn<NonNullable<Window['ipcRenderer']>['invoke']>((channel: string) => {
    if (channel !== 'settings:get') return Promise.resolve(undefined);
    return settingsError ? Promise.reject(settingsError) : Promise.resolve(settings);
});

function Probe() {
    const { activityLogs, settings: mc } = useMCState();
    const dispatch = useMCDispatch();
    return (
        <>
            <output data-testid="ids">{activityLogs.map(l => l.id).join(',')}</output>
            <output data-testid="marker">{mc.remotePairingRenewalLogged ?? '-'}</output>
            <button onClick={() => dispatch({ type: 'CLEAR_LOGS' })}>clear logs</button>
        </>
    );
}

const linesFor = (renewedAt: string) => screen.getByTestId('ids').textContent!.split(',').filter(id => id === `pairing-renewed-${renewedAt}`).length;
const renewalLines = () => linesFor(RENEWED_AT);
const marker = () => screen.getByTestId('marker').textContent;

async function mountProvider() {
    render(<MCStoreProvider><Probe /></MCStoreProvider>);
    await act(async () => { await Promise.resolve(); });
}

/** Let the provider's debounced (500 ms) localStorage write happen, then quit. */
async function persistAndQuit() {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 600)); });
    cleanup();
}

beforeEach(() => {
    invoke.mockClear();
    settingsError = null;
    localStorage.clear();
    window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
});

afterEach(() => {
    cleanup();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('pendingRenewalAt', () => {
    it('reads a valid ISO renewal time, and nothing else', () => {
        expect(pendingRenewalAt({ remotePairingRenewedAt: RENEWED_AT })).toBe(RENEWED_AT);
        for (const config of [undefined, null, 'x', {}, { remotePairingRenewedAt: 42 }, { remotePairingRenewedAt: '' }, { remotePairingRenewedAt: 'soon' }]) {
            expect(pendingRenewalAt(config)).toBeNull();
        }
    });
});

describe('pairingRenewedLogEntry', () => {
    it('builds an attributed system entry with a deterministic id', () => {
        expect(pairingRenewedLogEntry({ remotePairingRenewedAt: RENEWED_AT }, [], undefined)).toEqual({
            id: LOG_ID,
            timestamp: RENEWED_AT,
            icon: '📱',
            message: PAIRING_RENEWED_LOG_MESSAGE,
            type: 'system',
            colorKey: 'system',
            source: 'system',
        });
    });

    it('returns null when this renewal was already logged (the marker, or the line itself), or nothing is pending', () => {
        const existing: ActivityLogEntry = { id: LOG_ID, timestamp: RENEWED_AT, icon: '📱', message: 'x', type: 'system', source: 'system' };
        expect(pairingRenewedLogEntry({ remotePairingRenewedAt: RENEWED_AT }, [], RENEWED_AT)).toBeNull();
        expect(pairingRenewedLogEntry({ remotePairingRenewedAt: RENEWED_AT }, [existing], undefined)).toBeNull();
        expect(pairingRenewedLogEntry({}, [], undefined)).toBeNull();
        // A later renewal is a new line, whatever the marker says about the earlier one.
        expect(pairingRenewedLogEntry({ remotePairingRenewedAt: LATER }, [existing], RENEWED_AT)?.id).toBe(`pairing-renewed-${LATER}`);
    });
});

describe('renewalToMark', () => {
    it('is the pending renewal time until that time is the marker, and null with nothing pending', () => {
        expect(renewalToMark({ ...V2, remotePairingRenewedAt: RENEWED_AT }, undefined)).toBe(RENEWED_AT);
        expect(renewalToMark({ remotePairingRenewedAt: LATER }, RENEWED_AT)).toBe(LATER);
        expect(renewalToMark({ remotePairingRenewedAt: RENEWED_AT }, RENEWED_AT)).toBeNull();
        for (const config of [V2, {}, { remotePairingRenewedAt: 'soon' }, null]) {
            expect(renewalToMark(config, undefined), JSON.stringify(config)).toBeNull();
        }
    });
});

describe('the "already logged" marker in mc-state-v5', () => {
    it('hydrates a valid renewal time and reads anything else as "not logged"', () => {
        expect(renewalLoggedMarker(RENEWED_AT)).toBe(RENEWED_AT);
        for (const garbage of [42, {}, [], null, '', 'soon', true]) {
            expect(renewalLoggedMarker(garbage), JSON.stringify(garbage)).toBeUndefined();
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialState, _migrationVersion: 1, settings: { ...initialState.settings, remotePairingRenewalLogged: garbage } }));
            expect(loadPersistedState().settings).not.toHaveProperty('remotePairingRenewalLogged');
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialState, _migrationVersion: 1, settings: { ...initialState.settings, remotePairingRenewalLogged: RENEWED_AT } }));
        expect(loadPersistedState().settings.remotePairingRenewalLogged).toBe(RENEWED_AT);
    });
});

describe('MCStoreProvider — the renewal line on the activity log', () => {
    it('is added once at mount while a renewal is pending, and marked as logged', async () => {
        settings = { ...V2, remotePairingRenewedAt: RENEWED_AT };
        await mountProvider();
        expect(renewalLines()).toBe(1);
        expect(marker()).toBe(RENEWED_AT);
    });

    it('is not added again after CLEAR and a restart; a later renewal is added exactly once', async () => {
        settings = { ...V2, remotePairingRenewedAt: RENEWED_AT };
        await mountProvider();
        expect(renewalLines()).toBe(1);
        await act(async () => { fireEvent.click(screen.getByText('clear logs')); });
        expect(renewalLines()).toBe(0);
        await persistAndQuit();

        await mountProvider(); // restart, the renewal still unanswered
        expect(renewalLines(), 'the line came back after CLEAR').toBe(0);
        await persistAndQuit();

        settings = { ...V2, remotePairingRenewedAt: LATER };
        await mountProvider();
        expect(linesFor(LATER)).toBe(1);
        await persistAndQuit();
        await mountProvider();
        expect(linesFor(LATER), 'the later renewal was logged twice').toBe(1);
    });

    it('is logged when the persisted marker is garbage (it reads as "not logged")', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialState, _migrationVersion: 1, settings: { ...initialState.settings, remotePairingRenewalLogged: 42 } }));
        settings = { ...V2, remotePairingRenewedAt: RENEWED_AT };
        await mountProvider();
        expect(renewalLines()).toBe(1);
    });

    it('is not added again when the log already has it (a restart)', async () => {
        settings = { ...V2, remotePairingRenewedAt: RENEWED_AT };
        const existing: ActivityLogEntry = { id: LOG_ID, timestamp: RENEWED_AT, icon: '📱', message: PAIRING_RENEWED_LOG_MESSAGE, type: 'system', source: 'system' };
        const other: ActivityLogEntry = { id: 'later', timestamp: RENEWED_AT, icon: '🪙', message: 'a later line', type: 'manual', source: 'local' };
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialState, _migrationVersion: 1, activityLogs: [other, existing] }));
        await mountProvider();
        expect(renewalLines()).toBe(1);
    });

    it('adds nothing, and leaves no unhandled rejection, when settings:get rejects (the settings file is locked)', async () => {
        settingsError = new Error('Settings could not be loaded: the settings file is in use by another program (antivirus or a backup). Try again in a moment.');
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        try {
            await mountProvider();
            // unhandledRejection fires after the microtask queue drains: wait one macrotask.
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
        } finally {
            process.off('unhandledRejection', unhandled);
        }
        expect(invoke).toHaveBeenCalledWith('settings:get');
        expect(renewalLines()).toBe(0);
        expect(unhandled).not.toHaveBeenCalled();
    });

    it('adds nothing, and does not throw, when nothing is pending or settings:get returns nothing', async () => {
        for (const value of [V2, undefined]) {
            settings = value;
            await mountProvider();
            expect(renewalLines()).toBe(0);
            expect(marker()).toBe('-');
            cleanup();
        }
    });
});
