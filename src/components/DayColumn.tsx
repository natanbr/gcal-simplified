import React, { useMemo } from 'react';
import { AppEvent, UserConfig } from '../types';
import { EventCard } from './EventCard';
import { partitionEventsIntoHourlySlots } from '../utils/timeBuckets';
import { groupOverlappingEvents, calculateEventStyles } from '../utils/layout';
<<<<<<< HEAD
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
        beforeGroups,
        afterGroups,
        hourlyGroups,
        hours,
        startHour,
        endHour
    } = useMemo(() => {
        const startHour = config.activeHoursStart ?? 7;
        const endHour = config.activeHoursEnd ?? 21;
        const hours = Array.from({ length: endHour - startHour }, (_, idx) => startHour + idx);

        const buckets = partitionEventsIntoHourlySlots(standardEvents, startHour, endHour);

        const beforeGroups = groupOverlappingEvents(buckets.before);
        const afterGroups = groupOverlappingEvents(buckets.after);

        // Hourly events processing
        const activeStart = startHour;
        const activeEnd = endHour;

        const hourlyEvents = standardEvents.filter(e => {
             const s = e.start.getHours() + e.start.getMinutes()/60;
             const end = e.end.getHours() + e.end.getMinutes()/60;
             // Check overlap
             return s < activeEnd && end > activeStart;
        }).sort((a,b) => a.start.getTime() - b.start.getTime());

        const hourlyGroups = groupOverlappingEvents(hourlyEvents);

        return { beforeGroups, afterGroups, hourlyGroups, hours, startHour, endHour };
    }, [standardEvents, config.activeHoursStart, config.activeHoursEnd]);

    return (
        <div className={`flex flex-col h-full relative ${isToday ? 'bg-family-cyan/[0.05] dark:bg-family-cyan/[0.03]' : isWeekendDay ? 'bg-family-orange/[0.05] dark:bg-family-orange/[0.03]' : ''}`}>
             {/* Before Bucket content */}
             <div className="h-16 flex-shrink-0 border-b border-zinc-200/50 dark:border-zinc-800/50 overflow-y-auto no-scrollbar relative p-1">
                 <div className="flex gap-0.5">
                    {beforeGroups.map((group, gIdx) => (
                        <div key={`before-${gIdx}`} className="flex-1 min-w-0">
                            {group.map(event => <div key={event.id}><EventCard event={event} onClick={() => onEventClick(event)} /></div>)}
                        </div>
                    ))}
                 </div>
             </div>

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
=======

interface DayColumnProps {
    events: AppEvent[];
    isToday: boolean;
    isWeekend: boolean;
    config: UserConfig;
    onEventClick: (event: AppEvent) => void;
}

export const DayColumn = React.memo<DayColumnProps>(({
    events,
    isToday,
    isWeekend,
    config,
    onEventClick
}) => {
    const startHour = config.activeHoursStart ?? 7;
    const endHour = config.activeHoursEnd ?? 21;

    // Memoize the partitioning and grouping
    const {
        beforeGroups,
        afterGroups,
        hourlyGroups,
        hours
    } = useMemo(() => {
        // Filter out holidays as per original logic if they are treated differently in the grid
        // In Dashboard.tsx: const standardEvents = dayEvents.filter(e => !e.isHoliday);
        const standardEvents = events.filter(e => !e.isHoliday);

        const buckets = partitionEventsIntoHourlySlots(standardEvents, startHour, endHour);
        const hours = Array.from({ length: endHour - startHour }, (_, idx) => startHour + idx);

        const activeStart = startHour;
        const activeEnd = endHour;

        // Prepare hourly events for absolute positioning
        const hourlyEvents = standardEvents.filter(e => {
             const s = e.start.getHours() + e.start.getMinutes()/60;
             const end = e.end.getHours() + e.end.getMinutes()/60;
             return s < activeEnd && end > activeStart;
        }).sort((a,b) => a.start.getTime() - b.start.getTime());

        return {
            beforeGroups: groupOverlappingEvents(buckets.before),
            afterGroups: groupOverlappingEvents(buckets.after),
            hourlyGroups: groupOverlappingEvents(hourlyEvents),
            hours
        };
    }, [events, startHour, endHour]);

    return (
        <div className={`flex flex-col h-full relative ${isToday ? 'bg-family-cyan/[0.05] dark:bg-family-cyan/[0.03]' : isWeekend ? 'bg-family-orange/[0.05] dark:bg-family-orange/[0.03]' : ''}`}>

            {/* Before Bucket content */}
            <div className="h-16 flex-shrink-0 border-b border-zinc-200/50 dark:border-zinc-800/50 overflow-y-auto no-scrollbar relative p-1">
                <div className="flex gap-0.5">
                {beforeGroups.map((group, gIdx) => (
                    <div key={`before-${gIdx}`} className="flex-1 min-w-0">
                        {group.map(event => (
                            <div key={event.id}>
                                <EventCard event={event} onClick={() => onEventClick(event)} />
                            </div>
                        ))}
                    </div>
                ))}
                </div>
            </div>

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
                        const activeStart = startHour;
                        const activeEnd = endHour;
                        const totalHours = activeEnd - activeStart;

                        return hourlyGroups.flatMap(group => {
                            return group.map((event, idx) => {
                                const s = event.start.getHours() + event.start.getMinutes()/60;
                                const e = event.end.getHours() + event.end.getMinutes()/60;

                                const visualsStart = Math.max(s, activeStart);
                                const visualsEnd = Math.min(e, activeEnd);

                                const topP = ((visualsStart - activeStart) / totalHours) * 100;
>>>>>>> b89d42a (feat(perf): extract and memoize DayColumn component in Dashboard)
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
<<<<<<< HEAD
                                    <div
=======
                                    <div
>>>>>>> b89d42a (feat(perf): extract and memoize DayColumn component in Dashboard)
                                        key={event.id}
                                        className="absolute pointer-events-auto"
                                        style={styles}
                                    >
                                        <div className="h-full w-full">
                                            <EventCard
                                                event={event}
                                                className="h-full shadow-md"
                                                onClick={() => onEventClick(event)}
                                            />
                                        </div>
                                    </div>
                                )
<<<<<<< HEAD
                             });
                         });
                      })()}
                  </div>
             </div>

             {/* After Bucket content */}
             <div className="h-16 flex-shrink-0 border-t border-zinc-200/50 dark:border-zinc-800/50 overflow-y-auto no-scrollbar relative p-1">
                 <div className="flex gap-0.5">
                    {afterGroups.map((group, gIdx) => (
                        <div key={`after-${gIdx}`} className="flex-1 min-w-0">
                            {group.map(event => <div key={event.id}><EventCard event={event} onClick={() => onEventClick(event)} /></div>)}
                        </div>
                    ))}
                 </div>
             </div>
=======
                            });
                        });
                    })()}
                </div>
            </div>

            {/* After Bucket content */}
            <div className="h-16 flex-shrink-0 border-t border-zinc-200/50 dark:border-zinc-800/50 overflow-y-auto no-scrollbar relative p-1">
                <div className="flex gap-0.5">
                {afterGroups.map((group, gIdx) => (
                    <div key={`after-${gIdx}`} className="flex-1 min-w-0">
                        {group.map(event => (
                            <div key={event.id}>
                                <EventCard event={event} onClick={() => onEventClick(event)} />
                            </div>
                        ))}
                    </div>
                ))}
                </div>
            </div>
>>>>>>> b89d42a (feat(perf): extract and memoize DayColumn component in Dashboard)
        </div>
    );
});
