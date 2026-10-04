// ============================================================
// Infinite Animation Registry — Performance Governance Guard
// ------------------------------------------------------------
// An animation that loops forever makes the app draw a frame every vsync for
// as long as its element is on screen. "Compositor-driven" (CSS transform /
// opacity) only spares the main thread: on the child's screen (1280x720 at
// scale 1.5) the 8 px Remote dot's 2 s pulse cost 20-25 % of one CPU core,
// all of it frame production, for as long as Mission Control was open
// (measured 2026-10-04; see docs/performance.md).
//
// So every looping animation in src/ must be registered here with WHEN it is
// on screen, and its count per file is pinned, so a new one is a deliberate,
// reviewed edit. Nothing registered may run on an idle view (the Calendar, or
// Mission Control's main view with no mission or game): IDLE_VIEW_BUDGET is 0,
// and raising it is the "explicitly allowed, with a reason" act. A shape the
// scan cannot prove finite (`repeat: count`, an iteration count in a CSS
// variable) counts as a loop.
//
// TS/TSX is read with the TypeScript parser, so comments, JSX text and
// apostrophes cannot hide or fake a loop. The rendered half of the rule:
// src/__tests__/idle-calendar-animations.test.tsx (the Calendar) and
// src/mission-control/__tests__/idle-animations.test.tsx (Mission Control).
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { productionSources, readSource, repoRoot, toRepoPath } from './helpers/sourceFiles';
import { INFINITE_TAILWIND_CLASS, animationDeclarationOf, infiniteCssRules, stylesheetsUnder } from '../mission-control/__tests__/infiniteAnimations';

interface InfiniteAnimation {
    /** Repo-relative path, POSIX separators. */
    file: string;
    /** CSS: the rule's selector. TS/TSX: the looping token (see scanSource). */
    match: string;
    /** How many times `match` occurs in `file`. Pinned: a new loop is a registry edit. */
    count: number;
    /** When it is on screen. */
    onScreen: string;
    /** Can it run while the Calendar or Mission Control's main view sits idle? */
    onIdleView: boolean;
}

// Ordered: Calendar first, then settings, then games. Mission Control's
// stylesheets hold no loop at all (idle-animations.test.tsx pins that).
const REGISTRY: InfiniteAnimation[] = [
    { file: 'src/index.css', match: '.animate-sync-bar', count: 1, onIdleView: false,
        onScreen: 'Calendar "Syncing…" bar. Dashboard.tsx applies the class only while loading (2026-07 fix: the wrapper only fades, it stays mounted).' },
    { file: 'src/components/Dashboard.tsx', match: 'animate-spin', count: 2, onIdleView: false,
        onScreen: 'The first-load "Syncing with Google" screen, and the header refresh icon, which is mounted only while loading.' },
    { file: 'src/components/Dashboard.tsx', match: 'animate-pulse', count: 2, onIdleView: false,
        onScreen: 'The "Syncing…" label (class applied only while loading) and the header icon during a background refresh.' },
    { file: 'src/components/UpdateNotification.tsx', match: 'animate-spin', count: 1, onIdleView: false,
        onScreen: '"Restarting…" once an update has downloaded: the app installs it 1.5 s later and quits; a failed install replaces it with the error.' },
    { file: 'src/features/settings/components/AccountSettingsTab.tsx', match: 'animate-spin', count: 1, onIdleView: false,
        onScreen: 'Settings → Account, "Reconnecting…" while signing in again.' },
    { file: 'src/features/settings/components/GeneralSettingsTab.tsx', match: 'animate-spin', count: 1, onIdleView: false,
        onScreen: 'Settings → General, while checking for updates.' },
    { file: 'src/features/settings/components/SettingsModal.tsx', match: 'animate-spin', count: 1, onIdleView: false,
        onScreen: 'Settings dialog, while the saved settings load.' },
    { file: 'src/mission-control/games/blocks/Altimeter.tsx', match: 'repeat: Infinity', count: 1, onIdleView: false,
        onScreen: 'Space Rescue game, once the altitude reaches 200.' },
    { file: 'src/mission-control/games/blocks/BlocksGameOverlay.tsx', match: "'infinite'", count: 1, onIdleView: false,
        onScreen: 'Space Rescue, the waiting screen before Start. It names `bounce`, which no stylesheet defines, so today it does not move; defining one would make it loop there.' },
    { file: 'src/mission-control/games/fruits/FruitMergeGameOverlay.tsx', match: 'animate-pulse', count: 2, onIdleView: false,
        onScreen: 'Fruit Merge game: the "✕ Cancel" button while choosing a fruit to delete, and the clock in its last seconds.' },
    { file: 'src/mission-control/games/snake/SnakeGameOverlay.tsx', match: 'animate-pulse', count: 1, onIdleView: false,
        onScreen: 'Snake game, the clock in its last seconds.' },
];

