// ============================================================
// Mission Control — Isolated State Store
// Uses React Context + useReducer. No external library.
// ⚠️  Do NOT import or use outside of src/mission-control/
// ============================================================

import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
    MCState,
    MissionPhase,
    ActivityLogEntry
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { mcReducer, initialState } from './mcReducer';

// ---- Logging Interceptor ----
// We keep translation logic here to keep mcReducer pure and simple.

function createLogEntry(action: Parameters<typeof mcReducer>[1], state: MCState): ActivityLogEntry | null {
    const now = new Date().toISOString();
    const id = self.crypto.randomUUID();

    switch (action.type) {
        case 'ADD_TOKEN':
            return { id, timestamp: now, icon: '🪙', message: 'Manual token added', delta: +1, type: 'manual', colorKey: 'bank' };
        case 'ADD_TOKENS':
            if (action.source === 'mission') return { id, timestamp: now, icon: '🎉', message: `${action.label || 'Mission'} completed`, delta: +action.amount, type: 'mission', colorKey: action.label?.toLowerCase().includes('morning') ? 'morning' : 'evening' };
            if (action.source === 'responsibility') {
                const colorKey = action.label?.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
                return { id, timestamp: now, icon: '⭐', message: `${action.label || 'Activity'} completed`, delta: +action.amount, type: 'responsibility', colorKey };
            }
            return { id, timestamp: now, icon: '🪙', message: `Manual tokens added`, delta: +action.amount, type: 'manual', colorKey: 'bank' };
        case 'REMOVE_TOKEN':
            return { id, timestamp: now, icon: '🪙', message: 'Manual token removed', delta: -1, type: 'manual', colorKey: 'bank' };
        case 'SELECT_CASE':
            return { id, timestamp: now, icon: '🎯', message: `Goal selected: ${action.reward}`, type: 'system', colorKey: 'system' };
        case 'DEPOSIT_TO_CASE':
            return { id, timestamp: now, icon: '🏦', message: `Deposited tokens to goal`, delta: -action.amount, type: 'system', colorKey: 'system' };
        case 'MOVE_TOKEN':
            if (action.from === 'bank') return { id, timestamp: now, icon: '📤', message: `Token transferred to goal`, delta: -1, type: 'system', colorKey: 'system' };
            if (action.to === 'bank') return { id, timestamp: now, icon: '📥', message: `Token transferred to bank`, delta: +1, type: 'system', colorKey: 'system' };
            return null; // case to case
        case 'VACUUM_TO_CASE': {
            const target = state.cases.find(c => c.id === action.caseId);
            if (!target) return null;
            const amount = Math.min(state.bankCount, target.targetCount - target.tokenCount);
            return { id, timestamp: now, icon: '💨', message: `Vacuumed tokens to goal`, delta: -amount, type: 'system', colorKey: 'system' };
        }
        case 'REFUND_CASE': {
             const target = state.cases.find(c => c.id === action.caseId);
             return target ? { id, timestamp: now, icon: '↩️', message: `Goal tokens refunded`, delta: +target.tokenCount, type: 'system', colorKey: 'system' } : null;
        }
        case 'CONSUME_CASE': {
             const target = state.cases.find(c => c.id === action.caseId);
             return target && target.reward ? { id, timestamp: now, icon: '🎁', message: `Used reward: ${target.reward}`, type: 'reward', colorKey: 'system' } : null;
        }
        case 'SET_ACTIVE_MISSION':
            if (action.phase === 'none') {
                // Scheduler-driven expiry — record which phase just timed out so
                // parents can see it in the activity log.
                const timedOutPhase = state.activeMission;
                if (timedOutPhase === 'none') return null; // already inactive, nothing to log
                const phaseLabel = timedOutPhase === 'morning' ? 'Morning' : 'Evening';
                return { id, timestamp: now, icon: '🕐', message: `${phaseLabel} mission expired`, type: 'mission', colorKey: timedOutPhase };
            }
            return { id, timestamp: now, icon: action.phase === 'morning' ? '☀️' : '🌙', message: `${action.phase} mission started`, type: 'mission', colorKey: action.phase };
        case 'CANCEL_MISSION':
             return { id, timestamp: now, icon: '⏹️', message: `Mission stopped`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase };
        case 'MARK_MISSION_TIMEOUT':
             // Suppressed: SET_ACTIVE_MISSION phase:'none' now logs the expiry event with full
             // phase context. Logging here too would produce a duplicate entry.
             return null;
        case 'COMPLETE_MISSION_ROUTINE':
             return { id, timestamp: now, icon: '🎉', message: `${action.missionPhase === 'morning' ? 'Morning' : 'Evening'} mission completed`, delta: +action.bonusTokens, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase };
        case 'COMPLETE_TASK': {
             return null; // The user requested to only log the main event, not subtasks.
        }
        case 'ADJUST_MISSION_END':
             return { id, timestamp: now, icon: '⏱️', message: `Mission time adjusted (${action.deltaMinutes > 0 ? '+' : ''}${action.deltaMinutes}m)`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase };
        case 'ADD_RESPONSIBILITY_POINT': {
             const resp = state.responsibilities.find(r => r.id === action.taskId);
             const colorKey = resp?.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
             return { id, timestamp: now, icon: resp?.icon || '⭐', message: `Point earned for ${resp?.label || 'responsibility'}`, type: 'responsibility', colorKey };
        }
        case 'RESET_RESPONSIBILITY': {
             const resp = state.responsibilities.find(r => r.id === action.taskId);
             const colorKey = resp?.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
             return resp ? { id, timestamp: now, icon: resp.icon, message: `${resp.label} completed`, delta: action.claimTokens ? +action.claimTokens : undefined, type: 'responsibility', colorKey } : null;
        }
        default:
            return null;
    }
}

