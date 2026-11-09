// ============================================================
// Settings → General → "Diagnostics folder".
//
// The row only asks main: it shows diagnostics:status, and its buttons send
// diagnostics:choose-folder (main opens the native folder dialog; the window
// never names a path) and diagnostics:disable.
// ============================================================

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiagnosticsFolderRow } from './DiagnosticsFolderRow';

const FOLDER = 'C:\\Users\\parent\\OneDrive\\gcal-diagnostics';
const ON = { enabled: true, folder: FOLDER, hostFolder: `${FOLDER}\\KIDS-PC` };
const OFF = { enabled: false };

const invoke = vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>();
const answers = new Map<string, () => Promise<unknown>>();

beforeEach(() => {
    answers.clear();
    invoke.mockReset();
    invoke.mockImplementation((channel: string) => answers.get(channel)?.() ?? Promise.resolve(null));
    window.ipcRenderer = { invoke, on: vi.fn(() => () => undefined) };
});

afterEach(() => { delete window.ipcRenderer; });

const answer = (channel: string, value: unknown) => answers.set(channel, () => Promise.resolve(value));

describe('DiagnosticsFolderRow', () => {
    it('shows Off when no folder is chosen, and offers no Turn off', async () => {
        answer('diagnostics:status', OFF);
        render(<DiagnosticsFolderRow />);

        expect(await screen.findByTestId('diagnostics-folder')).toHaveTextContent('Off');
        expect(screen.queryByRole('button', { name: /turn off/i })).not.toBeInTheDocument();
    });

    it('shows the folder this computer writes to when one is chosen', async () => {
        answer('diagnostics:status', ON);
        render(<DiagnosticsFolderRow />);

        expect(await screen.findByTestId('diagnostics-folder')).toHaveTextContent(ON.hostFolder);
    });

    it('asks main to choose a folder, passing no path, and shows the answer', async () => {
        answer('diagnostics:status', OFF);
        answer('diagnostics:choose-folder', { ok: true, status: ON });
        render(<DiagnosticsFolderRow />);
        await screen.findByText('Off');

        fireEvent.click(screen.getByRole('button', { name: /choose folder/i }));

        expect(await screen.findByText(ON.hostFolder)).toBeInTheDocument();
        expect(invoke.mock.calls.filter(([channel]) => channel === 'diagnostics:choose-folder')).toEqual([['diagnostics:choose-folder']]);
    });

    it('says nothing when the dialog is cancelled', async () => {
        answer('diagnostics:status', OFF);
        answer('diagnostics:choose-folder', { ok: false, reason: 'cancelled' });
        render(<DiagnosticsFolderRow />);
        await screen.findByText('Off');

        fireEvent.click(screen.getByRole('button', { name: /choose folder/i }));

        await waitFor(() => expect(screen.getByRole('button', { name: /choose folder/i })).toBeEnabled());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByTestId('diagnostics-folder')).toHaveTextContent('Off');
    });

    it('explains a refused folder or a settings file it could not write', async () => {
        answer('diagnostics:status', OFF);
        answer('diagnostics:choose-folder', { ok: false, reason: 'not-a-directory' });
        render(<DiagnosticsFolderRow />);
        await screen.findByText('Off');

        fireEvent.click(screen.getByRole('button', { name: /choose folder/i }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/not a folder/i);

        answer('diagnostics:choose-folder', { ok: false, reason: 'locked' });
        fireEvent.click(screen.getByRole('button', { name: /choose folder/i }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/in use/i));
    });

    it('turns diagnostics off', async () => {
        answer('diagnostics:status', ON);
        answer('diagnostics:disable', { ok: true, status: OFF });
        render(<DiagnosticsFolderRow />);
        await screen.findByText(ON.hostFolder);

        fireEvent.click(screen.getByRole('button', { name: /turn off/i }));

        await waitFor(() => expect(screen.getByTestId('diagnostics-folder')).toHaveTextContent('Off'));
        expect(invoke).toHaveBeenCalledWith('diagnostics:disable');
    });

    it('says so when main cannot be asked', async () => {
        answers.set('diagnostics:status', () => Promise.reject(new Error('Failed (EIO)')));
        render(<DiagnosticsFolderRow />);

        expect(await screen.findByRole('alert')).toHaveTextContent(/could not/i);
    });
});
