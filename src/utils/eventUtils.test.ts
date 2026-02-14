import { describe, it, expect } from 'vitest';
import { areEventsEqual, areEventCardPropsEqual } from './eventUtils';
import { AppEvent } from '../types';

describe('areEventsEqual', () => {
    const baseEvent: AppEvent = {
        id: 'evt_1',
        title: 'Meeting',
        start: new Date('2024-01-01T10:00:00Z'),
        end: new Date('2024-01-01T11:00:00Z'),
        allDay: false,
        location: 'Room A',
        description: 'Discuss things',
        colorId: '1',
        color: '#ff0000',
    };

    it('returns true for same object reference', () => {
        expect(areEventsEqual(baseEvent, baseEvent)).toBe(true);
    });

    it('returns true for deep equal objects with new references', () => {
        const event2 = {
            ...baseEvent,
            start: new Date(baseEvent.start), // New Date object
            end: new Date(baseEvent.end),     // New Date object
        };
        expect(areEventsEqual(baseEvent, event2)).toBe(true);
    });

    it('returns false if id differs', () => {
        const event2 = { ...baseEvent, id: 'evt_2' };
        expect(areEventsEqual(baseEvent, event2)).toBe(false);
    });

    it('returns false if title differs', () => {
        const event2 = { ...baseEvent, title: 'Meeting 2' };
        expect(areEventsEqual(baseEvent, event2)).toBe(false);
    });

    it('returns false if start time differs', () => {
        const event2 = { ...baseEvent, start: new Date('2024-01-01T10:01:00Z') };
        expect(areEventsEqual(baseEvent, event2)).toBe(false);
    });

    it('returns false if end time differs', () => {
        const event2 = { ...baseEvent, end: new Date('2024-01-01T11:01:00Z') };
        expect(areEventsEqual(baseEvent, event2)).toBe(false);
    });

    it('returns false if allDay differs', () => {
        const event2 = { ...baseEvent, allDay: true };
        expect(areEventsEqual(baseEvent, event2)).toBe(false);
    });

    it('returns false if location differs', () => {
        const event2 = { ...baseEvent, location: 'Room B' };
        expect(areEventsEqual(baseEvent, event2)).toBe(false);
    });

    it('returns false if description differs', () => {
        const event2 = { ...baseEvent, description: 'Updated' };
        expect(areEventsEqual(baseEvent, event2)).toBe(false);
    });

    it('returns false if colorId differs', () => {
        const event2 = { ...baseEvent, colorId: '2' };
        expect(areEventsEqual(baseEvent, event2)).toBe(false);
    });

    it('returns false if color differs', () => {
        const event2 = { ...baseEvent, color: '#00ff00' };
        expect(areEventsEqual(baseEvent, event2)).toBe(false);
    });
});

describe('areEventCardPropsEqual', () => {
    const baseEvent: AppEvent = {
        id: '1',
        title: 'A',
        start: new Date(),
        end: new Date()
    };

    it('returns true if only event prop is deep equal', () => {
        const props1 = { event: baseEvent, className: 'foo' };
        const props2 = { event: { ...baseEvent }, className: 'foo' };
        expect(areEventCardPropsEqual(props1, props2)).toBe(true);
    });

    it('returns false if className differs', () => {
        const props1 = { event: baseEvent, className: 'foo' };
        const props2 = { event: baseEvent, className: 'bar' };
        expect(areEventCardPropsEqual(props1, props2)).toBe(false);
    });

    it('ignores onClick changes', () => {
        const props1 = { event: baseEvent, onClick: () => {} };
        const props2 = { event: baseEvent, onClick: () => {} };
        expect(areEventCardPropsEqual(props1, props2)).toBe(true);
    });
});
