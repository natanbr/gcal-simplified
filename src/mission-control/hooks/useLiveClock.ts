// ============================================================
// Mission Control — useLiveClock
// Returns a live Date object that updates every second.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState, useEffect } from 'react';

export function useLiveClock(): Date {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    return now;
}
