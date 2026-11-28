// ============================================================
// Mission Control — the decision a start-time save stores, across a restart
// and an upgrade (review of PR 209, found by Codex)
// ------------------------------------------------------------
// A save that moves a start time onto the run stores its decision about the
// occurrence ahead beside the stamp (retimeCoversDay, missionActivity.ts): a
// day, or null for none. PR 207 (on main before it) wrote the stamp alone and
// decided at every read. A profile it saved has a stamp and no decision, and
// read as "none" it released what PR 207 held: an evening at 23:30 moved at
// 23:50 to 00:10 and closed, reopened at 00:11, started at once. Hydration now
// decides such a stamp once (retimeAheadDay, with the loaded settings); a
// stored null is a decision and stays.
// (Separate file: persistence-time.test.ts is at the 300-line limit.)
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { occurrenceOn } from './missionOccurrence';
import { occurrenceHandled } from './occurrenceHandled';
import { loadPersistedState, loadPersistedStateWithRepairs, STORAGE_KEY } from './useMCStore';
import type { MCAction, MCState, Mission } from '../types';

const nov = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m);
const LONG_AGO = new Date(0).toISOString();
const act = (s: MCState, action: MCAction, when: Date): MCState => mcReducer(s, { ...action, timestamp: when.toISOString() });

function evening(s: MCState): Mission {
    const m = s.missions.find(x => x.phase === 'evening');
    if (!m) throw new Error('no evening mission');
    return m;
}

/** The evening at 23:30, started by the scheduler on the 10th and moved at 23:50 to 00:10 (the save ends the run). */
function movedPastMidnight(): MCState {
    const fixture = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:30' }, timestamp: LONG_AGO });
    const started = act(fixture, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'scheduler', occurrenceDate: '2026-11-10' }, nov(10, 23, 30));
    return act(started, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '00:10' } }, nov(10, 23, 50));
}

/** `state` with the evening's `retimeCoversDay` as given (absent: what PR 207 saved), written as the persist effect writes it. */
function persistWith(state: MCState, decision: { retimeCoversDay?: unknown }): void {
    const missions = state.missions.map(m => {
        if (m.phase !== 'evening') return m;
        const rest = Object.fromEntries(Object.entries(m).filter(([key]) => key !== 'retimeCoversDay'));
        return { ...rest, ...decision };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, missions }));
}

const handledAt0010 = (s: MCState, when: Date) => {
    const o = occurrenceOn(evening(s), s.settings, nov(11, 12, 0));
    if (!o) throw new Error('no occurrence');
    return occurrenceHandled(s, 'evening', o, when.getTime());
};

