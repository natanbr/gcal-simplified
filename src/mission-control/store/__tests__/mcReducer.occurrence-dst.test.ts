// ============================================================
// Mission Control — a hand start on a DST night (2026-10-05)
// ------------------------------------------------------------
// A run started by hand or from the phone before today's window belongs to
// whichever is nearer: today's start ahead, or the previous occurrence's end
// behind (occurrenceDay.ts). Both distances are real time, so the night the
// clocks move counts its real length: the halfway point between yesterday's
// 20:00 end and today's 19:00 start is 07:30 on a normal day, 08:00 when the
// clocks spring forward (the night lost an hour) and 07:00 when they fall back.
//
// This file pins a time zone with DST (America/Vancouver: 2026-03-08 02:00 →
// 03:00, 2026-11-01 02:00 → 01:00). Vitest runs each file in its own process,
// so the zone does not leak into other suites.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import type { MCAction } from '../../types';

process.env.TZ = 'America/Vancouver';

function eveningDay(startedAt: string): string | undefined {
    const action: MCAction = { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'local', timestamp: startedAt };
    return mcReducer(initialState, action).missions.find(m => m.phase === 'evening')?.occurrenceDate;
}

describe('a hand start on a DST night is measured in real time', () => {
    it('precondition: the zone has its DST nights', () => {
        expect(new Date(2026, 2, 8, 12).getTimezoneOffset()).not.toBe(new Date(2026, 2, 7, 12).getTimezoneOffset());
        expect(new Date(2026, 10, 1, 12).getTimezoneOffset()).not.toBe(new Date(2026, 9, 31, 12).getTimezoneOffset());
    });

    it('spring forward: 07:45 is 10 h 45 after last night’s end and 11 h 15 before tonight’s start, so last night’s', () => {
        // Counting wall-clock hours (11 h 45 vs 11 h 15) would say tonight's.
        expect(eveningDay('2026-03-08T07:45:00')).toBe('2026-03-07');
    });

    it('fall back: 07:15 is 12 h 15 after last night’s end and 11 h 45 before tonight’s start, so tonight’s', () => {
        // Counting wall-clock hours (11 h 15 vs 11 h 45) would say last night's.
        expect(eveningDay('2026-11-01T07:15:00')).toBe('2026-11-01');
    });

    it('a start at or after tonight’s window start is tonight’s on either night', () => {
        expect(eveningDay('2026-03-08T21:00:00')).toBe('2026-03-08');
        expect(eveningDay('2026-11-01T21:00:00')).toBe('2026-11-01');
    });
});
