// ============================================================
// Calendar — when the Dashboard may show the full-screen spinner
// ------------------------------------------------------------
// "Syncing with Google..." replaces the whole Dashboard, so it is allowed only
// before the first week has been shown (requirements → Enhanced Loading
// Indicator: "should not block the entire UI, unless it's the initial load").
// It used to come back twice: at launch, because the first events request was
// made for a Sunday week before the saved week start had been read, and on the
// first Next Week into a month not yet loaded, because a cache miss emptied the
// week. Bug S1 (release-qa-plan) had the same cause: settings were read last,
// after tasks and weather, so a weather failure left them unread.
// The clock is fixed on Wednesday 2026-10-28, so a Monday week is Oct 26 - Nov 1
// and Next Week crosses into November, a month nobody has fetched yet.
// ============================================================

import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { startOfWeek } from 'date-fns';
import { Dashboard } from '../Dashboard';
import type { SerializedAppEvent, UserConfig } from '../../types';

const at = (day: number, month: number, hour: number) => new Date(2026, month, day, hour).toISOString();
const event = (id: string, start: string, end: string): SerializedAppEvent => ({ id, title: id, start, end, allDay: false, color: 'blue' });

const STANDUP = event('standup', at(28, 9, 10), at(28, 9, 11));  // Wed Oct 28, this week
const DENTIST = event('dentist', at(2, 10, 10), at(2, 10, 11));  // Mon Nov 2, next week
const SWIM = event('swim', at(4, 10, 16), at(4, 10, 17));        // Wed Nov 4, added later
const MONDAY_GRID_OF_OCTOBER = startOfWeek(new Date(2026, 9, 1), { weekStartsOn: 1 }).toISOString();
const MONDAY_GRID_OF_NOVEMBER = startOfWeek(new Date(2026, 10, 1), { weekStartsOn: 1 }).toISOString();

let settings: UserConfig;
let source: SerializedAppEvent[];
let failing: Set<string>;
let holdEvents: boolean;
let held: Array<() => void>;
let listeners: Record<string, () => void>;
const invoke = vi.fn(async (channel: string, ...args: unknown[]): Promise<unknown> => {
    if (failing.has(channel)) throw new Error(`${channel} failed`);
    switch (channel) {
        case 'settings:get': return { ...settings };
        case 'settings:save': settings = { ...(args[0] as UserConfig) }; return { ok: true };
        case 'data:events': {
            const [min, max] = args as [string, string];
            const answer = source.filter(e => e.start >= min && e.start < max);
            return holdEvents ? new Promise(resolve => held.push(() => resolve(answer))) : answer;
        }
        case 'data:tasks': case 'data:calendars': case 'data:tasklists': return [];
        case 'app:info': return { version: 'test' };
        default: return null;
    }
});

const eventRequests = () => invoke.mock.calls.filter(([channel]) => channel === 'data:events').map(([, min]) => min);
const channelOrder = () => invoke.mock.calls.map(([channel]) => channel);
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0)); });
const releaseEvents = async () => { holdEvents = false; held.splice(0).forEach(release => release()); await settle(); };
const firstDayShown = () => screen.getAllByTestId('day-header-name')[0].textContent;

/** Every screen the Dashboard showed, in order, with repeats collapsed. */
function recordScreens(): string[] {
    const seen: string[] = [];
    const note = () => {
        const now = screen.queryByText('Syncing with Google...') ? 'spinner'
            : screen.queryByTestId('calendar-grid') ? 'week' : 'other';
        if (seen[seen.length - 1] !== now) seen.push(now);
    };
    const observer = new MutationObserver(note);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    onTestFinished(() => observer.disconnect());
    return seen;
}

async function launch(): Promise<string[]> {
    const seen = recordScreens();
    render(<Dashboard />);
    await screen.findByTestId('calendar-grid');
    await settle();
    return seen;
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0));
    settings = { calendarIds: [], taskListIds: [], weekStartDay: 'monday' };
    source = [STANDUP, DENTIST];
    failing = new Set();
    holdEvents = false;
    held = [];
    listeners = {};
    invoke.mockClear();
    window.ipcRenderer = { invoke, on: (channel, listener) => { listeners[channel] = listener; return () => undefined; } };
});

afterEach(() => {
    delete window.ipcRenderer;
    vi.useRealTimers();
});

