// ============================================================
// The diagnostics folder — structural boundary pin.
//
// The rule (CLAUDE.md → Architecture → "The diagnostics folder has one writer"):
// electron/diagnostics.ts is the only code that writes into the folder the
// parent picked, a folder a cloud service syncs off the machine. It is chosen in
// main's native dialog only, every trace line is rebuilt from an allowlist, and
// nothing of the pairing, config.json or the Google token file goes there.
// GoalPedestal decides the quick game with the same object the trace records.
//
// Why a structural pin: electron/diagnostics.test.ts proves what the writer does
// today. A NEW path — a second module appending to the folder, a handler that
// takes a path from the renderer, a pairing field added to the trace, a pedestal
// gate that reads moodWind again beside the eligibility object — is by
// definition not covered by it.
//
// What each case scans (production files under src/ and electron/, comments
// skipped where a name in prose would be harmless):
//   - diagnosticsDir is named only by the store (the field), the Settings
//     dialog (its exclusion) and the writer; no renderer file names it;
//   - the trace file name and the diagnostics: handlers live in the writer only,
//     main.ts registers them with one call, and every handler goes through ipcSafe;
//   - the writer names no pairing field, no config.json, no auth-store, imports
//     no remote or auth module and holds no spread or Object.assign at all;
//   - the renderer sends diagnostics:choose-folder with no argument;
//   - GoalPedestal reads the quick-game verdicts from quickGameEligibility.
//
// verifiedRedBy: see the registry entry in rule-registry.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

const WRITER = 'electron/diagnostics.ts';
const MAIN = 'electron/main.ts';
const PEDESTAL = 'src/mission-control/components/GoalPedestal.tsx';
const SOURCES = productionSources(['src', 'electron']).map(f => ({ rel: toRepoPath(f), src: readSource(f) }));

const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
const code = (src: string) => src.split('\n').filter(line => !isComment(line)).join('\n');
const source = (rel: string): string => {
    const file = SOURCES.find(f => f.rel === rel);
    if (!file) throw new Error(`${rel} is missing: the guard would pass vacuously`);
    return file.src;
};
const naming = (pattern: RegExp) => SOURCES.filter(({ src }) => pattern.test(code(src))).map(({ rel }) => rel).sort();

describe('the diagnostics folder has one writer', () => {
    it('is named only by the store, the Settings dialog\'s exclusion and the writer', () => {
        expect(SOURCES.length, 'the file walk found nothing').toBeGreaterThan(50);
        expect(naming(/\bdiagnosticsDir\b/)).toEqual(['electron/diagnostics.ts', 'electron/settings-dialog.ts', 'electron/store.ts']);
    });

    it('keeps the trace file name and every diagnostics: handler in the writer', () => {
        expect(naming(/eligibility\.ndjson/)).toEqual([WRITER]);
        expect(naming(/ipcMain\.handle\(\s*['"`]diagnostics:/)).toEqual([WRITER]);

        const writer = code(source(WRITER));
        const handlers = [...writer.matchAll(/ipcMain\.handle\(\s*'([^']+)'\s*,\s*(\w+)/g)];
        expect(handlers.map(([, channel]) => channel).sort())
            .toEqual(['diagnostics:choose-folder', 'diagnostics:disable', 'diagnostics:status', 'diagnostics:trace']);
        expect(handlers.filter(([, , wrapper]) => wrapper !== 'ipcSafe').map(([, channel]) => channel), 'every handler is wrapped in ipcSafe').toEqual([]);
    });

    it('is registered from main.ts with one call', () => {
        const main = code(source(MAIN));
        expect(main.match(/\bregisterDiagnosticsIpc\(\)/g)).toHaveLength(1);
        expect(main).not.toMatch(/['"`]diagnostics:/);
    });

    it('never names the pairing, config.json or the Google token file, and never spreads an object into a line', () => {
        const writer = code(source(WRITER));
        expect(writer).not.toMatch(/\b(remoteKey|remoteRoomId|remotePairingVersion|remotePairingRenewedAt)\b/);
        expect(writer).not.toMatch(/config\.json|auth-store/i);
        expect(writer).not.toMatch(/from\s+['"]\.\/(remote-|auth)/);
        // No spread at all, not only of a named parameter: `...(raw as X)` slipped past that version.
        expect(writer, 'a line is built field by field: no spread, no Object.assign').not.toMatch(/\.\.\.|Object\.assign\(/);
    });

    it('takes no path from the renderer: choose-folder is sent with no argument', () => {
        const sends = SOURCES.filter(({ rel }) => rel.startsWith('src/'))
            .flatMap(({ rel, src }) => [...code(src).matchAll(/invoke\(\s*'diagnostics:choose-folder'([^)]*)\)/g)].map(([, args]) => ({ rel, args })));
        expect(sends.length, 'nothing sends diagnostics:choose-folder: the case would pass vacuously').toBeGreaterThan(0);
        expect(sends.filter(({ args }) => args.trim() !== '')).toEqual([]);
    });
});

describe('GoalPedestal decides the quick game with quickGameEligibility', () => {
    const pedestal = code(source(PEDESTAL));

    it('reads its verdicts from the eligibility object', () => {
        expect(pedestal).toMatch(/import\s*\{[^}]*\bquickGameEligibility\b[^}]*\}\s*from\s*'\.\.\/store\/quickGameEligibility'/);
        expect(pedestal).toMatch(/\.pickerVisible\b/);
        expect(pedestal).toMatch(/\.useEnabled\b/);
    });

    it('keeps no gate of its own beside it', () => {
        expect(pedestal).not.toMatch(/\bisQuickGameWindowOpen\b/);
        expect(pedestal).not.toMatch(/\bmoodWind\b/);
        expect(pedestal).not.toMatch(/\bgameTokens\b/);
    });
});
