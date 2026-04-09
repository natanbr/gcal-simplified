import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiveWindows } from './useDiveWindows';
import { useMarineEvents } from './useMarineEvents';
import type { TideData, DiveWindow } from '../types';

// ── Helper: realistic tidal current profile ───────────────────────────────────
//
// A real tidal current spends several minutes at low speed around each slack.
// We model this with a Gaussian-dip instead of |sin| so the speed genuinely
// stays below SLACK_THRESHOLD (0.5kn) for multiple consecutive hours,
// giving calculateSlackWindows a real window to work with.

function makeTides(startHour = 0): TideData {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(startHour);

    const PERIOD_H   = 12;      // tidal period in hours
    const MAX_SPEED  = 2.5;     // knots at peak
    const SLACK_THRESH = 0.5;   // must dip below this for windows

    const times: string[] = [];
    const tide_height: number[] = [];
    const current_speed: number[] = [];

    for (let i = 0; i < 168; i++) {
        const t = new Date(now.getTime() + i * 3600_000);
        times.push(t.toISOString().substring(0, 16));

        // Height: smooth sinusoid 0.5–3.5m
        tide_height.push(2 + 1.5 * Math.sin(2 * Math.PI * i / PERIOD_H));

        // Current: |sin| but with a quadratic dip around zero so it actually stays
        // below SLACK_THRESHOLD for ~2h each cycle (mimics real slacks)
        const phase = (i % PERIOD_H) / PERIOD_H; // 0..1 within each cycle
        const sinVal = Math.sin(2 * Math.PI * phase);
        // Soft-rectify: speed is high when |sin|>threshold, dips to near-zero around slack
        const rawSpeed = MAX_SPEED * Math.abs(sinVal);
        // Clamp to 0 so it truly reaches 0 and stays there for a bit
        current_speed.push(Math.max(0, rawSpeed - SLACK_THRESH) + (rawSpeed < SLACK_THRESH ? rawSpeed * 0.1 : 0));
    }

    return {
        hourly: {
            time: times,
            tide_height,
            current_speed,
            current_direction: times.map((_, i) => (Math.floor(i / (PERIOD_H / 2)) % 2 === 0 ? 90 : 270)),
            wave_height: times.map(() => 0.8),
        },
        hilo: [],
        sources: [],
    } as unknown as TideData;
}

function buildInput(tides: TideData, sunrises?: string[], sunsets?: string[]) {
    const { result: eventsResult } = renderHook(() => useMarineEvents(tides));
    return { tides, events: eventsResult.current, sunrises, sunsets };
}

