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
// (electron/store.config-read, store.config-write, remote-bridge.*,
// api.save-settings) cover today's callers; a NEW writer — a second `set`, a
// helper that writes the path itself, an electron-store left on its default
// name — is by definition not covered by them.
//
// What each case scans (production files under src/ and electron/):
//   - the store's public surface is exactly get / read / update;
//   - no file but electron/store.ts mentions config.json at all, in any case,
//     on a non-comment line (prose included: the store hands out the path, so
//     nobody else needs the name; 'tsconfig.json' does not match);
//   - no electron-store / conf instance without a name, or named 'config':
//     their default file IS userData/config.json (security-learnings.md, the
//     2025 incident where a manual write destroyed the OAuth tokens);
//   - electron/store.ts touches the disk from a pinned set of call sites.
//
// verifiedRedBy: see the registry entry in rule-registry.test.ts.
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';
import { store } from '../../electron/store';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

const STORE = 'electron/store.ts';
const SOURCES = productionSources(['src', 'electron']).map(f => ({ rel: toRepoPath(f), src: readSource(f) }));

const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
const codeLines = (src: string) => src.split('\n').map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => !isComment(line));
const CONFIG_NAME = /(?<![\w-])config\.json/i;

/** Every way store.ts may touch the disk, and how often. Each site has a reason:
 *  writeFileSync — the temp file; renameSync — the temp over config.json, and a
 *  file that can never parse moved aside; rmSync — the temp after a failed rename. */
const STORE_DISK_CALLS: Record<string, number> = {
    writeFileSync: 1, renameSync: 2, rmSync: 1,
    appendFileSync: 0, copyFileSync: 0, unlinkSync: 0, createWriteStream: 0, promises: 0,
};

describe('config.json has exactly one writer', () => {
    it('exposes get, read and update — no raw set that writes whatever it is given', () => {
        expect(Object.keys(store).sort()).toEqual(['get', 'read', 'update']);
    });

    it('is mentioned only in electron/store.ts', () => {
        expect(SOURCES.length, 'the file walk found nothing — the guard would pass vacuously').toBeGreaterThan(50);
        expect(
            codeLines(SOURCES.find(f => f.rel === STORE)?.src ?? '').some(({ line }) => CONFIG_NAME.test(line)),
            'electron/store.ts no longer names config.json — the pattern would pass vacuously',
        ).toBe(true);

        const offenders = SOURCES.filter(f => f.rel !== STORE).flatMap(({ rel, src }) =>
            codeLines(src).filter(({ line }) => CONFIG_NAME.test(line)).map(({ line, n }) => `${rel}:${n} — ${line.trim()}`));
        expect(
            offenders,
            'These name config.json outside the store. Write through store.update (it re-reads the file and ' +
            'refuses to write over one it cannot read), and show the path the store returns in `file`:\n  ' + offenders.join('\n  '),
        ).toEqual([]);
    });

    it('has no electron-store or conf instance that would default to config.json', () => {
        const offenders: string[] = [];
        for (const { rel, src } of SOURCES) {
            for (const match of src.matchAll(/\bnew\s+(Store|Conf)\b/g)) {
                const call = src.slice(match.index, src.indexOf(')', match.index) + 1);
                const name = /\bname\s*:\s*(['"`])([^'"`]+)\1/.exec(call)?.[2];
                if (!name || name.toLowerCase() === 'config') {
                    offenders.push(`${rel}:${src.slice(0, match.index).split('\n').length} — ${call.replace(/\s+/g, ' ')}`);
                }
            }
        }
        expect(offenders, 'An unnamed (or "config") store writes userData/config.json behind store.ts:\n  ' + offenders.join('\n  ')).toEqual([]);
    });

    it('touches the disk from electron/store.ts only through its pinned call sites', () => {
        const lines = codeLines(SOURCES.find(f => f.rel === STORE)?.src ?? '');
        const counted = Object.fromEntries(Object.keys(STORE_DISK_CALLS).map(call => [
            call, lines.filter(({ line }) => new RegExp(`\\b(fs\\.)?${call}\\b\\s*[(.]`).test(line)).length,
        ]));
        expect(counted, 'A new disk call in store.ts is a new writer: give it a reason and pin it above').toEqual(STORE_DISK_CALLS);
    });
});
