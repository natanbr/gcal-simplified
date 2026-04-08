import React from 'react';
import { format } from 'date-fns';
import { parseSafe } from '../utils/dateUtils';
import type { MarineEvent, MarineEventType, TideData } from '../types';

interface WeatherHourlyRef {
    time: string[];
    wind_speed_10m?: number[];
}

interface Props {
    events: MarineEvent[];
    tides: TideData | null;
    weather?: WeatherHourlyRef;
    isLoading: boolean;
}

// ── Type colour / dot map ─────────────────────────────────────────────────────

const dotClass: Record<MarineEventType, string> = {
    'Slack':     'marine-dot-slack',
    'Max Flood': 'marine-dot-flood',
    'Max Ebb':   'marine-dot-ebb',
    'High Tide': 'marine-dot-high',
    'Low Tide':  'marine-dot-low',
    'separator': '',
};

const eventColor: Record<MarineEventType, string> = {
    'Slack':     'var(--mc-teal)',
    'Max Flood': 'var(--mc-amber)',
    'Max Ebb':   'var(--mc-coral)',
    'High Tide': 'var(--mc-blue)',
    'Low Tide':  'var(--mc-teal)',
    'separator': 'var(--mc-text-dim)',
};

const SPEED_DANGER = 1.5;
const SPEED_CAUTION = 1.0;

function speedColor(knots: number): string {
    if (knots >= SPEED_DANGER) return 'var(--mc-danger)';
    if (knots >= SPEED_CAUTION) return 'var(--mc-caution)';
    return 'var(--mc-good)';
}

export const MarineEventsTable: React.FC<Props> = ({ events, tides, weather, isLoading }) => {
    return (
        <div
            data-testid="marine-events-table"
            style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
        >
            <div className="marine-section-label">Marine Events</div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {isLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <SkeletonRow key={i} />
                        ))}
                    </div>
                )}

                {!isLoading && events.length === 0 && (
                    <div style={{ paddingTop: 30, textAlign: 'center', color: 'var(--mc-text-dim)', fontSize: 13 }}>
                        No events — select a location with active tidal data.
                    </div>
                )}

                {!isLoading && events.length > 0 && (
                    <table
                        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
                        data-testid="events-table-element"
                    >
                        <thead>
                            <tr>
                                {['Event', 'Time', 'Current', 'Tide', 'Swell', 'Wind'].map(h => (
                                    <th key={h} style={{
                                        padding: '0 8px 8px',
                                        textAlign: h === 'Event' ? 'left' : 'center',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                        color: 'var(--mc-text-dim)',
                                        borderBottom: '1px solid var(--mc-border)',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((evt, i) => {
                                if (evt.type === 'separator') {
                                    return (
                                        <tr key={`sep-${i}`}>
                                            <td colSpan={6} style={{
                                                padding: '10px 8px 4px',
                                                fontSize: 10,
                                                fontWeight: 700,
                                                letterSpacing: '0.12em',
                                                textTransform: 'uppercase',
                                                color: 'var(--mc-text-dim)',
                                            }}>
                                                {evt.label}
                                            </td>
                                        </tr>
                                    );
                                }

                                // Correlate with weather for wind
                                const weatherIdx = weather?.time.findIndex(
                                    t => t.startsWith(evt.time.substring(0, 13))
                                ) ?? -1;
                                const wind = weatherIdx !== -1
                                    ? (weather?.wind_speed_10m?.[weatherIdx] ?? 0)
                                    : (evt.windSpeed ?? 0);

                                // Correlate with tides for swell
                                const tidesIdx = tides?.hourly.time.findIndex(
                                    t => t.startsWith(evt.time.substring(0, 13))
                                ) ?? -1;
                                const swellH = tidesIdx !== -1
                                    ? (tides?.hourly.wave_height?.[tidesIdx] ?? evt.swellHeight ?? 0)
                                    : (evt.swellHeight ?? 0);

                                const evtColor = eventColor[evt.type];
                                const isCurrent = evt.type === 'Slack' || evt.type === 'Max Flood' || evt.type === 'Max Ebb';

                                return (
                                    <tr
                                        key={`${evt.type}-${evt.time}`}
                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        {/* Event type */}
                                        <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                <div style={{
                                                    width: 7, height: 7, borderRadius: '50%',
                                                    background: evtColor, flexShrink: 0,
                                                }} className={dotClass[evt.type]} />
                                                <span style={{ fontWeight: 600, color: evtColor, fontSize: 12 }}>
                                                    {evt.type}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Time */}
                                        <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--mc-text-muted)', fontFamily: 'Space Grotesk, monospace' }}>
                                            {format(parseSafe(evt.time), 'HH:mm')}
                                        </td>

                                        {/* Current */}
                                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                            {isCurrent && evt.currentSpeed != null ? (
                                                <span
                                                    className="marine-data"
                                                    style={{ fontWeight: 700, color: speedColor(evt.currentSpeed) }}
                                                >
                                                    {evt.currentSpeed.toFixed(1)}kn
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--mc-text-dim)' }}>—</span>
                                            )}
                                        </td>

                                        {/* Tide height */}
                                        <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--mc-text-muted)' }}>
                                            {evt.tideHeight != null
                                                ? <span className="marine-data">{evt.tideHeight.toFixed(1)}m</span>
                                                : '—'}
                                        </td>

                                        {/* Swell */}
                                        <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--mc-text-muted)' }}>
                                            <span className="marine-data">{swellH.toFixed(1)}m</span>
                                        </td>

                                        {/* Wind */}
                                        <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--mc-text-muted)' }}>
                                            <span className="marine-data">{Math.round(wind)}kn</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

const SkeletonRow: React.FC = () => (
    <div style={{
        height: 34,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 6,
        opacity: 0.5,
    }} />
);
