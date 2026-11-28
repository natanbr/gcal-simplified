// ============================================================
// Mission Control — Isolated State Store
// Uses React Context. No external library.
// ⚠️  Do NOT import or use outside of src/mission-control/
// ============================================================

import React, { createContext, useContext, useRef } from 'react';
import type {
    MCSettings,
    MCState,
    MCAction,
    Mission,
    MissionPhase,
    SavedWindow,
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
import { deriveMissionWindow, hydrateMissionTimes, isRunLengthMins, missionDurationMins, sanitizeMissionTimes } from './hhmm';
import { keptWindows } from './missionActivity';
import { isDateKey } from './occurrenceDay';
import { retimeAheadDay } from './occurrenceHandled';
import { runLengthRepair, settingRepairs, type MissionTimeRepair } from './missionTimeRepair';
import { isStaleIncompleteRun } from './staleMissionRun';
import { renewalLoggedMarker, withoutPairingCopy } from './pairingRenewal';
import { REWARD_MAP } from '../rewardCatalogue';

export { selectTotalWealth };

// ---- Persistence ----

export const STORAGE_KEY = 'mc-state-v5'; // bumped: added gameTokens fields

const VALID_REWARD_IDS = new Set(Object.keys(REWARD_MAP));

/**
 * A real instant that is not in the future (a stamp written under a clock set
 * ahead), in the exact form toISOString writes every stamp: Date.parse also
 * reads other shapes, and rolls an impossible day over ('2026-02-30' as 2 March).
 */
function isPastInstant(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const ms = Date.parse(value);
    return Number.isFinite(ms) && new Date(ms).toISOString() === value && ms <= Date.now();
}

/**
 * The windows a save opened, each kept only as two past instants with the
 * window's start not after its save, then as the writer keeps them (keptWindows:
 * once per window, those of the four latest days, 64 at most): a profile of
 * 10,000 entries made every Settings save compare pairs of them.
 */
function savedWindows(value: unknown): SavedWindow[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const kept = value.flatMap((w: unknown): SavedWindow[] => {
        if (typeof w !== 'object' || w === null || !('savedAt' in w) || !('windowStart' in w)) return [];
        const { savedAt, windowStart } = w;
        return isPastInstant(savedAt) && isPastInstant(windowStart) && Date.parse(windowStart) <= Date.parse(savedAt) ? [{ savedAt, windowStart }] : [];
    });
    return kept.length > 0 ? keptWindows(kept) : undefined;
}

/**
 * `m` with the decision about the occurrence ahead that its start-time save
 * stamp carries (retimeCoversDay: a day, or null for none), made once now
 * when the stamp has none: PR 207 wrote the stamp alone and decided at every
 * read, so a profile it saved read as "none" and released the start it held.
 * Decided as PR 207 read it: the window behind as long as the mission is in the
 * loaded settings, not the run's own length a new save weighs it with. The two
 * differ when the length was saved between the run and the move, and the run's
 * length released what PR 207 held, or held what it let start (review of PR
 * 209, Codex). Written, so a later load reads the same.
 */
function withRetimeDecision(m: Mission, settings: MCSettings): Mission {
    if (m.startsAtChangedAt === undefined || m.retimeCoversDay !== undefined) return m;
    return { ...m, retimeCoversDay: retimeAheadDay(m, settings, missionDurationMins(m, settings)) };
}

export function loadPersistedState(): MCState {
    return loadPersistedStateWithRepairs().state;
}

/** The loaded state, plus the saved mission times hydration had to reset, which the
 *  provider logs just after load (missionTimeRepair.ts). */
export function loadPersistedStateWithRepairs(): { state: MCState; missionTimeRepairs: MissionTimeRepair[] } {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { state: { ...initialState, _migrationVersion: 1 }, missionTimeRepairs: [] };
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

        // The renewal-logged marker is kept only as a readable time: garbage reads as "not logged".
        // The pairing copy v0.0.43 and earlier saved here is dropped: config.json is its one home.
        const { remotePairingRenewalLogged: savedMarker, ...savedSettings } = withoutPairingCopy(parsed.settings ?? {});
        const marker = renewalLoggedMarker(savedMarker);
        const unsanitized = { ...DEFAULT_SETTINGS, ...savedSettings, ...(marker ? { remotePairingRenewalLogged: marker } : {}) };
        const settings = sanitizeMissionTimes(unsanitized);
        // What the two repairs below changed, read from their before and after: logged after load.
        const repairs = settingRepairs(unsanitized, settings);
        const state: MCState = {
            ...initialState,
            ...parsed,
            // Merge saved settings over defaults (so new settings fields always have values)
            settings,
            cases,
            missions: initialState.missions.map(defaultM => {
                const savedM = parsed.missions?.find(m => m.phase === defaultM.phase);
                if (!savedM) return defaultM;
                const merged = {
                    ...defaultM,
                    ...savedM,
                    // All must survive a restart: a relaunch inside the window after a stop, after a
                    // save that moved the start time, or after one that opened the window would otherwise start it.
                    lastActiveAt: isPastInstant(savedM.lastActiveAt) ? savedM.lastActiveAt : undefined,
                    startsAtChangedAt: isPastInstant(savedM.startsAtChangedAt) ? savedM.startsAtChangedAt : undefined,
                    retimeCoversDay: isDateKey(savedM.retimeCoversDay) || savedM.retimeCoversDay === null ? savedM.retimeCoversDay : undefined,
                    savedIntoWindows: savedWindows(savedM.savedIntoWindows),
                    // The run's day and base length, kept only when real (missing: the derivations they replace).
                    occurrenceDate: isDateKey(savedM.occurrenceDate) ? savedM.occurrenceDate : undefined,
                    baseDurationMins: isRunLengthMins(savedM.baseDurationMins) ? savedM.baseDurationMins : undefined,
                    // Icon + label come from the code; a Cream or School Bag task
                    // the saved run carried is kept, ticked or not (routineTasks.ts).
                    tasks: hydrateMissionTasks(defaultM.tasks, savedM.tasks),
                };
                // A run from an earlier day with no readable duration is left as saved:
                // useStaleMissionRunEnd ends it after load, logged (staleMissionRun.ts).
                const derived = withRetimeDecision(deriveMissionWindow(merged, settings), settings);
                if (isStaleIncompleteRun(derived, settings, new Date())) return derived;
                const hydrated = hydrateMissionTimes(derived, settings);
                repairs.push(...runLengthRepair(derived, hydrated));
                return hydrated;
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
        return { state, missionTimeRepairs: repairs };
    } catch {
        return { state: initialState, missionTimeRepairs: [] };
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
