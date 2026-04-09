import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMarineEvents } from './useMarineEvents';
import type { TideData, MarineEvent } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats a Date as local YYYY-MM-DDTHH:mm (no Z, no offset) matching Open-Meteo
 * hourly time strings. Critical: utcToLocalPrefix() converts UTC hilo events
 * to this format before prefix-matching, so the fixture must use the same format.
 */
function toLocalISOString(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function makeTides(): TideData {
    const now = new Date();
    now.setMinutes(0, 0, 0);

    const times: string[] = [];
    const tide_height: number[] = [];
    const current_speed: number[] = [];
    const current_direction: number[] = [];
    const wave_height: number[] = [];

    for (let i = 0; i < 168; i++) {
        const t = new Date(now.getTime() + i * 3600_000);
        // Use local time format ("2026-04-09T11:00") — matches Open-Meteo hourly array.
        // DO NOT use toISOString() here (returns UTC) because utcToLocalPrefix() converts
        // CHS hilo UTC times to local before prefix-matching.
        times.push(toLocalISOString(t));
        tide_height.push(2 + 1.5 * Math.sin(2 * Math.PI * i / 12.4));
        current_speed.push(Math.abs(2.5 * Math.sin(2 * Math.PI * i / 12.4)));
        current_direction.push(i % 25 < 12 ? 90 : 270);
        wave_height.push(0.8);
    }

    return {
        hourly: { time: times, tide_height, current_speed, current_direction, wave_height },
        hilo: [],
        sources: [],
    } as unknown as TideData;
}

function makeTidesWithOfficialEvents(): TideData {
    const tides = makeTides();
    tides.hilo = [
        { time: tides.hourly.time[2], type: 'Slack Water', value: 0.2 },
        { time: tides.hourly.time[6], type: 'Max Flood', value: 2.4 },
        { time: tides.hourly.time[12], type: 'Slack Water', value: 0.3 },
        { time: tides.hourly.time[18], type: 'Max Ebb', value: 2.1 },
        { time: tides.hourly.time[1], type: 'High', value: 3.2 },
        { time: tides.hourly.time[7], type: 'Low', value: 0.8 },
    ];
    return tides;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useMarineEvents', () => {
    it('returns empty array when tides is null', () => {
        const { result } = renderHook(() => useMarineEvents(null));
        expect(result.current).toEqual([]);
    });

    it('returns empty array when current_speed is empty', () => {
        const tides = makeTides();
        (tides.hourly as { current_speed: number[] }).current_speed = [];
        const { result } = renderHook(() => useMarineEvents(tides));
        expect(result.current).toEqual([]);
    });

    it('uses official CHS path when hilo has current events', () => {
        const tides = makeTidesWithOfficialEvents();
        const { result } = renderHook(() => useMarineEvents(tides));
        const types = result.current.map((e: MarineEvent) => e.type);
        expect(types).toContain('Slack');
        expect(types).toContain('Max Flood');
        expect(types).toContain('Max Ebb');
    });

    it('maps Slack Water → Slack in official path', () => {
        const tides = makeTidesWithOfficialEvents();
        const { result } = renderHook(() => useMarineEvents(tides));
        const slacks = result.current.filter((e: MarineEvent) => e.type === 'Slack');
        expect(slacks.length).toBeGreaterThan(0);
        expect(result.current.some((e: MarineEvent) => (e as { type: string }).type === 'Slack Water')).toBe(false);
    });

    it('derives High Tide and Low Tide from hilo', () => {
        const tides = makeTidesWithOfficialEvents();
        const { result } = renderHook(() => useMarineEvents(tides));
        const types = result.current.map((e: MarineEvent) => e.type);
        expect(types).toContain('High Tide');
        expect(types).toContain('Low Tide');
    });

    it('injects day separator rows with label between days', () => {
        const tides = makeTidesWithOfficialEvents();
        const { result } = renderHook(() => useMarineEvents(tides));
        const separators = result.current.filter((e: MarineEvent) => e.type === 'separator');
        expect(separators.length).toBeGreaterThan(0);
        separators.forEach((s: MarineEvent) => expect(s.label).toBeTruthy());
    });

    it('results are sorted chronologically', () => {
        const tides = makeTidesWithOfficialEvents();
        const { result } = renderHook(() => useMarineEvents(tides));
        const nonSeparators = result.current.filter((e: MarineEvent) => e.type !== 'separator');
        for (let i = 1; i < nonSeparators.length; i++) {
            const prev = new Date(nonSeparators[i - 1].time).getTime();
            const curr = new Date(nonSeparators[i].time).getTime();
            expect(curr).toBeGreaterThanOrEqual(prev);
        }
    });

    it('filters out events beyond FORECAST_DAYS (7d)', () => {
        const tides = makeTidesWithOfficialEvents();
        const farFuture = new Date();
        farFuture.setDate(farFuture.getDate() + 10);
        tides.hilo!.push({ time: farFuture.toISOString().substring(0, 16), type: 'Slack Water', value: 0.1 });

        const { result } = renderHook(() => useMarineEvents(tides));
        const nonSeparators = result.current.filter((e: MarineEvent) => e.type !== 'separator');
        const limit = new Date();
        limit.setDate(limit.getDate() + 7);
        nonSeparators.forEach((e: MarineEvent) => {
            expect(new Date(e.time).getTime()).toBeLessThanOrEqual(limit.getTime() + 60_000); // 1min tolerance
        });
    });

    // ── R2: Sunrise / Sunset injection ───────────────────────────────────────────

    it('injects Sunrise events from sunrises param into the event stream', () => {
        const tides = makeTidesWithOfficialEvents();
        const now = new Date();
        // Sunrise tomorrow at 06:30
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(6, 30, 0, 0);
        const sunrises = [tomorrow.toISOString()];

        const { result } = renderHook(() => useMarineEvents(tides, sunrises, []));
        const types = result.current.map((e: MarineEvent) => e.type);
        expect(types).toContain('Sunrise');
    });

    it('injects Sunset events from sunsets param into the event stream', () => {
        const tides = makeTidesWithOfficialEvents();
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(20, 15, 0, 0);
        const sunsets = [tomorrow.toISOString()];

        const { result } = renderHook(() => useMarineEvents(tides, [], sunsets));
        const types = result.current.map((e: MarineEvent) => e.type);
        expect(types).toContain('Sunset');
    });

    it('sunrise/sunset events are sorted chronologically with tidal events', () => {
        const tides = makeTidesWithOfficialEvents();
        const now = new Date();
        // Inject sunrise clearly after "now" (2h ahead)
        const sr = new Date(now.getTime() + 2 * 3600_000).toISOString();
        const ss = new Date(now.getTime() + 10 * 3600_000).toISOString();

        const { result } = renderHook(() => useMarineEvents(tides, [sr], [ss]));
        const nonSeparators = result.current.filter((e: MarineEvent) => e.type !== 'separator');
        for (let i = 1; i < nonSeparators.length; i++) {
            const prev = new Date(nonSeparators[i - 1].time).getTime();
            const curr = new Date(nonSeparators[i].time).getTime();
            expect(curr).toBeGreaterThanOrEqual(prev);
        }
    });

    it('day separators still inject correctly when sunrise/sunset events are mixed in', () => {
        const tides = makeTidesWithOfficialEvents();
        const now = new Date();
        // Sunrise on day 2 and day 4
        const sunrises = [
            new Date(now.getTime() + 30 * 3600_000).toISOString(),
            new Date(now.getTime() + 78 * 3600_000).toISOString(),
        ];
        const { result } = renderHook(() => useMarineEvents(tides, sunrises, []));
        const separators = result.current.filter((e: MarineEvent) => e.type === 'separator');
        expect(separators.length).toBeGreaterThan(0);
        separators.forEach((s: MarineEvent) => expect(s.label).toBeTruthy());
    });

    it('falls back to tides.sunrise when no sunrises param given', () => {
        const tides = makeTidesWithOfficialEvents();
        const now = new Date();
        const sr = new Date(now.getTime() + 4 * 3600_000).toISOString();
        tides.sunrise = [sr];

        const { result } = renderHook(() => useMarineEvents(tides));
        const types = result.current.map((e: MarineEvent) => e.type);
        expect(types).toContain('Sunrise');
    });

    // ── UTC vs Local time mismatch regression ─────────────────────────────────────
    // Bug: CHS hilo events carry UTC timestamps ("2026-04-09T23:44:00Z") but the
    // hourly time array is in LOCAL time ("2026-04-09T16:00", no Z suffix).
    // Old code: h.time.substring(0,13) matched UTC hour prefix against the local
    // array → always returned idx=-1 → tideHeight always undefined (shown as "—").
    //
    // Fix: utcToLocalPrefix() converts Z-suffix UTC strings to local before matching.

    it('[UTC-fix] tide height is populated when hilo times are UTC Z-suffix (CHS format)', () => {
        const tides = makeTides();

        // The crux: hourly times in the array are LOCAL (no Z).
        // We pick a fixed local datetime string and put it in hourly[2],
        // then build the matching UTC Z string for hilo.
        // e.g. Local "2026-04-10T10:00" + UTC offset → UTC "2026-04-10T17:00:00Z" in PDT.
        const now = new Date();
        now.setMinutes(0, 0, 0);
        // Simulate a CHS hilo event: same wall-clock moment as hourly.time[2]
        // but expressed as a UTC Z-suffix ISO string (as CHS actually returns).
        // We get the real UTC equivalent by adding Nh to `now` and calling toISOString().
        const slackCHSUtc = new Date(now.getTime() + 2 * 3600_000).toISOString(); // real UTC
        tides.hilo = [
            { time: slackCHSUtc, type: 'Slack Water', value: 0.05 },
        ];
        tides.hourly.current_speed![2] = 0.05;

        const { result } = renderHook(() => useMarineEvents(tides));
        const slacks = result.current.filter((e: MarineEvent) => e.type === 'Slack');

        expect(slacks.length).toBeGreaterThan(0);
        // With the fix: idx is found via utcToLocalPrefix and tideHeight is a number
        expect(typeof slacks[0].tideHeight).toBe('number');
    });

    it('[UTC-fix] none of the official-path events have tideHeight=undefined when hilo uses UTC timestamps', () => {
        const tides = makeTides();
        const now = new Date();
        now.setMinutes(0, 0, 0);
        // Real UTC equivalents for hours 1, 3, 4
        const t1 = new Date(now.getTime() + 1 * 3600_000).toISOString();
        const t3 = new Date(now.getTime() + 3 * 3600_000).toISOString();
        const t4 = new Date(now.getTime() + 4 * 3600_000).toISOString();
        tides.hilo = [
            { time: t1, type: 'Slack Water', value: 0.05 },
            { time: t3, type: 'Max Flood',   value: 2.5 },
            { time: t4, type: 'High',        value: 3.1 },
        ];
        tides.hourly.current_speed![1] = 0.05;

        const { result } = renderHook(() => useMarineEvents(tides));
        const official_events = result.current.filter((e: MarineEvent) =>
            ['Slack', 'Max Flood', 'Max Ebb', 'High Tide', 'Low Tide'].includes(e.type)
        );
        expect(official_events.length).toBeGreaterThan(0);
        official_events.forEach((e: MarineEvent) => {
            expect(e.tideHeight).not.toBeUndefined();
            expect(typeof e.tideHeight).toBe('number');
        });
    });
});
