import React, { useMemo } from 'react';
import {
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    ReferenceArea,
} from 'recharts';
import { format, startOfDay, addDays } from 'date-fns';
import { parseSafe } from '../utils/dateUtils';
import { cosineTideFromHilo } from '../utils/tideMath';
import { SLACK_THRESHOLD } from '../config';
import type { TideData, MarineEvent, DiveWindow } from '../types';

interface Props {
    tides: TideData | null;
    events: MarineEvent[];
    diveWindows: DiveWindow[];
    isLoading: boolean;
    /** Sunrise timestamps from weather daily (e.g. "2026-04-08T06:12") */
    sunrises?: string[];
    /** Sunset timestamps from weather daily (e.g. "2026-04-08T20:05") */
    sunsets?: string[];
}

export const TideCurrentChart: React.FC<Props> = ({
    tides, events, diveWindows, isLoading, sunrises, sunsets,
}) => {
    const data = useMemo(() => {
        if (!tides?.hourly) return [];

        const { time, current_speed } = tides.hourly;
        if (!time?.length) return [];

        // ── Tide height resolution ────────────────────────────────────────────
        // CHS wlp hourly data sometimes fails → fallback to cosine interpolation
        // from the hilo High/Low Tide events (which almost always succeed).
        let tideHeightArr = tides.hourly.tide_height ?? [];
        const allZero = tideHeightArr.length === 0 ||
            tideHeightArr.every(v => v === 0 || v == null);

        if (allZero && tides.hilo?.length) {
            tideHeightArr = cosineTideFromHilo(tides.hilo, time);
        }

        // ── Window filter: -2h → +7d ──────────────────────────────────────────
        const now = new Date();
        const windowStart = new Date(now.getTime() - 2 * 3600_000);
        const windowEnd   = new Date(now.getTime() + 7 * 24 * 3600_000);

        const points: {
            time: string;
            tideHeight: number;
            currentSpeed: number;
        }[] = [];

        for (let i = 0; i < time.length; i++) {
            const t = time[i];
            if (!t) continue;
            const dt = parseSafe(t);
            if (dt.getTime() === 0) continue;
            if (dt < windowStart || dt > windowEnd) continue;

            points.push({
                time: t,
                tideHeight:   Number((tideHeightArr[i] ?? 0).toFixed(2)),
                currentSpeed: Number((current_speed?.[i] ?? 0).toFixed(2)),
            });
        }

        // T10: 1h resolution — include every data point (was every 3rd)
        return points;
    }, [tides]);

    // Pre-compute dive window time ranges for the tooltip lookup
    const diveWindowRanges = useMemo(() =>
        diveWindows.map(w => ({
            start: parseSafe(w.windowStart).getTime(),
            end:   parseSafe(w.windowEnd).getTime(),
            slackTime: w.slackTime,
        })).filter(w => w.start !== 0 && w.end !== 0),
        [diveWindows]
    );

    // Slack event reference lines — vertical markers at Slack Water events
    const slackLines = useMemo(() =>
        events
            .filter(e => e.type === 'Slack')
            .slice(0, 14),
        [events]
    );

    // T9: Day separator lines — one at midnight of each day in the 7-day window
    const daySeparators = useMemo(() => {
        if (!data.length) return [];
        const first = parseSafe(data[0].time);
        const last  = parseSafe(data[data.length - 1].time);
        if (!first.getTime() || !last.getTime()) return [];

        const separators: { time: string; label: string }[] = [];
        let cursor = startOfDay(addDays(first, 1)); // start from the next midnight after first point
        while (cursor <= last) {
            const key = data.find(d => parseSafe(d.time) >= cursor)?.time;
            if (key) {
                separators.push({
                    time: key,
                    label: format(cursor, 'EEE, MMM d'),
                });
            }
            cursor = addDays(cursor, 1);
        }
        return separators;
    }, [data]);

    // T11: Night overlay bands — derive sunset→nextSunrise pairs from solar data
    const nightBands = useMemo(() => {
        if (!sunsets?.length || !sunrises?.length || !data.length) return [];

        // A5: Pre-compute ms timestamps once — O(n) instead of O(n×bands) parseSafe calls
        const timeMs = data.map(d => parseSafe(d.time).getTime());

        const sunriseMsList = sunrises.map(s => parseSafe(s).getTime());

        const bands: { x1: string; x2: string }[] = [];

        for (let i = 0; i < sunsets.length; i++) {
            const sunsetMs  = parseSafe(sunsets[i]).getTime();
            if (!sunsetMs) continue;

            // Find the next sunrise after this sunset
            const sunriseMs = sunriseMsList.find(ms => ms > sunsetMs);
            if (!sunriseMs) continue;

            // Snap to nearest chart data points using pre-computed ms array
            const x1Idx = timeMs.findIndex(ms => ms >= sunsetMs);
            const x2Idx = [...timeMs].reverse().findIndex(ms => ms <= sunriseMs);
            const x2RealIdx = x2Idx === -1 ? -1 : data.length - 1 - x2Idx;

            if (x1Idx === -1 || x2RealIdx === -1 || x1Idx === x2RealIdx) continue;

            bands.push({ x1: data[x1Idx].time, x2: data[x2RealIdx].time });
        }

        return bands;
    }, [sunsets, sunrises, data]);

    if (isLoading || data.length === 0) {
        const hasNoHilo = !isLoading && tides && (!tides.hilo || tides.hilo.length === 0);
        return (
            <div style={{
                height: '100%',
                minHeight: 120,
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                color: 'var(--mc-text-dim)',
                fontSize: 12,
            }}>
                {isLoading ? (
                    'Loading chart...'
                ) : hasNoHilo ? (
                    <>
                        <span style={{ fontSize: 20 }}>📡</span>
                        <span style={{ color: 'var(--mc-amber)', fontWeight: 600 }}>No tidal data received</span>
                        <span style={{ fontSize: 11, color: 'var(--mc-text-dim)', maxWidth: 260, textAlign: 'center' }}>
                            CHS wlp-hilo fetch returned no events. Chart cannot render without High/Low tide reference points.
                        </span>
                    </>
                ) : (
                    'No chart data'
                )}
            </div>
        );
    }

    return (
        <div data-testid="tide-current-chart" style={{ height: '100%', minHeight: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.05)"
                        vertical={false}
                    />

                    <XAxis
                        dataKey="time"
                        tickFormatter={t => {
                            try { return format(parseSafe(t), 'EEE HH:mm'); } catch { return ''; }
                        }}
                        tick={{ fontSize: 9, fill: 'rgba(232,238,247,0.4)', fontFamily: 'Inter' }}
                        interval={7}
                        axisLine={false}
                        tickLine={false}
                    />

                    <YAxis
                        yAxisId="tide"
                        orientation="left"
                        tick={{ fontSize: 9, fill: 'rgba(99,189,214,0.7)', fontFamily: 'Inter' }}
                        axisLine={false}
                        tickLine={false}
                        tickCount={4}
                        unit="m"
                    />

                    <YAxis
                        yAxisId="current"
                        orientation="right"
                        tick={{ fontSize: 9, fill: 'rgba(255,185,95,0.7)', fontFamily: 'Inter' }}
                        axisLine={false}
                        tickLine={false}
                        tickCount={4}
                        unit="kn"
                    />

                    {/* ── T11: Night overlay bands (sunset → sunrise) ─────────── */}
                    {nightBands.map((band, idx) => (
                        <ReferenceArea
                            key={`night-${idx}`}
                            x1={band.x1}
                            x2={band.x2}
                            yAxisId="tide"
                            fill="rgba(0, 0, 0, 0.38)"
                            stroke="none"
                            ifOverflow="hidden"
                        />
                    ))}

                    {/* ── Dive window bands: highlight actual windowStart→windowEnd ── */}
                    {diveWindowRanges.map(w => {
                        const startKey = data.find(d => parseSafe(d.time).getTime() >= w.start)?.time;
                        const endKey   = data.filter(
                            (d: { time: string }) => parseSafe(d.time).getTime() <= w.end
                        ).at(-1)?.time;
                        if (!startKey || !endKey || startKey === endKey) return null;
                        return (
                            <ReferenceArea
                                key={w.slackTime}
                                x1={startKey}
                                x2={endKey}
                                yAxisId="tide"
                                fill="rgba(78, 222, 163, 0.09)"
                                stroke="rgba(78,222,163,0.2)"
                                strokeWidth={1}
                            />
                        );
                    })}

                    {/* Slack threshold line on current axis */}
                    <ReferenceLine
                        yAxisId="current"
                        y={SLACK_THRESHOLD}
                        stroke="rgba(78,222,163,0.25)"
                        strokeDasharray="6 3"
                        strokeWidth={1}
                        label={{
                            value: 'slack',
                            position: 'insideTopRight',
                            fontSize: 8,
                            fill: 'rgba(78,222,163,0.5)',
                            fontFamily: 'Inter',
                        }}
                    />

                    {/* Slack event vertical markers */}
                    {slackLines.map(e => (
                        <ReferenceLine
                            key={e.time}
                            x={e.time}
                            yAxisId="tide"
                            stroke="rgba(78,222,163,0.45)"
                            strokeDasharray="4 4"
                            strokeWidth={1}
                        />
                    ))}

                    {/* ── T9: Day separator lines + date labels ────────────────── */}
                    {daySeparators.map(sep => (
                        <ReferenceLine
                            key={`day-${sep.time}`}
                            x={sep.time}
                            yAxisId="tide"
                            stroke="rgba(232,238,247,0.18)"
                            strokeWidth={1}
                            label={{
                                value: sep.label,
                                position: 'insideTopLeft',
                                fontSize: 9,
                                fill: 'rgba(232,238,247,0.55)',
                                fontFamily: 'Inter',
                                fontWeight: 600,
                            }}
                        />
                    ))}

                    {/* Tide height — filled area */}
                    <Area
                        yAxisId="tide"
                        type="monotone"
                        dataKey="tideHeight"
                        stroke="var(--mc-cyan)"
                        strokeWidth={2}
                        fill="url(#tideGrad)"
                        dot={false}
                        name="Tide"
                    />

                    {/* Current speed — line */}
                    <Line
                        yAxisId="current"
                        type="monotone"
                        dataKey="currentSpeed"
                        stroke="var(--mc-amber)"
                        strokeWidth={1.5}
                        dot={false}
                        name="Current"
                    />

                    <Tooltip
                        content={
                            <ChartTooltip
                                diveWindowRanges={diveWindowRanges}
                            />
                        }
                    />

                    <defs>
                        <linearGradient id="tideGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--mc-cyan)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="var(--mc-cyan)" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

// ── Custom tooltip ─────────────────────────────────────────────────────────────

interface DiveWindowRange {
    start: number;
    end: number;
    slackTime: string;
}

const ChartTooltip: React.FC<{
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
    diveWindowRanges: DiveWindowRange[];
}> = ({ active, payload, label, diveWindowRanges }) => {
    if (!active || !payload?.length || !label) return null;

    const labelMs = parseSafe(label).getTime();
    const window = diveWindowRanges.find(w => labelMs >= w.start && labelMs <= w.end);
    const isDiveWindow = !!window;

    let timeLabel = label;
    try { timeLabel = format(parseSafe(label), 'EEE MMM d, HH:mm'); } catch { /* raw */ }

    return (
        <div style={{
            background: '#161d2b',
            border: `1px solid ${isDiveWindow ? 'rgba(78,222,163,0.5)' : 'var(--mc-border-bright)'}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: 'Inter, system-ui, sans-serif',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
            <div style={{ color: 'var(--mc-text-dim)', fontSize: 10, marginBottom: 6, letterSpacing: '0.06em' }}>
                {timeLabel}
            </div>
            {isDiveWindow && (
                <div style={{ color: 'rgba(78,222,163,0.9)', fontSize: 10, marginBottom: 6, fontWeight: 600 }}>
                    ✦ Dive window — low current
                </div>
            )}
            {payload.map(p => (
                <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
                    <span style={{ color: p.color }}>{p.name}</span>
                    <span className="marine-data" style={{ color: 'var(--mc-text)', fontWeight: 700 }}>
                        {p.value.toFixed(1)}{p.name === 'Tide' ? 'm' : 'kn'}
                    </span>
                </div>
            ))}
        </div>
    );
};