describe('Dashboard launch', () => {
    it('reads the saved week start first, asks for that week once, and never brings the spinner back', async () => {
        const seen = await launch();

        expect(channelOrder().indexOf('settings:get')).toBeLessThan(channelOrder().indexOf('data:events'));
        expect(eventRequests()).toEqual([MONDAY_GRID_OF_OCTOBER]);
        expect(firstDayShown()).toBe('Monday');
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(seen).toEqual(['spinner', 'week']);
    });

    it('with an empty calendar shows the grid with its day headers, and Next Week keeps it', async () => {
        source = [];
        const seen = await launch();

        expect(screen.getAllByTestId('day-header-name')).toHaveLength(7);
        expect(screen.queryByText(/Failed to load/)).toBeNull();
        fireEvent.click(screen.getByTestId('next-week-button'));
        await settle();

        expect(eventRequests()).toEqual([MONDAY_GRID_OF_OCTOBER, MONDAY_GRID_OF_NOVEMBER]);
        expect(seen).toEqual(['spinner', 'week']);
    });

    it('offline: the week shows with the saved week start, without a calendar error', async () => {
        source = [];  // main answers an empty list when Google cannot be reached
        failing = new Set(['data:tasks', 'weather:get']);
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => quiet.mockRestore());
        const seen = await launch();

        expect(firstDayShown()).toBe('Monday');
        expect(screen.queryByText(/Failed to load/)).toBeNull();
        expect(seen).toEqual(['spinner', 'week']);
    });

    // S1 in docs/release-qa-plan.md.
    it('a weather failure still loads the saved settings and shows no calendar error', async () => {
        failing = new Set(['weather:get']);
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => quiet.mockRestore());
        await launch();

        expect(firstDayShown()).toBe('Monday');
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(screen.queryByText(/Failed to load/)).toBeNull();
    });
});

describe('Dashboard week navigation', () => {
    it('Next Week into a month not loaded yet keeps the Dashboard, with the small indicator', async () => {
        const seen = await launch();
        source = [STANDUP, DENTIST, SWIM];
        holdEvents = true;

        fireEvent.click(screen.getByTestId('next-week-button'));
        await settle();

        expect(screen.queryByText('Syncing with Google...')).toBeNull();
        expect(screen.getByTestId('event-card-dentist')).toBeTruthy();  // already known: it stays on screen
        expect(screen.getByText('Fetching Events...')).toBeTruthy();
        expect(screen.queryByTestId('event-card-swim')).toBeNull();
        expect(eventRequests().at(-1)).toBe(MONDAY_GRID_OF_NOVEMBER);

        await releaseEvents();
        expect(screen.getByTestId('event-card-swim')).toBeTruthy();
        expect(screen.queryByTitle('Loading...')).toBeNull();
        expect(seen).toEqual(['spinner', 'week']);
    });

    it('Previous Week back into a loaded month shows it from the cache straight away', async () => {
        const seen = await launch();
        fireEvent.click(screen.getByTestId('next-week-button'));
        await settle();
        holdEvents = true;

        fireEvent.click(screen.getByTestId('prev-week-button'));
        await settle();

        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(screen.getByText('Refreshing...')).toBeTruthy();
        await releaseEvents();
        expect(seen).toEqual(['spinner', 'week']);
    });
});

describe('Dashboard reloads', () => {
    it('a week start changed in Settings moves the grid without the full-screen spinner', async () => {
        settings = { ...settings, weekStartDay: 'sunday' };
        const seen = await launch();
        expect(firstDayShown()).toBe('Sunday');

        fireEvent.click(screen.getByTestId('settings-button'));
        fireEvent.click(await screen.findByText('General', { exact: true }));
        fireEvent.click(await screen.findByTestId('week-start-monday-button'));
        fireEvent.click(screen.getByTestId('save-settings-button'));
        await settle();

        expect(firstDayShown()).toBe('Monday');
        expect(eventRequests()).toContain(MONDAY_GRID_OF_OCTOBER);
        expect(within(screen.getByTestId('calendar-grid')).getByTestId('event-card-standup')).toBeTruthy();
        expect(seen).toEqual(['spinner', 'week']);
    });

    it('a reconnect reads the settings again and refetches the visible week even when nothing changed', async () => {
        await launch();
        const before = eventRequests().length;

        await act(async () => { listeners['auth:success'](); });
        await settle();

        expect(eventRequests().length).toBe(before + 1);
        expect(channelOrder().filter(channel => channel === 'settings:get').length).toBeGreaterThanOrEqual(2);
    });
});
