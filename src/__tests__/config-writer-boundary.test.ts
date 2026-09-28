// ============================================================
// config.json — structural boundary pin (gauge-writer-boundary style).
//
// The rule: `store.update` in electron/store.ts is the only writer of
// config.json. It re-reads the file at write time and never writes over one it
// cannot read; the defaults `store.get()` hands a reader must never be written
// back.
//
// Why a structural pin: the file holds the calendar selection, task lists,
// power/theme settings and the phone pairing. `store.set(config)` let any
// caller write whatever it had — and every caller had built its config from a
// read that turned a locked or corrupt file into the defaults. The remote
// bridge did that at every startup and wiped the file. The behavioural suites
// (electron/store.config-read, remote-bridge.config-read, api.save-settings)
// cover today's callers; a NEW writer — a second `set`, a helper that writes
// the path itself — is by definition not covered by them.
//
// What each case scans:
//   - the store's public surface is exactly get / read / update;
//   - no other production file names config.json as a path (a quoted
//     'config.json' or '<dir>/config.json'; comments and prose such as an error
//     message saying "config.json could not be read" do not count, and
//     'tsconfig.json' never matches);
//   - electron/store.ts itself has one writeFileSync call site.
//
// verifiedRedBy (proven 2026-09-28 against the committed fix, then reverted):
//   - re-add a `set()` to the store object → the surface case and the
//     one-write-site case go red;
//   - a helper in electron/api.ts that writeFileSyncs
//     `path.join(…, 'config.json')` → the path case goes red naming api.ts;
//   - a second writeFileSync (a `reset()`) in electron/store.ts → the surface
//     and write-site cases go red.
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';
import { store } from '../../electron/store';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

const STORE = 'electron/store.ts';
const SOURCES = productionSources(['src', 'electron']).map(f => ({ rel: toRepoPath(f), src: readSource(f) }));

const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
/** A string literal that IS the file name, or a path ending in it: 'config.json', `${dir}/config.json`. */
const CONFIG_PATH_LITERAL = /(['"`])(?:[^'"`\n]*[/\\])?config\.json\1/;

describe('config.json has exactly one writer', () => {
    it('exposes get, read and update — no raw set that writes whatever it is given', () => {
        expect(Object.keys(store).sort()).toEqual(['get', 'read', 'update']);
    });

    it('is named as a path only in electron/store.ts', () => {
        expect(SOURCES.length, 'the file walk found nothing — the guard would pass vacuously').toBeGreaterThan(50);
        expect(
            SOURCES.find(f => f.rel === STORE)?.src.split('\n').some(line => !isComment(line) && CONFIG_PATH_LITERAL.test(line)),
            'electron/store.ts no longer names config.json — the pattern below would pass vacuously',
        ).toBe(true);

        const offenders: string[] = [];
        for (const { rel, src } of SOURCES) {
            if (rel === STORE) continue;
            src.split('\n').forEach((line, i) => {
                if (!isComment(line) && CONFIG_PATH_LITERAL.test(line)) offenders.push(`${rel}:${i + 1} — ${line.trim()}`);
            });
        }
        expect(
            offenders,
            'These name config.json as a path outside the store. Go through store.update, which re-reads ' +
            'the file and refuses to write over one it cannot read:\n  ' + offenders.join('\n  '),
        ).toEqual([]);
    });

    it('writes from exactly one call site inside electron/store.ts', () => {
        const src = SOURCES.find(f => f.rel === STORE)?.src ?? '';
        const sites = src.split('\n')
            .map((line, i) => ({ line, n: i + 1 }))
            .filter(({ line }) => !isComment(line) && /\bwriteFileSync\s*\(/.test(line));
        expect(
            sites.map(s => `${STORE}:${s.n} — ${s.line.trim()}`),
            'store.update must be the only path to disk; a second write site is a second writer',
        ).toHaveLength(1);
    });
});
