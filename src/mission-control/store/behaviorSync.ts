// ============================================================
// Mission Control — Behavior Sync / Token Economy
// The mood-gauge accrual engine: converts active-window time at
// the current mood into behaviorProgress, grants game tokens when
// the gauge fills, and writes the grant's activity-log entry.
// Extracted verbatim from mcReducer.ts (the ratchet's "top split
// candidate") so the reducer file can shrink; mcReducer re-exports
// the public names, so consumers keep importing from there.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCState, MCSettings, ActivityLogEntry } from '../types';

/** Ring-buffer size for the in-app activity log. The durable, uncapped record
 *  lives on disk in the main process (electron/audit-log.ts). Lives here rather
 *  than in mcReducer because the grant log below must slice with the same cap. */
export const MAX_ACTIVITY_LOGS = 200;

export function getLocalDateString(d: Date = new Date()): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ---- Selectors ----

/** Total tokens owned: bank + everything deposited into goal cases. */
export function selectTotalWealth(state: MCState): number {
    return state.bankCount + state.cases.reduce((sum, c) => sum + c.tokenCount, 0);
}

// ---- Helpers for Behavior Progress ----

/** Progress points that fill the gauge from empty to one game token. */
export const PROGRESS_PER_TOKEN = 100;

/** Hard cap on banked game tokens. */
export const MAX_GAME_TOKENS = 5;

/**
 * Game tokens earned per *full active day*, keyed by mood level (-2..+2).
 * This is the single source of truth for the token economy — the mood gauge is
 * the ONLY generator of game tokens (there is deliberately no calendar-day
 * grant; that used to hand out a free token on every app launch).
 *
 * Negative moods drain the gauge instead of filling it.
 */
export const MOOD_TOKENS_PER_DAY: Record<number, number> = {
    2: 1.5,      // Excellent
    1: 1,        // Good
    0: 1 / 3,    // Neutral — one token every three days
    [-1]: -0.4,  // Bad
    [-2]: -1.0,  // Horrible
};

/**
 * Converts the contracted per-day rate into progress-per-hour for the *actual*
 * configured active window. Expressing the economy in tokens/day keeps the rate
 * honest when the morning/evening times are changed in settings — a shorter day
 * accrues faster per hour so it still lands on the same tokens per day.
 */
export function moodHourlyRate(moodWind: number, settings: MCSettings): number {
    const perDay = MOOD_TOKENS_PER_DAY[moodWind] ?? 0;
    if (perDay === 0) return 0;

    const { startMins, endMins } = getWakingBounds(settings);
    // Guard against a degenerate/inverted window producing an infinite rate.
    const activeHours = Math.max(0.5, (endMins - startMins) / 60);

    return (perDay * PROGRESS_PER_TOKEN) / activeHours;
}

/**
 * Largest gap between two behavior syncs still treated as continuous "app is
 * running" time. The heartbeat ticks every 60s (see useBehaviorHeartbeat), so
 * any gap beyond this means the app was closed or the machine was asleep — that
 * span is NOT the child's active time and must not be counted.
 */
const MAX_ACTIVE_GAP_MS = 3 * 60 * 1000;

export function isWakingHour(isoString: string, settings: MCSettings): boolean {
    const d = new Date(isoString);
    const hour = d.getHours();
    const min = d.getMinutes();
    const totalMins = hour * 60 + min;

    const [startH, startM] = settings.morningStartsAt.split(':').map(Number);
    const morningStart = startH * 60 + startM;

    const [endH, endM] = settings.eveningStartsAt.split(':').map(Number);
    const wakingEnd = endH * 60 + endM + (settings.eveningDurationMins || 60);

    return totalMins >= morningStart && totalMins <= wakingEnd;
}

function getWakingBounds(settings: MCSettings): { startMins: number; endMins: number } {
    const [startH, startM] = settings.morningStartsAt.split(':').map(Number);
    const [endH, endM] = settings.eveningStartsAt.split(':').map(Number);
    return {
        startMins: startH * 60 + startM,
        endMins: endH * 60 + endM + (settings.eveningDurationMins || 60),
    };
}

function shouldResetMood(state: MCState, nowIso: string): boolean {
    const now = new Date(nowIso);
    // Local date — using the UTC date (toISOString) would flip mid-afternoon
    // in western timezones and re-trigger the daily reset a second time.
    const todayDate = getLocalDateString(now);

    if (state.moodLastResetDate === todayDate) return false;

    const { startMins } = getWakingBounds(state.settings);
    const resetMins = startMins - 60;
    const nowMins = now.getHours() * 60 + now.getMinutes();

    return nowMins >= resetMins;
}

/**
 * Milliseconds of the interval [from, to] that fall inside *to*'s local active
 * window (morning start → end of evening). Because the reducer discards gaps
 * larger than one heartbeat, this only ever measures a short, same-day slice —
 * no multi-day back-fill (that would count time the app was closed).
 */
function activeWindowOverlapMs(from: Date, to: Date, settings: MCSettings): number {
    const { startMins, endMins } = getWakingBounds(settings);
    const midnight = new Date(to);
    midnight.setHours(0, 0, 0, 0);
    const midnightMs = midnight.getTime();
    const DAY_MS = 24 * 60 * 60_000;

    // The window can extend past midnight (e.g. eveningStartsAt 23:00 +120min →
    // 01:00), so a slice just after midnight belongs to *yesterday's* window, not
    // today's. Measure against both today's and the previous day's window anchor
    // and sum them — for a same-day window the previous-day term is 0, and the two
    // windows never overlap, so there is no double counting.
    const overlapForDay = (dayMidnightMs: number): number => {
        const windowStart = dayMidnightMs + startMins * 60_000;
        const windowEnd = dayMidnightMs + endMins * 60_000;
        const start = Math.max(from.getTime(), windowStart);
        const end = Math.min(to.getTime(), windowEnd);
        return Math.max(0, end - start);
    };

    return overlapForDay(midnightMs) + overlapForDay(midnightMs - DAY_MS);
}

