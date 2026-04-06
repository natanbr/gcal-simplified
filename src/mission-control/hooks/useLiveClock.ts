// ============================================================
// Mission Control — useLiveClock
// Returns a live Date object that updates every second.
// ⚡ Bolt Performance: Uses a singleton interval to prevent
// multiple intervals when consumed by multiple components.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState, useEffect } from 'react';

// Singleton state
let sharedNow = new Date();
let intervalId: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<React.Dispatch<React.SetStateAction<Date>>>();

function startInterval() {
    if (intervalId === null) {
        sharedNow = new Date(); // initialize exactly at start to prevent drift
        intervalId = setInterval(() => {
            sharedNow = new Date();
            subscribers.forEach(setNow => setNow(sharedNow));
        }, 1000);
    }
}

function stopInterval() {
    if (intervalId !== null && subscribers.size === 0) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

// Ensure clean state for unit testing which repeatedly mounts/unmounts across fake timers
export function _resetLiveClockForTesting() {
    subscribers.clear();
    stopInterval();
    sharedNow = new Date();
}

export function useLiveClock(): Date {
    const [now, setNow] = useState(() => {
        // If we don't have an interval running, use a fresh date instead of stale sharedNow
        if (intervalId === null) {
            sharedNow = new Date();
        }
        return sharedNow;
    });

    useEffect(() => {
        subscribers.add(setNow);
        startInterval();

        // Always catch up to latest in case it ticked between initial render and effect mount
        setNow(sharedNow);

        return () => {
            subscribers.delete(setNow);
            stopInterval();
        };
    }, []);

    return now;
}
