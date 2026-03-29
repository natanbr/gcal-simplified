import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Clock, MapPin, AlignLeft } from 'lucide-react';
import { SideDrawer } from './SideDrawer';
import { AppEvent } from '../types';
import { getEventTitleStyle } from '../utils/colorMapping';

interface EventDetailDrawerProps {
  selectedEvent: AppEvent | null;
  onClose: () => void;
}

export const EventDetailDrawer: React.FC<EventDetailDrawerProps> = ({ selectedEvent, onClose }) => {
  const titleStyle = useMemo(() =>
      selectedEvent ? getEventTitleStyle(selectedEvent.colorId, selectedEvent.color) : {},
  [selectedEvent]);

  return (
      <SideDrawer
        isOpen={!!selectedEvent}
        onClose={onClose}
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
  );
};
