// ============================================================
// Mission Control — Pure Reducer + Initial State
// Extracted into a plain .ts file so it can be:
//   1. Unit-tested without React
//   2. Imported by useMCStore.tsx without breaking Fast Refresh
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type {
    MCState,
    MCAction,
    DisplayCase,
    PrivilegeCard,
    Mission,
    MissionTask,
    ResponsibilityTask,
    MCSettings,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';

function getLocalDateString(d: Date = new Date()): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ---- Default State ----

const defaultCases: DisplayCase[] = [
    { id: 0, status: 'empty', reward: null, tokenCount: 0, targetCount: 5 },
    { id: 1, status: 'empty', reward: null, tokenCount: 0, targetCount: 5 },
    { id: 2, status: 'empty', reward: null, tokenCount: 0, targetCount: 5 },
    { id: 3, status: 'empty', reward: null, tokenCount: 0, targetCount: 5 },
];

const defaultPrivileges: PrivilegeCard[] = [
    { id: 'knife', label: 'Knife', icon: 'Utensils', status: 'active', suspendedUntil: null },
    { id: 'scissors', label: 'Scissors', icon: 'Scissors', status: 'active', suspendedUntil: null },
    { id: 'fire', label: 'Fire Tongs', icon: 'Flame', status: 'active', suspendedUntil: null },
    { id: 'garden', label: 'Garden', icon: 'Sprout', status: 'active', suspendedUntil: null },
    { id: 'phone-games', label: 'Phone Games', icon: 'Smartphone', status: 'active', suspendedUntil: null },
];

const defaultMissions: Mission[] = [
    {
        phase: 'morning',
        startsAt: '06:00',
        endsAt: '06:30',   // 30 min duration
        active: false,
        tasks: [
            { id: 'tshirt', label: 'T-Shirt', icon: 'Shirt', completed: false, locksAt: null, locked: false },
            { id: 'toothbrush', label: 'Teeth', icon: 'Toothbrush', completed: false, locksAt: null, locked: false },
            { id: 'feed-dog', label: 'Feed Dog', icon: 'Dog', completed: false, locksAt: null, locked: false },
            { id: 'vitamin', label: 'Vitamin D', icon: 'Pill', completed: false, locksAt: null, locked: false },
            { id: 'wash-hands', label: 'Wash Hands', icon: '🙏🧼', completed: false, locksAt: null, locked: false },
        ],
    },
    {
        phase: 'evening',
        startsAt: '19:00',
        endsAt: '20:00',   // 1h duration
        active: false,
        tasks: [
            { id: 'shower', label: 'Shower', icon: 'Droplets', completed: false, locksAt: null, locked: false },
            { id: 'pjs', label: 'PJs', icon: 'Layers', completed: false, locksAt: null, locked: false },
            { id: 'cleanup', label: 'Clean Up', icon: 'ToyBrick', completed: false, locksAt: null, locked: false },
            { id: 'teeth2', label: 'Teeth', icon: 'Toothbrush', completed: false, locksAt: null, locked: false },
            { id: 'bed', label: 'Bed', icon: 'BedDouble', completed: false, locksAt: null, locked: false },
        ],
    },
];

const defaultResponsibilities: ResponsibilityTask[] = [
    {
        id: 'recycling',
        label: 'Recycling',
        icon: '♻️',
        pointIcon: '♻️',
        description: 'Collect and sort bottles for the depot',
        rewardLabel: 'Keep the bottle depot money! 🍾',
        pointsRequired: 3,
        pointsEarned: 0,
        completedAt: null,
    },
    {
        id: 'activity',
        label: 'Activity',
        icon: '🛼',
        pointIcon: '🛼',
        description: 'Skating, Swimming or Karate — tap for each session',
        rewardLabel: 'Great effort! ⭐',
        pointsRequired: 3,
        pointsEarned: 0,
        completedAt: null,
        activities: [
            { emoji: '🛼', label: 'Rollerblading' },
            { emoji: '⛸️', label: 'Ice Skating' },
            { emoji: '🏊', label: 'Swimming' },
            { emoji: '🥋', label: 'Karate' },
        ],
        tokenReward: 3,
    },
];

export const initialState: MCState = {
    bankCount: 3,
    cases: defaultCases,
    privileges: defaultPrivileges,
    missions: defaultMissions,
    activeMission: 'none',
    settings: DEFAULT_SETTINGS,
    creamTaskDaysLeft: 0,
    responsibilities: defaultResponsibilities,
    activityLogs: [],
    hasUnreviewedCheatAttempt: false,
    gameTokens: 5,
    gameTokensLastGrantedDate: null,
    snakeGameActive: false,
    lastCompletedOrFailedMorningDate: null,
    lastCompletedOrFailedEveningDate: null,
    behaviorProgress: 50, // Start in the middle (Yellow)
    whiningActive: false,
    moodWind: 0, // Natural/Neutral baseline — reset to this each active day
    behaviorLastUpdated: new Date().toISOString(),
    behaviorDelta: 0,
};

// ---- Selectors ----

/** Total tokens owned: bank + everything deposited into goal cases. */
export function selectTotalWealth(state: MCState): number {
    return state.bankCount + state.cases.reduce((sum, c) => sum + c.tokenCount, 0);
}

// ---- Time Helpers ----

function parseHhmmToMins(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

function minsToHhmm(totalMins: number): string {
    return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
}

/** Duration between two HH:MM times, wrapping past midnight when needed. */
function computeMissionDurationMins(startsAt: string, endsAt: string): number {
    let durationMins = parseHhmmToMins(endsAt) - parseHhmmToMins(startsAt);
    if (durationMins < 0) durationMins += 24 * 60; // overnight wrap
    return durationMins;
}

// ---- Helpers for Behavior Progress ----

/**
 * Behavior-progress change per *active hour*, keyed by mood level (-2..+2).
 * Positive fills the gauge toward a game token; negative drains it.
 * These are the single source of truth for the mood → progress rates.
 */
export const MOOD_HOURLY_RATE: Record<number, number> = {
    2: 8.5,   // Excellent
    1: 4,     // Good
    0: 1,     // Neutral
    [-1]: -3, // Bad
    [-2]: -8, // Horrible
};

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
    const hourlyRate = MOOD_HOURLY_RATE[moodWind] ?? 0;

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

function applyBehaviorSync(state: MCState, nowIso: string): MCState {
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

    if (nextProgress >= 100) {
        const tokensToGrant = Math.floor(nextProgress / 100);
        nextProgress = nextProgress % 100;
        nextGameTokens = Math.min(5, nextGameTokens + tokensToGrant);
    } else if (nextProgress < 0) {
        nextProgress = 0;
    }

    return {
        ...state,
        behaviorProgress: nextProgress,
        gameTokens: nextGameTokens,
        behaviorLastUpdated: nextLastUpdated,
        behaviorDelta: progressDelta
    };
}

// ---- Reducer ----

function _mcReducer(state: MCState, action: MCAction): MCState {
    if (action.timestamp) {
        state = applyBehaviorSync(state, action.timestamp);
    }
    switch (action.type) {
        case 'ADD_TOKEN':
            return { ...state, bankCount: state.bankCount + 1 };

        case 'ADD_TOKENS':
            return { ...state, bankCount: state.bankCount + action.amount };

        case 'REMOVE_TOKEN':
            return { ...state, bankCount: Math.max(0, state.bankCount - 1) };

        case 'SELECT_CASE': {
            const isQuickGame = action.reward === 'quick-game';
            if (isQuickGame && state.gameTokens <= 0) return state;

            return {
                ...state,
                gameTokens: isQuickGame ? state.gameTokens - 1 : state.gameTokens,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, status: 'active', reward: action.reward, targetCount: action.targetCount }
                        : c,
                ),
            };
        }

        case 'DEPOSIT_TO_CASE': {
            const amount = Math.min(action.amount, state.bankCount);
            return {
                ...state,
                bankCount: state.bankCount - amount,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, tokenCount: c.tokenCount + amount }
                        : c,
                ),
            };
        }

        case 'MOVE_TOKEN': {
            // Source Validation
            if (action.from === 'bank' && state.bankCount <= 0) return state;
            if (typeof action.from === 'number') {
                const sourceCase = state.cases.find(c => c.id === action.from);
                if (!sourceCase || sourceCase.tokenCount <= 0) return state;
            }

            // Target Validation
            if (typeof action.to === 'number') {
                const targetCase = state.cases.find(c => c.id === action.to);
                if (!targetCase || targetCase.status !== 'active') return state;
                if (targetCase.reward === 'quick-game') return state;
                if (targetCase.tokenCount >= targetCase.targetCount) return state;
            }

            let newBankCount = state.bankCount;
            let newCases = state.cases;

            // Decrement source
            if (action.from === 'bank') {
                newBankCount -= 1;
            } else {
                newCases = newCases.map(c => c.id === action.from ? { ...c, tokenCount: Math.max(0, c.tokenCount - 1) } : c);
            }

            // Increment target
            if (action.to === 'bank') {
                newBankCount += 1;
            } else {
                newCases = newCases.map(c => c.id === action.to ? { ...c, tokenCount: c.tokenCount + 1 } : c);
            }

            return {
                ...state,
                bankCount: newBankCount,
                cases: newCases,
            };
        }

        case 'VACUUM_TO_CASE': {
            if (state.bankCount === 0) return state;
            const vacuumTarget = state.cases.find(c => c.id === action.caseId);
            if (!vacuumTarget) return state;
            if (vacuumTarget.reward === 'quick-game') return state;
            const canAdd = Math.min(state.bankCount, vacuumTarget.targetCount - vacuumTarget.tokenCount);
            if (canAdd <= 0) return state;
            return {
                ...state,
                bankCount: state.bankCount - canAdd,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, tokenCount: c.tokenCount + canAdd }
                        : c,
                ),
            };
        }

        case 'REFUND_CASE': {
            const targetCase = state.cases.find(c => c.id === action.caseId);
            if (!targetCase) return state;
            const isQuickGame = targetCase.reward === 'quick-game';
            return {
                ...state,
                bankCount: state.bankCount + targetCase.tokenCount,
                gameTokens: isQuickGame ? Math.min(5, state.gameTokens + 1) : state.gameTokens,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, status: 'empty', reward: null, tokenCount: 0 }
                        : c,
                ),
            };
        }

        case 'SET_PRIVILEGE_STATUS':
            return {
                ...state,
                privileges: state.privileges.map(p =>
                    p.id === action.cardId
                        ? { ...p, status: action.status, suspendedUntil: action.suspendedUntil }
                        : p,
                ),
            };

        case 'COMPLETE_TASK': {
            const nextState = { ...state };
            const currentMission = state.missions.find(m => m.phase === action.missionPhase);
            const currentTask = currentMission?.tasks.find(t => t.id === action.taskId);
            if (!currentTask) return state;

            const wasCompleted = currentTask.completed;
            const nextCompleted = !wasCompleted;

            if (action.taskId === 'cream') {
                const schedule = state.settings.creamTaskSchedule ?? 'evening';
                const dec = schedule === 'both' ? 0.5 : 1;
                if (nextCompleted) {
                    nextState.creamTaskDaysLeft = Math.max(0, state.creamTaskDaysLeft - dec);
                } else {
                    nextState.creamTaskDaysLeft = state.creamTaskDaysLeft + dec;
                }
            }
            nextState.missions = nextState.missions.map(m =>
                m.phase === action.missionPhase
                    ? {
                        ...m,
                        tasks: m.tasks.map(t =>
                            t.id === action.taskId ? { ...t, completed: nextCompleted } : t,
                        ),
                    }
                    : m,
            );
            // Auto-disable if today was the last day
            if (action.taskId === 'cream' && nextState.creamTaskDaysLeft === 0) {
                 nextState.settings = { ...nextState.settings, creamTaskEnabled: false };
            }
            return nextState;
        }

        case 'LOCK_TASK':
            return {
                ...state,
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? {
                            ...m,
                            tasks: m.tasks.map(t =>
                                t.id === action.taskId ? { ...t, locked: true } : t,
                            ),
                        }
                        : m,
                ),
            };

        case 'SET_ACTIVE_MISSION': {
            // Timer expired — deactivate. Tasks are intentionally left as-is
            // (they're reset when the mission re-triggers via SET_ACTIVE_MISSION).
            if (action.phase === 'none') {
                return {
                    ...state,
                    activeMission: 'none',
                    missions: state.missions.map(m => ({
                        ...m,
                        active: false,
                        durationMins: undefined,
                    })),
                };
            }

            // Only one mission at a time — if one is already running, ignore the new trigger
            if (state.activeMission !== 'none') {
                return state;
            }

            const now = new Date().toISOString();
            return {
                ...state,
                activeMission: action.phase,
                missions: state.missions.map(m => {
                    if (m.phase !== action.phase) return { ...m, active: false };
                    // Every trigger is a fresh start: new timer, reset checklist.
                    return {
                        ...m,
                        active: true,
                        startedAt: now,
                        durationMins: computeMissionDurationMins(m.startsAt, m.endsAt), // no minimum — allows sub-minute test durations
                        whiningDetected: false,
                        whiningLocked: false,
                        tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })),
                    };
                }),
            };
        }

        // Reset task progress only — mission stays active, timer keeps running.
        // Does NOT affect startedAt/durationMins/activeMission.
        case 'RESET_MISSION':
            return {
                ...state,
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, active: true, loggedTimeoutAt: undefined, whiningDetected: false, whiningLocked: false, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m
                )
            };

        // Full reset — tasks AND timer restart from scratch.
        // Mission stays active with a fresh startedAt + recalculated durationMins.
        case 'RESET_MISSION_WITH_TIMER': {
            const now = new Date().toISOString();
            return {
                ...state,
                missions: state.missions.map(m => {
                    if (m.phase !== action.missionPhase) return m;
                    return {
                        ...m,
                        active: true,
                        startedAt: now,
                        durationMins: computeMissionDurationMins(m.startsAt, m.endsAt),
                        loggedTimeoutAt: undefined,
                        whiningDetected: false,
                        whiningLocked: false,
                        tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })),
                    };
                }),
            };
        }

        case 'CANCEL_MISSION':
            return {
                ...state,
                activeMission: 'none',
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, startedAt: undefined, active: false, loggedTimeoutAt: undefined, whiningDetected: false, whiningLocked: false, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m
                )
            };

        case 'COMPLETE_MISSION_ROUTINE': {
            const mission = state.missions.find(m => m.phase === action.missionPhase);
            // Idempotency guard: the expiry timers in MissionOverlay and
            // MissionTimerDisplay can both fire at the same moment — only the
            // first completion may grant tokens/behavior bonus.
            if (!mission || !mission.active) return state;
            const whining = mission.whiningDetected ?? false;
            
            // "without wining will add points. with wining will result in no change"
            const behaviorBonus = whining ? 0 : 25;
            let nextProgress = state.behaviorProgress + behaviorBonus;
            let nextGameTokens = state.gameTokens;
            
            if (nextProgress >= 100) {
                nextProgress -= 100;
                nextGameTokens = Math.min(5, nextGameTokens + 1);
            }

            return {
                ...state,
                activeMission: 'none',
                bankCount: state.bankCount + action.bonusTokens,
                behaviorProgress: nextProgress,
                gameTokens: nextGameTokens,
                ...(action.missionPhase === 'morning' ? { lastCompletedOrFailedMorningDate: getLocalDateString() } : {}),
                ...(action.missionPhase === 'evening' ? { lastCompletedOrFailedEveningDate: getLocalDateString() } : {}),
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, startedAt: undefined, active: false, loggedTimeoutAt: undefined, whiningDetected: false, whiningLocked: false, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m
                )
            };
        }

        case 'MARK_MISSION_TIMEOUT':
            return {
                ...state,
                behaviorProgress: Math.max(0, state.behaviorProgress - 20), // "not completing missions will reduce"
                ...(action.missionPhase === 'morning' ? { lastCompletedOrFailedMorningDate: getLocalDateString() } : {}),
                ...(action.missionPhase === 'evening' ? { lastCompletedOrFailedEveningDate: getLocalDateString() } : {}),
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, loggedTimeoutAt: new Date().toISOString() }
                        : m
                )
            };

        case 'ADJUST_MISSION_END': {
            return {
                ...state,
                missions: state.missions.map(m => {
                    if (m.phase !== action.missionPhase) return m;
                    // Ignore adjustments if mission is not actively running
                    if (!m.active || !m.startedAt || m.durationMins == null) return m;
                    
                    return { ...m, durationMins: Math.max(1, m.durationMins + action.deltaMinutes) };
                }),
            };
        }

        case 'CONSUME_CASE': {
            // Permanently remove tokens from case (reward redeemed) — NO bank refund
            return {
                ...state,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, status: 'empty' as const, reward: null, tokenCount: 0 }
                        : c,
                ),
            };
        }

        case 'TOGGLE_WHINING': {
            const isGlobal = action.missionPhase === 'none';
            const mission = !isGlobal ? state.missions.find(m => m.phase === action.missionPhase) : null;
            const nowDetected = isGlobal ? !state.whiningActive : (mission ? !mission.whiningDetected : false);
            
            const behaviorDelta = nowDetected ? -10 : 2; 
            
            return {
                ...state,
                behaviorProgress: Math.max(0, Math.min(100, state.behaviorProgress + behaviorDelta)),
                whiningActive: isGlobal ? nowDetected : state.whiningActive,
                missions: state.missions.map(m => {
                    if (m.phase !== action.missionPhase) return m;
                    if (m.whiningLocked && !action.lockedFromUI) return m;
                    return {
                        ...m,
                        whiningDetected: !m.whiningDetected,
                        whiningLocked: action.lockedFromUI ? true : m.whiningLocked
                    };
                }),
            };
        }

        case 'SET_SETTINGS': {
            const nextSettings = { ...state.settings, ...action.settings };
            let nextDaysLeft = state.creamTaskDaysLeft;
            
            if (action.settings.creamTaskEnabled && !state.settings.creamTaskEnabled) {
                // Just enabled — start fresh
                nextDaysLeft = nextSettings.creamTaskDaysTarget;
            } else if (action.settings.creamTaskDaysTarget !== undefined && action.settings.creamTaskDaysTarget !== state.settings.creamTaskDaysTarget) {
                 // Target changed, reset current progress
                 nextDaysLeft = action.settings.creamTaskDaysTarget;
            }

            // If the start time of the currently-active mission changes, we must also
            // deactivate it — otherwise durationMins is wiped but active stays true,
            // making the expiry check `durationMins != null` permanently false (hung mission).
            const mornTimeChanged =
                (action.settings.morningStartsAt ?? state.settings.morningStartsAt) !== state.settings.morningStartsAt;
            const evenTimeChanged =
                (action.settings.eveningStartsAt ?? state.settings.eveningStartsAt) !== state.settings.eveningStartsAt;
            const activeIsBeingRescheduled =
                (state.activeMission === 'morning' && mornTimeChanged) ||
                (state.activeMission === 'evening' && evenTimeChanged);

            return {
                ...state,
                settings: nextSettings,
                creamTaskDaysLeft: nextDaysLeft,
                // Deactivate root if the running mission's start time was changed
                ...(activeIsBeingRescheduled ? { activeMission: 'none' as const } : {}),
                // Live-update mission startsAt/endsAt from settings so scheduler picks them up.
                // If the start time changes, clear startedAt, durationMins, and active
                // so the scheduler can re-trigger at the new time without getting stuck.
                missions: state.missions.map(m => {
                    if (m.phase !== 'morning' && m.phase !== 'evening') return m;
                    const isMorning = m.phase === 'morning';
                    const dur = isMorning
                        ? action.settings.morningDurationMins ?? state.settings.morningDurationMins
                        : action.settings.eveningDurationMins ?? state.settings.eveningDurationMins;
                    const start = isMorning
                        ? action.settings.morningStartsAt ?? state.settings.morningStartsAt
                        : action.settings.eveningStartsAt ?? state.settings.eveningStartsAt;
                    const timeChanged = isMorning ? mornTimeChanged : evenTimeChanged;
                    return {
                        ...m,
                        startsAt: start,
                        endsAt: minsToHhmm(parseHhmmToMins(start) + dur),
                        ...(timeChanged ? { startedAt: undefined, durationMins: undefined, active: false } : {}),
                    };
                }),
            };
        }

        case 'ADD_RESPONSIBILITY_POINT': {
            const now = new Date().toISOString();
            return {
                ...state,
                responsibilities: state.responsibilities.map(r => {
                    if (r.id !== action.taskId) return r;
                    if (r.completedAt && (action.amount || 1) > 0) return r; // already complete — ignore if adding
                    const newPoints = Math.max(0, r.pointsEarned + (action.amount || 1));
                    const isComplete = newPoints >= r.pointsRequired;
                    return {
                        ...r,
                        pointsEarned: newPoints,
                        completedAt: isComplete ? now : null,
                    };
                }),
            };
        }

        case 'RESET_RESPONSIBILITY': {
            const addedBank = action.claimTokens ? state.bankCount + action.claimTokens : state.bankCount;
            return {
                ...state,
                bankCount: addedBank,
                responsibilities: state.responsibilities.map(r =>
                    r.id === action.taskId
                        ? { ...r, pointsEarned: 0, completedAt: null }
                        : r
                )
            };
        }

        case 'ADD_LOG': {
            const newLogs = [action.log, ...(state.activityLogs || [])].slice(0, 200);
            return {
                ...state,
                activityLogs: newLogs
            };
        }

        case 'CLEAR_LOGS':
            return {
                ...state,
                activityLogs: [],
            };

        case 'CHEAT_ATTEMPT':
            return {
                ...state,
                hasUnreviewedCheatAttempt: true,
            };

        case 'CLEAR_CHEAT_FLAG':
            return {
                ...state,
                hasUnreviewedCheatAttempt: false,
            };

        case 'GRANT_GAME_TOKEN': {
            if (state.gameTokens >= 5) return state;
            return {
                ...state,
                gameTokens: Math.min(5, state.gameTokens + 1),
            };
        }

        case 'CONSUME_GAME_TOKEN':
            if (state.gameTokens <= 0) return state;
            return { ...state, gameTokens: state.gameTokens - 1 };

        case 'RESET_GAME_TOKENS':
            return {
                ...state,
                gameTokens: 0,
                gameTokensLastGrantedDate: null,
            };

        case 'TRIGGER_ANIMATION':
            return {
                ...state,
                lastAnimationTrigger: {
                    type: action.animation,
                    timestamp: Date.now()
                }
            };

        case 'START_GAME':
            return {
                ...state,
                snakeGameActive: true
            };

        case 'END_GAME':
            return {
                ...state,
                snakeGameActive: false
            };

        case 'ADJUST_BEHAVIOR_PROGRESS': {
            let nextProgress = state.behaviorProgress + action.amount;
            let nextGameTokens = state.gameTokens;
            if (nextProgress >= 100) {
                nextProgress -= 100;
                nextGameTokens = Math.min(5, nextGameTokens + 1);
            }
            return {
                ...state,
                behaviorProgress: Math.max(0, Math.min(100, nextProgress)),
                gameTokens: nextGameTokens,
                behaviorDelta: action.amount,
            };
        }

        case 'BEHAVIOR_TICK': {
            // DEPRECATED: We now use event-driven SYNC_BEHAVIOR
            return state;
        }

        case 'SET_MOOD_WIND':
            return {
                ...state,
                moodWind: Math.max(-2, Math.min(2, action.level))
            };

        case 'SYNC_BEHAVIOR':
            return state; // sync already happened via timestamp wrapper

        default:
            return state;
    }
}