function calculateBehaviorDelta(state: MCState, nowIso: string): { progressDelta: number; nextLastUpdated: string } {
    const lastUpdate = new Date(state.behaviorLastUpdated);
    const now = new Date(nowIso);

    // Returning the *unchanged* anchor signals applyBehaviorSync to leave state
    // untouched (same object ref) so idle heartbeat ticks trigger no re-render
    // or persist. We only advance the anchor when there is something to record.
    const keep = { progressDelta: 0, nextLastUpdated: state.behaviorLastUpdated };

    const elapsedMs = now.getTime() - lastUpdate.getTime();
    // Clock went backwards (DST fall-back, NTP correction, or a remote-synced
    // state whose anchor is ahead of us): re-anchor to now so accrual self-heals
    // on the next tick. Keeping the future anchor would freeze progress until the
    // real clock caught up to it. (elapsedMs === 0 re-anchors to the same instant,
    // so applyBehaviorSync still returns the same state ref — no churn.)
    if (elapsedMs <= 0) return { progressDelta: 0, nextLastUpdated: nowIso };

    // Use ?? (not ||) so a genuine Neutral mood (0) is preserved — the old
    // `state.moodWind || 1` coerced 0 → 1, silently promoting mood to Good.
    const moodWind = Math.max(-2, Math.min(2, state.moodWind ?? 0));
    const hourlyRate = moodHourlyRate(moodWind, state.settings);

    // Only the portion of the gap inside the active window counts. Outside it
    // (night) nothing accrues AND we keep the anchor frozen — this is what makes
    // the whole night cost-free (no state churn at all).
    const activeMs = activeWindowOverlapMs(lastUpdate, now, state.settings);
    if (hourlyRate === 0 || activeMs <= 0) return keep;

    // In-window, but the gap is larger than a heartbeat → the app was closed or
    // the machine asleep. Don't back-fill that span; re-anchor so the next tick
    // resumes accrual from now.
    if (elapsedMs > MAX_ACTIVE_GAP_MS) return { progressDelta: 0, nextLastUpdated: nowIso };

    const progressDelta = (activeMs / 3_600_000) * hourlyRate;
    return { progressDelta, nextLastUpdated: nowIso };
}

export function applyBehaviorSync(state: MCState, nowIso: string): MCState {
    if (shouldResetMood(state, nowIso)) {
        const todayDate = getLocalDateString(new Date(nowIso));
        state = {
            ...state,
            moodWind: 0,
            moodLastResetDate: todayDate,
            behaviorLastUpdated: nowIso,
            behaviorDelta: 0,
        };
    }

    const { progressDelta, nextLastUpdated } = calculateBehaviorDelta(state, nowIso);
    if (progressDelta === 0) {
        // Nothing accrued. Only allocate a new state object if the anchor
        // actually moved (a re-anchor after a long gap). Otherwise return the
        // exact same reference so idle heartbeat ticks trigger no re-render and
        // no persist — this is what keeps the Calendar view quiet at night.
        if (nextLastUpdated === state.behaviorLastUpdated) return state;
        return { ...state, behaviorLastUpdated: nextLastUpdated };
    }

    let nextProgress = state.behaviorProgress + progressDelta;
    let nextGameTokens = state.gameTokens;
    let nextMoodWind = state.moodWind;
    let grantLog: ActivityLogEntry | null = null;

    if (nextProgress >= PROGRESS_PER_TOKEN) {
        const tokensToGrant = Math.floor(nextProgress / PROGRESS_PER_TOKEN);
        nextProgress = nextProgress % PROGRESS_PER_TOKEN;
        nextGameTokens = Math.min(MAX_GAME_TOKENS, nextGameTokens + tokensToGrant);

        // Earning a token spends the good mood that earned it: the child starts
        // the next token from Neutral and has to earn their way back up.
        nextMoodWind = 0;

        // The grant is written here, inside the reducer, rather than by the
        // dispatch interceptor — this is the one token movement no user action
        // triggers, so it is exactly the one that must never go unlogged.
        // The id is derived from the sync anchor (not random) to keep the
        // reducer pure and replayable.
        const granted = nextGameTokens - state.gameTokens;
        if (granted > 0) {
            grantLog = {
                id: `auto-mood-token-${nextLastUpdated}`,
                timestamp: nextLastUpdated,
                icon: '😊',
                message: granted === 1
                    ? 'Mood token earned (mood gauge full)'
                    : `${granted} mood tokens earned (mood gauge full)`,
                delta: 0, // game tokens, not bank tokens
                type: 'reward',
                colorKey: 'system',
                source: 'auto',
                gameTokens: nextGameTokens,
                bankTokens: state.bankCount,
                totalTokens: selectTotalWealth(state),
            };
        }
    } else if (nextProgress < 0) {
        nextProgress = 0;
    }

    return {
        ...state,
        behaviorProgress: nextProgress,
        gameTokens: nextGameTokens,
        moodWind: nextMoodWind,
        behaviorLastUpdated: nextLastUpdated,
        behaviorDelta: progressDelta,
        activityLogs: grantLog
            ? [grantLog, ...(state.activityLogs || [])].slice(0, MAX_ACTIVITY_LOGS)
            : state.activityLogs,
    };
}
