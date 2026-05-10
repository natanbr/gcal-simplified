import { MCState, MCAction } from '../../types';

export function reduceResponsibilities(state: MCState, action: MCAction): MCState {
    switch (action.type) {
        case 'ADD_RESPONSIBILITY_POINT': {
            const now = new Date().toISOString();
            return {
                ...state,
                responsibilities: state.responsibilities.map(r => {
                    if (r.id !== action.taskId) return r;
                    if (r.completedAt) return r; // already complete — ignore
                    const newPoints = r.pointsEarned + 1;
                    const isComplete = newPoints >= r.pointsRequired;
                    return {
                        ...r,
                        pointsEarned: newPoints,
                        completedAt: isComplete ? now : null,
                    };
                }),
            };
        }

        case 'RESET_RESPONSIBILITY': {
            const addedBank = action.claimTokens ? state.bankCount + action.claimTokens : state.bankCount;
            return {
                ...state,
                bankCount: addedBank,
                responsibilities: state.responsibilities.map(r =>
                    r.id === action.taskId
                        ? { ...r, pointsEarned: 0, completedAt: null }
                        : r
                )
            };
        }

        default:
            return state;
    }
}
