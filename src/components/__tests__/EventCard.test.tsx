import React from 'react';
import { render, screen } from '@testing-library/react';
import { EventCard } from '../EventCard';
import { AppEvent } from '../../types';
import { describe, it, expect } from 'vitest';

describe('EventCard', () => {
    const defaultEvent: AppEvent = {
        id: '1',
        title: 'Meeting with Team',
        start: new Date('2024-01-01T10:00:00'),
        end: new Date('2024-01-01T11:00:00'),
        allDay: false,
    };

    it('renders the event title', () => {
        render(<EventCard event={defaultEvent} />);
        expect(screen.getByText('Meeting with Team')).toBeInTheDocument();
    });

    it('renders the time range for non-all-day events', () => {
        render(<EventCard event={defaultEvent} />);
        // Format used in component: HH:mm - HH:mm
        expect(screen.getByText('10:00 - 11:00')).toBeInTheDocument();
    });

    it('does not render time for all-day events', () => {
        const allDayEvent = { ...defaultEvent, allDay: true };
        render(<EventCard event={allDayEvent} />);
        expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
    });

    it('renders a trash icon for "Garbage" events', () => {
        const trashEvent = { ...defaultEvent, title: 'Garbage Day' };
        const { container } = render(<EventCard event={trashEvent} />);
        // We can verify the icon by looking for an SVG or checking logic
        // Lucide icons usually render as svgs.
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
        // Since we can't easily check the exact icon type without checking internals or aria-labels (if added), 
        // presence is a good first step. Ideally add aria-label to icons in component.
    });

    it('uses compact layout for events under 30 minutes', () => {
        const shortEvent: AppEvent = {
            id: '2',
            title: 'Quick Meeting',
            start: new Date('2024-01-01T10:00:00'),
            end: new Date('2024-01-01T10:15:00'), // 15 minutes
            allDay: false,
        };
        const { container } = render(<EventCard event={shortEvent} />);
        // Check for p-0 class (no padding) for short events
        expect(container.firstChild).toHaveClass('p-0');
        // Should show only start time for short events
        expect(screen.getByText('10:00')).toBeInTheDocument();
        // Should NOT show the end time in compact layout
        expect(screen.queryByText('10:00 - 10:15')).not.toBeInTheDocument();
    });

    it('uses standard layout for events 30 minutes or longer', () => {
        const longEvent: AppEvent = {
            id: '3',
            title: 'Long Meeting',
            start: new Date('2024-01-01T10:00:00'),
            end: new Date('2024-01-01T11:00:00'), // 60 minutes
            allDay: false,
        };
        const { container } = render(<EventCard event={longEvent} />);
        // Check for p-1 class (standard padding) for longer events
        expect(container.firstChild).toHaveClass('p-1');
        // Should show full time range
        expect(screen.getByText('10:00 - 11:00')).toBeInTheDocument();
    });

    it('applies custom hex color style when provided', () => {
        const hexEvent: AppEvent = {
            ...defaultEvent,
            color: '#ff0000', // Red
            title: 'Red Event',
        };
        const { container } = render(<EventCard event={hexEvent} />);

        // Should have inline style
        expect(container.firstChild).toHaveStyle({ backgroundColor: '#ff0000' });
        // Should also check contrast text color logic (via class)
        expect(container.firstChild).toHaveClass('text-white');
    });
});
