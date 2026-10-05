import { google, type calendar_v3 } from 'googleapis';
import crypto from 'node:crypto';
import { authService } from './auth';
import { store, UserConfig, type WriteResult } from './store';
import { loadSettingsForDialog, saveSettingsFromDialog } from './settings-dialog';
import { errorSummary } from './log-safe';

// Duplicate definition to avoid import issues from src in electron context if needed
// but we will try to stick to local types or basic mapping.
interface AppEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    allDay?: boolean;
    isHoliday?: boolean;
    description?: string;
    location?: string;
    colorId?: string;
    color?: string; // Hex color for calendar color inheritance
}

/**
 * `strict` is for a reader that must not mistake a failure for an answer (the
 * school-bag decision): every failure the calendar view forgives — signed out,
 * a calendar that errors, the holiday feed down — throws instead of shrinking
 * the list. Off by default, so the calendar view's behaviour is unchanged.
 */
export interface EventFetchOptions {
    strict?: boolean;
}

interface AppTask {
    id: string;
    title: string;
    status: 'needsAction' | 'completed';
}

export class ApiService {

    /** Public holidays are static per year — cache them so navigation and the
     *  5-minute refresh loop don't hammer the external API (and keep working offline). */
    private holidayCache = new Map<number, AppEvent[]>();

    /** Calendar colors change rarely — refresh at most once per hour instead of
     *  adding a calendarList round-trip to every event fetch. */
    private calendarColorsCache: { colors: Map<string, string>; fetchedAt: number } | null = null;
    private static readonly CALENDAR_COLORS_TTL_MS = 60 * 60 * 1000;

    /** settings:get — strict: throws while the file cannot be read (settings-dialog.ts). */
    getSettings(): UserConfig {
        return loadSettingsForDialog();
    }

    /** settings:save — settings fields only, never the pairing; a refusal is a result. */
    saveSettings(config: UserConfig): WriteResult {
        return saveSettingsFromDialog(config);
    }

    async getCalendars() {
        if (!authService.isAuthenticated()) return [];
        const auth = authService.getAuthClient();
        const calendar = google.calendar({ version: 'v3', auth });
        const res = await calendar.calendarList.list();
        return (res.data.items || []).map(item => ({
            id: item.id,
            summary: item.summary,
            backgroundColor: item.backgroundColor,
            primary: item.primary
        }));
    }

    async getTaskLists() {
        if (!authService.isAuthenticated()) return [];
        const auth = authService.getAuthClient();
        const service = google.tasks({ version: 'v1', auth });
        const res = await service.tasklists.list();
        return (res.data.items || []).map(item => ({
            id: item.id,
            title: item.title,
            updated: item.updated
        }));
    }

