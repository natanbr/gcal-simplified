// ============================================================
// occurrenceHandled.ts — the scheduler's "this occurrence needs no start",
// table by table: the save stamp's gate (retimedOntoItsRun), the nearness the
// save decides (retimeAheadDay: one occurrence ahead at most, a tie going
// ahead), each clause of occurrenceHandled, and which save keeps the run
// (saveKeepsRun). Scheduler-level cases: useMissionScheduler.settings-retime*.test.tsx;
// a length save changing nothing: occurrenceHandled.duration-*.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState } from './mcReducer';
import { occurrenceOn, type Occurrence } from './missionOccurrence';
import { occurrenceHandled, retimeAheadDay, retimedOntoItsRun, saveKeepsRun } from './occurrenceHandled';
import type { MCState, Mission, SavedWindow } from '../types';

const nov = (day: number, h: number, m: number, s = 0, ms = 0) => new Date(2026, 10, day, h, m, s, ms);
const iso = (d: Date) => d.toISOString();
const settings = initialState.settings;

function evening(fields: Partial<Mission> = {}): Mission {
    const m = initialState.missions.find(x => x.phase === 'evening');
    if (!m) throw new Error('no evening in initialState');
    return { ...m, occurrenceDate: '2026-11-10', ...fields }; // 19:00–20:00
}

/** `m`'s occurrence that starts on November `day`. */
function occ(m: Mission, day: number): Occurrence {
    const o = occurrenceOn(m, settings, nov(day, 12, 0));
    if (!o) throw new Error(`no occurrence for ${m.startsAt}`);
    return o;
}

/** The evening moved to 00:10 (60 min): the 10th's window is 00:10–01:10, before the run. */
const movedToMidnight = (fields: Partial<Mission>) => evening({ startsAt: '00:10', endsAt: '01:10', ...fields });

describe('retimedOntoItsRun: the gate (a save at or after the last run, not in the future)', () => {
    const ranAt = iso(nov(10, 19, 20));
    const at = (h: number, m: number) => nov(10, h, m).getTime();
    it.each<[string, Partial<Mission>, number, boolean]>([
        ['a stamp equal to the last activity covers the run\'s own day', { lastActiveAt: ranAt, startsAtChangedAt: ranAt }, at(20, 0), true],
        ['a run after the save (stamp older than the last activity)', { lastActiveAt: ranAt, startsAtChangedAt: iso(nov(10, 19, 19)) }, at(20, 0), false],
        ['a stamp in the future at read time (a clock set ahead)', { lastActiveAt: ranAt, startsAtChangedAt: iso(nov(10, 19, 30)) }, at(19, 25), false],
        ['the same stamp once the clock reaches it', { lastActiveAt: ranAt, startsAtChangedAt: iso(nov(10, 19, 30)) }, at(19, 30), true],
        ['an unreadable stamp', { lastActiveAt: ranAt, startsAtChangedAt: 'yesterday' }, at(20, 0), false],
        ['an unreadable last activity', { lastActiveAt: 'garbage', startsAtChangedAt: ranAt }, at(20, 0), false],
        ['no stamp', { lastActiveAt: ranAt, startsAtChangedAt: undefined }, at(20, 0), false],
        ['no last activity', { lastActiveAt: undefined, startsAtChangedAt: ranAt }, at(20, 0), false],
    ])('%s', (_name, fields, nowMs, expected) => {
        expect(retimedOntoItsRun(evening(fields), occ(evening(), 10), nowMs)).toBe(expected);
    });
});

describe('retimedOntoItsRun: which occurrence the kept run covers', () => {
    const now = nov(13, 12, 0).getTime();
    const stamped = (at: Date, fields: Partial<Mission> = {}) => movedToMidnight({ lastActiveAt: iso(at), startsAtChangedAt: iso(at), ...fields });

    it('the occurrence of the run\'s own day, however far the move', () => {
        const m = evening({ startsAt: '23:00', endsAt: '24:00', lastActiveAt: iso(nov(10, 19, 8)), startsAtChangedAt: iso(nov(10, 19, 8)) });
        expect(retimedOntoItsRun(m, occ(m, 10), now)).toBe(true);
        expect(retimedOntoItsRun(m, occ(m, 11), now)).toBe(false);
    });

    it('the occurrence ahead the save decided (retimeCoversDay), and no other', () => {
        const m = stamped(nov(10, 23, 50), { retimeCoversDay: '2026-11-11' });
        expect(retimedOntoItsRun(m, occ(m, 11), now)).toBe(true);
        expect(retimedOntoItsRun(m, occ(m, 12), now), 'the one after it').toBe(false);
        expect(retimedOntoItsRun(stamped(nov(10, 23, 50)), occ(m, 11), now), 'no decision stored: only the run\'s own day').toBe(false);
    });
});

