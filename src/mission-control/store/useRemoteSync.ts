import { useRef, useCallback, useEffect } from 'react';
import type { MCState } from '../types';

/**
 * Broadcasts Mission Control state to the Electron remote bridge whenever
 * relevant state slices change. Debounced to 1s to avoid flooding Supabase.
 *
 * Kept in a separate file so useMCStore.tsx can remain a pure hooks/context
 * module — required for Vite Fast Refresh to work correctly.
 */
export function useRemoteSync(state: MCState) {
    const stateRef = useRef(state);
    stateRef.current = state;

    const broadcast = useCallback(() => {
        const activeMissionObj = stateRef.current.missions.find(
            m => m.phase === stateRef.current.activeMission && m.active
        );

        const syncData = {
            bankCount: stateRef.current.bankCount,
            gameTokens: stateRef.current.gameTokens,
            activeMission: stateRef.current.activeMission,
            missionStartedAt: activeMissionObj?.startedAt ?? null,
            missionDurationMins: activeMissionObj?.durationMins ?? null,
            responsibilities: stateRef.current.responsibilities.map(r => ({
                id: r.id,
                pointsEarned: r.pointsEarned,
                pointsRequired: r.pointsRequired,
                completedAt: r.completedAt
            })),
            privileges: stateRef.current.privileges.map(p => ({
                id: p.id,
                label: p.label,
                icon: p.icon,
                status: p.status,
                suspendedUntil: p.suspendedUntil
            }))
        };

        if (window.ipcRenderer) {
            window.ipcRenderer.invoke('remote:sync-state', syncData);
        }
    }, []);

    useEffect(() => {
        // Debounce state sync to avoid flooding Supabase (sync every 1s of stability)
        const timer = setTimeout(broadcast, 1000);
        return () => clearTimeout(timer);
    }, [state.bankCount, state.gameTokens, state.activeMission, state.missions, state.responsibilities, state.privileges, broadcast]);

    useEffect(() => {
        // Listen for explicit sync requests from remotes
        if (!window.ipcRenderer) return;
        const unsubscribe = window.ipcRenderer.on('remote:request-sync', () => {
            broadcast();
        });
        return () => unsubscribe && unsubscribe();
    }, [broadcast]);
}
