// ============================================================
// Mission Control — a task card for a mission that is not running
// ------------------------------------------------------------
// The overlay shows the cards only while their mission runs, but AnimatePresence
// keeps them on screen, click handlers and all, while the overlay slides away
// (a phone Stop, an expiry). The reducer refuses that tap (isStaleMissionAction);
// the card must not flash its "done!" burst first for a tick that never lands
// (CLAUDE.md → Refusals must be silent in the log and visible on screen).
// ============================================================

import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MCStoreProvider } from '../../store/MCStoreProvider';
import { useMCDispatch, useMCState } from '../../store/useMCStore';
import { initialState } from '../../store/mcReducer';
import { TaskCard } from './TaskCard';
import type { MCAction, MCState, MissionTask } from '../../types';

function eveningShower(): MissionTask {
    const task = initialState.missions.find(m => m.phase === 'evening')?.tasks.find(t => t.id === 'shower');
    if (!task) throw new Error('fixture: the evening has a shower task');
    return task;
}
const shower = eveningShower();

const live: { state?: MCState; dispatch?: (a: MCAction) => void } = {};
function Probe() {
    live.state = useMCState();
    live.dispatch = useMCDispatch();
    return null;
}
const showerDone = () => live.state?.missions.find(m => m.phase === 'evening')?.tasks.find(t => t.id === 'shower')?.completed;

function renderCard() {
    render(<MCStoreProvider><Probe /><TaskCard task={shower} phase="evening" accent="var(--mc-accent)" /></MCStoreProvider>);
    return screen.getByTestId('mc-task-card-shower');
}

afterEach(() => { cleanup(); localStorage.clear(); });

describe('TaskCard', () => {
    it('ticks the task of the running mission, with its burst', () => {
        const card = renderCard();
        act(() => live.dispatch?.({ type: 'SET_ACTIVE_MISSION', phase: 'evening' }));

        fireEvent.click(card);

        expect(showerDone()).toBe(true);
        expect(screen.queryByTestId('mc-task-burst')).not.toBeNull();
    });

    it('a tap once its mission has ended shows no burst and changes nothing', () => {
        const card = renderCard();
        act(() => live.dispatch?.({ type: 'SET_ACTIVE_MISSION', phase: 'evening' }));
        act(() => live.dispatch?.({ type: 'CANCEL_MISSION', missionPhase: 'evening', origin: 'remote', isRemote: true }));
        const before = live.state?.missions;

        fireEvent.click(card);

        expect(live.state?.missions).toBe(before);
        expect(screen.queryByTestId('mc-task-burst')).toBeNull();
    });
});
