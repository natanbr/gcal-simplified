import { AppEvent } from '../types';

const today = new Date();
const addDays = (d: Date, days: number) => {
    const newDate = new Date(d);
    newDate.setDate(d.getDate() + days);
    return newDate;
};

// Helper to set time
const setTime = (d: Date, h: number, m: number) => {
    const newDate = new Date(d);
    newDate.setHours(h, m, 0, 0);
    return newDate;
};

export const MOCK_EVENTS: AppEvent[] = [
    // Today
    {
        id: '1',
        title: 'Dad: Dentist Appointment',
        start: setTime(today, 9, 0),
        end: setTime(today, 10, 0),
    },
    {
        id: '2',
        title: 'Mom: Yoga Class',
        start: setTime(today, 12, 0),
        end: setTime(today, 13, 0),
    },
    {
        id: '3',
        title: 'Kids: Soccer Practice',
        start: setTime(today, 16, 30),
        end: setTime(today, 18, 0),
    },

    // Tomorrow
    {
        id: '4',
        title: 'Family Dinner',
        start: setTime(addDays(today, 1), 19, 0),
        end: setTime(addDays(today, 1), 21, 0),
    },

    // Weekend
    {
        id: '5',
        title: 'Grocery Shopping',
        start: setTime(addDays(today, 2), 10, 0),
        end: setTime(addDays(today, 2), 11, 30),
    },
    // Conflict / Overlap Scenario
    {
        id: 'conf1',
        title: 'Kid 1: Karate',
        start: setTime(addDays(today, 5), 10, 0),
        end: setTime(addDays(today, 5), 11, 0),
    },
    {
        id: 'conf2',
        title: 'Kid 2: Karate',
        start: setTime(addDays(today, 5), 10, 0),
        end: setTime(addDays(today, 5), 11, 0),
    },

    // Future Holiday (Badge Style)
    {
        id: '6',
        title: '🇨🇦 Canada Day',
        start: setTime(addDays(today, 3), 0, 0),
        end: setTime(addDays(today, 3), 23, 59),
        allDay: true,
        isHoliday: true
    },

    // Family Vacation (Card Style)
    {
        id: '7',
        title: 'Family Vacation',
        start: setTime(addDays(today, 4), 0, 0),
        end: setTime(addDays(today, 4), 23, 59),
        allDay: true
    }
];

export const MOCK_TASKS = [
    { id: 't1', title: 'Buy Milk', status: 'needsAction' },
    { id: 't2', title: 'Pay Electricity Bill', status: 'needsAction' },
    { id: 't3', title: 'Call Grandma', status: 'completed' },
];
