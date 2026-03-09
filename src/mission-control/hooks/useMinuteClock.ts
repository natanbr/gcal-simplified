// ============================================================
// Mission Control — useMinuteClock
// Returns a live Date object that updates exactly on the minute
// boundary, rather than every second. This prevents 59/60
// unnecessary React renders per minute for UI that only displays
// HH:MM (e.g. LiveClockDisplay).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState, useEffect } from 'react';

export function useMinuteClock(): Date {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const syncToMinute = () => {
            const current = new Date();
            setNow(current);

            // Calculate ms until the NEXT minute starts
            // Use recursive setTimeout instead of setInterval to prevent drift
            // when the browser throttles background tabs.
            const msToNextMinute = 60000 - (current.getTime() % 60000);

            timeoutId = setTimeout(syncToMinute, msToNextMinute);
        };

        syncToMinute();

        return () => clearTimeout(timeoutId);
    }, []);

    return now;
}
