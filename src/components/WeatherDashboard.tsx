import React, { useState, useMemo } from 'react';
import { SideDrawer } from './SideDrawer';
import { WeatherData, TideData } from '../types';
import {
    Cloud, CloudDrizzle, CloudFog, CloudLightning,
    CloudRain, CloudSnow, Sun,
    Anchor,
    Info
} from 'lucide-react';
import { format, addHours, parseISO, isSameDay } from 'date-fns';
import { calculateSlackWindows } from '../utils/slackWindows';
import { interpolateExtremeTime } from '../utils/tideMath';


import { motion, AnimatePresence } from 'framer-motion';
import { MARINE_LOCATIONS } from '../utils/marineLocations';
import { MapPin, Check } from 'lucide-react';

interface WeatherDashboardProps {
    weather: WeatherData;
    tides: TideData | null;
    currentLocationId: string;
    onLocationChange: (id: string) => void;
    isTidesLoading: boolean;
    onTidesActive: () => void;
}

export const getWeatherIcon = (code: number) => {
    if (code === 0) return <Sun className="text-yellow-500" />;
    if (code >= 1 && code <= 3) return <Cloud className="text-zinc-400" />;
    if (code >= 45 && code <= 48) return <CloudFog className="text-zinc-500" />;
    if (code >= 51 && code <= 67) return <CloudDrizzle className="text-blue-400" />;
    if (code >= 71 && code <= 77) return <CloudSnow className="text-white" />;
    if (code >= 80 && code <= 82) return <CloudRain className="text-blue-500" />;
    if (code >= 95) return <CloudLightning className="text-yellow-600" />;
    return <Sun className="text-yellow-500" />;
};

const WeatherPanel: React.FC<{ weather: WeatherData }> = ({ weather }) => {
    // Current hour index
    const now = new Date();
    const currentHourStr = format(now, "yyyy-MM-dd'T'HH:00");
    const startIndex = weather.hourly.time.findIndex(t => t.startsWith(currentHourStr));
    const hourlyData = startIndex !== -1 ? weather.hourly.time.slice(startIndex, startIndex + 24) : [];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
                    <div className="text-zinc-500 text-xs font-bold uppercase mb-1">Temperature</div>
                    <div className="text-3xl font-black text-white">{Math.round(weather.current.temperature)}°C</div>
                </div>
                <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
                    <div className="text-zinc-500 text-xs font-bold uppercase mb-1">Wind</div>
                    <div className="text-3xl font-black text-white">{Math.round(weather.current.windSpeed)} <span className="text-sm font-normal text-zinc-400">km/h</span></div>
                </div>
            </div>

            <div>
                <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest mb-4">Hourly Forecast</h3>
                <div className="bg-zinc-800/30 rounded-lg overflow-hidden border border-zinc-700/50">
                     <table className="w-full text-left text-sm">
                         <thead className="bg-zinc-900/50 text-zinc-500 text-xs uppercase font-bold">
                             <tr>
                                 <th className="p-2">Time</th>
                                 <th className="p-2">Cond</th>
                                 <th className="p-2 text-right">Temp</th>
                                 <th className="p-2 text-right">Rain</th>
                                 <th className="p-2 text-right">Wind</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-zinc-800/50">
                            {hourlyData.map((time, i) => {
                                const idx = startIndex + i;
                                const t = new Date(time);
                                return (
                                    <tr key={time} className="hover:bg-zinc-800/50 transition-colors">
                                        <td className="p-2 font-mono text-zinc-300">{format(t, 'HH:mm')}</td>
                                        <td className="p-2">{getWeatherIcon(weather.hourly.weather_code[idx])}</td>
                                        <td className="p-2 text-right font-bold text-white">{Math.round(weather.hourly.temperature_2m[idx])}°</td>
                                        <td className="p-2 text-right text-blue-400 font-medium">
                                            {weather.hourly.precipitation_probability[idx] > 0 ? `${weather.hourly.precipitation_probability[idx]}%` : '-'}
                                        </td>
                                        <td className="p-2 text-right text-zinc-400 text-xs">
                                            {Math.round(weather.hourly.wind_speed_10m?.[idx] || 0)}
                                        </td>
                                    </tr>
                                );
                            })}
                         </tbody>
                     </table>
                </div>
            </div>
        </div>
    );
};

