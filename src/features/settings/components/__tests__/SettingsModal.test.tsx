import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';
import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', async () => {
    const React = await import('react');
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

// Mock lucide-react icons: pass through to the real module so any icon used
// in SettingsModal is automatically available (avoids "No X export" errors).
vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('lucide-react')>();
    return { ...actual };
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
        /** Only `settings:save` rejects — the loads succeed, so no load banner. */
        saveError?: boolean;
    }) => {
        mockInvoke.mockImplementation((channel: string) => {
            if (overrides?.error) {
                return Promise.reject(new Error('API Error'));
            }
            switch (channel) {
                case 'settings:save':
                    return overrides?.saveError
                        ? Promise.reject(new Error("Error invoking remote method 'settings:save': Error: config.json could not be read (EBUSY)"))
                        : Promise.resolve(undefined);
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

    // The main process refuses to write over a config.json it could not read
    // (locked by antivirus/backup, or corrupt) and rejects `settings:save`. The
    // modal used to swallow that in a console.error and sit there looking saved.
    describe('saving', () => {
        it('closes and refreshes when the save succeeds (guard)', async () => {
            setupMocks();
            const onClose = vi.fn();
            const onSave = vi.fn();
            render(<SettingsModal onClose={onClose} onSave={onSave} />);
            await waitFor(() => expect(screen.getByText('Calendars (2)')).toBeInTheDocument());

            fireEvent.click(screen.getByTestId('save-settings-button'));

            await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
            expect(onSave).toHaveBeenCalledTimes(1);
            expect(mockInvoke).toHaveBeenCalledWith('settings:save', expect.objectContaining({ calendarIds: ['cal-1'] }));
        });

        it('stays open and says the settings were not saved when the save is refused', async () => {
            setupMocks({ saveError: true });
            const onClose = vi.fn();
            const onSave = vi.fn();
            const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            onTestFinished(() => quiet.mockRestore());
            render(<SettingsModal onClose={onClose} onSave={onSave} />);
            await waitFor(() => expect(screen.getByText('Calendars (2)')).toBeInTheDocument());

            fireEvent.click(screen.getByTestId('save-settings-button'));

            const banner = await screen.findByTestId('settings-save-error');
            expect(banner).toBeVisible();
            expect(banner).toHaveTextContent(/not saved/i);
            expect(onClose).not.toHaveBeenCalled();
            expect(onSave).not.toHaveBeenCalled();
            expect(screen.queryByTestId('settings-load-error')).not.toBeInTheDocument();
        });
    });
});
