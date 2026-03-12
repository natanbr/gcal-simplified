/* eslint-disable react-refresh/only-export-components */
// ============================================================
// Mission Control — Isolated State Store
// Uses React Context + useReducer. No external library.
// ⚠️  Do NOT import or use outside of src/mission-control/
// ============================================================

import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import type {
    MCState,
    MissionPhase,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { mcReducer, initialState } from './mcReducer';

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
    return useMCStore().dispatch;
}

/** Returns the mission matching the given phase */
export function useMission(phase: MissionPhase) {
    const { state } = useMCStore();
    return state.missions.find(m => m.phase === phase) ?? null;
}
