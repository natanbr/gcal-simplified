import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { addDays, addMonths, format, isSameDay, isWeekend } from 'date-fns';
import { SettingsModal } from './SettingsModal';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Settings, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, AlignLeft } from 'lucide-react';
import { SideDrawer } from './SideDrawer';
import { DayColumn } from './DayColumn';
import { EventCard } from './EventCard';
import { MonthlyView } from './MonthlyView';
import { AppEvent, AppTask, WeatherData, TideData, UserConfig } from '../types';
import { partitionEventsIntoHourlySlots } from '../utils/timeBuckets';
import { WeatherDashboard } from './WeatherDashboard';
import { getWeatherIcon } from '../utils/weatherIcons';
import { getWeekStartDate, canNavigateToPreviousWeek, isCurrentWeek } from '../utils/weekNavigation';
import { getMonthViewDates, getMonthViewStartDate, isCurrentMonth, canNavigateBackMonth } from '../utils/monthUtils';
import { MARINE_LOCATIONS } from '../utils/marineLocations';
import { useTheme } from '../hooks/useTheme';
import { useCurrentDate } from '../hooks/useCurrentDate';
import { UpdateNotification } from './UpdateNotification';
import { splitMultiDayEvents } from '../utils/eventProcessing';
import { getEventTitleStyle } from '../utils/colorMapping';

const DAYS_TO_SHOW = 7;

interface DashboardProps {
  onLogout?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
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
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  // Apply Theme Logic
  useTheme(config, weather);

  const today = useCurrentDate();
  const startDate = useMemo(() => getWeekStartDate(today, weekOffset, config.weekStartDay), [today, weekOffset, config.weekStartDay]);
  const days = useMemo(() => Array.from({ length: DAYS_TO_SHOW }, (_, i) => addDays(startDate, i)), [startDate]);
  const monthDays = useMemo(() => getMonthViewDates(today, monthOffset, config.weekStartDay), [today, monthOffset, config.weekStartDay]);

  const processedEvents = useMemo(() => splitMultiDayEvents(events), [events]);

  const eventsByDay = useMemo(() => {
    return days.map(day => processedEvents.filter(e => isSameDay(e.start, day)));
  }, [processedEvents, days]);

  const currentLocation = useMemo(() => 
      MARINE_LOCATIONS.find(l => l.id === selectedLocationId) || MARINE_LOCATIONS[0], 
  [selectedLocationId]);

  const titleStyle = useMemo(() => 
      selectedEvent ? getEventTitleStyle(selectedEvent.colorId, selectedEvent.color) : {}, 
  [selectedEvent]);

  const fetchData = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
          const fetchStart = viewMode === 'week'
            ? getWeekStartDate(today, weekOffset, config.weekStartDay)
            : getMonthViewStartDate(today, monthOffset, config.weekStartDay);

