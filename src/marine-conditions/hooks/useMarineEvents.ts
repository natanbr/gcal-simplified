import { useMemo } from 'react';
import { addDays, isSameDay, format } from 'date-fns';
import { parseSafe } from '../utils/dateUtils';
import type { TideData, MarineEvent, MarineEventType } from '../types';
import { EPSILON, FORECAST_DAYS } from '../config';
import { interpolateExtremeTime } from '../utils/tideMath';

/**
 * Derives the list of typed MarineEvents from raw TideData.
 *
 * Priority strategy:
 *  1. If hilo contains current events (Slack Water, Max Flood, Max Ebb):
 *     → Use official CHS events directly.
 *  2. Otherwise (Open-Meteo fallback):
 *     → Detect extremes manually from the hourly current_speed time series.
 *  3. High Tide / Low Tide always come from hilo when available,
 *     otherwise derived from hourly tide_height inflection points.
 *  4. Day separator rows are injected between days for table rendering.
 *
 * Returns events sorted chronologically, filtered to [now, now+7d].
 */
export function useMarineEvents(tides: TideData | null): MarineEvent[] {
    return useMemo(() => {
        if (!tides?.hourly?.current_speed?.length) return [];

        const hourly = tides.hourly;
        const speeds      = hourly.current_speed!;
        const directions  = hourly.current_direction ?? [];
        const times       = hourly.time;
        const tideHeights = hourly.tide_height ?? [];
        const swellHeights = hourly.wave_height ?? [];

        const rawEvents: Array<{
            time: string;
            type: MarineEventType;
            currentSpeed: number;
            tideHeight?: number;
            swellHeight?: number;
        }> = [];

        // ── 1. Current Events ────────────────────────────────────────────────
        const hasOfficialCurrentEvents = tides.hilo?.some(h =>
            ['Slack Water', 'Max Flood', 'Max Ebb'].includes(h.type)
        );

        if (hasOfficialCurrentEvents) {
            // CHS official path
            tides.hilo!.forEach(h => {
                if (!['Slack Water', 'Max Flood', 'Max Ebb'].includes(h.type)) return;
                const typeStr = h.type === 'Slack Water' ? 'Slack' : h.type;
                const idx = times.findIndex(t => t.startsWith(h.time.substring(0, 13)));
                rawEvents.push({
                    time: h.time,
                    type: typeStr as MarineEventType,
                    currentSpeed: h.value !== undefined ? Math.abs(h.value) : (idx !== -1 ? speeds[idx] : 0),
                    tideHeight: idx !== -1 ? tideHeights[idx] : undefined,
                    swellHeight: idx !== -1 ? swellHeights[idx] : undefined,
                });
            });
        } else {
            // Open-Meteo fallback — manual detection via inflection points
            let lastTrend = 0; // 0 = unknown, 1 = accelerating, -1 = decelerating

            for (let i = 1; i < speeds.length; i++) {
                const diff = speeds[i] - speeds[i - 1];

                if (diff > EPSILON) {
                    if (lastTrend === -1) {
                        // Local minimum → candidate Slack
                        const idx = i - 1;
                        if (speeds[idx] < 1.0) {
                            const preciseTime = interpolateExtremeTime(times, speeds, idx);
                            rawEvents.push({
                                time: preciseTime,
                                type: 'Slack',
                                currentSpeed: speeds[idx],
                                tideHeight: tideHeights[idx],
                                swellHeight: swellHeights[idx],
                            });
                        }
                    }
                    lastTrend = 1;
                } else if (diff < -EPSILON) {
                    if (lastTrend === 1) {
                        // Local maximum → Max Flood or Max Ebb by direction
                        const idx = i - 1;
                        const dir = directions[idx] ?? 0;
                        const isFlood = dir > 45 && dir < 135;
                        const preciseTime = interpolateExtremeTime(times, speeds, idx);
                        rawEvents.push({
                            time: preciseTime,
                            type: isFlood ? 'Max Flood' : 'Max Ebb',
                            currentSpeed: speeds[idx],
                            tideHeight: tideHeights[idx],
                            swellHeight: swellHeights[idx],
                        });
                    }
                    lastTrend = -1;
                }
            }
        }

        // ── 2. Tide Events (High / Low) ──────────────────────────────────────
        if (tides.hilo && tides.hilo.length > 0) {
            tides.hilo.forEach(h => {
                if (!['High', 'Low', 'High Tide', 'Low Tide'].includes(h.type)) return;
                const idx = times.findIndex(t => t.startsWith(h.time.substring(0, 13)));
                rawEvents.push({
                    time: h.time,
                    type: (h.type === 'High' || h.type === 'High Tide') ? 'High Tide' : 'Low Tide',
                    currentSpeed: idx !== -1 ? speeds[idx] : 0,
                    tideHeight: h.value,
                    swellHeight: idx !== -1 ? swellHeights[idx] : undefined,
                });
            });
        } else if (tideHeights.length > 0) {
            // Fallback: detect from hourly inflection
            let tideTrend = 0;
            for (let i = 1; i < tideHeights.length; i++) {
                if (!tideHeights[i] || !tideHeights[i - 1]) continue;
                const diff = tideHeights[i] - tideHeights[i - 1];

                if (diff > EPSILON) {
                    if (tideTrend === -1) {
                        const idx = i - 1;
                        rawEvents.push({
                            time: interpolateExtremeTime(times, tideHeights, idx),
                            type: 'Low Tide',
                            currentSpeed: speeds[idx] ?? 0,
                            tideHeight: tideHeights[idx],
                            swellHeight: swellHeights[idx],
                        });
                    }
                    tideTrend = 1;
                } else if (diff < -EPSILON) {
                    if (tideTrend === 1) {
                        const idx = i - 1;
                        rawEvents.push({
                            time: interpolateExtremeTime(times, tideHeights, idx),
                            type: 'High Tide',
                            currentSpeed: speeds[idx] ?? 0,
                            tideHeight: tideHeights[idx],
                            swellHeight: swellHeights[idx],
                        });
                    }
                    tideTrend = -1;
                }
            }
        }

        // ── 3. Filter + Sort ─────────────────────────────────────────────────
        const now = new Date();
        const futureLimit = addDays(now, FORECAST_DAYS);

        const sorted = rawEvents
            .filter(e => {
                if (!e.time) return false;
                const d = parseSafe(e.time);
                return d.getTime() !== 0 && d >= now && d <= futureLimit;
            })
            .sort((a, b) => parseSafe(a.time).getTime() - parseSafe(b.time).getTime());

        // ── 4. Inject Day Separators ─────────────────────────────────────────
        const withSeparators: MarineEvent[] = [];
        let lastDay: Date | null = null;

        for (const evt of sorted) {
            const d = parseSafe(evt.time);
            if (!lastDay || !isSameDay(lastDay, d)) {
                withSeparators.push({
                    type: 'separator',
                    time: evt.time,
                    label: format(d, 'EEEE, MMM d'),
                });
                lastDay = d;
            }
            withSeparators.push({
                type: evt.type,
                time: evt.time,
                currentSpeed: evt.currentSpeed,
                tideHeight: evt.tideHeight,
                swellHeight: evt.swellHeight,
            });
        }

        return withSeparators;
    }, [tides]);
}
