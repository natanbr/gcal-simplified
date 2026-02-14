import React, { useMemo, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { AppEvent } from '../types';
import { 
  Trash2, Recycle, Waves, Users, Swords 
} from 'lucide-react';

interface EventCardProps {
  event: AppEvent;
  className?: string;
  onClick?: () => void;
  onEventClick?: (event: AppEvent) => void;
}

import { getEventColorStyles } from '../utils/colorMapping';
import { areEventCardPropsEqual } from '../utils/eventUtils';

// Icon mapping for specific event types
const getEventIcon = (title: string, description?: string) => {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  if (text.includes('garbage') || text.includes('trash')) {
    return <Trash2 size={20} className="opacity-80" />;
  }
  if (text.includes('recycle') || text.includes('recycling')) {
    return <Recycle size={20} className="opacity-80" />;
  }
  if (text.includes('pool') || text.includes('swim')) {
    return <Waves size={20} className="opacity-80" />;
  }
  if (text.includes('scout') || text.includes('scouting')) {
    return <Users size={20} className="opacity-80" />;
  }
  if (text.includes('karate') || text.includes('martial')) {
    return <Swords size={20} className="opacity-80" />;
  }
  
  return null;
};

export const EventCard: React.FC<EventCardProps> = memo(({ event, className, onClick, onEventClick }) => {
  const colorStyles = useMemo(
    () => getEventColorStyles(event.title, event.description, event.colorId, event.color),
    [event.title, event.description, event.colorId, event.color]
  );
  const icon = useMemo(() => getEventIcon(event.title, event.description), [event.title, event.description]);
  
  // Calculate duration in minutes
  const durationMinutes = useMemo(() => {
    return (event.end.getTime() - event.start.getTime()) / (1000 * 60);
  }, [event.start, event.end]);
  
  // For very short events (< 30 min), use minimal padding and compact layout
  const isShortEvent = durationMinutes < 30;

  const handleClick = useCallback(() => {
      // Prioritize the new handler which passes the event object
      if (onEventClick) {
          onEventClick(event);
      } else if (onClick) {
          // Fallback for legacy usage (tests etc)
          onClick();
      }
  }, [onEventClick, onClick, event]);
  
  return (
    <motion.div
      layoutId={event.id}
      data-testid={`event-card-${event.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      className={clsx(
        'w-full rounded-md shadow-sm border-l-[3px] text-sm overflow-hidden leading-tight transition-shadow hover:shadow-md',
        (onClick || onEventClick) && 'cursor-pointer',
        isShortEvent ? 'p-0' : 'p-1',
        colorStyles.className,
        className
      )}
      style={colorStyles.style}
    >
      {isShortEvent ? (
        // Compact single-row layout for short events
        <div className="flex items-center justify-between gap-1 px-1 py-0.5 h-full">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="font-bold opacity-90 truncate text-[11px]">
              {event.title}
            </span>
            {!event.allDay && (
              <span className="opacity-75 text-[9px] whitespace-nowrap flex-shrink-0">
                {format(event.start, 'HH:mm')}
              </span>
            )}
          </div>
          {icon && <div className="flex-shrink-0 scale-75">{icon}</div>}
        </div>
      ) : (
        // Standard multi-row layout for longer events
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="font-bold opacity-90 truncate">
               {event.title}
            </span>
            {icon}
          </div>
          {!event.allDay && (
              <div className="flex justify-between items-center opacity-75 text-[10px]">
                  <span>{format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}</span>
              </div>
          )}
        </div>
      )}
    </motion.div>
  );
}, areEventCardPropsEqual);
