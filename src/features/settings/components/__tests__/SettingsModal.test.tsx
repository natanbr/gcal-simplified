import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
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

    /** Per-channel responses: a value resolves, `reject` rejects, a function is called
     *  (to hand back a deferred promise). Unlisted channels use the defaults below. */
    const REJECT = Symbol('reject');
    type Response = unknown | typeof REJECT | (() => Promise<unknown>);
    const setupMocks = (overrides?: {
        calendars?: unknown[];
        taskLists?: unknown[];
        settings?: Record<string, unknown>;
        /** Every channel rejects. */
        error?: boolean;
        channels?: Record<string, Response>;
    }) => {
        const defaults: Record<string, unknown> = {
            'settings:save': { ok: true },
            'data:calendars': overrides?.calendars ?? defaultCalendars,
            'data:tasklists': overrides?.taskLists ?? defaultTaskLists,
            'settings:get': overrides?.settings ?? defaultSettings,
            'app:info': { version: '1.0.0' },
        };
        mockInvoke.mockImplementation((channel: string) => {
            if (overrides?.error) return Promise.reject(new Error('API Error'));
            const response = overrides?.channels && channel in overrides.channels
                ? overrides.channels[channel]
                : defaults[channel] ?? null;
            if (response === REJECT) return Promise.reject(new Error('API Error'));
            if (typeof response === 'function') return (response as () => Promise<unknown>)();
            return Promise.resolve(response);
        });
    };

    const saveButton = () => screen.getByTestId('save-settings-button');
    const saveCalls = () => mockInvoke.mock.calls.filter(([channel]) => channel === 'settings:save');
    const quietConsole = () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => quiet.mockRestore());
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
        quietConsole();
        setupMocks({ channels: { 'data:calendars': REJECT } });

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

    // The saved settings are the only thing Save may write back. A failed load
    // used to leave the `{ calendarIds: [], taskListIds: [] }` placeholder in
    // place, and Save wiped every calendar and task-list selection with it.
    describe('loading', () => {
        // A rejection that is not the main process's own refusal claims no reason it cannot know.
        const SETTINGS_NOT_LOADED = 'Settings could not be loaded. Try again in a moment.';
        const FILE = 'C:\\Users\\parent\\AppData\\Roaming\\gcal-simplified\\settings-file.json';

        it('keeps Save disabled until the saved settings have loaded', async () => {
            let resolveSettings: (value: unknown) => void = () => undefined;
            setupMocks({ channels: { 'settings:get': () => new Promise(resolve => { resolveSettings = resolve; }) } });
            render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);
            await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('settings:get'));

            expect(saveButton()).toBeDisabled();
            fireEvent.click(saveButton());
            expect(saveCalls()).toHaveLength(0);

            await act(async () => resolveSettings(defaultSettings));
            await waitFor(() => expect(saveButton()).toBeEnabled());
        });

        it('says the settings could not be loaded and never saves defaults when settings:get fails', async () => {
            quietConsole();
            setupMocks({ channels: { 'settings:get': REJECT } });
            render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

            const banner = await screen.findByTestId('settings-load-error');
            expect(banner).toHaveTextContent(SETTINGS_NOT_LOADED);
            expect(saveButton()).toBeDisabled();
            fireEvent.click(saveButton());
            await act(async () => undefined);
            expect(saveCalls()).toHaveLength(0);
        });

        it('reports the settings failure, not the first error, when every call fails', async () => {
            quietConsole();
            setupMocks({ error: true });
            render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

            expect(await screen.findByTestId('settings-load-error')).toHaveTextContent(SETTINGS_NOT_LOADED);
            expect(saveButton()).toBeDisabled();
        });

        // ipcRenderer.invoke rejects with "Error invoking remote method '<channel>': Error: <message>";
        // the message is the main process's own sentence, with the reason and the file.
        it.each([
            `Settings could not be loaded: ${FILE} is in use by another program (antivirus or a backup). Try again in a moment.`,
            `Settings could not be loaded: ${FILE} could not be read (EIO). Try again in a moment.`,
        ])('shows the main process sentence (reason and file) when settings:get is refused: %s', async (sentence) => {
            quietConsole();
            setupMocks({ channels: { 'settings:get': () => Promise.reject(new Error(`Error invoking remote method 'settings:get': Error: ${sentence}`)) } });
            render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

            const banner = await screen.findByTestId('settings-load-error');
            expect(banner.textContent).toContain(sentence);
            expect(banner.textContent).not.toContain('Error invoking remote method');
            expect(within(banner).getByText(sentence)).toHaveClass('text-red-600', 'dark:text-red-400');
            expect(saveButton()).toBeDisabled();
        });

        it('still saves the real selections when only the calendars failed to load (offline, expired token)', async () => {
            quietConsole();
            setupMocks({ channels: { 'data:calendars': REJECT } });
            const onClose = vi.fn();
            render(<SettingsModal onClose={onClose} onSave={vi.fn()} />);

            expect(await screen.findByTestId('settings-load-error')).toHaveTextContent('API Error');
            await waitFor(() => expect(saveButton()).toBeEnabled());
            fireEvent.click(saveButton());

            await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
            expect(mockInvoke).toHaveBeenCalledWith('settings:save', expect.objectContaining({ calendarIds: ['cal-1'], taskListIds: ['tl-1'] }));
        });
    });

    // `settings:save` resolves `{ ok: false, reason, file }` when the main process
    // refused to write (file held by antivirus/backup, unreadable, disk full). The
    // modal used to swallow a refusal in a console.error and sit there looking saved.
    describe('saving', () => {
        const FILE = 'C:\\Users\\parent\\AppData\\Roaming\\gcal-simplified\\settings-file.json';

        const renderLoaded = async () => {
            const onClose = vi.fn();
            const onSave = vi.fn();
            render(<SettingsModal onClose={onClose} onSave={onSave} />);
            await waitFor(() => expect(screen.getByText('Calendars (2)')).toBeInTheDocument());
            await waitFor(() => expect(saveButton()).toBeEnabled());
            return { onClose, onSave };
        };

        it('closes and refreshes when the save succeeds (guard)', async () => {
            setupMocks();
            const { onClose, onSave } = await renderLoaded();

            fireEvent.click(saveButton());

            await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
            expect(onSave).toHaveBeenCalledTimes(1);
            expect(mockInvoke).toHaveBeenCalledWith('settings:save', expect.objectContaining({ calendarIds: ['cal-1'] }));
        });

        it.each([
            [{ reason: 'locked', code: 'EBUSY' }, `Settings not saved: ${FILE} is in use by another program (antivirus or a backup). Try again in a moment.`],
            [{ reason: 'unreadable', code: 'EPERM' }, `Settings not saved: ${FILE} could not be read (EPERM). Try again in a moment.`],
            [{ reason: 'unreadable' }, `Settings not saved: ${FILE} could not be read. Try again in a moment.`],
            [{ reason: 'write-failed', code: 'ENOSPC' }, `Settings not saved: ${FILE} could not be written (ENOSPC). Check free disk space and permissions, then try again.`],
            [{ reason: 'write-failed' }, `Settings not saved: ${FILE} could not be written. Check free disk space and permissions, then try again.`],
        ])('stays open and names the file when the save is refused: %o', async (failure, message) => {
            setupMocks({ channels: { 'settings:save': { ok: false, file: FILE, ...failure } } });
            const { onClose, onSave } = await renderLoaded();

            fireEvent.click(saveButton());

            const line = await screen.findByTestId('settings-save-error');
            expect(line).toBeVisible();
            expect(line.textContent).toBe(message);
            expect(onClose).not.toHaveBeenCalled();
            expect(onSave).not.toHaveBeenCalled();
            expect(screen.queryByTestId('settings-load-error')).not.toBeInTheDocument();
        });

        it('never shows an empty line for a refusal reason it does not know', async () => {
            setupMocks({ channels: { 'settings:save': { ok: false, reason: 'from-a-newer-build', file: FILE } } });
            const { onClose } = await renderLoaded();

            fireEvent.click(saveButton());

            expect((await screen.findByTestId('settings-save-error')).textContent).toBe('Settings not saved. Try again.');
            expect(onClose).not.toHaveBeenCalled();
        });

        it('says the settings were not saved when the save call itself fails', async () => {
            quietConsole();
            setupMocks({ channels: { 'settings:save': REJECT } });
            const { onClose, onSave } = await renderLoaded();

            fireEvent.click(saveButton());

            expect((await screen.findByTestId('settings-save-error')).textContent).toBe('Settings not saved. Try again.');
            expect(onClose).not.toHaveBeenCalled();
            expect(onSave).not.toHaveBeenCalled();
        });

        it('clears the error on the next attempt', async () => {
            let attempt = 0;
            setupMocks({ channels: { 'settings:save': () => Promise.resolve(++attempt === 1 ? { ok: false, reason: 'locked', file: FILE } : { ok: true }) } });
            const { onClose } = await renderLoaded();

            fireEvent.click(saveButton());
            await screen.findByTestId('settings-save-error');
            fireEvent.click(saveButton());

            await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
            expect(screen.queryByTestId('settings-save-error')).not.toBeInTheDocument();
        });
    });
});
