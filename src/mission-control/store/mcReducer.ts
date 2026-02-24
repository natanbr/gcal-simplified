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
    ResponsibilityTask,
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
];

export const initialState: MCState = {
    bankCount: 3,
    cases: defaultCases,
    privileges: defaultPrivileges,
    missions: defaultMissions,
    activeMission: 'none',
    settings: DEFAULT_SETTINGS,
    responsibilities: defaultResponsibilities,
};

// ---- Reducer ----

export function mcReducer(state: MCState, action: MCAction): MCState {
    switch (action.type) {
        case 'ADD_TOKEN':
            return { ...state, bankCount: state.bankCount + 1 };

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

        case 'COMPLETE_TASK':
            return {
                ...state,
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? {
                            ...m,
                            tasks: m.tasks.map(t =>
                                t.id === action.taskId ? { ...t, completed: true } : t,
                            ),
                        }
                        : m,
                ),
            };

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
            // Timer expired — deactivate mission but KEEP startedAt so the
            // scheduler's alreadyStartedToday guard blocks re-triggering.
            if (action.phase === 'none') {
                return {
                    ...state,
                    activeMission: 'none',
                    missions: state.missions.map(m => ({
                        ...m,
                        active: false,
                        // startedAt intentionally preserved — prevents same-day re-trigger
                        durationMins: undefined,
                    })),
                };
            }
            const now = new Date().toISOString();
            return {
                ...state,
                activeMission: action.phase,
                missions: state.missions.map(m => {
                    if (m.phase !== action.phase) return { ...m, active: false };
                    // Compute duration from HH:MM difference, store startedAt
                    const [sh, sm] = m.startsAt.split(':').map(Number);
                    const [eh, em] = m.endsAt.split(':').map(Number);
                    const durationMins = (eh * 60 + em) - (sh * 60 + sm);
                    return { ...m, active: true, startedAt: now, durationMins: Math.max(5, durationMins) };
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
                        ? { ...m, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m,
                ),
            };

        // Stop (cancel) the mission and prevent the scheduler re-triggering it
        // today by preserving startedAt (so alreadyStartedToday stays true).
        case 'CANCEL_MISSION':
            return {
                ...state,
                activeMission: 'none',
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? {
                            ...m,
                            active: false,
                            // Keep startedAt — this is the guard that stops the scheduler
                            // from re-firing the mission for the rest of the day.
                            startedAt: m.startedAt ?? new Date().toISOString(),
                            durationMins: undefined,
                        }
                        : m,
                ),
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

        case 'SET_SETTINGS':
            return {
                ...state,
                settings: { ...state.settings, ...action.settings },
                // Live-update mission startsAt/endsAt from settings so scheduler picks them up
                missions: state.missions.map(m => {
                    if (m.phase === 'morning') {
                        const dur = action.settings.morningDurationMins ?? state.settings.morningDurationMins;
                        const start = action.settings.morningStartsAt ?? state.settings.morningStartsAt;
                        const [h, min] = start.split(':').map(Number);
                        const endTotal = h * 60 + min + dur;
                        const endsAt = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
                        return { ...m, startsAt: start, endsAt };
                    }
                    if (m.phase === 'evening') {
                        const dur = action.settings.eveningDurationMins ?? state.settings.eveningDurationMins;
                        const start = action.settings.eveningStartsAt ?? state.settings.eveningStartsAt;
                        const [h, min] = start.split(':').map(Number);
                        const endTotal = h * 60 + min + dur;
                        const endsAt = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
                        return { ...m, startsAt: start, endsAt };
                    }
                    return m;
                }),
            };

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

        case 'RESET_RESPONSIBILITY':
            return {
                ...state,
                responsibilities: state.responsibilities.map(r =>
                    r.id === action.taskId
                        ? { ...r, pointsEarned: 0, completedAt: null }
                        : r,
                ),
            };

        default:
            return state;
    }
}
