import React, { useEffect, useMemo } from 'react';
import './marine.css';

// Hooks
import { useMarineSettings }  from './hooks/useMarineSettings';
import { useMarineData }       from './hooks/useMarineData';
import { useMarineEvents }     from './hooks/useMarineEvents';
import { useDiveWindows }      from './hooks/useDiveWindows';
import { useGuidePanel }       from './hooks/useGuidePanel';
import { useDataQuality }     from './hooks/useDataQuality';
import { useDataAssertions }  from './hooks/useDataAssertions';

// Components
import { MarineTopBar }           from './components/MarineTopBar';
import { BestWindowsPanel }       from './components/BestWindowsPanel';
import { TideCurrentChart }       from './components/TideCurrentChart';
import { MarineEventsTable }      from './components/MarineEventsTable';
import { ConditionsPanel }        from './components/ConditionsPanel';
import { GuidePanel }             from './components/GuidePanel';
import { LoadingOverlay }         from './components/LoadingOverlay';
import { DataSourcesFooter }      from './components/DataSourcesFooter';
import { DataErrorState }         from './components/DataErrorState';
import { DiveWindowDetailPanel }  from './components/DiveWindowDetailPanel';
import { DebugPanel }             from './components/DebugPanel';
import { ChartErrorBoundary }     from './components/ChartErrorBoundary';

// Utils
import { getLocationById }     from './utils/marineLocations';
import { parseSafe }           from './utils/dateUtils';

// Types
import type { ActivityProfile, DiveWindow, MarineConditionsSnapshot } from './types';

// ── Props ─────────────────────────────────────────────────────────────────────

