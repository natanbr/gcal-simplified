// ============================================================
// Mission Control — Activity Log: what every derived entry shares
// createLogEntry (activityLog.ts) fixes these before any case runs and
// hands them to the per-area builders (bankLog.ts).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { ActivityLogEntry } from '../types';

/** The entry id, the action's own instant, and the balances after it (lazy: a refused line never pays the reduce). */
export interface LogEnvelope {
    id: string;
    now: string;
    snap: () => Pick<ActivityLogEntry, 'totalTokens' | 'bankTokens' | 'gameTokens' | 'source' | 'isRemote'>;
}
