// RemoteIndicator: the colour says connected or offline; the pulse plays a few
// times when the status changes and then stops. It used to loop for as long as
// Mission Control was open: 20-25 % of one CPU core on the child's screen
// (measured 2026-10-04), all of it frame production for an 8 px dot.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteStatusProvider } from '../contexts/RemoteStatusContext';
import { RemoteIndicator } from './RemoteIndicator';
import { animationDeclarationOf, infiniteCssRules } from '../__tests__/infiniteAnimations';

const here = dirname(fileURLToPath(import.meta.url));
const mcCss = readFileSync(resolve(here, '..', 'styles', 'mc.css'), 'utf8');

let pushStatus: ((online: unknown) => void) | null = null;

function renderOnline(initial: boolean) {
    window.ipcRenderer = {
        invoke: vi.fn(async (channel: string) => (channel === 'remote:get-status' ? initial : null)),
        on: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
            if (channel === 'remote:status-changed') pushStatus = cb;
            return () => { pushStatus = null; };
        }),
    };
    return render(<RemoteStatusProvider><RemoteIndicator /></RemoteStatusProvider>);
}

describe('RemoteIndicator — status at a glance, no loop', () => {
    beforeEach(() => { pushStatus = null; });
    afterEach(() => { delete window.ipcRenderer; });

    it('shows green while connected and red while offline', async () => {
        renderOnline(true);
        await waitFor(() => expect(screen.getByTestId('mc-remote-dot')).toHaveAttribute('data-status', 'online'));
        expect(screen.getByTestId('mc-remote-dot').style.backgroundColor).toBe('var(--mc-green)');

        act(() => pushStatus?.(false));
        expect(screen.getByTestId('mc-remote-dot')).toHaveAttribute('data-status', 'offline');
        expect(screen.getByTestId('mc-remote-dot').style.backgroundColor).toBe('var(--mc-red)');
    });

    it('pulses with a finite iteration count, never `infinite`', () => {
        const declaration = animationDeclarationOf(mcCss, '.mc-anim-remote-pulse');
        expect(declaration, 'the dot must keep its pulse class rule').not.toBeNull();
        expect(declaration).not.toMatch(/\binfinite\b/);
        expect(declaration).toMatch(/\bmc-remote-pulse\b.*\s[1-9]\d*$/);
        expect(infiniteCssRules(mcCss).map(r => r.selector)).not.toContain('.mc-anim-remote-pulse');
    });

    it('replays the pulse on every status change: the dot is a new element', async () => {
        renderOnline(true);
        await waitFor(() => expect(screen.getByTestId('mc-remote-dot')).toHaveAttribute('data-status', 'online'));
        const connected = screen.getByTestId('mc-remote-dot');
        expect(connected).toHaveClass('mc-anim-remote-pulse');

        act(() => pushStatus?.(false));
        const dropped = screen.getByTestId('mc-remote-dot');
        expect(dropped).not.toBe(connected);
        expect(dropped).toHaveClass('mc-anim-remote-pulse');

        act(() => pushStatus?.(true));
        expect(screen.getByTestId('mc-remote-dot')).not.toBe(dropped);
    });

    it('does not replay it when nothing changed (same element across a repeated status)', async () => {
        renderOnline(true);
        await waitFor(() => expect(screen.getByTestId('mc-remote-dot')).toHaveAttribute('data-status', 'online'));
        const dot = screen.getByTestId('mc-remote-dot');
        act(() => pushStatus?.(true));
        expect(screen.getByTestId('mc-remote-dot')).toBe(dot);
    });
});
