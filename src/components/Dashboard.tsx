import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { addDays, format, isSameDay, isWeekend } from 'date-fns';
import { SettingsModal } from './SettingsModal';
import { motion, AnimatePresence } from 'framer-motion';
import { ListTodo, X, RefreshCw, Settings, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, AlignLeft } from 'lucide-react';
import { SideDrawer } from './SideDrawer';
import { DayColumn } from './DayColumn';
import { AppEvent, AppTask, WeatherData, TideData, UserConfig } from '../types';
import { WeatherDashboard } from './WeatherDashboard';
import { getWeatherIcon } from '../utils/weatherIcons';
import { getWeekStartDate, canNavigateToPreviousWeek, isCurrentWeek } from '../utils/weekNavigation';
import { MARINE_LOCATIONS } from '../utils/marineLocations';
import { useTheme } from '../hooks/useTheme';

const DAYS_TO_SHOW = 7;

export const Dashboard: React.FC = () => {
  const [showTasks, setShowTasks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState('sooke');
  
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  
  // Tides State
  const [tides, setTides] = useState<TideData | null>(null);
  const [isTidesLoading, setIsTidesLoading] = useState(false);
  const [hasTidesOpened, setHasTidesOpened] = useState(false);
  
  const [config, setConfig] = useState<UserConfig>({ calendarIds: [], taskListIds: [] });
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Syncing...');
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // Apply Theme Logic
  useTheme(config, weather);

  const today = useMemo(() => new Date(), []);
  const startDate = weekOffset === 0 ? today : getWeekStartDate(today, weekOffset);
  const days = useMemo(() => Array.from({ length: DAYS_TO_SHOW }, (_, i) => addDays(startDate, i)), [startDate]);

  const eventsByDay = useMemo(() => {
    return days.map(day => events.filter(e => isSameDay(e.start, day)));
  }, [events, days]);

  const currentLocation = useMemo(() => 
      MARINE_LOCATIONS.find(l => l.id === selectedLocationId) || MARINE_LOCATIONS[0], 
  [selectedLocationId]);

  const fetchData = useCallback(async (currentOffset = weekOffset) => {
      setLoading(true);
      setError(null);
      try {
          const fetchStart = currentOffset === 0 ? today : getWeekStartDate(today, currentOffset);
          const fetchEnd = addDays(fetchStart, 8);

          setLoadingMessage('Fetching Events...');
          const fetchedEvents = await window.ipcRenderer.invoke('data:events', fetchStart.toISOString(), fetchEnd.toISOString());
          
          setLoadingMessage('Fetching Tasks...');
          const fetchedTasks = await window.ipcRenderer.invoke('data:tasks');
          
          setLoadingMessage('Updating Weather...');
          const fetchedWeather = await window.ipcRenderer.invoke('weather:get', currentLocation.coords.lat, currentLocation.coords.lng);
          
          // Note: Tides are NOT fetched here. Lazy loaded.
          
          setLoadingMessage('Loading Settings...');
          const fetchedSettings = await window.ipcRenderer.invoke('settings:get');
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hydratedEvents = (fetchedEvents as any[]).map((e: any) => ({
              ...e,
              start: new Date(e.start),
              end: new Date(e.end)
          }));

          setEvents(hydratedEvents);
          setTasks(fetchedTasks as AppTask[]);
          setWeather(fetchedWeather as WeatherData);
          setConfig(fetchedSettings as UserConfig);
      } catch (err) {
          console.error("Failed to fetch data", err);
          setError("Failed to load calendar data.");
      } finally {
          setLoading(false);
      }
  }, [weekOffset, today, currentLocation]);

  const fetchTides = useCallback(async () => {
    setIsTidesLoading(true);
    try {
        const fetchedTides = await window.ipcRenderer.invoke('tides:get', 
            currentLocation.tideStation, 
            currentLocation.currentStation, 
            currentLocation.coords.lat, 
            currentLocation.coords.lng
        );
        setTides(fetchedTides as TideData);
    } catch (err) {
        console.error("Failed to fetch tides", err);
    } finally {
        setIsTidesLoading(false);
    }
  }, [currentLocation]);

  // Initial Data Load
  useEffect(() => {
    fetchData(weekOffset);
    const interval = setInterval(() => fetchData(weekOffset), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [weekOffset, fetchData]);

  // Tides Lazy Load Effect
  useEffect(() => {
      if (hasTidesOpened) {
          fetchTides();
      }
  }, [fetchTides, hasTidesOpened]);

  if (loading && events.length === 0 && !error) {
      return (
          <div className="h-screen w-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center text-zinc-500 gap-4 transition-colors duration-300">
              <RefreshCw className="animate-spin" size={48} />
              <div className="text-xl tracking-widest uppercase">Syncing with Google...</div>
          </div>
      );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden relative transition-colors duration-300">
      {/* Header / Status Bar */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 z-10 sticky top-0 transition-colors duration-300">
        <div className="flex items-center gap-6">
            {/* Week Navigation */}
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1 transition-colors duration-300">
                <button 
                    onClick={() => setWeekOffset(prev => Math.max(0, prev - 1))}
                    disabled={!canNavigateToPreviousWeek(weekOffset)}
                    className={`p-1.5 rounded-md transition-all ${!canNavigateToPreviousWeek(weekOffset) ? 'text-zinc-400 cursor-not-allowed' : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
                    title="Previous Week"
                    data-testid="prev-week-button"
                    aria-label="Previous Week"
                >
                    <ChevronLeft size={20} />
                </button>
                
                <button 
                    className={`px-3 py-1 flex items-center gap-2 rounded-md transition-colors ${isCurrentWeek(weekOffset) ? 'text-zinc-400 dark:text-zinc-500 cursor-default' : 'text-zinc-600 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
                    onClick={() => setWeekOffset(0)}
                    title="Go to Today"
                    data-testid="today-button"
                    aria-label="Go to Today"
                >
                    <Calendar size={14} className={isCurrentWeek(weekOffset) ? 'text-family-cyan' : 'text-zinc-400 dark:text-zinc-500'} />
                    <span className={`text-[11px] font-black uppercase tracking-[0.2em]`}>
                        {isCurrentWeek(weekOffset) ? 'Current Week' : 'Back To Today'}
                    </span>
                </button>

                <button 
                    onClick={() => setWeekOffset(prev => prev + 1)}
                    className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all"
                    title="Next Week"
                    data-testid="next-week-button"
                    aria-label="Next Week"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>

        <div className="flex flex-col items-center gap-1">
            <div className="text-2xl font-bold text-zinc-700 dark:text-zinc-300 transition-colors duration-300">
                {isCurrentWeek(weekOffset) ? format(today, 'EEEE, MMMM d') : `${format(days[0], 'MMM d')} - ${format(days[6], 'MMM d, yyyy')}`}
            </div>
            <AnimatePresence>
                {loading && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col items-center w-full max-w-[200px] gap-1"
                    >
                        <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden" data-testid="loading-bar">
                            <motion.div 
                                className="h-full bg-family-cyan"
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ 
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            />
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.2em] font-black text-family-cyan/80 animate-pulse">
                            {loadingMessage}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
        <div className="flex items-center gap-4">
             {weather && (
                <WeatherDashboard 
                  weather={weather} 
                  tides={tides} 
                  currentLocationId={selectedLocationId}
                  onLocationChange={setSelectedLocationId}
                  isTidesLoading={isTidesLoading}
                  onTidesActive={() => {
                      setHasTidesOpened(true);
                      if (!tides) fetchTides();
                  }}
                />
             )}

             {loading && <RefreshCw size={16} className="animate-spin text-zinc-600" />}
             {error && <span className="text-red-500 text-xs font-bold">{error}</span>}
             
             <button
                onClick={() => setShowSettings(true)}
                className="p-3 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
                title="Settings"
                data-testid="settings-button"
             >
                 <Settings size={20} />
             </button>

             {config.sleepEnabled && (
                 <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Power Saving On</span>
             )}

             <button 
                onClick={() => setShowTasks(!showTasks)}
                className={`p-3 rounded-full transition-colors ${showTasks ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white' : 'bg-transparent text-zinc-500 hover:text-black dark:hover:text-white'}`}
                data-testid="tasks-toggle-button"
             >
                {showTasks ? <X size={24} /> : <div className="relative">
                    <ListTodo size={24} />
                    {tasks.length > 0 && <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full" />}
                </div>}
             </button>
        </div>
      </div>

      {/* Main Content Area - Split Layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Global Header Row */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 z-10 shrink-0 transition-colors duration-300">
            {/* Sidebar Header Spacer */}
            <div className="w-12 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50" />
            
            {/* Day Headers Grid */}
            <div className="flex-1 grid grid-cols-7 divide-x divide-zinc-200 dark:divide-zinc-800">
                {days.map((day, i) => {
                    const isToday = isSameDay(day, today);
                    const isWeekendDay = isWeekend(day);
                    const dayEvents = events.filter(e => isSameDay(e.start, day));
                    const holidays = dayEvents.filter(e => e.isHoliday);

                    return (
                        <div key={i} className={`py-4 px-3 flex flex-col justify-center min-h-[100px] ${isToday ? 'bg-family-cyan/10 dark:bg-family-cyan/5' : isWeekendDay ? 'bg-family-orange/10 dark:bg-family-orange/5' : ''}`}>
                             <div className="flex items-center justify-center gap-6">
                                 {/* Day and Date Column */}
                                 <div className="flex flex-col items-center">
                                     <div
                                        className={`text-[15px] font-black uppercase tracking-widest mb-1 ${isToday ? 'text-family-cyan' : isWeekendDay ? 'text-family-orange' : 'text-zinc-400 dark:text-zinc-500'}`}
                                        data-testid="day-header-name"
                                     >
                                        {format(day, 'EEEE')}
                                     </div>
                                     <div
                                        className={`text-4xl font-black transition-all ${isToday ? 'text-family-cyan' : isWeekendDay ? 'text-family-orange' : 'text-zinc-800 dark:text-zinc-200'}`}
                                        data-testid="day-header-number"
                                     >
                                        {format(day, 'd')}
                                     </div>
                                 </div>

                                 {/* Weather Column - Only show for current week forecast */}
                                 {isCurrentWeek(weekOffset) && weather && weather.daily && weather.daily.weather_code && weather.daily.weather_code[i] !== undefined && (
                                    <div className="flex flex-col items-center gap-1 translate-y-5" data-testid="weather-forecast-container">
                                        <div className="scale-150">
                                            {getWeatherIcon(weather.daily.weather_code[i])}
                                        </div>
                                        {weather.daily.temperature_2m_max && (
                                            <div
                                                className="text-[13px] font-black text-blue-500/80 dark:text-blue-400/80 font-mono"
                                                data-testid="day-header-temp-range"
                                            >
                                                {Math.round(weather.daily.temperature_2m_max[i])}-{Math.round(weather.daily.temperature_2m_min[i])}
                                            </div>
                                        )}
                                    </div>
                                 )}
                             </div>

                             {/* Holidays */}
                             <div className="mt-3 flex flex-wrap justify-center gap-1">
                                {holidays.map((h, idx) => (
                                    <div key={h.id || idx} className="text-[10px] uppercase font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 max-w-full truncate">
                                        {h.title}
                                    </div>
                                ))}
                             </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Global Body Row */}
        <div className="flex-1 flex overflow-hidden">
             
             {/* Global Sidebar - Time Labels */}
             <div className="w-12 flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-colors duration-300">
                 {(() => {
                     const startHour = config.activeHoursStart ?? 7;
                     const endHour = config.activeHoursEnd ?? 21;
                     const hours = Array.from({ length: endHour - startHour }, (_, idx) => startHour + idx);

                     return (
                         <>
                             {/* Before Label Spacer */}
                             <div className="h-16 flex-shrink-0 border-b border-zinc-200/50 dark:border-zinc-800/50 relative bg-zinc-50 dark:bg-zinc-900/20">
                                 <span className="absolute bottom-1 right-1 text-[9px] text-zinc-400 dark:text-zinc-600 font-mono">PRE</span>
                             </div>

                             {/* Hourly Labels */}
                             <div className="flex-1 flex flex-col min-h-0">
                                 {hours.map(hour => (
                                     <div key={hour} className="flex-1 relative border-b border-zinc-200/50 dark:border-zinc-800/30">
                                         <span
                                            className="absolute -top-2 right-1 text-[10px] text-zinc-400 dark:text-zinc-500 font-mono bg-white dark:bg-zinc-950 px-0.5"
                                            data-testid="hour-label"
                                         >
                                             {hour}
                                         </span>
                                     </div>
                                 ))}
                             </div>

                             {/* After Label Spacer */}
                             <div className="h-16 flex-shrink-0 border-t border-zinc-200/50 dark:border-zinc-800/50 relative bg-zinc-50 dark:bg-zinc-900/20">
                                 <span className="absolute top-1 right-1 text-[9px] text-zinc-400 dark:text-zinc-600 font-mono">POST</span>
                             </div>
                         </>
                     );
                 })()}
             </div>

             {/* Days Content Grid */}
             <div className="flex-1 grid grid-cols-7 divide-x divide-zinc-200 dark:divide-zinc-800 overflow-hidden transition-colors duration-300" data-testid="calendar-grid">
                {days.map((day, i) => (
                    <DayColumn
                        key={day.toISOString()}
                        day={day}
                        events={eventsByDay[i]}
                        config={config}
                        isToday={isSameDay(day, today)}
                        onEventClick={setSelectedEvent}
                    />
                ))}
             </div>
        </div>
      </div>

      {/* Todo List Drawer */}
      <AnimatePresence>
        {showTasks && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 h-1/3 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-700 shadow-2xl z-50 flex flex-col"
          >
             <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                <h2 className="text-2xl font-bold uppercase tracking-wide text-zinc-800 dark:text-white" data-testid="tasks-drawer-title">Tasks ({tasks.length})</h2>
                <button
                    onClick={() => setShowTasks(false)}
                    className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full"
                    data-testid="tasks-drawer-close-button"
                >
                    <X className="text-zinc-500 dark:text-zinc-400" />
                </button>
             </div>
             
             <div className="flex-1 p-6 overflow-x-auto flex gap-6 items-center">
                {tasks.length === 0 ? (
                    <div className="text-zinc-500 text-xl font-medium">No tasks found.</div>
                ) : (
                    tasks.map(task => (
                        <div key={task.id} className="min-w-[300px] bg-white/50 dark:bg-black/40 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${task.status === 'completed' ? 'border-green-500 bg-green-500/20' : 'border-zinc-400 dark:border-zinc-600'}`}>
                                {task.status === 'completed' && <div className="w-4 h-4 bg-green-500 rounded-full" />}
                            </div>
                            <span className={`text-xl font-medium ${task.status === 'completed' ? 'line-through text-zinc-500 dark:text-zinc-600' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                {task.title}
                            </span>
                        </div>
                    ))
                )}
            </div>
          </motion.div>
        )}
        {showSettings && (
            <SettingsModal 
                onClose={() => setShowSettings(false)} 
                onSave={fetchData} 
            />
        )}
      </AnimatePresence>

      <SideDrawer
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        title="Event Details"
      >
            {selectedEvent && (
                <div className="space-y-8">
                    <div>
                        <h3 className="text-3xl font-black text-white leading-tight mb-2">
                            {selectedEvent.title}
                        </h3>
                        <div className="flex items-center gap-2 text-zinc-400 font-medium">
                            <Clock size={18} className="text-family-cyan" />
                            <span>
                                {selectedEvent.allDay
                                    ? 'All Day'
                                    : `${format(selectedEvent.start, 'EEEE, MMMM d')} • ${format(selectedEvent.start, 'HH:mm')} - ${format(selectedEvent.end, 'HH:mm')}`
                                }
                            </span>
                        </div>
                    </div>

                    {selectedEvent.location && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-zinc-300 font-bold uppercase tracking-wider text-xs">
                                <MapPin size={16} className="text-family-orange" />
                                <span>Location</span>
                            </div>
                            <div className="text-zinc-400 bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/30">
                                {selectedEvent.location}
                            </div>
                        </div>
                    )}

                    {selectedEvent.description && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-zinc-300 font-bold uppercase tracking-wider text-xs">
                                <AlignLeft size={16} className="text-family-cyan" />
                                <span>Description</span>
                            </div>
                            <div className="text-zinc-400 bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/30 whitespace-pre-wrap leading-relaxed">
                                {selectedEvent.description}
                            </div>
                        </div>
                    )}

                    {/* Meta info */}
                    <div className="pt-8 border-t border-zinc-800 flex flex-wrap gap-4">
                        <div className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                            ID: {selectedEvent.id.substring(0, 8)}...
                        </div>
                        {selectedEvent.isHoliday && (
                            <div className="px-3 py-1 rounded-full bg-family-orange/20 text-family-orange text-[10px] font-black uppercase tracking-widest">
                                Public Holiday
                            </div>
                        )}
                    </div>
                </div>
            )}
      </SideDrawer>
    </div>
  );
};
