// ============================================================
// A failed Google read is logged without the error object (2026-10-04)
// ------------------------------------------------------------
// The forgiving reads in api.ts log what failed and answer a shorter list. A
// failed token refresh reaches them as a GaxiosError, and gaxios 7 leaves the
// refresh request's body, refresh_token included, in that error's config; the
// whole object went to the main process's stdout. A log line names what failed
// and the error's status or code, never the object.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inspect } from 'node:util';

const SEEDED = 'SEEDED-REFRESH-TOKEN-0123';

const mocks = vi.hoisted(() => ({
    calendarIds: ['family'],
    taskListIds: [] as string[],
    refused: () => Object.assign(new Error('invalid_grant'), {
        status: 400,
        config: { url: 'https://oauth2.googleapis.com/token', data: 'refresh_token=SEEDED-REFRESH-TOKEN-0123&grant_type=refresh_token' },
        response: { status: 400, data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } },
    }),
}));

vi.mock('googleapis', () => ({
    google: {
        calendar: () => ({
            calendarList: { list: vi.fn(async () => { throw mocks.refused(); }) },
            events: { list: vi.fn(async () => { throw mocks.refused(); }) },
        }),
        tasks: () => ({
            tasklists: { list: vi.fn(async () => { throw mocks.refused(); }) },
            tasks: { list: vi.fn(async () => { throw mocks.refused(); }) },
        }),
    },
}));
vi.mock('./auth', () => ({ authService: { isAuthenticated: () => true, getAuthClient: () => ({}) } }));
vi.mock('./store', () => ({ store: { get: () => ({ calendarIds: mocks.calendarIds, taskListIds: mocks.taskListIds }) } }));

import { ApiService } from './api';

let logged: () => string;

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    const spies = (['error', 'warn', 'log', 'info'] as const).map(level => vi.spyOn(console, level).mockImplementation(() => undefined));
    logged = () => spies.flatMap(spy => spy.mock.calls.flat())
        .map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: 10 }))).join('\n');
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('api.ts logs a failed Google read without the error object', () => {
    it('events and calendar colours', async () => {
        expect(await new ApiService().getEvents(new Date(2026, 9, 1), new Date(2026, 9, 8))).toEqual([]);

        expect(logged()).toContain('400'); // what failed is still logged
        expect(logged()).not.toContain(SEEDED);
    });

    it('tasks, from the default list and from chosen lists', async () => {
        mocks.taskListIds = [];
        expect(await new ApiService().getTasks()).toEqual([]);
        mocks.taskListIds = ['school'];
        expect(await new ApiService().getTasks()).toEqual([]);

        expect(logged()).toContain('400');
        expect(logged()).not.toContain(SEEDED);
    });
});
