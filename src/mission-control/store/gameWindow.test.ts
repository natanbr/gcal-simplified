import { describe, it, expect } from 'vitest';
import { initialState } from './mcReducer';
import { isQuickGameWindowOpen } from './gameWindow';
import type { MCState } from '../types';

// Defaults: morning 06:00 for 30 min, evening 19:00 for 60 min.
const local = (hhmm: string) => `2026-09-02T${hhmm}:00`;
const TODAY = '2026-09-02';

function state(patch: Partial<MCState> = {}): MCState {
    return { ...initialState, ...patch };
}

/** The normal case: the morning routine finished this morning. */
function morningDone(patch: Partial<MCState> = {}): MCState {
    return state({ lastCompletedOrFailedMorningDate: TODAY, ...patch });
}

describe('isQuickGameWindowOpen — the gap between the two missions', () => {
    it('is shut before the morning mission has concluded', () => {
        expect(isQuickGameWindowOpen(state(), local('05:30'))).toBe(false);
        expect(isQuickGameWindowOpen(state(), local('06:10'))).toBe(false);
    });

    it('opens once the morning mission has concluded', () => {
        expect(isQuickGameWindowOpen(morningDone(), local('07:00'))).toBe(true);
        expect(isQuickGameWindowOpen(morningDone(), local('16:45'))).toBe(true);
    });

    it('opens on a failed morning too — failing already costs a shield segment', () => {
        // `lastCompletedOrFailedMorningDate` is written by both outcomes; the
        // window deliberately does not distinguish them.
        expect(isQuickGameWindowOpen(morningDone(), local('09:00'))).toBe(true);
    });

    it('stays shut all day when the morning mission never concluded', () => {
        // The rule is literal: "finished", not "the window has passed". Opening
        // at 06:30 regardless would hand the day's games to a child who simply
        // kept the app closed through the routine. The genuinely-skipped case
        // (machine asleep) is recovered by the parent starting the mission by
        // hand from Settings.
        expect(isQuickGameWindowOpen(state(), local('06:45'))).toBe(false);
        expect(isQuickGameWindowOpen(state(), local('15:00'))).toBe(false);
    });

    it('shuts the moment the evening mission starts, and stays shut all night', () => {
        expect(isQuickGameWindowOpen(morningDone(), local('18:59'))).toBe(true);
        expect(isQuickGameWindowOpen(morningDone(), local('19:00'))).toBe(false);
        expect(isQuickGameWindowOpen(morningDone(), local('20:30'))).toBe(false);
        expect(isQuickGameWindowOpen(morningDone(), local('23:30'))).toBe(false);
    });

    it('is shut while any mission is on screen', () => {
        expect(isQuickGameWindowOpen(morningDone({ activeMission: 'morning' }), local('12:00'))).toBe(false);
        expect(isQuickGameWindowOpen(morningDone({ activeMission: 'evening' }), local('12:00'))).toBe(false);
    });

    it('does not treat yesterday\'s completed morning as today\'s', () => {
        const stale = state({ lastCompletedOrFailedMorningDate: '2026-09-01' });
        expect(isQuickGameWindowOpen(stale, local('06:15'))).toBe(false);
    });

    it('follows the configured evening time rather than a hard-coded hour', () => {
        const lateRiser = morningDone({
            settings: { ...initialState.settings, morningStartsAt: '09:00', morningDurationMins: 45, eveningStartsAt: '17:30' },
        });
        expect(isQuickGameWindowOpen(lateRiser, local('17:29'))).toBe(true);
        expect(isQuickGameWindowOpen(lateRiser, local('17:30'))).toBe(false);

        // Only `eveningStartsAt` is read — the morning side is governed by the
        // outcome DATE, not by a clock time, so asserting on morning settings
        // here would be asserting on a field the selector never touches.
    });

    it('fails CLOSED on a time it cannot parse, rather than opening all night', () => {
        // Clearing the settings time field yields ''. `nowMins >= NaN` is false,
        // which silently deleted the evening gate.
        // '25:00' is the trap: it PASSES an HH:MM shape check but parses to
        // 1500 minutes, which no wall-clock minute reaches — so a shape-only
        // guard lets the gate vanish. Range is checked too.
        for (const bad of ['', '7pm', 'abc', '25:00:00', '25:00', '99:99', '12:75']) {
            const broken = morningDone({ settings: { ...initialState.settings, eveningStartsAt: bad } });
            expect(isQuickGameWindowOpen(broken, local('23:30'))).toBe(false);
        }
    });

    it('stays shut for an inverted overnight config instead of never opening silently', () => {
        const overnight = morningDone({
            settings: { ...initialState.settings, morningStartsAt: '14:00', eveningStartsAt: '08:00' },
        });
        expect(isQuickGameWindowOpen(overnight, local('15:00'))).toBe(false);
    });
});
