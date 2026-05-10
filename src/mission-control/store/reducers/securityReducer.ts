import { MCState, MCAction } from '../../types';

export function reduceSecurity(state: MCState, action: MCAction): MCState {
    switch (action.type) {
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

        default:
            return state;
    }
}
