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

import { economyReducer } from './reducers/economyReducer';
import { missionReducer } from './reducers/missionReducer';
import { responsibilityReducer } from './reducers/responsibilityReducer';
import { privilegeReducer } from './reducers/privilegeReducer';
import { systemReducer } from './reducers/systemReducer';

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
        case 'ADD_TOKENS':
        case 'REMOVE_TOKEN':
        case 'SELECT_CASE':
        case 'DEPOSIT_TO_CASE':
        case 'MOVE_TOKEN':
        case 'VACUUM_TO_CASE':
        case 'REFUND_CASE':
        case 'CONSUME_CASE':
            return economyReducer(state, action);

        case 'SET_PRIVILEGE_STATUS':
            return privilegeReducer(state, action);

        case 'COMPLETE_TASK':
        case 'LOCK_TASK':
        case 'SET_ACTIVE_MISSION':
        case 'RESET_MISSION':
        case 'RESET_MISSION_WITH_TIMER':
        case 'CANCEL_MISSION':
        case 'COMPLETE_MISSION_ROUTINE':
        case 'MARK_MISSION_TIMEOUT':
        case 'ADJUST_MISSION_END':
            return missionReducer(state, action);

        case 'SET_SETTINGS':
        case 'ADD_LOG':
        case 'CHEAT_ATTEMPT':
        case 'CLEAR_CHEAT_FLAG':
            return systemReducer(state, action);

        case 'ADD_RESPONSIBILITY_POINT':
        case 'RESET_RESPONSIBILITY':
            return responsibilityReducer(state, action);

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
