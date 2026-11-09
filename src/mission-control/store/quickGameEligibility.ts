// ============================================================
// Mission Control — Quick-Game Eligibility
// Every input the quick-game gate reads, beside the verdicts it reaches. The
// pedestal decides with this object (the goal picker's list through
// pickerRewards, the "🎁 Use!" button), and the diagnostics trace records the
// object and the list its render decided with: not a second read. (It records
// the decision, not the pixels.)
//
// It holds no rule of its own: the window is isQuickGameWindowOpen (the
// reducer's gate for START_GAME and CONSUME_CASE), the token and the catalogue
// switch are canSelectReward (SELECT_CASE's), the lock is isEconomyLocked.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCState, MissionPhase } from '../types';
import { REWARDS, canSelectReward, isRewardEnabled } from '../rewardCatalogue';
import { getLocalDateString } from './behaviorSync';
import { isQuickGameWindowOpen } from './gameWindow';
import { hhmmToMins } from './hhmm';
import { isEconomyLocked } from './missionStreak';
import { isPhoneGamesSuspended } from './privileges';

export interface QuickGameEligibility {
    /** The instant every verdict below was reached at. */
    nowIso: string;
    /** Local time minus UTC at nowIso, in minutes (UTC+1 = 60). */
    tzOffsetMins: number;
    /** Minutes since local midnight at nowIso: what the window compares with eveningStartMins. */
    nowMins: number;
    /** getLocalDateString(nowIso): what the window compares lastCompletedOrFailedMorningDate with. */
    today: string;
    gameTokens: number;
    /** The parent's catalogue switch (⚙️ → 🎁 Rewards). */
    rewardEnabled: boolean;
    moodWind: number;
    activeMission: MissionPhase;
    /** As stored, and as hhmmToMins read it (null: unreadable, so the window is shut). */
    eveningStartsAt: string;
    eveningStartMins: number | null;
    lastCompletedOrFailedMorningDate: string | null;
    economyLocked: boolean;
    /** isQuickGameWindowOpen: no mission running, this morning's concluded, the evening not started. */
    windowOpen: boolean;
    /** 🐍 is offered in the goal picker. The locked "+" opens no picker, so the lock hides it too. */
    pickerVisible: boolean;
    /** A Quick-Game goal's "🎁 Use!" works. Its token is already in the goal: no balance or switch check. */
    useEnabled: boolean;
}

export function quickGameEligibility(state: MCState, nowIso: string): QuickGameEligibility {
    const now = new Date(nowIso);
    const windowOpen = isQuickGameWindowOpen(state, nowIso);
    const economyLocked = isEconomyLocked(state);
    const useEnabled = state.moodWind >= 0 && windowOpen && !economyLocked;
    return {
        nowIso,
        // 0 − offset, not −offset: UTC would read −0.
        tzOffsetMins: 0 - now.getTimezoneOffset(),
        nowMins: now.getHours() * 60 + now.getMinutes(),
        today: getLocalDateString(now),
        gameTokens: state.gameTokens,
        rewardEnabled: isRewardEnabled(state.settings, 'quick-game'),
        moodWind: state.moodWind,
        activeMission: state.activeMission,
        eveningStartsAt: state.settings.eveningStartsAt,
        eveningStartMins: hhmmToMins(state.settings.eveningStartsAt),
        lastCompletedOrFailedMorningDate: state.lastCompletedOrFailedMorningDate,
        economyLocked,
        windowOpen,
        pickerVisible: useEnabled && canSelectReward(state, 'quick-game'),
        useEnabled,
    };
}

/**
 * The goal picker's list, in catalogue order: what it renders and what the trace records. A reward
 * shows unless phone games are suspended (Game), SELECT_CASE would refuse it (canSelectReward: the
 * parent's switch, and the quick game's token), or it is the quick game and pickerVisible is false.
 */
export function pickerRewards(state: MCState, eligibility: QuickGameEligibility): typeof REWARDS {
    return REWARDS.filter(r => !(r.id === 'game' && isPhoneGamesSuspended(state.privileges))
        && canSelectReward(state, r.id)
        && (r.id !== 'quick-game' || eligibility.pickerVisible));
}