describe('retimeAheadDay: the occurrence ahead a save that moves the start onto the run decides to cover', () => {
    const stamped = (at: Date, fields: Partial<Mission> = {}) => movedToMidnight({ lastActiveAt: iso(at), ...fields });

    it('the next occurrence when the run is nearer its start than the window behind (A: 20 min ahead, 22 h 40 behind)', () => {
        expect(retimeAheadDay(stamped(nov(10, 23, 50)), settings)).toBe('2026-11-11');
    });

    it('a tie goes to the occurrence ahead, as the hand-start rule\'s does; 1 ms nearer the window behind does not', () => {
        // The gap from the 10th's 01:10 end to the 11th's 00:10 start is 23 h; its middle is 12:40 on the 10th.
        expect(retimeAheadDay(stamped(nov(10, 12, 40)), settings)).toBe('2026-11-11');
        expect(retimeAheadDay(stamped(nov(10, 12, 39, 59, 999)), settings)).toBeUndefined();
    });

    it('nothing from inside the window behind, and nothing with no readable last activity', () => {
        expect(retimeAheadDay(stamped(nov(10, 1, 0)), settings)).toBeUndefined();
        expect(retimeAheadDay(stamped(nov(10, 1, 0), { lastActiveAt: undefined }), settings)).toBeUndefined();
        expect(retimeAheadDay(stamped(nov(10, 1, 0), { lastActiveAt: 'garbage' }), settings)).toBeUndefined();
    });

    it('weighs the window behind with the run\'s own length, whatever the mission\'s length is now', () => {
        // The evening moved to 06:40, last active at 19:30: 11 h 10 to 06:40; the 10th's window ends 07:40 (60 min) or 08:40 (120 min).
        const at0640 = (endsAt: string, run: Partial<Mission> = {}) => evening({ startsAt: '06:40', endsAt, lastActiveAt: iso(nov(10, 19, 30)), ...run });
        expect(retimeAheadDay(at0640('08:40', { baseDurationMins: 60 }), settings), 'a 60 min run, the mission now 120 min: 11 h 50 behind').toBe('2026-11-11');
        expect(retimeAheadDay(at0640('07:40', { baseDurationMins: 120 }), settings), 'a 120 min run, the mission now 60 min: 10 h 50 behind').toBeUndefined();
        // A run saved before baseDurationMins: the mission's length stands in.
        expect(retimeAheadDay(at0640('07:40'), settings), '60 min: 11 h 50 behind').toBe('2026-11-11');
        expect(retimeAheadDay(at0640('08:40'), settings), '120 min: 10 h 50 behind').toBeUndefined();
    });
});

describe('occurrenceHandled: each clause alone', () => {
    const o = occ(evening(), 10); // 19:00–20:00 on the 10th
    const base: MCState = { ...initialState, lastCompletedOrFailedEveningDate: null, lastCompletedOrFailedMorningDate: null };
    const withEvening = (fields: Partial<Mission>, s: Partial<MCState> = {}): MCState =>
        ({ ...base, ...s, missions: base.missions.map(m => (m.phase === 'evening' ? evening(fields) : m)) });
    const now = nov(10, 21, 0).getTime();

    it.each<[string, MCState, boolean]>([
        ['nothing ran', withEvening({}), false],
        ['concluded the same day', withEvening({}, { lastCompletedOrFailedEveningDate: '2026-11-10' }), true],
        ['concluded another day', withEvening({}, { lastCompletedOrFailedEveningDate: '2026-11-09' }), false],
        ['the morning\'s outcome is not the evening\'s', withEvening({}, { lastCompletedOrFailedMorningDate: '2026-11-10' }), false],
        ['running now', withEvening({}, { activeMission: 'evening' }), true],
        ['ran at or after its start', withEvening({ lastActiveAt: iso(nov(10, 19, 0)) }), true],
        ['ran before its start (2026-09-22)', withEvening({ lastActiveAt: iso(nov(10, 18, 59)) }), false],
        ['a last activity in the future is ignored', withEvening({ lastActiveAt: iso(nov(10, 22, 0)) }), false],
        ['a save kept the run', withEvening({ lastActiveAt: iso(nov(10, 18, 30)), startsAtChangedAt: iso(nov(10, 18, 40)) }), true],
        ['a save put the window under the clock', withEvening({ savedIntoWindows: [{ savedAt: iso(nov(10, 19, 46)), windowStart: iso(nov(10, 19, 0)) }] }), true],
    ])('%s', (_name, s, expected) => {
        expect(occurrenceHandled(s, 'evening', o, now)).toBe(expected);
    });
});

