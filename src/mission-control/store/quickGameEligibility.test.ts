// ============================================================
// quickGameEligibility — every input the quick-game gate reads, and its verdicts.
//
// Once, every rule looked true on the production laptop and 🐍 was still missing
// from the picker; the gate read only current state, so the refusal could not be
// reconstructed. This object is what the pedestal decides with AND what the
// diagnostics trace records, so the two cannot disagree.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState } from './mcReducer';
import { isQuickGameWindowOpen } from './gameWindow';
import { MISSED_LOCK_THRESHOLD } from './missionStreak';
import { pickerRewards, quickGameEligibility } from './quickGameEligibility';
import { REWARDS } from '../rewardCatalogue';
import type { MCState } from '../types';

const TODAY = '2026-09-02';
/** Local wall-clock time (no Z), like gameWindow.test.ts. */
const local = (hhmm: string) => `2026-09-02T${hhmm}:00`;
const NOON = local('12:00');

/** Every rule true: a game token, the reward offered, neutral mood, no mission
 *  running, this morning's mission concluded, evening at 19:00, shield intact. */
function eligible(patch: Partial<MCState> = {}): MCState {
    return { ...initialState, gameTokens: 1, moodWind: 0, activeMission: 'none', missedMissionStreak: 0, lastCompletedOrFailedMorningDate: TODAY, ...patch };
}

const withSettings = (patch: Partial<MCState['settings']>): MCState => eligible({ settings: { ...initialState.settings, ...patch } });

describe('quickGameEligibility — the verdicts', () => {
    it('shows 🐍 in the picker and enables Use! when every rule holds', () => {
        const e = quickGameEligibility(eligible(), NOON);
        expect(e).toMatchObject({ windowOpen: true, economyLocked: false, rewardEnabled: true, pickerVisible: true, useEnabled: true });
    });

    // Each row breaks exactly one rule of the all-true state above.
    const BROKEN: { rule: string; state: MCState; at?: string; useEnabled: boolean }[] = [
        { rule: 'no game token', state: eligible({ gameTokens: 0 }), useEnabled: true },
        { rule: 'the parent switched the reward off', state: withSettings({ rewardConfigs: { 'quick-game': { enabled: false, targetCount: 1 } } }), useEnabled: true },
        { rule: 'mood below neutral', state: eligible({ moodWind: -1 }), useEnabled: false },
        { rule: 'a mission is running', state: eligible({ activeMission: 'morning' }), useEnabled: false },
        { rule: 'the morning mission concluded yesterday, not today', state: eligible({ lastCompletedOrFailedMorningDate: '2026-09-01' }), useEnabled: false },
        { rule: 'the morning mission never concluded', state: eligible({ lastCompletedOrFailedMorningDate: null }), useEnabled: false },
        { rule: 'the evening mission has started', state: eligible(), at: local('19:00'), useEnabled: false },
        { rule: 'the evening start time cannot be read', state: withSettings({ eveningStartsAt: '' }), useEnabled: false },
        { rule: 'the shield is broken', state: eligible({ missedMissionStreak: MISSED_LOCK_THRESHOLD }), useEnabled: false },
    ];

    it.each(BROKEN)('hides 🐍 when $rule', ({ state, at }) => {
        expect(quickGameEligibility(state, at ?? NOON).pickerVisible).toBe(false);
    });

    // Use! sits on a goal that already holds its token, so the balance and the
    // catalogue switch do not gate it; mood, the window and the lock do.
    it.each(BROKEN)('Use! is $useEnabled when $rule', ({ state, at, useEnabled }) => {
        expect(quickGameEligibility(state, at ?? NOON).useEnabled).toBe(useEnabled);
    });

    it('reports a broken shield as locked: the "+" opens no picker at all', () => {
        const e = quickGameEligibility(eligible({ missedMissionStreak: MISSED_LOCK_THRESHOLD }), NOON);
        expect(e).toMatchObject({ economyLocked: true, pickerVisible: false, useEnabled: false });
        // The window itself is not the lock's business.
        expect(e.windowOpen).toBe(true);
    });
});