export const TidesPanel: React.FC<{ 
    tides: TideData | null; 
    weather: WeatherData; 
    locationId: string;
    onLocationChange: (id: string) => void;
    loading: boolean;
}> = ({ tides, weather, locationId, onLocationChange, loading }) => {
    
    // Derived state
    const [showLocMenu, setShowLocMenu] = useState(false);
    const currentLocation = MARINE_LOCATIONS.find(l => l.id === locationId) || MARINE_LOCATIONS[0];

    // Safe access to tides
    const hourlyTides = tides?.hourly;

    // Generate Events (Slack, Max Flood, Max Ebb, High Tide, Low Tide)
    const events = useMemo(() => {
        if (!tides || !hourlyTides || !hourlyTides.current_speed?.length) return [];
        const speeds = hourlyTides.current_speed;
        const directions = hourlyTides.current_direction || [];
        const times = hourlyTides.time;
        const tideHeights = hourlyTides.tide_height || [];
        const eventsList: { time: string, type: 'Slack' | 'Max Flood' | 'Max Ebb' | 'High Tide' | 'Low Tide', speed: number, direction: number, tideHeight?: number }[] = [];

        // Check if Hilo contains current events (Official CHS Data)
        const hasOfficialCurrentEvents = tides.hilo?.some(h => ['Slack Water', 'Max Flood', 'Max Ebb'].includes(h.type));

        if (hasOfficialCurrentEvents) {
            // Use Official Events
            tides.hilo?.forEach(h => {
                if (['Slack Water', 'Max Flood', 'Max Ebb'].includes(h.type)) {
                    // Find corresponding hourly data for context (approximate)
                    const idx = times.findIndex(t => t.startsWith(h.time.substring(0, 13)));
                    
                    // Map type names to internal standard if needed
                    const typeString = h.type === 'Slack Water' ? 'Slack' : h.type;
                    const type = typeString as 'Slack' | 'Max Flood' | 'Max Ebb';

                    eventsList.push({
                        time: h.time,
                        type: type,
                        speed: h.value !== undefined ? Math.abs(h.value) : (idx !== -1 ? speeds[idx] : 0),
                        direction: idx !== -1 ? directions[idx] || 0 : 0,
                        tideHeight: idx !== -1 ? tideHeights[idx] : undefined
                    });
                }
            });
        } else {
            // Manual Detection (Fallback for Open-Meteo)
            let lastTrend = 0; // 0: unknown, 1: increasing, -1: decreasing
            const EPSILON = 0.001;

            for (let i = 1; i < speeds.length; i++) {
                const diff = speeds[i] - speeds[i - 1];

                if (diff > EPSILON) {
                    if (lastTrend === -1) {
                        const idx = i - 1;
                        if (speeds[idx] < 1.0) {
                            const preciseTime = interpolateExtremeTime(times, speeds, idx);
                            eventsList.push({ 
                                time: preciseTime, 
                                type: 'Slack', 
                                speed: speeds[idx], 
                                direction: directions[idx],
                                tideHeight: tideHeights[idx]
                            });
                        }
                    }
                    lastTrend = 1;
                } else if (diff < -EPSILON) {
                    if (lastTrend === 1) {
                        const idx = i - 1;
                        const dir = directions[idx] || 0;
                        const isFlood = (dir > 45 && dir < 135); 
                        const preciseTime = interpolateExtremeTime(times, speeds, idx);
                        eventsList.push({ 
                            time: preciseTime, 
                            type: isFlood ? 'Max Flood' : 'Max Ebb', 
                            speed: speeds[idx], 
                            direction: dir,
                            tideHeight: tideHeights[idx]
                        });
                    }
                    lastTrend = -1;
                }
            }
        }
        
        // Add High/Low Tide events (always from Hilo if available)
        if (tides.hilo && tides.hilo.length > 0) {
            tides.hilo.forEach(h => {
                if (h.type === 'High' || h.type === 'Low' || h.type === 'High Tide' || h.type === 'Low Tide') {
                    const weatherIdx = times.findIndex(t => t.startsWith(h.time.substring(0, 13)));
                    eventsList.push({
                        time: h.time,
                        type: (h.type === 'High' || h.type === 'High Tide') ? 'High Tide' : 'Low Tide',
                        speed: speeds[weatherIdx] || 0,
                        direction: directions[weatherIdx] || 0,
                        tideHeight: h.value
                    });
                }
            });
        } else if (tideHeights.length > 0) {
             // Fallback tide detection (if needed, though CHS usually provides wlp-hilo)
             // ... [Existing manual tide logic if we want to keep it, but stripped for brevity or kept if existing code had it]
             // The previous code had manual tide detection. I should preserve it if possible or rely on CHS.
             // Given CHS wlp-hilo is robust, we might not need it, but to be safe/consistent with previous file state:
             
            let tideTrend = 0;
            const EPSILON = 0.001;
            for (let i = 1; i < tideHeights.length; i++) {
                if (!tideHeights[i] || !tideHeights[i-1]) continue;
                const diff = tideHeights[i] - tideHeights[i - 1];

                if (diff > EPSILON) {
                    if (tideTrend === -1) {
                         const idx = i - 1;
                         const preciseTime = interpolateExtremeTime(times, tideHeights, idx);
                         eventsList.push({
                             time: preciseTime,
                             type: 'Low Tide',
                             speed: speeds[idx] || 0,
                             direction: directions[idx] || 0,
                             tideHeight: tideHeights[idx]
                         });
                    }
                    tideTrend = 1;
                } else if (diff < -EPSILON) {
                    if (tideTrend === 1) {
                         const idx = i - 1;
                         const preciseTime = interpolateExtremeTime(times, tideHeights, idx);
                         eventsList.push({
                             time: preciseTime,
                             type: 'High Tide',
                             speed: speeds[idx] || 0,
                             direction: directions[idx] || 0,
                             tideHeight: tideHeights[idx]
                         });
                    }
                    tideTrend = -1;
                }
            }
        }
        
        const now = new Date();
        const futureLimit = addHours(now, 48);
        return eventsList
            .filter(e => {
                const d = parseISO(e.time);
                return d >= now && d <= futureLimit;
            })
            .sort((a, b) => parseISO(a.time).getTime() - parseISO(b.time).getTime())
            .slice(0, 20); 
    }, [tides]);

    // Calculate slack windows for spearfishing
    const slackWindows = useMemo(() => {
        if (!tides || !hourlyTides || !hourlyTides.current_speed?.length) return [];
        
        const speeds = hourlyTides.current_speed;
        const times = hourlyTides.time;
        const tideHeights = hourlyTides.tide_height || [];
        
        // Find slack event indices
        const slackIndices: number[] = [];
        events.forEach(evt => {
            if (evt.type === 'Slack') {
                const idx = times.findIndex(t => t === evt.time);
                if (idx !== -1) slackIndices.push(idx);
            }
        });
        
        // Get sunrise/sunset for safety filtering
        const todayIndex = 0; // Today's sunrise/sunset
        const sunrise = weather.daily.sunrise[todayIndex] ? new Date(weather.daily.sunrise[todayIndex]) : undefined;
        const sunset = weather.daily.sunset[todayIndex] ? new Date(weather.daily.sunset[todayIndex]) : undefined;
        
        return calculateSlackWindows(times, speeds, tideHeights, slackIndices, sunrise, sunset);
    }, [tides, hourlyTides, events, weather.daily.sunrise, weather.daily.sunset]);



    const now = new Date();
    const futureSlackWindows = slackWindows.filter(w => parseISO(w.slackTime) >= now).slice(0, 5);

    return (
         <div className="space-y-6 relative min-h-[400px]">
            {/* Location Selector */}
            <div className="relative mb-6 z-50">
                <button
                    onClick={() => setShowLocMenu(!showLocMenu)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/80 border border-zinc-700/50 hover:bg-zinc-800 transition-all group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                            <MapPin size={18} />
                        </div>
                        <div className="text-left">
                            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Selected Location</div>
                            <div className="text-sm font-bold text-white group-hover:text-blue-200 transition-colors">
                                {currentLocation.name}
                            </div>
                        </div>
                    </div>
                </button>

                <AnimatePresence>
                    {showLocMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowLocMenu(false)} />
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50 py-1 max-h-[300px] overflow-y-auto"
                            >
                                {MARINE_LOCATIONS.map(loc => (
                                    <button
                                        key={loc.id}
                                        onClick={() => {
                                            onLocationChange(loc.id);
                                            setShowLocMenu(false);
                                        }}
                                        className={`w-full text-left px-4 py-3 text-sm font-medium flex items-center justify-between hover:bg-zinc-800 transition-colors ${locationId === loc.id ? 'text-family-cyan bg-family-cyan/5' : 'text-zinc-300'}`}
                                    >
                                        {loc.name}
                                        {locationId === loc.id && <Check size={16} />}
                                    </button>
                                ))}
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>

            {loading && (
                 <div className="absolute inset-0 z-30 bg-zinc-950/50 backdrop-blur-sm flex flex-col items-center justify-center space-y-4">
                     <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
                         <motion.div 
                             className="h-full bg-family-cyan"
                             initial={{ width: "0%" }}
                             animate={{ width: "100%" }}
                             transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                         />
                     </div>
                     <span className="text-xs font-black uppercase tracking-widest text-family-cyan animate-pulse">Updating Marine Data...</span>
                 </div>
            )}

            {/* Content (Disabled/Blurred when loading if desired, or just overlay) */}
            <div className={`space-y-6 transition-opacity duration-300 ${loading ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            {/* Beginner Guide */}
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                    <Info size={16} className="text-blue-400" />
                    <h3 className="text-blue-200 font-bold uppercase text-xs tracking-widest">Diver's Guide</h3>
                </div>
                <ul className="text-xs text-blue-100/70 space-y-1 list-disc list-inside">
                    <li><strong>Slack Water:</strong> Current near 0kn. Best for swimming/diving.</li>
                    <li><strong>Max Flood/Ebb:</strong> Peak current speed. Can be dangerous (&gt;1.5kn).</li>
                    <li><strong>Visibility:</strong> Est. from weather. Rain/Wind reduces clarity.</li>
                    <li><strong>Swell:</strong> Wave height. Low swell is better for entry/exit.</li>
                </ul>
            </div>

            {/* Best Times for Spearfishing */}
            {futureSlackWindows.length > 0 && (
                <div>
                    <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest mb-4">Best Times for Spearfishing</h3>
                    <div className="space-y-3">
                        {futureSlackWindows.map((window) => {
                            const slackDate = parseISO(window.slackTime);
                            const startDate = parseISO(window.windowStart);
                            const endDate = parseISO(window.windowEnd);
                            
                            return (
                                <div 
                                    key={window.slackTime} 
                                    className={`p-4 rounded-xl border ${
                                        window.isHighTide 
                                            ? 'bg-emerald-500/10 border-emerald-500/30' 
                                            : 'bg-zinc-800/30 border-zinc-700/50'
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-zinc-300">
                                                    {format(slackDate, 'EEEE, MMM d')}
                                                </span>
                                                {window.isHighTide && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold uppercase tracking-wider">
                                                        High Tide - Best!
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-zinc-500 mt-0.5">
                                                Tide: {window.tideHeight.toFixed(1)}m
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-black text-white">
                                                {format(startDate, 'HH:mm')} - {format(endDate, 'HH:mm')}
                                            </div>
                                            <div className="text-[10px] text-zinc-500 font-medium">
                                                {window.duration} min window
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div className="bg-zinc-900/50 p-2 rounded">
                                            <div className="text-zinc-500 text-[10px] uppercase font-bold">Current</div>
                                            <div className="text-green-400 font-bold">{window.currentSpeed.toFixed(1)}kn</div>
                                        </div>
                                        <div className="bg-zinc-900/50 p-2 rounded">
                                            <div className="text-zinc-500 text-[10px] uppercase font-bold">Peak</div>
                                            <div className="text-white font-bold">{format(slackDate, 'HH:mm')}</div>
                                        </div>
                                        <div className="bg-zinc-900/50 p-2 rounded">
                                            <div className="text-zinc-500 text-[10px] uppercase font-bold">Conditions</div>
                                            <div className="text-zinc-400 font-bold">Good</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Combined Events Table */}
            <div>
                <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest mb-4">Marine Events (Next 48h)</h3>
                <div className="bg-zinc-800/30 rounded-lg overflow-hidden border border-zinc-700/50">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-900/50 text-zinc-500 text-xs uppercase font-bold text-center">
                            <tr>
                                <th className="p-2 text-left">Event</th>
                                <th className="p-2">Time</th>
                                <th className="p-2">Current</th>
                                <th className="p-2 hidden sm:table-cell">Tide</th>
                                <th className="p-2">Swell</th>
                                <th className="p-2 hidden sm:table-cell">Period</th>
                                <th className="p-2 hidden sm:table-cell">Wind</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {events.map((evt, i) => {
                                const d = parseISO(evt.time);
                                const isNewDay = i === 0 || !isSameDay(parseISO(events[i-1].time), d);
                                
                                // Correlate with weather/waves
                                const weatherIdx = weather.hourly.time.findIndex(t => t.startsWith(evt.time.substring(0, 13)));
                                const swellHeight = tides.hourly.wave_height?.[weatherIdx] || 0;
                                const swellPeriod = tides.hourly.wave_period?.[weatherIdx] || 0;
                                const tideHeight = evt.tideHeight !== undefined ? evt.tideHeight : tides.hourly.tide_height?.[weatherIdx];
                                const wind = weather.hourly.wind_speed_10m?.[weatherIdx] || 0;
                                
                                // Color coding for current (Safety)
                                const speedColor = evt.speed < 1.0 ? "text-green-400" : evt.speed > 1.5 ? "text-red-400" : "text-yellow-400";
                                
                                // Event type styling
                                const getEventDisplay = () => {
                                    if (evt.type === 'Slack') return <span className="text-green-300">Slack</span>;
                                    if (evt.type === 'Max Flood') return <span className="text-red-300">Max Flood</span>;
                                    if (evt.type === 'Max Ebb') return <span className="text-red-300">Max Ebb</span>;
                                    if (evt.type === 'High Tide') return <span className="text-blue-300">High Tide</span>;
                                    if (evt.type === 'Low Tide') return <span className="text-cyan-300">Low Tide</span>;
                                    return evt.type;
                                };

                                return (
                                    <React.Fragment key={evt.time}>
                                        {isNewDay && (
                                            <tr className="bg-zinc-900/40">
                                                <td colSpan={7} className="p-1 px-3 text-xs font-bold text-zinc-500 uppercase tracking-widest">
                                                    {format(d, 'EEEE, MMM d')}
                                                </td>
                                            </tr>
                                        )}
                                        <tr className="hover:bg-zinc-800/50 transition-colors text-center">
                                            <td className="p-2 text-left font-bold text-zinc-300">
                                                {getEventDisplay()}
                                            </td>
                                            <td className="p-2 font-mono text-zinc-400">{format(d, 'HH:mm')}</td>
                                            <td className={`p-2 font-mono font-bold ${speedColor}`}>
                                                {evt.type === 'High Tide' || evt.type === 'Low Tide' 
                                                    ? '-' 
                                                    : `${evt.speed.toFixed(1)}kn`}
                                                {evt.type !== 'High Tide' && evt.type !== 'Low Tide' && (
                                                    <span className="text-[10px] text-zinc-600 font-normal"> ({Math.round(evt.direction)}°)</span>
                                                )}
                                            </td>
                                            <td className="p-2 hidden sm:table-cell text-zinc-400 text-xs text-mono">
                                                {tideHeight !== undefined ? `${tideHeight.toFixed(1)}m` : '-'}
                                            </td>
                                            <td className="p-2 text-zinc-400 text-xs">{swellHeight.toFixed(1)}m</td>
                                            <td className="p-2 hidden sm:table-cell text-zinc-400 text-xs">{swellPeriod.toFixed(1)}s</td>
                                            <td className="p-2 hidden sm:table-cell text-zinc-400 text-xs">{Math.round(wind)}kn</td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

            </div>

            {/* Data Sources Footer */}
            <div className="text-[10px] text-zinc-600 border-t border-zinc-800/50 pt-3">
                <div className="font-bold uppercase tracking-widest mb-1">Data Sources</div>
                <div className="space-y-0.5">
                    {tides?.sources?.map((s, i) => (
                        <div key={i} className="flex gap-1">
                            <span className="text-zinc-500 font-medium">{s.name}:</span>
                            <span className="text-zinc-600 font-mono">{s.details}</span>
                        </div>
                    ))}
                    {(!tides?.sources || tides.sources.length === 0) && <div>Source data unavailable</div>}
                </div>
            </div>
   </div>
         </div>
    );
};

export const WeatherDashboard: React.FC<WeatherDashboardProps> = ({ 
    weather, 
    tides, 
    currentLocationId, 
    onLocationChange, 
    isTidesLoading, 
    onTidesActive 
}) => {
    const [isWeatherOpen, setWeatherOpen] = useState(false);
    const [isTidesOpen, setTidesOpen] = useState(false);

    // Trigger data check when Tides panel opens
    React.useEffect(() => {
        if (isTidesOpen) {
            onTidesActive();
        }
    }, [isTidesOpen, onTidesActive]);

    return (
        <>
            <div className="flex gap-2">
                <button 
                    onClick={() => setWeatherOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 transition-all border border-zinc-700/50 shadow-lg group"
                >
                    {getWeatherIcon(weather.current.weatherCode)}
                    <span className="text-sm font-black text-zinc-100 group-hover:text-white">
                        {Math.round(weather.current.temperature)}°C
                    </span>
                </button>

                <button 
                    onClick={() => {
                        setTidesOpen(true);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 transition-all border border-zinc-700/50 shadow-lg group"
                >
                    <Anchor className="text-blue-400" size={16} />
                    <span className="text-sm font-black text-zinc-100 group-hover:text-white">
                        Tides
                    </span>
                </button>
            </div>

            <SideDrawer 
                isOpen={isWeatherOpen} 
                onClose={() => setWeatherOpen(false)} 
                title={<span className="flex items-center gap-2"><Sun className="text-yellow-500" /> Weather Forecast</span>}
            >
                <WeatherPanel weather={weather} />
            </SideDrawer>

            <SideDrawer 
                isOpen={isTidesOpen} 
                onClose={() => setTidesOpen(false)} 
                title={<span className="flex items-center gap-2"><Anchor className="text-blue-500" /> Marine Conditions</span>}
            >
                <TidesPanel 
                    tides={tides} 
                    weather={weather} 
                    locationId={currentLocationId}
                    onLocationChange={onLocationChange}
                    loading={isTidesLoading}
                />
            </SideDrawer>
        </>
    );
};

