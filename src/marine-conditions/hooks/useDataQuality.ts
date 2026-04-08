import { useMemo } from 'react';
import type { TideData } from '../types';
import { parseSafe } from '../utils/dateUtils';

export interface DataQualityResult {
    /** false → show <DataErrorState>, hide dashboard entirely */
    isValid: boolean;
    /** true → show <SuspectDataBanner> but still render data */
    isSuspect: boolean;
    /** Human-readable list of issues, for banners and devtools */
    issues: string[];
}

/**
 * Validates TideData quality after every fetch.
 *
 * Two-level result:
 *  - isValid=false   → data is fundamentally unusable (missing currents, too short, etc.)
 *  - isSuspect=true  → data loaded but has one or more quality concerns (still show with warning)
 *
 * Validation rules are based on CHS/Open-Meteo knowledge for BC coastal stations:
 * - Race Passage / Active Pass: peak current typically 2–5 kn
 * - BC tidal range: typically 1.5–5m for southern Vancouver Island
 * - Semidiurnal tides: expect 2 High + 2 Low per day (4 hilo events/day)
 */
export function useDataQuality(data: TideData | null): DataQualityResult {
    return useMemo(() => {
        const issues: string[] = [];

        // ── Null check ────────────────────────────────────────────────────────
        if (!data) {
            return { isValid: false, isSuspect: false, issues: ['No data'] };
        }

        const { hourly, hilo } = data;

        // ── P0: Current speed required ─────────────────────────────────────────
        // Without current data we cannot calculate safe dive windows.
        const speeds = hourly?.current_speed ?? [];
        if (speeds.length === 0) {
            return {
                isValid: false,
                isSuspect: false,
                issues: ['Current speed data missing — dive windows cannot be calculated'],
            };
        }

        // ── P0: Minimum data duration ──────────────────────────────────────────
        // CHS fetch covers ~7 days (168h). Anything under 48h is an incomplete fetch.
        const MIN_HOURLY_SLOTS = 48;
        const times = hourly?.time ?? [];
        if (times.length < MIN_HOURLY_SLOTS) {
            return {
                isValid: false,
                isSuspect: false,
                issues: [`Insufficient data: only ${times.length}h of hourly data (need ≥48h)`],
            };
        }

        // ── P0: Time continuity — no gaps > 2h ────────────────────────────────
        const MAX_GAP_MS = 2 * 60 * 60 * 1000;
        for (let i = 1; i < times.length; i++) {
            const prev = parseSafe(times[i - 1]).getTime();
            const curr = parseSafe(times[i]).getTime();
            if (prev && curr && (curr - prev) > MAX_GAP_MS) {
                return {
                    isValid: false,
                    isSuspect: false,
                    issues: [`Gap in hourly data at index ${i}: ${times[i - 1]} → ${times[i]}`],
                };
            }
        }

        // From here: data is fundamentally usable. Check for "suspect" conditions.
        let isSuspect = false;

        // ── Suspect: Peak current too low ─────────────────────────────────────
        // Race Passage / Active Pass should see >2kn peak. <0.5kn = almost certainly
        // Open-Meteo ocean currents (not tidal), or stale station data.
        const maxSpeed = Math.max(...speeds.filter(s => isFinite(s)));
        if (maxSpeed < 0.5) {
            issues.push(`Peak current is ${maxSpeed.toFixed(2)}kn — OpenMeteo data or stale station (expected >2kn for CHS currents)`);
            isSuspect = true;
        } else if (maxSpeed < 2.0) {
            issues.push(`Peak current ${maxSpeed.toFixed(2)}kn seems low for this station (expected 2–5kn for Race Passage/Active Pass)`);
            isSuspect = true;
        }

        // ── Suspect: Tide height range ─────────────────────────────────────────
        if (hilo && hilo.length > 0) {
            const tideHeights = hilo
                .filter(h => ['High', 'Low', 'High Tide', 'Low Tide'].includes(h.type))
                .map(h => h.value)
                .filter(v => typeof v === 'number' && isFinite(v));

            if (tideHeights.length > 0) {
                const maxH = Math.max(...tideHeights);
                const minH = Math.min(...tideHeights);

                // BC southern coastal: realistic range -0.5m to 5.5m (MLLW reference)
                if (maxH > 6.0) {
                    issues.push(`Suspiciously high tide: ${maxH.toFixed(2)}m (expected ≤6m for BC coast)`);
                    isSuspect = true;
                }
                if (minH < -1.0) {
                    issues.push(`Suspiciously low tide: ${minH.toFixed(2)}m (expected ≥-1m for BC coast)`);
                    isSuspect = true;
                }

                const tideRange = maxH - minH;
                if (tideRange < 0.5) {
                    issues.push(`Tidal range is only ${tideRange.toFixed(2)}m — High/Low classification may be unreliable`);
                    isSuspect = true;
                }
            }

            // ── Suspect: hilo must alternate High/Low ─────────────────────────
            const tideEvents = hilo.filter(h =>
                ['High', 'Low', 'High Tide', 'Low Tide'].includes(h.type)
            );
            for (let i = 1; i < tideEvents.length; i++) {
                const prev = tideEvents[i - 1].type.includes('High') ? 'High' : 'Low';
                const curr = tideEvents[i].type.includes('High') ? 'High' : 'Low';
                if (prev === curr) {
                    issues.push(`hilo sequence violation at index ${i}: two consecutive ${curr} events`);
                    isSuspect = true;
                    break; // one report is enough
                }
            }

            // ── Suspect: hilo coverage ────────────────────────────────────────
            // We expect at least 2 days of hilo events ahead
            const now = Date.now();
            const futureHilos = hilo.filter(h => parseSafe(h.time).getTime() > now);
            if (futureHilos.length < 4) {
                issues.push(`Only ${futureHilos.length} future hilo events — data may be incomplete (expected ≥4 for 48h)`);
                isSuspect = true;
            }
        }

        // ── Suspect: Score sanity check ────────────────────────────────────────
        // (spot-check: ensure current_direction values, if present, are in 0–360)
        const dirs = hourly?.current_direction ?? [];
        const badDir = dirs.find(d => d != null && (d < 0 || d > 360));
        if (badDir !== undefined) {
            issues.push(`Out-of-range current direction: ${badDir}° (expected 0–360)`);
            isSuspect = true;
        }

        // ── Suspect: Cosine fallback detection ────────────────────────────────
        // If CHS wlp returned all zeros (failed/empty) but we have hilo data,
        // the frontend will use cosineTideFromHilo as a fallback. Flag this so
        // users know tide heights are modeled, not official CHS wlp data.
        const tideHeights = hourly?.tide_height ?? [];
        const allTideZero = tideHeights.length > 0 && tideHeights.every(h => h === 0);
        const hasHilo     = (hilo?.length ?? 0) > 0;
        if (allTideZero && hasHilo) {
            issues.push('CHS wlp tide heights all zero — cosine interpolation from hilo will be used (modeled, not official)');
            isSuspect = true;
        }

        return { isValid: true, isSuspect, issues };
    }, [data]);
}
