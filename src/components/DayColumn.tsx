import React, { useMemo } from 'react';
import { AppEvent, UserConfig } from '../types';
import { EventCard } from './EventCard';
import { partitionEventsIntoHourlySlots } from '../utils/timeBuckets';
import { groupOverlappingEvents, calculateEventStyles } from '../utils/layout';

import { isWeekend } from 'date-fns';



interface DayColumnProps {
    day: Date;
    events: AppEvent[];
    config: UserConfig;
    isToday: boolean;
    onEventClick: (event: AppEvent) => void;
}

export const DayColumn: React.FC<DayColumnProps> = React.memo(({ day, events, config, isToday, onEventClick }) => {
    const isWeekendDay = isWeekend(day);

    // Filter standard events (non-holidays) for the layout
    const standardEvents = useMemo(() => events.filter(e => !e.isHoliday), [events]);

        const {
        hourlyGroups,
        hours,
        startHour,
        endHour
    } = useMemo(() => {
        const startHour = config.activeHoursStart ?? 7;
        const endHour = config.activeHoursEnd ?? 21;
        const hours = Array.from({ length: endHour - startHour }, (_, idx) => startHour + idx);

        const buckets = partitionEventsIntoHourlySlots(standardEvents, startHour, endHour);

        // Hourly events processing
        const hourlyEvents = buckets.hourly.sort((a, b) => a.start.getTime() - b.start.getTime());

        const hourlyGroups = groupOverlappingEvents(hourlyEvents);

        return { hourlyGroups, hours, startHour, endHour };
    }, [standardEvents, config.activeHoursStart, config.activeHoursEnd]);

    return (
        <div
            className={`flex flex-col h-full relative ${isToday ? 'bg-family-cyan/[0.05] dark:bg-family-cyan/[0.03]' : isWeekendDay ? 'bg-family-orange/[0.05] dark:bg-family-orange/[0.03]' : ''}`}
            data-testid="day-column"
        >


             {/* Hourly Slots Content (Absolute) */}
             <div className="flex-1 relative flex flex-col min-h-0">
                  {/* Background Grid Lines */}
                  <div className="absolute inset-0 flex flex-col pointer-events-none">
                      {hours.map(hour => (
                          <div key={`grid-${hour}`} className="flex-1 border-b border-zinc-200/50 dark:border-zinc-800/30" />
                      ))}
                  </div>

                  {/* Absolute Events Layer */}
                  <div className="absolute inset-0 pointer-events-none">
                       {(() => {
                         const totalHours = endHour - startHour;

                         return hourlyGroups.flatMap(group => {
                             return group.map((event, idx) => {
                                const s = event.start.getHours() + event.start.getMinutes()/60;
                                const e = event.end.getHours() + event.end.getMinutes()/60;

                                const visualsStart = Math.max(s, startHour);
                                const visualsEnd = Math.min(e, endHour);

                                const topP = ((visualsStart - startHour) / totalHours) * 100;
                                const duration = visualsEnd - visualsStart;
                                const heightP = (duration / totalHours) * 100;

                                const widthP = 100 / group.length;
                                const leftP = idx * widthP;

                                const styles = calculateEventStyles(
                                    topP,
                                    heightP,
                                    leftP,
                                    widthP,
                                    duration
                                );

                                return (
                                    <div
                                        key={event.id}
                                        className="absolute pointer-events-auto"
                                        style={styles}
                                    >
                                        <div className="h-full w-full">
                                            <EventCard
                                                event={event}
                                                className="h-full shadow-md"
                                                onEventClick={onEventClick}
                                            />
                                        </div>
                                    </div>
                                )
                             });
                         });
                      })()}
                  </div>
             </div>


        </div>
    );
}, areDayColumnPropsEqual);
