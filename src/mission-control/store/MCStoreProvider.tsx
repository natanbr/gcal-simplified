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

    // Sync remote control keys from Electron store
    useEffect(() => {
        // @ts-ignore
        if (window.ipcRenderer) {
            // @ts-ignore
            window.ipcRenderer.invoke('settings:get').then((config: any) => {
                if (config.remoteRoomId && config.remoteKey) {
                    dispatch({ 
                        type: 'SET_SETTINGS', 
                        settings: { 
                            remoteRoomId: config.remoteRoomId, 
                            remoteKey: config.remoteKey 
                        } 
                    });
                }
            });
        }
    }, []);

    return (
        <MCContext.Provider value={contextValue}>
            {children}
        </MCContext.Provider>
    );
}
