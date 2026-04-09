/**
 * Integration tests — Oak Bay / Trial Islands real data fixture
 *
 * Uses an actual API response snapshot captured from the Electron app
 * (src/marine-conditions/__fixtures__/oakBayIslands.json) to exercise the
 * full data pipeline end-to-end:
 *
 *   Raw TideData → useMarineEvents → useDiveWindows
 *
 * ── Why this matters ──────────────────────────────────────────────────────
 * Synthetic tests (makeTides / makeScenario) use idealised sinusoidal profiles
 * that are easy to reason about but won't catch issues with real-world CHS data:
 *
 *  1. hilo.time is UTC ("2026-04-08T11:20:00Z") while hourly.time is local
 *     ("2026-04-08T11:00" — no 'Z'). The findIndex prefix match must be robust
 *     to this mismatch, otherwise events are silently dropped.
 *
 *  2. tide_height: [] (empty) forces the cosine fallback from hilo data.
 *     Ensures cosineTideFromHilo is exercised on real hilo values.
 *
 *  3. current_speed contains real CHS wcp data — irregular, noisy, sometimes 0.
 *     Smoke-tests that slackWindows doesn't crash or produce phantom windows.
 *
 *  4. Solar times are computed via getDaylightTimes using the fixture's real
 *     coords (48.37°N, -123.72°W) and the fixture's first date (2026-04-08),
 *     making all tests fully deterministic and time-insensitive.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMarineEvents } from './useMarineEvents';
import { useDiveWindows  } from './useDiveWindows';
import type { TideData, MarineEvent, DiveWindow } from '../types';
import { getDaylightTimes } from '../utils/solarTimes';

import rawFixture from '../__fixtures__/oakBayIslands.json';

// ── Fixture setup ────────────────────────────────────────────────────────────

const FIXTURE_COORDS = { lat: 48.37, lng: -123.72 };

// The fixture covers 2026-04-08 → 2026-04-15 (8 days).
// We compute accurate solar times for those exact dates so tests are
// time-insensitive — not tied to "today".
const FIXTURE_START_DATE = new Date('2026-04-08T00:00:00'); // local midnight
const SOLAR = getDaylightTimes(
    FIXTURE_COORDS.lat,
    FIXTURE_COORDS.lng,
    FIXTURE_START_DATE,
    10,
);

// Cast the JSON fixture to TideData. The `_meta` field is extra, but TideData
// uses optional fields everywhere so TypeScript is happy with `as TideData`.
const tides = rawFixture as unknown as TideData;

// ── Section 1: Raw fixture shape ─────────────────────────────────────────────

describe('Oak Bay fixture — raw shape', () => {
    it('has 192 hourly time entries (8 days × 24h)', () => {
        // 2026-04-08T00:00 → 2026-04-15T23:00 inclusive
        expect(tides.hourly.time.length).toBe(192);
    });

    it('hourly.time uses local format (no Z suffix)', () => {
        // Critical: must NOT end with 'Z' — no timezone suffix.
        // If times were UTC, hilo prefix-matching would be offset by 7h in PDT.
        tides.hourly.time.forEach(t => {
            expect(t).not.toMatch(/Z$/);
            expect(t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
        });
    });

    it('hourly.tide_height is empty — cosine fallback will be used', () => {
        expect(tides.hourly.tide_height).toEqual([]);
    });

    it('hilo entries have UTC suffix (Z)', () => {
        // CHS hilo times come back as UTC ISO strings.
        // This is the format mismatch the integration test is designed to catch.
        tides.hilo!.forEach(h => {
            expect(h.time).toMatch(/Z$/);
        });
    });

    it('has 22 hilo (tide extreme) entries', () => {
        expect(tides.hilo!.length).toBe(22);
    });

    it('current_speed has no values above 2.0 kn (CHS modelled warning station)', () => {
        // This fixture is tagged as "Modeled Data (Warning)" — currents are weak.
        // The isSuspect flag in useMarineData would fire (max < 2.0 kn).
        const max = Math.max(...tides.hourly.current_speed!);
        expect(max).toBeLessThan(2.1); // allowing small tolerance
    });
});

// ── Section 2: useMarineEvents with real data ─────────────────────────────────

describe('Oak Bay fixture — useMarineEvents', () => {
    it('produces some events (not empty)', () => {
        const { result } = renderHook(() => useMarineEvents(tides));
        const nonSep = result.current.filter((e: MarineEvent) => e.type !== 'separator');
        expect(nonSep.length).toBeGreaterThan(0);
    });

    it('produces High Tide and Low Tide events from hilo', () => {
        const { result } = renderHook(() => useMarineEvents(tides));
        const types = result.current.map((e: MarineEvent) => e.type);
        expect(types).toContain('High Tide');
        expect(types).toContain('Low Tide');
    });

    it('events are sorted chronologically (non-separator)', () => {
        const { result } = renderHook(() => useMarineEvents(tides));
        const nonSep = result.current.filter((e: MarineEvent) => e.type !== 'separator');
        for (let i = 1; i < nonSep.length; i++) {
            expect(new Date(nonSep[i].time).getTime())
                .toBeGreaterThanOrEqual(new Date(nonSep[i - 1].time).getTime());
        }
    });

    it('day separator rows are injected between calendar days', () => {
        const { result } = renderHook(() => useMarineEvents(tides));
        const seps = result.current.filter((e: MarineEvent) => e.type === 'separator');
        // 8-day window → at least 1 separator (likely 7 for each day boundary)
        expect(seps.length).toBeGreaterThan(0);
        seps.forEach((s: MarineEvent) => expect(s.label).toBeTruthy());
    });

    // ── The critical hilo/hourly timezone mismatch check ──
    it('hilo High Tide events have a valid tideHeight (not undefined) — verifies UTC/local hilo matching', () => {
        const { result } = renderHook(() => useMarineEvents(tides));
        const highTides = result.current.filter(
            (e: MarineEvent) => e.type === 'High Tide'
        );
        // If the UTC↔local prefix match is broken, tideHeight would be undefined
        // because findIndex returns -1. This assertion catches that regression.
        highTides.forEach((e: MarineEvent) => {
            expect(e.tideHeight).not.toBeUndefined();
        });
    });

    it('no events are in the past relative to fixture start date (all in 2026-04 window)', () => {
        const { result } = renderHook(() => useMarineEvents(tides));
        const nonSep = result.current.filter((e: MarineEvent) => e.type !== 'separator');
        // All events should be 2026-04-08 or later
        nonSep.forEach((e: MarineEvent) => {
            expect(e.time).toMatch(/^2026-04-(0[89]|1[0-5])/);
        });
    });
});

// ── Section 3: useDiveWindows with real data ──────────────────────────────────

describe('Oak Bay fixture — useDiveWindows', () => {
    function buildInput() {
        const { result: eventsResult } = renderHook(() => useMarineEvents(tides));
        return {
            tides,
            events: eventsResult.current,
            sunrises: SOLAR.sunrises,
            sunsets:  SOLAR.sunsets,
            coords:   FIXTURE_COORDS,
        };
    }

    it('solarAvailable = true (solar times computable for Victoria BC)', () => {
        const input = buildInput();
        const { result } = renderHook(() => useDiveWindows(input));
        expect(result.current.solarAvailable).toBe(true);
    });

    it('produces dive windows from real CHS data', () => {
        // This fixture has modelled current data with many sub-0.5kn windows.
        // If the pipeline is broken, windows would be [] even though data exists.
        const input = buildInput();
        const { result } = renderHook(() => useDiveWindows(input));
        expect(result.current.windows.length).toBeGreaterThan(0);
    });

    it('all windows are during daylight hours', () => {
        const input = buildInput();
        const { result } = renderHook(() => useDiveWindows(input));
        result.current.windows.forEach((w: DiveWindow) => {
            expect(w.isDaylight).toBe(true);
        });
    });

    it('all windows have activityScore.diving >= 0 and <= 100', () => {
        const input = buildInput();
        const { result } = renderHook(() => useDiveWindows(input));
        result.current.windows.forEach((w: DiveWindow) => {
            expect(w.activityScore.diving).toBeGreaterThanOrEqual(0);
            expect(w.activityScore.diving).toBeLessThanOrEqual(100);
        });
    });

    it('all windows have currentAtStart and currentAtEnd as finite numbers', () => {
        const input = buildInput();
        const { result } = renderHook(() => useDiveWindows(input));
        result.current.windows.forEach((w: DiveWindow) => {
            expect(Number.isFinite(w.currentAtStart)).toBe(true);
            expect(Number.isFinite(w.currentAtEnd)).toBe(true);
        });
    });

    it('windows have duration >= 30 minutes (MIN_WINDOW_DURATION gate)', () => {
        const input = buildInput();
        const { result } = renderHook(() => useDiveWindows(input));
        result.current.windows.forEach((w: DiveWindow) => {
            expect(w.duration).toBeGreaterThanOrEqual(30);
        });
    });

    it('windows with high score have lower current at slack', () => {
        // Higher current → lower currentFactor → lower score.
        // This is a model coherence check: sort by score descending,
        // verify the top-scored windows have currentSpeed < those at the bottom.
        const input = buildInput();
        const { result } = renderHook(() => useDiveWindows(input));
        const windows = [...result.current.windows].sort(
            (a: DiveWindow, b: DiveWindow) => b.activityScore.diving - a.activityScore.diving
        );
        if (windows.length >= 4) {
            const topAvgCurrent    = windows.slice(0, 2).reduce((s: number, w: DiveWindow) => s + w.currentSpeed, 0) / 2;
            const bottomAvgCurrent = windows.slice(-2).reduce((s: number, w: DiveWindow) => s + w.currentSpeed, 0) / 2;
            // Top-scored windows should not have dramatically higher current than low-scored ones
            // (they may be equal if score is dominated by other factors — so >= not strict >)
            expect(topAvgCurrent).toBeLessThanOrEqual(bottomAvgCurrent + 0.5);
        }
    });

    it('cosine tide fallback produces non-zero tideHeight on windows', () => {
        // tide_height is [] in fixture → cosine fallback from hilo is used.
        // If cosineTideFromHilo is broken, tideHeight would be 0 on all windows.
        const input = buildInput();
        const { result } = renderHook(() => useDiveWindows(input));
        const hasTideData = result.current.windows.some((w: DiveWindow) => w.tideHeight !== 0);
        expect(hasTideData).toBe(true);
    });
});
