// ============================================================
// Mission Control — Isolated State Store
// Uses React Context. No external library.
// ⚠️  Do NOT import or use outside of src/mission-control/
// ============================================================

import React, { createContext, useContext, useRef } from 'react';
import type {
    MCState,
    MCAction,
    MissionPhase,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { initialState, selectTotalWealth } from './mcReducer';
import { createLogEntry } from './activityLog';
import { REWARD_MAP } from '../rewardCatalogue';

export { selectTotalWealth };

// ---- Persistence ----

export const STORAGE_KEY = 'mc-state-v5'; // bumped: added gameTokens fields

const MAX_GAME_TOKENS = 5;

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
            // Clamp to the cap; never top tokens back up on restart (that would
            // let a restart refund spent game tokens).
            gameTokens: Math.min(MAX_GAME_TOKENS, Math.max(0, parsed.gameTokens ?? initialState.gameTokens)),
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
    dispatch: React.Dispatch<MCAction>;
}

export const MCContext = createContext<MCContextValue | null>(null);



export function useMCStore(): MCContextValue {
    const ctx = useContext(MCContext);
    if (!ctx) throw new Error('useMCStore must be used within MCStoreProvider');
    return ctx;
}

export function useMCState(): MCState {
    return useMCStore().state;
}

export function useMCDispatch(): React.Dispatch<MCAction> {
    const { state, dispatch } = useMCStore();

    // Keep a fresh reference to state without forcing dispatch identity changes
    const stateRef = useRef(state);
    stateRef.current = state;

    // Command Wrapper / Interceptor
    return React.useCallback((action: MCAction) => {
        // Automatically inject timestamp for behavior sync
        const actionWithTimestamp: MCAction = {
            ...action,
            timestamp: action.timestamp || new Date().toISOString()
        };

        // 1. Generate Log Entry based on CURRENT state and incoming action
        const logEntry = createLogEntry(actionWithTimestamp, stateRef.current);

        // 2. Dispatch the actual action first
        dispatch(actionWithTimestamp);

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