    async getEvents(timeMin: Date, timeMax: Date, { strict = false }: EventFetchOptions = {}): Promise<AppEvent[]> {
        if (!authService.isAuthenticated()) {
            if (strict) throw new Error('Not signed in to Google Calendar');
            return [];
        }
        const auth = authService.getAuthClient();
        const calendar = google.calendar({ version: 'v3', auth });

        // Read config
        const config = store.get();
        // Default to 'primary' if nothing selected (first run logic mainly)
        const calendarIds = config.calendarIds.length > 0 ? config.calendarIds : ['primary'];

        // Fetch calendar colors map (cached — colors rarely change)
        let calendarColors: Map<string, string>;
        if (this.calendarColorsCache && Date.now() - this.calendarColorsCache.fetchedAt < ApiService.CALENDAR_COLORS_TTL_MS) {
            calendarColors = this.calendarColorsCache.colors;
        } else {
            calendarColors = new Map<string, string>();
            try {
                const calList = await calendar.calendarList.list();
                if (calList.data.items) {
                    calList.data.items.forEach(c => {
                        if (c.id && c.backgroundColor) {
                            calendarColors.set(c.id, c.backgroundColor);
                            if (c.primary) {
                                calendarColors.set('primary', c.backgroundColor);
                            }
                        }
                    });
                }
                this.calendarColorsCache = { colors: calendarColors, fetchedAt: Date.now() };
            } catch (e) {
                console.warn(`Failed to fetch calendar colors (${errorSummary(e)})`);
                // Keep serving a stale cache (if any) rather than dropping colors entirely
                if (this.calendarColorsCache) calendarColors = this.calendarColorsCache.colors;
            }
        }

        const allEventsPromises = calendarIds.map(async (calId) => {
            try {
                const items = await this.listCalendarEvents(calendar, calId, timeMin, timeMax, strict);

                return items.map(event => {
                    const allDay = !!event.start?.date;
                    const startRaw = event.start?.dateTime || event.start?.date;
                    const endRaw = event.end?.dateTime || event.end?.date;

                    // Ensure all-day events are parsed as local dates (00:00:00) 
                    // to avoid shifting to previous day in Western timezones.
                    const start = (allDay && startRaw && !startRaw.includes('T'))
                        ? `${startRaw}T00:00:00`
                        : startRaw;
                    const end = (allDay && endRaw && !endRaw.includes('T'))
                        ? `${endRaw}T00:00:00`
                        : endRaw;

                    // Simple heuristic for holiday: if transparency is 'transparent' (Available) 
                    // and it's an all-day event, it's often a holiday or observance.
                    // Also check eventType if available.
                    const isHoliday = event.eventType === 'holiday' ||
                        (allDay && event.transparency === 'transparent');

                    return {
                        id: event.id || crypto.randomUUID(),
                        title: event.summary || 'No Title',
                        start: new Date(start!),
                        end: new Date(end!),
                        allDay: allDay,
                        location: event.location || undefined,
                        description: event.description || undefined,
                        isHoliday: isHoliday,
                        colorId: event.colorId || undefined,
                        color: event.colorId ? undefined : calendarColors.get(calId)
                    } as AppEvent;
                });
            } catch (error) {
                if (strict) throw error; // its Pro-D days would silently vanish
                console.warn(`Failed to fetch events for calendar ${calId} (${errorSummary(error)})`);
                return [];
            }
        });

        const results = await Promise.all(allEventsPromises);
        const flatEvents = results.flat();

        // Fetch Public Holidays (Statutory BC)
        const years = Array.from(new Set([timeMin.getFullYear(), timeMax.getFullYear()]));
        const holidayPromises = years.map(year => this.getPublicHolidays(year, { strict }));
        const holidayResults = await Promise.all(holidayPromises);
        const holidays = holidayResults.flat().filter(h => h.start >= timeMin && h.start <= timeMax);

        const combinedEvents = [...flatEvents, ...holidays];

        // Sort by start time
        return combinedEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    /** Google may answer fewer items than a page holds, even none, with a nextPageToken. */
    private static readonly MAX_STRICT_PAGES = 10;

    /**
     * One calendar's events. The forgiving read takes the first page, as it
     * always has; a strict read follows nextPageToken to the end, because a
     * later page — even after an empty one — could hold the Pro-D day.
     */
    private async listCalendarEvents(
        calendar: calendar_v3.Calendar, calendarId: string, timeMin: Date, timeMax: Date, strict: boolean,
    ): Promise<calendar_v3.Schema$Event[]> {
        const items: calendar_v3.Schema$Event[] = [];
        let pageToken: string | undefined;
        for (let page = 0; page < ApiService.MAX_STRICT_PAGES; page++) {
            const res = await calendar.events.list({
                calendarId,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
                ...(pageToken ? { pageToken } : {}),
            });
            items.push(...(res.data.items || []));
            pageToken = res.data.nextPageToken || undefined;
            if (!strict || !pageToken) return items;
        }
        throw new Error(`Calendar ${calendarId} answered more than ${ApiService.MAX_STRICT_PAGES} pages`);
    }

    /** A failure is never cached, so the next call asks again. */
    async getPublicHolidays(year: number, { strict = false }: EventFetchOptions = {}): Promise<AppEvent[]> {
        const cached = this.holidayCache.get(year);
        if (cached) return cached;

        try {
            const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CA`);
            if (!response.ok) throw new Error(`Public holidays answered ${response.status}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = await response.json() as any[];

            const holidays = data
                .filter(h => h.global || (h.counties && h.counties.includes('CA-BC')))
                .map(h => ({
                    id: `holiday-${h.date}-${h.name}`,
                    title: h.localName || h.name,
                    start: new Date(h.date + 'T00:00:00'),
                    end: new Date(h.date + 'T23:59:59'),
                    allDay: true,
                    isHoliday: true,
                }));
            this.holidayCache.set(year, holidays);
            return holidays;
        } catch (error) {
            if (strict) throw error;
            console.warn("Failed to fetch public holidays", error);
            return [];
        }
    }

    async getTasks(): Promise<AppTask[]> {
        if (!authService.isAuthenticated()) return [];
        const auth = authService.getAuthClient();
        const service = google.tasks({ version: 'v1', auth });

        const config = store.get();
        // If no task lists selected, try to fetch from default (first one)
        let listIds = config.taskListIds;

        if (listIds.length === 0) {
            // Fetch default list
            try {
                const lists = await service.tasklists.list({ maxResults: 1 });
                if (lists.data.items && lists.data.items.length > 0) {
                    listIds = [lists.data.items[0].id!];
                }
            } catch (e) {
                console.error(`Failed to fetch default task list (${errorSummary(e)})`);
                return [];
            }
        }

        const allTasksPromises = listIds.map(async (listId) => {
            try {
                const tasks = await service.tasks.list({
                    tasklist: listId,
                    showCompleted: false,
                    maxResults: 20
                });
                return (tasks.data.items || []).map(t => ({
                    id: t.id!,
                    title: t.title!,
                    status: t.status === 'completed' ? 'completed' : 'needsAction'
                } as AppTask));
            } catch (e) {
                console.warn(`Failed to fetch tasks for list ${listId} (${errorSummary(e)})`);
                return [];
            }
        });

        const results = await Promise.all(allTasksPromises);
        return results.flat();
    }
}

export const apiService = new ApiService();
