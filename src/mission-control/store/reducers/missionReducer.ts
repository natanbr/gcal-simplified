import type { MCState, MCAction } from '../../types';

function getLocalDateString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function missionReducer(state: MCState, action: MCAction): MCState | undefined {
    switch (action.type) {
        case 'COMPLETE_TASK': {
            const nextState = { ...state };
            const currentMission = state.missions.find(m => m.phase === action.missionPhase);
            const currentTask = currentMission?.tasks.find(t => t.id === action.taskId);
            if (!currentTask) return state;

            const wasCompleted = currentTask.completed;
            const nextCompleted = !wasCompleted;

            if (action.taskId === 'cream') {
                const schedule = state.settings.creamTaskSchedule ?? 'evening';
                const dec = schedule === 'both' ? 0.5 : 1;
                if (nextCompleted) {
                    nextState.creamTaskDaysLeft = Math.max(0, state.creamTaskDaysLeft - dec);
                } else {
                    nextState.creamTaskDaysLeft = state.creamTaskDaysLeft + dec;
                }
            }
            nextState.missions = nextState.missions.map(m =>
                m.phase === action.missionPhase
                    ? {
                        ...m,
                        tasks: m.tasks.map(t =>
                            t.id === action.taskId ? { ...t, completed: nextCompleted } : t,
                        ),
                    }
                    : m,
            );
            // Auto-disable if today was the last day
            if (action.taskId === 'cream' && nextState.creamTaskDaysLeft === 0) {
                 nextState.settings = { ...nextState.settings, creamTaskEnabled: false };
            }
            return nextState;
        }

        case 'LOCK_TASK':
            return {
                ...state,
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? {
                            ...m,
                            tasks: m.tasks.map(t =>
                                t.id === action.taskId ? { ...t, locked: true } : t,
                            ),
                        }
                        : m,
                ),
            };

        case 'SET_ACTIVE_MISSION': {
            // Timer expired — deactivate. Tasks are intentionally left as-is
            // (they're reset when the mission re-triggers via SET_ACTIVE_MISSION).
            if (action.phase === 'none') {
                return {
                    ...state,
                    activeMission: 'none',
                    missions: state.missions.map(m => ({
                        ...m,
                        active: false,
                        durationMins: undefined,
                    })),
                };
            }

            // Only one mission at a time — if one is already running, ignore the new trigger
            if (state.activeMission !== 'none') {
                return state;
            }

            const now = new Date().toISOString();
            return {
                ...state,
                activeMission: action.phase,
                missions: state.missions.map(m => {
                    if (m.phase !== action.phase) return { ...m, active: false };
                    // Every trigger is a fresh start: new timer, reset checklist.
                    const [sh, sm] = m.startsAt.split(':').map(Number);
                    const [eh, em] = m.endsAt.split(':').map(Number);
                    const durationMins = (eh * 60 + em) - (sh * 60 + sm);
                    return {
                        ...m,
                        active: true,
                        startedAt: now,
                        durationMins: Math.max(0, durationMins), // no minimum — allows sub-minute test durations
                        whiningDetected: false,
                        whiningLocked: false,
                        tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })),
                    };
                }),
            };
        }

        // Reset task progress only — mission stays active, timer keeps running.
        // Does NOT affect startedAt/durationMins/activeMission.
        case 'RESET_MISSION':
            return {
                ...state,
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, active: true, loggedTimeoutAt: undefined, whiningDetected: false, whiningLocked: false, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m
                )
            };

        // Full reset — tasks AND timer restart from scratch.
        // Mission stays active with a fresh startedAt + recalculated durationMins.
        case 'RESET_MISSION_WITH_TIMER': {
            const now = new Date().toISOString();
            return {
                ...state,
                missions: state.missions.map(m => {
                    if (m.phase !== action.missionPhase) return m;
                    const [sh, sm] = m.startsAt.split(':').map(Number);
                    const [eh, em] = m.endsAt.split(':').map(Number);
                    let durationMins = (eh * 60 + em) - (sh * 60 + sm);
                    if (durationMins < 0) durationMins += 24 * 60; // overnight wrap
                    return {
                        ...m,
                        active: true,
                        startedAt: now,
                        durationMins,
                        loggedTimeoutAt: undefined,
                        whiningDetected: false,
                        whiningLocked: false,
                        tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })),
                    };
                }),
            };
        }

        case 'CANCEL_MISSION':
            return {
                ...state,
                activeMission: 'none',
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, startedAt: undefined, active: false, loggedTimeoutAt: undefined, whiningDetected: false, whiningLocked: false, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m
                )
            };

        case 'COMPLETE_MISSION_ROUTINE':
            return {
                ...state,
                activeMission: 'none',
                bankCount: state.bankCount + action.bonusTokens,
                ...(action.missionPhase === 'morning' ? { lastCompletedOrFailedMorningDate: getLocalDateString() } : {}),
                ...(action.missionPhase === 'evening' ? { lastCompletedOrFailedEveningDate: getLocalDateString() } : {}),
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, startedAt: undefined, active: false, loggedTimeoutAt: undefined, whiningDetected: false, whiningLocked: false, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                        : m
                )
            };

        case 'MARK_MISSION_TIMEOUT':
            return {
                ...state,
                ...(action.missionPhase === 'morning' ? { lastCompletedOrFailedMorningDate: getLocalDateString() } : {}),
                ...(action.missionPhase === 'evening' ? { lastCompletedOrFailedEveningDate: getLocalDateString() } : {}),
                missions: state.missions.map(m =>
                    m.phase === action.missionPhase
                        ? { ...m, loggedTimeoutAt: new Date().toISOString() }
                        : m
                )
            };

        case 'ADJUST_MISSION_END': {
            return {
                ...state,
                missions: state.missions.map(m => {
                    if (m.phase !== action.missionPhase) return m;
                    // Ignore adjustments if mission is not actively running
                    if (!m.active || !m.startedAt || m.durationMins == null) return m;

                    return { ...m, durationMins: Math.max(1, m.durationMins + action.deltaMinutes) };
                }),
            };
        }

        case 'TOGGLE_WHINING':
            return {
                ...state,
                missions: state.missions.map(m => {
                    if (m.phase !== action.missionPhase) return m;
                    if (m.whiningLocked && !action.lockedFromUI) return m; // UI clicks ignored if locked
                    return {
                        ...m,
                        whiningDetected: !m.whiningDetected,
                        whiningLocked: action.lockedFromUI ? true : m.whiningLocked
                    };
                }),
            };

        default:
            return undefined;
    }
}
