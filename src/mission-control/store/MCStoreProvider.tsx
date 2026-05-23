import React, { useReducer, useMemo, useEffect, useRef } from 'react';
import { mcReducer } from './mcReducer';
import { MCContext, loadPersistedState, STORAGE_KEY } from './useMCStore';
import { useGameTokenScheduler } from './useGameTokenScheduler';
import { useRemoteSync } from './useRemoteSync';

export function MCStoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const [state, dispatch] = useReducer(mcReducer, undefined, loadPersistedState);
    const contextValue = useMemo(() => ({ state, dispatch }), [state]);

    useGameTokenScheduler(dispatch);

    // Sync state to Remote Control
    useRemoteSync(state);

    // Persist state to localStorage on every change (debounced 500ms)
    const persistTimerRef = useRef<ReturnType<typeof setTimeout>>();
    useEffect(() => {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch {
                // Storage quota — fail silently
            }
        }, 500);
        return () => clearTimeout(persistTimerRef.current);
    }, [state]);

    // Sync remote control keys from Electron store
    useEffect(() => {
        if (window.ipcRenderer) {
            (window.ipcRenderer.invoke('settings:get') as Promise<{ remoteRoomId?: string; remoteKey?: string }>)
                .then((config) => {
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
