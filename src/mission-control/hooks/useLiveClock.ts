// ============================================================
// Mission Control — useLiveClock
// Returns a live Date object that updates every second.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState, useEffect } from 'react';

// ⚡ Bolt Performance: Use a singleton interval and a Set of subscribers
// to ensure only a single interval runs regardless of how many components
// mount useLiveClock.
const subscribers = new Set<React.Dispatch<React.SetStateAction<Date>>>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentDate = new Date();

function tick() {
    currentDate = new Date();
    subscribers.forEach((setNow) => setNow(currentDate));
}

export function _resetLiveClockForTesting() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    subscribers.clear();
    currentDate = new Date();
}

export function useLiveClock(): Date {
    // Initialize with the shared currentDate to ensure all subscribers
    // are perfectly in sync immediately upon mount.
    // Ensure the currentDate is updated to avoid showing a stale time
    // if the module was loaded a long time before the component mounts.
    const [now, setNow] = useState(() => {
        if (!intervalId) {
            currentDate = new Date();
        }
        return currentDate;
    });

    useEffect(() => {
        subscribers.add(setNow);

        if (!intervalId) {
            intervalId = setInterval(tick, 1000);
        }

        return () => {
            subscribers.delete(setNow);
            if (subscribers.size === 0 && intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };
    }, []);

    return now;
}
