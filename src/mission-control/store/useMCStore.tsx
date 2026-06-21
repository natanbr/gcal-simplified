// ============================================================
// Mission Control — Isolated State Store
// Uses React Context. No external library.
// ⚠️  Do NOT import or use outside of src/mission-control/
// ============================================================

import React, { createContext, useContext, useRef } from 'react';
import type {
    MCState,
    MissionPhase,
    ActivityLogEntry
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { mcReducer, initialState } from './mcReducer';
import { REWARD_MAP } from '../rewardCatalogue';


// ---- Logging Interceptor ----
// We keep translation logic here to keep mcReducer pure and simple.

function deriveSnapshots(state: MCState, action: Parameters<typeof mcReducer>[1]) {
    let nextBank = state.bankCount;
    let nextTotal = selectTotalWealth(state);

    switch (action.type) {
        case 'ADD_TOKEN':
            nextBank += 1;
            nextTotal += 1;
            break;
        case 'ADD_TOKENS':
            nextBank += action.amount;
            nextTotal += action.amount;
            break;
        case 'REMOVE_TOKEN':
            if (state.bankCount > 0) {
                nextBank -= 1;
                nextTotal -= 1;
            }
            break;
        case 'DEPOSIT_TO_CASE': {
            const amount = Math.min(action.amount, state.bankCount);
            nextBank -= amount;
            break;
        }
        case 'MOVE_TOKEN': {
            let valid = true;
            if (action.from === 'bank' && state.bankCount <= 0) valid = false;
            if (typeof action.from === 'number') {
                const sourceCase = state.cases.find(c => c.id === action.from);
                if (!sourceCase || sourceCase.tokenCount <= 0) valid = false;
            }
            if (typeof action.to === 'number') {
                const targetCase = state.cases.find(c => c.id === action.to);
                if (!targetCase || targetCase.status !== 'active') valid = false;
                if (targetCase && (targetCase.reward === 'quick-game' || targetCase.tokenCount >= targetCase.targetCount)) valid = false;
            }
            if (valid) {
                if (action.from === 'bank') {
                    nextBank -= 1;
                }
                if (action.to === 'bank') {
                    nextBank += 1;
                }
            }
            break;
        }
        case 'VACUUM_TO_CASE': {
            if (state.bankCount > 0) {
                const vacuumTarget = state.cases.find(c => c.id === action.caseId);
                if (vacuumTarget && vacuumTarget.reward !== 'quick-game') {
                    const canAdd = Math.min(state.bankCount, vacuumTarget.targetCount - vacuumTarget.tokenCount);
                    if (canAdd > 0) {
                        nextBank -= canAdd;
                    }
                }
            }
            break;
        }
        case 'REFUND_CASE': {
            const targetCase = state.cases.find(c => c.id === action.caseId);
            if (targetCase) {
                nextBank += targetCase.tokenCount;
            }
            break;
        }
        case 'CONSUME_CASE': {
            const targetCase = state.cases.find(c => c.id === action.caseId);
            if (targetCase) {
                nextTotal -= targetCase.tokenCount;
            }
            break;
        }
        case 'RESET_RESPONSIBILITY': {
            if (action.claimTokens) {
                nextBank += action.claimTokens;
                nextTotal += action.claimTokens;
            }
            break;
        }
        case 'COMPLETE_MISSION_ROUTINE': {
            nextBank += action.bonusTokens;
            nextTotal += action.bonusTokens;
            break;
        }
        default:
            break;
    }

    return {
        totalTokens: nextTotal,
        bankTokens: nextBank,
        ...(action.isRemote ? { isRemote: true } : {})
    };
}

function createLogEntry(action: Parameters<typeof mcReducer>[1], state: MCState): ActivityLogEntry | null {
    const now = new Date().toISOString();
    const id = self.crypto.randomUUID();

    /** Resolve a case id → highlighted goal name (e.g. **🎮 Game**) */
    const goalLabel = (caseId: number, { bold = true } = {}) => {
        const c = state.cases.find(x => x.id === caseId);
        const r = c?.reward ? REWARD_MAP[c.reward] : null;
        const name = r ? `${r.emoji} ${r.label}` : `Goal #${caseId + 1}`;
        return bold ? `**${name}**` : name;
    };

    /** Resolve a reward key → highlighted goal name */
    const rewardLabel = (rewardKey: string, { bold = true } = {}) => {
        const r = REWARD_MAP[rewardKey as keyof typeof REWARD_MAP];
        const name = r ? `${r.emoji} ${r.label}` : rewardKey;
        return bold ? `**${name}**` : name;
    };

    const snapshots = deriveSnapshots(state, action);


    switch (action.type) {
        case 'ADD_TOKEN':
            return { id, timestamp: now, icon: '🪙', message: 'Manual token added', delta: +1, type: 'manual', colorKey: 'bank', ...snapshots };
        case 'ADD_TOKENS':
            if (action.source === 'mission') return { id, timestamp: now, icon: '🎉', message: `${action.label || 'Mission'} completed`, delta: +action.amount, type: 'mission', colorKey: action.label?.toLowerCase().includes('morning') ? 'morning' : 'evening', ...snapshots };
            if (action.source === 'responsibility') {
                const colorKey = action.label?.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
                return { id, timestamp: now, icon: '⭐', message: `${action.label || 'Activity'} completed`, delta: +action.amount, type: 'responsibility', colorKey, ...snapshots };
            }
            return { id, timestamp: now, icon: '🪙', message: `Manual tokens added`, delta: +action.amount, type: 'manual', colorKey: 'bank', ...snapshots };
        case 'REMOVE_TOKEN':
            return { id, timestamp: now, icon: '🪙', message: 'Manual token removed', delta: -1, type: 'manual', colorKey: 'bank', ...snapshots };
        case 'SELECT_CASE':
            return { id, timestamp: now, icon: '🎯', message: `Goal selected: ${rewardLabel(action.reward)}`, type: 'system', colorKey: 'system', ...snapshots };
        case 'DEPOSIT_TO_CASE': {
            const tkn = action.amount === 1 ? 'token' : 'tokens';
            return { id, timestamp: now, icon: '🏦', message: `${action.amount} ${tkn} deposited to ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snapshots };
        }
        case 'MOVE_TOKEN': {
            if (action.from === 'bank' && typeof action.to === 'number') {
                return { id, timestamp: now, icon: '📤', message: `1 token added to ${goalLabel(action.to)}`, type: 'system', colorKey: 'system', ...snapshots };
            }
            if (typeof action.from === 'number' && action.to === 'bank') {
                return { id, timestamp: now, icon: '📥', message: `1 token removed from ${goalLabel(action.from)}`, type: 'system', colorKey: 'system', ...snapshots };
            }
            if (typeof action.from === 'number' && typeof action.to === 'number') {
                return { id, timestamp: now, icon: '🔀', message: `1 token moved from ${goalLabel(action.from)} to ${goalLabel(action.to)}`, type: 'system', colorKey: 'system', ...snapshots };
            }
            return null;
        }
        case 'VACUUM_TO_CASE': {
            const target = state.cases.find(c => c.id === action.caseId);
            if (!target) return null;
            const amount = Math.min(state.bankCount, target.targetCount - target.tokenCount);
            const tkn = amount === 1 ? 'token' : 'tokens';
            return { id, timestamp: now, icon: '💨', message: `${amount} ${tkn} vacuumed to ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snapshots };
        }
        case 'REFUND_CASE': {
             const target = state.cases.find(c => c.id === action.caseId);
             if (!target) return null;
             const tkn = target.tokenCount === 1 ? 'token' : 'tokens';
             return { id, timestamp: now, icon: '↩️', message: `${target.tokenCount} ${tkn} refunded from ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snapshots };
        }
        case 'CONSUME_CASE': {
             const target = state.cases.find(c => c.id === action.caseId);
             if (!target || !target.reward) return null;
             return { id, timestamp: now, icon: '🎁', message: `Used: ${rewardLabel(target.reward)}`, delta: -target.tokenCount, type: 'reward', colorKey: 'system', ...snapshots };
        }
        case 'SET_ACTIVE_MISSION':
            if (action.phase === 'none') {
                // Scheduler-driven expiry — record which phase just timed out so
                // parents can see it in the activity log.
                const timedOutPhase = state.activeMission;
                if (timedOutPhase === 'none') return null; // already inactive, nothing to log
                const phaseLabel = timedOutPhase === 'morning' ? 'Morning' : 'Evening';
                return { id, timestamp: now, icon: '🕐', message: `${phaseLabel} mission expired`, type: 'mission', colorKey: timedOutPhase, ...snapshots };
            }
            return { id, timestamp: now, icon: action.phase === 'morning' ? '☀️' : '🌙', message: `${action.phase} mission started`, type: 'mission', colorKey: action.phase, ...snapshots };
        case 'CANCEL_MISSION':
             return { id, timestamp: now, icon: '⏹️', message: `Mission stopped`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snapshots };
        case 'MARK_MISSION_TIMEOUT':
             // Suppressed: SET_ACTIVE_MISSION phase:'none' now logs the expiry event with full
             // phase context. Logging here too would produce a duplicate entry.
             return null;
        case 'COMPLETE_MISSION_ROUTINE':
             return { id, timestamp: now, icon: '🎉', message: `${action.missionPhase === 'morning' ? 'Morning' : 'Evening'} mission completed`, delta: +action.bonusTokens, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snapshots };
        case 'COMPLETE_TASK': {
             return null; // The user requested to only log the main event, not subtasks.
        }
        case 'RESET_MISSION_WITH_TIMER':
             return { id, timestamp: now, icon: '🔄', message: `Mission fully reset (tasks + timer)`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snapshots };
        case 'ADJUST_MISSION_END':
             return { id, timestamp: now, icon: '⏱️', message: `Mission time adjusted (${action.deltaMinutes > 0 ? '+' : ''}${action.deltaMinutes}m)`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snapshots };
        case 'ADD_RESPONSIBILITY_POINT': {
             const resp = state.responsibilities.find(r => r.id === action.taskId);
             const colorKey = resp?.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
             return { id, timestamp: now, icon: resp?.icon || '⭐', message: `Point earned for ${resp?.label || 'responsibility'}`, type: 'responsibility', colorKey, ...snapshots };
        }
        case 'RESET_RESPONSIBILITY': {
             const resp = state.responsibilities.find(r => r.id === action.taskId);
             const colorKey = resp?.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
             return resp ? { id, timestamp: now, icon: resp.icon, message: `${resp.label} completed`, delta: action.claimTokens ? +action.claimTokens : undefined, type: 'responsibility', colorKey, ...snapshots } : null;
        }
        case 'CHEAT_ATTEMPT':
             return { id, timestamp: now, icon: '🚨', message: 'Unauthorized bank access attempt!', type: 'cheat-attempt', colorKey: 'cheat', ...snapshots };
        default:
            return null;
    }
}

// ---- Persistence ----

export const STORAGE_KEY = 'mc-state-v5'; // bumped: added gameTokens fields

const VALID_REWARD_IDS = new Set(Object.keys(REWARD_MAP));

export function loadPersistedState(): MCState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...initialState, _migrationVersion: 1 };
        const parsed = JSON.parse(raw) as Partial<MCState>;

        const MIGRATION_VERSION = 1;
        const storedMigrationVersion = parsed._migrationVersion ?? 0;

        let activityLogs = parsed.activityLogs || [];
        if (storedMigrationVersion < MIGRATION_VERSION) {
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            activityLogs = activityLogs
                .filter(log =>
                    !log.message.includes('Remote connection lost') &&
                    !log.message.includes('Remote control online') &&
                    (now - new Date(log.timestamp).getTime()) <= sevenDaysMs
                )
                .slice(0, 200);
        }

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
            // Merge privileges from defaults so new privileges (e.g. phone-games) always appear
            privileges: initialState.privileges.map(defaultPriv => {
                const savedPriv = parsed.privileges?.find(p => p.id === defaultPriv.id);
                return savedPriv ? { ...defaultPriv, ...savedPriv } : defaultPriv;
            }),
            activityLogs,
            gameTokens: parsed.gameTokens ?? 0,
            gameTokensLastGrantedDate: parsed.gameTokensLastGrantedDate ?? null,
            _migrationVersion: MIGRATION_VERSION,
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

export const MCContext = createContext<MCContextValue | null>(null);



export function useMCStore(): MCContextValue {
    const ctx = useContext(MCContext);
    if (!ctx) throw new Error('useMCStore must be used within MCStoreProvider');
    return ctx;
}

// ---- Convenience selectors ----

export const MIN_WEALTH_FOR_GAMES = 10;

export function selectTotalWealth(state: MCState): number {
    return state.bankCount + state.cases.reduce((sum, c) => sum + c.tokenCount, 0);
}

export function useMCTotalWealth(): number {
    return selectTotalWealth(useMCState());
}

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