          const fetchEnd = addDays(fetchStart, viewMode === 'week' ? 8 : 42);

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
  }, [weekOffset, monthOffset, viewMode, today, currentLocation, config.weekStartDay]);

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
    fetchData();
    const interval = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [weekOffset, monthOffset, viewMode, fetchData]);

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
                    onClick={() => viewMode === 'week' ? setWeekOffset(prev => Math.max(0, prev - 1)) : setMonthOffset(prev => Math.max(0, prev - 1))}
                    disabled={viewMode === 'week' ? !canNavigateToPreviousWeek(weekOffset) : !canNavigateBackMonth(monthOffset)}
                    className={`p-1.5 rounded-md transition-all ${(viewMode === 'week' ? !canNavigateToPreviousWeek(weekOffset) : !canNavigateBackMonth(monthOffset)) ? 'text-zinc-400 cursor-not-allowed' : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
                    title={viewMode === 'week' ? "Previous Week" : "Previous Month"}
                    data-testid="prev-week-button"
                    aria-label={viewMode === 'week' ? "Previous Week" : "Previous Month"}
                >
                    <ChevronLeft size={20} />
                </button>
                
                <button 
                    className={`px-3 py-1 flex items-center gap-2 rounded-md transition-colors ${(viewMode === 'week' ? isCurrentWeek(weekOffset) : isCurrentMonth(today, monthOffset)) ? 'text-zinc-400 dark:text-zinc-500 cursor-default' : 'text-zinc-600 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
                    onClick={() => { setWeekOffset(0); setMonthOffset(0); }}
                    title="Go to Today"
                    data-testid="today-button"
                    aria-label="Go to Today"
                >
                    <Calendar size={14} className={(viewMode === 'week' ? isCurrentWeek(weekOffset) : isCurrentMonth(today, monthOffset)) ? 'text-family-cyan' : 'text-zinc-400 dark:text-zinc-500'} />
                    <span className={`text-[11px] font-black uppercase tracking-[0.2em]`}>
                        {(viewMode === 'week' ? isCurrentWeek(weekOffset) : isCurrentMonth(today, monthOffset)) ? (viewMode === 'week' ? 'Current Week' : 'Current Month') : 'Back To Today'}
                    </span>
                </button>

                <button 
                    onClick={() => viewMode === 'week' ? setWeekOffset(prev => prev + 1) : setMonthOffset(prev => prev + 1)}
                    className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all"
                    title={viewMode === 'week' ? "Next Week" : "Next Month"}
                    data-testid="next-week-button"
                    aria-label={viewMode === 'week' ? "Next Week" : "Next Month"}
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as 'week' | 'month')}
                className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-400 outline-none hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-label="Switch View"
            >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
            </select>
        </div>

        <div className="flex flex-col items-center gap-1">
            <div className="text-2xl font-bold text-zinc-700 dark:text-zinc-300 transition-colors duration-300">
                {viewMode === 'week'
                    ? (isCurrentWeek(weekOffset) ? format(today, 'EEEE, MMMM d') : `${format(days[0], 'MMM d')} - ${format(days[6], 'MMM d, yyyy')}`)
                    : format(addMonths(today, monthOffset), 'MMMM yyyy')}
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
                  tasks={tasks}
                  currentLocationId={selectedLocationId}
                  onLocationChange={setSelectedLocationId}
                  isTidesLoading={isTidesLoading}
                  onTidesActive={() => {
                      setHasTidesOpened(true);
                      if (!tides) fetchTides();
                  }}
                />
             )}

             <UpdateNotification />

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
        </div>
      </div>

      {/* Main Content Area - Split Layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {viewMode === 'week' ? (
          <>
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
                             
                             {/* All Day / Outside Active Hours Events */}
                             <div className="mt-2 w-full flex flex-col gap-1">
                                 {(() => {
                                     const startHour = config.activeHoursStart ?? 7;
                                     const endHour = config.activeHoursEnd ?? 21;
                                     // Filter out holidays first as they are shown above
                                     const standardEvents = dayEvents.filter(e => !e.isHoliday);
                                     const buckets = partitionEventsIntoHourlySlots(standardEvents, startHour, endHour, day);
                                     
                                     const allDayEvents = buckets.allDay.sort((a, b) => {
                                         if (a.allDay && !b.allDay) return -1;
                                         if (!a.allDay && b.allDay) return 1;
                                         return a.start.getTime() - b.start.getTime();
                                     });

                                     return allDayEvents.map(event => (
                                         <div key={event.id}>
                                             <EventCard event={event} onEventClick={setSelectedEvent} />
                                         </div>
                                     ));
                                 })()}
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


                             {/* Hourly Labels */}
                             <div className="flex-1 flex flex-col min-h-0">
                                 {hours.map(hour => (
                                     <div key={hour} className="flex-1 relative border-b border-zinc-200/50 dark:border-zinc-800/30">
                                         <span
                                            className="absolute top-1 right-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 font-mono"
                                            data-testid="hour-label"
                                         >
                                             {hour}
                                         </span>
                                     </div>
                                 ))}
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
          </>
        ) : (
          <MonthlyView
            days={monthDays}
            events={processedEvents}
            onEventClick={setSelectedEvent}
            currentDate={today}
            referenceDate={addMonths(today, monthOffset)}
          />
        )}
      </div>

      {/* Todo List Drawer */}
      <AnimatePresence>
        {showSettings && (
            <SettingsModal 
                onClose={() => setShowSettings(false)} 
                onSave={fetchData}
                onLogout={onLogout}
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
                        <h3 
                            className={`text-3xl font-black leading-tight mb-2 ${titleStyle.className || ''}`}
                            style={titleStyle.style}
                        >
                            {selectedEvent.title}
                        </h3>
                        <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 font-medium">
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
                            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider text-xs">
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
                            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider text-xs">
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
