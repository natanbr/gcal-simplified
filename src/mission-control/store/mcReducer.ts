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
import {
    applyBehaviorSync,
    getLocalDateString,
    MAX_ACTIVITY_LOGS,
} from './behaviorSync';
import { gameTokenRoom, moveGauge, settleGameTokenCap } from './moodGauge';
import { applyQuizAnswer, makeLevelChangeLog } from './skillProgress';
import { applyMissionRoutineComplete, applyMissionTimeout, applyStreakChange, isEconomyLocked, isRefusedByShieldLock, sanitizeMissedStreak } from './missionStreak';
import { isQuickGameWindowOpen } from './gameWindow';
import { expireLapsedSuspensions, setPrivilegeStatus } from './privileges';
import { stampMissionActivity } from './missionActivity';
import { createDefaultSkillProgress } from '../skills/types';
import { canSelectReward, rewardCost } from '../rewardCatalogue';

// The behavior/token-economy engine lives in behaviorSync.ts; re-export its
// public names so existing consumers keep importing from this module.
export {
    applyBehaviorSync,
    isWakingHour,
    MAX_ACTIVITY_LOGS,
    MOOD_TOKENS_PER_DAY,
    moodHourlyRate,
    selectTotalWealth,
} from './behaviorSync';
export { MAX_GAME_TOKENS, PROGRESS_PER_TOKEN } from './moodGauge';

/**
 * The wall-clock instant an action happened.
 *
 * Reading the clock inside the reducer makes it impure: identical input can
 * produce different output, which breaks the "pure reducer" contract and makes
 * the speculative run in `createLogEntry` disagree with the real one. The
 * dispatch interceptor (`useMCDispatch`) stamps every action with a timestamp,
 * so in the running app this is always deterministic; the fallback only covers
 * a raw dispatch that skipped the interceptor.
 */
function actionInstant(action: MCAction): string {
    return action.timestamp ?? new Date().toISOString();
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
    missedMissionStreak: 0,
    lastCompletedOrFailedMorningDate: null,
    lastCompletedOrFailedEveningDate: null,
    behaviorProgress: 50, // Start in the middle (Yellow)
    whiningActive: false,
    moodWind: 0, // Natural/Neutral baseline — reset to this each active day
    behaviorLastUpdated: new Date().toISOString(),
    behaviorDelta: 0,
    skillProgress: createDefaultSkillProgress(),
};

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

// ---- Reducer ----

