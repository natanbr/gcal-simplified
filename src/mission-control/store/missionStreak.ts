// ============================================================
// Mission Control — Mission Streak Shield
// The consecutive-missed-missions counter, the lock derived from
// it, and the two mission outcomes that move it.
//
// One counter shared by morning and evening: six misses in a row
// is ~three days of earning nothing, which is the rule as the
// parent stated it.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { ActivityLogEntry, MCAction, MCState, MissionPhase } from '../types';

/** Mirrors ActivityLogEntry['source'] without importing activityLog.ts (that would cycle). */
type LogSource = NonNullable<ActivityLogEntry['source']>;
import { getLocalDateString, MAX_ACTIVITY_LOGS, MAX_GAME_TOKENS, PROGRESS_PER_TOKEN } from './behaviorSync';

/** Consecutive misses that break the shield and freeze the child's economy. */
export const MISSED_LOCK_THRESHOLD = 6;

/** Segments drawn in the shield bar — one per miss the child can still afford. */
export const SHIELD_SEGMENTS = 6;

/** Behaviour progress lost when a mission expires unfinished. */
const TIMEOUT_BEHAVIOR_PENALTY = 20;

/** Behaviour progress gained for a mission finished without whining. */
const COMPLETION_BEHAVIOR_BONUS = 25;

export type ShieldTier = 'green' | 'amber' | 'red' | 'broken';

/**
 * Coerces a persisted value into a usable streak.
 *
 * A blob written before this feature has no field, and a NaN write serializes
 * to `null`; either one reaching the arithmetic gives `undefined + 1 = NaN`,
 * which persists as null and pins the lock permanently on or permanently off.
 */
export function sanitizeMissedStreak(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    if (value >= MISSED_LOCK_THRESHOLD) return MISSED_LOCK_THRESHOLD; // also catches Infinity
    return Math.max(0, Math.floor(value));
}

/** The colour band shown on the shield card. */
export function shieldTier(streak: number): ShieldTier {
    const s = sanitizeMissedStreak(streak);
    if (s >= MISSED_LOCK_THRESHOLD) return 'broken';
    if (s >= 5) return 'red';
    if (s >= 3) return 'amber';
    return 'green';
}

/** How many of the six segments are still filled. */
export function shieldSegmentsLeft(streak: number): number {
    return Math.max(0, SHIELD_SEGMENTS - sanitizeMissedStreak(streak));
}

/**
 * Whether the bank and the goal pedestals are frozen. Derived, never stored: a
 * second copy of this fact is a second thing that can drift out of sync with
 * the counter that actually drives it.
 */
export function isEconomyLocked(state: MCState): boolean {
    return sanitizeMissedStreak(state.missedMissionStreak) >= MISSED_LOCK_THRESHOLD;
}

/**
 * Actions refused while the shield is broken.
 *
 * The CHILD's whole economy freezes — what they can spend AND their own
 * earning loop. While the shield is broken nothing moves, and a completed
 * mission is what starts it again.
 *
 * Deliberately ABSENT, and they must stay absent:
 *   COMPLETE_MISSION_ROUTINE — the exit. Locking it makes the lock inescapable.
 *   ADD_TOKEN / ADD_TOKENS   — the parent's grant, from the phone or the app.
 *   ADJUST_SHIELD            — the parent's override, the second way out.
 *   GRANT_GAME_TOKEN         — a parent action too (the phone's button); the
 *                              MOOD gauge's automatic accrual is frozen
 *                              separately, in mcReducer's applyBehaviorSync call.
 *   REMOVE_TOKEN, REFUND_CASE — the parent correcting something.
 */
const LOCKED_WHILE_SHIELD_BROKEN: ReadonlySet<MCAction['type']> = new Set<MCAction['type']>([
    // Spending
    'SELECT_CASE',
    'DEPOSIT_TO_CASE',
    'MOVE_TOKEN',
    'VACUUM_TO_CASE',
    'CONSUME_CASE',
    'START_GAME',
    // Earning — the child's own loop
    'ADD_RESPONSIBILITY_POINT',
    'RESET_RESPONSIBILITY',
]);

/**
 * Whether the shield lock refuses this action outright.
 *
 * A predicate rather than an exported list so the reducer and `activityLog.ts`
 * cannot drift: a refused action that still writes a log line records a token
 * movement that never happened.
 */
export function isRefusedByShieldLock(state: MCState, action: MCAction): boolean {
    return LOCKED_WHILE_SHIELD_BROKEN.has(action.type) && isEconomyLocked(state);
}

/** Prepends a log entry to the ring buffer, respecting its cap. */
function withLog(state: MCState, log: ActivityLogEntry): MCState['activityLogs'] {
    return [log, ...(state.activityLogs || [])].slice(0, MAX_ACTIVITY_LOGS);
}

/** What moved the streak — the log line must not claim missions were missed
 *  when a parent moved the shield by hand from the phone. */
export type StreakCause = 'missed' | 'completed' | 'adjusted';

/**
 * The lock engaging and releasing are logged from inside the reducer: nobody
 * pressed a button to cause them, and a bank that freezes or thaws with no line
 * in the log is what the attribution rule exists to prevent.
 *
 * The id is DERIVED, not random. `createLogEntry` re-runs the reducer
 * speculatively and StrictMode double-invokes it, so `randomUUID()` here minted
 * a different id per run — identical input, different output, which breaks the
 * pure-reducer contract. Same reasoning as `auto-mood-token-*` in behaviorSync.
 *
 * `cause` keeps the sentence honest: a parent taking the last shield is NOT
 * "6 missions missed in a row", and it is not `source: auto`.
 */
