// ============================================================
// E2E launch chokepoint — CLAUDE.md → Testing → E2E launches go through launchApp
// ------------------------------------------------------------
// The mission scheduler runs on the wall clock and MissionOverlay covers both
// views. So a launch inside a mission window, or on a profile with a mission
// still running, blocked every click. On 2026-09-21 the same commit passed
// 45 of 45 at 18:00 and failed 30 of 45 from 19:02. launchApp
// (e2e/helpers/launchApp.ts) takes the clock out of play, but only for the
// launches that go through it. This file checks that they all do:
//
//   1. Nothing under e2e/ except launchApp.ts touches Playwright's `_electron`,
//      so there is no second way to start the app. It matches the identifier,
//      not `electron.launch(`, so an alias (`_electron as boot`) is caught too.
//   2. launchApp runs quietMissionClock as a plain `await` statement between
//      the launch and the return: no `void`, no `.catch()`, no condition, no
//      early `return` before it, and a catch that rethrows. Review found each
//      of those passed an earlier version.
//   3. Every blob field missionClock.ts writes is still declared on MCState,
//      and the scheduler still reads the two "concluded today" dates. After a
//      rename the helper would write a dead field, silently, and the suite
//      would depend on the clock again.
//   4. Nothing under e2e/ except launchApp.ts takes `test` from
//      '@playwright/test'. The shared test's teardown closes (and so, on the
//      real profile, restores) whatever a test launched, even when the test
//      failed or timed out. No beforeAll/afterAll either: an app launched there
//      would be closed by the first test's teardown.
//   5. Nothing under e2e/ except missionClock.ts clears localStorage or calls
//      removeItem. A rebuilt store has no "concluded today" dates, so the
//      19:00 mission re-arms.
//   6. The behavioural regression spec still exists. This file only reads
//      source; that spec proves the app is actually clickable.
// ============================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { repoRoot } from './helpers/sourceFiles';

const E2E_DIR = join(repoRoot, 'e2e');
const CHOKEPOINT = 'helpers/launchApp.ts';
const MISSION_CLOCK_NAME = 'helpers/missionClock.ts';
const MISSION_CLOCK = join(E2E_DIR, 'helpers', 'missionClock.ts');
const REGRESSION_SPEC = join(E2E_DIR, 'mission-clock-independence.spec.ts');
const MC_TYPES = join(repoRoot, 'src', 'mission-control', 'types.ts');
const SCHEDULER = join(repoRoot, 'src', 'mission-control', 'hooks', 'useMissionScheduler.ts');

/** Every TypeScript file under e2e/, recursively, keyed by POSIX path relative to e2e/. */
function e2eSources(): Map<string, string> {
    const found = new Map<string, string>();
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (entry.endsWith('.ts')) {
                found.set(relative(E2E_DIR, full).split(sep).join('/'), readFileSync(full, 'utf-8'));
            }
        }
    };
    walk(E2E_DIR);
    return found;
}

/** Code without comments: prose naming a call is not a call. `://` is kept for URLs. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * The code of a top-level `export async function name(...)` up to its closing
 * brace, comments removed. (Proven: with comments kept, a commented-out
 * `// await quietMissionClock(...)` passed this guard.)
 */
function functionBody(source: string, name: string): string {
    const start = source.indexOf(`export async function ${name}(`);
    if (start === -1) return '';
    const end = source.indexOf('\n}', start);
    return stripComments(source.slice(start, end === -1 ? undefined : end));
}

/** Brace depth at `pos`, counted from the start of `code`. */
function depthAt(code: string, pos: number): number {
    let depth = 0;
    for (let i = 0; i < pos; i++) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}') depth--;
    }
    return depth;
}