describe('quickGameEligibility — windowOpen is the reducer\'s own gate', () => {
    const STATES: MCState[] = [
        eligible(),
        eligible({ activeMission: 'evening' }),
        eligible({ lastCompletedOrFailedMorningDate: null }),
        eligible({ lastCompletedOrFailedMorningDate: '2026-09-01' }),
        withSettings({ eveningStartsAt: '25:00' }),
        withSettings({ eveningStartsAt: '05:00' }),
        withSettings({ eveningStartsAt: '23:59' }),
        eligible({ moodWind: -2, gameTokens: 0, missedMissionStreak: MISSED_LOCK_THRESHOLD }),
    ];
    const TIMES = ['00:00', '05:59', '06:30', '12:00', '18:59', '19:00', '23:58', '23:59'].map(local).concat(['not a time', '2026-09-03T08:00:00']);

    it('agrees with isQuickGameWindowOpen in every state at every time', () => {
        for (const state of STATES) {
            for (const at of TIMES) {
                expect(quickGameEligibility(state, at).windowOpen, `${state.settings.eveningStartsAt} ${state.activeMission} ${state.lastCompletedOrFailedMorningDate} at ${at}`)
                    .toBe(isQuickGameWindowOpen(state, at));
            }
        }
    });
});

describe('pickerRewards — what the goal picker lists, and the trace records', () => {
    const ids = (state: MCState, at = NOON) => pickerRewards(state, quickGameEligibility(state, at)).map(r => r.id);

    it('lists the catalogue in order, 🐍 last, when every rule holds', () => {
        expect(ids(eligible())).toEqual(REWARDS.map(r => r.id));
    });

    it('lists 🐍 exactly when the eligibility says pickerVisible', () => {
        for (const state of [eligible(), eligible({ moodWind: -1 }), eligible({ gameTokens: 0 }), eligible({ missedMissionStreak: MISSED_LOCK_THRESHOLD })]) {
            expect(ids(state).includes('quick-game')).toBe(quickGameEligibility(state, NOON).pickerVisible);
        }
        expect(ids(eligible(), local('19:00'))).not.toContain('quick-game');
    });

    it('leaves out a reward the parent switched off, and Game while phone games are suspended', () => {
        expect(ids(withSettings({ rewardConfigs: { show: { enabled: false, targetCount: 8 } } }))).not.toContain('show');
        const suspended = eligible({ privileges: initialState.privileges.map(p => (p.id === 'phone-games' ? { ...p, status: 'suspended', suspendedUntil: '2099-01-01T00:00:00.000Z' } : p)) });
        expect(ids(suspended)).not.toContain('game');
        expect(ids(suspended)).toContain('quick-game');
    });
});

describe('quickGameEligibility — the raw inputs, for the trace', () => {
    it('records every input the gate read, as it read it', () => {
        const state = eligible({ gameTokens: 3, moodWind: 1, settings: { ...initialState.settings, eveningStartsAt: '18:30' } });
        const now = new Date(NOON);

        expect(quickGameEligibility(state, NOON)).toEqual({
            nowIso: NOON,
            tzOffsetMins: 0 - now.getTimezoneOffset(),
            nowMins: 12 * 60,
            today: TODAY,
            gameTokens: 3,
            rewardEnabled: true,
            moodWind: 1,
            activeMission: 'none',
            eveningStartsAt: '18:30',
            eveningStartMins: 18 * 60 + 30,
            lastCompletedOrFailedMorningDate: TODAY,
            economyLocked: false,
            windowOpen: true,
            pickerVisible: true,
            useEnabled: true,
        });
    });

    it('records an unreadable evening start as null, beside the raw text', () => {
        const e = quickGameEligibility(withSettings({ eveningStartsAt: '7pm' }), NOON);
        expect(e).toMatchObject({ eveningStartsAt: '7pm', eveningStartMins: null, windowOpen: false });
    });

    it('fails closed on a time it cannot read', () => {
        const e = quickGameEligibility(eligible(), 'not a time');
        expect(e).toMatchObject({ windowOpen: false, pickerVisible: false, useEnabled: false });
        expect(Number.isNaN(e.nowMins)).toBe(true);
    });
});
