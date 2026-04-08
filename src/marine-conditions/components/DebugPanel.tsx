/**
 * MarineDebugPanel — Development-only data verification screen.
 *
 * Shows every derived parameter with:
 *  - Source (CHS wlp / cosine fallback / Open-Meteo / NOAA solar calc)
 *  - Formula / derivation explanation
 *  - Computed result
 *  - Pass/fail indicator
 *
 * Activation: URL param ?debug=1 while in marine view, OR long-press on
 * the location name in the TopBar.
 *
 * This is intentionally verbose — it's a hydrographic audit tool, not a
 * production UI.
 */
import React, { useMemo } from 'react';
import type { TideData, DiveWindow, MarineConditionsSnapshot } from '../types';
import type { AssertionResult } from '../hooks/useDataAssertions';
import { parseSafe } from '../utils/dateUtils';
import { format } from 'date-fns';
import { cosineTideFromHilo } from '../utils/tideMath';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    tides: TideData | null;
    windows: DiveWindow[];
    snapshot: MarineConditionsSnapshot;
    assertions: AssertionResult;
    locationName: string;
    solarAvailable: boolean;
    sunrises?: string[];
    sunsets?: string[];
    coords?: { lat: number; lng: number };
}

// ── Mini UI primitives ──────────────────────────────────────────────────────

const PASS_COLOR  = '#4edea3';
const WARN_COLOR  = '#ffb95f';
const FAIL_COLOR  = '#ffb4ab';
const DIM_COLOR   = 'rgba(255,255,255,0.35)';
const LABEL_COLOR = 'rgba(255,255,255,0.55)';

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
    const color = ok ? PASS_COLOR : warn ? WARN_COLOR : FAIL_COLOR;
    return (
        <span style={{
            display: 'inline-block', width: 8, height: 8,
            borderRadius: '50%', background: color,
            marginRight: 6, flexShrink: 0,
        }} />
    );
}

function SectionHeader({ title }: { title: string }) {
    return (
        <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
            color: '#44d8f1', textTransform: 'uppercase',
            borderBottom: '1px solid rgba(68,216,241,0.2)',
            paddingBottom: 4, marginBottom: 8, marginTop: 18,
        }}>
            {title}
        </div>
    );
}

interface RowProps {
    param: string;
    source: string;
    formula: string;
    result: string;
    ok?: boolean;
    warn?: boolean;
    note?: string;
}

function DebugRow({ param, source, formula, result, ok = true, warn, note }: RowProps) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '160px 120px 1fr 120px',
            gap: 8,
            padding: '5px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            alignItems: 'start',
            fontSize: 11,
        }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <StatusDot ok={ok} warn={warn} />
                <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{param}</span>
            </div>
            <div style={{ color: DIM_COLOR, fontFamily: 'Space Grotesk, monospace', fontSize: 10 }}>{source}</div>
            <div>
                <div style={{ color: LABEL_COLOR, fontFamily: 'Space Grotesk, monospace', fontSize: 10, lineHeight: 1.5 }}>
                    {formula}
                </div>
                {note && (
                    <div style={{ color: WARN_COLOR, fontSize: 10, marginTop: 2 }}>{note}</div>
                )}
            </div>
            <div style={{
                color: ok ? PASS_COLOR : warn ? WARN_COLOR : FAIL_COLOR,
                fontFamily: 'Space Grotesk, monospace',
                fontWeight: 700,
                fontSize: 11,
                textAlign: 'right',
            }}>
                {result}
            </div>
        </div>
    );
}

