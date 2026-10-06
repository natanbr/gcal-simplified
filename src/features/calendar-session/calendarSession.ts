// ============================================================
// Calendar session — what the Calendar has read, kept while Mission Control is on screen
// ------------------------------------------------------------
// App swaps the two views, so the Calendar (CalendarApp, the Dashboard and its
// hooks) unmounts at every switch to Mission Control. What it last showed is
// kept here, above the view switch, so the return draws that week at once and
// reads it again in the background, instead of the full-screen "Syncing with
// Google..." and, offline, an empty week.
//
// It belongs to one sign-in. A sign-in or a sign-out empties it (`forget`), and
// a Dashboard that mounted before that can no longer keep anything in it, so
// nothing read for one account reaches the next. Memory only: a relaunch
// starts without it. It has no timer and does no work: the Calendar writes it
// when its own state changes and reads it when a Dashboard mounts.
// ============================================================

import { createContext, useContext, useState } from 'react';
import type { AppTask, UserConfig, WeatherData } from '../../types';
import type { CalendarCache } from '../../hooks/useCalendarData';

/** What useDashboardLoad last loaded. */
export interface DashboardData { config: UserConfig; tasks: AppTask[]; weather: WeatherData | null }

/** What the last Dashboard of this sign-in left: its loads, and the events it read (useCalendarData). */
export interface Kept { dashboard?: DashboardData; calendar?: CalendarCache }

/** One Dashboard's hold on the session, taken when it mounts. */
export interface SessionTicket {
    /** What the last Dashboard of this sign-in left, as it was when this one mounted. */
    readonly kept: Readonly<Kept>;
    /** That Dashboard had got past the spinner: this one starts from its week. */
    readonly warm: boolean;
    /** Leaves part of what this Dashboard shows for the next one. Refused once a sign-in or a sign-out came after it mounted. */
    keep<K extends keyof Kept>(part: K, value: NonNullable<Kept[K]>): void;
}

export class CalendarSession {
    private signIn = 0;
    private kept: Kept = {};

    /** A Dashboard of this sign-in has read a month (it got past the spinner): the next one can start from it. */
    get warm(): boolean {
        return Object.keys(this.kept.calendar?.months ?? {}).length > 0;
    }

    open(): SessionTicket {
        const signIn = this.signIn;
        return {
            kept: this.kept,
            warm: this.warm,
            keep: (part, value) => {
                if (signIn === this.signIn) this.kept = { ...this.kept, [part]: value };
            },
        };
    }

    /** A sign-in or a sign-out: nothing kept survives it, and no Dashboard from before it can keep. */
    forget(): void {
        this.signIn += 1;
        this.kept = {};
    }
}

export const CalendarSessionContext = createContext<CalendarSession | null>(null);

/** The session above App's view switch; null outside it (a Dashboard rendered on its own keeps nothing). */
export function useCalendarSession(): CalendarSession | null {
    return useContext(CalendarSessionContext);
}

/** This component's ticket, taken once, when it mounts. */
export function useSessionTicket(): SessionTicket | null {
    const session = useCalendarSession();
    const [ticket] = useState(() => session?.open() ?? null);
    return ticket;
}
