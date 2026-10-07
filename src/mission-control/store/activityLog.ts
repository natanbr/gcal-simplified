// ============================================================
// Mission Control — Activity Log Translation
// Turns dispatched actions into human-readable ActivityLogEntry
// records. Bank/total snapshots are derived by running the pure
// reducer, so they can never drift from the real state math.
// The bank and goal (case) lines are built in bankLog.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCState, MCAction, ActivityLogEntry } from '../types';
import { mcReducer, selectTotalWealth } from './mcReducer';
import { isRefusedByShieldLock, shieldSegmentsLeft } from './missionStreak';
import { bankLogEntry, isBankAction } from './bankLog';
import { isStaleMissionAction } from './staleMissionAction';
import { adjustedMissionEnd } from './missionEndAdjust';
import { completableRun } from './missionCompletion';
import { responsibilityPointChange } from './responsibilityPoint';
import { responsibilityClaim } from './responsibilityClaim';
import { reschedulesRunningMission } from './missionReschedule';
import { effectivePrivilege, isPrivilegeSuspended } from './privileges';
import { formatLogStamp, formatSuspensionLength, parseSuspensionEnd } from '../utils/timeUtils';
import { gameTokenCapNote, gameTokenRoom } from './moodGauge';
import { schoolBagDecision, schoolBagLogNote } from './schoolDays';
import { staleRunEndedMessage } from './staleMissionRun';

export type LogSource = NonNullable<ActivityLogEntry['source']>;

/** Falls back through the legacy `isRemote` flag for entries written before
 *  attribution existed. Single definition — the durable audit trail and the
 *  log view must never disagree about who caused an event. */
export function sourceOf(log: Pick<ActivityLogEntry, 'source' | 'isRemote'>): LogSource {
    return log.source ?? (log.isRemote ? 'remote' : 'local');
}

/**
 * Snapshot of the token economy *after* the action is applied, plus who caused
 * it. Attribution matters more than it looks: a token count that moves with no
 * one at the keyboard is the exact thing a parent needs to be able to see.
 */
function deriveSnapshots(state: MCState, action: MCAction) {
    const nextState = mcReducer(state, action);
    return {
        totalTokens: selectTotalWealth(nextState),
        bankTokens: nextState.bankCount,
        gameTokens: nextState.gameTokens,
        source: action.origin ?? (action.isRemote ? 'remote' as const : 'local' as const),
        ...(action.isRemote ? { isRemote: true } : {}),
    };
}

/**
 * Action types that never produce an interceptor log entry. `deriveSnapshots`
 * runs the full reducer speculatively, but lazily (see `snap` below), so a
 * `null` path costs no reduce; this set stays as the semantic record of which
 * dispatches are deliberately invisible to the interceptor.
 *
 * - `RECORD_QUIZ_ANSWER` — a per-answer action, so every quiz tap would pay
 *   the reducer twice. (Its level-change log is written inside the reducer
 *   itself, mood-grant style.)
 *
 * - `START_GAME` / `END_GAME` — `useQuickGameSession` is the only dispatcher
 *   of either (neither is in `REMOTE_ALLOWED_ACTIONS`) and it hand-writes its
 *   own 🕹️ / 🏁 entries carrying the score and duration, which is strictly
 *   more than a derived entry could know. Deriving one here as well wrote two
 *   🏁 lines per close and ate the 200-entry ring buffer twice as fast.
 *
 *   ACCEPTED CONSEQUENCE — chosen, not overlooked, so do not re-engineer it:
 *   the removed `END_GAME` case spread `...snapshots`, so game-close entries
 *   used to carry `totalTokens` / `bankTokens` / `gameTokens`. Those render as
 *   chips in `components/activity-log/LogItemRow.tsx` and are mirrored into
 *   the append-only NDJSON trail by `store/useAuditTrail.ts`; the hand-built
 *   entry carries none, so game-close lines lost their balance chips. That is
 *   fine: no tokens move at `END_GAME`, `START_GAME` never had snapshots
 *   either, and the next balance-changing entry restates all three.
 *
 * - `ADD_LOG` — the two hand-built entries in `useQuickGameSession` are
 *   dispatched through the `useMCDispatch` interceptor, so they arrive here
 *   and must not derive a second entry about themselves. The interceptor's
 *   OWN `ADD_LOG` (step 3 in `useMCStore.tsx`) is issued on the raw React
 *   dispatch and never re-enters this function.
 */