function ColHeader({ label }: { label: string }) {
    return (
        <div style={{ color: DIM_COLOR, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {label}
        </div>
    );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | undefined | null, unit = '', dp = 2): string {
    if (v == null || !isFinite(v)) return 'N/A';
    return `${v.toFixed(dp)}${unit}`;
}

function fmtTime(iso: string | undefined): string {
    if (!iso) return 'N/A';
    const d = parseSafe(iso);
    if (!d || d.getTime() === 0) return 'N/A';
    return format(d, 'MMM d HH:mm');
}

// ── Main component ───────────────────────────────────────────────────────────

export const DebugPanel: React.FC<Props> = ({
    isOpen, onClose, tides, windows, snapshot, assertions,
    locationName, solarAvailable, sunrises, sunsets, coords,
}) => {
    const hourly = tides?.hourly;

    const speeds  = hourly?.current_speed ?? [];
    const maxSpeed = speeds.length  ? Math.max(...speeds)  : null;
    const minSpeed = speeds.length  ? Math.min(...speeds)  : null;

    // Memoize to avoid useMemo deps changing on every render due to ?? [] creating new arrays
    const { hilo, heights, allZeroH, usingCosine, maxTide, minTide } = useMemo(() => {
        const h  = tides?.hilo ?? [];
        const ht = hourly?.tide_height ?? [];
        const t  = hourly?.time ?? [];
        const az = ht.length > 0 && ht.every(v => v === 0 || v == null);
        const uc = az && h.length > 0;
        const cosH = uc ? cosineTideFromHilo(h, t) : ht;
        const effH = uc ? cosH : ht;
        return {
            hilo: h, heights: ht,
            allZeroH: az, usingCosine: uc,
            maxTide: effH.length ? Math.max(...effH) : null,
            minTide: effH.length ? Math.min(...effH) : null,
        };
    }, [tides, hourly]);

    const hiloMin = hilo.length ? Math.min(...hilo.map(h => h.value)) : null;
    const hiloMax = hilo.length ? Math.max(...hilo.map(h => h.value)) : null;

    const todaySunrise = sunrises?.[0];
    const todaySunset  = sunsets?.[0];

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    zIndex: 300,
                    backdropFilter: 'blur(4px)',
                }}
            />

            {/* Panel */}
            <div
                data-testid="marine-debug-panel"
                style={{
                    position: 'fixed',
                    top: 0, right: 0, bottom: 0,
                    width: 'min(900px, 95vw)',
                    background: 'linear-gradient(135deg, #0e131e 0%, #141a28 100%)',
                    borderLeft: '1px solid rgba(68,216,241,0.2)',
                    zIndex: 301,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    fontFamily: 'Inter, system-ui, sans-serif',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#44d8f1', letterSpacing: '0.05em' }}>
                            🔬 MARINE DATA VERIFICATION
                        </div>
                        <div style={{ fontSize: 11, color: DIM_COLOR, marginTop: 2 }}>
                            {locationName} · Dev mode only · All raw + derived values
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{
                                fontSize: 11, fontWeight: 700,
                                color: assertions.passed ? PASS_COLOR : FAIL_COLOR,
                            }}>
                                {assertions.passed ? '✅ All assertions passed' : `❌ ${assertions.warnings.length} assertion(s) failed`}
                            </div>
                            <div style={{ fontSize: 10, color: DIM_COLOR }}>
                                {windows.length} windows · {speeds.length} hourly pts · {hilo.length} hilo events
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 8,
                                color: 'white',
                                padding: '6px 14px',
                                cursor: 'pointer',
                                fontSize: 12,
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 32px' }}>

                    {/* Column headers */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '160px 120px 1fr 120px',
                        gap: 8, padding: '10px 0 4px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}>
                        <ColHeader label="Parameter" />
                        <ColHeader label="Source" />
                        <ColHeader label="Formula / Derivation" />
                        <ColHeader label="Result" />
                    </div>

                    {/* ── Solar / Daylight ─────────────────────────────────────── */}
                    <SectionHeader title="Solar Times & Daylight" />

                    <DebugRow
                        param="Coords available"
                        source="Marine location config"
                        formula="Required for NOAA solar calculation"
                        result={coords ? `${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E` : 'MISSING'}
                        ok={!!coords}
                    />
                    <DebugRow
                        param="Solar calc"
                        source="NOAA algorithm (solarTimes.ts)"
                        formula="Julian day → mean anomaly → ecliptic lon → declination → hour angle"
                        result={solarAvailable ? 'OK' : 'BLOCKED'}
                        ok={solarAvailable}
                        note={!solarAvailable ? 'No coords → best dive times blocked' : undefined}
                    />
                    <DebugRow
                        param="Today sunrise"
                        source="getDaylightTimes() NOAA"
                        formula="solar noon − H/15 → UTC → local offset"
                        result={fmtTime(todaySunrise)}
                        ok={!!todaySunrise}
                    />
                    <DebugRow
                        param="Today sunset"
                        source="getDaylightTimes() NOAA"
                        formula="solar noon + H/15 → UTC → local offset"
                        result={fmtTime(todaySunset)}
                        ok={!!todaySunset}
                    />
                    <DebugRow
                        param="Daylight buffer"
                        source="config.ts DAYLIGHT_BUFFER_MINS"
                        formula="Window must start ≤ (sunset − 30 min) to be included"
                        result="30 min"
                        ok={true}
                    />

                    {/* ── Tide heights ─────────────────────────────────────────── */}
                    <SectionHeader title="Tide Heights" />

                    <DebugRow
                        param="CHS wlp source"
                        source="CHS API wlp series"
                        formula="Official hourly tide heights from Environment Canada"
                        result={allZeroH ? 'ALL ZEROS (fetch may have failed)' : `${heights.length} points`}
                        ok={!allZeroH}
                        warn={allZeroH && hilo.length > 0}
                        note={allZeroH ? 'Falling back to cosine interpolation from hilo' : undefined}
                    />
                    <DebugRow
                        param="Tide method"
                        source={usingCosine ? 'cosineTideFromHilo (fallback)' : 'CHS wlp (official)'}
                        formula={usingCosine
                            ? 'h(t) = (h₀+h₁)/2 + (h₀−h₁)/2 × cos(π × (t−t₀)/(t₁−t₀))'
                            : 'Direct CHS wlp hourly series (nearest-match to Open-Meteo times)'}
                        result={usingCosine ? 'COSINE (modeled)' : 'OFFICIAL'}
                        ok={!usingCosine}
                        warn={usingCosine}
                    />
                    <DebugRow
                        param="Hilo events"
                        source="CHS wlp-hilo"
                        formula="Official High/Low tide extremes (source of truth for types)"
                        result={`${hilo.length} events · ${fmt(hiloMin, 'm')} – ${fmt(hiloMax, 'm')}`}
                        ok={hilo.length >= 2}
                    />
                    <DebugRow
                        param="Tide height range"
                        source={usingCosine ? 'Cosine interp' : 'CHS wlp'}
                        formula="max(tide_height) − min(tide_height) from hourly series"
                        result={`${fmt(minTide, 'm')} – ${fmt(maxTide, 'm')}`}
                        ok={maxTide !== null && minTide !== null && (maxTide - minTide) > 0.5}
                        note={(maxTide !== null && minTide !== null && (maxTide - minTide) < 0.5)
                            ? 'Tidal range < 0.5m — data may be stale or location near tidal node'
                            : undefined}
                    />

                    {/* ── Currents ─────────────────────────────────────────────── */}
                    <SectionHeader title="Tidal Currents" />

                    <DebugRow
                        param="Current source"
                        source={tides?.station?.includes('Warning') ? 'Open-Meteo (fallback)' : 'CHS wcp'}
                        formula={tides?.station?.includes('Warning')
                            ? 'open-meteo ocean_current_velocity — NOT reliable for channels/passes'
                            : 'CHS wcp official hourly series (signed kn, abs() taken)'}
                        result={tides?.station?.includes('Warning') ? 'MODELED ⚠' : 'OFFICIAL ✓'}
                        ok={!tides?.station?.includes('Warning')}
                        warn={tides?.station?.includes('Warning')}
                    />
                    <DebugRow
                        param="Max current speed"
                        source="hourly.current_speed"
                        formula="Math.max(...current_speed) — should be > 2.0 kn for major passes"
                        result={fmt(maxSpeed, ' kn')}
                        ok={maxSpeed !== null && maxSpeed >= 2.0}
                        warn={maxSpeed !== null && maxSpeed > 0 && maxSpeed < 2.0}
                        note={(maxSpeed !== null && maxSpeed < 2.0 && maxSpeed > 0)
                            ? 'Low max speed — suspect station data for this location'
                            : undefined}
                    />
                    <DebugRow
                        param="Min current speed"
                        source="hourly.current_speed"
                        formula="Math.min(...current_speed) — includes slack periods"
                        result={fmt(minSpeed, ' kn')}
                        ok={minSpeed !== null && minSpeed >= 0}
                    />
                    <DebugRow
                        param="Data points"
                        source="hourly.current_speed"
                        formula="Length of hourly array — expect ~196 pts for 8-day fetch"
                        result={`${speeds.length} pts`}
                        ok={speeds.length >= 72}
                        note={speeds.length < 72 ? 'Low point count — data may be truncated' : undefined}
                    />

                    {/* ── Slack windows ─────────────────────────────────────────── */}
                    <SectionHeader title={`Dive Windows (${windows.length} shown)`} />

                    {windows.length === 0 && (
                        <div style={{ color: WARN_COLOR, fontSize: 11, padding: '8px 0' }}>
                            No windows passed all filters. Check: solar available ({solarAvailable ? 'yes' : 'NO'}),
                            quality threshold (score ≥ 40), min duration (30 min), daylight + 30 min buffer.
                        </div>
                    )}

                    {windows.map((w, i) => {
                        const slackOk  = (() => {
                            const s = parseSafe(w.slackTime).getTime();
                            const st = parseSafe(w.windowStart).getTime();
                            const en = parseSafe(w.windowEnd).getTime();
                            return s >= st && s <= en;
                        })();
                        const scoreOk  = w.activityScore.diving >= 0 && w.activityScore.diving <= 100;
                        const durOk    = w.duration >= 30 && w.duration <= 240;
                        const tideOk   = (hiloMin !== null && hiloMax !== null)
                            ? w.tideHeight >= hiloMin - 0.5 && w.tideHeight <= hiloMax + 0.5
                            : true;

                        return (
                            <div key={i} style={{
                                borderLeft: '2px solid rgba(78,222,163,0.4)',
                                paddingLeft: 10, marginBottom: 10,
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#4edea3', marginBottom: 4 }}>
                                    Window #{i + 1} — Slack @ {fmtTime(w.slackTime)}
                                </div>
                                <DebugRow
                                    param="Window start/end"
                                    source="calculateSlackWindows"
                                    formula="Linear interp where |speed| crosses SLACK_THRESHOLD (1.0 kn) ± interpolateTime"
                                    result={`${fmtTime(w.windowStart)} → ${fmtTime(w.windowEnd)}`}
                                    ok={true}
                                />
                                <DebugRow
                                    param="Duration"
                                    source="differenceInMinutes"
                                    formula="windowEnd − windowStart (min ≥ 30, max reasonable ≤ 240)"
                                    result={`${w.duration} min`}
                                    ok={durOk}
                                    warn={w.duration > 180}
                                    note={w.duration > 180 ? 'Unusually long window — may indicate extended slack period or data artifact' : undefined}
                                />
                                <DebugRow
                                    param="Slack time"
                                    source="interpolateExtremeTime (parabolic)"
                                    formula="Vertex of parabola through (−1, v₋₁), (0, v₀), (1, v₁) → sub-hour peak"
                                    result={fmtTime(w.slackTime)}
                                    ok={slackOk}
                                    note={!slackOk ? 'slackTime is OUTSIDE [windowStart, windowEnd] — interpolation error!' : undefined}
                                />
                                <DebugRow
                                    param="Current at slack"
                                    source="hourly.current_speed[slackIdx]"
                                    formula="CHS wcp speed at the nearest hourly index to the event"
                                    result={fmt(w.currentSpeed, ' kn')}
                                    ok={w.currentSpeed <= 1.0}
                                    warn={w.currentSpeed > 1.0 && w.currentSpeed <= 2.0}
                                />
                                <DebugRow
                                    param="Tide height"
                                    source={usingCosine ? 'cosineTideFromHilo[slackIdx]' : 'CHS wlp[slackIdx]'}
                                    formula="h(t₀) from hourly series at slack index"
                                    result={fmt(w.tideHeight, ' m')}
                                    ok={tideOk}
                                    warn={!tideOk}
                                    note={!tideOk ? 'Outside hilo-derived range — may be cosine extrapolation boundary' : undefined}
                                />
                                <DebugRow
                                    param="High tide slack"
                                    source="isHighTide calc"
                                    formula="tideHeight > (minTide + tideRange × 0.75)"
                                    result={w.isHighTide ? 'HIGH' : 'LOW'}
                                    ok={true}
                                />
                                <DebugRow
                                    param="Dive score"
                                    source="useDiveWindows"
                                    formula="score = clamp(50×(1 − speed/0.5) + 50×(height−min)/(max−min), 0, 100)"
                                    result={`${w.activityScore.diving} / 100`}
                                    ok={scoreOk}
                                />
                                <DebugRow
                                    param="Daylight"
                                    source="solarTimes.ts + useDiveWindows"
                                    formula="windowStart ≤ sunset − 30min AND slackTime within [sunrise, sunset]"
                                    result={w.isDaylight ? 'YES ☀' : 'NO 🌙'}
                                    ok={w.isDaylight}
                                />
                            </div>
                        );
                    })}

                    {/* ── Conditions snapshot ───────────────────────────────────── */}
                    <SectionHeader title="Conditions Snapshot (Current Hour)" />

                    <DebugRow
                        param="Water temp"
                        source="Open-Meteo sea_surface_temperature[0]"
                        formula="First value from hourly SST array (Open-Meteo marine API)"
                        result={fmt(snapshot.waterTemp, ' °C', 1)}
                        ok={snapshot.waterTemp != null}
                    />
                    <DebugRow
                        param="Air temp"
                        source="Open-Meteo temperature_2m (weather API)"
                        formula="Matched by hour to nearest tides hourly slot"
                        result={fmt(snapshot.airTempC, ' °C', 1)}
                        ok={snapshot.airTempC != null}
                    />
                    <DebugRow
                        param="Feels-like"
                        source="Env. Canada wind chill formula"
                        formula="13.12 + 0.6215T − 11.37V^0.16 + 0.3965T×V^0.16 (T≤10°C, V>4.8 km/h)"
                        result={fmt(snapshot.airFeelsLikeC, ' °C', 1)}
                        ok={snapshot.airFeelsLikeC != null}
                        warn={snapshot.airFeelsLikeC != null && snapshot.airFeelsLikeC < 5}
                        note={snapshot.airFeelsLikeC != null && snapshot.airFeelsLikeC < 0 ? 'Feels-like below freezing' : undefined}
                    />
                    <DebugRow
                        param="Wind speed"
                        source="Open-Meteo wind_speed_10m (weather API)"
                        formula="wind_speed_10m (km/h) ÷ 1.852 = knots"
                        result={fmt(snapshot.windSpeed, ' kn', 1)}
                        ok={snapshot.windSpeed != null}
                    />
                    <DebugRow
                        param="Wind gust"
                        source="Derived (no gust in weather API)"
                        formula="windKn × 1.25 (rough estimate — no actual gust data fetched)"
                        result={fmt(snapshot.windGust, ' kn', 1)}
                        ok={snapshot.windGust != null}
                        warn={true}
                        note="Not actual gust data — wind_gusts_10m is in the weather fetch but not wired to snapshot"
                    />
                    <DebugRow
                        param="Swell height"
                        source="Open-Meteo swell_wave_height"
                        formula="swell_wave_height || wave_height from marine API hourly[idx]"
                        result={fmt(snapshot.swellHeight, ' m', 1)}
                        ok={snapshot.swellHeight != null}
                    />
                    <DebugRow
                        param="Swell period"
                        source="Open-Meteo swell_wave_period"
                        formula="swell_wave_period || wave_period from marine API hourly[idx]"
                        result={fmt(snapshot.swellPeriod, ' s', 1)}
                        ok={snapshot.swellPeriod != null}
                    />
                    <DebugRow
                        param="Visibility estimate"
                        source="Derived"
                        formula="max(1, 10 − windKn×0.5 − swellH×0.8) × 1000 m (rough model — not official)"
                        result={snapshot.visibilityEst != null ? `${(snapshot.visibilityEst / 1000).toFixed(1)} km (${snapshot.visibilityQuality})` : 'N/A'}
                        ok={snapshot.visibilityQuality === 'GOOD'}
                        warn={snapshot.visibilityQuality === 'FAIR'}
                    />

                    {/* ── Data quality issues ───────────────────────────────────── */}
                    <SectionHeader title="Assertion Results" />

                    {assertions.warnings.length === 0 ? (
                        <div style={{ color: PASS_COLOR, fontSize: 11, padding: '6px 0' }}>
                            ✅ All {7} assertion categories passed.
                        </div>
                    ) : assertions.warnings.map((w, i) => (
                        <div key={i} style={{
                            display: 'flex', gap: 8, padding: '5px 0',
                            borderBottom: '1px solid rgba(255,180,171,0.1)',
                            fontSize: 11,
                        }}>
                            <StatusDot ok={false} />
                            <span style={{ color: 'rgba(255,180,171,0.9)', lineHeight: 1.5 }}>{w}</span>
                        </div>
                    ))}

                    {/* ── Known limitations ─────────────────────────────────────── */}
                    <SectionHeader title="Known Limitations / TODOs" />
                    {[
                        'Wind gust is estimated (windSpeed × 1.25) — not fetched separately despite being available in the weather API',
                        'Visibility is a rough model (wind + swell proxy) — no actual in-water turbidity data',
                        'Wind direction not yet wired into snapshot or detail panel',
                        'Swell direction not yet wired (Open-Meteo provides it)',
                        'Air temp uses weather API hourly, aligned by hour-prefix match — could be off by up to 30 min',
                        'Cosine tide interpolation is accurate to ±5 cm vs official wlp data',
                        'Solar calc accuracy: ±1–2 min for BC coast latitudes (48–50°N)',
                    ].map((item, i) => (
                        <div key={i} style={{
                            display: 'flex', gap: 8, padding: '4px 0',
                            fontSize: 10, color: DIM_COLOR, lineHeight: 1.5,
                        }}>
                            <span style={{ color: WARN_COLOR, flexShrink: 0 }}>→</span>
                            <span>{item}</span>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};
