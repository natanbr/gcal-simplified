import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMarineEvents } from './useMarineEvents';
import type { TideData, MarineEvent } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
        times.push(t.toISOString().substring(0, 16));
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
});
