// ============================================================
// Mission Control — Activity Log Translation
// Turns dispatched actions into human-readable ActivityLogEntry
// records. Bank/total snapshots are derived by running the pure
// reducer, so they can never drift from the real state math.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCState, MCAction, ActivityLogEntry } from '../types';
import { mcReducer, selectTotalWealth } from './mcReducer';
import { REWARD_MAP } from '../rewardCatalogue';

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
 * Action types that never produce an interceptor log entry. Listed HERE,
 * before any work happens, because `deriveSnapshots` below runs the full
 * reducer speculatively — for a per-answer action like RECORD_QUIZ_ANSWER
 * that would mean every quiz tap pays the reducer twice. (Its level-change
 * log is written inside the reducer itself, mood-grant style.)
 */
const UNLOGGED_ACTIONS = new Set<MCAction['type']>([
    'RECORD_QUIZ_ANSWER',
]);

export function createLogEntry(action: MCAction, state: MCState): ActivityLogEntry | null {
    if (UNLOGGED_ACTIONS.has(action.type)) return null;

    const now = new Date().toISOString();
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

    const snapshots = deriveSnapshots(state, action);

    switch (action.type) {
        case 'ADD_TOKEN':
            return { id, timestamp: now, icon: '🪙', message: 'Manual token added', delta: +1, type: 'manual', colorKey: 'bank', ...snapshots };
        case 'ADD_TOKENS':
            if (action.source === 'mission') return { id, timestamp: now, icon: '🎉', message: `${action.label || 'Mission'} completed`, delta: +action.amount, type: 'mission', colorKey: action.label?.toLowerCase().includes('morning') ? 'morning' : 'evening', ...snapshots };
            if (action.source === 'responsibility') {
                const colorKey = action.label?.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
                return { id, timestamp: now, icon: '⭐', message: `${action.label || 'Activity'} completed`, delta: +action.amount, type: 'responsibility', colorKey, ...snapshots };
            }
            return { id, timestamp: now, icon: '🪙', message: `Manual tokens added`, delta: +action.amount, type: 'manual', colorKey: 'bank', ...snapshots };
        case 'REMOVE_TOKEN':
            return { id, timestamp: now, icon: '🪙', message: 'Manual token removed', delta: -1, type: 'manual', colorKey: 'bank', ...snapshots };
        case 'SELECT_CASE':
            return { id, timestamp: now, icon: '🎯', message: `Goal selected: ${rewardLabel(action.reward)}`, type: 'system', colorKey: 'system', ...snapshots };
        case 'DEPOSIT_TO_CASE': {
            const tkn = action.amount === 1 ? 'token' : 'tokens';
            return { id, timestamp: now, icon: '🏦', message: `${action.amount} ${tkn} deposited to ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snapshots };
        }
        case 'MOVE_TOKEN': {
            if (action.from === 'bank' && typeof action.to === 'number') {
                return { id, timestamp: now, icon: '📤', message: `1 token added to ${goalLabel(action.to)}`, type: 'system', colorKey: 'system', ...snapshots };
            }
            if (typeof action.from === 'number' && action.to === 'bank') {
                return { id, timestamp: now, icon: '📥', message: `1 token removed from ${goalLabel(action.from)}`, type: 'system', colorKey: 'system', ...snapshots };
            }
            if (typeof action.from === 'number' && typeof action.to === 'number') {
                return { id, timestamp: now, icon: '🔀', message: `1 token moved from ${goalLabel(action.from)} to ${goalLabel(action.to)}`, type: 'system', colorKey: 'system', ...snapshots };
            }
            return null;
        }
        case 'VACUUM_TO_CASE': {
            const target = state.cases.find(c => c.id === action.caseId);
            if (!target) return null;
            const amount = Math.min(state.bankCount, target.targetCount - target.tokenCount);
            const tkn = amount === 1 ? 'token' : 'tokens';
            return { id, timestamp: now, icon: '💨', message: `${amount} ${tkn} vacuumed to ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snapshots };
        }
        case 'REFUND_CASE': {
            const target = state.cases.find(c => c.id === action.caseId);
            if (!target) return null;
            const tkn = target.tokenCount === 1 ? 'token' : 'tokens';
            return { id, timestamp: now, icon: '↩️', message: `${target.tokenCount} ${tkn} refunded from ${goalLabel(action.caseId)}`, type: 'system', colorKey: 'system', ...snapshots };
        }
        case 'CONSUME_CASE': {
            const target = state.cases.find(c => c.id === action.caseId);
            if (!target || !target.reward) return null;
            return { id, timestamp: now, icon: '🎁', message: `Used: ${rewardLabel(target.reward)}`, delta: -target.tokenCount, type: 'reward', colorKey: 'system', ...snapshots };
        }
        case 'SET_ACTIVE_MISSION':
            if (action.phase === 'none') {
                // Scheduler-driven expiry — record which phase just timed out so
                // parents can see it in the activity log.
                const timedOutPhase = state.activeMission;
                if (timedOutPhase === 'none') return null; // already inactive, nothing to log
                const phaseLabel = timedOutPhase === 'morning' ? 'Morning' : 'Evening';
                return { id, timestamp: now, icon: '🕐', message: `${phaseLabel} mission expired`, type: 'mission', colorKey: timedOutPhase, ...snapshots };
            }
            return { id, timestamp: now, icon: action.phase === 'morning' ? '☀️' : '🌙', message: `${action.phase} mission started`, type: 'mission', colorKey: action.phase, ...snapshots };
        case 'CANCEL_MISSION':
            return { id, timestamp: now, icon: '⏹️', message: `Mission stopped`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snapshots };
        case 'MARK_MISSION_TIMEOUT':
            // Suppressed: SET_ACTIVE_MISSION phase:'none' now logs the expiry event with full
            // phase context. Logging here too would produce a duplicate entry.
            return null;
        case 'COMPLETE_MISSION_ROUTINE': {
            // Mirror the reducer's idempotency guard — a second completion
            // dispatch is a no-op and must not produce a duplicate log entry.
            const mission = state.missions.find(m => m.phase === action.missionPhase);
            if (!mission || !mission.active) return null;
            return { id, timestamp: now, icon: '🎉', message: `${action.missionPhase === 'morning' ? 'Morning' : 'Evening'} mission completed`, delta: +action.bonusTokens, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snapshots };
        }
        case 'COMPLETE_TASK':
            return null; // The user requested to only log the main event, not subtasks.
        case 'RESET_MISSION_WITH_TIMER':
            return { id, timestamp: now, icon: '🔄', message: `Mission fully reset (tasks + timer)`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snapshots };
        case 'ADJUST_MISSION_END':
            return { id, timestamp: now, icon: '⏱️', message: `Mission time adjusted (${action.deltaMinutes > 0 ? '+' : ''}${action.deltaMinutes}m)`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snapshots };
        case 'ADD_RESPONSIBILITY_POINT': {
            const resp = state.responsibilities.find(r => r.id === action.taskId);
            const colorKey = resp?.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
            return { id, timestamp: now, icon: resp?.icon || '⭐', message: `Point earned for ${resp?.label || 'responsibility'}`, type: 'responsibility', colorKey, ...snapshots };
        }
        case 'RESET_RESPONSIBILITY': {
            const resp = state.responsibilities.find(r => r.id === action.taskId);
            const colorKey = resp?.label.toLowerCase().includes('recycling') ? 'recycling' : 'activity';
            return resp ? { id, timestamp: now, icon: resp.icon, message: `${resp.label} completed`, delta: action.claimTokens ? +action.claimTokens : undefined, type: 'responsibility', colorKey, ...snapshots } : null;
        }
        case 'CHEAT_ATTEMPT':
            return { id, timestamp: now, icon: '🚨', message: 'Unauthorized bank access attempt!', type: 'cheat-attempt', colorKey: 'cheat', ...snapshots };
        case 'LOCK_TASK': {
            const m = state.missions.find(mm => mm.phase === action.missionPhase);
            const t = m?.tasks.find(tt => tt.id === action.taskId);
            if (!t || t.locked || t.completed) return null; // mirror the scheduler guard
            return { id, timestamp: now, icon: '🔒', message: `Task locked: ${t.label}`, type: 'mission', colorKey: action.missionPhase === 'none' ? undefined : action.missionPhase, ...snapshots };
        }
        case 'GRANT_GAME_TOKEN':
            if (state.gameTokens >= 5) return null; // capped — nothing happened
            return { id, timestamp: now, icon: '🎁', message: 'Mood token granted manually', type: 'reward', colorKey: 'system', ...snapshots };
        case 'CONSUME_GAME_TOKEN':
            if (state.gameTokens <= 0) return null;
            return { id, timestamp: now, icon: '🎮', message: 'Mood token spent on a game', type: 'reward', colorKey: 'system', ...snapshots };
        case 'RESET_GAME_TOKENS':
            return { id, timestamp: now, icon: '🧹', message: 'Mood tokens reset to zero', type: 'system', colorKey: 'system', ...snapshots };
        case 'SET_MOOD_WIND': {
            const clamped = Math.max(-2, Math.min(2, action.level));
            if (clamped === state.moodWind) return null; // no-op, nothing happened
            const names: Record<number, string> = { 2: 'Excellent', 1: 'Good', 0: 'Normal', [-1]: 'Bad', [-2]: 'Horrible' };
            return { id, timestamp: now, icon: '🌬️', message: `Mood set to ${names[clamped] ?? clamped}`, type: 'system', colorKey: 'system', ...snapshots };
        }
        case 'ADJUST_BEHAVIOR_PROGRESS':
            return { id, timestamp: now, icon: '📈', message: `Mood gauge adjusted (${action.amount > 0 ? '+' : ''}${action.amount}) — ${action.reason}`, type: 'system', colorKey: 'system', ...snapshots };
        case 'END_GAME':
            // Deliberately unlogged. useQuickGameSession is the ONLY dispatcher
            // of END_GAME (it is not in REMOTE_ALLOWED_ACTIONS either), and it
            // hand-writes its own 🏁 entry carrying the score and duration —
            // strictly more than this case could know. Deriving one here as well
            // wrote two 🏁 lines per game and ate the 200-entry ring buffer
            // twice as fast. START_GAME has no case here for the same reason;
            // this makes the pair symmetric.
            return null;
        case 'CLEAR_LOGS':
            // Deliberately unlogged here (the entry would be wiped by the very
            // action that created it). The durable disk trail records it instead.
            return null;
        default:
            return null;
    }
}
