// ============================================================
// Mission Control — Activity Log Translation
// Turns dispatched actions into human-readable ActivityLogEntry
// records. Bank/total snapshots are derived by running the pure
// reducer, so they can never drift from the real state math.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCState, MCAction, ActivityLogEntry } from '../types';
import { mcReducer, selectTotalWealth } from './mcReducer';
import { isRefusedByShieldLock, shieldSegmentsLeft } from './missionStreak';
import { isQuickGameWindowOpen } from './gameWindow';
import { effectivePrivilege, isPrivilegeSuspended } from './privileges';
import { formatLogStamp, formatSuspensionLength, parseSuspensionEnd } from '../utils/timeUtils';
import { gameTokenRoom } from './moodGauge';
import { REWARD_MAP, canSelectReward } from '../rewardCatalogue';

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
    // Mirror the reducer's shield lock — same predicate, not a copied list. A
    // refused deposit that still logged "Deposited 3 tokens" would put a token
    // movement in the parent's audit trail that never happened.
    if (isRefusedByShieldLock(state, action)) return null;

    // The action's own instant, not the wall clock: the reducer decides every
    // refusal from `action.timestamp`, and two separate clock reads can disagree
    // about one dispatch at the boundary second (19:00:00.000) — the mirror
    // would then log a movement the reducer refused.
    const now = action.timestamp ?? new Date().toISOString();
    const id = self.crypto.randomUUID();

    /** Resolve a case id → highlighted goal name (e.g. **🎮 Game**) */
    const goalLabel = (caseId: number, { bold = true } = {}) => {
        const c = state.cases.find(x => x.id === caseId);
        const r = c?.reward ? REWARD_MAP[c.reward] : null;
        const name = r ? `${r.emoji} ${r.label}` : `Goal #${caseId + 1}`;
        return bold ? `**${name}**` : name;
    };

    /** Resolve a reward key → highlighted goal name */
    const rewardLabel = (rewardKey: string, { bold = true } = {}) => {
        const r = REWARD_MAP[rewardKey as keyof typeof REWARD_MAP];
        const name = r ? `${r.emoji} ${r.label}` : rewardKey;
        return bold ? `**${name}**` : name;
    };

    // Lazy: the speculative reduce only runs for cases that actually spread
    // snapshots — null paths (COMPLETE_TASK, settings toggles, future actions
    // hitting `default`) must not pay a second full reducer pass per dispatch.
    const snap = () => deriveSnapshots(state, action);

    switch (action.type) {
        case 'ADD_TOKEN':
            return { id, timestamp: now, icon: '🪙', message: 'Manual token added', delta: +1, type: 'manual', colorKey: 'bank', ...snap() };
        case 'ADD_TOKENS':
            if (action.source === 'mission') return { id, timestamp: now, icon: '🎉', message: `${action.label || 'Mission'} completed`, delta: +action.amount, type: 'mission', colorKey: action.label?.toLowerCase().includes('morning') ? 'morning' : 'evening', ...snap() };
            if (action.source === 'responsibility') {
                const colorKey = action.label?.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
                return { id, timestamp: now, icon: '⭐', message: `${action.label || 'Activity'} completed`, delta: +action.amount, type: 'responsibility', colorKey, ...snap() };
            }
            return { id, timestamp: now, icon: '🪙', message: `Manual tokens added`, delta: +action.amount, type: 'manual', colorKey: 'bank', ...snap() };
        case 'REMOVE_TOKEN':
            return { id, timestamp: now, icon: '🪙', message: 'Manual token removed', delta: -1, type: 'manual', colorKey: 'bank', ...snap() };
        case 'SELECT_CASE':
            // The reducer's own refusal predicate: a disabled reward, or a quick
            // game with no game token, must not log a goal that was never set.
            if (!canSelectReward(state, action.reward)) return null;
            return { id, timestamp: now, icon: '🎯', message: `Goal selected: ${rewardLabel(action.reward)}`, type: 'system', colorKey: 'system', ...snap() };
        case 'DEPOSIT_TO_CASE': {
            const tkn = action.amount === 1 ? 'token' : 'tokens';
            return { id, timestamp: now, icon: '🏦', message: `${action.amount} ${tkn} deposited to ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snap() };
        }
        case 'MOVE_TOKEN': {
            if (action.from === 'bank' && typeof action.to === 'number') {
                return { id, timestamp: now, icon: '📤', message: `1 token added to ${goalLabel(action.to)}`, type: 'system', colorKey: 'system', ...snap() };
            }
            if (typeof action.from === 'number' && action.to === 'bank') {
                return { id, timestamp: now, icon: '📥', message: `1 token removed from ${goalLabel(action.from)}`, type: 'system', colorKey: 'system', ...snap() };
            }
            if (typeof action.from === 'number' && typeof action.to === 'number') {
                return { id, timestamp: now, icon: '🔀', message: `1 token moved from ${goalLabel(action.from)} to ${goalLabel(action.to)}`, type: 'system', colorKey: 'system', ...snap() };
            }
            return null;
        }
        case 'VACUUM_TO_CASE': {
            const target = state.cases.find(c => c.id === action.caseId);
            if (!target) return null;
            // Mirror the reducer's guards — a rejected vacuum (quick-game case,
            // full case, empty bank) must not produce a phantom entry.
            if (target.reward === 'quick-game') return null;
            const amount = Math.min(state.bankCount, target.targetCount - target.tokenCount);
            if (amount <= 0) return null;
            const tkn = amount === 1 ? 'token' : 'tokens';
            return { id, timestamp: now, icon: '💨', message: `${amount} ${tkn} vacuumed to ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snap() };
        }
        case 'REFUND_CASE': {
            const target = state.cases.find(c => c.id === action.caseId);
            if (!target) return null;
            // A Quick-Game goal holds a game token, never bank tokens.
            if (target.reward === 'quick-game') {
                return { id, timestamp: now, icon: '↩️', message: `Game token returned from ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snap() };
            }
            const tkn = target.tokenCount === 1 ? 'token' : 'tokens';
            return { id, timestamp: now, icon: '↩️', message: `${target.tokenCount} ${tkn} refunded from ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snap() };
        }
        case 'CONSUME_CASE': {
            const target = state.cases.find(c => c.id === action.caseId);
            if (!target || !target.reward) return null;
            // Mirror the reducer's OTHER refusal on this case. Without it a
            // redemption refused at the evening boundary still writes
            // "Used: Quick Game -3" into the append-only trail for tokens that
            // never moved.
            if (target.reward === 'quick-game' && !isQuickGameWindowOpen(state, now)) return null;
            return { id, timestamp: now, icon: '🎁', message: `Used: ${rewardLabel(target.reward)}`, delta: -target.tokenCount, type: 'reward', colorKey: 'system', ...snap() };
        }
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
                // Scheduler-driven expiry — record which phase just timed out so
                // parents can see it in the activity log.
                const timedOutPhase = state.activeMission;
                if (timedOutPhase === 'none') return null; // already inactive, nothing to log
                const phaseLabel = timedOutPhase === 'morning' ? 'Morning' : 'Evening';
                return { id, timestamp: now, icon: '🕐', message: `${phaseLabel} mission expired`, type: 'mission', colorKey: timedOutPhase, ...snap() };
            }
            return { id, timestamp: now, icon: action.phase === 'morning' ? '☀️' : '🌙', message: `${action.phase} mission started`, type: 'mission', colorKey: action.phase, ...snap() };
        case 'CANCEL_MISSION':
            return { id, timestamp: now, icon: '⏹️', message: `Mission stopped`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snap() };
        case 'MARK_MISSION_TIMEOUT':
            // Suppressed: SET_ACTIVE_MISSION phase:'none' now logs the expiry event with full
            // phase context. Logging here too would produce a duplicate entry.
            return null;
        case 'COMPLETE_MISSION_ROUTINE': {
            // Mirror the reducer's idempotency guard — a second completion
            // dispatch is a no-op and must not produce a duplicate log entry.
            const mission = state.missions.find(m => m.phase === action.missionPhase);
            if (!mission || !mission.active) return null;
            return { id, timestamp: now, icon: '🎉', message: `${action.missionPhase === 'morning' ? 'Morning' : 'Evening'} mission completed`, delta: +action.bonusTokens, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snap() };
        }
        case 'COMPLETE_TASK':
            return null; // The user requested to only log the main event, not subtasks.
        case 'RESET_MISSION_WITH_TIMER':
            return { id, timestamp: now, icon: '🔄', message: `Mission fully reset (tasks + timer)`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snap() };
        case 'ADJUST_MISSION_END':
            return { id, timestamp: now, icon: '⏱️', message: `Mission time adjusted (${action.deltaMinutes > 0 ? '+' : ''}${action.deltaMinutes}m)`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snap() };
        case 'ADD_RESPONSIBILITY_POINT': {
            const resp = state.responsibilities.find(r => r.id === action.taskId);
            const colorKey = resp?.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
            return { id, timestamp: now, icon: resp?.icon || '⭐', message: `Point earned for ${resp?.label || 'responsibility'}`, type: 'responsibility', colorKey, ...snap() };
        }
        case 'RESET_RESPONSIBILITY': {
            const resp = state.responsibilities.find(r => r.id === action.taskId);
            const colorKey = resp?.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
            return resp ? { id, timestamp: now, icon: resp.icon, message: `${resp.label} completed`, delta: action.claimTokens ? +action.claimTokens : undefined, type: 'responsibility', colorKey, ...snap() } : null;
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
