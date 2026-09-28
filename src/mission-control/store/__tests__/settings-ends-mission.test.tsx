// ============================================================
// A settings save that ends the running mission says so in the log
// ------------------------------------------------------------
// Saving a new start time for the RUNNING mission in the desktop MC Settings
// ends it (SET_SETTINGS deactivates it, so its cleared duration cannot hang the
// expiry check). That is the one desktop path that ends a mission, and it used
// to do so silently: no line, no miss, no attribution. The behaviour is kept
// (open decision, PR 170); the line is not optional (CLAUDE.md → Attribution).
// Written by createLogEntry from the reducer's own result, so the line cannot
// disagree with the reschedule logic it describes.
// ============================================================

import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../MCStoreProvider';
import { useMCDispatch, useMCState } from '../useMCStore';
import { initialState } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import type { MCAction, MCSettings, MCState } from '../../types';

const ENDED = /ended: its start time was changed in Settings/;

let live: MCState = initialState;
let dispatch: (a: MCAction) => void = () => {};
function Probe() {
    live = useMCState();
    dispatch = useMCDispatch();
    return null;
}

const ended = () => live.activityLogs.filter(l => ENDED.test(l.message));

function launchWithEveningRunning() {
    render(<MCStoreProvider><Probe /></MCStoreProvider>);
    act(() => { dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'evening' }); });
    expect(live.activeMission, 'fixture: evening runs').toBe('evening');
}

const save = (settings: Partial<MCSettings>) => act(() => { dispatch({ type: 'SET_SETTINGS', settings }); });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('SET_SETTINGS that ends the running mission', () => {
    it('writes exactly one attributed line, and the mission is ended', () => {
        launchWithEveningRunning();
        save({ eveningStartsAt: '20:30' }); // was 19:00

        expect(live.activeMission, 'the kept behaviour: the save ends it').toBe('none');
        expect(ended()).toHaveLength(1);
        expect(ended()[0]).toMatchObject({
            icon: '⏹️',
            message: 'Evening mission ended: its start time was changed in Settings',
            type: 'mission',
            colorKey: 'evening',
            source: 'local',
        });
    });

    it('a second save of the same time, with nothing running, writes nothing more', () => {
        launchWithEveningRunning();
        save({ eveningStartsAt: '20:30' });
        save({ eveningStartsAt: '20:40' });
        expect(ended()).toHaveLength(1);
    });
});

describe('SET_SETTINGS that ends nothing writes no such line', () => {
    it.each<[string, Partial<MCSettings>]>([
        ['the OTHER mission\'s start time', { morningStartsAt: '05:15' }],
        ['the running mission\'s duration', { eveningDurationMins: 45 }],
        ['the running mission\'s start time, unchanged', { eveningStartsAt: initialState.settings.eveningStartsAt }],
        ['the remote keys the provider syncs at startup', { remoteRoomId: 'room', remoteKey: 'key' }],
    ])('%s, while evening runs', (_label, settings) => {
        launchWithEveningRunning();
        save(settings);
        expect(live.activeMission).toBe('evening');
        expect(ended()).toEqual([]);
    });

    it('a start-time change with nothing running', () => {
        const action: MCAction = { type: 'SET_SETTINGS', settings: { eveningStartsAt: '20:30' } };
        expect(createLogEntry(action, initialState)).toBeNull();
    });
});
