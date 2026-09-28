// ============================================================
// Contract across the IPC boundary: what electron/api.ts builds is what the
// Mission Control school-day classifier understands.
// ------------------------------------------------------------
// The classifier recognises a statutory holiday by the `holiday-` id prefix
// api.ts gives it, and covers a Google all-day event up to (not including) its
// exclusive end midnight. Both are facts about api.ts, not about the
// classifier, so the classifier's own tests (which build events by hand)
// cannot notice if api.ts changes either shape. This file runs the REAL
// ApiService (network stubbed) and feeds its answer, through a structured
// clone as IPC would, to the REAL classifier. src/__tests__ is the one place
// allowed to import both sides.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ eventsList: vi.fn() }));

vi.mock('googleapis', () => ({
    google: {
        calendar: () => ({
            calendarList: { list: async () => ({ data: { items: [] } }) },
            events: { list: mocks.eventsList },
        }),
    },
}));
vi.mock('../../electron/auth', () => ({ authService: { isAuthenticated: () => true, getAuthClient: () => ({}) } }));
vi.mock('../../electron/store', () => ({ store: { get: () => ({ calendarIds: ['school'], taskListIds: [] }) } }));

import { ApiService } from '../../electron/api';
import { classifySchoolCalendar } from '../mission-control/store/schoolDays';

const THANKSGIVING = { date: '2026-10-12', localName: 'Thanksgiving', name: 'Thanksgiving Day', global: true, counties: null };
// Google's all-day shape: `date` only, end EXCLUSIVE — a Thursday–Friday Pro-D ends Saturday.
const PRO_D_THU_FRI = { id: 'abc123', summary: 'Pro-D Days', start: { date: '2026-10-08' }, end: { date: '2026-10-10' } };

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [THANKSGIVING] })));
    mocks.eventsList.mockResolvedValue({ data: { items: [PRO_D_THU_FRI] } });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Electron's IPC serialises with the structured-clone algorithm; Dates survive as Dates. */
const overIpc = <T>(value: T): T => structuredClone(value);

describe('api.ts → IPC → classifySchoolCalendar', () => {
    it('a statutory holiday from ApiService.getPublicHolidays is a no-school day, named, and only that day', async () => {
        const holidays = overIpc(await new ApiService().getPublicHolidays(2026));
        const cal = classifySchoolCalendar(holidays, '2026-10-05', '2026-10-18');
        expect(cal.noSchool).toEqual([{ date: '2026-10-12', reason: 'Thanksgiving' }]);
    });

    it('a Google all-day event through getEvents covers exactly its days (the end date is exclusive)', async () => {
        const events = overIpc(await new ApiService().getEvents(new Date(2026, 9, 5), new Date(2026, 9, 19), { strict: true }));
        const cal = classifySchoolCalendar(events, '2026-10-05', '2026-10-18');
        expect(cal.noSchool).toEqual([
            { date: '2026-10-08', reason: 'Pro-D day' },
            { date: '2026-10-09', reason: 'Pro-D day' },
            { date: '2026-10-12', reason: 'Thanksgiving' },
        ]);
    });
});
