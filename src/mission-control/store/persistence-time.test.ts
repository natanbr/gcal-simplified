// ============================================================
// Mission Control — hydration repairs an unparseable mission time
// ------------------------------------------------------------
// Since v0.0.42 a cleared "Auto-trigger at" field could be saved as '' with a
// derived `endsAt: 'NaN:NaN'`, and that sits in real profiles now. Fixing the
// Save path does not fix what is already on disk: loadPersistedState repairs
// an invalid start time to the default and re-derives the mission's window
// (start + that phase's duration setting). A valid custom time is untouched.
// (Separate file: persistence-lifecycle.test.ts is already over 300 lines.)
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initialState } from './mcReducer';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';
import type { MCState, MissionPhase } from '../types';

/** Writes state the way MCStoreProvider's persist effect does, then reloads it. */
function restart(state: MCState): MCState {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return loadPersistedState();
}

function mission(state: MCState, phase: Exclude<MissionPhase, 'none'>) {
    const m = state.missions.find(x => x.phase === phase);
    if (!m) throw new Error(`no ${phase} mission`);
    return m;
}

function saved(
    phase: 'morning' | 'evening',
    setting: string,
    window: { startsAt: string; endsAt: string },
    extraSettings: Partial<MCState['settings']> = {},
): MCState {
    const key = phase === 'morning' ? 'morningStartsAt' : 'eveningStartsAt';
    return {
        ...initialState,
        settings: { ...initialState.settings, ...extraSettings, [key]: setting },
        missions: initialState.missions.map(m => (m.phase === phase ? { ...m, ...window } : m)),
    };
}

describe('hydration — an unparseable saved mission time', () => {
    beforeEach(() => { localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { localStorage.removeItem(STORAGE_KEY); });

    it('a cleared morning time loads as 06:00 with the 06:00–06:30 window', () => {
        const reloaded = restart(saved('morning', '', { startsAt: '', endsAt: 'NaN:NaN' }));

        expect(reloaded.settings.morningStartsAt).toBe('06:00');
        expect(mission(reloaded, 'morning').startsAt).toBe('06:00');
        expect(mission(reloaded, 'morning').endsAt).toBe('06:30');
    });

    it('a cleared evening time loads as 19:00 with a window from the saved duration', () => {
        const reloaded = restart(saved('evening', '', { startsAt: '', endsAt: 'NaN:NaN' }, { eveningDurationMins: 45 }));

        expect(reloaded.settings.eveningStartsAt).toBe('19:00');
        expect(mission(reloaded, 'evening').startsAt).toBe('19:00');
        expect(mission(reloaded, 'evening').endsAt).toBe('19:45');
    });

    it('a valid setting with a corrupt mission window gets the window re-derived', () => {
        // The setting survived but the mission copy did not (e.g. a '06' save).
        const reloaded = restart(saved('morning', '07:15', { startsAt: '07:15', endsAt: 'NaN:NaN' }));

        expect(reloaded.settings.morningStartsAt).toBe('07:15');
        expect(mission(reloaded, 'morning').startsAt).toBe('07:15');
        expect(mission(reloaded, 'morning').endsAt).toBe('07:45');
    });

    it('guard: a valid custom time survives a restart untouched', () => {
        const reloaded = restart(saved('morning', '07:15', { startsAt: '07:15', endsAt: '07:45' }));

        expect(reloaded.settings.morningStartsAt).toBe('07:15');
        expect(mission(reloaded, 'morning').startsAt).toBe('07:15');
        expect(mission(reloaded, 'morning').endsAt).toBe('07:45');
    });
});
