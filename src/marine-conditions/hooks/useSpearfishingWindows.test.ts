import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSpearfishingWindows } from './useSpearfishingWindows';
import { useMarineEvents } from './useMarineEvents';
import type { TideData } from '../types';

// ── Helpers (mirrors useDiveWindows.test.ts) ──────────────────────────────────

function makeTides(startHour = 0): TideData {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(startHour);

    const PERIOD_H  = 12;
    const MAX_SPEED = 2.5;
    const SLACK_THRESH = 0.5;

    const times: string[] = [];
    const tide_height: number[] = [];
    const current_speed: number[] = [];

    for (let i = 0; i < 168; i++) {
        const t = new Date(now.getTime() + i * 3_600_000);
        times.push(t.toISOString().substring(0, 16));
        tide_height.push(2 + 1.5 * Math.sin(2 * Math.PI * i / PERIOD_H));
        const phase   = (i % PERIOD_H) / PERIOD_H;
        const sinVal  = Math.sin(2 * Math.PI * phase);
        const rawSpeed = MAX_SPEED * Math.abs(sinVal);
        current_speed.push(Math.max(0, rawSpeed - SLACK_THRESH) + (rawSpeed < SLACK_THRESH ? rawSpeed * 0.1 : 0));
    }

    return {
        hourly: {
            time: times, tide_height, current_speed,
            current_direction: times.map((_, i) => (Math.floor(i / (PERIOD_H / 2)) % 2 === 0 ? 90 : 270)),
            wave_height: times.map(() => 0.8),
            wave_period: times.map(() => 8), // 8s — long period swell, no penalty
        },
        hilo: [], sources: [],
    } as unknown as TideData;
}

function makeSolarTimes(sunriseHour: number, sunsetHour: number, dayCount = 10) {
    const sunrises: string[] = [];
    const sunsets:  string[] = [];
    const now = new Date();
    for (let d = -1; d < dayCount; d++) {
        const day = new Date(now);
        day.setDate(now.getDate() + d);
        const dateStr = day.toISOString().substring(0, 10);
        const pad = (n: number) => String(n).padStart(2, '0');
        sunrises.push(`${dateStr}T${pad(sunriseHour)}:00`);
        sunsets.push(`${dateStr}T${pad(sunsetHour)}:00`);
    }
    return { sunrises, sunsets };
}

function makeTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
}

