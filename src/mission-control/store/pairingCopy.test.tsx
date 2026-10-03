// ============================================================
// Mission Control's state keeps no copy of the remote pairing.
// ------------------------------------------------------------
// The pairing (room id and key) belongs to the main process: config.json,
// written by electron/remote-pairing.ts. Up to v0.0.43 Mission Control also
// kept a copy in mc-state-v5.settings, set from settings:get at every start, in
// plain localStorage. On a profile whose renewal could not be saved, or one
// that never started v0.0.43 with a readable settings file, that copy was the
// leaked v1 key. Nothing read it: the Remote tab draws its QR code from
// settings:get, and the phone payload is a projection without settings.
// Hydration now drops a saved copy, so the first save after a load writes a
// blob without it, and nothing puts it back: not the start-up read, not a
// renewal, not "Regenerate Keys", not a Settings save, not a restart.
// Values are checked as well as field names: a copy under another name would
// still carry the key.
// ============================================================

import React from 'react';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { MCStoreProvider } from './MCStoreProvider';
import { useMCState, STORAGE_KEY, loadPersistedState } from './useMCStore';
import { initialState } from './mcReducer';
import { MCSettingsOverlay } from '../components/MCSettingsOverlay';
import { REPAIRED_NOTICE } from '../components/RemotePairingPanel';
import { buildPairingUrl } from '../utils/pairingUrl';

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                React.forwardRef(({ children: c, ...props }: any, ref: any) => React.createElement(prop, { ...props, ref }, c)),
        }),
    };
});

const LEGACY_ROOM = '0c7e5a1b-9d2f-4e3a-8b6c-legacy-room';
const LEGACY_KEY = 'legacyKeyQ7Lk2mPz9XwR4tYb';
const LOGGED_AT = '2026-09-28T09:00:00.000Z';
const LATER = '2026-10-03T07:30:00.000Z';
const V2 = { remoteRoomId: 'room-v2', remoteKey: 'key-v2', remotePairingVersion: 2 };
const PAIRING_FIELDS = ['remoteRoomId', 'remoteKey'];

let settings: unknown = V2;
let settingsError: Error | null = null;
let regenerate: () => Promise<unknown> = () => Promise.resolve({ ok: true, roomId: 'room-new', remoteKey: 'key-new' });
const invoke = vi.fn<NonNullable<Window['ipcRenderer']>['invoke']>((channel: string) => {
    if (channel === 'remote:regenerate') return regenerate();
    if (channel !== 'settings:get') return Promise.resolve(undefined);
    return settingsError ? Promise.reject(settingsError) : Promise.resolve(settings);
});

/** mc-state-v5 as v0.0.43 saved it on a paired profile: the settings carry a copy of the pairing. */
function saveV0043State(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...initialState,
        _migrationVersion: 1,
        bankCount: 7,
        settings: {
            ...initialState.settings,
            morningStartsAt: '06:30',
            eveningDurationMins: 45,
            creamTaskEnabled: true,
            autoReturnMins: 10,
            remoteRoomId: LEGACY_ROOM,
            remoteKey: LEGACY_KEY,
            remotePairingRenewalLogged: LOGGED_AT,
        },
    }));
}

const saved = (): string => localStorage.getItem(STORAGE_KEY) ?? '';

/** The saved blob holds no pairing field and none of the given pairing values. */
function expectNoPairingSaved(values: string[]): void {
    const blob = saved();
    expect(blob, 'nothing was saved').not.toBe('');
    for (const field of PAIRING_FIELDS) expect(blob, `mc-state-v5 still names ${field}`).not.toContain(field);
    for (const value of values) expect(blob, 'mc-state-v5 still holds a pairing value').not.toContain(value);
}

function RenewalLines() {
    const { activityLogs } = useMCState();
    return <output data-testid="ids">{activityLogs.map(l => l.id).join(',')}</output>;
}
const linesFor = (renewedAt: string) => screen.getByTestId('ids').textContent!.split(',').filter(id => id === `pairing-renewed-${renewedAt}`).length;

/** Let settings:get resolve and React commit what it set. */
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
/** Let the provider's debounced (500 ms) localStorage write happen. */
const persist = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 600)); });
const shownUrl = () => (screen.queryByTitle('Click to copy URL') as HTMLInputElement | null)?.value ?? null;

async function start(children: React.ReactNode = <RenewalLines />) {
    render(<MCStoreProvider>{children}</MCStoreProvider>);
    await settle();
}

