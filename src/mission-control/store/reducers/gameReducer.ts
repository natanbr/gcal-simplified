import type { MCState, MCAction } from '../../types';

export function gameReducer(state: MCState, action: MCAction): MCState | undefined {
    switch (action.type) {
        case 'GRANT_GAME_TOKEN': {
            const todayStr = new Date().toISOString().slice(0, 10);
            if (!action.force && state.gameTokensLastGrantedDate === todayStr) return state;

            const totalWealth = state.bankCount + state.cases.reduce((sum, c) => sum + c.tokenCount, 0);
            if (totalWealth < 10 && !action.force) return state;
            if (state.gameTokens >= 5) return state;
            return {
                ...state,
                gameTokens: Math.min(5, state.gameTokens + 1),
                gameTokensLastGrantedDate: action.force ? state.gameTokensLastGrantedDate : todayStr,
            };
        }

        case 'CONSUME_GAME_TOKEN':
            if (state.gameTokens <= 0) return state;
            return { ...state, gameTokens: state.gameTokens - 1 };

        case 'RESET_GAME_TOKENS':
            return {
                ...state,
                gameTokens: 0,
                gameTokensLastGrantedDate: null,
            };

        case 'START_GAME':
            return {
                ...state,
                snakeGameActive: true
            };

        case 'END_GAME':
            return {
                ...state,
                snakeGameActive: false
            };

        default:
            return undefined;
    }
}
