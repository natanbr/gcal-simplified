import { MCState, MCAction } from '../../types';

export function reducePrivileges(state: MCState, action: MCAction): MCState {
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

        default:
            return state;
    }
}
