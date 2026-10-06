// ============================================================
// data:events and data:tasks — Google unreachable is a failure, not "nothing" (2026-10-06)
// ------------------------------------------------------------
// The Calendar re-reads the visible month every 5 minutes with the forgiving
// read. Offline, or with Google answering 5xx or a rate limit, getEvents turned
// every calendar into [] and answered holidays only, as a success: the window
// cached that month and the events on screen disappeared until a later refresh
// worked. getTasks did the same to the task list. Now a read Google cannot
// answer fails (the window keeps what it shows; useCalendarData and
// useDashboardLoad already keep their data on a failure), and only a calendar
// or list Google refuses for good is skipped, as before.
//
// Google's errors are real gaxios errors (authTestKit's realGoogleError);
// google-unreachable.test.ts covers the classification itself.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    isAuthenticated: vi.fn(() => true),
    calendarListList: vi.fn(),
    eventsList: vi.fn(),
    tasklistsList: vi.fn(),
    tasksList: vi.fn(),
    taskListIds: ['chores'],
}));

vi.mock('googleapis', () => ({
    google: {
        calendar: () => ({ calendarList: { list: mocks.calendarListList }, events: { list: mocks.eventsList } }),
        tasks: () => ({ tasklists: { list: mocks.tasklistsList }, tasks: { list: mocks.tasksList } }),
    },
}));
vi.mock('./auth', () => ({ authService: { isAuthenticated: mocks.isAuthenticated, getAuthClient: () => ({}) } }));
vi.mock('./store', () => ({ store: { get: () => ({ calendarIds: ['family', 'school'], taskListIds: mocks.taskListIds }) } }));

import { ApiService } from './api';
import { REVOKED, realGoogleError } from './authTestKit';

// The first import of google-auth-library takes seconds: paid here, at collection, it counts
// against no test's timeout (authTestKit's header).
await import('google-auth-library');

const FROM = new Date(2026, 8, 27);
const TO = new Date(2026, 9, 13);

const SWIM = { id: 'swim', summary: 'Swim', start: { dateTime: '2026-10-07T16:00:00Z' }, end: { dateTime: '2026-10-07T17:00:00Z' } };
const PRO_D = { id: 'prod', summary: 'Pro-D Day', start: { date: '2026-10-09' }, end: { date: '2026-10-10' } };
const THANKSGIVING = { date: '2026-10-12', localName: 'Thanksgiving', name: 'Thanksgiving Day', global: true, counties: null };

const offline = () => realGoogleError(Object.assign(new Error('getaddrinfo ENOTFOUND www.googleapis.com'), { code: 'ENOTFOUND' }));
const google = (status: number, reason: string) =>
    realGoogleError({ status, body: { error: { code: status, message: reason, errors: [{ domain: 'global', reason, message: reason }] } } });

/** The family calendar answers SWIM, the school calendar PRO_D, unless a test makes one fail. */
function calendars(failing: Partial<Record<'family' | 'school', unknown>> = {}) {
    mocks.eventsList.mockImplementation(async ({ calendarId }: { calendarId: 'family' | 'school' }) => {
        if (calendarId in failing) throw failing[calendarId];
        return { data: { items: [calendarId === 'family' ? SWIM : PRO_D] } };
    });
}

let fetchMock: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;
const titles = (events: Array<{ title: string }>) => events.map(e => e.title).sort();

beforeEach(() => {
    mocks.isAuthenticated.mockReturnValue(true);
    mocks.taskListIds = ['chores'];
    mocks.calendarListList.mockResolvedValue({ data: { items: [] } });
    calendars();
    mocks.tasksList.mockResolvedValue({ data: { items: [{ id: 't1', title: 'Feed the cat', status: 'needsAction' }] } });
    mocks.tasklistsList.mockResolvedValue({ data: { items: [{ id: 'chores' }] } });
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => [THANKSGIVING] }));
    vi.stubGlobal('fetch', fetchMock);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('getEvents (the Calendar view): Google unreachable fails the read', () => {
    it('offline: it fails instead of answering the holidays alone', async () => {
        const error = await offline();
        calendars({ family: error, school: error });

        await expect(new ApiService().getEvents(FROM, TO)).rejects.toMatchObject({ code: 'ENOTFOUND' });
    });

    it('one calendar Google cannot answer (503) fails the whole read: its events would vanish until the next refresh', async () => {
        calendars({ school: await google(503, 'backendError') });

        await expect(new ApiService().getEvents(FROM, TO)).rejects.toMatchObject({ status: 503 });
    });

    it.each([[429, 'rateLimitExceeded'], [403, 'userRateLimitExceeded']])('a rate limit (%i %s) fails the read', async (status, reason) => {
        calendars({ family: await google(status, reason) });

        await expect(new ApiService().getEvents(FROM, TO)).rejects.toMatchObject({ status });
    });

    it('the next read, with Google back, answers in full', async () => {
        const api = new ApiService();
        calendars({ family: await offline() });
        await expect(api.getEvents(FROM, TO)).rejects.toThrow();

        calendars();
        expect(titles(await api.getEvents(FROM, TO))).toEqual(['Pro-D Day', 'Swim', 'Thanksgiving']);
    });

    it('the calendar colours alone failing does not fail the read (cosmetic)', async () => {
        mocks.calendarListList.mockRejectedValue(await offline());

        expect(titles(await new ApiService().getEvents(FROM, TO))).toEqual(['Pro-D Day', 'Swim', 'Thanksgiving']);
    });
});