const UNLOGGED_ACTIONS = new Set<MCAction['type']>([
    'RECORD_QUIZ_ANSWER',
    'START_GAME',
    'END_GAME',
    'ADD_LOG',
]);

export function createLogEntry(action: MCAction, state: MCState): ActivityLogEntry | null {
    if (UNLOGGED_ACTIONS.has(action.type)) return null;
    // Mirror the reducer's shield lock and stale-mission refusal — same predicates,
    // not copies. A refused deposit that still logged "Deposited 3 tokens" would put
    // a token movement in the parent's audit trail that never happened.
    if (isRefusedByShieldLock(state, action) || isStaleMissionAction(state, action)) return null;

    // The action's own instant, not the wall clock: the reducer decides every
    // refusal from `action.timestamp`, and two separate clock reads can disagree
    // about one dispatch at the boundary second (19:00:00.000) — the mirror
    // would then log a movement the reducer refused.
    const now = action.timestamp ?? new Date().toISOString();
    const id = self.crypto.randomUUID();

    // Lazy: the speculative reduce only runs for cases that actually spread
    // snapshots — null paths (COMPLETE_TASK, settings toggles, future actions
    // hitting `default`) must not pay a second full reducer pass per dispatch.
    const snap = () => deriveSnapshots(state, action);

    // The bank and goal (case) lines: store/bankLog.ts.
    if (isBankAction(action)) return bankLogEntry(action, state, { id, now, snap });

    switch (action.type) {
        case 'ADJUST_SHIELD': {
            // applyStreakChange only logs when the lock state CROSSES, so
            // without this the phone could walk the shield 0 -> 5 unrecorded.
            const before = shieldSegmentsLeft(state.missedMissionStreak);
            const after = shieldSegmentsLeft(state.missedMissionStreak - action.delta);
            if (before === after) return null; // clamped at an end — nothing moved
            const gave = after > before;
            return {
                id, timestamp: now,
                icon: gave ? '🛡️' : '💥',
                message: `${gave ? 'Shield given back' : 'Shield taken away'} — ${after} / 6 left`,
                type: 'mission', colorKey: 'system', ...snap(),
            };
        }

        case 'SET_ACTIVE_MISSION':
            if (action.phase === 'none') {
                // Scheduler-driven expiry — record which phase just timed out.
                const timedOutPhase = state.activeMission;
                if (timedOutPhase === 'none') return null; // already inactive, nothing to log
                const phaseLabel = timedOutPhase === 'morning' ? 'Morning' : 'Evening';
                return { id, timestamp: now, icon: '🕐', message: `${phaseLabel} mission expired`, type: 'mission', colorKey: timedOutPhase, ...snap() };
            }
            if (state.activeMission !== 'none') return null; // mirrors the reducer: one mission at a time
            // Same decision the reducer's fresh start takes, so the line cannot disagree with the list.
            return { id, timestamp: now, icon: action.phase === 'morning' ? '☀️' : '🌙', message: `${action.phase} mission started${schoolBagLogNote(schoolBagDecision(action.phase, now, state.schoolCalendar, state.settings.morningStartsAt))}`, type: 'mission', colorKey: action.phase, ...snap() };
        case 'CANCEL_MISSION':
            return { id, timestamp: now, icon: '⏹️', message: `Mission stopped`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snap() };
        case 'SET_SETTINGS': {
            // A new start time for the RUNNING mission ends it (kept; open decision,
            // PR 170). The reducer's own check, so no speculative pass and no drift.
            const phase = state.activeMission;
            if (phase === 'none' || !reschedulesRunningMission(state, action.settings)) return null;
            const label = phase === 'morning' ? 'Morning' : 'Evening';
            return { id, timestamp: now, icon: '⏹️', message: `${label} mission ended: its start time was changed in Settings`, type: 'mission', colorKey: phase, ...snap() };
        }
        case 'MARK_MISSION_TIMEOUT':
            return null; // SET_ACTIVE_MISSION phase 'none' logs the expiry with its phase; this would duplicate it
        case 'COMPLETE_MISSION_ROUTINE': {
            // The reducer's own decision: a second completion, or one after the
            // run's timeout was logged, pays nothing and writes no line.
            if (!completableRun(state, action)) return null;
            return { id, timestamp: now, icon: '🎉', message: `${action.missionPhase === 'morning' ? 'Morning' : 'Evening'} mission completed`, delta: +action.bonusTokens, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snap() };
        }
        case 'COMPLETE_TASK':
            return null; // The user requested to only log the main event, not subtasks.
        case 'RESET_MISSION_WITH_TIMER':
            return { id, timestamp: now, icon: '🔄', message: `Mission fully reset (tasks + timer)`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snap() };
        case 'ADJUST_MISSION_END': { // the reducer's own decision, and the move it really made
            const adjusted = adjustedMissionEnd(state, action);
            return adjusted && { id, timestamp: now, icon: '⏱️', message: adjusted.message, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snap() };
        }
        case 'ADD_RESPONSIBILITY_POINT': { // the reducer's own decision: a press that changes nothing writes no line
            const change = responsibilityPointChange(state, action);
            if (change === null) return null;
            const colorKey = change.task.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
            return { id, timestamp: now, icon: change.task.icon || '⭐', message: change.message, type: 'responsibility', colorKey, ...snap() };
        }
        case 'RESET_RESPONSIBILITY': { // the reducer's own decision: only a completed task is claimed, for its own reward
            const claim = responsibilityClaim(state, action);
            if (claim === null) return null;
            const colorKey = claim.task.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
            return { id, timestamp: now, icon: claim.task.icon, message: `${claim.task.label} completed`, delta: claim.tokens ? +claim.tokens : undefined, type: 'responsibility', colorKey, ...snap() };
        }
        case 'CHEAT_ATTEMPT':
            return { id, timestamp: now, icon: '🚨', message: 'Unauthorized bank access attempt!', type: 'cheat-attempt', colorKey: 'cheat', ...snap() };
        case 'LOCK_TASK': {
            const m = state.missions.find(mm => mm.phase === action.missionPhase);
            const t = m?.tasks.find(tt => tt.id === action.taskId);
            if (!t || t.locked || t.completed) return null; // mirror the scheduler guard
            return { id, timestamp: now, icon: '🔒', message: `Task locked: ${t.label}`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snap() };
        }
        case 'GRANT_GAME_TOKEN':
            if (gameTokenRoom(state) <= 0) return null; // capped (a goal's token counts) — nothing happened
            return { id, timestamp: now, icon: '🎁', message: 'Mood token granted manually', type: 'reward', colorKey: 'system', ...snap() };
        case 'CONSUME_GAME_TOKEN':
            if (state.gameTokens <= 0) return null;
            return { id, timestamp: now, icon: '🎮', message: 'Mood token removed', type: 'reward', colorKey: 'system', ...snap() };
        case 'RESET_GAME_TOKENS':
            return { id, timestamp: now, icon: '🧹', message: 'Mood tokens reset to zero', type: 'system', colorKey: 'system', ...snap() };
        case 'END_STALE_MISSION_RUN': {
            const message = staleRunEndedMessage(state, action.missionPhase, now);
            return message === null ? null : { id, timestamp: now, icon: '⏹️', message, type: 'mission', colorKey: action.missionPhase, ...snap() };
        }
        case 'SETTLE_GAME_TOKEN_CAP': {
            const note = gameTokenCapNote(state);
            return note && { id, timestamp: now, icon: '🔧', ...note, type: 'reward', colorKey: 'system', ...snap() };
        }
        case 'SET_MOOD_WIND': {
            const clamped = Math.max(-2, Math.min(2, action.level));
            if (clamped === state.moodWind) return null; // no-op, nothing happened
            const names: Record<number, string> = { 2: 'Excellent', 1: 'Good', 0: 'Normal', [-1]: 'Bad', [-2]: 'Horrible' };
            return { id, timestamp: now, icon: '🌬️', message: `Mood set to ${names[clamped] ?? clamped}`, type: 'system', colorKey: 'system', ...snap() };
        }
        case 'ADJUST_BEHAVIOR_PROGRESS':
            if (!Number.isFinite(action.amount)) return null; // refused by the reducer
            return { id, timestamp: now, icon: '📈', message: `Mood gauge adjusted (${action.amount > 0 ? '+' : ''}${action.amount}) — ${action.reason}`, type: 'system', colorKey: 'system', ...snap() };
        case 'SET_PRIVILEGE_STATUS': {
            // "In force" is judged by the shared predicate at the action's own
            // instant, so a no-op (reinstating a lapsed suspension, suspending
            // into the past, re-sending the same one) writes no line.
            const card = state.privileges.find(p => p.id === action.cardId);
            if (!card) return null;
            const nowMs = Date.parse(now);
            const name = `**${card.label}**`;
            if (action.status === 'suspended') {
                const endMs = parseSuspensionEnd(action.suspendedUntil);
                if (endMs === null || endMs <= nowMs) return null;
                if (isPrivilegeSuspended(card, nowMs) && card.suspendedUntil === action.suspendedUntil) return null;
                return { id, timestamp: now, icon: '🚫', message: `${name} suspended ${formatSuspensionLength(endMs, nowMs)}`, type: 'system', colorKey: 'system', ...snap() };
            }
            if (action.status === 'active') {
                if (!isPrivilegeSuspended(card, nowMs) && card.status !== 'locked') return null;
                return { id, timestamp: now, icon: '✅', message: `${name} reinstated`, type: 'system', colorKey: 'system', ...snap() };
            }
            if (action.status !== 'locked' || card.status === 'locked') return null;
            return { id, timestamp: now, icon: '🔒', message: `${name} locked`, type: 'system', colorKey: 'system', ...snap() };
        }
        case 'EXPIRE_SUSPENSIONS': {
            // Names the end time, not only "now": a suspension that ran out while
            // the app was closed is lifted, and logged, at the next launch.
            const nowMs = Date.parse(now);
            const ended = state.privileges.filter(p => effectivePrivilege(p, nowMs) !== p);
            if (!Number.isFinite(nowMs) || ended.length === 0) return null;
            const names = ended.map(p => `**${p.label}** suspension ended (${formatLogStamp(parseSuspensionEnd(p.suspendedUntil) ?? nowMs)})`);
            return { id, timestamp: now, icon: '✅', message: names.join(', '), type: 'system', colorKey: 'system', ...snap() };
        }
        case 'CLEAR_LOGS': {
            // The interceptor dispatches ADD_LOG *after* the reducer wipes the
            // ring, so this entry survives the clear it records — and from the
            // ring it is mirrored into the durable trail, which must never lose
            // the one event (a wipe) it exists to survive.
            const wiped = state.activityLogs.length;
            if (wiped === 0) return null; // nothing was cleared
            return { id, timestamp: now, icon: '🧹', message: `Activity log cleared (${wiped} ${wiped === 1 ? 'entry' : 'entries'})`, type: 'system', colorKey: 'system', ...snap() };
        }
        default:
            return null;
    }
}
