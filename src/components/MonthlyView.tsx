import React from 'react';
import { format, isSameMonth, isSameDay } from 'date-fns';
import { AppEvent } from '../types';
import { getEventColorStyles } from '../utils/colorMapping';

interface MonthlyViewProps {
  days: Date[];
  events: AppEvent[];
  onEventClick: (event: AppEvent) => void;
  currentDate: Date;
  referenceDate: Date; // The month we are currently viewing
}

export const MonthlyView: React.FC<MonthlyViewProps> = ({ days, events, onEventClick, currentDate, referenceDate }) => {
    // Day names header
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // Reorder day names based on the first day of the grid
    const firstDay = days[0].getDay();
    const orderedDayNames = [...dayNames.slice(firstDay), ...dayNames.slice(0, firstDay)];

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-950 transition-colors duration-300">
            {/* Day Names Header */}
            <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
                {orderedDayNames.map(name => (
                    <div key={name} className="py-3 text-center text-[12px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                        {name}
                    </div>
                ))}
            </div>

            {/* Grid */}
            <div className="flex-1 grid grid-cols-7 grid-rows-5 divide-x divide-y divide-zinc-200 dark:divide-zinc-800 border-b border-zinc-200 dark:border-zinc-800">
                {days.map((day) => {
                    const dayEvents = events.filter(e => isSameDay(new Date(e.start), day));
                    const isToday = isSameDay(day, currentDate);
                    const isCurrentMonth = isSameMonth(day, referenceDate);

                    return (
                        <div
                            key={day.toISOString()}
                            className={`flex flex-col p-2 min-h-0 overflow-hidden transition-colors ${!isCurrentMonth ? 'bg-zinc-50/30 dark:bg-zinc-900/10' : ''} ${isToday ? 'bg-family-cyan/5 dark:bg-family-cyan/10' : ''}`}
                        >
                            <div className="flex justify-end mb-2">
                                <span className={`text-sm font-black ${
                                    isToday
                                        ? 'bg-family-cyan text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg shadow-family-cyan/30'
                                        : isCurrentMonth
                                            ? 'text-zinc-800 dark:text-zinc-200'
                                            : 'text-zinc-300 dark:text-zinc-700'
                                }`}>
                                    {format(day, 'd')}
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-1.5 no-scrollbar">
                                {dayEvents.map(event => {
                                    const { style, className } = getEventColorStyles(event.title, event.description, event.colorId, event.color);

                                    // Use the background color for the bullet point
                                    // If style.backgroundColor is missing (Tailwind class used), we might need a fallback or parse it
                                    // But usually getEventColorStyles returns style for custom colors.
                                    // For Google colors, it returns className with bg-xxx.

                                    return (
                                        <button
                                            key={event.id}
                                            onClick={() => onEventClick(event)}
                                            className="w-full flex items-center gap-2 group text-left outline-none"
                                        >
                                            <div
                                                className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-sm group-hover:scale-125 transition-transform ${!style?.backgroundColor ? className.split(' ')[0] : ''}`}
                                                style={style?.backgroundColor ? { backgroundColor: style.backgroundColor } : {}}
                                            />
                                            <span className="text-[11px] font-bold truncate text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors uppercase tracking-tight">
                                                {event.title}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
