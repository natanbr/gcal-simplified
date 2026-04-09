import { useMemo } from 'react';
import type { TideData, DiveWindow, MarineEvent, MarineConditionsSnapshot } from '../types';
import { calculateSlackWindows, interpolateSpeedAt } from '../utils/slackWindows';
import { parseSafe, utcToLocalPrefix } from '../utils/dateUtils';
import { cosineTideFromHilo } from '../utils/tideMath';
import { getDaylightTimes } from '../utils/solarTimes';

// ── Hard No-Go Limits ─────────────────────────────────────────────────────────
// If any of these are triggered, the window is excluded entirely.
// Source: expert spearfishing strategy / hydrography_data_engineer SKILL.md

const NO_GO = {
    currentAtSlack:      1.5,  // kn — cannot safely swim or recover float line
    maxCurrentInWindow:  3.0,  // kn — post-slack ramp-up too fast, no safe entry
    windSpeed:           20,   // kn — surface chop hides diver buoy
    swellHeight:         1.5,  // m  — shore surge rock-strike risk (tighter than diving)
} as const;

// ── Q Score normalisation ─────────────────────────────────────────────────────
// Q_MAX = +3 (all-flood V) + 2 (golden hour) + 2 (sweet spot) + 1 (moon)  = +8
// Q_MIN = −1 (all-ebb V)  + 0 (no bonuses)  − 2 (wind@20kn)  − 2 (swell<6s) = −5
export const SPEARFISHING_Q_MIN   = -5;
export const SPEARFISHING_Q_MAX   =  8;
export const SPEARFISHING_Q_RANGE = SPEARFISHING_Q_MAX - SPEARFISHING_Q_MIN; // 13

// ── Q Level thresholds (label-based, replaces 0-100 display) ──────────────────
// Raw Q maps to a named level shown in the card and debug panel.
// The 0-100 score is still used internally for score-bar fill and sorting.
export type QLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unproductive';

const Q_LEVELS: Array<{ min: number; level: QLevel; description: string }> = [
    { min:  6, level: 'excellent',    description: 'Perfect visibility (Flood tide), low wind, optimal swell period, and golden hour.' },
    { min:  3, level: 'good',         description: 'Safe, productive conditions with minor visibility or wind trade-offs.' },
    { min:  0, level: 'fair',         description: 'Diveable, but expect to work harder. Likely average swell or Ebb tide visibility.' },
    { min: -3, level: 'poor',         description: 'Low visibility, high wind, or short swell periods making it "washy".' },
    { min: Number.NEGATIVE_INFINITY, level: 'unproductive', description: 'Technically safe (within limits), but visibility is likely zero or surface conditions are very rough.' },
];

export function getQLevel(qRaw: number): { level: QLevel; description: string } {
    return Q_LEVELS.find(t => qRaw >= t.min)!;
}

// Golden Hour window: ±1h around sunrise / sunset
const GOLDEN_HOUR_MS = 3_600_000;

// ── Moon phase (local math — no API needed) ───────────────────────────────────
// The synodic period is deterministic — no external data required.
// Reference: verified new moon at 2000-01-06 18:14 UTC (standard astronomical epoch).
const SYNODIC_DAYS    = 29.530588853;
const REF_NEW_MOON_MS = new Date('2000-01-06T18:14:00Z').getTime();
// ±3 calendar days around new/full moon as a phase fraction
const MOON_BONUS_FRAC = 3 / SYNODIC_DAYS; // ≈ 0.1016

function getMoonPhaseFraction(date: Date): number {
    const days = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
    return ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS / SYNODIC_DAYS;
}

function getMoonBonus(date: Date): { bonus: boolean; label: string } {
    const phase = getMoonPhaseFraction(date);
    const nearNew  = phase < MOON_BONUS_FRAC || phase > (1 - MOON_BONUS_FRAC);
    const nearFull = Math.abs(phase - 0.5) < MOON_BONUS_FRAC;
    if (nearNew)  return { bonus: true,  label: '🌑 New Moon +1' };
    if (nearFull) return { bonus: true,  label: '🌕 Full Moon +1' };
    return { bonus: false, label: '' };
}

