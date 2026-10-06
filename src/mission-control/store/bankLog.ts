// ============================================================
// Mission Control — Activity Log: the bank and goal (case) lines
// Bank tokens added and removed by hand, a goal picked, tokens put on,
// moved between and taken off goals, and a goal spent on its reward.
// (Game-token lines and a responsibility's Claim are in activityLog.ts.)
// Called by createLogEntry after its shared refusals (unlogged, shield
// lock, stale mission), with the id, instant and lazy balance snapshot
// it gives every derived entry.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCState, MCAction, ActivityLogEntry } from '../types';
import type { LogEnvelope } from './logEnvelope';
import { isQuickGameWindowOpen } from './gameWindow';
import { REWARD_MAP, canSelectReward } from '../rewardCatalogue';

/** The one list of what this file logs: createLogEntry routes by it, and bankLogEntry's switch must cover it. */
const BANK_ACTIONS = [
    'ADD_TOKEN', 'ADD_TOKENS', 'REMOVE_TOKEN', 'SELECT_CASE', 'DEPOSIT_TO_CASE',
    'MOVE_TOKEN', 'VACUUM_TO_CASE', 'REFUND_CASE', 'CONSUME_CASE',
] as const satisfies ReadonlyArray<MCAction['type']>;

export type BankAction = Extract<MCAction, { type: (typeof BANK_ACTIONS)[number] }>;

const BANK_ACTION_TYPES: ReadonlySet<MCAction['type']> = new Set(BANK_ACTIONS);

export function isBankAction(action: MCAction): action is BankAction {
    return BANK_ACTION_TYPES.has(action.type);
}

export function bankLogEntry(action: BankAction, state: MCState, { id, now, snap }: LogEnvelope): ActivityLogEntry | null {
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
    }
}
