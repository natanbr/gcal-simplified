import { useState, useEffect } from 'react';
import { startOfDay } from 'date-fns';

/**
 * A hook that returns the current date, updating automatically when the day changes (at midnight).
 * It checks for date changes every minute.
 */
export function useCurrentDate() {
    // Initialize with start of today to ensure consistency
    const [today, setToday] = useState(() => startOfDay(new Date()));

    useEffect(() => {
        const checkDate = () => {
            const now = new Date();
            const currentStartOfDay = startOfDay(now);

            // Compare timestamps to see if the day has changed
            // We use functional state update to access the current 'today' without adding it to dependencies
            // preventing unnecessary interval recreations.
            setToday(prevToday => {
                if (currentStartOfDay.getTime() !== prevToday.getTime()) {
                    return currentStartOfDay;
                }
                return prevToday;
            });
        };

        // Check every minute
        const interval = setInterval(checkDate, 60 * 1000);

        // Initial check in case the component mounts just before midnight
        checkDate();

        return () => clearInterval(interval);
    }, []);

    return today;
}
