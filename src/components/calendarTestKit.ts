// ============================================================
// Calendar — a fake of the IPC the Dashboard talks to, shared by its suites.
//
// Each answer is built when the request is made, as the main process does
// (it reads the selected calendars and task lists per request), so a test can
// change `events` or `tasks` between two requests and tell their answers apart.
//
// Not a test file, so the style-token and file-size ratchets scan it like
// production code. Import it from tests only — enforced by
// src/__tests__/test-kit-boundary.test.ts.
// ============================================================

import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { AppTask, SerializedAppEvent, UserConfig, WeatherData } from '../types';

interface Held { channel: string; release: () => void }

export interface CalendarIpc {
    settings: UserConfig;
    events: SerializedAppEvent[];
    tasks: AppTask[];
    weather: WeatherData | null;
    /** Channels whose promise rejects (offline, a busy file). */
    failing: Set<string>;
    /** Channels whose invoke throws before it returns a promise. */
    throwing: Set<string>;
    /** Channels whose answers wait for `release`. */
    holding: Set<string>;
    /** Sends a main-process event: calls every listener subscribed to the channel now. */
    listeners: Record<string, () => void>;
    invoke: ReturnType<typeof vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>>;
    /** Lets held answers go, all of one channel or only its oldest or newest, then settles. */
    release(channel: string, which?: 'all' | 'oldest' | 'newest'): Promise<void>;
    /** The arguments of every request on a channel, in order. */
    requests(channel: string): unknown[][];
    /** Every channel asked, in order. */
    order(): string[];
}

/** Lets pending promises and the renders they cause run. */
export const settle = () => act(async () => {
    for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0));
});

export const calendarEvent = (id: string, start: Date, hours = 1): SerializedAppEvent => ({
    id, title: id, start: start.toISOString(), end: new Date(start.getTime() + hours * 3_600_000).toISOString(), allDay: false, color: 'blue',
});

const day = new Date().toISOString().slice(0, 10);
export const someWeather: WeatherData = {
    current: { temperature: 20, weatherCode: 0, windSpeed: 5 },
    daily: { time: [day], sunrise: [`${day}T07:00`], sunset: [`${day}T19:00`], weather_code: [0], temperature_2m_max: [20], temperature_2m_min: [10] },
    hourly: { time: [`${day}T12:00`], temperature_2m: [15], precipitation_probability: [0], weather_code: [0] },
};

/** Installs the fake as `window.ipcRenderer`; remove it with `delete window.ipcRenderer`. */
export function installCalendarIpc(): CalendarIpc {
    const held: Held[] = [];
    const subscribed = new Map<string, Set<() => void>>();
    const ipc: CalendarIpc = {
        settings: { calendarIds: [], taskListIds: [], weekStartDay: 'today' },
        events: [],
        tasks: [],
        weather: null,
        failing: new Set(),
        throwing: new Set(),
        holding: new Set(),
        listeners: {},
        invoke: vi.fn((channel: string, ...args: unknown[]): Promise<unknown> => {
            if (ipc.throwing.has(channel)) throw new Error(`${channel} is not allowed`);
            const answer = answerFor(channel, args);
            if (!ipc.holding.has(channel)) return answer;
            answer.catch(() => undefined); // a held failure is handed over on release, not reported early
            return new Promise((resolve, reject) => held.push({ channel, release: () => { answer.then(resolve, reject); } }));
        }),
        async release(channel, which = 'all') {
            const mine = held.filter(h => h.channel === channel);
            const chosen = which === 'all' ? mine : which === 'oldest' ? mine.slice(0, 1) : mine.slice(-1);
            for (const h of chosen) { held.splice(held.indexOf(h), 1); h.release(); }
            await settle();
        },
        requests: channel => ipc.invoke.mock.calls.filter(([c]) => c === channel).map(([, ...args]) => args),
        order: () => ipc.invoke.mock.calls.map(([c]) => c),
    };

    async function answerFor(channel: string, args: unknown[]): Promise<unknown> {
        if (ipc.failing.has(channel)) throw new Error(`${channel} failed`);
        switch (channel) {
            case 'auth:check': return true;
            case 'settings:get': return { ...ipc.settings };
            case 'settings:save': ipc.settings = { ...(args[0] as UserConfig) }; return { ok: true };
            case 'data:events': {
                const [min, max] = args as [string, string];
                return ipc.events.filter(e => e.start >= min && e.start < max);
            }
            case 'data:tasks': return [...ipc.tasks];
            case 'weather:get': return ipc.weather;
            case 'data:calendars': case 'data:tasklists': return [];
            case 'app:info': return { version: 'test' };
            default: return null;
        }
    }

    window.ipcRenderer = {
        invoke: ipc.invoke,
        on: (channel, listener) => {
            // Several listeners per channel, as Electron's (CalendarApp and the Dashboard both hear auth:success).
            const set = subscribed.get(channel) ?? new Set<() => void>();
            subscribed.set(channel, set.add(listener as () => void));
            ipc.listeners[channel] = () => { [...set].forEach(l => l()); };
            return () => { set.delete(listener as () => void); };
        },
    };
    return ipc;
}
