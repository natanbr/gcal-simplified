import { MCState, MCAction } from '../../types';

export function reduceLogs(state: MCState, action: MCAction): MCState {
    switch (action.type) {
        case 'ADD_LOG': {
            const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
            const nowTime = new Date().getTime();

            // 1. Add new log to the front
            // 2. Filter out anything older than 7 days based on timestamp
            const filteredLogs = [action.log, ...(state.activityLogs || [])].filter(log => {
                const logTime = new Date(log.timestamp).getTime();
                return (nowTime - logTime) <= SEVEN_DAYS_MS;
            });

            return {
                ...state,
                activityLogs: filteredLogs
            };
        }

        default:
            return state;
    }
}