async function openRemoteTab() {
    await start(<MCSettingsOverlay open onClose={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByText('📱 Remote')); });
    await settle();
}

beforeEach(() => {
    invoke.mockClear();
    settings = V2;
    settingsError = null;
    regenerate = () => Promise.resolve({ ok: true, roomId: 'room-new', remoteKey: 'key-new' });
    localStorage.clear();
    window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
});

afterEach(() => {
    cleanup();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('hydration drops the pairing copy v0.0.43 saved', () => {
    it('loads the settings without the room and key, and keeps every other setting and the renewal marker', () => {
        saveV0043State();
        const state = loadPersistedState();
        for (const field of PAIRING_FIELDS) expect(state.settings).not.toHaveProperty(field);
        expect(JSON.stringify(state)).not.toContain(LEGACY_KEY);
        expect(JSON.stringify(state)).not.toContain(LEGACY_ROOM);
        expect(state.settings).toMatchObject({
            morningStartsAt: '06:30', eveningDurationMins: 45, creamTaskEnabled: true, autoReturnMins: 10,
            remotePairingRenewalLogged: LOGGED_AT,
        });
        expect(state.bankCount).toBe(7);
    });

    it.each<[string, () => void]>([
        ['settings:get hands out a v2 pairing', () => { settings = V2; }],
        ['settings:get rejects (the settings file is locked)', () => { settingsError = new Error('busy'); }],
        ['settings:get hands out no v2 pairing', () => { settings = { calendarIds: [] }; }],
        ['settings:get hands out an unmarked (v1) pairing', () => { settings = { remoteRoomId: 'room-v1', remoteKey: 'key-v1' }; }],
        ['there is no Electron bridge', () => { delete window.ipcRenderer; }],
    ])('the first save after a load writes no pairing when %s', async (_label, arrange) => {
        saveV0043State();
        arrange();
        await start();
        await persist();
        expectNoPairingSaved([LEGACY_ROOM, LEGACY_KEY, V2.remoteRoomId, V2.remoteKey, 'room-v1', 'key-v1']);
    });
});

describe('nothing puts the pairing back into Mission Control state', () => {
    it('a renewal logs its line and saves its marker, but no pairing; nor does the restart after it', async () => {
        saveV0043State();
        settings = { ...V2, remotePairingRenewedAt: LATER };
        await start();
        expect(linesFor(LATER)).toBe(1);
        await persist();
        expectNoPairingSaved([LEGACY_KEY, V2.remoteRoomId, V2.remoteKey]);
        expect(JSON.parse(saved()).settings.remotePairingRenewalLogged).toBe(LATER);

        cleanup(); // quit, then start again with the renewal still unanswered
        await start();
        expect(linesFor(LATER), 'the renewal line was logged twice').toBe(1);
        await persist();
        expectNoPairingSaved([LEGACY_KEY, V2.remoteRoomId, V2.remoteKey]);
    });

    it('"Regenerate Keys" shows the new pairing but never saves it; nor does a Settings save or a restart', async () => {
        saveV0043State();
        await openRemoteTab();
        await act(async () => { fireEvent.click(screen.getByText(/Regenerate Keys/)); });
        expect(shownUrl()).toBe(buildPairingUrl('room-new', 'key-new'));

        await act(async () => { fireEvent.click(screen.getByText(/Save Settings/)); });
        await persist();
        expectNoPairingSaved([LEGACY_ROOM, LEGACY_KEY, V2.remoteKey, 'room-new', 'key-new']);
        expect(JSON.parse(saved()).settings).toMatchObject({ morningStartsAt: '06:30', autoReturnMins: 10 });

        cleanup();
        await start();
        await persist();
        expectNoPairingSaved([LEGACY_ROOM, LEGACY_KEY, V2.remoteKey, 'room-new', 'key-new']);
    });
});

describe('the Remote tab still works from settings:get alone', () => {
    it('draws the v2 pairing and the re-pairing notice on a profile that saved the old copy', async () => {
        saveV0043State();
        settings = { ...V2, remotePairingRenewedAt: LATER };
        await openRemoteTab();
        expect(shownUrl()).toBe(buildPairingUrl('room-v2', 'key-v2'));
        expect(screen.getByText(REPAIRED_NOTICE)).toBeInTheDocument();
        expect(document.body.innerHTML).not.toContain(LEGACY_KEY);
    });
});
