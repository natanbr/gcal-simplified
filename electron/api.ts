import { google } from 'googleapis';
import { authService } from './auth';
import { store, UserConfig } from './store';

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

interface AppTask {
    id: string;
    title: string;
    status: 'needsAction' | 'completed';
}

export class ApiService {

    getSettings(): UserConfig {
        return store.get();
    }

    saveSettings(config: UserConfig) {
        store.set(config);
    }

    async getCalendars() {
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
        const auth = authService.getAuthClient();
        const service = google.tasks({ version: 'v1', auth });
        const res = await service.tasklists.list();
        return (res.data.items || []).map(item => ({
            id: item.id,
            title: item.title,
            updated: item.updated
        }));
    }

    async getEvents(timeMin: Date, timeMax: Date): Promise<AppEvent[]> {
        const auth = authService.getAuthClient();
        const calendar = google.calendar({ version: 'v3', auth });

        // Read config
        const config = store.get();
        // Default to 'primary' if nothing selected (first run logic mainly)
        const calendarIds = config.calendarIds.length > 0 ? config.calendarIds : ['primary'];

        // Fetch calendar colors map
        const calendarColors = new Map<string, string>();
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
        } catch (e) {
            console.warn("Failed to fetch calendar colors", e);
        }

        const allEventsPromises = calendarIds.map(async (calId) => {
            try {
                const res = await calendar.events.list({
                    calendarId: calId,
                    timeMin: timeMin.toISOString(),
                    timeMax: timeMax.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                });

                return (res.data.items || []).map(event => {
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
                        id: event.id || Math.random().toString(),
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
                console.warn(`Failed to fetch events for calendar ${calId}`, error);
                return [];
            }
        });

        const results = await Promise.all(allEventsPromises);
        const flatEvents = results.flat();

        // Fetch Public Holidays (Statutory BC)
        const years = Array.from(new Set([timeMin.getFullYear(), timeMax.getFullYear()]));
        const holidayPromises = years.map(year => this.getPublicHolidays(year));
        const holidayResults = await Promise.all(holidayPromises);
        const holidays = holidayResults.flat().filter(h => h.start >= timeMin && h.start <= timeMax);

        const combinedEvents = [...flatEvents, ...holidays];

        // Sort by start time
        return combinedEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    async getPublicHolidays(year: number): Promise<AppEvent[]> {
        try {
            const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CA`);
            if (!response.ok) return [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = await response.json() as any[];

            return data
                .filter(h => h.global || (h.counties && h.counties.includes('CA-BC')))
                .map(h => ({
                    id: `holiday-${h.date}-${h.name}`,
                    title: h.localName || h.name,
                    start: new Date(h.date + 'T00:00:00'),
                    end: new Date(h.date + 'T23:59:59'),
                    allDay: true,
                    isHoliday: true,
                }));
        } catch (error) {
            console.warn("Failed to fetch public holidays", error);
            return [];
        }
    }

    async getTasks(): Promise<AppTask[]> {
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
                console.error("Failed to fetch default task list", e);
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
                console.warn(`Failed to fetch tasks for list ${listId}`, e);
                return [];
            }
        });

        const results = await Promise.all(allTasksPromises);
        return results.flat();
    }
}

export const apiService = new ApiService();