// ── Swell period penalty — 3-tier ─────────────────────────────────────────────
function getSwellPeriodPenalty(period: number | undefined): { penalty: number; reason: string } {
    if (period == null || period <= 0) return { penalty: 0, reason: '' };
    if (period < 6)  return { penalty: 2, reason: `🌊 Swell ${period.toFixed(0)}s (washy) −2` };
    if (period <= 8) return { penalty: 1, reason: `🌊 Swell ${period.toFixed(0)}s (acceptable) −1` };
    return { penalty: 0, reason: '' };
}

// ── Wind penalty ──────────────────────────────────────────────────────────────
function getWindPenalty(windKn: number | undefined): { penalty: number; reason: string } {
    const wKn     = windKn ?? 0;
    const penalty = Math.floor(Math.max(0, wKn - 10) / 5);
    if (penalty === 0) return { penalty: 0, reason: '' };
    return { penalty, reason: `💨 Wind ${wKn.toFixed(0)}kn −${penalty}` };
}

// ── Weighted tide direction (flood fraction) ──────────────────────────────────
/**
 * Returns the fraction of hourly bins inside the window where the tide is rising.
 * 1.0 = pure flood, 0.0 = pure ebb, 0.5 = neutral / unknown.
 * Used to compute V_pts = −1 + 4×floodFraction  ∈  [−1, +3].
 */
