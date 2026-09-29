// ============================================================
// The one-time activity-log line for an automatic pairing renewal.
// ------------------------------------------------------------
// A hand-built ADD_LOG (it describes no action, so createLogEntry never
// derives it), dispatched from the provider's existing mount-time settings:get.
// Its id is derived from the renewal time, so a restart — or the second run of
// a StrictMode effect — cannot add it twice. settings:get throws while the
// settings file cannot be read: then there is no line and no unhandled rejection.
// ============================================================

import { render, screen, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { pendingRenewalAt, pairingRenewedLogEntry, PAIRING_RENEWED_LOG_MESSAGE } from './pairingRenewal';
import { MCStoreProvider } from './MCStoreProvider';
import { useMCState, STORAGE_KEY } from './useMCStore';
import { initialState } from './mcReducer';
import type { ActivityLogEntry } from '../types';

const RENEWED_AT = '2026-09-28T09:00:00.000Z';
const LOG_ID = `pairing-renewed-${RENEWED_AT}`;
let settings: unknown = {};
let settingsError: Error | null = null;
const invoke = vi.fn<NonNullable<Window['ipcRenderer']>['invoke']>((channel: string) => {
    if (channel !== 'settings:get') return Promise.resolve(undefined);
    return settingsError ? Promise.reject(settingsError) : Promise.resolve(settings);
});

function LogIds() {
    const { activityLogs } = useMCState();
    return <output data-testid="ids">{activityLogs.map(l => l.id).join(',')}</output>;
}

const renewalLines = () => screen.getByTestId('ids').textContent!.split(',').filter(id => id === LOG_ID).length;

async function mountProvider() {
    render(<MCStoreProvider><LogIds /></MCStoreProvider>);
    await act(async () => { await Promise.resolve(); });
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
        expect(pairingRenewedLogEntry({ remotePairingRenewedAt: RENEWED_AT }, [])).toEqual({
            id: LOG_ID,
            timestamp: RENEWED_AT,
            icon: '📱',
            message: PAIRING_RENEWED_LOG_MESSAGE,
            type: 'system',
            colorKey: 'system',
            source: 'system',
        });
    });

    it('returns null when an entry with that id already exists, or nothing is pending', () => {
        const existing: ActivityLogEntry = { id: LOG_ID, timestamp: RENEWED_AT, icon: '📱', message: 'x', type: 'system', source: 'system' };
        expect(pairingRenewedLogEntry({ remotePairingRenewedAt: RENEWED_AT }, [existing])).toBeNull();
        expect(pairingRenewedLogEntry({}, [])).toBeNull();
    });
});

describe('MCStoreProvider — the renewal line on the activity log', () => {
    it('is added once at mount while a renewal is pending', async () => {
        settings = { remoteRoomId: 'r', remoteKey: 'k', remotePairingRenewedAt: RENEWED_AT };
        await mountProvider();
        expect(renewalLines()).toBe(1);
    });

    it('is not added again when the log already has it (a restart)', async () => {
        settings = { remoteRoomId: 'r', remoteKey: 'k', remotePairingRenewedAt: RENEWED_AT };
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
        for (const value of [{ remoteRoomId: 'r', remoteKey: 'k' }, undefined]) {
            settings = value;
            await mountProvider();
            expect(renewalLines()).toBe(0);
            cleanup();
        }
    });
});
