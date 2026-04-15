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
        icon: '🏅',
        pointIcon: '🏅',
        description: 'Skating, Swimming or Karate — tap for each session',
        rewardLabel: 'Great effort! ⭐',
        pointsRequired: 3,
        pointsEarned: 0,
        completedAt: null,
        activities: [
            { emoji: '⛸️', label: 'Skating' },
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
};

// ---- Reducer ----

function _mcReducer(state: MCState, action: MCAction): MCState {
    switch (action.type) {
        case 'ADD_TOKEN':
            return { ...state, bankCount: state.bankCount + 1 };

        case 'ADD_TOKENS':
            return { ...state, bankCount: state.bankCount + action.amount };

        case 'REMOVE_TOKEN':
            return { ...state, bankCount: Math.max(0, state.bankCount - 1) };

        case 'SELECT_CASE':
            return {
                ...state,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, status: 'active', reward: action.reward, targetCount: action.targetCount }
                        : c,
                ),
            };

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
            return {
                ...state,
                bankCount: state.bankCount + targetCase.tokenCount,
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
            if (action.taskId === 'cream') {
                const schedule = state.settings.creamTaskSchedule ?? 'evening';
                const dec = schedule === 'both' ? 0.5 : 1;
                nextState.creamTaskDaysLeft = Math.max(0, state.creamTaskDaysLeft - dec);
            }
            nextState.missions = nextState.missions.map(m =>
                m.phase === action.missionPhase
                    ? {
                        ...m,
                        tasks: m.tasks.map(t =>
                            t.id === action.taskId ? { ...t, completed: true } : t,
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
                    const [sh, sm] = m.startsAt.split(':').map(Number);
                    const [eh, em] = m.endsAt.split(':').map(Number);
                    const durationMins = (eh * 60 + em) - (sh * 60 + sm);
                    return {
                        ...m,
                        active: true,
                        startedAt: now,
                        durationMins: Math.max(0, durationMins), // no minimum — allows sub-minute test durations
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
                        ? { ...m, active: true, loggedTimeoutAt: undefined, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
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
                    const [sh, sm] = m.startsAt.split(':').map(Number);
                    const [eh, em] = m.endsAt.split(':').map(Number);
                    let durationMins = (eh * 60 + em) - (sh * 60 + sm);
                    if (durationMins < 0) durationMins += 24 * 60; // overnight wrap
                    return {
                        ...m,
                        active: true,
                        startedAt: now,
                        durationMins,
                        loggedTimeoutAt: undefined,
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
                        ? { ...m, startedAt: undefined, active: false, loggedTimeoutAt: undefined, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m
                )
            };

        case 'COMPLETE_MISSION_ROUTINE':
            return {
                ...state,
                activeMission: 'none',
                bankCount: state.bankCount + action.bonusTokens,
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, startedAt: undefined, active: false, loggedTimeoutAt: undefined, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m
                )
            };

        case 'MARK_MISSION_TIMEOUT':
            return {
                ...state,
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
                    // Adjust durationMins if mission already started; otherwise adjust endsAt HH:MM
                    if (m.startedAt && m.durationMins != null) {
                        return { ...m, durationMins: Math.max(1, m.durationMins + action.deltaMinutes) };
                    }
                    const [hh, mm] = m.endsAt.split(':').map(Number);
                    const totalMins = Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm + action.deltaMinutes));
                    const newH = String(Math.floor(totalMins / 60)).padStart(2, '0');
                    const newM = String(totalMins % 60).padStart(2, '0');
                    return { ...m, endsAt: `${newH}:${newM}` };
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
                    if (m.phase === 'morning') {
                        const dur = action.settings.morningDurationMins ?? state.settings.morningDurationMins;
                        const start = action.settings.morningStartsAt ?? state.settings.morningStartsAt;
                        const [h, min] = start.split(':').map(Number);
                        const endTotal = h * 60 + min + dur;
                        const endsAt = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
                        return {
                            ...m,
                            startsAt: start,
                            endsAt,
                            ...(mornTimeChanged ? { startedAt: undefined, durationMins: undefined, active: false } : {}),
                        };
                    }
                    if (m.phase === 'evening') {
                        const dur = action.settings.eveningDurationMins ?? state.settings.eveningDurationMins;
                        const start = action.settings.eveningStartsAt ?? state.settings.eveningStartsAt;
                        const [h, min] = start.split(':').map(Number);
                        const endTotal = h * 60 + min + dur;
                        const endsAt = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
                        return {
                            ...m,
                            startsAt: start,
                            endsAt,
                            ...(evenTimeChanged ? { startedAt: undefined, durationMins: undefined, active: false } : {}),
                        };
                    }
                    return m;
                }),
            };
        }

        case 'ADD_RESPONSIBILITY_POINT': {
            const now = new Date().toISOString();
            return {
                ...state,
                responsibilities: state.responsibilities.map(r => {
                    if (r.id !== action.taskId) return r;
                    if (r.completedAt) return r; // already complete — ignore
                    const newPoints = r.pointsEarned + 1;
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
            const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
            const nowTime = new Date().getTime();
            
            // 1. Add new log to the front
            // 2. Filter out anything older than 7 days based on timestamp
            const filteredLogs = [action.log, ...(state.activityLogs || [])].filter(log => {
                const logTime = new Date(log.timestamp).getTime();
                return (nowTime - logTime) <= SEVEN_DAYS_MS;
            });

            return {
                ...state,
                activityLogs: filteredLogs
            };
        }

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
    if (
        nextState.missions !== state.missions || 
        nextState.settings !== state.settings || 
        nextState.creamTaskDaysLeft !== state.creamTaskDaysLeft
    ) {
        nextState.missions = syncCreamTask(nextState.missions, nextState.settings, nextState.creamTaskDaysLeft);
    }
    return nextState;
}
