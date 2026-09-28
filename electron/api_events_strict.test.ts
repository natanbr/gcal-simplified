// ============================================================
// data:events — the forgiving answer and the strict one
// ------------------------------------------------------------
// The calendar view wants SOMETHING on screen, so getEvents swallows each
// failure: a calendar that errors becomes [], a holiday feed that is down
// becomes no holidays, a signed-out user gets []. The school-bag reader cannot
// live with that: offline (the token file still exists, so auth:check says
// yes) the answer was holidays-only and non-empty, and it overwrote the stored
// Pro-D days. In STRICT mode every one of those failures throws instead, so the
// renderer keeps what it has. The default stays exactly as it was.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    isAuthenticated: vi.fn(() => true),
    eventsList: vi.fn(),
    calendarListList: vi.fn(),
    calendarIds: ['family', 'school'],
}));

vi.mock('googleapis', () => ({
    google: {
        calendar: () => ({ calendarList: { list: mocks.calendarListList }, events: { list: mocks.eventsList } }),
    },
}));
vi.mock('./auth', () => ({ authService: { isAuthenticated: mocks.isAuthenticated, getAuthClient: () => ({}) } }));
vi.mock('./store', () => ({ store: { get: () => ({ calendarIds: mocks.calendarIds, taskListIds: [] }) } }));

import { ApiService } from './api';

const FROM = new Date(2026, 8, 27);
const TO = new Date(2026, 9, 13);

const PRO_D = { id: 'abc123', summary: 'Pro-D Day', start: { date: '2026-10-09' }, end: { date: '2026-10-10' } };
const THANKSGIVING = { date: '2026-10-12', localName: 'Thanksgiving', name: 'Thanksgiving Day', global: true, counties: null };

