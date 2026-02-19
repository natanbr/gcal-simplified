import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    const MOTION_PROPS = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'variants', 'layout']);
    const MotionDiv = React.forwardRef(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any, ref: React.Ref<HTMLDivElement>) => {
            const htmlProps = Object.fromEntries(
                Object.entries(props).filter(([key]: [string, unknown]) => !MOTION_PROPS.has(key))
            );
            return React.createElement('div', { ref, ...htmlProps });
        }
    );
    MotionDiv.displayName = 'MotionDiv';
    return {
        motion: { div: MotionDiv },
        AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    };
});

// Mock lucide-react icons with explicit exports
vi.mock('lucide-react', () => {
    const icon = () => null;
    return {
        X: icon, Save: icon, Check: icon, RefreshCw: icon,
        Moon: icon, Sun: icon, Power: icon, Calendar: icon, LogOut: icon,
        User: icon, Settings: icon, CheckSquare: icon,
    };
});

const mockInvoke = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    // Setup window.ipcRenderer mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ipcRenderer = {
        invoke: mockInvoke,
        on: vi.fn(() => vi.fn()),
    };
});

describe('SettingsModal', () => {
    const defaultCalendars = [
        { id: 'cal-1', summary: 'My Calendar', backgroundColor: '#4285f4', primary: true },
        { id: 'cal-2', summary: 'Work Calendar', backgroundColor: '#33b679', primary: false },
    ];

    const defaultTaskLists = [
        { id: 'tl-1', title: 'My Tasks', updated: '2026-01-01T00:00:00Z' },
    ];

    const defaultSettings = {
        calendarIds: ['cal-1'],
        taskListIds: ['tl-1'],
        weekStartDay: 'today',
    };

    const setupMocks = (overrides?: {
        calendars?: unknown[];
        taskLists?: unknown[];
        settings?: Record<string, unknown>;
        error?: boolean;
    }) => {
        mockInvoke.mockImplementation((channel: string) => {
            if (overrides?.error) {
                return Promise.reject(new Error('API Error'));
            }
            switch (channel) {
                case 'data:calendars':
                    return Promise.resolve(overrides?.calendars ?? defaultCalendars);
                case 'data:tasklists':
                    return Promise.resolve(overrides?.taskLists ?? defaultTaskLists);
                case 'settings:get':
                    return Promise.resolve(overrides?.settings ?? defaultSettings);
                case 'app:info':
                    return Promise.resolve({ version: '1.0.0' });
                default:
                    return Promise.resolve(null);
            }
        });
    };

    it('should render at least one calendar when API returns calendars', async () => {
        setupMocks();

        render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Calendars (2)')).toBeInTheDocument();
        });

        // Click on Calendars tab
        fireEvent.click(screen.getByText('Calendars (2)'));

        expect(screen.getByText('My Calendar')).toBeInTheDocument();
        expect(screen.getByText('Work Calendar')).toBeInTheDocument();
        expect(screen.getByText('PRIMARY')).toBeInTheDocument();
    });

    it('should render task lists when API returns task lists', async () => {
        setupMocks();

        render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Task Lists (1)')).toBeInTheDocument();
        });

        // Click on Task Lists tab
        fireEvent.click(screen.getByText('Task Lists (1)'));

        expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });

    it('should always render week start day buttons', async () => {
        setupMocks();

        render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

        // Wait for loading to finish and sidebar to appear
        await waitFor(() => {
            expect(screen.getByText('General')).toBeInTheDocument();
        });

        // Click on General tab
        fireEvent.click(screen.getByText('General'));

        await waitFor(() => {
            expect(screen.getByTestId('week-start-today-button')).toBeInTheDocument();
        });

        expect(screen.getByTestId('week-start-monday-button')).toBeInTheDocument();
        expect(screen.getByTestId('week-start-sunday-button')).toBeInTheDocument();
    });

    it('should show error banner when loading fails', async () => {
        setupMocks({ error: true });

        render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByTestId('settings-load-error')).toBeInTheDocument();
        });

        expect(screen.getByText('API Error')).toBeInTheDocument();
    });

    it('should show empty calendars list with count 0 when API returns empty array', async () => {
        setupMocks({ calendars: [], taskLists: [] });

        render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Calendars (0)')).toBeInTheDocument();
        });

        expect(screen.getByText('Task Lists (0)')).toBeInTheDocument();
    });

    it('should render Configuration title and Save button', async () => {
        setupMocks();

        render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

        expect(screen.getByTestId('settings-modal-title')).toBeInTheDocument();
        expect(screen.getByTestId('save-settings-button')).toBeInTheDocument();
    });
});