/** How many registered loops may run on an idle view. Raising it needs a reason in this comment. */
const IDLE_VIEW_BUDGET = 0;

const COUNT_PROPERTIES = new Set(['repeat', 'iterations', 'animationIterationCount']);

function containsInfinity(node: ts.Node): boolean {
    if (ts.isIdentifier(node) && node.text === 'Infinity') return true;
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'POSITIVE_INFINITY') return true;
    return ts.forEachChild(node, containsInfinity) ?? false;
}

function isFiniteCount(node: ts.Expression): boolean {
    return ts.isNumericLiteral(node) || (ts.isStringLiteralLike(node) && /^\d+$/.test(node.text));
}

/**
 * Looping tokens in a TS/TSX source, read with the TypeScript parser:
 * - `repeat` / `iterations` / `animationIterationCount` holding Infinity anywhere
 *   (`cond ? Infinity : 0` included), or anything but a plain number (unprovable: `?`);
 * - a string or template text containing `infinite` (inline style, iteration count);
 * - a Tailwind looping class, an arbitrary `animate-[…infinite…]` included.
 */
function scanSource(fileName: string, source: string): string[] {
    const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, kind);
    const hits: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && COUNT_PROPERTIES.has(node.name.text)) {
            if (containsInfinity(node.initializer)) hits.push(`${node.name.text}: Infinity`);
            else if (!isFiniteCount(node.initializer)) hits.push(`${node.name.text}: ?`);
        }
        if (ts.isShorthandPropertyAssignment(node) && COUNT_PROPERTIES.has(node.name.text)) hits.push(`${node.name.text}: ?`);
        if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
            hits.push(...[...node.text.matchAll(/\binfinite\b/g)].map(() => "'infinite'"));
            hits.push(...[...node.text.matchAll(INFINITE_TAILWIND_CLASS)].map(m => (m[0].startsWith('animate-[') ? 'animate-[… infinite]' : m[0])));
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return hits;
}

interface Finding { file: string; match: string }

function cssFilesIn(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) cssFilesIn(full, acc);
        else if (entry.name.endsWith('.css')) acc.push(full);
    }
    return acc;
}

function findAll(): Finding[] {
    const found: Finding[] = [];
    for (const file of cssFilesIn(join(repoRoot, 'src'))) {
        for (const rule of infiniteCssRules(readSource(file))) found.push({ file: toRepoPath(file), match: rule.selector });
    }
    for (const file of productionSources(['src'])) {
        for (const match of scanSource(file, readSource(file))) found.push({ file: toRepoPath(file), match });
    }
    return found;
}

const key = (f: Finding) => `${f.file} :: ${f.match}`;

function counts(findings: Finding[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const f of findings) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
    return m;
}

describe('infinite animation registry — every loop in src/ is registered', () => {
    const found = counts(findAll());
    const registered = new Map(REGISTRY.map(e => [key(e), e]));

    it('finds the loops it is meant to find (the scan is actually running)', () => {
        expect(found.size).toBeGreaterThanOrEqual(10);
    });

    it('every looping animation is registered, at its current count', () => {
        const problems = [...found.entries()]
            .filter(([k, n]) => registered.get(k)?.count !== n)
            .map(([k, n]) => `${k}  (found ${n}, registered ${registered.get(k)?.count ?? 'none'})`);
        expect(
            problems,
            `\nA looping animation is not registered (or its count changed). It draws a frame every vsync ` +
            `while on screen — on an idle view that is a constant CPU cost, not a free compositor effect. ` +
            `Prefer a finite iteration count, or one that plays on a change and stops. If it must loop, ` +
            `register it in REGISTRY with when it is on screen:\n  ${problems.join('\n  ')}\n`,
        ).toEqual([]);
    });

    it('has no stale entries', () => {
        const stale = REGISTRY.filter(e => !found.has(key(e))).map(key);
        expect(stale, `\nRegistry lists loops that no longer exist — remove them:\n  ${stale.join('\n  ')}\n`).toEqual([]);
    });

    it('says when each registered loop is on screen', () => {
        expect(REGISTRY.filter(e => e.onScreen.trim().length < 20).map(key)).toEqual([]);
    });

    it('lets nothing loop on an idle view beyond the budget', () => {
        const idle = REGISTRY.filter(e => e.onIdleView).map(key);
        expect(idle.length, `\nLoops that run on an idle view:\n  ${idle.join('\n  ')}\n`).toBeLessThanOrEqual(IDLE_VIEW_BUDGET);
    });

    it('keeps tests out of Tailwind, so a class named in a test never ships its CSS', () => {
        const config = readFileSync(join(repoRoot, 'tailwind.config.js'), 'utf8');
        for (const excluded of ['!./src/**/*.test.{ts,tsx}', '!./src/**/__tests__/**']) expect(config).toContain(`"${excluded}"`);
    });
});