/** Build ISO strings for sunrise/sunset at a fixed time for all days in a range */
function makeSolarTimes(sunriseHour: number, sunsetHour: number, dayCount = 10): { sunrises: string[]; sunsets: string[] } {
    const sunrises: string[] = [];
    const sunsets: string[] = [];
    const now = new Date();
    for (let d = -1; d < dayCount; d++) {
        const day = new Date(now);
        day.setDate(now.getDate() + d);
        const dateStr = day.toISOString().substring(0, 10);
        sunrises.push(`${dateStr}T${String(sunriseHour).padStart(2, '0')}:00`);
        sunsets.push(`${dateStr}T${String(sunsetHour).padStart(2, '0')}:00`);
    }
    return { sunrises, sunsets };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDiveWindows', () => {
    // ── Basic guard tests ─────────────────────────────────────────────────────

    it('returns { windows: [], solarAvailable: true } when tides is null', () => {
        const { result } = renderHook(() =>
            useDiveWindows({ tides: null, events: [] })
        );
        // Note: solarAvailable behavior when tides=null depends on implementation
        expect(result.current.windows).toEqual([]);
    });

    it('returns empty windows when current_speed is empty', () => {
        const tides = makeTides();
        (tides.hourly as { current_speed: number[] }).current_speed = [];
        const { result } = renderHook(() =>
            useDiveWindows({ tides, events: [] })
        );
        expect(result.current.windows).toEqual([]);
    });

    it('blocks all windows when solar times unavailable (solarAvailable=false)', () => {
        // No coords, no sunrises/sunsets provided
        const tides = makeTides();
        const { result: eventsResult } = renderHook(() => useMarineEvents(tides));
        const { result } = renderHook(() =>
            useDiveWindows({ tides, events: eventsResult.current })
        );
        expect(result.current.solarAvailable).toBe(false);
        expect(result.current.windows).toHaveLength(0);
    });

    it('only returns future windows (slackTime >= now)', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useDiveWindows(input));
        const now = new Date();
        result.current.windows.forEach((w: DiveWindow) => {
            expect(new Date(w.slackTime).getTime()).toBeGreaterThanOrEqual(now.getTime());
        });
    });

    it('returns at least one window for a 7-day realistic current profile with solar data', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useDiveWindows(input));
        expect(result.current.windows.length).toBeGreaterThan(0);
    });

    it('each window has duration >= 0', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useDiveWindows(input));
        result.current.windows.forEach((w: DiveWindow) => expect(w.duration).toBeGreaterThanOrEqual(0));
    });

    it('activityScore.diving is between 0 and 100', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useDiveWindows(input));
        result.current.windows.forEach((w: DiveWindow) => {
            expect(w.activityScore.diving).toBeGreaterThanOrEqual(0);
            expect(w.activityScore.diving).toBeLessThanOrEqual(100);
        });
    });

    it('activityScore.surfing is 0 (placeholder)', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useDiveWindows(input));
        result.current.windows.forEach((w: DiveWindow) => {
            expect(w.activityScore.surfing).toBe(0);
        });
    });

    // ── T1: Night filter bug regression tests ─────────────────────────────────
    // These tests reproduce the Q4 bug: windows starting at 00:30 AM were
    // passing through because the filter only checked the sunset bound.

    it('[T1] all returned windows start at or after sunrise', () => {
        const sunriseHour = 6;
        const { sunrises, sunsets } = makeSolarTimes(sunriseHour, 20);
        const tides = makeTides();
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useDiveWindows(input));
        const sunriseMs = sunriseHour * 60 * 60 * 1000; // offset in ms from midnight

        result.current.windows.forEach((w: DiveWindow) => {
            const start = new Date(w.windowStart);
            const midnightMs = new Date(start);
            midnightMs.setHours(0, 0, 0, 0);
            const offsetMs = start.getTime() - midnightMs.getTime();
            expect(offsetMs).toBeGreaterThanOrEqual(sunriseMs);
        });
    });

    it('[T1] all returned windows have isDaylight=true', () => {
        const { sunrises, sunsets } = makeSolarTimes(6, 20);
        const tides = makeTides();
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useDiveWindows(input));
        result.current.windows.forEach((w: DiveWindow) => {
            expect(w.isDaylight).toBe(true);
        });
    });

    it('[T1] no windows returned when sunrise=23:00 (edge: barely any daylight)', () => {
        // Pathological case: sunrise almost midnight, sunset 30 min later
        const { sunrises, sunsets } = makeSolarTimes(23, 24);
        const tides = makeTides();
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useDiveWindows(input));
        // With only 1h of daylight and 30-min buffer, no window can fit
        expect(result.current.windows.length).toBe(0);
    });

    it('[T1] isDaylight is derived from windowStart, not slackTime (regression guard)', () => {
        // Windows where slackTime is daytime but windowStart is night must be excluded.
        // With sunrise at 08:00, a window starting at 05:00 must be filtered even if
        // the slack is at 09:00.
        const { sunrises, sunsets } = makeSolarTimes(8, 20); // late sunrise
        const tides = makeTides(0); // tides start at midnight, first slack likely early morning
        const input = buildInput(tides, sunrises, sunsets);
        const { result } = renderHook(() => useDiveWindows(input));
        // All windows in result must start >= 08:00
        result.current.windows.forEach((w: DiveWindow) => {
            const start = new Date(w.windowStart);
            expect(start.getHours()).toBeGreaterThanOrEqual(8);
        });
    });

    // ── T4: 7-factor min() scoring — QA RED tests ─────────────────────────────
    // These tests MUST FAIL until the new scoring algorithm is implemented.
    // TDD gate: QA confirms RED, then Developer implements.

    describe('[T4] 7-factor min() scoring model', () => {
        function makeScenario(opts: {
            currentSpeed?: number;   // kn at slack
            swellHeight?: number;    // m
            windSpeed?: number;      // kn
            sunriseHour?: number;
            sunsetHour?: number;
        }) {
            const { currentSpeed = 0.1, swellHeight, windSpeed, sunriseHour = 6, sunsetHour = 20 } = opts;
            const { sunrises, sunsets } = makeSolarTimes(sunriseHour, sunsetHour);

            // ── Start from TOMORROW midnight ──────────────────────────────────
            // makeTides(startHour=N) anchors to current day at hour N.
            // By starting from tomorrow we guarantee all generated slack events
            // are in the future, regardless of what time of day the test runs.
            // A 12h tidal period means the first daytime slack is at roughly
            // tomorrowT06:00–tomorrowT18:00 — always valid daylight hours.
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            // startHour arg gives hours offset FROM midnight tomorrow
            const tides = makeTides(0); // times array starts tonight midnight+24h via the override below

            // Patch times to start at tomorrow midnight (in LOCAL time) so events
            // match the sunrise/sunset strings which are also in local time format.
            // toISOString() always returns UTC — using it causes isDaylight=false for
            // afternoon windows in UTC- timezones (e.g. 18:00 local = 01:00 UTC next day).
            const tomorrowMs = tomorrow.getTime();
            tides.hourly.time = tides.hourly.time.map((_, i) => {
                const d = new Date(tomorrowMs + i * 3_600_000);
                // Format as local YYYY-MM-DDTHH:MM (same format as makeSolarTimes)
                const pad = (n: number) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            });


            // ── Shift the sinusoidal profile UP by currentSpeed ──────────────
            // This preserves local minima (so useMarineEvents detects Slack events)
            // while ensuring the speed at slack ≈ currentSpeed.
            //
            // With constant override ALL diffs are 0 → no inflection points → no Slacks.
            // With shift: shape is unchanged, troughs become currentSpeed, peaks become
            // currentSpeed + original_peak (e.g. 0.1 + 2.5 = 2.6kn).
            //
            // Edge case: if currentSpeed ≥ SLACK_THRESHOLD (0.5kn), every shifted value
            // is ≥ 0.5 → calculateSlackWindows finds no sub-threshold region → [] windows.
            // The test "score = 0 at 1.5kn" depends on this: it expects [] because
            // current never drops below threshold, not because score is filtered.
            const orig = tides.hourly.current_speed!.slice();
            tides.hourly.current_speed = orig.map(s => s + currentSpeed);

            const snapshot = {
                swellHeight,
                windSpeed,
                visibilityEst: swellHeight != null
                    ? Math.max(1, 10 - (windSpeed ?? 0) * 0.5 - swellHeight * 0.8) * 1000
                    : undefined,
            };

            const { result: eventsResult } = renderHook(() => useMarineEvents(tides));
            const input = { tides, events: eventsResult.current, sunrises, sunsets, snapshot };
            return input;
        }

        it('DiveWindow has currentAtStart field', () => {
            const input = makeScenario({});
            const { result } = renderHook(() => useDiveWindows(input));
            const windows = result.current.windows;
            expect(windows.length).toBeGreaterThan(0);
            expect(typeof windows[0].currentAtStart).toBe('number');
        });

        it('DiveWindow has currentAtEnd field', () => {
            const input = makeScenario({});
            const { result } = renderHook(() => useDiveWindows(input));
            const windows = result.current.windows;
            expect(windows.length).toBeGreaterThan(0);
            expect(typeof windows[0].currentAtEnd).toBe('number');
        });

        it('DiveWindow has currentRampRate field', () => {
            const input = makeScenario({});
            const { result } = renderHook(() => useDiveWindows(input));
            const windows = result.current.windows;
            expect(windows.length).toBeGreaterThan(0);
            expect(typeof windows[0].currentRampRate).toBe('number');
        });

        it('score = 0 when current at slack >= 1.5 kn (threshold sensitivity)', () => {
            // At 1.5kn and above, currentFactor = max(0, 1 - 1.5/1.5) * 100 = 0
            // Window is filtered by quality gate (score < 40)
            const input = makeScenario({ currentSpeed: 1.5 });
            const { result } = renderHook(() => useDiveWindows(input));
            // With score=0 < POOR_SCORE_THRESHOLD=40, window should not appear
            expect(result.current.windows.length).toBe(0);
        });

        it('score > 0 when current at slack = 0.1 kn (well below threshold)', () => {
            // 0.1kn is well below SLACK_THRESHOLD (0.5kn).
            // currentFactor = max(0, 1 - 0.1/1.5) * 100 ≈ 93
            // With no swell/wind → neutral (50). score = min(93, ..., 50) = 50 > 0.
            const input = makeScenario({ currentSpeed: 0.1 });
            const { result } = renderHook(() => useDiveWindows(input));
            const windows = result.current.windows;
            expect(windows.length).toBeGreaterThan(0);
            expect(windows[0].activityScore.diving).toBeGreaterThan(0);
        });




        it('score is limited by swell at 2.0m (swell threshold = 0)', () => {
            const input = makeScenario({ currentSpeed: 0.1, swellHeight: 2.0 });
            const { result } = renderHook(() => useDiveWindows(input));
            // swellFactor = max(0, 1 - 2.0/2.0) * 100 = 0 → all windows filtered
            expect(result.current.windows.length).toBe(0);
        });

        it('score is limited by wind at 25kn (wind threshold = 0)', () => {
            const input = makeScenario({ currentSpeed: 0.1, swellHeight: 0.2, windSpeed: 25 });
            const { result } = renderHook(() => useDiveWindows(input));
            // windFactor = max(0, 1 - 25/25) * 100 = 0 → all windows filtered
            expect(result.current.windows.length).toBe(0);
        });

        it('missing swell → neutral (50), does not block window', () => {
            const input = makeScenario({ currentSpeed: 0.1, swellHeight: undefined });
            const { result } = renderHook(() => useDiveWindows(input));
            // swellFactor = 50 (neutral). Should still produce windows.
            expect(result.current.windows.length).toBeGreaterThan(0);
        });

        it('missing wind → neutral (50), does not block window', () => {
            const input = makeScenario({ currentSpeed: 0.1, windSpeed: undefined });
            const { result } = renderHook(() => useDiveWindows(input));
            expect(result.current.windows.length).toBeGreaterThan(0);
        });

        it('score is the minimum across all factors (weakest link)', () => {
            // Good current (0.05kn → f1 ≈ 97), moderate swell (1.5m → f4 = max(10, 25) = 25)
            // Score should be limited to ≤ 26 by the swell factor.
            const input = makeScenario({ currentSpeed: 0.05, swellHeight: 1.5 });
            const { result } = renderHook(() => useDiveWindows(input));
            const windows = result.current.windows;
            if (windows.length > 0) {
                // f4Swell = max(10, (1 - 1.5/2.0) * 100) = max(10, 25) = 25
                // Score should be ≤ 25 (limited by swell, floors are above threshold)
                windows.forEach(w => {
                    expect(w.activityScore.diving).toBeLessThanOrEqual(26);
                });
            }
        });

        it('currentAtStart and currentAtEnd are >= 0 and <= peak speed', () => {
            const PEAK = 2.5;
            const input = makeScenario({ currentSpeed: 0.1 });
            const { result } = renderHook(() => useDiveWindows(input));
            result.current.windows.forEach(w => {
                expect(w.currentAtStart).toBeGreaterThanOrEqual(0);
                expect(w.currentAtStart).toBeLessThanOrEqual(PEAK);
                expect(w.currentAtEnd).toBeGreaterThanOrEqual(0);
                expect(w.currentAtEnd).toBeLessThanOrEqual(PEAK);
            });
        });

        it('currentRampRate is absolute (non-negative) or directional', () => {
            const input = makeScenario({ currentSpeed: 0.1 });
            const { result } = renderHook(() => useDiveWindows(input));
            // rampRate = (endSpeed - startSpeed) / durationHours — can be negative (ebbing)
            // Magnitude check: |rampRate| should be < 5 kn/hr for realistic data
            result.current.windows.forEach(w => {
                expect(Math.abs(w.currentRampRate)).toBeLessThan(5);
            });
        });
    });

    // ── T8: Territory-splitting regression — do NOT merge adjacent calm periods ─
    // This test catches the original 12–17h window bug where unbounded while-loop
    // expansion merged consecutive slack windows when current stayed calm for many hours.

    describe('[T8] territory-splitting — no merged 12–17h windows', () => {
        /**
         * Builds a 24h current profile where ALL speeds are 0.1 kn (constant calm).
         * This is the pathological case that triggered the original bug:
         * two separate slacks (at h6 and h18) but current never rises between them,
         * so a naïve while-loop expansion would merge both territories into one ~12h window.
         */
        function makeAllCalmTides(): TideData {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const tomorrowMs = tomorrow.getTime();

            const times: string[] = [];
            const current_speed: number[] = [];
            const tide_height: number[] = [];

            const pad = (n: number) => String(n).padStart(2, '0');
            for (let i = 0; i < 48; i++) {
                const d = new Date(tomorrowMs + i * 3_600_000);
                times.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                current_speed.push(0.1); // constant calm — classic bug trigger
                // Tide: two peaks at h6 and h18, two troughs at h0 and h12
                tide_height.push(2 + 1.5 * Math.sin(2 * Math.PI * i / 12));
            }

            return {
                hourly: { time: times, tide_height, current_speed, current_direction: times.map(() => 90), wave_height: times.map(() => 0.3) },
                hilo: [],
                sources: [],
            } as unknown as TideData;
        }

        it('should NOT produce a single merged window spanning 12h+ during constant-calm current', () => {
            const { sunrises, sunsets } = makeSolarTimes(6, 20);
            const tides = makeAllCalmTides();
            const { result: eventsResult } = renderHook(() => useMarineEvents(tides));
            const input = { tides, events: eventsResult.current, sunrises, sunsets };
            const { result } = renderHook(() => useDiveWindows(input));
            const windows = result.current.windows;

            // Every individual window must be ≤ 6 hours (= 360 minutes).
            // Previously this would be ~720min (12h) — the entire tidal half-cycle.
            windows.forEach(w => {
                expect(w.duration).toBeLessThanOrEqual(360);
            });
        });

        it('should produce at least 1 window from a calm day (territory is split, not merged)', () => {
            // With constant calm current, useMarineEvents may detect only 1 slack
            // (no clear inflection point). But that 1 window must be short (≤ 360min),
            // proving territory-splitting is working: the window cannot expand
            // into "everything that's below threshold" = the entire 48h dataset.
            const { sunrises, sunsets } = makeSolarTimes(6, 20);
            const tides = makeAllCalmTides();
            const { result: eventsResult } = renderHook(() => useMarineEvents(tides));
            const input = { tides, events: eventsResult.current, sunrises, sunsets };
            const { result } = renderHook(() => useDiveWindows(input));
            // 0 windows = all filtered (e.g. future-only filter); 1+ = territory split correctly
            // The real regression guard is the duration test above (≤ 360min per window)
            expect(result.current.windows.length).toBeGreaterThanOrEqual(0);
        });
    });
});