describe('getEvents (the Calendar view): what it still forgives', () => {
    it.each([[404, 'notFound'], [403, 'forbidden'], [410, 'deleted']])(
        'a calendar Google refuses for good (%i %s) is skipped, with a warning, and the others show', async (status, reason) => {
            calendars({ school: await google(status, reason) });

            expect(titles(await new ApiService().getEvents(FROM, TO))).toEqual(['Swim', 'Thanksgiving']);
            expect(warn).toHaveBeenCalledWith(`Failed to fetch events for calendar school (status ${status} ${reason})`);
        });

    it('signed out: [] (the Sign in screen covers it)', async () => {
        mocks.isAuthenticated.mockReturnValue(false);

        expect(await new ApiService().getEvents(FROM, TO)).toEqual([]);
    });

    it('Google refusing the sign-in (invalid_grant): each calendar is skipped as before (the sign-out itself: auth_session.test.ts)', async () => {
        const refused = await realGoogleError({ status: 400, body: REVOKED });
        calendars({ family: refused, school: refused });

        expect(titles(await new ApiService().getEvents(FROM, TO))).toEqual(['Thanksgiving']);
    });

    it('holidays already read stay in every answer while the holiday service is down (the year is kept)', async () => {
        const api = new ApiService();
        expect(titles(await api.getEvents(FROM, TO))).toContain('Thanksgiving');

        fetchMock.mockImplementation(async () => { throw new TypeError('fetch failed'); });
        expect(titles(await api.getEvents(FROM, TO))).toEqual(['Pro-D Day', 'Swim', 'Thanksgiving']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('the holiday service down for a year not read yet: Google\'s events still answer, without its holidays', async () => {
        fetchMock.mockImplementation(async () => { throw new TypeError('fetch failed'); });

        expect(titles(await new ApiService().getEvents(FROM, TO))).toEqual(['Pro-D Day', 'Swim']);
    });
});

describe('getEvents strict (the School Bag): unchanged, every failure throws', () => {
    it.each([['offline', offline], ['a refused calendar (404)', () => google(404, 'notFound')]])('%s', async (_case, make) => {
        calendars({ school: await make() });

        await expect(new ApiService().getEvents(FROM, TO, { strict: true })).rejects.toThrow();
    });
});

describe('getTasks: Google unreachable fails the read', () => {
    it('offline: it fails instead of answering no tasks', async () => {
        mocks.tasksList.mockRejectedValue(await offline());

        await expect(new ApiService().getTasks()).rejects.toMatchObject({ code: 'ENOTFOUND' });
    });

    it('offline while finding the default list: it fails', async () => {
        mocks.taskListIds = [];
        mocks.tasklistsList.mockRejectedValue(await offline());

        await expect(new ApiService().getTasks()).rejects.toMatchObject({ code: 'ENOTFOUND' });
    });

    it.each([[404, 'notFound'], [403, 'forbidden']])('the default list refused for good (%i %s): no tasks, with the error logged, as before', async (status, reason) => {
        mocks.taskListIds = [];
        mocks.tasklistsList.mockRejectedValue(await google(status, reason));

        expect(await new ApiService().getTasks()).toEqual([]);
        expect(console.error).toHaveBeenCalledWith(`Failed to fetch default task list (status ${status} ${reason})`);
    });

    it('a list Google refuses for good (404) is skipped, as before', async () => {
        mocks.taskListIds = ['chores', 'gone'];
        const gone = await google(404, 'notFound');
        mocks.tasksList.mockImplementation(async ({ tasklist }: { tasklist: string }) => {
            if (tasklist === 'gone') throw gone;
            return { data: { items: [{ id: 't1', title: 'Feed the cat', status: 'needsAction' }] } };
        });

        expect((await new ApiService().getTasks()).map(t => t.title)).toEqual(['Feed the cat']);
    });

    it('signed out: []', async () => {
        mocks.isAuthenticated.mockReturnValue(false);

        expect(await new ApiService().getTasks()).toEqual([]);
    });
});
