// ============================================================
// GoalPedestal — the "+" tap traces what the picker was given, and the picker
// shows exactly what the trace says.
//
// Once, every quick-game rule looked true on the production laptop and 🐍 was
// still missing from the picker. The pedestal decides with quickGameEligibility
// and each tap sends that same object to the diagnostics folder, so a refusal
// can be read back afterwards. The locked "+" opens nothing but is traced too.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY } from '../store/useMCStore';
import { MISSED_LOCK_THRESHOLD } from '../store/missionStreak';
import { GoalPedestal } from './GoalPedestal';
import { DragLayer } from './DragLayer';
import type { DisplayCase, MCState } from '../types';

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, ...props }: any, ref: any) =>
                    React.createElement(prop, { ...props, ref }, c)
                );
            },
        }),
    };
});

const invoke = vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>();
const tapTraces = () => invoke.mock.calls
    .filter(([channel, payload]) => channel === 'diagnostics:trace' && typeof payload === 'object' && payload !== null && 'event' in payload && payload.event === 'plus-tap')
    .map(([, payload]) => payload);

const TODAY = '2026-09-02';
const EMPTY: DisplayCase = { id: 0, status: 'empty', reward: null, tokenCount: 0, targetCount: 5 };

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0)); // local noon, between the missions
    invoke.mockReset();
    invoke.mockResolvedValue(null);
    window.ipcRenderer = { invoke, on: vi.fn(() => () => undefined) };
});

afterEach(() => {
    vi.useRealTimers();
    delete window.ipcRenderer;
    localStorage.clear();
});

/** Every quick-game rule true (a game token, neutral mood, this morning concluded), then the patch. */
function renderEmptyGoal(patch: Partial<MCState> = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        gameTokens: 1, moodWind: 0, moodLastResetDate: TODAY, activeMission: 'none',
        lastCompletedOrFailedMorningDate: TODAY, missedMissionStreak: 0, cases: [EMPTY], ...patch,
    }));
    render(
        <MCStoreProvider>
            <DragLayer>
                <GoalPedestal case_={EMPTY} cases={[EMPTY]} bankCount={3} layoutRects={{ bank: null, cases: {} }} />
            </DragLayer>
        </MCStoreProvider>,
    );
}

function tapPlus(label = 'Add a new goal') {
    act(() => { fireEvent.click(screen.getByLabelText(label)); });
}

describe('GoalPedestal — the "+" tap trace', () => {
    it('traces a tap that shows 🐍, and the picker shows it', () => {
        renderEmptyGoal();
        tapPlus();

        expect(screen.getByText('Quick Game')).toBeInTheDocument();
        expect(tapTraces()).toEqual([expect.objectContaining({
            event: 'plus-tap', caseId: 0, pickerOpened: true, pickerVisible: true, windowOpen: true,
            gameTokens: 1, moodWind: 0, today: TODAY, lastCompletedOrFailedMorningDate: TODAY,
        })]);
    });

    it.each([
        { rule: 'mood below neutral', patch: { moodWind: -1 }, field: { moodWind: -1, windowOpen: true } },
        { rule: 'no game token', patch: { gameTokens: 0 }, field: { gameTokens: 0, windowOpen: true } },
        { rule: 'the morning mission not concluded today', patch: { lastCompletedOrFailedMorningDate: '2026-09-01' }, field: { windowOpen: false } },
    ])('traces a tap that hides 🐍 ($rule), and the picker hides it', ({ patch, field }) => {
        renderEmptyGoal(patch);
        tapPlus();

        expect(screen.getByText(/Pick a Goal/i)).toBeInTheDocument();
        expect(screen.queryByText('Quick Game')).not.toBeInTheDocument();
        expect(tapTraces()).toEqual([expect.objectContaining({ event: 'plus-tap', pickerOpened: true, pickerVisible: false, ...field })]);
    });

    it('traces the locked "+" too, which opens no picker', () => {
        renderEmptyGoal({ missedMissionStreak: MISSED_LOCK_THRESHOLD });
        tapPlus('Bank locked — finish your next mission');

        expect(screen.queryByText(/Pick a Goal/i)).not.toBeInTheDocument();
        expect(tapTraces()).toEqual([expect.objectContaining({ event: 'plus-tap', pickerOpened: false, economyLocked: true, pickerVisible: false })]);
    });
});
