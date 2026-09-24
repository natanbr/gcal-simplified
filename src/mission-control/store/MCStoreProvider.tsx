import React, { useReducer, useMemo, useEffect, useRef } from 'react';
import { mcReducer } from './mcReducer';
import { MCContext, loadPersistedState, STORAGE_KEY } from './useMCStore';
import { useBehaviorHeartbeat } from './useBehaviorHeartbeat';
import { useRemoteSync } from './useRemoteSync';
import { useAuditTrail } from './useAuditTrail';
import { useSuspensionExpiry } from './useSuspensionExpiry';
import { useGameTokenCapSettle } from './useGameTokenCapSettle';

/** Inside the provider: both dispatch through the logging interceptor. */
function SuspensionExpiry(): null {
    useSuspensionExpiry();
    return null;
}

function GameTokenCapSettle(): null {
    useGameTokenCapSettle();
    return null;
}

export function MCStoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const [state, dispatch] = useReducer(mcReducer, undefined, loadPersistedState);
    const contextValue = useMemo(() => ({ state, dispatch }), [state]);

    // Accrue mood progress once a minute while the app is running.
    // This heartbeat is the ONLY generator of game tokens — see
    // MOOD_TOKENS_PER_DAY in mcReducer.ts.
    useBehaviorHeartbeat(dispatch);

    // Sync state to Remote Control
    useRemoteSync(state);

    // Mirror every activity-log entry to the append-only file on disk.
    // Survives restarts, the CLEAR button, and the 200-entry ring buffer.
    useAuditTrail(state);

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
            <SuspensionExpiry />
            <GameTokenCapSettle />
            {children}
        </MCContext.Provider>
    );
}
