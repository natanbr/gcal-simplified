import { useEffect } from 'react';
import { useMCDispatch } from '../store/useMCStore';
import type { MCAction } from '../types';

/**
 * Action types the phone remote is allowed to dispatch.
 *
 * The channel used to forward whatever arrived straight into the reducer. The
 * pairing key stops a stranger, but it does not stop a stale build, a replayed
 * payload, or a tampered client from reaching actions the remote has no button
 * for. Anything not on this list is dropped and logged — notably CLEAR_LOGS,
 * RESET_GAME_TOKENS, ADD_LOG, SET_SETTINGS and START_GAME, none of which the
 * remote app sends and all of which would either destroy evidence or strand
 * state (a remote START_GAME with no overlay mounted is unclosable).
 */
const REMOTE_ALLOWED_ACTIONS: ReadonlySet<MCAction['type']> = new Set<MCAction['type']>([
    'ADD_TOKEN',
    'ADD_TOKENS',
    'REMOVE_TOKEN',
    'ADD_RESPONSIBILITY_POINT',
    'ADJUST_BEHAVIOR_PROGRESS',
    'ADJUST_MISSION_END',
    'CANCEL_MISSION',
    'CHEAT_ATTEMPT',
    'COMPLETE_TASK',
    'COMPLETE_MISSION_ROUTINE',
    'CONSUME_GAME_TOKEN',
    'GRANT_GAME_TOKEN',
    'RESET_MISSION',
    'RESET_MISSION_WITH_TIMER',
    'SET_ACTIVE_MISSION',
    'SET_MOOD_WIND',
    'SET_PRIVILEGE_STATUS',
    'TOGGLE_WHINING',
    'TRIGGER_ANIMATION',
]);

const SNAKE_KEY_MAP: Record<string, string> = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
};

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
            const action = args[0] as MCAction | { type: 'SNAKE_DIR'; dir: string };

            if (!action || typeof action.type !== 'string') {
                console.warn('[Remote] Dropped malformed action payload');
                return;
            }

            if (action.type === 'SNAKE_DIR') {
                const key = SNAKE_KEY_MAP[(action as { dir: string }).dir];
                if (key) {
                    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
                }
                return;
            }

            if (!REMOTE_ALLOWED_ACTIONS.has(action.type)) {
                console.warn(`[Remote] Rejected disallowed action type: ${action.type}`);
                return;
            }

            console.log('Remote action received:', action.type);
            dispatch({ ...action, isRemote: true, origin: 'remote' });
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [dispatch]);
}

export { REMOTE_ALLOWED_ACTIONS };
