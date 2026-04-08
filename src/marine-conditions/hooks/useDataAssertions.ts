import { useEffect } from 'react';
import type { TideData, DiveWindow } from '../types';
import { parseSafe } from '../utils/dateUtils';

/**
 * Live assertion hook — runs after every data update and checks that derived
 * values are within hydrographically plausible ranges.
 *
 * In development: logs detailed warnings to the console.
 * In production:  silent (assertions are dev-only guards).
 *
 * This is NOT a replacement for useDataQuality (which gates the UI).
 * These are post-calculation sanity checks on already-computed results.
 */
export interface AssertionResult {
    passed: boolean;
    warnings: string[];
}

function assert(condition: boolean, message: string, warnings: string[]): void {
    if (!condition) {
        warnings.push(message);
        if (process.env.NODE_ENV === 'development') {
            console.warn(`[MarineAssert] ❌ ${message}`);
        }
    }
}

export function runDataAssertions(
    tides: TideData | null,
    windows: DiveWindow[],
): AssertionResult {
    const warnings: string[] = [];

    if (!tides) return { passed: true, warnings: [] };

    const hourly  = tides.hourly;
    const speeds  = hourly?.current_speed ?? [];
    const hilo    = tides.hilo ?? [];

    // ── 1. Window count sanity ─────────────────────────────────────────────────
    // If we have current data (speeds > 0) but zero windows, something is wrong.
    const maxSpeed = speeds.length ? Math.max(...speeds) : 0;
    if (maxSpeed > 0.3 && windows.length === 0) {
        assert(false,
            `No dive windows produced despite max current speed ${maxSpeed.toFixed(2)} kn. ` +
            `Expected 2–6 windows per 7-day period. ` +
            `Check: solar block, quality threshold, or event parsing.`,
            warnings
        );
    }

    // ── 2. Window duration checks ──────────────────────────────────────────────
    for (const w of windows) {
        assert(w.duration >= 30,
            `Window at ${w.slackTime} has duration ${w.duration}min < 30min minimum. ` +
            `Should have been filtered by calculateSlackWindows.`,
            warnings
        );
        assert(w.duration <= 240,
            `Window at ${w.slackTime} has suspicious duration ${w.duration}min > 240min. ` +
            `May indicate CHS wcp data with a very long low-current period.`,
            warnings
        );
    }

    // ── 3. slackTime within [windowStart, windowEnd] ──────────────────────────
    for (const w of windows) {
        const slack = parseSafe(w.slackTime).getTime();
        const start = parseSafe(w.windowStart).getTime();
        const end   = parseSafe(w.windowEnd).getTime();
        if (slack !== 0 && start !== 0 && end !== 0) {
            assert(slack >= start && slack <= end,
                `slackTime ${w.slackTime} is outside window [${w.windowStart} – ${w.windowEnd}]. ` +
                `Indicates interpolation error in interpolateExtremeTime.`,
                warnings
            );
        }
    }

    // ── 4. Dive score range [0, 100] ──────────────────────────────────────────
    for (const w of windows) {
        const score = w.activityScore?.diving ?? -1;
        assert(score >= 0 && score <= 100,
            `Dive score ${score} for window at ${w.slackTime} is out of [0, 100] range.`,
            warnings
        );
    }

    // ── 5. Tide height at slack within hilo range for that day ────────────────
    if (hilo.length >= 2) {
        const heights = hilo.map(h => h.value).filter(v => isFinite(v));
        const hiloMin = Math.min(...heights);
        const hiloMax = Math.max(...heights);
        const hiloRange = hiloMax - hiloMin;

        for (const w of windows) {
            if (hiloRange > 0.5) { // only check if we have meaningful tidal range
                // Allow ±20% outside hilo range for cosine interpolation rounding
                const lo = hiloMin - hiloRange * 0.2;
                const hi = hiloMax + hiloRange * 0.2;
                assert(w.tideHeight >= lo && w.tideHeight <= hi,
                    `Tide height ${w.tideHeight.toFixed(2)}m at ${w.slackTime} is outside ` +
                    `hilo range [${hiloMin.toFixed(2)}m – ${hiloMax.toFixed(2)}m] ± 20%. ` +
                    `May indicate cosine interpolation issue or mismatched hilo data.`,
                    warnings
                );
            }
        }
    }

    // ── 6. isDaylight consistency ─────────────────────────────────────────────
    // All windows passed the quality filter should be daylight (the filter was applied before here)
    for (const w of windows) {
        if (!w.isDaylight) {
            assert(false,
                `Night window at ${w.slackTime} passed quality filter. ` +
                `Night filter in useDiveWindows may not have worked correctly.`,
                warnings
            );
        }
    }

    // ── 7. Current speed at slack within expected range ────────────────────────
    for (const w of windows) {
        assert(w.currentSpeed >= 0,
            `Negative current speed ${w.currentSpeed} kn at ${w.slackTime}.`,
            warnings
        );
        assert(w.currentSpeed <= 2.0,
            `Current speed ${w.currentSpeed.toFixed(2)} kn at ${w.slackTime} ` +
            `exceeds slack threshold (2.0 kn). Window should have been excluded.`,
            warnings
        );
    }

    const passed = warnings.length === 0;
    if (process.env.NODE_ENV === 'development' && passed) {
        console.info('[MarineAssert] ✅ All assertions passed.');
    }
    return { passed, warnings };
}

/**
 * React hook — runs assertions whenever tides or windows change.
 * Returns assertion results for use in the debug panel or suspect banner.
 */
export function useDataAssertions(
    tides: TideData | null,
    windows: DiveWindow[],
): AssertionResult {
    const result = runDataAssertions(tides, windows);

    useEffect(() => {
        if (!tides || windows.length === 0) return;
        runDataAssertions(tides, windows);
    }, [tides, windows]);

    return result;
}
