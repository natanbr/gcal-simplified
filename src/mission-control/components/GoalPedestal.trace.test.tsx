// ============================================================
// GoalPedestal — the picker's trace is the very decision its render made.
//
// Once, every quick-game rule looked true on the production laptop and 🐍 was
// still missing from the picker. The trace exists to record what the picker was
// given, so it must be the object and the list the render decided with, not a
// second read a few milliseconds later: at 18:59:59.9 a second read is another
// answer. These cases move the clock between the tap and the render, and
// between the render and the trace being sent; a trace built from any read but
// the render's disagrees with what is on screen.
// The locked "+" opens nothing; its tap is traced with that render's object.
// ============================================================

import React, { useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY, useMCDispatch } from '../store/useMCStore';
import { MISSED_LOCK_THRESHOLD } from '../store/missionStreak';
import { REWARDS } from '../rewardCatalogue';
import { GoalPedestal } from './GoalPedestal';
import { DragLayer } from './DragLayer';
import type { DisplayCase, MCAction, MCState } from '../types';

/** Moves the clock at a chosen point: after a motion element's click handler, or when one mounts. */
const clock = vi.hoisted(() => ({ afterClick: null as null | (() => void), onMount: null as null | (() => void) }));

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    // One component per tag, so an element mounts once (a fresh type per render would remount it).
    const made = new Map<string, React.ElementType>();
    const make = (tag: string) => React.forwardRef<HTMLElement, Record<string, unknown>>(({ children, onClick, ...props }, ref) => {
        useEffect(() => { clock.onMount?.(); }, []);
        const click = typeof onClick === 'function' ? (event: React.MouseEvent) => { onClick(event); clock.afterClick?.(); } : undefined;
        return React.createElement(tag, { ...props, ref, onClick: click }, children as React.ReactNode);
    });
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, tag: string) => {
                if (!made.has(tag)) made.set(tag, make(tag));
                return made.get(tag);
            },
        }),
    };
});

const invoke = vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>();
const tracesOf = (event: string) => invoke.mock.calls
    .filter(([channel, payload]) => channel === 'diagnostics:trace' && typeof payload === 'object' && payload !== null && 'event' in payload && payload.event === event)
    .map(([, payload]) => payload);

const TODAY = '2026-09-02';
const at = (hh: number, mm: number, ss = 0) => new Date(2026, 8, 2, hh, mm, ss); // local time
const EMPTY: DisplayCase = { id: 0, status: 'empty', reward: null, tokenCount: 0, targetCount: 5 };

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(18, 59, 30)); // the evening mission starts at 19:00
    clock.afterClick = null;
    clock.onMount = null;
    invoke.mockReset();
    invoke.mockResolvedValue(null);
    window.ipcRenderer = { invoke, on: vi.fn(() => () => undefined) };
});

afterEach(() => {
    vi.useRealTimers();
    delete window.ipcRenderer;
    localStorage.clear();
});

let dispatch: (action: MCAction) => void = () => undefined;
function Probe() {
    dispatch = useMCDispatch();
    return null;
}

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
                <Probe />
            </DragLayer>
        </MCStoreProvider>,
    );
}

/** The reward ids the picker shows, in order, read off the screen. */
function listedOnScreen(): string[] {
    return REWARDS.filter(r => screen.queryByText(r.label)).map(r => r.id);
}

function tapPlus(label = 'Add a new goal') {
    act(() => { fireEvent.click(screen.getByLabelText(label)); });
}

describe('GoalPedestal — the picker-open trace', () => {
    it('is the render\'s decision when the clock moves between the tap and the render', () => {
        renderEmptyGoal();
        clock.afterClick = () => vi.setSystemTime(at(19, 0, 30)); // the tap at 18:59:30, the render at 19:00:30

        tapPlus();

        expect(screen.queryByText('Quick Game')).not.toBeInTheDocument();
        expect(tracesOf('picker-open')).toEqual([expect.objectContaining({
            caseId: 0, nowIso: at(19, 0, 30).toISOString(), windowOpen: false, pickerVisible: false, shownRewards: listedOnScreen(),
        })]);
    });

    it('is the render\'s decision when the clock moves between the render and the trace', () => {
        renderEmptyGoal();
        clock.onMount = () => vi.setSystemTime(at(19, 0, 30)); // the picker renders at 18:59:30, then mounts

        tapPlus();

        expect(screen.getByText('Quick Game')).toBeInTheDocument();
        expect(tracesOf('picker-open')).toEqual([expect.objectContaining({
            caseId: 0, nowIso: at(18, 59, 30).toISOString(), windowOpen: true, pickerVisible: true, shownRewards: listedOnScreen(),
        })]);
        expect(listedOnScreen()).toContain('quick-game');
    });

    it.each([
        { rule: 'mood below neutral', patch: { moodWind: -1 }, field: { moodWind: -1, windowOpen: true } },
        { rule: 'no game token', patch: { gameTokens: 0 }, field: { gameTokens: 0, windowOpen: true } },
        { rule: 'the morning mission not concluded today', patch: { lastCompletedOrFailedMorningDate: '2026-09-01' }, field: { windowOpen: false } },
    ])('records a picker without 🐍 ($rule), listing what it showed', ({ patch, field }) => {
        renderEmptyGoal(patch);
        tapPlus();

        expect(screen.getByText(/Pick a Goal/i)).toBeInTheDocument();
        expect(screen.queryByText('Quick Game')).not.toBeInTheDocument();
        expect(tracesOf('picker-open')).toEqual([expect.objectContaining({ pickerVisible: false, shownRewards: listedOnScreen(), ...field })]);
        expect(listedOnScreen()).not.toContain('quick-game');
    });

    it('is sent once per opening, not on every render while it stays open', () => {
        renderEmptyGoal();
        tapPlus();
        act(() => { dispatch({ type: 'ADD_TOKEN' }); }); // a store change re-renders the open picker
        act(() => { fireEvent.click(screen.getByLabelText('Cancel')); });
        tapPlus();

        expect(tracesOf('picker-open')).toHaveLength(2);
    });
});

describe('GoalPedestal — the locked "+"', () => {
    it('opens no picker and traces its tap with the render\'s object, not a read at the tap', () => {
        renderEmptyGoal({ missedMissionStreak: MISSED_LOCK_THRESHOLD });
        vi.setSystemTime(at(20, 0)); // nothing re-renders: the "+" on screen was decided at 18:59:30

        tapPlus('Bank locked — finish your next mission');

        expect(screen.queryByText(/Pick a Goal/i)).not.toBeInTheDocument();
        expect(tracesOf('picker-open')).toEqual([]);
        expect(tracesOf('locked-tap')).toEqual([expect.objectContaining({
            caseId: 0, economyLocked: true, pickerVisible: false, nowIso: at(18, 59, 30).toISOString(),
        })]);
    });
});
