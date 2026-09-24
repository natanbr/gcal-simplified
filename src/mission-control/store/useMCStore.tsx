// ============================================================
// Mission Control — Isolated State Store
// Uses React Context. No external library.
// ⚠️  Do NOT import or use outside of src/mission-control/
// ============================================================

import React, { createContext, useContext, useRef } from 'react';
import type {
    MCState,
    MCAction,
    MissionPhase,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { initialState, selectTotalWealth } from './mcReducer';
import { sanitizeBehaviorProgress, sanitizeGameTokens } from './moodGauge';
import { sanitizeMissedStreak } from './missionStreak';
import { createLogEntry } from './activityLog';
import { currentPending, pendingFrom, type PendingState } from './pendingState';
import { sanitizeSkillProgress } from './skillProgress';
import { hydrateMissionTasks } from './routineTasks';
import { sanitizeSchoolCalendar } from './schoolDays';
import { repairMissionWindow, sanitizeStartTimes } from './hhmm';
import { REWARD_MAP } from '../rewardCatalogue';

export { selectTotalWealth };

// ---- Persistence ----

export const STORAGE_KEY = 'mc-state-v5'; // bumped: added gameTokens fields

const VALID_REWARD_IDS = new Set(Object.keys(REWARD_MAP));

/** A real instant that is not in the future (a stamp written under a clock set ahead). */
function isPastInstant(value: unknown): value is string {
    return typeof value === 'string' && Date.parse(value) <= Date.now();
}

export function loadPersistedState(): MCState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...initialState, _migrationVersion: 1 };
        const parsed = JSON.parse(raw) as Partial<MCState>;

        const MIGRATION_VERSION = 1;
        const storedMigrationVersion = parsed._migrationVersion ?? 0;

        let activityLogs = parsed.activityLogs || [];
        if (storedMigrationVersion < MIGRATION_VERSION) {
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            activityLogs = activityLogs
                .filter(log =>
                    !log.message.includes('Remote connection lost') &&
                    !log.message.includes('Remote control online') &&
                    (now - new Date(log.timestamp).getTime()) <= sevenDaysMs
                )
                .slice(0, 200);
        }

        // Merge cases from initialState so new cases (e.g. 4th slot) always appear
        const cases = initialState.cases.map(defaultCase => {
            const savedCase = parsed.cases?.find(c => c.id === defaultCase.id);
            if (!savedCase) return defaultCase;
            return {
                ...defaultCase,
                ...savedCase,
                targetCount: savedCase.targetCount ?? defaultCase.targetCount,
                reward: savedCase.reward && VALID_REWARD_IDS.has(savedCase.reward) ? savedCase.reward : null,
                status: savedCase.reward && !VALID_REWARD_IDS.has(savedCase.reward) ? 'empty' : savedCase.status,
            };
        });

        const settings = sanitizeStartTimes({ ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) });
        return {
            ...initialState,
            ...parsed,
            // Merge saved settings over defaults (so new settings fields always have values)
            settings,
            cases,
            missions: initialState.missions.map(defaultM => {
                const savedM = parsed.missions?.find(m => m.phase === defaultM.phase);
                if (!savedM) return defaultM;
                return repairMissionWindow({
                    ...defaultM,
                    ...savedM,
                    // Must survive a restart: a relaunch inside the window after a
                    // stop would otherwise start the mission again.
                    lastActiveAt: isPastInstant(savedM.lastActiveAt) ? savedM.lastActiveAt : undefined,
                    // Icon + label come from the code; a Cream or School Bag task
                    // the saved run carried is kept, ticked or not (routineTasks.ts).
                    tasks: hydrateMissionTasks(defaultM.tasks, savedM.tasks),
                }, settings);
            }),
            // Merge responsibilities from defaults so new tasks always appear
            responsibilities: initialState.responsibilities.map(defaultR => {
                const savedR = parsed.responsibilities?.find(r => r.id === defaultR.id);
                return savedR ? { ...defaultR, ...savedR } : defaultR;
            }),
            // Merge privileges from defaults so new privileges (e.g. phone-games) always appear.
            // Restored verbatim, even a suspension that ran out while the app was
            // closed: useSuspensionExpiry lifts it on mount through a logged,
            // attributed action. Settling it here was a silent state change.
            privileges: initialState.privileges.map(defaultPriv => {
                const savedPriv = parsed.privileges?.find(p => p.id === defaultPriv.id);
                return savedPriv ? { ...defaultPriv, ...savedPriv } : defaultPriv;
            }),
            activityLogs,
            // Never top tokens back up on restart (that would refund spent game
            // tokens); a corrupt null is 0. Over the cap: useGameTokenCapSettle, logged.
            gameTokens: sanitizeGameTokens(parsed.gameTokens, initialState.gameTokens),
            behaviorProgress: sanitizeBehaviorProgress(parsed.behaviorProgress, initialState.behaviorProgress),
            // A corrupt write (NaN serializes to null) must not propagate.
            bankCount: typeof parsed.bankCount === 'number' && Number.isFinite(parsed.bankCount)
                ? Math.max(0, parsed.bankCount)
                : initialState.bankCount,
            gameTokensLastGrantedDate: parsed.gameTokensLastGrantedDate ?? null,
            // Absent in every blob written before the shield existed, and a NaN
            // write serializes to null — either would poison `streak + 1`.
            missedMissionStreak: sanitizeMissedStreak(parsed.missedMissionStreak),
            // A game only runs while its overlay is mounted, so an "active" game
            // can never survive a restart. Restoring it stranded the flag at true
            // forever (crash/quit mid-game, or a remote START_GAME while the
            // Calendar view was showing and no overlay existed to close it) —
            // which is what made the phone remote keep offering a ghost game.
            snakeGameActive: false,
            // Rebuilt field-by-field like settings/cases/missions above — the
            // bare spread would restore a partial or corrupt slice wholesale.
            skillProgress: sanitizeSkillProgress(parsed.skillProgress),
            // Kept across a restart so a morning with no network still knows a
            // Pro-D day; anything malformed loads as "no data" (plain Mon–Fri).
            schoolCalendar: sanitizeSchoolCalendar(parsed.schoolCalendar),
            _migrationVersion: MIGRATION_VERSION,
        };
    } catch {
        return initialState;
    }
}