// ---- Task Injection Sync ----
// Safely adds/removes/updates the Cream routine in the active missions arrays.
function syncCreamTask(missions: Mission[], settings: MCSettings, daysLeft: number): Mission[] {
    return missions.map(m => {
        const isEvening = m.phase === 'evening';
        const isMorning = m.phase === 'morning';
        const schedule = settings.creamTaskSchedule ?? 'evening';
        
        let shouldHaveCreamInPhase = false;
        if (settings.creamTaskEnabled && daysLeft > 0) {
             if (schedule === 'both' && (isMorning || isEvening)) shouldHaveCreamInPhase = true;
             else if (schedule === 'morning' && isMorning) shouldHaveCreamInPhase = true;
             else if (schedule === 'evening' && isEvening) shouldHaveCreamInPhase = true;
        }
        
        const hasCream = m.tasks.some(t => t.id === 'cream');
        const expectedLabel = `Cream (${Math.ceil(daysLeft)}d left)`;
        
        if (shouldHaveCreamInPhase && !hasCream) {
            // Inject before bed for evening, or at the end for morning
            const bedIndex = m.tasks.findIndex(t => t.id === 'bed');
            const newTasks = [...m.tasks];
            const creamTask: MissionTask = {
                id: 'cream',
                label: expectedLabel,
                icon: 'Droplet',
                completed: false,
                locksAt: null,
                locked: false
            };
            if (bedIndex !== -1) newTasks.splice(bedIndex, 0, creamTask);
            else newTasks.push(creamTask);
            return { ...m, tasks: newTasks };
        } else if (!shouldHaveCreamInPhase && hasCream) {
            // Remove it
            return { ...m, tasks: m.tasks.filter(t => t.id !== 'cream') };
        } else if (hasCream && shouldHaveCreamInPhase) {
            // Ensure label is updated
            const needUpdate = m.tasks.some(t => t.id === 'cream' && t.label !== expectedLabel);
            if (needUpdate) {
                return {
                    ...m,
                    tasks: m.tasks.map(t => t.id === 'cream' ? { ...t, label: expectedLabel } : t)
                };
            }
        }
        return m;
    });
}

// Wrapper ensures invariants are always synced after *any* dispatch
export function mcReducer(state: MCState, action: MCAction): MCState {
    const nextState = _mcReducer(state, action);
    
    const shouldSync = 
        action.type === 'SET_SETTINGS' ||
        action.type === 'COMPLETE_TASK' ||
        action.type === 'SET_ACTIVE_MISSION' ||
        action.type === 'RESET_MISSION' ||
        action.type === 'RESET_MISSION_WITH_TIMER' ||
        action.type === 'CANCEL_MISSION' ||
        action.type === 'COMPLETE_MISSION_ROUTINE' ||
        action.type === 'LOCK_TASK' ||
        action.type === 'TOGGLE_WHINING' ||
        action.type === 'ADJUST_MISSION_END';

    if (shouldSync) {
        if (
            nextState.missions !== state.missions || 
            nextState.settings !== state.settings || 
            nextState.creamTaskDaysLeft !== state.creamTaskDaysLeft
        ) {
            nextState.missions = syncCreamTask(nextState.missions, nextState.settings, nextState.creamTaskDaysLeft);
        }
    }
    return nextState;
}

