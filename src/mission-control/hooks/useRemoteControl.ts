import { useEffect } from 'react';
import { useMCDispatch } from '../store/useMCStore';

/**
 * Hook that listens for remote control actions from the main process
 * and dispatches them to the Mission Control store.
 */
export function useRemoteControl() {
    const dispatch = useMCDispatch();

    useEffect(() => {
        if (!window.ipcRenderer) return;
        const ipc = window.ipcRenderer;

        const unsubscribe = ipc.on('remote-control:action', (...args: unknown[]) => {
            const action = args[0] as import('../types').MCAction | { type: 'SNAKE_DIR'; dir: string };
            console.log('Remote action received:', action);
            
            if (action.type === 'SNAKE_DIR') {
                const keyMap: Record<string, string> = {
                    up: 'ArrowUp',
                    down: 'ArrowDown',
                    left: 'ArrowLeft',
                    right: 'ArrowRight'
                };
                if (keyMap[action.dir]) {
                    window.dispatchEvent(new KeyboardEvent('keydown', { key: keyMap[action.dir] }));
                }
                return;
            }

            dispatch({ ...action, isRemote: true });
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [dispatch]);
}
