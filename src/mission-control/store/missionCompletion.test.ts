// What a completion pays and when a run is done: the overlay's auto-collect and
// the scheduler's expiry tick both ask these, so a run is paid the same whoever
// notices its end first (missionCompletion.ts).

import { describe, it, expect } from 'vitest';
import { MISSION_BONUS_BASE, completionBonus, everyTaskDone } from './missionCompletion';
import type { MissionTask } from '../types';

const task = (completed: boolean, id = 'brush'): MissionTask => ({ id, label: 'Task', icon: 'check', completed, locksAt: null, locked: false });

describe('completionBonus', () => {
    it('pays the base, two tokens, for a run without whining', () => {
        expect(MISSION_BONUS_BASE).toBe(2);
        expect(completionBonus({ whiningDetected: false })).toBe(2);
        expect(completionBonus({})).toBe(2);
    });

    it('pays one less when whining was flagged during the run', () => {
        expect(completionBonus({ whiningDetected: true })).toBe(1);
    });

    it('pays the base when there is no run to read (the overlay before a mission starts)', () => {
        expect(completionBonus(null)).toBe(2);
        expect(completionBonus(undefined)).toBe(2);
    });
});

describe('everyTaskDone', () => {
    it('is true only when every task is ticked', () => {
        expect(everyTaskDone({ tasks: [task(true), task(true, 'dress')] })).toBe(true);
        expect(everyTaskDone({ tasks: [task(true), task(false, 'dress')] })).toBe(false);
    });

    it('is false for a run with no tasks: it expires as a miss, never as a free success', () => {
        expect(everyTaskDone({ tasks: [] })).toBe(false);
    });

    it('is false with no run', () => {
        expect(everyTaskDone(null)).toBe(false);
        expect(everyTaskDone(undefined)).toBe(false);
    });
});
