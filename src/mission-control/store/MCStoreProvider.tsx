import React, { useReducer, useMemo, useEffect } from 'react';
import { mcReducer } from './mcReducer';
import { MCContext, loadPersistedState, STORAGE_KEY } from './useMCStore';
import { useGameTokenScheduler } from './useGameTokenScheduler';

export function MCStoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const [state, dispatch] = useReducer(mcReducer, undefined, loadPersistedState);
    const contextValue = useMemo(() => ({ state, dispatch }), [state]);

    useGameTokenScheduler(dispatch);

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
