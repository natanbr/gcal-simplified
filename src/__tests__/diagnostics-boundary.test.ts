// ============================================================
// The diagnostics folder — structural boundary pin.
//
// The rule (CLAUDE.md → Architecture → "The diagnostics folder has one writer"):
// electron/diagnostics.ts is the only code that writes into the folder the
// parent picked, a folder a cloud service syncs off the machine. It is chosen in
// main's native dialog only, every trace line is rebuilt from an allowlist
// (electron/diagnostics-trace.ts), nothing of the pairing, config.json or the
// Google token file goes there, and no write blocks the main process.
// GoalPedestal decides the quick game with the object the trace records.
//
// Why a structural pin: the diagnostics*.test.ts suites prove what the writer
// does today. A NEW path — a second module importing the writer, a handler that
// takes a path from the window, a store.update of a path that did not come from
// the dialog, a synchronous fs call, a pairing field or a spread in a line, a
// pedestal gate that reads moodWind again — is by definition not covered by them.
//
// What each case scans (production files under src/ and electron/, comment
// lines skipped where a name in prose would be harmless):
//   - diagnosticsDir is named only by the store (the field), the Settings
//     dialog (its exclusions) and the writer;
//   - the trace file name and the diagnostics: handlers live in the writer only;
//     each handler goes through ipcSafe and takes no argument from the window
//     beyond the event, except the trace's payload;
//   - the writer stores diagnosticsDir only as the dialog's picked path or undefined;
//   - only electron/main.ts imports the writer, with one registration call, and
//     only the writer imports the line allowlist;
//   - the writer makes no synchronous fs call; neither file names a pairing
//     field, config.json or auth-store, imports a remote or auth module, or
//     holds a spread or Object.assign;
//   - the window sends diagnostics:choose-folder with no argument;
//   - GoalPedestal renders the picker from pickerRewards and reads its verdicts
//     from quickGameEligibility, with no gate of its own.
//
// verifiedRedBy: see the registry entry in rule-registry.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { productionSources, readSource, repoRoot, toRepoPath } from './helpers/sourceFiles';

const WRITER = 'electron/diagnostics.ts';
const LINE_RULES = 'electron/diagnostics-trace.ts';
const MAIN = 'electron/main.ts';
const PEDESTAL = 'src/mission-control/components/GoalPedestal.tsx';
const SOURCES = productionSources(['src', 'electron']).map(f => ({ rel: toRepoPath(f), src: readSource(f) }));

const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
const code = (src: string) => src.split('\n').filter(line => !isComment(line)).join('\n');
const source = (rel: string): string => {
    const file = SOURCES.find(f => f.rel === rel);
    if (!file) throw new Error(`${rel} is missing: the guard would pass vacuously`);
    return code(file.src);
};
const naming = (pattern: RegExp) => SOURCES.filter(({ src }) => pattern.test(code(src))).map(({ rel }) => rel).sort();

/** Repo paths of the modules a file imports (static, re-export, dynamic), relative specifiers only. */
function importsOf(rel: string, src: string): string[] {
    return [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](\.[^'"]+)['"]/g)].flatMap(([, specifier]) => {
        const base = resolve(repoRoot, dirname(rel), specifier);
        const hit = [`${base}.ts`, `${base}.tsx`, base].find(p => /\.tsx?$/.test(p) && existsSync(p));
        return hit ? [toRepoPath(hit)] : [];
    });
}
const importersOf = (target: string) => SOURCES.filter(({ rel, src }) => importsOf(rel, code(src)).includes(target)).map(({ rel }) => rel).sort();

