// ============================================================
// Idle animation guard — the Calendar
// ------------------------------------------------------------
// The Calendar is the screen the app sits on all day, and the Mission Control
// tree stays mounted under it (MCStoreProvider, MissionOverlay,
// MoodWindNotification, the bridges). A loop on it draws a frame every vsync:
// the Remote dot's 8 px pulse cost 20-25 % of one CPU core on Mission Control
// (2026-10-04, docs/performance.md); the Calendar idles at 0.2 %.
//
// This renders the real App on the Calendar view, signed in, with its data
// loaded and nothing syncing, and fails if anything on screen loops, against
// every stylesheet in src/ (index.css and Mission Control's, which the App
// bundle applies to the whole window).
// Mission Control's idle screens: src/mission-control/__tests__/idle-animations.test.tsx.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { join } from 'node:path';
import App from '../App';
import { repoRoot } from './helpers/sourceFiles';
import { loopingOnScreen, stylesheetsUnder } from '../mission-control/__tests__/infiniteAnimations';

const everyStylesheet = stylesheetsUnder(join(repoRoot, 'src'));

function day(offset: number, hour: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return d;
}

const ANSWERS: Record<string, unknown> = {
    'auth:check': true,
    'settings:get': { calendarIds: [], taskListIds: [] },
    'data:events': [
        { id: 'e1', title: 'Standup', start: day(0, 9), end: day(0, 10), allDay: false, color: 'blue' },
        { id: 'e2', title: 'Holiday', start: day(1, 0), end: day(2, 0), allDay: true, color: 'green' },
    ],
    'data:tasks': [],
    'data:calendars': [],
    'data:tasklists': [],
    'remote:get-status': true,
};

describe('the idle Calendar renders no looping animation', () => {
    afterEach(() => { delete window.ipcRenderer; });

    it('signed in, data loaded, nothing syncing', async () => {
        window.ipcRenderer = {
            invoke: vi.fn(async (channel: string) => ANSWERS[channel] ?? null),
            on: vi.fn(() => () => {}),
        };
        render(<App />);
        await screen.findByTestId('calendar-grid', undefined, { timeout: 5000 });
        // Settled: the header's sync icon is mounted only while something loads.
        await waitFor(() => {
            expect(document.querySelector('[title="Loading..."], [title="Background Refreshing..."]')).toBeNull();
        }, { timeout: 5000 });

        expect(loopingOnScreen(document, everyStylesheet), 'looping animations on the idle Calendar').toEqual([]);
    });
});
