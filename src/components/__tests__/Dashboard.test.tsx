// ============================================================
// Calendar — Dashboard integration tests
// Covers: Command Center button render + click, and baseline UI.
// ============================================================

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Dashboard } from '../Dashboard';

// Mock ipcRenderer (Electron) so Dashboard doesn't hang on auth
const mockIpcRenderer = {
    invoke: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
};

beforeEach(() => {
    Object.defineProperty(globalThis, 'ipcRenderer', {
        value: mockIpcRenderer,
        writable: true,
        configurable: true,
    });

    mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'auth:check') return Promise.resolve(true);
        if (channel === 'settings:get') return Promise.resolve({ calendarIds: [], taskListIds: [] });
        if (channel === 'data:tasks') return Promise.resolve([]);
        if (channel === 'weather:get') return Promise.resolve(null);
        return Promise.resolve(null);
    });
});

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
