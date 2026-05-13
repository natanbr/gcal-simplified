import { useEffect } from 'react';
import { useMCDispatch } from '../store/useMCStore';

/**
 * Hook that listens for remote control actions from the main process
 * and dispatches them to the Mission Control store.
 */
export function useRemoteControl() {
    const dispatch = useMCDispatch();

    useEffect(() => {
        const ipc = (window as unknown as { ipcRenderer: any }).ipcRenderer;
        if (!ipc) return;

        const unsubscribe = ipc.on('remote-control:action', (action: import('../types').MCAction) => {
            console.log('Remote action received:', action);
            dispatch({ ...action, isRemote: true });
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [dispatch]);
}
