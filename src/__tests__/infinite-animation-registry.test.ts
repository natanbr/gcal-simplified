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
// So every looping animation in src/ — a CSS `infinite`, a Framer
// `repeat: Infinity`, a Tailwind animate-spin/ping/pulse/bounce, an inline
// style string — must be registered here with WHEN it is on screen. Its
// count per file is pinned, so a new one is a deliberate, reviewed edit.
// Nothing registered may run on an idle view (the Calendar, or Mission
// Control's main view with no mission or game): IDLE_VIEW_BUDGET is 0, and
// raising it is the "explicitly allowed, with a reason" act.
//
// The rendered half of this rule (Mission Control's idle main view shows no
// element matching a looping rule) is in
// src/mission-control/__tests__/idle-performance.test.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { productionSources, readSource, repoRoot, stripComments, toRepoPath } from './helpers/sourceFiles';
import { INFINITE_TAILWIND_CLASS, infiniteCssRules } from '../mission-control/__tests__/infiniteAnimations';

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

// Ordered: always-mounted / main-view code first, then settings, then games.
const REGISTRY: InfiniteAnimation[] = [
    { file: 'src/index.css', match: '.animate-sync-bar', count: 1, onIdleView: false,
        onScreen: 'Calendar "Syncing…" bar. Dashboard.tsx applies the class only while loading (2026-07 fix: the wrapper only fades, it stays mounted).' },
    { file: 'src/components/Dashboard.tsx', match: 'animate-spin', count: 2, onIdleView: false,
        onScreen: 'The first-load "Syncing with Google" screen, and the header refresh icon, which is mounted only while loading.' },
    { file: 'src/components/Dashboard.tsx', match: 'animate-pulse', count: 2, onIdleView: false,
        onScreen: 'The "Syncing…" label (class applied only while loading) and the header icon during a background refresh.' },
    { file: 'src/components/UpdateNotification.tsx', match: 'animate-spin', count: 1, onIdleView: false,
        onScreen: '"Restarting…" after the user pressed install on a downloaded update.' },
    { file: 'src/mission-control/styles/mc.css', match: '.mc-notification-dot', count: 1, onIdleView: false,
        onScreen: 'Red dot on Logs while a cheat attempt is unreviewed: MissionControl.tsx clears the flag 5 s after the trap shows, and opening the log clears it (about 10 s at most).' },
    { file: 'src/mission-control/styles/mc.css', match: '.mc-anim-finger-wag', count: 1, onIdleView: false,
        onScreen: 'CheatTrapOverlay, shown for 5 s after a cheat attempt (twice at most before the flag clears).' },
    { file: 'src/features/settings/components/AccountSettingsTab.tsx', match: 'animate-spin', count: 1, onIdleView: false,
        onScreen: 'Settings → Account, "Reconnecting…" while signing in again.' },
    { file: 'src/features/settings/components/GeneralSettingsTab.tsx', match: 'animate-spin', count: 1, onIdleView: false,
        onScreen: 'Settings → General, while checking for updates.' },
    { file: 'src/features/settings/components/SettingsModal.tsx', match: 'animate-spin', count: 1, onIdleView: false,
        onScreen: 'Settings dialog, while the saved settings load.' },
    { file: 'src/mission-control/games/blocks/Altimeter.tsx', match: 'repeat: Infinity', count: 1, onIdleView: false,
        onScreen: 'Space Rescue game, once the altitude reaches 200.' },
    { file: 'src/mission-control/games/blocks/BlocksGameOverlay.tsx', match: "'infinite'", count: 1, onIdleView: false,
        onScreen: 'Space Rescue game, the waiting screen before Start.' },
    { file: 'src/mission-control/games/fruits/FruitMergeGameOverlay.tsx', match: 'animate-pulse', count: 2, onIdleView: false,
        onScreen: 'Fruit Merge game, the last seconds of the clock.' },
    { file: 'src/mission-control/games/snake/SnakeGameOverlay.tsx', match: 'animate-pulse', count: 1, onIdleView: false,
        onScreen: 'Snake game, the last seconds of the clock.' },
];

/** How many registered loops may run on an idle view. Raising it needs a reason in this comment. */
const IDLE_VIEW_BUDGET = 0;

interface Finding { file: string; match: string }

/** Looping tokens in comment-stripped TS/TSX. A string containing `infinite` is an inline style or iteration count. */
function scanSource(code: string): string[] {
    const times = (pattern: RegExp, label: string) => [...code.matchAll(pattern)].map(() => label);
    return [
        ...times(/\brepeat\s*:\s*(?:Infinity|Number\.POSITIVE_INFINITY)\b/g, 'repeat: Infinity'),
        ...times(/\biterations\s*:\s*(?:Infinity|Number\.POSITIVE_INFINITY)\b/g, 'iterations: Infinity'),
        ...times(/\binfinite\b/g, "'infinite'"),
        ...[...code.matchAll(INFINITE_TAILWIND_CLASS)].map(m => m[0]),
    ];
}

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
        for (const match of scanSource(stripComments(readSource(file)))) found.push({ file: toRepoPath(file), match });
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
});

describe('infinite animation scan — what it recognises', () => {
    it('catches each shape of loop, and not a finite one or a comment', () => {
        expect(scanSource("transition: { repeat: Infinity, duration: 2 }")).toEqual(['repeat: Infinity']);
        expect(scanSource("el.animate(k, { iterations: Infinity })")).toEqual(['iterations: Infinity']);
        expect(scanSource("style={{ animation: 'bounce 2s infinite' }}")).toEqual(["'infinite'"]);
        expect(scanSource('className="animate-spin text-zinc-500"')).toEqual(['animate-spin']);
        expect(scanSource('className="animate-pulse-once"')).toEqual([]);
        expect(scanSource("transition: { repeat: 3 }")).toEqual([]);
        expect(scanSource(stripComments('// an infinite loop, repeat: Infinity\nconst x = 1;'))).toEqual([]);
    });

    it('reads CSS loops outside @keyframes, inside @media, and ignores finite ones', () => {
        const css = `
            /* .commented { animation: a 1s infinite; } */
            @keyframes a { 0% { opacity: 0 } 100% { opacity: 1 } }
            .finite { animation: a 2s ease-in-out 3; }
            .loop { animation: a 2s ease-in-out infinite; }
            @media (max-height: 800px) { .narrow .loop2 { animation-iteration-count: infinite } }`;
        expect(infiniteCssRules(css).map(r => r.selector)).toEqual(['.loop', '.narrow .loop2']);
    });
});