function _mcReducer(state: MCState, action: MCAction): MCState {
    // A broken shield freezes the mood gauge too. SKIPPING the sync rather than
    // zeroing the delta leaves the anchor stale, which is the point: on unlock
    // the first sync sees a gap larger than one heartbeat and re-anchors with NO
    // back-fill, so locked days cannot dump accrued progress at once.
    if (action.timestamp && !isEconomyLocked(state)) {
        state = applyBehaviorSync(state, action.timestamp);
    }
    // The shield freezes the child's own economy: spending, plus the
    // responsibility earning loop. Mission completion, parent grants and
    // ADJUST_SHIELD stay open — they are the ways out, and locking them would
    // make the lock inescapable. `activityLog.ts` calls the same predicate, so a
    // refused action can never still log a movement that did not happen.
    if (isRefusedByShieldLock(state, action)) return state;
    switch (action.type) {
        case 'ADD_TOKEN':
            return { ...state, bankCount: state.bankCount + 1 };

        case 'ADD_TOKENS':
            return { ...state, bankCount: state.bankCount + action.amount };

        case 'REMOVE_TOKEN':
            return { ...state, bankCount: Math.max(0, state.bankCount - 1) };

        case 'SELECT_CASE': {
            if (!canSelectReward(state, action.reward)) return state; // activityLog.ts mirrors this
            const isQuickGame = action.reward === 'quick-game';
            return {
                ...state,
                gameTokens: isQuickGame ? state.gameTokens - 1 : state.gameTokens,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, status: 'active', reward: action.reward, targetCount: rewardCost(state.settings, action.reward) }
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
                // Always fits: gameTokenRoom counted the goal's token all along.
                gameTokens: isQuickGame ? state.gameTokens + 1 : state.gameTokens,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, status: 'empty', reward: null, tokenCount: 0 }
                        : c,
                ),
            };
        }

        case 'SET_PRIVILEGE_STATUS':
            return { ...state, privileges: setPrivilegeStatus(state.privileges, action) };

        case 'EXPIRE_SUSPENSIONS': {
            const privileges = expireLapsedSuspensions(state.privileges, Date.parse(action.timestamp ?? ''));
            return privileges === state.privileges ? state : { ...state, privileges };
        }

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
            if (state.activeMission !== 'none') return state;

            const now = actionInstant(action);
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
                        loggedTimeoutAt: undefined, // fresh occurrence — a stale stamp capped the streak at 2
                        whiningDetected: false,
                        whiningLocked: false,
                        tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })),
                    };
                }),
            };
        }

        // Reset task progress only — mission stays active, timer keeps running.
        // Does NOT affect startedAt/durationMins/activeMission.
        //
        // Deliberately does NOT clear `loggedTimeoutAt`: this reset grants no
        // extra time, so on an already-expired mission clearing it re-armed the
        // timeout instantly and charged a second miss for a zero-second attempt.
        // RESET_MISSION_WITH_TIMER restarts the clock, so that one re-arms.
        case 'RESET_MISSION':
            return {
                ...state,
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, active: true, whiningDetected: false, whiningLocked: false, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m
                )
            };

        // Full reset — tasks AND timer restart from scratch.
        // Mission stays active with a fresh startedAt + recalculated durationMins.
        case 'RESET_MISSION_WITH_TIMER': {
            const now = actionInstant(action);
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

        case 'COMPLETE_MISSION_ROUTINE':
            return applyMissionRoutineComplete(state, action.missionPhase, action.bonusTokens, actionInstant(action));

        case 'MARK_MISSION_TIMEOUT':
            return applyMissionTimeout(state, action.missionPhase, actionInstant(action));

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
            // Must obey the SAME window as START_GAME. They once disagreed, so
            // redeeming at the evening boundary destroyed the goal (no refund)
            // and the game was then refused.
            const consuming = state.cases.find(c => c.id === action.caseId);
            if (consuming?.reward === 'quick-game' && !isQuickGameWindowOpen(state, actionInstant(action))) return state;
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
                // Pays no token itself: a gauge this fills is paid, logged, by the
                // heartbeat, unless a negative mood drains it first.
                ...moveGauge(state, behaviorDelta, 0).patch,
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
                // so nothing hangs. The scheduler restarts it only at a start this run did not reach (lastActiveAt).
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
            const now = actionInstant(action);
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
            // Ignore an exact replay of the newest entry. The remote channel can
            // redeliver, and a duplicated log line reads as a duplicated event.
            if (state.activityLogs?.[0]?.id === action.log.id) return state;
            const newLogs = [action.log, ...(state.activityLogs || [])].slice(0, MAX_ACTIVITY_LOGS);
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

        // Manual grant — a deliberate parent action (the remote app has a button
        // for it). The AUTOMATIC calendar-day grant that used to also fire this
        // is gone: it ran on every app launch as well as at midnight and never
        // recorded the date it granted for, which is where the surplus came
        // from. Automatic generation now comes only from the mood gauge
        // (applyBehaviorSync / MOOD_TOKENS_PER_DAY).
        case 'GRANT_GAME_TOKEN': {
            // Counts a Quick-Game goal's token, or a later trash loses the coin.
            if (gameTokenRoom(state) <= 0) return state;
            return { ...state, gameTokens: state.gameTokens + 1 };
        }

        case 'SETTLE_GAME_TOKEN_CAP': // logged; see useGameTokenCapSettle
            return settleGameTokenCap(state);

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
                    timestamp: new Date(actionInstant(action)).getTime()
                }
            };

        case 'START_GAME':
            // Games live in the gap between the day's missions. Enforced here and
            // not only at the pedestal: a UI-only gate is bypassable state.
            if (!isQuickGameWindowOpen(state, actionInstant(action))) return state;
            return {
                ...state,
                snakeGameActive: true
            };

        case 'END_GAME':
            return {
                ...state,
                snakeGameActive: false
            };

        case 'RECORD_QUIZ_ANSWER': {
            const instant = actionInstant(action);
            const { progress, levelChange } = applyQuizAnswer(
                state.skillProgress,
                action,
                getLocalDateString(new Date(instant)),
            );
            if (progress === state.skillProgress) return state;
            return {
                ...state,
                skillProgress: progress,
                // Level changes are the ONE thing this action logs — per-question
                // logging would flood the 200-entry ring. Written here, inside the
                // reducer, on the mood-grant precedent: no user action triggers it,
                // so it is exactly the movement that must never go unlogged.
                activityLogs: levelChange
                    ? [makeLevelChangeLog(levelChange, instant), ...(state.activityLogs || [])].slice(0, MAX_ACTIVITY_LOGS)
                    : state.activityLogs,
            };
        }

        case 'ADJUST_BEHAVIOR_PROGRESS': {
            if (!Number.isFinite(action.amount)) return state; // activityLog.ts mirrors this
            return {
                ...state,
                // At most one token per adjustment, as before the gauge could hold
                // at full (the rest stays full; the heartbeat pays the next one).
                ...moveGauge(state, action.amount, 1).patch,
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

        case 'ADJUST_SHIELD': {
            // Segments, not misses: +1 gives a shield back, so the streak drops.
            // Compare AFTER clamping, or "+1 at full" builds a new state object
            // every press and defeats the store's bail-out.
            const current = sanitizeMissedStreak(state.missedMissionStreak);
            const next = sanitizeMissedStreak(current - action.delta);
            if (next === current) return state;
            // 'adjusted' keeps the log line from claiming missions were missed
            // when the parent simply took a shield away.
            const source = action.origin ?? (action.isRemote ? 'remote' : 'local');
            return { ...state, ...applyStreakChange(state, next, actionInstant(action), 'adjusted', source) };
        }

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
    // Any start or end stamps lastActiveAt, the scheduler's memory of a run (missionActivity.ts).
    const nextState = stampMissionActivity(state, _mcReducer(state, action), actionInstant(action));
    
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