describe('the diagnostics folder has one writer', () => {
    it('is named only by the store, the Settings dialog\'s exclusions and the writer', () => {
        expect(SOURCES.length, 'the file walk found nothing').toBeGreaterThan(50);
        expect(naming(/\bdiagnosticsDir\b/)).toEqual([WRITER, 'electron/settings-dialog.ts', 'electron/store.ts']);
    });

    it('keeps the trace file name and every diagnostics: handler in the writer, each through ipcSafe', () => {
        expect(naming(/eligibility\.ndjson/)).toEqual([WRITER]);
        expect(naming(/ipcMain\.handle\(\s*['"`]diagnostics:/)).toEqual([WRITER]);

        const handlers = [...source(WRITER).matchAll(/ipcMain\.handle\(\s*'([^']+)'\s*,\s*(\w+)/g)];
        expect(handlers.map(([, channel]) => channel).sort())
            .toEqual(['diagnostics:choose-folder', 'diagnostics:disable', 'diagnostics:status', 'diagnostics:trace']);
        expect(handlers.filter(([, , wrapper]) => wrapper !== 'ipcSafe').map(([, channel]) => channel), 'every handler is wrapped in ipcSafe').toEqual([]);
    });

    it('takes nothing from the window beyond the event, except the trace\'s payload', () => {
        const ALLOWED = { 'diagnostics:trace': 2, 'diagnostics:status': 1, 'diagnostics:choose-folder': 1, 'diagnostics:disable': 1 };
        const handlers = [...source(WRITER).matchAll(/ipcMain\.handle\(\s*'([^']+)'\s*,\s*ipcSafe\(\s*(?:async\s*)?\(([^)]*)\)/g)]
            .map(([, channel, params]) => ({ channel, params: params.split(',').map(p => p.trim()).filter(Boolean).length }));
        expect(handlers.map(({ channel }) => channel).sort(), 'a handler the pattern cannot read').toEqual(Object.keys(ALLOWED).sort());
        expect(handlers.filter(({ channel, params }) => params > (ALLOWED[channel as keyof typeof ALLOWED] ?? 0))).toEqual([]);
    });

    it('stores diagnosticsDir only as the dialog\'s picked path, or undefined to turn it off', () => {
        const writer = source(WRITER);
        const updates = [...writer.matchAll(/store\.update\(([^)]*)\)/g)].map(([, patch]) => patch.replace(/\s+/g, ' ').trim());
        expect(updates.sort()).toEqual(['{ diagnosticsDir: folder }', '{ diagnosticsDir: undefined }']);
        expect(writer.match(/\bconst folder\b[^;\n]*/g), 'the stored folder is the dialog\'s answer').toEqual(['const folder = picked.filePaths[0]']);
    });

    it('is imported only by main.ts, which registers it with one call', () => {
        expect(importersOf(WRITER)).toEqual([MAIN]);
        expect(importersOf(LINE_RULES)).toEqual([WRITER]);
        const main = source(MAIN);
        expect(main.match(/\bregisterDiagnosticsIpc\(\)/g)).toHaveLength(1);
        expect(main).not.toMatch(/['"`]diagnostics:/);
    });

    it('makes no synchronous fs call: a held or offline folder can never stop the main process', () => {
        expect(source(WRITER)).toMatch(/fs\.promises/);
        expect(source(WRITER)).not.toMatch(/\b\w+Sync\s*\(/);
        expect(source(LINE_RULES)).not.toMatch(/from\s+['"](node:)?fs/);
    });

    it.each([WRITER, LINE_RULES])('%s names no pairing, config.json or token file, and builds no line by spreading', rel => {
        const text = source(rel);
        expect(text).not.toMatch(/\b(remoteKey|remoteRoomId|remotePairingVersion|remotePairingRenewedAt)\b/);
        expect(text).not.toMatch(/config\.json|auth-store/i);
        expect(text).not.toMatch(/from\s+['"]\.\/(remote-|auth)/);
        // No spread at all, not only of a named parameter: `...(raw as X)` slipped past that version.
        expect(text, 'a line is built field by field: no spread, no Object.assign').not.toMatch(/\.\.\.|Object\.assign\(/);
    });

    it('takes no path from the window: choose-folder is sent with no argument', () => {
        const sends = SOURCES.filter(({ rel }) => rel.startsWith('src/'))
            .flatMap(({ rel, src }) => [...code(src).matchAll(/invoke\(\s*'diagnostics:choose-folder'([^)]*)\)/g)].map(([, args]) => ({ rel, args })));
        expect(sends.length, 'nothing sends diagnostics:choose-folder: the case would pass vacuously').toBeGreaterThan(0);
        expect(sends.filter(({ args }) => args.trim() !== '')).toEqual([]);
    });
});

describe('GoalPedestal decides the quick game with quickGameEligibility', () => {
    const pedestal = source(PEDESTAL);

    it('renders the picker from pickerRewards and reads its verdicts from the eligibility object', () => {
        expect(pedestal).toMatch(/import\s*\{[^}]*\bquickGameEligibility\b[^}]*\}\s*from\s*'\.\.\/store\/quickGameEligibility'/);
        expect(pedestal).toMatch(/\bpickerRewards\(state, quickGame\)/);
        expect(pedestal).toMatch(/\.useEnabled\b/);
    });

    it('keeps no gate of its own beside it', () => {
        expect(pedestal).not.toMatch(/\bisQuickGameWindowOpen\b|\bcanSelectReward\b|\bREWARDS\.filter\b/);
        expect(pedestal).not.toMatch(/\bmoodWind\b/);
        expect(pedestal).not.toMatch(/\bgameTokens\b/);
    });
});
