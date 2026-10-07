// ============================================================
// Mission Control — which occurrence is open (store/missionOccurrence.ts)
// ------------------------------------------------------------
// The scheduler's arm and fire, the hand-start rule and the legacy run dating
// all ask these. Local time zone; the DST nights are pinned by the scheduler's
// own DST suite (hooks/useMissionScheduler.dst.test.tsx).
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState, mcReducer } from '../mcReducer';
import { getLocalDateString } from '../behaviorSync';
import { handStartOccurrenceDay } from '../occurrenceDay';
import { hasClosed, lastClosedOccurrence, nextOccurrence, nextTimeOfDay, openOccurrence } from '../missionOccurrence';
import type { Mission, MCSettings } from '../../types';

function at(h: number, m: number, dayOffset = 0, s = 0): Date {
    const d = new Date(2026, 9, 6); // a plain day, far from either DST night
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, s, 0);
    return d;
}

function evening(startsAt: string, durationMins: number): { m: Mission; settings: MCSettings } {
    const s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: startsAt, eveningDurationMins: durationMins } });
    const m = s.missions.find(x => x.phase === 'evening');
    if (!m) throw new Error('no evening');
    return { m, settings: s.settings };
}

const day = (offset: number) => getLocalDateString(at(12, 0, offset));

describe('openOccurrence', () => {
    const { m, settings } = evening('23:30', 60); // endsAt '24:30'

    it('before midnight: tonight’s', () => {
        expect(openOccurrence(m, settings, at(23, 40))?.day).toBe(day(0));
    });

    it('after midnight, inside the window: last night’s, with its real start and end', () => {
        const o = openOccurrence(m, settings, at(0, 10, 1));
        expect(o).toEqual({ day: day(0), startMs: at(23, 30).getTime(), endMs: at(0, 30, 1).getTime() });
    });

    it('closed at its end, and between windows: none', () => {
        expect(openOccurrence(m, settings, at(0, 30, 1))).toBeNull();
        expect(openOccurrence(m, settings, at(14, 0, 1))).toBeNull();
    });

    it('a daytime window: open from its start to its end', () => {
        const morning = initialState.missions[0]; // 06:00–06:30
        expect(openOccurrence(morning, initialState.settings, at(5, 59))).toBeNull();
        expect(openOccurrence(morning, initialState.settings, at(6, 0))?.day).toBe(day(0));
        expect(openOccurrence(morning, initialState.settings, at(6, 29, 0, 59))?.day).toBe(day(0));
        expect(openOccurrence(morning, initialState.settings, at(6, 30))).toBeNull();
    });

    it('the 10-second window stays open 5 min after its start, across midnight too', () => {
        const ten = evening('23:58', 1 / 6);
        expect(openOccurrence(ten.m, ten.settings, at(23, 58, 0, 5))?.day).toBe(day(0));
        expect(openOccurrence(ten.m, ten.settings, at(0, 2, 1))?.day, 'a start 4 min late').toBe(day(0));
        expect(openOccurrence(ten.m, ten.settings, at(0, 3, 1)), '5 min late').toBeNull();
    });

    it('a start time that is not HH:MM opens nothing, ever', () => {
        const cleared = { ...m, startsAt: '', endsAt: 'NaN:NaN' };
        for (const t of [at(23, 40), at(0, 10, 1), at(6, 0)]) {
            expect(openOccurrence(cleared, settings, t)).toBeNull();
            expect(nextOccurrence(cleared, settings, t)).toBeNull();
            expect(lastClosedOccurrence(cleared, settings, t)).toBeNull();
        }
    });

    it('an unreadable end: the window lasts as long as a run started then (the duration setting)', () => {
        const o = openOccurrence({ ...m, endsAt: 'garbage' }, settings, at(23, 40));
        expect(o?.endMs).toBe(at(0, 30, 1).getTime());
    });
});

describe('nextOccurrence and lastClosedOccurrence', () => {
    const { m, settings } = evening('23:30', 60);

    it('at 00:10 inside last night’s window: next is tonight’s, last closed is the night before', () => {
        expect(nextOccurrence(m, settings, at(0, 10, 1))?.day).toBe(day(1));
        expect(lastClosedOccurrence(m, settings, at(0, 10, 1))?.day).toBe(day(-1));
    });

    it('at 00:40: last night’s has closed', () => {
        expect(lastClosedOccurrence(m, settings, at(0, 40, 1))?.day).toBe(day(0));
    });

    it('next is strictly after now: at the start instant it is tomorrow’s', () => {
        expect(nextOccurrence(m, settings, at(23, 30))?.day).toBe(day(1));
    });

    it('hasClosed agrees with openOccurrence at the window’s end', () => {
        const o = openOccurrence(m, settings, at(0, 29, 1, 59));
        expect(o && hasClosed(o, at(0, 29, 1, 59))).toBe(false);
        expect(o && hasClosed(o, at(0, 30, 1))).toBe(true);
    });

    it('a task lock’s next time: today’s while ahead, else tomorrow’s', () => {
        expect(nextTimeOfDay(7 * 60, at(6, 0)).getTime()).toBe(at(7, 0).getTime());
        expect(nextTimeOfDay(7 * 60, at(7, 0)).getTime()).toBe(at(7, 0, 1).getTime());
    });
});

describe('one answer: a hand start inside an open window is dated by that window', () => {
    it.each([
        ['23:30', 60, [[23, 40, 0], [0, 10, 1], [0, 29, 1]]],
        ['19:00', 60, [[19, 0, 0], [19, 59, 0]]],
        ['06:00', 30, [[6, 0, 0], [6, 15, 0]]],
        ['22:00', 180, [[22, 30, 0], [0, 0, 1], [0, 59, 1]]],
    ] as const)('%s for %i min', (startsAt, mins, instants) => {
        const { m, settings } = evening(startsAt, mins);
        for (const [h, min, offset] of instants) {
            const t = at(h, min, offset);
            expect(handStartOccurrenceDay(m, settings, t.toISOString()), `${h}:${min}`).toBe(openOccurrence(m, settings, t)?.day);
        }
    });
});
