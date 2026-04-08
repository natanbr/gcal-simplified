import { useMemo } from 'react';
import type { TideData, DiveWindow, MarineEvent, MarineConditionsSnapshot } from '../types';
import { calculateSlackWindows, interpolateSpeedAt } from '../utils/slackWindows';
import { parseSafe } from '../utils/dateUtils';
import { cosineTideFromHilo } from '../utils/tideMath';
import { getDaylightTimes } from '../utils/solarTimes';

// ── Scoring thresholds & floors ───────────────────────────────────────────────
// Each threshold is the value at which a factor WOULD score 0 (before floor).
// Each floor encodes the safety risk tier:
//   🔴 CRITICAL (current): floor=0  — genuinely dangerous current CAN kill the score
//   🟠 MEDIUM (swell,wind): floor=10 — severe conditions degrade heavily, don't solo-kill
//   🟢 LOW (tide): floor=40          — quality factor; low tide is inconvenient, not dangerous
//
const THRESHOLDS = {
    currentSlack: 1.5,   // kn    — 0-point for current at slack
    currentMax:   1.5,   // kn    — 0-point for max current within window
    currentRamp:  0.4,   // kn/hr — 0-point for rate of change across window
    swell:        2.0,   // m     — 0-point for wave height
    wind:         25,    // kn    — 0-point for surface wind
} as const;

const FACTOR_FLOOR = {
    current: 0,   // 🔴 CRITICAL  — no floor
    swell:   10,  // 🟠 MEDIUM    — extreme swell floors at 10
    wind:    10,  // 🟠 MEDIUM
    tide:    40,  // 🟢 LOW       — low tide = still diveable (>=POOR_SCORE_THRESHOLD)
} as const;

// Missing atmospheric data → neutral (50). Never penalise, never reward.
const NEUTRAL_SCORE = 50;

// Windows scoring below this are hidden from Best Times panel
const POOR_SCORE_THRESHOLD = 40;

interface DiveWindowsInput {
    tides: TideData | null;
    events: MarineEvent[];
    /** Optional: lat/lon of the dive location for on-device sunrise/sunset calc */
    coords?: { lat: number; lng: number };
    /** Optional: Override sunrise/sunset strings (e.g. from parent weather prop) */
    sunrises?: string[];
    sunsets?: string[];
    /**
     * Optional: current conditions snapshot (swell, wind, visibility).
     * When provided, factors 4–7 of the scoring model are computed from real data.
     * When absent, those factors default to NEUTRAL_SCORE (50) — safe fallback.
     */
    snapshot?: Pick<MarineConditionsSnapshot, 'swellHeight' | 'windSpeed' | 'visibilityEst'>;
}

export interface DiveWindowsResult {
    windows: DiveWindow[];
    /** False when solar times could not be determined — windows list will be empty */
    solarAvailable: boolean;
}

/**
 * Derives the list of DiveWindows for display in the Best Times to Dive panel.
 *
 * ## Scoring model: 7-factor min (weakest link)
 *
 * Each factor is normalised to 0–100 based on its threshold sensitivity.
 * The total score = min(all computed factors).
 * This means the WORST factor IS the score — there is no averaging that can
 * mask a dangerous condition.
 *
 * | # | Factor            | Safety level | Formula                             | 0-point |
 * |---|-------------------|-------------|--------------------------------------|---------|
 * | 1 | Current at slack  | 🔴 Critical | 100 × max(0, 1 − speed/1.5)          | 1.5 kn  |
 * | 2 | Max current in window | 🔴 Crit | 100 × max(0, 1 − maxSpeed/1.5)      | 1.5 kn  |
 * | 3 | Current ramp rate | 🟠 High     | 100 × max(0, 1 − |ramp|/0.4)         | 0.4 kn/hr |
 * | 4 | Swell height      | 🟡 Medium   | 100 × max(0, 1 − swellH/2.0)         | 2.0 m   |
 * | 5 | Wind speed        | 🟡 Medium   | 100 × max(0, 1 − windKn/25)          | 25 kn   |
 * | 6 | Tide position     | 🟢 Low      | 100 × (h−min)/(max−min)              | — (range) |
 * | 7 | Visibility (est.) | 🟢 Low      | 100 × clamp(visM/8000, 0, 1)         | — (8km) |
 *
 * ## Filtering rules (non-negotiable)
 *  1. Future only  — slackTime >= now
 *  2. Daylight only — windowStart >= sunrise. Night = zero visibility, always excluded.
 *  3. Quality gate — score >= 40 (FAIR). POOR windows hidden (they are bad dives).
 */
