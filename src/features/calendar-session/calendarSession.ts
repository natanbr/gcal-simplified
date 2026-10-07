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
// when its own state changes and reads it when it mounts.
// ============================================================

import { createContext, useContext, useState } from 'react';
import type { AppEvent, AppTask, UserConfig, WeatherData } from '../../types';

/** One month's read (useCalendarData): its events and when they loaded, and whether its latest read failed. */
export type MonthEntry = { events: AppEvent[]; loadedAt: Date; failed?: true } | { events?: undefined; failed: true };

/** The events on screen, and the month whose read they came from. */
export interface Shown { events: AppEvent[]; from: { month: string; loadedAt: Date } | null }

/** What useCalendarData has read. */
export interface CalendarCache { months: Record<string, MonthEntry>; shown: Shown }

/** What useDashboardLoad last loaded. */
export interface DashboardData { config: UserConfig; tasks: AppTask[]; weather: WeatherData | null }

/** What the last Dashboard of this sign-in left: its loads, and the events it read. */
export interface Kept { dashboard?: DashboardData; calendar?: CalendarCache }

/**
 * The settings the Calendar draws with, copied field by field. `settings:get` also answers with the
 * phone pairing, and the session, which lives as long as the sign-in, must hold no copy of it.
 */
function calendarSettings(config: UserConfig): UserConfig {
    const { calendarIds, taskListIds, weekStartDay, activeHoursStart, activeHoursEnd, themeMode, manualDayStart, manualDayEnd } = config;
    return { calendarIds, taskListIds, weekStartDay, activeHoursStart, activeHoursEnd, themeMode, manualDayStart, manualDayEnd };
}

/** One Dashboard's hold on the session, taken when it mounts. Its writes are refused once a sign-in or a sign-out came after that. */
export interface SessionTicket {
    /** What the last Dashboard of this sign-in left, as it was when this one mounted. */
    readonly kept: Readonly<Kept>;
    /** That Dashboard had got past the spinner: this one starts from its week. */
    readonly warm: boolean;
    keepCalendar(calendar: CalendarCache): void;
    /** Keeps only the settings fields the Calendar draws with (calendarSettings). */
    keepDashboard(dashboard: DashboardData): void;
}

export class CalendarSession {
    private signIns = 0;
    private kept: Kept = {};

    /** Counts the sign-ins and sign-outs it has heard: a component that saw another number missed one. */
    get epoch(): number {
        return this.signIns;
    }

    /** A Dashboard of this sign-in has read a month (it got past the spinner): the next one can start from it. */
    get warm(): boolean {
        return Object.keys(this.kept.calendar?.months ?? {}).length > 0;
    }

    open(): SessionTicket {
        const opened = this.signIns;
        const current = () => opened === this.signIns;
        return {
            kept: this.kept,
            warm: this.warm,
            keepCalendar: calendar => {
                if (current()) this.kept = { ...this.kept, calendar };
            },
            keepDashboard: ({ config, tasks, weather }) => {
                if (current()) this.kept = { ...this.kept, dashboard: { config: calendarSettings(config), tasks, weather } };
            },
        };
    }

    /** A sign-in or a sign-out: nothing kept survives it, and no Dashboard from before it can keep. */
    forget(): void {
        this.signIns += 1;
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
