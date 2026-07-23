// ============================================================
// Mission Control — Behavior Heartbeat
// Emits a SYNC_BEHAVIOR tick every minute so mood progress accrues
// continuously while the app is actually running.
//
// This tick is also the "app is on" signal: because every tick advances
// behaviorLastUpdated, any gap the reducer later sees that is larger than one
// tick means the app was closed (or the machine asleep) — and the reducer
// discards that span instead of back-filling it.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import React, { useEffect } from 'react';
import type { MCAction } from '../types';

const HEARTBEAT_MS = 60 * 1000;

export function useBehaviorHeartbeat(dispatch: React.Dispatch<MCAction>): void {
    useEffect(() => {
        const id = setInterval(() => {
            dispatch({ type: 'SYNC_BEHAVIOR', timestamp: new Date().toISOString() });
        }, HEARTBEAT_MS);

        return () => clearInterval(id);
    }, [dispatch]);
}
