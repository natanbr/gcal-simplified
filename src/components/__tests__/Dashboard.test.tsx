// ============================================================
// Calendar — Dashboard integration tests
// Covers: Command Center button render + click, and baseline UI.
// ============================================================

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { Dashboard } from '../Dashboard';
import { installCalendarIpc, settle, type CalendarIpc } from '../calendarTestKit';

// The shared Calendar IPC fake: data:events answers a list, so these tests run
// the Dashboard's normal path rather than a failed fetch.
let ipc: CalendarIpc;
beforeEach(() => { ipc = installCalendarIpc(); });
afterEach(() => { delete window.ipcRenderer; });

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, ...props }: any, ref: any) =>
                    React.createElement(prop, { ...props, ref }, c)
                );
            },
        }),
    };
});

describe('Dashboard — Command Center button', () => {
    it('renders the Command Center button when onSwitchToMC is provided', async () => {
        const onSwitchToMC = vi.fn();
        render(<Dashboard onSwitchToMC={onSwitchToMC} />);
        const btn = await screen.findByTestId('switch-to-mc-btn');
        expect(btn).toBeTruthy();
    });

    it('calls onSwitchToMC when the Command Center button is clicked', async () => {
        const onSwitchToMC = vi.fn();
        render(<Dashboard onSwitchToMC={onSwitchToMC} />);
        const btn = await screen.findByTestId('switch-to-mc-btn');
        fireEvent.click(btn);
        expect(onSwitchToMC).toHaveBeenCalledTimes(1);
    });

    it('does not render the Command Center button when onSwitchToMC is omitted', async () => {
        render(<Dashboard />);
        await screen.findByTestId('settings-button');
        expect(screen.queryByTestId('switch-to-mc-btn')).toBeNull();
    });
});

describe('Dashboard — view mode controls', () => {
    it('renders the weekly and monthly toggle buttons', async () => {
        render(<Dashboard onSwitchToMC={vi.fn()} />);
        const weeklyBtn = await screen.findByText(/Weekly/i);
        expect(weeklyBtn).toBeTruthy();
        expect(screen.getByText(/Monthly/i)).toBeTruthy();
    });

    it('renders the today navigation button', async () => {
        render(<Dashboard onSwitchToMC={vi.fn()} />);
        const todayBtn = await screen.findByTestId('today-button');
        expect(todayBtn).toBeTruthy();
    });

    it('renders the settings button', async () => {
        render(<Dashboard onSwitchToMC={vi.fn()} />);
        const settingsBtn = await screen.findByTestId('settings-button');
        expect(settingsBtn).toBeTruthy();
    });
});

// settings:get rejects while another program holds the settings file. The
// events, tasks and weather loaded fine, so that must not read as a failed load.
describe('Dashboard — settings file busy at start-up', () => {
    it('keeps the loaded calendar without an error when settings:get fails', async () => {
        ipc.failing.add('settings:get');
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => quiet.mockRestore());

        render(<Dashboard />);
        await settle();

        expect(ipc.requests('settings:get')).toHaveLength(1);
        expect(screen.queryByTestId('calendar-read-notice')).toBeNull();
        expect(screen.getByTestId('settings-button')).toBeTruthy();
    });
});