const holidaysOk = () => ({ ok: true, json: async () => [THANKSGIVING] });
const holidaysDown = () => ({ ok: false, json: async () => { throw new Error('no body'); } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    mocks.isAuthenticated.mockReturnValue(true);
    mocks.calendarListList.mockResolvedValue({ data: { items: [] } });
    mocks.eventsList.mockImplementation(async ({ calendarId }: { calendarId: string }) =>
        ({ data: { items: calendarId === 'school' ? [PRO_D] : [] } }));
    fetchMock = vi.fn(async () => holidaysOk());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const titles = (events: Array<{ title: string }>) => events.map(e => e.title).sort();

describe('getEvents — the default (calendar view) answer is unchanged', () => {
    it('answers with every calendar\'s events plus the statutory holidays', async () => {
        expect(titles(await new ApiService().getEvents(FROM, TO))).toEqual(['Pro-D Day', 'Thanksgiving']);
    });

    it('skips a calendar that fails and still answers', async () => {
        mocks.eventsList.mockImplementation(async ({ calendarId }: { calendarId: string }) => {
            if (calendarId === 'school') throw new Error('500');
            return { data: { items: [] } };
        });
        expect(titles(await new ApiService().getEvents(FROM, TO))).toEqual(['Thanksgiving']);
    });

    it('answers without holidays when the holiday feed is down, and does not cache that', async () => {
        fetchMock.mockImplementationOnce(async () => holidaysDown());
        const api = new ApiService();
        expect(titles(await api.getEvents(FROM, TO))).toEqual(['Pro-D Day']);
        expect(titles(await api.getEvents(FROM, TO))).toEqual(['Pro-D Day', 'Thanksgiving']);
    });

    it('shows the first page of a paginated calendar answer, as before', async () => {
        mocks.eventsList.mockImplementation(async ({ calendarId }: { calendarId: string }) =>
            ({ data: { items: calendarId === 'school' ? [PRO_D] : [], nextPageToken: calendarId === 'school' ? 'page-2' : undefined } }));
        expect(titles(await new ApiService().getEvents(FROM, TO))).toEqual(['Pro-D Day', 'Thanksgiving']);
    });

    it('answers [] when signed out', async () => {
        mocks.isAuthenticated.mockReturnValue(false);
        expect(await new ApiService().getEvents(FROM, TO)).toEqual([]);
    });

    it('treats { strict: false } exactly like no option', async () => {
        mocks.eventsList.mockRejectedValue(new Error('offline'));
        fetchMock.mockImplementation(async () => { throw new Error('offline'); });
        expect(await new ApiService().getEvents(FROM, TO, { strict: false })).toEqual([]);
    });
});

describe('getEvents — strict (school-bag reader): a failure is a failure', () => {
    const strict = { strict: true } as const;

    it('answers with every calendar\'s events plus the statutory holidays when all is well', async () => {
        expect(titles(await new ApiService().getEvents(FROM, TO, strict))).toEqual(['Pro-D Day', 'Thanksgiving']);
    });

    it('throws when signed out', async () => {
        mocks.isAuthenticated.mockReturnValue(false);
        await expect(new ApiService().getEvents(FROM, TO, strict)).rejects.toThrow();
    });

    it('throws when any one calendar fails (its Pro-D days would silently vanish)', async () => {
        mocks.eventsList.mockImplementation(async ({ calendarId }: { calendarId: string }) => {
            if (calendarId === 'school') throw new Error('invalid_grant');
            return { data: { items: [] } };
        });
        await expect(new ApiService().getEvents(FROM, TO, strict)).rejects.toThrow();
    });

    it('throws when the holiday feed answers not-ok', async () => {
        fetchMock.mockImplementation(async () => holidaysDown());
        await expect(new ApiService().getEvents(FROM, TO, strict)).rejects.toThrow();
    });

    it('throws when the holiday feed cannot be reached (offline)', async () => {
        fetchMock.mockImplementation(async () => { throw new TypeError('fetch failed'); });
        await expect(new ApiService().getEvents(FROM, TO, strict)).rejects.toThrow();
    });

    it('never caches a failed holiday fetch: the next strict call asks again and succeeds', async () => {
        fetchMock.mockImplementationOnce(async () => { throw new TypeError('fetch failed'); });
        const api = new ApiService();
        await expect(api.getEvents(FROM, TO, strict)).rejects.toThrow();
        expect(titles(await api.getEvents(FROM, TO, strict))).toEqual(['Pro-D Day', 'Thanksgiving']);
    });

    it('follows the pages: Google may answer an EMPTY page with a token, and the Pro-D day is on page 2', async () => {
        // "Incomplete pages can be detected by a non-empty nextPageToken" — a
        // page can hold fewer than maxResults, even zero, and still not be the end.
        mocks.eventsList.mockImplementation(async ({ calendarId, pageToken }: { calendarId: string; pageToken?: string }) => {
            if (calendarId !== 'school') return { data: { items: [] } };
            return pageToken === 'page-2' ? { data: { items: [PRO_D] } } : { data: { items: [], nextPageToken: 'page-2' } };
        });
        expect(titles(await new ApiService().getEvents(FROM, TO, strict))).toEqual(['Pro-D Day', 'Thanksgiving']);
        expect(mocks.eventsList.mock.calls.filter(([p]) => p.calendarId === 'school').map(([p]) => p.pageToken))
            .toEqual([undefined, 'page-2']);
    });

    it('throws when a calendar keeps paginating past the page cap, instead of looping', async () => {
        let n = 0;
        mocks.eventsList.mockImplementation(async ({ calendarId }: { calendarId: string }) =>
            (calendarId === 'school' ? { data: { items: [], nextPageToken: `page-${++n}` } } : { data: { items: [] } }));
        await expect(new ApiService().getEvents(FROM, TO, strict)).rejects.toThrow(/page/);
        expect(n).toBe(10);
    });

    it('still answers when only the calendar COLOURS fail (cosmetic, not school days)', async () => {
        mocks.calendarListList.mockRejectedValue(new Error('500'));
        expect(titles(await new ApiService().getEvents(FROM, TO, strict))).toEqual(['Pro-D Day', 'Thanksgiving']);
    });
});