describe('occurrenceHandled: a save that put a window under the clock covers that window only, by its start', () => {
    const base: MCState = { ...initialState, lastCompletedOrFailedEveningDate: null };
    const withWindows = (windows: SavedWindow[], fields: Partial<Mission> = {}): MCState =>
        ({ ...base, missions: base.missions.map(m => (m.phase === 'evening' ? evening({ savedIntoWindows: windows, ...fields }) : m)) });
    const the19th = { savedAt: iso(nov(10, 19, 46)), windowStart: iso(nov(10, 19, 0)) };
    const now = nov(10, 21, 0).getTime();

    it.each<[string, SavedWindow[], number, boolean]>([
        ['the window the save opened', [the19th], 10, true],
        ['an earlier occurrence at the same start keeps its ⏭️ line', [the19th], 9, false],
        ['a later occurrence starts as scheduled', [the19th], 11, false],
        ['a window of the same day at another start (one the save did not open)', [{ ...the19th, windowStart: iso(nov(10, 18, 30)) }], 10, false],
        ['one entry among several', [{ savedAt: iso(nov(9, 19, 10)), windowStart: iso(nov(9, 19, 0)) }, the19th], 10, true],
        ['an unreadable entry', [{ savedAt: 'yesterday', windowStart: iso(nov(10, 19, 0)) }], 10, false],
    ])('%s', (_name, windows, day, expected) => {
        expect(occurrenceHandled(withWindows(windows), 'evening', occ(evening(), day), now)).toBe(expected);
    });

    it('an entry saved in the future at read time (a clock set ahead) is ignored until the clock reaches it', () => {
        // Trusted, a save made at a clock reading 19:46 would hold back the real 19:00 window read at 19:41.
        const s = withWindows([the19th]);
        expect(occurrenceHandled(s, 'evening', occ(evening(), 10), nov(10, 19, 41).getTime())).toBe(false);
        expect(occurrenceHandled(s, 'evening', occ(evening(), 10), nov(10, 19, 46).getTime())).toBe(true);
    });

    it('reads no length: the window stays covered when the mission is shortened after the save', () => {
        // Saved at 19:46 into 19:00–20:00, then shortened to 19:00–19:30: the save is now after its end.
        const shortened = { startsAt: '19:00', endsAt: '19:30' };
        const o = occurrenceOn(evening(shortened), settings, nov(10, 12, 0));
        if (!o) throw new Error('no occurrence');
        expect(occurrenceHandled(withWindows([the19th], shortened), 'evening', o, now)).toBe(true);
    });
});

describe('saveKeepsRun: a save keeps the run only when it covered its occurrence at the old time', () => {
    const base: MCState = { ...initialState, lastCompletedOrFailedEveningDate: null };
    const prevWith = (fields: Partial<Mission>, s: Partial<MCState> = {}): MCState =>
        ({ ...base, ...s, missions: base.missions.map(m => (m.phase === 'evening' ? evening(fields) : m)) });
    const savedAt = nov(10, 19, 40).getTime();

    it.each<[string, MCState, boolean]>([
        ['running at the save, started early by the phone', prevWith({ lastActiveAt: iso(nov(10, 18, 30)) }, { activeMission: 'evening' }), true],
        ['ran at or after the old start', prevWith({ lastActiveAt: iso(nov(10, 19, 15)) }), true],
        ['ended before the old start (B)', prevWith({ lastActiveAt: iso(nov(10, 17, 15)) }), false],
        ['concluded', prevWith({ lastActiveAt: iso(nov(10, 17, 15)) }, { lastCompletedOrFailedEveningDate: '2026-11-10' }), true],
        ['an earlier save kept it (a second move)', prevWith({ lastActiveAt: iso(nov(10, 18, 30)), startsAtChangedAt: iso(nov(10, 18, 30)) }), true],
        ['no stored day: no stamp', prevWith({ lastActiveAt: iso(nov(10, 19, 15)), occurrenceDate: undefined }), false],
        ['never ran: no stamp', prevWith({ lastActiveAt: undefined }, { lastCompletedOrFailedEveningDate: '2026-11-10' }), false],
    ])('%s', (_name, prev, expected) => {
        expect(saveKeepsRun(prev, 'evening', savedAt)).toBe(expected);
    });

    it('a save that put the window under the clock is not a run: a second move keeps nothing', () => {
        // A phone run 17:00–17:15, then a save at 17:20 moving the evening to 17:18: the run
        // never covered 17:18, only the save's stamp does. Fed here, a move to 18:00 at 17:25
        // would be stamped startsAtChangedAt and the run's own day would cover 18:00 too.
        const prev = prevWith({ startsAt: '17:18', endsAt: '18:18', lastActiveAt: iso(nov(10, 17, 15)), savedIntoWindows: [{ savedAt: iso(nov(10, 17, 20)), windowStart: iso(nov(10, 17, 18)) }] });
        expect(occurrenceHandled(prev, 'evening', occ(prev.missions[1], 10), nov(10, 17, 25).getTime()), 'precondition: the stamp covers 17:18').toBe(true);
        expect(saveKeepsRun(prev, 'evening', nov(10, 17, 25).getTime())).toBe(false);
    });
});
