// ============================================================
// Mission Control — a saved balance over the game-token cap is settled, logged
// ------------------------------------------------------------
// v0.0.42 could save 5 game tokens beside an open Quick-Game goal. The cap
// counts the goal's token (a trash refunds it), so that balance must drop to 4
// or the trash refunds to 6. Hydration used to clamp it silently; this settles
// it right after load through SETTLE_GAME_TOKEN_CAP, attributed `system`, so the
// removal gets its own log line and reaches the audit trail (a line written
// inside loadPersistedState would not: useAuditTrail treats the loaded log as
// already written). Same pattern as useSuspensionExpiry.
//
// Once per launch, before paint (a layout effect), and only when something is
// over: a launch within the cap dispatches nothing and creates no new state.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useLayoutEffect, useRef, useState } from 'react';
import { useMCStore, useMCDispatch } from './useMCStore';
import { gameTokensOverCap } from './moodGauge';

export function useGameTokenCapSettle(): void {
    const { state } = useMCStore();
    const dispatch = useMCDispatch();
    const [overAtLoad] = useState(() => gameTokensOverCap(state) > 0);
    // StrictMode runs the effect twice against the same pre-settle state; the
    // interceptor would derive a second log line from it.
    const settled = useRef(false);

    useLayoutEffect(() => {
        if (!overAtLoad || settled.current) return;
        settled.current = true;
        dispatch({ type: 'SETTLE_GAME_TOKEN_CAP', origin: 'system' });
    }, [overAtLoad, dispatch]);
}