describe('infinite animation scan — what it recognises', () => {
    const scan = (code: string) => scanSource('sample.tsx', code);
    const tw = (utility: string) => `animate-${utility}`; // built, so this file holds no class name

    it('catches Framer and WAAPI loops, conditional ones included, and refuses counts it cannot read', () => {
        expect(scan('const t = { repeat: Infinity, duration: 2 };')).toEqual(['repeat: Infinity']);
        expect(scan('const t = { repeat: on ? Infinity : 0 };')).toEqual(['repeat: Infinity']);
        expect(scan('const t = { repeat: Number.POSITIVE_INFINITY };')).toEqual(['repeat: Infinity']);
        expect(scan('el.animate(k, { iterations: Infinity });')).toEqual(['iterations: Infinity']);
        expect(scan('const t = { repeat: count };')).toEqual(['repeat: ?']);
        expect(scan('const t = { repeat };')).toEqual(['repeat: ?']);
        expect(scan("const s = { animationIterationCount: n };")).toEqual(['animationIterationCount: ?']);
        expect(scan("const s = { animationIterationCount: '3' };")).toEqual([]);
        expect(scan('const t = { repeat: 3 };')).toEqual([]);
    });

    it('catches inline styles and Tailwind loops in strings and templates, arbitrary values included', () => {
        expect(scan("const a = <i style={{ animation: 'spin 2s infinite' }} />;")).toEqual(["'infinite'"]);
        expect(scan(`const a = <i className="${tw('spin')} p-1" />;`)).toEqual([tw('spin')]);
        expect(scan(`const a = \`x \${on ? '${tw('ping')}' : ''}\`;`)).toEqual([tw('ping')]);
        expect(scan(`const a = '${tw('[wiggle_1s_infinite]')}';`)).toEqual(['animate-[… infinite]']);
        expect(scan(`const a = '${tw('pulse-once')}';`)).toEqual([]);
    });

    it('is not fooled by comments or an apostrophe in JSX text', () => {
        expect(scan('// repeat: Infinity, an infinite loop\nconst x = 1;')).toEqual([]);
        expect(scan("const a = <p>Don't stop {/* an infinite comment */}</p>;")).toEqual([]);
        expect(scan("const a = <p>It's {x}</p>; const t = { repeat: Infinity };")).toEqual(['repeat: Infinity']);
    });

    it('reads CSS loops outside @keyframes, inside @media, via @apply or a variable, and ignores finite ones', () => {
        const css = `
            /* .commented { animation: a 1s infinite; } */
            @keyframes a { 0% { opacity: 0 } 100% { opacity: 1 } }
            .finite { animation: a 2s linear 3; }
            .loop { animation: a 2s linear infinite; }
            @media (max-height: 800px) { .narrow .loop2 { animation-iteration-count: infinite } }
            .applied { @apply p-1 ${tw('ping')}; }
            .hidden-count { animation: a 1s var(--count); }`;
        expect(infiniteCssRules(css).map(r => r.selector)).toEqual(['.loop', '.narrow .loop2', '.applied', '.hidden-count']);
    });

    it('reads a rule\'s own animation, not a reduced-motion override inside @media', () => {
        const css = `.dot { animation: p 2s linear 3; }
            @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }`;
        expect(animationDeclarationOf(css, '.dot')).toBe('p 2s linear 3');
    });

    it('reads every stylesheet under a directory', () => {
        expect(stylesheetsUnder(join(repoRoot, 'src'))).toContain('.mc-anim-remote-pulse');
    });
});
