import type { MCState, MCAction } from '../../types';

export function systemReducer(state: MCState, action: MCAction): MCState {
    switch (action.type) {
        case 'SET_SETTINGS': {
            const nextSettings = { ...state.settings, ...action.settings };
            let nextDaysLeft = state.creamTaskDaysLeft;

            if (action.settings.creamTaskEnabled && !state.settings.creamTaskEnabled) {
                // Just enabled — start fresh
                nextDaysLeft = nextSettings.creamTaskDaysTarget;
            } else if (action.settings.creamTaskDaysTarget !== undefined && action.settings.creamTaskDaysTarget !== state.settings.creamTaskDaysTarget) {
                 // Target changed, reset current progress
                 nextDaysLeft = action.settings.creamTaskDaysTarget;
            }

            // If the start time of the currently-active mission changes, we must also
            // deactivate it — otherwise durationMins is wiped but active stays true,
            // making the expiry check `durationMins != null` permanently false (hung mission).
            const mornTimeChanged =
                (action.settings.morningStartsAt ?? state.settings.morningStartsAt) !== state.settings.morningStartsAt;
            const evenTimeChanged =
                (action.settings.eveningStartsAt ?? state.settings.eveningStartsAt) !== state.settings.eveningStartsAt;
            const activeIsBeingRescheduled =
                (state.activeMission === 'morning' && mornTimeChanged) ||
                (state.activeMission === 'evening' && evenTimeChanged);

            return {
                ...state,
                settings: nextSettings,
                creamTaskDaysLeft: nextDaysLeft,
                // Deactivate root if the running mission's start time was changed
                ...(activeIsBeingRescheduled ? { activeMission: 'none' as const } : {}),
                // Live-update mission startsAt/endsAt from settings so scheduler picks them up.
                // If the start time changes, clear startedAt, durationMins, and active
                // so the scheduler can re-trigger at the new time without getting stuck.
                missions: state.missions.map(m => {
                    if (m.phase === 'morning') {
                        const dur = action.settings.morningDurationMins ?? state.settings.morningDurationMins;
                        const start = action.settings.morningStartsAt ?? state.settings.morningStartsAt;
                        const [h, min] = start.split(':').map(Number);
                        const endTotal = h * 60 + min + dur;
                        const endsAt = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
                        return {
                            ...m,
                            startsAt: start,
                            endsAt,
                            ...(mornTimeChanged ? { startedAt: undefined, durationMins: undefined, active: false } : {}),
                        };
                    }
                    if (m.phase === 'evening') {
                        const dur = action.settings.eveningDurationMins ?? state.settings.eveningDurationMins;
                        const start = action.settings.eveningStartsAt ?? state.settings.eveningStartsAt;
                        const [h, min] = start.split(':').map(Number);
                        const endTotal = h * 60 + min + dur;
                        const endsAt = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
                        return {
                            ...m,
                            startsAt: start,
                            endsAt,
                            ...(evenTimeChanged ? { startedAt: undefined, durationMins: undefined, active: false } : {}),
                        };
                    }
                    return m;
                }),
            };
        }

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