export function useDiveWindows({
    tides, events, coords, sunrises, sunsets, snapshot
}: DiveWindowsInput): DiveWindowsResult {
    return useMemo(() => {
        const hourly = tides?.hourly;
        if (!tides || !hourly?.current_speed?.length) return { windows: [], solarAvailable: true };

        const speeds = hourly.current_speed!;
        const times  = hourly.time;

        // ── Tide heights: CHS wlp → cosine fallback ──────────────────────────
        const rawHeights = hourly.tide_height ?? [];
        const allZero    = rawHeights.length === 0 || rawHeights.every(v => v === 0 || v == null);
        const tideHeights = (allZero && tides.hilo?.length)
            ? cosineTideFromHilo(tides.hilo, times)
            : rawHeights;

        // ── Sunrise/sunset ───────────────────────────────────────────────────
        let effectiveSunrises = sunrises;
        let effectiveSunsets  = sunsets;

        if ((!effectiveSunrises?.length || !effectiveSunsets?.length) && coords) {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const computed = getDaylightTimes(coords.lat, coords.lng, startOfToday, 10);
            effectiveSunrises = computed.sunrises;
            effectiveSunsets  = computed.sunsets;
        }

        // ── HARD BLOCK: Cannot determine daylight without solar times ─────────
        const solarAvailable = !!(effectiveSunrises?.length && effectiveSunsets?.length);
        if (!solarAvailable) {
            console.warn('[useDiveWindows] Solar times unavailable — blocking all windows.');
            return { windows: [], solarAvailable: false };
        }

        // ── Slack indices ────────────────────────────────────────────────────
        const slackIndices: number[] = [];
        for (const evt of events) {
            if (evt.type !== 'Slack') continue;
            const idx = times.findIndex(t => t.startsWith(evt.time.substring(0, 13)));
            if (idx !== -1) slackIndices.push(idx);
        }
        if (slackIndices.length === 0) return { windows: [], solarAvailable: true };

        // ── Slack windows ────────────────────────────────────────────────────
        const slackWindows = calculateSlackWindows(
            times, speeds, tideHeights, slackIndices, effectiveSunrises, effectiveSunsets
        );

        const now = new Date();

        // ── Tide range for factor 6 ──────────────────────────────────────────
        const validHeights = tideHeights.filter(h => !Number.isNaN(h ?? NaN));
        const maxTide = validHeights.length ? Math.max(...validHeights) : 1;
        const minTide = validHeights.length ? Math.min(...validHeights) : 0;
        const tideRange = maxTide - minTide || 1;

        // ── Atmospheric factors (4, 5) — snapshot-derived ────────────────────
        // If snapshot is absent, defaults to NEUTRAL_SCORE (50).
        // Floors applied per safety tier — swell/wind CAN degrade heavily,
        // but not solo-kill the window (medium risk, not critical).
        const swellFactor = snapshot?.swellHeight != null
            ? Math.max(FACTOR_FLOOR.swell, (1 - snapshot.swellHeight / THRESHOLDS.swell) * 100)
            : NEUTRAL_SCORE;

        const windFactor = snapshot?.windSpeed != null
            ? Math.max(FACTOR_FLOOR.wind, (1 - snapshot.windSpeed / THRESHOLDS.wind) * 100)
            : NEUTRAL_SCORE;

        // Note: visibility is NOT a separate scoring factor.
        // It is derived from swell+wind and including it would double-penalise.

        // ── Map + score each window ──────────────────────────────────────────
        const result = slackWindows
            .filter(w => parseSafe(w.slackTime) >= now)
            .map(w => {
                // ── isDaylight (from windowStart, not slackTime) ─────────────
                let isDaylight = false;
                const windowStartDate = parseSafe(w.windowStart);
                const dayStr          = w.windowStart.substring(0, 10);
                const sunriseStr = effectiveSunrises!.find(s => s.startsWith(dayStr));
                const sunsetStr  = effectiveSunsets!.find(s  => s.startsWith(dayStr));
                if (sunriseStr && sunsetStr) {
                    isDaylight = windowStartDate >= parseSafe(sunriseStr) && windowStartDate <= parseSafe(sunsetStr);
                }

                // ── Current at window boundaries (factors 2, 3) ──────────────
                const currentAtStart = interpolateSpeedAt(times, speeds, w.windowStart);
                const currentAtEnd   = interpolateSpeedAt(times, speeds, w.windowEnd);
                const durationHours  = w.duration / 60;
                const currentRampRate = durationHours > 0
                    ? (currentAtEnd - currentAtStart) / durationHours
                    : 0;

                // Max current within the window for factor 2
                const startIdx = Math.max(0, times.findIndex(t => t >= w.windowStart));
                const endIdxRaw = times.findIndex(t => t >= w.windowEnd);
                const endIdx = endIdxRaw !== -1
                    ? Math.min(times.length - 1, endIdxRaw)
                    : times.length - 1;
                const windowSpeeds = speeds.slice(
                    Math.min(startIdx, endIdx),
                    Math.max(startIdx, endIdx) + 1
                );
                const maxCurrentInWindow = windowSpeeds.length
                    ? Math.max(currentAtStart, currentAtEnd, ...windowSpeeds)
                    : Math.max(currentAtStart, currentAtEnd, w.currentSpeed);

                // ── 6-factor min scoring (weakest link) ──────────────────────
                // 🔴 CRITICAL — floor=0, CAN kill the score
                const f1Current    = Math.max(FACTOR_FLOOR.current, (1 - w.currentSpeed / THRESHOLDS.currentSlack) * 100);
                const f2MaxCurrent = Math.max(FACTOR_FLOOR.current, (1 - maxCurrentInWindow / THRESHOLDS.currentMax) * 100);
                const f3Ramp       = Math.max(FACTOR_FLOOR.current, (1 - Math.abs(currentRampRate) / THRESHOLDS.currentRamp) * 100);
                // 🟠 MEDIUM — floored at 10 (snapshot or neutral)
                const f4Swell = swellFactor;
                const f5Wind  = windFactor;
                // 🟢 LOW — floored at 40 (quality factor, not safety)
                const f6Tide  = Math.max(FACTOR_FLOOR.tide, ((w.tideHeight - minTide) / tideRange) * 100);

                const divingScore = Math.round(
                    Math.min(f1Current, f2MaxCurrent, f3Ramp, f4Swell, f5Wind, f6Tide)
                );

                const diveWindow: DiveWindow = {
                    slackTime:       w.slackTime,
                    windowStart:     w.windowStart,
                    windowEnd:       w.windowEnd,
                    duration:        w.duration,
                    currentSpeed:    w.currentSpeed,
                    currentAtStart,
                    currentAtEnd,
                    currentRampRate,
                    tideHeight:      w.tideHeight,
                    isHighTide:      w.isHighTide,
                    isDaylight,
                    activityScore: { diving: divingScore, surfing: 0 },
                };
                return diveWindow;
            })
            // ── Hard filters ─────────────────────────────────────────────────
            .filter(w => w.isDaylight)
            .filter(w => w.activityScore.diving >= POOR_SCORE_THRESHOLD);

        return { windows: result, solarAvailable: true };
    }, [tides, events, coords, sunrises, sunsets, snapshot]);
}
