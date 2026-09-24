import { useEffect } from 'react';
import { useMCDispatch } from '../store/useMCStore';
import { parseSuspensionEnd } from '../utils/timeUtils';
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
    'ADJUST_SHIELD',
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

/**
 * Payload validation for allowlisted actions that reach arithmetic or clamps.
 * The same threat model as the allowlist: a stale or tampered remote build.
 * `{type:'ADD_TOKENS'}` with no amount reduces to `bankCount + undefined =
 * NaN`, which persists (as null) and silently zeroes the bank on reload.
 */
const PAYLOAD_VALIDATORS: Partial<Record<MCAction['type'], (a: MCAction) => boolean>> = {
    ADD_TOKENS: a => a.type === 'ADD_TOKENS' && Number.isFinite(a.amount),
    ADJUST_SHIELD: a => a.type === 'ADJUST_SHIELD' && Number.isFinite(a.delta),
    // An unvalidated phase wedges the app permanently: `activeMission: 'x'`
    // persists, the one-mission-at-a-time guard then refuses every real trigger,
    // the quick-game window stays shut, and the 15s expiry interval runs for
    // good on an idle Calendar.
    SET_ACTIVE_MISSION: a => a.type === 'SET_ACTIVE_MISSION'
        && ['none', 'morning', 'evening'].includes(a.phase),
    // The phone's Stop is the only way to stop a mission (2026-09-24). The reducer
    // sets activeMission 'none' but resets only the mission whose phase matches, so
    // a missing or bad phase left that mission active with its timer running.
    CANCEL_MISSION: a => a.type === 'CANCEL_MISSION'
        && ['morning', 'evening'].includes(a.missionPhase),
    // `amount` is optional on this one (the reducer defaults it to 1), so the
    // validator must accept `undefined` or the remote's own button breaks.
    ADD_RESPONSIBILITY_POINT: a => a.type === 'ADD_RESPONSIBILITY_POINT'
        && (a.amount === undefined || Number.isFinite(a.amount)),
    // This action also resets the streak, so an unvalidated payload would
    // unlock the bank as well as NaN-poison the balance.
    COMPLETE_MISSION_ROUTINE: a => a.type === 'COMPLETE_MISSION_ROUTINE' && Number.isFinite(a.bonusTokens),
    ADJUST_BEHAVIOR_PROGRESS: a => a.type === 'ADJUST_BEHAVIOR_PROGRESS' && Number.isFinite(a.amount),
    ADJUST_MISSION_END: a => a.type === 'ADJUST_MISSION_END' && Number.isFinite(a.deltaMinutes),
    SET_MOOD_WIND: a => a.type === 'SET_MOOD_WIND' && Number.isFinite(a.level),
    // The reducer stores both fields as they arrive. A NUMBER end time is a year
    // to Date.parse and a 1970 timestamp to new Date; an unknown status was
    // logged as "locked". Only a suspension carries an end time, and it must
    // still be ahead here: one already over would be lifted at once and log
    // "suspension ended" with no "suspended" line. (Named `action` so the
    // privilege-suspension boundary guard reads `.status` as intent.)
    SET_PRIVILEGE_STATUS: action => action.type === 'SET_PRIVILEGE_STATUS'
        && typeof action.cardId === 'string'
        && (action.status === 'suspended'
            ? (parseSuspensionEnd(action.suspendedUntil) ?? 0) > Date.now()
            : (action.status === 'active' || action.status === 'locked') && action.suspendedUntil == null),
};

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

            const validate = PAYLOAD_VALIDATORS[action.type];
            if (validate && !validate(action)) {
                console.warn(`[Remote] Rejected ${action.type}: malformed payload`);
                return;
            }

            console.log('Remote action received:', action.type);
            // Scrub the ENVELOPE, not just the declared payload fields: every
            // MCAction carries `timestamp`, so the validator table above
            // structurally cannot see it. A junk timestamp reaches
            // applyBehaviorSync, whose guards are all comparisons, and every
            // comparison against NaN is false — behaviorProgress becomes NaN and
            // mood-token generation stops for the rest of the session.
            const { timestamp: _untrusted, ...scrubbed } = action;
            void _untrusted;
            dispatch({ ...scrubbed, isRemote: true, origin: 'remote' });
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [dispatch]);
}

export { REMOTE_ALLOWED_ACTIONS };
