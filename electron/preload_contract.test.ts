// ============================================================
// Preload ↔ main IPC contract (structural guard)
// ------------------------------------------------------------
// `electron/preload.ts` is the entire security boundary between the sandboxed
// renderer and the main process — and it had 0% test coverage.
//
// The failure mode this prevents is drift, not a logic bug: add an
// `ipcMain.handle` and forget the whitelist, and the feature throws at runtime
// with "Unauthorized channel"; remove a handler and leave the whitelist, and a
// channel stays open to a handler that no longer exists. Neither shows up in a
// unit test of either file alone, so this reads BOTH files and compares them —
// same approach as timer-registry.test.ts.
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the REAL whitelist values rather than regex-parsing the source. A
// reformat, a switch to double quotes, or a channel assembled from a constant
// would all silently defeat a parser — and a guard that quietly stops guarding
// is worse than no guard at all. main.ts is still read as text: importing it
// would drag the entire Electron bootstrap in for the sake of one regex.
vi.mock('electron', () => ({
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

const { ALLOWED_INVOKE_CHANNELS, ALLOWED_ON_CHANNELS } = await import('./preload');

const here = dirname(fileURLToPath(import.meta.url));
const preloadSource = readFileSync(join(here, 'preload.ts'), 'utf-8');
const mainSource = readFileSync(join(here, 'main.ts'), 'utf-8');

const allowedInvoke: string[] = [...ALLOWED_INVOKE_CHANNELS];
const allowedOn: string[] = [...ALLOWED_ON_CHANNELS];

/** Channels main.ts actually registers a handler for. */
const registeredHandlers = [...mainSource.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map(m => m[1]);

/** Channels main.ts actually pushes to the renderer. */
const sentChannels = [...mainSource.matchAll(/webContents\.send\(\s*'([^']+)'/g)].map(m => m[1]);

describe('IPC channel contract', () => {
    it('whitelists every channel main.ts handles', () => {
        const unreachable = registeredHandlers.filter(c => !allowedInvoke.includes(c));
        expect(
            unreachable,
            `main.ts handles these but preload blocks them — calling one throws "Unauthorized channel": ${unreachable.join(', ')}`
        ).toEqual([]);
    });

    it('has no whitelisted invoke channel without a handler', () => {
        const orphaned = allowedInvoke.filter(c => !registeredHandlers.includes(c));
        expect(
            orphaned,
            `preload allows these but main.ts has no handler — invoking one hangs forever: ${orphaned.join(', ')}`
        ).toEqual([]);
    });

    it('whitelists every channel main.ts pushes to the renderer', () => {
        const undeliverable = sentChannels.filter(c => !allowedOn.includes(c));
        expect(
            undeliverable,
            `main.ts sends these but preload will not let the renderer listen: ${undeliverable.join(', ')}`
        ).toEqual([]);
    });

    it('contains no duplicate entries in either whitelist', () => {
        expect(new Set(allowedInvoke).size).toBe(allowedInvoke.length);
        expect(new Set(allowedOn).size).toBe(allowedOn.length);
    });

    describe('the boundary itself', () => {
        it('throws — never silently no-ops — on a non-whitelisted channel', () => {
            // A silent no-op would make an unauthorised call look like a hung
            // promise; throwing surfaces it immediately. Assert both guards do.
            expect(preloadSource).toMatch(/ALLOWED_ON_CHANNELS\.includes\(channel\)[\s\S]*?throw new Error/);
            expect(preloadSource).toMatch(/ALLOWED_INVOKE_CHANNELS\.includes\(channel\)[\s\S]*?throw new Error/);
        });

        it('keeps the audit trail append-only — no clear/delete channel is exposed', () => {
            // The durable trail exists to survive the in-app CLEAR button. A
            // renderer-reachable delete channel would defeat the entire point.
            const destructive = allowedInvoke.filter(c =>
                /^audit:/.test(c) && !['audit:append', 'audit:read'].includes(c)
            );
            expect(
                destructive,
                `audit trail must stay append-only; found: ${destructive.join(', ')}`
            ).toEqual([]);
        });
    });

    describe('single-instance enforcement', () => {
        // The lock itself lives in single-instance.ts (main.ts would otherwise
        // be over the 300-line limit); main.ts must still be the thing that
        // claims it, and claim it first.
        const singleInstanceSource = readFileSync(join(here, 'single-instance.ts'), 'utf-8');

        it('acquires the lock before creating any window', () => {
            // Two instances share one userData dir, therefore one localStorage
            // blob, and their debounced whole-state writes clobber each other.
            expect(singleInstanceSource).toContain('requestSingleInstanceLock');

            const lockIndex = mainSource.indexOf('acquireSingleInstanceLock({');
            const bootstrapIndex = mainSource.indexOf('app.whenReady()');
            expect(lockIndex, 'main.ts must call acquireSingleInstanceLock').toBeGreaterThan(-1);
            expect(
                lockIndex,
                'the lock must be requested before the app bootstraps'
            ).toBeLessThan(bootstrapIndex);
        });

        it('handles a second launch by focusing the existing window', () => {
            expect(singleInstanceSource).toMatch(/app\.on\('second-instance'/);
        });

        it('does not surface the window for a headless (E2E) second instance', () => {
            // Playwright launches the app once per test; without this branch a
            // suite run restores + shows + focuses the developer's window 44
            // times. Behaviourally covered in main_single_instance.test.ts —
            // this is the structural half, so the branch cannot simply vanish.
            expect(
                singleInstanceSource,
                'focusExistingWindow must early-return on a headless second instance'
            ).toMatch(/if\s*\(from\?\.headless\)/);
        });
    });
});
