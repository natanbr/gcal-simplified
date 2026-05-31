import type { MCState, MCAction } from '../../types';

export function economyReducer(state: MCState, action: MCAction): MCState {
    switch (action.type) {
        case 'ADD_TOKEN':
            return { ...state, bankCount: state.bankCount + 1 };

        case 'ADD_TOKENS':
            return { ...state, bankCount: state.bankCount + action.amount };

        case 'REMOVE_TOKEN':
            return { ...state, bankCount: Math.max(0, state.bankCount - 1) };

        case 'SELECT_CASE': {
            const isQuickGame = action.reward === 'quick-game';
            if (isQuickGame && state.gameTokens <= 0) return state;

            return {
                ...state,
                gameTokens: isQuickGame ? state.gameTokens - 1 : state.gameTokens,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, status: 'active', reward: action.reward, targetCount: action.targetCount }
                        : c,
                ),
            };
        }

        case 'DEPOSIT_TO_CASE': {
            const amount = Math.min(action.amount, state.bankCount);
            return {
                ...state,
                bankCount: state.bankCount - amount,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, tokenCount: c.tokenCount + amount }
                        : c,
                ),
            };
        }

        case 'MOVE_TOKEN': {
            // Source Validation
            if (action.from === 'bank' && state.bankCount <= 0) return state;
            if (typeof action.from === 'number') {
                const sourceCase = state.cases.find(c => c.id === action.from);
                if (!sourceCase || sourceCase.tokenCount <= 0) return state;
            }

            // Target Validation
            if (typeof action.to === 'number') {
                const targetCase = state.cases.find(c => c.id === action.to);
                if (!targetCase || targetCase.status !== 'active') return state;
            }

            let newBankCount = state.bankCount;
            let newCases = state.cases;

            // Decrement source
            if (action.from === 'bank') {
                newBankCount -= 1;
            } else {
                newCases = newCases.map(c => c.id === action.from ? { ...c, tokenCount: Math.max(0, c.tokenCount - 1) } : c);
            }

            // Increment target
            if (action.to === 'bank') {
                newBankCount += 1;
            } else {
                newCases = newCases.map(c => c.id === action.to ? { ...c, tokenCount: c.tokenCount + 1 } : c);
            }

            return {
                ...state,
                bankCount: newBankCount,
                cases: newCases,
            };
        }

        case 'VACUUM_TO_CASE': {
            if (state.bankCount === 0) return state;
            const vacuumTarget = state.cases.find(c => c.id === action.caseId);
            if (!vacuumTarget) return state;
            const canAdd = Math.min(state.bankCount, vacuumTarget.targetCount - vacuumTarget.tokenCount);
            if (canAdd <= 0) return state;
            return {
                ...state,
                bankCount: state.bankCount - canAdd,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, tokenCount: c.tokenCount + canAdd }
                        : c,
                ),
            };
        }

        case 'REFUND_CASE': {
            const targetCase = state.cases.find(c => c.id === action.caseId);
            if (!targetCase) return state;
            const isQuickGame = targetCase.reward === 'quick-game';
            return {
                ...state,
                bankCount: state.bankCount + targetCase.tokenCount,
                gameTokens: isQuickGame ? Math.min(5, state.gameTokens + 1) : state.gameTokens,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, status: 'empty', reward: null, tokenCount: 0 }
                        : c,
                ),
            };
        }

        case 'CONSUME_CASE': {
            return {
                ...state,
                cases: state.cases.map(c =>
                    c.id === action.caseId
                        ? { ...c, status: 'empty', reward: null, tokenCount: 0 }
                        : c,
                ),
            };
        }

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

        default:
            return state;
    }
}
