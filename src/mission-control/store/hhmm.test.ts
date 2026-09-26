// ============================================================
// Mission Control — one rule for a time the parent enters
// ------------------------------------------------------------
// Four HH:MM parsers used to follow three rules: the Save check wanted
// `\d{2}:\d{2}`, the quick-game window took `\d{1,2}`, and the mood gauge and
// the scheduler split on ':' with no check at all, so a cleared time got past
// them only because every comparison with NaN is false. Every reader now asks
// hhmm.ts, and the table at the bottom proves they agree.
//
// A mission's `endsAt` is NOT such a time: it is derived as start + duration,
// so it can pass midnight ('24:30') and carry a fraction of a minute (the
// 10-second test duration in Settings). It has its own, named parser.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    hhmmToMins, isValidHhmm, windowEndToMins, missionWindowEnd, isValidDurationMins, missionDurationMins,
} from './hhmm';
import { isQuickGameWindowOpen } from './gameWindow';
import { isWakingHour, moodHourlyRate } from './behaviorSync';
import { initialState } from './mcReducer';
import { DEFAULT_SETTINGS } from '../types';

/** What <input type="time"> never yields, plus what a hand-edited profile might hold. */
const INVALID = ['', '06', '6:00', '9:00', 'NaN:NaN', '24:00', '12:60', '06:00:00', ' 06:00', '06:5', '+6:00'];
const TEST_DURATION = 10 / 60; // Settings' "10 sec" step

describe('hhmmToMins — the one rule for an entered time', () => {
    it('reads a 24-hour HH:MM as minutes since midnight', () => {
        expect(hhmmToMins('00:00')).toBe(0);
        expect(hhmmToMins('07:15')).toBe(435);
        expect(hhmmToMins('23:59')).toBe(1439);
    });

    it.each(INVALID)('refuses %j', bad => {
        expect(hhmmToMins(bad)).toBeNull();
        expect(isValidHhmm(bad)).toBe(false);
    });

    it('refuses what is not a string', () => {
        for (const bad of [null, undefined, 600, Number.NaN]) expect(hhmmToMins(bad)).toBeNull();
    });
});

describe('windowEndToMins — a derived mission end, not a wall-clock time', () => {
    it('reads a same-day end', () => {
        expect(windowEndToMins('06:30')).toBe(390);
    });

    it('reads an end past midnight as minutes after the start day’s midnight', () => {
        // An evening at 23:30 for 60 min is stored as '24:30'; the scheduler's
        // setHours(24, 30) lands on 00:30 the next day.
        expect(windowEndToMins('24:30')).toBe(1470);
    });

    it('reads the 10-second test duration’s fractional minute', () => {
        const end = missionWindowEnd('06:00', TEST_DURATION);
        expect(end).not.toBeNull();
        expect(windowEndToMins(end)).toBeCloseTo(360 + TEST_DURATION, 10);
    });

    it.each(['', 'NaN:NaN', '06:60', '48:00', '6:30', '-1:00', '06:', ':30'])('refuses %j', bad => {
        expect(windowEndToMins(bad)).toBeNull();
    });
});

describe('missionWindowEnd — start + duration', () => {
    it('derives the end, passing midnight without wrapping', () => {
        expect(missionWindowEnd('06:00', 30)).toBe('06:30');
        expect(missionWindowEnd('23:30', 60)).toBe('24:30');
    });

    it('has no end for a start it cannot read', () => {
        expect(missionWindowEnd('', 30)).toBeNull();
    });
});

describe('isValidDurationMins — a real mission length', () => {
    it.each([30, 120, 5, TEST_DURATION])('accepts %j', ok => {
        expect(isValidDurationMins(ok)).toBe(true);
    });

    // 0 ends a mission the moment it starts; 1440 wraps the window back to its
    // own start, which reads as 0 too. JSON writes NaN and Infinity as null.
    // Under a second: 5e-324 vanishes in start + duration (360 + 5e-324 === 360)
    // and 1e-7 is written in exponent form no parser reads back.
    it.each([0, -5, 1440, 1e9, 1e-7, 5e-324, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, '30'])('refuses %s', bad => {
        expect(isValidDurationMins(bad)).toBe(false);
    });
});

describe('missionDurationMins — how long a started mission runs', () => {
    const s = DEFAULT_SETTINGS;

    it('is the window length', () => {
        expect(missionDurationMins({ phase: 'morning', startsAt: '06:00', endsAt: '06:30' }, s)).toBe(30);
    });

    it('spans midnight, in the stored form and the old wrapped form', () => {
        expect(missionDurationMins({ phase: 'evening', startsAt: '23:30', endsAt: '24:30' }, s)).toBe(60);
        expect(missionDurationMins({ phase: 'evening', startsAt: '23:30', endsAt: '00:30' }, s)).toBe(60);
    });

    it('keeps the 10-second test duration', () => {
        const endsAt = missionWindowEnd('06:00', TEST_DURATION) ?? '';
        expect(missionDurationMins({ phase: 'morning', startsAt: '06:00', endsAt }, s)).toBeCloseTo(TEST_DURATION, 10);
    });

    it('falls back to the phase’s duration setting when the window is unreadable, never NaN', () => {
        // NaN here meant `elapsedMins >= NaN` never ended the mission.
        expect(missionDurationMins({ phase: 'morning', startsAt: '06:00', endsAt: 'NaN:NaN' }, s)).toBe(s.morningDurationMins);
        expect(missionDurationMins({ phase: 'evening', startsAt: '', endsAt: '20:00' }, s)).toBe(s.eveningDurationMins);
    });
});

describe('every reader of an entered time follows the same rule', () => {
    const TODAY = '2026-09-02';
    const at = (hhmm: string) => `${TODAY}T${hhmm}:00`;

    it.each(INVALID)('eveningStartsAt %j keeps the quick-game window shut', bad => {
        // 08:00 with the morning done is open under a readable evening time.
        const s = { ...initialState, lastCompletedOrFailedMorningDate: TODAY, settings: { ...initialState.settings, eveningStartsAt: bad } };
        expect(isQuickGameWindowOpen(s, at('08:00'))).toBe(false);
    });

    it.each(INVALID)('morningStartsAt %j gives no active window and no mood accrual', bad => {
        const settings = { ...DEFAULT_SETTINGS, morningStartsAt: bad };
        expect(isWakingHour(at('12:00'), settings)).toBe(false);
        expect(moodHourlyRate(2, settings)).toBe(0);
    });

    it.each(INVALID)('eveningStartsAt %j gives no active window and no mood accrual', bad => {
        const settings = { ...DEFAULT_SETTINGS, eveningStartsAt: bad };
        expect(isWakingHour(at('12:00'), settings)).toBe(false);
        expect(moodHourlyRate(2, settings)).toBe(0);
    });

    it('an unreal evening duration falls back to the default for the mood gauge, never NaN', () => {
        // The window end is evening start + duration; NaN there made the rate NaN.
        for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0]) {
            const settings = { ...DEFAULT_SETTINGS, eveningDurationMins: bad };
            expect(moodHourlyRate(2, settings)).toBe(moodHourlyRate(2, DEFAULT_SETTINGS));
        }
    });

    it('guard: readable defaults open the window and accrue', () => {
        const s = { ...initialState, lastCompletedOrFailedMorningDate: TODAY };
        expect(isQuickGameWindowOpen(s, at('08:00'))).toBe(true);
        expect(isWakingHour(at('12:00'), DEFAULT_SETTINGS)).toBe(true);
        expect(moodHourlyRate(2, DEFAULT_SETTINGS)).toBeGreaterThan(0);
    });
});
