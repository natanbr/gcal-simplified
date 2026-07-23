// ============================================================
// Timer Registry — Performance Governance Guard
// ------------------------------------------------------------
// Every recurring `setInterval` in the renderer wakes the CPU forever.
// This test scans src/ for setInterval usages and fails if one appears
// in a file that is NOT registered below. Adding a new interval is a
// deliberate, reviewable act: register it here with its cadence and
// whether it runs while the user is idle on the Calendar view.
//
// If this test fails after you added a timer, don't just silence it —
// first ask: does this need to run on the Calendar view at all? Can it
// be gated (only while a mission/game is active), event-driven, or a
// single setTimeout instead of a poll? See CLAUDE.md → Performance.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

interface TimerEntry {
    /** Path relative to repo root, POSIX separators. */
    file: string;
    /** How often it fires. */
    cadence: string;
    /** Runs while the user is idle on the Calendar view? Keep this list short. */
    runsOnCalendarIdle: boolean;
    /** Why it is acceptable / how it is gated. */
    note: string;
}

// ── The registry ─────────────────────────────────────────────────────────────
// Ordered worst-first. Anything with runsOnCalendarIdle:true must be cheap and
// justified — that is exactly the budget this guard protects.
const TIMER_REGISTRY: TimerEntry[] = [
    {
        file: 'src/components/Dashboard.tsx',
        cadence: '5 min',
        runsOnCalendarIdle: true,
        note: 'Calendar data refresh (events/tasks/weather). Infrequent network sync; expected for a live calendar.',
    },
    {
        file: 'src/hooks/useCurrentDate.ts',
        cadence: '60 s',
        runsOnCalendarIdle: true,
        note: 'Midnight rollover check. Functional setState bails out when the day is unchanged (no re-render).',
    },
    {
        file: 'src/hooks/useTheme.ts',
        cadence: '60 s',
        runsOnCalendarIdle: true,
        note: 'Time-based light/dark switch. setTheme bails out when unchanged.',
    },
    {
        file: 'src/mission-control/store/useBehaviorHeartbeat.ts',
        cadence: '60 s',
        runsOnCalendarIdle: true,
        note: 'Mood-progress heartbeat. Idle-optimized: mcReducer returns the SAME state ref when nothing accrues (night / out of active window), so idle ticks cause no re-render or persist. Guarded by idle-performance.test.tsx.',
    },
    {
        file: 'src/mission-control/hooks/useMissionScheduler.ts',
        cadence: '15 s',
        runsOnCalendarIdle: false,
        note: 'Duration-expiry poll — GATED on activeMission !== "none". No interval exists while idle. Guarded by idle-performance.test.tsx.',
    },
    {
        file: 'src/mission-control/hooks/useLiveClock.ts',
        cadence: '1 s',
        runsOnCalendarIdle: false,
        note: 'Mission timer clock. Singleton; only alive while MissionTimerDisplay is mounted (mission active, overlay not minimized).',
    },
    {
        file: 'src/mission-control/components/PrivilegesPanel.tsx',
        cadence: '30 s',
        runsOnCalendarIdle: false,
        note: 'Suspension-countdown refresh. Mission Control view only.',
    },
    {
        file: 'src/mission-control/games/blocks/PerformanceHUD.tsx',
        cadence: '200 ms',
        runsOnCalendarIdle: false,
        note: 'Dev FPS/scripting HUD. Blocks game only.',
    },
    {
        file: 'src/mission-control/games/fruits/useFruitMergeGame.ts',
        cadence: '200 ms',
        runsOnCalendarIdle: false,
        note: 'Game countdown. Fruit-merge game playing only.',
    },
    {
        file: 'src/mission-control/games/snake/useSnakeGame.ts',
        cadence: 'game speed + 1 s',
        runsOnCalendarIdle: false,
        note: 'Snake movement + game clock. Snake game playing only.',
    },
];

const REGISTERED_FILES = new Set(TIMER_REGISTRY.map(e => e.file));

// ── Scan src/ for setInterval usages ─────────────────────────────────────────
const SRC_ROOT = join(process.cwd(), 'src');
const SETINTERVAL = /\bsetInterval\s*\(/;

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSourceFiles(full, acc);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
            acc.push(full);
        }
    }
    return acc;
}

function toPosix(p: string): string {
    return relative(process.cwd(), p).split(sep).join('/');
}

describe('timer registry — no unregistered recurring intervals in src/', () => {
    const filesWithInterval = collectSourceFiles(SRC_ROOT)
        .filter(f => SETINTERVAL.test(readFileSync(f, 'utf8')))
        .map(toPosix)
        .sort();

    it('every setInterval lives in a registered file', () => {
        const unregistered = filesWithInterval.filter(f => !REGISTERED_FILES.has(f));
        expect(
            unregistered,
            `\nUnregistered setInterval found. A recurring timer wakes the CPU forever — ` +
            `add it to TIMER_REGISTRY in this file with its cadence and whether it runs ` +
            `on an idle Calendar view, and confirm it is gated/justified:\n  ${unregistered.join('\n  ')}\n`,
        ).toEqual([]);
    });

    it('has no stale registry entries (files that no longer use setInterval)', () => {
        const stale = [...REGISTERED_FILES].filter(f => !filesWithInterval.includes(f));
        expect(
            stale,
            `\nRegistry lists files that no longer contain setInterval — remove them:\n  ${stale.join('\n  ')}\n`,
        ).toEqual([]);
    });

    it('keeps the always-on Calendar-idle timer budget small', () => {
        // A hard cap on how many timers may run while idle on the Calendar view.
        // Raising this number is a deliberate decision — think before you do.
        const idleTimers = TIMER_REGISTRY.filter(e => e.runsOnCalendarIdle);
        expect(idleTimers.length).toBeLessThanOrEqual(4);
    });
});
