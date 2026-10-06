import { useEffect, useState, type ReactNode } from 'react';
import { CalendarSession, CalendarSessionContext } from './calendarSession';

/**
 * Owns the Calendar's session (calendarSession.ts) above App's view switch, so it outlives the
 * Calendar while Mission Control is on screen. It hears the two sign-in events itself: on the
 * Mission Control view no Calendar is mounted to hear them, and a sign-in there (a Reconnect
 * finished in the browser) or a sign-out (Google refusing the saved sign-in) must not let the next
 * Calendar show what was read before it. No timer, no read of its own.
 */
export function CalendarSessionProvider({ children }: { children: ReactNode }) {
    const [session] = useState(() => new CalendarSession());

    useEffect(() => {
        const ipc = window.ipcRenderer;
        if (!ipc) return;
        const offSignIn = ipc.on('auth:success', () => session.forget());
        const offSignOut = ipc.on('auth:signed-out', () => session.forget());
        return () => {
            offSignIn();
            offSignOut();
        };
    }, [session]);

    return <CalendarSessionContext.Provider value={session}>{children}</CalendarSessionContext.Provider>;
}
