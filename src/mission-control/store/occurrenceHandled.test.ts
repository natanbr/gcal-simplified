// ============================================================
// occurrenceHandled.ts — the scheduler's "this occurrence needs no start",
// table by table: the save stamp's gate (retimedOntoItsRun), the nearness it
// reads (one occurrence ahead at most, a tie going ahead), each clause of
// occurrenceHandled, and which save keeps the run (saveKeepsRun).
// Scheduler-level cases: useMissionScheduler.settings-retime*.test.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState } from './mcReducer';
import { occurrenceOn, type Occurrence } from './missionOccurrence';
import { occurrenceHandled, retimedOntoItsRun, saveKeepsRun } from './occurrenceHandled';
import type { MCState, Mission } from '../types';

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
        expect(retimedOntoItsRun(evening(fields), settings, occ(evening(), 10), nowMs)).toBe(expected);
    });
});

describe('retimedOntoItsRun: which occurrence the kept run covers', () => {
    const now = nov(13, 12, 0).getTime();
    const stamped = (at: Date, fields: Partial<Mission> = {}) => movedToMidnight({ lastActiveAt: iso(at), startsAtChangedAt: iso(at), ...fields });

    it('the occurrence of the run\'s own day, however far the move', () => {
        const m = evening({ startsAt: '23:00', endsAt: '24:00', lastActiveAt: iso(nov(10, 19, 8)), startsAtChangedAt: iso(nov(10, 19, 8)) });
        expect(retimedOntoItsRun(m, settings, occ(m, 10), now)).toBe(true);
        expect(retimedOntoItsRun(m, settings, occ(m, 11), now)).toBe(false);
    });

    it('the next occurrence when the run is nearer its start than the window behind (A: 20 min ahead, 22 h 40 behind)', () => {
        const m = stamped(nov(10, 23, 50));
        expect(retimedOntoItsRun(m, settings, occ(m, 11), now)).toBe(true);
    });

    it('at most one occurrence ahead: the one after it is not covered', () => {
        const m = stamped(nov(10, 23, 50));
        expect(retimedOntoItsRun(m, settings, occ(m, 12), now)).toBe(false);
    });

    it('a tie goes to the occurrence ahead, as the hand-start rule\'s does; 1 ms nearer the window behind does not', () => {
        // The gap from the 10th's 01:10 end to the 11th's 00:10 start is 23 h; its middle is 12:40 on the 10th.
        const elsewhere = { occurrenceDate: '2026-11-09' };
        expect(retimedOntoItsRun(stamped(nov(10, 12, 40), elsewhere), settings, occ(movedToMidnight({}), 11), now)).toBe(true);
        const justBefore = nov(10, 12, 39, 59, 999);
        expect(retimedOntoItsRun(stamped(justBefore, elsewhere), settings, occ(movedToMidnight({}), 11), now)).toBe(false);
    });

    it('nothing from inside the window behind, and nothing for an occurrence the run came after', () => {
        const elsewhere = { occurrenceDate: '2026-11-09' };
        expect(retimedOntoItsRun(stamped(nov(10, 1, 0), elsewhere), settings, occ(movedToMidnight({}), 11), now)).toBe(false);
        expect(retimedOntoItsRun(stamped(nov(10, 23, 50), elsewhere), settings, occ(movedToMidnight({}), 10), now)).toBe(false);
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
    ])('%s', (_name, s, expected) => {
        expect(occurrenceHandled(s, 'evening', o, now)).toBe(expected);
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
});
