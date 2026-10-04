// RemoteIndicator: the dot says connected (filled green) or offline (hollow red
// ring), and its pulse plays a few times on a change, then stops. It used to
// loop for as long as Mission Control was open: 20-25 % of one CPU core on the
// child's screen (measured 2026-10-04), all of it frame production for an 8 px dot.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteStatusProvider } from '../contexts/RemoteStatusContext';
import { REMOTE_PULSE_GAP_MS, RemoteIndicator } from './RemoteIndicator';
import { animationDeclarationOf, infiniteCssRules } from '../__tests__/infiniteAnimations';

const here = dirname(fileURLToPath(import.meta.url));
const mcCss = readFileSync(resolve(here, '..', 'styles', 'mc.css'), 'utf8');

let pushStatus: ((online: unknown) => void) | null = null;

function Host({ note }: { note: string }) {
    return (
        <RemoteStatusProvider>
            <span data-testid="unrelated">{note}</span>
            <RemoteIndicator />
        </RemoteStatusProvider>
    );
}

async function renderConnected() {
    window.ipcRenderer = {
        invoke: vi.fn(async (channel: string) => (channel === 'remote:get-status' ? true : null)),
        on: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
            if (channel === 'remote:status-changed') pushStatus = cb;
            return () => { pushStatus = null; };
        }),
    };
    const view = render(<Host note="a" />);
    await waitFor(() => expect(screen.getByTestId('mc-remote-dot')).toHaveAttribute('data-status', 'online'));
    return view;
}

const dot = () => screen.getByTestId('mc-remote-dot');
const NOON = new Date(2026, 9, 4, 12, 0, 0, 0).getTime();
let elapsed = 0;
/** Moves the fake monotonic clock (performance.now) and the wall clock to `ms` after the start. */
const at = (ms: number) => {
    vi.advanceTimersByTime(ms - elapsed);
    vi.setSystemTime(NOON + ms);
    elapsed = ms;
};

describe('RemoteIndicator — status at a glance, no loop', () => {
    beforeEach(() => {
        pushStatus = null;
        elapsed = 0;
        vi.useFakeTimers({ toFake: ['performance', 'Date'] });
        vi.setSystemTime(NOON);
    });
    afterEach(() => {
        vi.useRealTimers();
        delete window.ipcRenderer;
    });

    it('connected is a filled green dot, offline a hollow red ring, each with a label', async () => {
        await renderConnected();
        expect(screen.getByRole('img', { name: 'Remote: connected' })).toBe(dot());
        expect(dot().style.backgroundColor).toBe('var(--mc-green)');
        expect(dot().parentElement).toHaveAttribute('title', 'Remote: connected');

        act(() => pushStatus?.(false));
        expect(screen.getByRole('img', { name: 'Remote: offline' })).toBe(dot());
        expect(dot().style.backgroundColor).toBe('transparent');
        expect(dot().style.border).toBe('2px solid var(--mc-red)');
        expect(dot().parentElement).toHaveAttribute('title', 'Remote: offline');
    });

    it('pulses with a finite iteration count in its own rule, never `infinite`', () => {
        const declaration = animationDeclarationOf(mcCss, '.mc-anim-remote-pulse');
        expect(declaration, 'the dot must keep its pulse class rule').not.toBeNull();
        expect(declaration).not.toMatch(/\binfinite\b/);
        expect(declaration).toMatch(/\bmc-remote-pulse\b.*\s[1-9]\d*$/);
        expect(infiniteCssRules(mcCss).map(r => r.selector)).not.toContain('.mc-anim-remote-pulse');
    });

    it(`replays the pulse on a status change once the last pulse is ${REMOTE_PULSE_GAP_MS / 1000} s old`, async () => {
        await renderConnected();
        const first = dot();

        at(REMOTE_PULSE_GAP_MS);
        act(() => pushStatus?.(false));
        const dropped = dot();
        expect(dropped, 'a new element plays the pulse again').not.toBe(first);
        expect(dropped).toHaveClass('mc-anim-remote-pulse');

        at(2 * REMOTE_PULSE_GAP_MS);
        act(() => pushStatus?.(true));
        expect(dot()).not.toBe(dropped);
    });

    it('keeps pulsing on changes after the wall clock is set back an hour (the gap runs on monotonic time)', async () => {
        await renderConnected();
        const first = dot();
        vi.setSystemTime(NOON - 3_600_000);
        vi.advanceTimersByTime(REMOTE_PULSE_GAP_MS);
        act(() => pushStatus?.(false));
        expect(dot(), 'a new element plays the pulse again').not.toBe(first);
    });

    it('changes the colour but does not restart the pulse inside the gap', async () => {
        await renderConnected();
        const first = dot();
        at(REMOTE_PULSE_GAP_MS - 1);
        act(() => pushStatus?.(false));
        expect(dot()).toBe(first);
        expect(dot()).toHaveAttribute('data-status', 'offline');
    });

    it('a remote flapping every second for 2 minutes pulses only every 30 s', async () => {
        await renderConnected();
        const pulses = new Set<HTMLElement>([dot()]);
        for (let s = 1; s < 120; s++) {
            at(s * 1000);
            act(() => pushStatus?.(s % 2 === 0));
            pulses.add(dot());
        }
        // The mount pulse, then one at 30, 60 and 90 s: 24 s of pulsing in 120 s.
        expect(pulses.size).toBe(4);
    });

    it('keeps the same dot when its parent re-renders for an unrelated reason', async () => {
        const view = await renderConnected();
        const before = dot();
        at(2 * REMOTE_PULSE_GAP_MS);
        view.rerender(<Host note="b" />);
        expect(screen.getByTestId('unrelated')).toHaveTextContent('b');
        expect(dot()).toBe(before);
    });
});