function computeFloodFraction(
    times: string[],
    tideHeights: number[],
    windowStart: string,
    windowEnd: string,
): number {
    const startIdxRaw = times.findIndex(t => t >= windowStart);
    const startIdx    = startIdxRaw !== -1 ? startIdxRaw : 0;
    const endIdxRaw   = times.findIndex(t => t >  windowEnd);
    const endIdx      = endIdxRaw !== -1
        ? Math.min(times.length - 1, endIdxRaw)
        : times.length - 1;

    if (startIdx >= endIdx) return 0.5;

    let rising = 0;
    let total  = 0;
    for (let i = startIdx; i < endIdx; i++) {
        const h0 = tideHeights[i];
        const h1 = tideHeights[i + 1];
        if (h0 != null && h1 != null && isFinite(h0) && isFinite(h1)) {
            total++;
            if (h1 > h0) rising++;
        }
    }
    return total > 0 ? rising / total : 0.5;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpearfishingWindowsInput {
    tides: TideData | null;
    events: MarineEvent[];
    /** Optional: lat/lon for on-device sunrise/sunset fallback */
    coords?: { lat: number; lng: number };
    sunrises?: string[];
    sunsets?: string[];
    /**
     * Current conditions snapshot.
     * Used for W_penalty (wind, swell) and global No-Go checks.
     */
    snapshot?: Pick<MarineConditionsSnapshot, 'swellHeight' | 'swellPeriod' | 'windSpeed'>;
}

export interface SpearfishingWindowsResult {
    windows: DiveWindow[];
    /** False when solar times could not be determined — windows list will be empty */
    solarAvailable: boolean;
}

/**
 * Derives the list of DiveWindows for the **Spearfishing** "Best Times" panel.
 *
 * The underlying slack water windows are the **same events** used by useDiveWindows
 * (both call calculateSlackWindows with the same data). What differs is:
 *  1. No-Go filters — stricter thresholds for spearfishing safety
 *  2. Score formula — Q = (V_pts + F_pts) − W_penalty  (not the diving min-model)
 *  3. Labels — "Shot Quality" not "Dive Quality"
 *
 * ## Scoring model: Q = (V_pts + F_pts) − W_penalty
 *
 * ### A. Visibility Points (V_pts) — weighted flood fraction
 *   floodFraction ∈ [0,1] across window → V_pts = −1 + 4×floodFraction ∈ [−1, +3]
 *   e.g. 70% flood / 30% ebb → V_pts = −1 + 4×0.7 = +1.8
 *
 * ### B. Fish Activity Points (F_pts)
 *   +2 : Golden Hour (slackTime within ±1h of sunrise OR sunset)
 *   +2 : Sweet Spot Current (0.5kn ≤ currentSpeed ≤ 1.2kn)
 *   +1 : New / Full Moon (±3 days — computed locally via synodic period, no API)
 *
 * ### C. Weather Penalty (W_penalty) — snapshot-level, applies to all windows
 *   −1 per 5kn of wind above 10kn (floor)
 *   −2 if swell period < 6s  (washy)
 *   −1 if swell period 6–8s  (acceptable but suboptimal)
 *
 * Q is normalised to 0–100 for display consistency with the rest of the UI.
 *
 * ## Hard No-Go Filters (window excluded entirely if any triggered)
 *   Global:     wind > 20kn  OR  swell > 1.5m  → all windows blocked
 *   Per-window: currentAtSlack > 1.5kn  OR  maxCurrentInWindow > 3.0kn
 *   Daylight:   windowStart outside [sunrise, sunset]
 */
export function useSpearfishingWindows({
    tides, events, coords, sunrises, sunsets, snapshot,
}: SpearfishingWindowsInput): SpearfishingWindowsResult {
    return useMemo(() => {
        const hourly = tides?.hourly;
        if (!tides || !hourly?.current_speed?.length) return { windows: [], solarAvailable: true };

        const speeds = hourly.current_speed!;
        const times  = hourly.time;

        // ── Tide heights ─────────────────────────────────────────────────────
        const rawHeights  = hourly.tide_height ?? [];
        const allZero     = rawHeights.length === 0 || rawHeights.every(v => v === 0 || v == null);
        const tideHeights = (allZero && tides.hilo?.length)
            ? cosineTideFromHilo(tides.hilo, times)
            : rawHeights;

        // ── Sunrise / sunset ─────────────────────────────────────────────────
        let effectiveSunrises = sunrises;
        let effectiveSunsets  = sunsets;

        if ((!effectiveSunrises?.length || !effectiveSunsets?.length) && coords) {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const computed = getDaylightTimes(coords.lat, coords.lng, startOfToday, 10);
            effectiveSunrises = computed.sunrises;
            effectiveSunsets  = computed.sunsets;
        }

        const solarAvailable = !!(effectiveSunrises?.length && effectiveSunsets?.length);
        if (!solarAvailable) {
            console.warn('[useSpearfishingWindows] Solar times unavailable — blocking all windows.');
            return { windows: [], solarAvailable: false };
        }

        // ── Global No-Go: wind / swell block ALL windows ─────────────────────
        const globalWindNoGo  = (snapshot?.windSpeed  ?? 0) > NO_GO.windSpeed;
        const globalSwellNoGo = (snapshot?.swellHeight ?? 0) > NO_GO.swellHeight;
        if (globalWindNoGo || globalSwellNoGo) return { windows: [], solarAvailable: true };

        // ── Slack indices (same source as useDiveWindows) ────────────────────
        const slackIndices: number[] = [];
        for (const evt of events) {
            if (evt.type !== 'Slack') continue;
            const localPrefix = utcToLocalPrefix(evt.time).substring(0, 13);
            const idx = times.findIndex(t => t.startsWith(localPrefix));
            if (idx !== -1) slackIndices.push(idx);
        }
        if (slackIndices.length === 0) return { windows: [], solarAvailable: true };

        // ── Raw slack windows (identical algorithm to useDiveWindows) ─────────
        const slackWindows = calculateSlackWindows(
            times, speeds, tideHeights, slackIndices, effectiveSunrises, effectiveSunsets
        );

        const now = new Date();

        // ── W_penalty — snapshot-level, same for every window ────────────────
        const swellPen = getSwellPeriodPenalty(snapshot?.swellPeriod);
        const windPen  = getWindPenalty(snapshot?.windSpeed);
        const wPenalty = windPen.penalty + swellPen.penalty;
        const wReasons = [windPen.reason, swellPen.reason].filter(Boolean);

        // ── Score + filter each window ────────────────────────────────────────
        const result = slackWindows
            .filter(w => parseSafe(w.slackTime) >= now)
            .map(w => {
                // Daylight check
                let isDaylight    = false;
                let sunriseDt: Date | null = null;
                let sunsetDt:  Date | null = null;
                const windowStartDate = parseSafe(w.windowStart);
                const dayStr          = w.windowStart.substring(0, 10);
                const sunriseStr = effectiveSunrises!.find(s => s.startsWith(dayStr));
                const sunsetStr  = effectiveSunsets!.find(s => s.startsWith(dayStr));

                if (sunriseStr && sunsetStr) {
                    sunriseDt  = parseSafe(sunriseStr);
                    sunsetDt   = parseSafe(sunsetStr);
                    isDaylight = windowStartDate >= sunriseDt && windowStartDate <= sunsetDt;
                }

                // Boundary currents
                const currentAtStart  = interpolateSpeedAt(times, speeds, w.windowStart);
                const currentAtEnd    = interpolateSpeedAt(times, speeds, w.windowEnd);
                const durationHours   = w.duration / 60;
                const currentRampRate = durationHours > 0
                    ? (currentAtEnd - currentAtStart) / durationHours
                    : 0;

                // Max current in window (per-window No-Go check)
                const startIdx  = Math.max(0, times.findIndex(t => t >= w.windowStart));
                const endIdxRaw = times.findIndex(t => t >= w.windowEnd);
                const endIdx    = endIdxRaw !== -1
                    ? Math.min(times.length - 1, endIdxRaw)
                    : times.length - 1;
                const windowSpeeds = speeds.slice(
                    Math.min(startIdx, endIdx),
                    Math.max(startIdx, endIdx) + 1
                );
                const maxCurrentInWindow = windowSpeeds.length
                    ? Math.max(currentAtStart, currentAtEnd, ...windowSpeeds)
                    : Math.max(currentAtStart, currentAtEnd, w.currentSpeed);

                const isNoGo =
                    w.currentSpeed     > NO_GO.currentAtSlack ||
                    maxCurrentInWindow > NO_GO.maxCurrentInWindow;

                // ── A. V_pts — weighted flood fraction ────────────────────────
                // V_pts = −1 + 4×floodFraction  →  range [−1, +3]
                const floodFraction = computeFloodFraction(times, tideHeights, w.windowStart, w.windowEnd);
                const vPtsRaw       = -1 + 4 * floodFraction;
                const vPts          = parseFloat(vPtsRaw.toFixed(2));
                const floodPct      = Math.round(floodFraction * 100);
                const vReason       = `Flood ${floodPct}% / Ebb ${100 - floodPct}% → ${vPts >= 0 ? '+' : ''}${vPts.toFixed(1)}`;

                // ── B. F_pts — fish activity bonuses ─────────────────────────
                let fPts = 0;
                const fReasons: string[] = [];

                // Golden Hour
                if (sunriseDt && sunsetDt) {
                    const slackMs     = parseSafe(w.slackTime).getTime();
                    const nearSunrise = Math.abs(slackMs - sunriseDt.getTime()) <= GOLDEN_HOUR_MS;
                    const nearSunset  = Math.abs(slackMs - sunsetDt.getTime())  <= GOLDEN_HOUR_MS;
                    if (nearSunrise || nearSunset) {
                        fPts += 2;
                        fReasons.push(nearSunrise ? '🌅 Golden Hour (sunrise) +2' : '🌇 Golden Hour (sunset) +2');
                    }
                }

                // Sweet Spot Current
                if (w.currentSpeed >= 0.5 && w.currentSpeed <= 1.2) {
                    fPts += 2;
                    fReasons.push(`🎣 Sweet Spot ${w.currentSpeed.toFixed(1)}kn +2`);
                }

                // Moon phase (local math — no API needed)
                const moon = getMoonBonus(parseSafe(w.slackTime));
                if (moon.bonus) {
                    fPts += 1;
                    fReasons.push(moon.label);
                }

                // ── C. Q score ────────────────────────────────────────────────
                const qRaw            = parseFloat((vPts + fPts - wPenalty).toFixed(2));
                const spearfishingScore = Math.round(
                    Math.max(0, Math.min(100, ((qRaw - SPEARFISHING_Q_MIN) / SPEARFISHING_Q_RANGE) * 100))
                );

                const diveWindow: DiveWindow = {
                    slackTime:      w.slackTime,
                    windowStart:    w.windowStart,
                    windowEnd:      w.windowEnd,
                    duration:       w.duration,
                    currentSpeed:   w.currentSpeed,
                    currentAtStart,
                    currentAtEnd,
                    currentRampRate,
                    tideHeight:     w.tideHeight,
                    isHighTide:     w.isHighTide,
                    isDaylight,
                    activityScore: {
                        diving:       0,
                        spearfishing: spearfishingScore,
                        surfing:      0,
                    },
                    spearfishingBreakdown: (() => {
                        const { level, description } = getQLevel(qRaw);
                        return {
                            vPts,
                            fPts,
                            wPenalty,
                            qRaw,
                            floodFraction,
                            vReason,
                            fReasons,
                            wReasons,
                            qLevel:       level,
                            qDescription: description,
                        };
                    })(),
                };

                return { window: diveWindow, isNoGo };
            })
            .filter(({ window: w, isNoGo }) => w.isDaylight && !isNoGo)
            .map(({ window: w }) => w);

        return { windows: result, solarAvailable: true };
    }, [tides, events, coords, sunrises, sunsets, snapshot]);
}
