// ============================================================
// A second start move onto the same instant keeps the decision the first one
// made, on the spring-forward night (review of PR 209, found by Codex)
// ------------------------------------------------------------
// The save that moves a start time onto the run decides once whether the run
// also covers the occurrence ahead (retimeCoversDay, missionActivity.ts). A
// second move decided again, and the window behind is placed at the new start
// time on the day before. On 2026-03-08 in America/New_York 02:40 does not
// exist and becomes 03:40 EDT, so a move from 02:40 to 03:40 changes nothing
// ahead, but the window behind moves from 02:40 to 03:40 EST on the 7th, an
// hour nearer the run, and the second save uncovered what the first had
// covered. Through the real reducer, with each action's own instant.
// Scheduler-level twin: hooks/useMissionScheduler.settings-retime.same-start.dst.test.tsx.
// Vitest runs each file in its own process, so the zone does not leak.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { occurrenceOn } from './missionOccurrence';
import { occurrenceHandled } from './occurrenceHandled';
import type { MCAction, MCState } from '../types';

process.env.TZ = 'America/New_York';

const mar = (day: number, h: number, m: number) => new Date(2026, 2, day, h, m);

/** Before any clock a test sets: a fixture save, never a save into a window. */
const LONG_AGO = new Date(0).toISOString();

const act = (s: MCState, action: MCAction, when: Date): MCState => mcReducer(s, { ...action, timestamp: when.toISOString() });
const moveEvening = (s: MCState, startsAt: string, when: Date) => act(s, { type: 'SET_SETTINGS', settings: { eveningStartsAt: startsAt } }, when);

/** The evening's occurrence that starts on March `day`, as `s` places it, and whether it is handled at `when`. */
function handledOn(s: MCState, day: number, when: Date): boolean {
    const m = s.missions.find(x => x.phase === 'evening');
    const o = m && occurrenceOn(m, s.settings, mar(day, 12, 0));
    if (!o) throw new Error('no evening occurrence');
    return occurrenceHandled(s, 'evening', o, when.getTime());
}

/** The evening at 14:35 for 30 min, started by the scheduler on the 7th and timed out at 15:05. */
function missedOnThe7th(): MCState {
    const fixture = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '14:35', eveningDurationMins: 30 }, timestamp: LONG_AGO });
    const started = act(fixture, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'scheduler', occurrenceDate: '2026-03-07' }, mar(7, 14, 35));
    const missed = act(started, { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'evening', origin: 'scheduler' }, mar(7, 15, 5));
    return act(missed, { type: 'SET_ACTIVE_MISSION', phase: 'none', origin: 'scheduler' }, mar(7, 15, 5));
}

describe('a second move onto the same instant, on the spring-forward night', () => {
    it('precondition: 02:40 does not exist on the 8th and is 03:40 EDT, 07:40Z; on the 7th they are an hour apart', () => {
        expect(mar(8, 2, 40).getTime()).toBe(Date.UTC(2026, 2, 8, 7, 40));
        expect(mar(8, 3, 40).getTime()).toBe(Date.UTC(2026, 2, 8, 7, 40));
        expect(mar(7, 3, 40).getTime() - mar(7, 2, 40).getTime()).toBe(60 * 60_000);
    });

    it('moved at 03:30 to 02:40 (covered), at 03:41 to 03:40: the 07:40Z window stays covered', () => {
        const first = moveEvening(missedOnThe7th(), '02:40', mar(8, 3, 30));
        expect(handledOn(first, 8, mar(8, 3, 41)), 'precondition: the miss is nearer 07:40Z than the window behind').toBe(true);

        const second = moveEvening(first, '03:40', mar(8, 3, 41));
        expect(handledOn(second, 8, mar(8, 3, 42)), 'the second save uncovered the same instant').toBe(true);
        expect(second.missions.find(m => m.phase === 'evening')?.retimeCoversDay).toBe('2026-03-08');
        expect(handledOn(second, 9, mar(9, 3, 40)), 'the night after is a new occurrence').toBe(false);
    });

    it('control: a later move to another instant decides again (03:40 → 04:40 is nearer the window behind)', () => {
        // The miss at 15:05 EST on the 7th: 04:40 EDT on the 8th is 12 h 35 ahead; 04:40–05:10 EST on the 7th ended 9 h 55 behind.
        const second = moveEvening(moveEvening(missedOnThe7th(), '02:40', mar(8, 3, 30)), '04:40', mar(8, 3, 41));
        expect(handledOn(second, 8, mar(8, 4, 41))).toBe(false);
    });
});
