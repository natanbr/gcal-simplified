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

/** Snapshot of the token economy *after* the action is applied. */
function deriveSnapshots(state: MCState, action: MCAction) {
    const nextState = mcReducer(state, action);
    return {
        totalTokens: selectTotalWealth(nextState),
        bankTokens: nextState.bankCount,
        ...(action.isRemote ? { isRemote: true } : {}),
    };
}

export function createLogEntry(action: MCAction, state: MCState): ActivityLogEntry | null {
    const now = new Date().toISOString();
    const id = Math.random().toString(36).slice(2, 9);

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
        default:
            return null;
    }
}