/** Why the quietMissionClock call in launchApp is not an unconditional awaited statement, or null. */
function quietCallProblem(body: string): string | null {
    // One exit only: `if (isolated) return app;` above the call skipped it and
    // passed every check below.
    const returns = body.match(/\breturn\b/g) ?? [];
    if (returns.length !== 1) return `launchApp must have exactly one \`return\` (after the call), found ${returns.length}`;
    // The catch must rethrow: `return app` there handed out an un-quieted launch.
    const handler = body.match(/catch\s*\(\s*(\w+)\s*\)\s*\{([\s\S]*)$/);
    if (!handler || !new RegExp(`\\bthrow\\s+${handler[1]}\\s*;`).test(handler[2])) return 'the catch must end the launch by rethrowing its error';

    const calls = [...body.matchAll(/quietMissionClock\s*\(/g)];
    if (calls.length !== 1) return `expected exactly one quietMissionClock call, found ${calls.length}`;
    const at = calls[0].index ?? 0;
    const lineStart = body.lastIndexOf('\n', at) + 1;

    const prefix = body.slice(lineStart, at);
    if (!/^\s*await\s+$/.test(prefix)) return `the line must start with \`await quietMissionClock(\`, found \`${prefix.trim()} quietMissionClock(\``;

    let i = body.indexOf('(', at);
    for (let depth = 0; i < body.length; i++) {
        if (body[i] === '(') depth++;
        else if (body[i] === ')' && --depth === 0) break;
    }
    const after = body.slice(i + 1).trimStart();
    if (!after.startsWith(';')) return `nothing may follow the call but \`;\`, found \`${after.split('\n')[0]}\``;

    if (!/[;{]$/.test(body.slice(0, lineStart).trimEnd())) return 'the previous statement must end with `;` or `{`; otherwise the call is the body of a condition';

    const launchAt = body.search(/electron\s*\.\s*launch\s*\(/);
    const returnAt = body.search(/\n\s*return\s+app\s*;/);
    if (launchAt === -1 || launchAt > at) return 'the Electron launch must come before the call';
    if (returnAt === -1 || returnAt < at) return '`return app;` must come after the call';

    const depth = depthAt(body, at);
    if (depthAt(body, returnAt) !== depth) return 'the call and `return app;` must be in the same block';
    let running = depth;
    for (let k = at; k < returnAt; k++) {
        if (body[k] === '{') running++;
        else if (body[k] === '}' && --running < depth) return 'the call and `return app;` must be in the same block';
    }
    return null;
}

/** The body of `export interface MCState { ... }` in types.ts. */
function mcStateBody(): string {
    const types = readFileSync(MC_TYPES, 'utf-8');
    const start = types.indexOf('export interface MCState {');
    return types.slice(start, types.indexOf('\n}', start));
}

/** `test` taken from '@playwright/test': named, aliased, default or namespace import, or a re-export. */
function playwrightTestImports(source: string): string[] {
    const found: string[] = [];
    for (const m of stripComments(source).matchAll(/(?:import|export)\s+([^;]*?)\s+from\s+['"]@playwright\/test['"]/g)) {
        const clause = m[1].trim();
        if (clause.startsWith('type ')) continue;
        const braces = clause.match(/\{([\s\S]*)\}/)?.[1];
        const outside = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
        if (outside) found.push(outside); // default (`import test from`) or namespace (`* as pw`)
        for (const spec of (braces ?? '').split(',').map(s => s.trim())) {
            if (!spec.startsWith('type ') && /^test\b/.test(spec)) found.push(`{ ${spec} }`);
        }
    }
    return found;
}

describe('E2E launch chokepoint', () => {
    const sources = e2eSources();

    it('is actually scanning the E2E suite', () => {
        expect(sources.size).toBeGreaterThanOrEqual(15);
        expect(sources.has(CHOKEPOINT), `e2e/${CHOKEPOINT} is missing`).toBe(true);
    });

    it("lets only launchApp.ts touch Playwright's Electron launcher", () => {
        const offenders = [...sources]
            .filter(([name, source]) => name !== CHOKEPOINT && /\b_electron\b/.test(source))
            .map(([name]) => `  e2e/${name}`);

        expect(
            offenders,
            `E2E file(s) reach for Playwright's \`_electron\` directly, bypassing launchApp.\n\n` +
            `A launch that skips launchApp skips quietMissionClock, so it passes or fails by the\n` +
            `time of day: between 19:00 and 20:00 (the default evening mission), or on a profile\n` +
            `with a mission still running, the mission overlay covers the app and every click\n` +
            `times out.\n\n` +
            `Fix: \`import { launchApp } from './helpers/launchApp'\` and call it with the same\n` +
            `options you would pass to the launcher — or use \`mcTest\` / \`launchMC\`.\n\n` +
            offenders.join('\n')
        ).toEqual([]);
    });

    it('runs quietMissionClock as a plain awaited statement between the launch and the return', () => {
        const problem = quietCallProblem(functionBody(sources.get(CHOKEPOINT) ?? '', 'launchApp'));
        expect(
            problem,
            'launchApp must run `await quietMissionClock(...);` unconditionally, after the launch and ' +
            'before `return app;`, with nothing swallowing its failure. Otherwise specs can start ' +
            'clicking with the wall-clock mission scheduler still live.'
        ).toBeNull();
    });

    it('writes only blob fields that MCState still declares', () => {
        const clock = stripComments(readFileSync(MISSION_CLOCK, 'utf-8'));
        const written = new Set<string>();
        for (const m of clock.matchAll(/state(?:\[['"](\w+)['"]\]|\.(\w+))\s*=(?!=)/g)) written.add(m[1] ?? m[2]);
        const listed = clock.match(/MISSION_FIELDS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
        for (const m of listed.matchAll(/'(\w+)'/g)) written.add(m[1]);

        expect(written.size, 'found no blob fields in missionClock.ts — has its shape changed?').toBeGreaterThanOrEqual(4);

        const state = mcStateBody();
        const dead = [...written].filter(field => !new RegExp(`\\b${field}\\??:`).test(state));
        expect(
            dead,
            `e2e/helpers/missionClock.ts writes field(s) MCState no longer declares. Writing a dead\n` +
            `field changes nothing, so the E2E suite would silently depend on the clock again.\n` +
            `Rename them in missionClock.ts:\n  ${dead.join('\n  ')}`
        ).toEqual([]);
    });

    it('relies on a scheduler that still skips a phase already concluded today', () => {
        const scheduler = readFileSync(SCHEDULER, 'utf-8');
        for (const field of ['lastCompletedOrFailedMorningDate', 'lastCompletedOrFailedEveningDate']) {
            expect(
                scheduler.includes(field),
                `useMissionScheduler.ts no longer reads ${field}. quietMissionClock marks today's ` +
                `missions concluded precisely so the scheduler skips them; rework the helper first.`
            ).toBe(true);
        }
    });

    it('gives every spec the test whose teardown closes, and restores, what it launched', () => {
        const launcher = stripComments(sources.get(CHOKEPOINT) ?? '');
        expect(launcher, 'launchApp.ts must export the shared `test` with an auto fixture').toMatch(/export const test = base\.extend/);
        expect(launcher).toMatch(/auto:\s*true/);

        // Every file, not only specs: a helper re-exporting Playwright's test
        // would hand specs the one without the teardown.
        const offenders = [...sources]
            .filter(([name]) => name !== CHOKEPOINT)
            .map(([name, source]) => ({ name, imports: playwrightTestImports(source) }))
            .filter(s => s.imports.length > 0)
            .map(s => `  e2e/${s.name}: ${s.imports.join(', ')}`);
        expect(
            offenders,
            `E2E file(s) take \`test\` from '@playwright/test'. That test does not close the apps it\n` +
            `launched when it fails or times out, so a real-profile spec that dies early leaves your\n` +
            `dev profile quieted: today's missions marked concluded, a running mission dropped.\n\n` +
            `Fix: \`import { test } from './helpers/launchApp'\` (or use \`mcTest\` from mcApp).\n\n` +
            offenders.join('\n')
        ).toEqual([]);
    });

    it('keeps one app per test: no beforeAll or afterAll', () => {
        // Playwright runs beforeAll before the per-test fixture, so the shared
        // test's teardown closes an app launched there after the FIRST test.
        // 'all-hooks-included' is no fix: it tears down after each beforeAll.
        const offenders = [...sources]
            .filter(([, source]) => /\.\s*(?:beforeAll|afterAll)\s*\(/.test(stripComments(source)))
            .map(([name]) => `  e2e/${name}`);
        expect(
            offenders,
            `E2E file(s) use beforeAll/afterAll. Launch one app per test (beforeEach, or mcTest) —\n` +
            `an app shared across tests is closed by the first test's teardown.\n\n${offenders.join('\n')}`
        ).toEqual([]);
    });

    it('never clears the store a launch quieted', () => {
        const offenders = [...sources]
            .filter(([name]) => name !== MISSION_CLOCK_NAME)
            .filter(([, source]) => {
                const code = stripComments(source);
                // Any removeItem, not only of the key by name: the key usually
                // arrives as an argument (`(k) => localStorage.removeItem(k)`).
                return /\blocalStorage\s*\.\s*clear\b/.test(code) || /\bremoveItem\s*\(/.test(code);
            })
            .map(([name]) => `  e2e/${name}`);
        expect(
            offenders,
            `E2E file(s) clear localStorage or call removeItem. If the Mission Control blob goes, the store is rebuilt\n` +
            `from initialState, without the "concluded today" dates launchApp wrote, so the default\n` +
            `19:00 evening mission starts and covers the app. week-display-customization did exactly\n` +
            `this. Seed what the test needs with patchMCState instead.\n\n${offenders.join('\n')}`
        ).toEqual([]);
    });

    it('keeps the behavioural regression spec', () => {
        expect(existsSync(REGRESSION_SPEC), 'e2e/mission-clock-independence.spec.ts is missing').toBe(true);
        expect(readFileSync(REGRESSION_SPEC, 'utf-8')).toMatch(/seedFailingState\(/);
    });
});