interface MarineConditionsProps {
    onBackToCalendar: () => void;
    /**
     * Optional weather data passed from the parent for wind cross-referencing
     * in the events table.
     */
    weather?: {
        hourly: {
            time: string[];
            wind_speed_10m?: number[];
            temperature_2m?: number[];   // °C — used for air feels-like calc
        };
        daily: { sunrise?: string[]; sunset?: string[] };
    };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MarineConditions({ onBackToCalendar, weather }: MarineConditionsProps) {
    const { settings, updateSettings } = useMarineSettings();
    const { state, activate }          = useMarineData(settings.locationId);
    const { isGuideOpen, openGuide, closeGuide } = useGuidePanel();

    const [activity, setActivity]            = React.useState<ActivityProfile>('diving');
    const [selectedWindow, setSelectedWindow] = React.useState<DiveWindow | null>(null);
    const [debugOpen, setDebugOpen]           = React.useState(
        () => new URLSearchParams(window.location.search).get('debug') === '1'
    );

    // Lazy-activate marine data fetch on mount and when location changes
    useEffect(() => {
        activate();
    }, [activate]);

    // Derived data
    const location = getLocationById(settings.locationId);
    const events   = useMarineEvents(state.data);

    // Build conditions snapshot from the first future hour of tides data.
    // Computed BEFORE useDiveWindows so it can feed the scoring model.
    const snapshot: MarineConditionsSnapshot = useMemo(() => {
        const hourly = state.data?.hourly;
        if (!hourly) return {};

        const now = new Date();
        const idx = hourly.time.findIndex(t => t && parseSafe(t) >= now);
        if (idx === -1) return {};

        const windIdx = weather?.hourly.time.findIndex(t => t.startsWith(hourly.time[idx]?.substring(0, 13) ?? '')) ?? -1;
        const windKph = windIdx !== -1 ? (weather?.hourly.wind_speed_10m?.[windIdx] ?? 0) : 0;
        const windKn  = windKph / 1.852;

        // Air temperature + feels-like
        // Feels-like (wind chill) formula: valid for T ≤ 10°C and V > 4.8 km/h
        const airTempC = windIdx !== -1 ? (weather?.hourly.temperature_2m?.[windIdx] ?? null) : null;
        const feelsLikeC = (airTempC !== null && windKph > 4.8 && airTempC <= 10)
            ? 13.12 + 0.6215 * airTempC - 11.37 * Math.pow(windKph, 0.16) + 0.3965 * airTempC * Math.pow(windKph, 0.16)
            : airTempC;

        const swellH = hourly.wave_height?.[idx] ?? 0;
        const swellP = (hourly as { wave_period?: number[] }).wave_period?.[idx] ?? 0;

        // Visibility: rough estimate based on wind + swell
        const visRaw = Math.max(1, 10 - windKn * 0.5 - swellH * 0.8) * 1000; // 1–10km to metres
        const visQ   = visRaw >= 6000 ? 'GOOD' : visRaw >= 3000 ? 'FAIR' : 'POOR';

        return {
            swellHeight:      swellH,
            swellPeriod:      swellP,
            swellDirection:   undefined,
            waterTemp:        state.data?.water_temperature,
            airTempC:         airTempC ?? undefined,
            airFeelsLikeC:    feelsLikeC ?? undefined,
            windSpeed:        windKn,
            windGust:         windKph > 0 ? windKn * 1.25 : undefined,
            windDirection:    undefined,
            visibilityEst:    visRaw,
            visibilityQuality: visQ,
            isSuspect:        state.isSuspect,
        };
    }, [state.data, state.isSuspect, weather]);

    const { windows: diveWindows, solarAvailable } = useDiveWindows({
        tides:    state.data,
        events,
        coords:   location.coords,
        // Prefer marine-fetched sunrise/sunset (now included in TideData); fall back to land weather prop
        sunrises: state.data?.sunrise ?? weather?.daily.sunrise,
        sunsets:  state.data?.sunset  ?? weather?.daily.sunset,
        snapshot: {
            swellHeight:   snapshot.swellHeight,
            windSpeed:     snapshot.windSpeed,
            visibilityEst: snapshot.visibilityEst,
        },
    });

    const quality    = useDataQuality(state.data);
    const assertions = useDataAssertions(state.data, diveWindows);
    const isLoading  = state.isLoading;

    // Hard error: IPC error or data fundamentally unusable
    const showErrorState = !isLoading && (state.isError || (!state.data && !isLoading));
    // Data loaded but quality is suspect
    const showSuspectBanner = quality.isValid && quality.isSuspect;

    return (
        <div
            className="marine-root"
            data-testid="marine-root"
        >
            {isLoading && <LoadingOverlay />}

            <MarineTopBar
                activity={activity}
                onActivityChange={setActivity}
                onBack={onBackToCalendar}
                onGuide={openGuide}
                onDebug={process.env.NODE_ENV === 'development' ? () => setDebugOpen(true) : undefined}
                locationId={settings.locationId}
                onLocationChange={id => updateSettings({ locationId: id })}
            />

            {/* ── Suspect data banner (non-blocking) ────────────────────────── */}
            {showSuspectBanner && (
                <div
                    data-testid="suspect-data-banner"
                    style={{
                        padding: '6px 20px',
                        background: 'rgba(255,185,95,0.12)',
                        borderBottom: '1px solid rgba(255,185,95,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: 'var(--mc-amber, #ffb95f)',
                        flexShrink: 0,
                    }}
                >
                    <span>⚠</span>
                    <span>Station data may be lower quality than expected. Conditions shown but treat with caution.</span>
                    {process.env.NODE_ENV === 'development' && quality.issues.length > 0 && (
                        <span style={{ marginLeft: 8, opacity: 0.6 }}>[dev: {quality.issues.join(' | ')}]</span>
                    )}
                </div>
            )}

            {/* ── Error state: replace body with full-panel error ───────────── */}
            {showErrorState ? (
                <DataErrorState
                    isIpcError={!window.ipcRenderer}
                    locationName={location.name}
                    onRetry={() => activate()}
                />
            ) : (
            <div
                style={{
                    flex: 1,
                    minHeight: 0,
                    display: 'grid',
                    gridTemplateColumns: '340px 1fr 170px',
                    gridTemplateRows: '1fr',
                    gap: 16,
                    padding: '12px 20px',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                }}
            >
                {/* ── Left: Best Windows (scrollable) ──────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    {!solarAvailable && !isLoading && (
                        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--mc-amber)', opacity: 0.8 }}>
                            ⚠ Cannot determine daylight hours for this location. Best dive times are unavailable.
                        </div>
                    )}
                    <BestWindowsPanel windows={diveWindows} isLoading={isLoading} onSelect={setSelectedWindow} />
                </div>

                {/* ── Center: Chart (40%) + Events (60%) ───────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ flex: '0 0 40%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div className="marine-section-label">Tide &amp; Current (7 Days)</div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 9, color: 'rgba(232,238,247,0.4)', fontFamily: 'Inter', letterSpacing: '0.05em' }}>
                                <span><span style={{ color: 'rgba(78,222,163,0.7)' }}>▌</span> Dive window</span>
                                <span><span style={{ color: 'rgba(0,0,0,0.7)', background: 'rgba(232,238,247,0.35)', padding: '0 2px' }}>▌</span> Night</span>
                            </div>
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <ChartErrorBoundary>
                                <TideCurrentChart
                                    tides={state.data}
                                    events={events}
                                    diveWindows={diveWindows}
                                    isLoading={isLoading}
                                    sunrises={state.data?.sunrise ?? weather?.daily.sunrise}
                                    sunsets={state.data?.sunset ?? weather?.daily.sunset}
                                />
                            </ChartErrorBoundary>
                        </div>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <MarineEventsTable
                            events={events}
                            tides={state.data}
                            weather={weather?.hourly}
                            isLoading={isLoading}
                        />
                    </div>
                </div>

                {/* ── Right: Conditions ─────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
                    <ConditionsPanel
                        snapshot={snapshot}
                        isLoading={isLoading}
                        stationName={location.currentStation}
                        isSuspect={state.isSuspect}
                    />
                </div>
            </div>
            )}

            <DataSourcesFooter
                tides={state.data}
                isError={state.isError}
                isSuspect={state.isSuspect}
            />

            <GuidePanel isOpen={isGuideOpen} onClose={closeGuide} />

            <DiveWindowDetailPanel
                window={selectedWindow}
                snapshot={snapshot}
                onClose={() => setSelectedWindow(null)}
                locationName={location.name}
            />

            {process.env.NODE_ENV === 'development' && (
                <DebugPanel
                    isOpen={debugOpen}
                    onClose={() => setDebugOpen(false)}
                    tides={state.data}
                    windows={diveWindows}
                    snapshot={snapshot}
                    assertions={assertions}
                    locationName={location.name}
                    solarAvailable={solarAvailable}
                    sunrises={state.data?.sunrise ?? weather?.daily.sunrise}
                    sunsets={state.data?.sunset ?? weather?.daily.sunset}
                    coords={location.coords}
                />
            )}
        </div>
    );
}