function shieldLog(
    broken: boolean,
    timestampIso: string,
    cause: StreakCause,
    source: LogSource,
): ActivityLogEntry {
    const byParent = cause === 'adjusted';
    return {
        id: `auto-shield-${broken ? 'broken' : 'restored'}-${timestampIso}`,
        timestamp: timestampIso,
        icon: broken ? '🔒' : '🛡️',
        message: broken
            ? (byParent
                ? 'Last shield taken away — bank and goals locked.'
                : `Shield broken — ${MISSED_LOCK_THRESHOLD} missions missed in a row. Bank and goals locked.`)
            : (byParent
                ? 'Shield given back — bank and goals unlocked.'
                : 'Shield restored — bank and goals unlocked.'),
        type: 'mission',
        colorKey: 'system',
        source,
    };
}

/** The morning/evening outcome-date field for a phase. */
function outcomeDatePatch(phase: MissionPhase, nowIso: string): Partial<MCState> {
    const date = getLocalDateString(new Date(nowIso));
    if (phase === 'morning') return { lastCompletedOrFailedMorningDate: date };
    if (phase === 'evening') return { lastCompletedOrFailedEveningDate: date };
    return {};
}

/**
 * Moves the streak and writes the lock/unlock line when the move crosses the
 * threshold. THE ONLY WRITER during a dispatch — the timeout, the completion
 * and the parent's remote adjustment all come through here, so the transition
 * can never be logged by one path and silently skipped by another.
 */
export function applyStreakChange(
    state: MCState,
    rawNext: number,
    nowIso: string,
    cause: StreakCause,
    source: LogSource = 'auto',
): Partial<MCState> {
    const next = sanitizeMissedStreak(rawNext);
    const wasLocked = isEconomyLocked(state);
    const nowLocked = next >= MISSED_LOCK_THRESHOLD;
    if (wasLocked === nowLocked) return { missedMissionStreak: next };
    return {
        missedMissionStreak: next,
        activityLogs: withLog(state, shieldLog(nowLocked, nowIso, cause, source)),
    };
}

/**
 * A mission expired with tasks unfinished: one segment off the shield.
 *
 * The idempotency guard lives here, not at the dispatch site, because there
 * are two dispatchers — the overlay's timer and the scheduler's expiry tick
 * (the only one that fires while the overlay is minimized). Returning the same
 * reference lets React and the persist effect bail out.
 */
export function applyMissionTimeout(
    state: MCState,
    missionPhase: MissionPhase,
    nowIso: string,
): MCState {
    const mission = state.missions.find(m => m.phase === missionPhase);
    if (!mission || mission.loggedTimeoutAt) return state;

    return {
        ...state,
        behaviorProgress: Math.max(0, state.behaviorProgress - TIMEOUT_BEHAVIOR_PENALTY),
        ...applyStreakChange(state, sanitizeMissedStreak(state.missedMissionStreak) + 1, nowIso, 'missed'),
        ...outcomeDatePatch(missionPhase, nowIso),
        missions: state.missions.map(m =>
            m.phase === missionPhase ? { ...m, loggedTimeoutAt: nowIso } : m,
        ),
    };
}

/**
 * A mission routine was finished: pay the bonus and refill the shield.
 *
 * One completed mission clears the whole streak — deliberately generous,
 * because a punishment a child cannot see the end of stops working as an
 * incentive. This action is never in the locked set, so it is the way out.
 */
export function applyMissionRoutineComplete(
    state: MCState,
    missionPhase: MissionPhase,
    bonusTokens: number,
    nowIso: string,
): MCState {
    const mission = state.missions.find(m => m.phase === missionPhase);
    // Idempotency: the expiry timers in MissionOverlay and MissionTimerDisplay
    // can both fire at the same moment — only the first completion pays out.
    if (!mission || !mission.active) return state;

    const whining = mission.whiningDetected ?? false;
    // "without wining will add points. with wining will result in no change"
    let nextProgress = state.behaviorProgress + (whining ? 0 : COMPLETION_BEHAVIOR_BONUS);
    let nextGameTokens = state.gameTokens;
    const crossed = nextProgress >= PROGRESS_PER_TOKEN;
    if (crossed) {
        nextProgress -= PROGRESS_PER_TOKEN;
        nextGameTokens = Math.min(MAX_GAME_TOKENS, nextGameTokens + 1);
    }

    return {
        ...state,
        activeMission: 'none',
        bankCount: state.bankCount + bonusTokens,
        behaviorProgress: nextProgress,
        gameTokens: nextGameTokens,
        ...applyStreakChange(state, 0, nowIso, 'completed'),
        ...(crossed ? { moodWind: 0 } : {}), // earning a token resets mood — same rule as the heartbeat grant
        ...outcomeDatePatch(missionPhase, nowIso),
        missions: state.missions.map(m =>
            m.phase === missionPhase
                ? { ...m, startedAt: undefined, active: false, loggedTimeoutAt: undefined, whiningDetected: false, whiningLocked: false, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                : m,
        ),
    };
}