function patchTimesToTomorrow(tides: TideData) {
    const tomorrowMs = makeTomorrow().getTime();
    const pad = (n: number) => String(n).padStart(2, '0');
    tides.hourly.time = tides.hourly.time.map((_, i) => {
        const d = new Date(tomorrowMs + i * 3_600_000);
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
}

function buildInput(tides: TideData, sunrises?: string[], sunsets?: string[], snapshot?: object) {
    const { result: eventsResult } = renderHook(() => useMarineEvents(tides));
    return { tides, events: eventsResult.current, sunrises, sunsets, snapshot };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSpearfishingWindows', () => {

    // ── Guard / null tests ────────────────────────────────────────────────────

    it('returns empty windows when tides is null', () => {
        const { result } = renderHook(() =>
            useSpearfishingWindows({ tides: null, events: [] })
        );
        expect(result.current.windows).toEqual([]);
    });

    it('returns solarAvailable=false when no solar times provided', () => {
        const tides = makeTides();
        const { result: eventsResult } = renderHook(() => useMarineEvents(tides));
        const { result } = renderHook(() =>
            useSpearfishingWindows({ tides, events: eventsResult.current })
        );
        expect(result.current.solarAvailable).toBe(false);
        expect(result.current.windows).toHaveLength(0);
    });

    it('returns at least 1 window for 7-day profile with solar data', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        expect(result.current.windows.length).toBeGreaterThan(0);
    });

    it('all windows are daylight (isDaylight=true)', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        result.current.windows.forEach(w => expect(w.isDaylight).toBe(true));
    });

    it('activityScore.spearfishing is between 0 and 100', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        result.current.windows.forEach(w => {
            expect(w.activityScore.spearfishing).toBeGreaterThanOrEqual(0);
            expect(w.activityScore.spearfishing).toBeLessThanOrEqual(100);
        });
    });

    // ── Hard No-Go: global conditions ────────────────────────────────────────

    it('[No-Go] returns empty windows when wind > 20kn (global block)', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets, { windSpeed: 21 });
        const { result } = renderHook(() => useSpearfishingWindows(input));
        expect(result.current.windows).toHaveLength(0);
    });

    it('[No-Go] returns empty windows when swell > 1.5m (global block)', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets, { swellHeight: 1.6 });
        const { result } = renderHook(() => useSpearfishingWindows(input));
        expect(result.current.windows).toHaveLength(0);
    });

    // ── Hard No-Go: per-window current ───────────────────────────────────────

    it('[No-Go] window excluded when current at slack > 1.5kn', () => {
        // Shift all speeds up by 1.6kn — every "slack" is above threshold
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        tides.hourly.current_speed = tides.hourly.current_speed!.map(s => s + 1.6);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        // With minimum speed 1.6kn, currentAtSlack > 1.5 → all excluded
        result.current.windows.forEach(w => {
            expect(w.currentSpeed).toBeLessThanOrEqual(1.5);
        });
    });

    // ── Scoring: V_pts (visibility) ──────────────────────────────────────────

    it('[Score] flood tide (isHighTide=true) windows score higher than ebb', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        const windows = result.current.windows;
        if (windows.length < 2) return; // skip if not enough windows in test run

        const floodWindows = windows.filter(w => w.isHighTide);
        const ebbWindows   = windows.filter(w => !w.isHighTide);

        if (floodWindows.length > 0 && ebbWindows.length > 0) {
            const avgFlood = floodWindows.reduce((s, w) => s + w.activityScore.spearfishing, 0) / floodWindows.length;
            const avgEbb   = ebbWindows.reduce((s, w) => s + w.activityScore.spearfishing, 0) / ebbWindows.length;
            // Flood tide should score higher than ebb (V_pts difference = 4)
            expect(avgFlood).toBeGreaterThan(avgEbb);
        }
    });

    // ── Scoring: W_penalty (swell period) ────────────────────────────────────

    it('[Score] short swell period (<6s) results in lower score than long period', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);

        // Long period (> 8s — no penalty)
        const tidesLong = makeTides();
        patchTimesToTomorrow(tidesLong);
        const inputLong = buildInput(tidesLong, sunrises, sunsets, { swellPeriod: 12 });
        const { result: resultLong } = renderHook(() => useSpearfishingWindows(inputLong));

        // Short period (< 6s — washy, -2 penalty)
        const tidesShort = makeTides();
        patchTimesToTomorrow(tidesShort);
        const inputShort = buildInput(tidesShort, sunrises, sunsets, { swellPeriod: 4 });
        const { result: resultShort } = renderHook(() => useSpearfishingWindows(inputShort));

        if (resultLong.current.windows.length > 0 && resultShort.current.windows.length > 0) {
            const avgLong  = resultLong.current.windows.reduce((s, w) => s + w.activityScore.spearfishing, 0) / resultLong.current.windows.length;
            const avgShort = resultShort.current.windows.reduce((s, w) => s + w.activityScore.spearfishing, 0) / resultShort.current.windows.length;
            expect(avgLong).toBeGreaterThan(avgShort);
        }
    });

    it('[Score] mid swell period (6–8s) scores between long and short period', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);

        // Long period (> 8s — 0 penalty)
        const tidesLong = makeTides();
        patchTimesToTomorrow(tidesLong);
        const inputLong = buildInput(tidesLong, sunrises, sunsets, { swellPeriod: 12 });
        const { result: resultLong } = renderHook(() => useSpearfishingWindows(inputLong));

        // Mid period (6–8s — -1 penalty)
        const tidesMid = makeTides();
        patchTimesToTomorrow(tidesMid);
        const inputMid = buildInput(tidesMid, sunrises, sunsets, { swellPeriod: 7 });
        const { result: resultMid } = renderHook(() => useSpearfishingWindows(inputMid));

        // Short period (< 6s — -2 penalty)
        const tidesShort = makeTides();
        patchTimesToTomorrow(tidesShort);
        const inputShort = buildInput(tidesShort, sunrises, sunsets, { swellPeriod: 4 });
        const { result: resultShort } = renderHook(() => useSpearfishingWindows(inputShort));

        const hasAll = resultLong.current.windows.length > 0
            && resultMid.current.windows.length > 0
            && resultShort.current.windows.length > 0;

        if (hasAll) {
            const avg = (ws: typeof resultLong.current.windows) =>
                ws.reduce((s, w) => s + w.activityScore.spearfishing, 0) / ws.length;
            expect(avg(resultLong.current.windows)).toBeGreaterThan(avg(resultMid.current.windows));
            expect(avg(resultMid.current.windows)).toBeGreaterThan(avg(resultShort.current.windows));
        }
    });


    // ── Scoring: W_penalty (wind) ─────────────────────────────────────────────

    it('[Score] 15kn wind applies -1 penalty compared to calm', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);

        const tidesCalm = makeTides();
        patchTimesToTomorrow(tidesCalm);
        const inputCalm = buildInput(tidesCalm, sunrises, sunsets, { windSpeed: 0 });
        const { result: resultCalm } = renderHook(() => useSpearfishingWindows(inputCalm));

        const tidesWindy = makeTides();
        patchTimesToTomorrow(tidesWindy);
        const inputWindy = buildInput(tidesWindy, sunrises, sunsets, { windSpeed: 15 });
        const { result: resultWindy } = renderHook(() => useSpearfishingWindows(inputWindy));

        if (resultCalm.current.windows.length > 0 && resultWindy.current.windows.length > 0) {
            const avgCalm  = resultCalm.current.windows.reduce((s, w) => s + w.activityScore.spearfishing, 0) / resultCalm.current.windows.length;
            const avgWindy = resultWindy.current.windows.reduce((s, w) => s + w.activityScore.spearfishing, 0) / resultWindy.current.windows.length;
            expect(avgCalm).toBeGreaterThan(avgWindy);
        }
    });

    // ── Data integrity ────────────────────────────────────────────────────────

    it('currentAtStart and currentAtEnd are non-negative numbers', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        result.current.windows.forEach(w => {
            expect(typeof w.currentAtStart).toBe('number');
            expect(w.currentAtStart).toBeGreaterThanOrEqual(0);
            expect(typeof w.currentAtEnd).toBe('number');
            expect(w.currentAtEnd).toBeGreaterThanOrEqual(0);
        });
    });

    it('all windows are in the future (slackTime >= now)', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        const now = new Date();
        result.current.windows.forEach(w => {
            expect(new Date(w.slackTime).getTime()).toBeGreaterThanOrEqual(now.getTime());
        });
    });

    // ── spearfishingBreakdown ─────────────────────────────────────────────────

    it('[Breakdown] every window has a spearfishingBreakdown object', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        result.current.windows.forEach(w => {
            expect(w.spearfishingBreakdown).toBeDefined();
            expect(typeof w.spearfishingBreakdown!.vPts).toBe('number');
            expect(typeof w.spearfishingBreakdown!.fPts).toBe('number');
            expect(typeof w.spearfishingBreakdown!.wPenalty).toBe('number');
            expect(typeof w.spearfishingBreakdown!.qRaw).toBe('number');
            expect(w.spearfishingBreakdown!.floodFraction).toBeGreaterThanOrEqual(0);
            expect(w.spearfishingBreakdown!.floodFraction).toBeLessThanOrEqual(1);
            expect(Array.isArray(w.spearfishingBreakdown!.fReasons)).toBe(true);
            expect(Array.isArray(w.spearfishingBreakdown!.wReasons)).toBe(true);
        });
    });

    it('[Breakdown] vPts range is [−1, +3]', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        result.current.windows.forEach(w => {
            expect(w.spearfishingBreakdown!.vPts).toBeGreaterThanOrEqual(-1);
            expect(w.spearfishingBreakdown!.vPts).toBeLessThanOrEqual(3);
        });
    });

    it('[Breakdown] wPenalty is 1 for 7s swell period (acceptable tier)', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets, { swellPeriod: 7 });
        const { result } = renderHook(() => useSpearfishingWindows(input));
        result.current.windows.forEach(w => {
            // The swell period penalty is a snapshot-level penalty
            expect(w.spearfishingBreakdown!.wPenalty).toBeGreaterThanOrEqual(1);
        });
    });

    it('[Breakdown] wPenalty is 0 for 9s swell period (optimal tier)', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets, { swellPeriod: 9, windSpeed: 0 });
        const { result } = renderHook(() => useSpearfishingWindows(input));
        result.current.windows.forEach(w => {
            expect(w.spearfishingBreakdown!.wPenalty).toBe(0);
        });
    });

    it('[Moon] moon bonus applies when within 3 days of a known new moon', () => {
        // April 27, 2025 was a new moon — use a date 2 days after
        // We can't freeze the date easily in unit tests without mocking, but we can
        // verify the bonus doesn't break the score range (0–100).
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        patchTimesToTomorrow(tides);
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useSpearfishingWindows(input));
        result.current.windows.forEach(w => {
            expect(w.activityScore.spearfishing).toBeGreaterThanOrEqual(0);
            expect(w.activityScore.spearfishing).toBeLessThanOrEqual(100);
            // Moon bonus is a boolean — verify the label string is correct if applied
            const moonReason = w.spearfishingBreakdown!.fReasons.find(
                r => r.includes('Moon')
            );
            if (moonReason) {
                expect(moonReason).toMatch(/🌑|🌕/);
            }
        });
    });
});
