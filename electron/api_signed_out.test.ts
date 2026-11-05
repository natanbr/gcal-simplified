// ============================================================
// Signed out, every Google reader answers [] without touching the client.
// ------------------------------------------------------------
// authService.isAuthenticated() returns a Promise since the move to the async
// safeStorage API (2026-11-03). A reader that drops the `await` tests a Promise,
// which is always truthy, so `!isAuthenticated()` is always false: the signed-out
// guard never fires and the reader asks Google with an empty client. Neither tsc
// nor the lint config catches that (no type-aware rules), so this suite does,
// for each reader in turn.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    isAuthenticated: vi.fn(async () => false),
    getAuthClient: vi.fn(async () => ({})),
    calendarListList: vi.fn(async () => ({ data: { items: [{ id: 'family', summary: 'Family' }] } })),
    eventsList: vi.fn(async () => ({ data: { items: [] } })),
    tasklistsList: vi.fn(async () => ({ data: { items: [{ id: 'chores', title: 'Chores' }] } })),
    tasksList: vi.fn(async () => ({ data: { items: [] } })),
}));

vi.mock('googleapis', () => ({
    google: {
        calendar: () => ({ calendarList: { list: mocks.calendarListList }, events: { list: mocks.eventsList } }),
        tasks: () => ({ tasklists: { list: mocks.tasklistsList }, tasks: { list: mocks.tasksList } }),
    },
}));
vi.mock('./auth', () => ({ authService: { isAuthenticated: mocks.isAuthenticated, getAuthClient: mocks.getAuthClient } }));
vi.mock('./store', () => ({ store: { get: () => ({ calendarIds: ['family'], taskListIds: ['chores'] }) } }));

import { ApiService } from './api';

const api = new ApiService();
const readers = [
    ['getCalendars', () => api.getCalendars()],
    ['getTaskLists', () => api.getTaskLists()],
    ['getEvents', () => api.getEvents(new Date(2026, 10, 1), new Date(2026, 10, 30))],
    ['getTasks', () => api.getTasks()],
] as const;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
});

describe('a Google reader while signed out', () => {
    it.each(readers)('%s answers [] and never asks for the client', async (_name, read) => {
        mocks.isAuthenticated.mockResolvedValue(false);

        await expect(read()).resolves.toEqual([]);

        expect(mocks.isAuthenticated).toHaveBeenCalled();
        expect(mocks.getAuthClient).not.toHaveBeenCalled();
    });

    it.each(readers)('%s does ask for the client when signed in (the guard is not trivially closed)', async (_name, read) => {
        mocks.isAuthenticated.mockResolvedValue(true);

        await read();

        expect(mocks.getAuthClient).toHaveBeenCalled();
    });
});