// ---- Persistence ----

import { REWARD_MAP } from '../rewardCatalogue';

const STORAGE_KEY = 'mc-state-v4'; // bumped: added settings field

const VALID_REWARD_IDS = new Set(Object.keys(REWARD_MAP));

function loadPersistedState(): MCState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return initialState;
        const parsed = JSON.parse(raw) as Partial<MCState>;
        return {
            ...initialState,
            ...parsed,
            // Merge saved settings over defaults (so new settings fields always have values)
            settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
            // Merge cases from initialState so new cases (e.g. 4th slot) always appear
            cases: initialState.cases.map(defaultCase => {
                const savedCase = parsed.cases?.find(c => c.id === defaultCase.id);
                if (!savedCase) return defaultCase;
                return {
                    ...defaultCase,
                    ...savedCase,
                    targetCount: savedCase.targetCount ?? defaultCase.targetCount,
                    reward: savedCase.reward && VALID_REWARD_IDS.has(savedCase.reward) ? savedCase.reward : null,
                    status: savedCase.reward && !VALID_REWARD_IDS.has(savedCase.reward) ? 'empty' : savedCase.status,
                };
            }),
            missions: initialState.missions.map(defaultM => {
                const savedM = parsed.missions?.find(m => m.phase === defaultM.phase);
                if (!savedM) return defaultM;
                return {
                    ...defaultM,
                    ...savedM,
                    tasks: defaultM.tasks.map(dt => {
                        const st = savedM.tasks?.find(t => t.id === dt.id);
                        // Always take icon + label from default (they're UI display values,
                        // not user data), so code changes are always reflected even if
                        // localStorage has a stale value.
                        return st ? { ...dt, ...st, icon: dt.icon, label: dt.label } : dt;
                    }),
                };
            }),
            // Merge responsibilities from defaults so new tasks always appear
            responsibilities: initialState.responsibilities.map(defaultR => {
                const savedR = parsed.responsibilities?.find(r => r.id === defaultR.id);
                return savedR ? { ...defaultR, ...savedR } : defaultR;
            }),
            activityLogs: parsed.activityLogs || [],
        };
    } catch {
        return initialState;
    }
}

// ---- Context ----

interface MCContextValue {
    state: MCState;
    dispatch: React.Dispatch<Parameters<typeof mcReducer>[1]>;
}

const MCContext = createContext<MCContextValue | null>(null);

export function MCStoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const [state, dispatch] = useReducer(mcReducer, undefined, loadPersistedState);
    const contextValue = useMemo(() => ({ state, dispatch }), [state]);

    // Persist state to localStorage on every change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // Storage quota — fail silently
        }
    }, [state]);

    return (
        <MCContext.Provider value={contextValue}>
            {children}
        </MCContext.Provider>
    );
}

export function useMCStore(): MCContextValue {
    const ctx = useContext(MCContext);
    if (!ctx) throw new Error('useMCStore must be used within MCStoreProvider');
    return ctx;
}

// ---- Convenience selectors ----

export function useMCState(): MCState {
    return useMCStore().state;
}

export function useMCDispatch(): React.Dispatch<Parameters<typeof mcReducer>[1]> {
    const { state, dispatch } = useMCStore();
    
    // Keep a fresh reference to state without forcing dispatch identity changes
    const stateRef = useRef(state);
    stateRef.current = state;
    
    // Command Wrapper / Interceptor
    return React.useCallback((action: Parameters<typeof mcReducer>[1]) => {
        // 1. Generate Log Entry based on CURRENT state and incoming action
        const logEntry = createLogEntry(action, stateRef.current);
        
        // 2. Dispatch the actual action first
        dispatch(action);
        
        // 3. Dispatch the logging side-effect if we recorded one
        if (logEntry) {
            dispatch({ type: 'ADD_LOG', log: logEntry });
        }
    }, [dispatch]);
}

/** Returns the mission matching the given phase */
export function useMission(phase: MissionPhase) {
    const { state } = useMCStore();
    return state.missions.find(m => m.phase === phase) ?? null;
}
