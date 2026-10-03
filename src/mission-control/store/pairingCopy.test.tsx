// ============================================================
// Mission Control's state keeps no copy of the remote pairing.
// ------------------------------------------------------------
// The pairing (room id and key) belongs to the main process: config.json,
// written by electron/remote-pairing.ts. Up to v0.0.43 Mission Control also
// kept a copy of it in mc-state-v5.settings, in plain localStorage: a second
// copy of the current key, refreshed from settings:get at every start. v0.0.43
// cleared a copy when that read handed out no v2 pairing, so an old v1 key
// stayed there only while the read kept failing (a locked settings file).
// Nothing read the copy: the Remote tab draws its QR code from settings:get,
// and the phone payload is a projection without settings.
// Hydration now drops a saved copy, so the first save after a load writes a
// blob without it, and nothing puts it back: not the start-up read, not a
// renewal, not "Regenerate Keys", not a Settings save, not a restart.
// Values are checked as well as field names: a copy under another name would
// still carry the key. framer-motion is NOT mocked here: the overlay resets
// its draft from the store in onAnimationStart, which a plain-div mock never
// calls, and a draft filled from settings:get there would reach Save.
// ============================================================

import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import '@testing-library/jest-dom';
import { MCStoreProvider } from './MCStoreProvider';
import { useMCState, STORAGE_KEY, loadPersistedState } from './useMCStore';
import { initialState } from './mcReducer';
import { REPAIRED_NOTICE } from '../components/RemotePairingPanel';
import { pairingBridge, settle, shownUrl, openRemoteTab, regenerateKeys } from '../components/pairingTestKit';
import { buildPairingUrl } from '../utils/pairingUrl';

const LEGACY_ROOM = '0c7e5a1b-9d2f-4e3a-8b6c-legacy-room';
const LEGACY_KEY = 'legacyKeyQ7Lk2mPz9XwR4tYb';
const LOGGED_AT = '2026-09-28T09:00:00.000Z';
const LATER = '2026-10-03T07:30:00.000Z';
const V2 = { remoteRoomId: 'room-v2', remoteKey: 'key-v2', remotePairingVersion: 2 };
const NEW_PAIRING = { ok: true, roomId: 'room-new', remoteKey: 'key-new' };
const PAIRING_FIELDS = ['remoteRoomId', 'remoteKey'];

const bridge = pairingBridge();

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

let setItem: MockInstance<Storage['setItem']>;
/** How many localStorage writes had happened when the app last started. */
let writesAtStart = 0;

/** Every mc-state-v5 the app wrote since it last started, oldest first. */
const savedSinceStart = (): string[] => setItem.mock.calls.slice(writesAtStart)
    .filter(([key]) => key === STORAGE_KEY)
    .map(([, value]) => value);

/** The app saved since it started, and its last save holds no pairing field and none of `values`. */
function expectNoPairingSaved(values: string[]): void {
    const blob = savedSinceStart().at(-1);
    expect(blob, 'the app saved nothing since it started').toBeDefined();
    for (const field of PAIRING_FIELDS) expect(blob, `mc-state-v5 still names ${field}`).not.toContain(field);
    for (const value of values) expect(blob, 'mc-state-v5 still holds a pairing value').not.toContain(value);
}

function RenewalLines() {
    const { activityLogs } = useMCState();
    return <output data-testid="ids">{activityLogs.map(l => l.id).join(',')}</output>;
}
const linesFor = (renewedAt: string) => screen.getByTestId('ids').textContent!.split(',').filter(id => id === `pairing-renewed-${renewedAt}`).length;

/** Past the provider's 500 ms debounced localStorage write. */
const persist = () => act(async () => { await vi.advanceTimersByTimeAsync(600); });

async function start(open: () => Promise<void> = async () => { render(<MCStoreProvider><RenewalLines /></MCStoreProvider>); await settle(); }) {
    writesAtStart = setItem.mock.calls.length;
    await open();
}

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    bridge.install();
    bridge.settings = V2;
    bridge.regenerate = () => Promise.resolve(NEW_PAIRING);
    setItem = vi.spyOn(Storage.prototype, 'setItem');
});

afterEach(() => {
    cleanup();
    setItem.mockRestore();
    vi.useRealTimers();
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
        ['settings:get hands out a v2 pairing', () => { bridge.settings = V2; }],
        ['settings:get rejects (the settings file is locked)', () => { bridge.settingsError = new Error('busy'); }],
        ['settings:get hands out no v2 pairing', () => { bridge.settings = { calendarIds: [] }; }],
        ['settings:get hands out an unmarked (v1) pairing', () => { bridge.settings = { remoteRoomId: 'room-v1', remoteKey: 'key-v1' }; }],
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
        bridge.settings = { ...V2, remotePairingRenewedAt: LATER };
        await start();
        expect(linesFor(LATER)).toBe(1);
        await persist();
        expectNoPairingSaved([LEGACY_KEY, V2.remoteRoomId, V2.remoteKey]);
        expect(JSON.parse(savedSinceStart().at(-1)!).settings.remotePairingRenewalLogged).toBe(LATER);

        cleanup(); // quit, then start again with the renewal still unanswered
        await start();
        await persist();
        expectNoPairingSaved([LEGACY_KEY, V2.remoteRoomId, V2.remoteKey]);
    });

    it('"Regenerate Keys" shows the new pairing but never saves it; nor does a Settings save or a restart', async () => {
        saveV0043State();
        await start(openRemoteTab);
        await regenerateKeys();
        expect(shownUrl()).toBe(buildPairingUrl('room-new', 'key-new'));

        await act(async () => { fireEvent.click(screen.getByText(/Save Settings/)); });
        await persist();
        expectNoPairingSaved([LEGACY_ROOM, LEGACY_KEY, V2.remoteRoomId, V2.remoteKey, 'room-new', 'key-new']);
        expect(JSON.parse(savedSinceStart().at(-1)!).settings).toMatchObject({ morningStartsAt: '06:30', autoReturnMins: 10 });

        cleanup();
        await start();
        await persist();
        expectNoPairingSaved([LEGACY_ROOM, LEGACY_KEY, V2.remoteRoomId, V2.remoteKey, 'room-new', 'key-new']);
    });
});

describe('the Remote tab still works from settings:get alone', () => {
    it('draws the v2 pairing and the re-pairing notice on a profile that saved the old copy', async () => {
        saveV0043State();
        bridge.settings = { ...V2, remotePairingRenewedAt: LATER };
        await start(openRemoteTab);
        expect(shownUrl()).toBe(buildPairingUrl('room-v2', 'key-v2'));
        expect(screen.getByText(REPAIRED_NOTICE)).toBeInTheDocument();
    });
});
