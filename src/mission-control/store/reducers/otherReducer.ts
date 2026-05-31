import type { MCState, MCAction } from '../../types';

export function otherReducer(state: MCState, action: MCAction): MCState {
    switch (action.type) {
        case 'SET_PRIVILEGE_STATUS':
            return {
                ...state,
                privileges: state.privileges.map(p =>
                    p.id === action.cardId
                        ? { ...p, status: action.status, suspendedUntil: action.suspendedUntil }
                        : p,
                ),
            };

        case 'ADD_LOG': {
            const newLogs = [action.log, ...(state.activityLogs || [])].slice(0, 200);
            return {
                ...state,
                activityLogs: newLogs
            };
        }

        case 'CLEAR_LOGS':
            return {
                ...state,
                activityLogs: [],
            };

        case 'CHEAT_ATTEMPT':
            return {
                ...state,
                hasUnreviewedCheatAttempt: true,
            };

        case 'CLEAR_CHEAT_FLAG':
            return {
                ...state,
                hasUnreviewedCheatAttempt: false,
            };

        case 'TRIGGER_ANIMATION':
            return {
                ...state,
                lastAnimationTrigger: {
                    type: action.animation,
                    timestamp: Date.now()
                }
            };

        default:
            return state;
    }
}