// ---- Context ----

interface MCContextValue {
    state: MCState;
    dispatch: React.Dispatch<MCAction>;
    /** Shared by every useMCDispatch (pendingState.ts). Absent on a bare test provider. */
    pending?: React.MutableRefObject<PendingState>;
}

export const MCContext = createContext<MCContextValue | null>(null);



export function useMCStore(): MCContextValue {
    const ctx = useContext(MCContext);
    if (!ctx) throw new Error('useMCStore must be used within MCStoreProvider');
    return ctx;
}

export function useMCState(): MCState {
    return useMCStore().state;
}

export function useMCDispatch(): React.Dispatch<MCAction> {
    const { state, dispatch, pending } = useMCStore();

    // Without the provider's shared one (a bare test provider): this component's
    // render-time state, as before.
    const own = useRef(pendingFrom(state));
    if (!pending) own.current = pendingFrom(state);
    const pendingRef = pending ?? own;

    // Command Wrapper / Interceptor
    return React.useCallback((action: MCAction) => {
        // Automatically inject timestamp for behavior sync
        const actionWithTimestamp: MCAction = {
            ...action,
            timestamp: action.timestamp || new Date().toISOString()
        };

        // 1. Generate the log entry from the state this action applies to: the last
        //    render's, plus every intercepted dispatch since (pendingState.ts)
        const logEntry = createLogEntry(actionWithTimestamp, currentPending(pendingRef.current));

        // 2. Dispatch the actual action first, queued as the very object React gets
        pendingRef.current.queue.push(actionWithTimestamp);
        dispatch(actionWithTimestamp);

        // 3. Dispatch the logging side-effect if we recorded one
        if (logEntry) {
            const addLog: MCAction = { type: 'ADD_LOG', log: logEntry };
            pendingRef.current.queue.push(addLog);
            dispatch(addLog);
        }
    }, [dispatch, pendingRef]);
}

/** Returns the mission matching the given phase */
export function useMission(phase: MissionPhase) {
    const { state } = useMCStore();
    return state.missions.find(m => m.phase === phase) ?? null;
}
