// @vitest-environment node
// ============================================================
// Offline on the real chain: the read fails, the sign-in stays (2026-10-06)
// ------------------------------------------------------------
// The unit suites fake one layer each. This case runs the main process's own
// path end to end: real googleapis, the app's GoogleOAuthClient, real
// google-auth-library and gaxios with its own node-fetch (the node environment:
// with a `window`, gaxios would take the browser's fetch). The access token has
// expired, so the first read refreshes it, and the network is down: every
// connection goes through a proxy at a closed port on 127.0.0.1, so nothing
// leaves the machine and the refresh meets ECONNREFUSED.
// The read must fail (the window keeps what it shows) and must not sign out:
// offline is not Google refusing the sign-in.
// (Adapted from a PR 194 review probe.)
// ============================================================

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import net from 'node:net';

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('./auth', () => ({ authService: { isAuthenticated: () => true, getAuthClient: () => state.client } }));
vi.mock('./store', () => ({ store: { get: () => ({ calendarIds: ['family'], taskListIds: ['chores'] }) } }));

import { GoogleOAuthClient } from './auth-client';
import { ApiService } from './api';
import { isGoogleUnreachable } from './google-unreachable';

let closedPort = 0;

// gaxios skips its proxy for a host NO_PROXY or no_proxy lists: with googleapis.com in one of them, a
// refresh with these dummy credentials would reach Google. Neither is read while this file runs.
const BYPASS = ['NO_PROXY', 'no_proxy'] as const;
const savedBypass = new Map(BYPASS.map(name => [name, process.env[name]]));
afterAll(() => {
    for (const [name, value] of savedBypass) if (value !== undefined) process.env[name] = value;
});

beforeAll(async () => {
    for (const name of BYPASS) delete process.env[name];
    const probe = net.createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', () => resolve()));
    const address = probe.address();
    closedPort = typeof address === 'object' && address !== null ? address.port : 0;
    await new Promise<void>(resolve => probe.close(() => resolve()));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** A signed-in client whose access token expired an hour ago, its every request sent to the closed port. */
function offlineClient() {
    const signOuts = { count: 0 };
    const client = new GoogleOAuthClient('client-id', 'client-secret', () => { signOuts.count++; });
    client.setCredentials({ access_token: 'expired-access', refresh_token: 'kept-refresh', token_type: 'Bearer', expiry_date: Date.now() - 3_600_000 });
    client.transporter.defaults.proxy = `http://127.0.0.1:${closedPort}`;
    client.transporter.defaults.noProxy = []; // and no host exempt from it
    state.client = client;
    return { client, signOuts };
}

const outcome = (read: Promise<unknown>) => read.then(() => ({ rejected: false, error: null as unknown }), (error: unknown) => ({ rejected: true, error }));

describe('offline with an expired access token, on the real googleapis → GoogleOAuthClient → gaxios chain', () => {
    it('the events and tasks reads fail as unreachable; no sign-out, the refresh token kept', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }))); // the holiday feed: not gaxios
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { client, signOuts } = offlineClient();
        const api = new ApiService();

        const events = await outcome(api.getEvents(new Date(2026, 8, 27), new Date(2026, 9, 13)));
        const tasks = await outcome(api.getTasks());

        expect(events.rejected).toBe(true);
        // Refused by the closed local port: proof that nothing went to the network.
        expect(events.error).toMatchObject({ code: 'ECONNREFUSED', response: undefined, message: expect.stringContaining(`127.0.0.1:${closedPort}`) });
        expect(isGoogleUnreachable(events.error)).toBe(true);
        expect(tasks.rejected).toBe(true);
        expect(isGoogleUnreachable(tasks.error)).toBe(true);
        expect(signOuts.count).toBe(0);
        expect(client.credentials.refresh_token).toBe('kept-refresh');
    }, 20_000);
});