describe('the decision a start-time save stores', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); localStorage.removeItem(STORAGE_KEY); });

    it('is written with every stamp: a day, or null for none (absent means only "not decided")', () => {
        const moved = movedPastMidnight();
        expect(evening(moved).retimeCoversDay, 'nearer 00:10 on the 11th than the window behind').toBe('2026-11-11');
        // Moved instead at 23:50 to 12:00: the window behind (12:00–13:00 on the 10th) ended 10 h 50 before, 12:00 on the 11th is 12 h 10 ahead.
        const far = act(movedPastMidnight(), { type: 'SET_SETTINGS', settings: { eveningStartsAt: '12:00' } }, nov(10, 23, 55));
        expect(evening(far).startsAtChangedAt, 'precondition: the second save keeps the run, the first stamp of it stays').toBe(nov(10, 23, 50).toISOString());
        expect(evening(far).retimeCoversDay).toBeNull();
    });

    it('a PR 207 profile (a stamp, no decision) reopened at 00:11 is decided at load: 00:10 stays covered', () => {
        persistWith(movedPastMidnight(), {});
        vi.setSystemTime(nov(11, 0, 11));
        const { state } = loadPersistedStateWithRepairs();
        expect(evening(state).startsAtChangedAt, 'precondition: the stamp survived').toBe(nov(10, 23, 50).toISOString());
        expect(evening(state).retimeCoversDay, 'decided as PR 207 read it').toBe('2026-11-11');
        expect(handledAt0010(state, nov(11, 0, 11)), 'read as "none", the evening started at once').toBe(true);
    });

    it('a stored null is a decision: it stays null, and is not decided again at load', () => {
        persistWith(movedPastMidnight(), { retimeCoversDay: null });
        vi.setSystemTime(nov(11, 0, 11));
        expect(evening(loadPersistedState()).retimeCoversDay).toBeNull();
    });

    it('a date survives a restart; anything else that is not null reads as not decided, and the stamp beside it is decided again', () => {
        vi.setSystemTime(nov(11, 0, 11));
        persistWith(movedPastMidnight(), { retimeCoversDay: '2026-11-12' });
        expect(evening(loadPersistedState()).retimeCoversDay, 'a date is kept as saved').toBe('2026-11-12');
        for (const value of ['tomorrow', '2026-11-11T06:40:00.000Z', 20261111]) {
            persistWith(movedPastMidnight(), { retimeCoversDay: value });
            expect(evening(loadPersistedState()).retimeCoversDay, String(value)).toBe('2026-11-11');
        }
    });

    // Codex's two profiles, written as PR 207's reducer (ab425c2) wrote them: the evening at 19:00 ran, its length was saved
    // at 06:15 on the 11th, and at 06:20 it was moved to 06:40. PR 207 weighed the window behind with the length IN THE
    // PROFILE at every read; the run's own length decides otherwise, so a load must decide as PR 207 read it.
    function pr207Profile(run: { lastActiveAt: Date; baseDurationMins: number; failed: boolean }, savedLengthMins: number): void {
        const missions = initialState.missions.map(m => (m.phase !== 'evening' ? m : {
            ...m,
            startsAt: '06:40',
            endsAt: savedLengthMins === 30 ? '07:10' : '08:40',
            lastActiveAt: run.lastActiveAt.toISOString(),
            startsAtChangedAt: nov(11, 6, 20).toISOString(),
            occurrenceDate: '2026-11-10',
            baseDurationMins: run.baseDurationMins,
        }));
        const settings = { ...initialState.settings, eveningStartsAt: '06:40', eveningDurationMins: savedLengthMins };
        const lastCompletedOrFailedEveningDate = run.failed ? '2026-11-10' : null;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialState, settings, missions, lastCompletedOrFailedEveningDate }));
    }
    const handledAt0640 = (s: MCState) => {
        const o = occurrenceOn(evening(s), s.settings, nov(11, 12, 0));
        if (!o) throw new Error('no occurrence');
        return occurrenceHandled(s, 'evening', o, nov(11, 6, 41).getTime());
    };

    it('Codex (a): a 120-min run stopped at 19:01, the length saved as 30: PR 207 covered 06:40, and so does the load', () => {
        pr207Profile({ lastActiveAt: nov(10, 19, 1), baseDurationMins: 120, failed: false }, 30);
        vi.setSystemTime(nov(11, 6, 41));
        const { state } = loadPersistedStateWithRepairs();
        expect(handledAt0640(state), 'released what PR 207 held: a fresh full-timer attempt').toBe(true);
        expect(evening(state).retimeCoversDay, 'written, so a later load reads the same').toBe('2026-11-11');
    });

    it('Codex (b): a 30-min run timed out at 19:30, the length saved as 120: PR 207 let 06:40 start, and so does the load', () => {
        pr207Profile({ lastActiveAt: nov(10, 19, 30), baseDurationMins: 30, failed: true }, 120);
        vi.setSystemTime(nov(11, 6, 41));
        const { state } = loadPersistedStateWithRepairs();
        expect(handledAt0640(state), 'held back the start PR 207 let through').toBe(false);
        expect(evening(state).retimeCoversDay, 'written, so a later load reads the same').toBeNull();
    });

    it('with no stamp, nothing is decided: a stray value is dropped and an absent one stays absent', () => {
        vi.setSystemTime(nov(11, 0, 11));
        const unmoved = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:30' }, timestamp: LONG_AGO });
        persistWith(unmoved, { retimeCoversDay: 'tomorrow' });
        expect(evening(loadPersistedState()).retimeCoversDay).toBeUndefined();
        persistWith(unmoved, {});
        expect(evening(loadPersistedState()).retimeCoversDay).toBeUndefined();
    });
});
