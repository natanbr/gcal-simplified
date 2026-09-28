// ============================================================
// Mission Control — routine tasks that come and go
// ------------------------------------------------------------
// Two tasks are not part of the default checklist: Cream (a parent-enabled
// course of N days) and School Bag (school days only). Placement and
// hydration are tested here; WHEN the school bag appears is decided by the
// reducer's fresh start (mcReducer.school-bag.test.ts).
// ============================================================

import { describe, it, expect } from 'vitest';
import { SCHOOL_BAG_TASK_ID, hydrateMissionTasks, withSchoolBag } from './routineTasks';
import { initialState } from './mcReducer';
import type { MissionTask } from '../types';

const defaults = (phase: 'morning' | 'evening') => initialState.missions.find(m => m.phase === phase)!.tasks;
const ids = (tasks: MissionTask[]) => tasks.map(t => t.id);

const bag = (completed = false): MissionTask =>
    ({ id: SCHOOL_BAG_TASK_ID, label: 'School Bag', icon: '🎒', completed, locksAt: null, locked: false });
const cream = (completed = false): MissionTask =>
    ({ id: 'cream', label: 'Cream (3d left)', icon: 'Droplet', completed, locksAt: null, locked: false });

describe('withSchoolBag — where the task goes', () => {
    it('morning: the last task, labelled School Bag with the 🎒 icon, not yet done', () => {
        const tasks = withSchoolBag(defaults('morning'), 'morning', true);
        expect(ids(tasks)).toEqual(['tshirt', 'toothbrush', 'feed-dog', 'vitamin', 'wash-hands', 'school-bag']);
        expect(tasks.at(-1)).toMatchObject({ label: 'School Bag', icon: '🎒', completed: false, locked: false });
    });

    it('evening: immediately before Bed', () => {
        expect(ids(withSchoolBag(defaults('evening'), 'evening', true)))
            .toEqual(['shower', 'pjs', 'cleanup', 'teeth2', 'school-bag', 'bed']);
    });

    it('evening with no Bed task: at the end', () => {
        const noBed = defaults('evening').filter(t => t.id !== 'bed');
        expect(ids(withSchoolBag(noBed, 'evening', true)).at(-1)).toBe('school-bag');
    });

    it('is never added twice, and an existing one keeps its place', () => {
        const once = withSchoolBag(defaults('morning'), 'morning', true);
        expect(withSchoolBag(once, 'morning', true)).toBe(once);
    });

    it('not due: removes a school bag left over from the last run', () => {
        const withBag = withSchoolBag(defaults('evening'), 'evening', true);
        expect(ids(withSchoolBag(withBag, 'evening', false))).toEqual(ids(defaults('evening')));
    });

    it('not due and absent: returns the same list', () => {
        const tasks = defaults('morning');
        expect(withSchoolBag(tasks, 'morning', false)).toBe(tasks);
    });

    it('leaves the Cream task where it is', () => {
        const [a, b, c, d, bed] = defaults('evening');
        const tasks = withSchoolBag([a, b, c, d, cream(), bed], 'evening', true);
        expect(ids(tasks)).toEqual(['shower', 'pjs', 'cleanup', 'teeth2', 'cream', 'school-bag', 'bed']);
    });
});

describe('hydrateMissionTasks — a restart keeps the run it interrupted', () => {
    it('keeps a saved school bag with its completion and position (morning)', () => {
        const saved = [...defaults('morning').map(t => ({ ...t, completed: true })), bag(true)];
        const tasks = hydrateMissionTasks(defaults('morning'), saved);
        expect(ids(tasks)).toEqual(['tshirt', 'toothbrush', 'feed-dog', 'vitamin', 'wash-hands', 'school-bag']);
        expect(tasks.every(t => t.completed)).toBe(true);
    });

    it('keeps Cream AND the school bag, in their saved order, with completion (evening)', () => {
        const [shower, pjs, cleanup, teeth2, bed] = defaults('evening');
        const saved = [{ ...shower, completed: true }, pjs, cleanup, teeth2, cream(true), bag(false), bed];
        const tasks = hydrateMissionTasks(defaults('evening'), saved);
        expect(ids(tasks)).toEqual(['shower', 'pjs', 'cleanup', 'teeth2', 'cream', 'school-bag', 'bed']);
        expect(tasks.find(t => t.id === 'cream')).toMatchObject({ completed: true, label: 'Cream (3d left)' });
        expect(tasks.find(t => t.id === 'school-bag')?.completed).toBe(false);
        expect(tasks.find(t => t.id === 'shower')?.completed).toBe(true);
    });

    it('never adds a conditional task the saved run did not have', () => {
        const tasks = hydrateMissionTasks(defaults('morning'), defaults('morning'));
        expect(ids(tasks)).toEqual(ids(defaults('morning')));
    });

    it('still takes a default task\'s label and icon from the code, and the school bag\'s too', () => {
        const [tshirt, ...rest] = defaults('morning');
        const saved = [{ ...tshirt, label: 'Old label', icon: 'Old' }, ...rest, { ...bag(), label: 'Bag', icon: 'X' }];
        const tasks = hydrateMissionTasks(defaults('morning'), saved);
        expect(tasks[0]).toMatchObject({ label: 'T-Shirt', icon: 'Shirt' });
        expect(tasks.at(-1)).toMatchObject({ label: 'School Bag', icon: '🎒' });
    });

    it('falls back to the defaults for a missing or malformed saved list', () => {
        expect(hydrateMissionTasks(defaults('evening'), undefined)).toEqual(defaults('evening'));
        expect(hydrateMissionTasks(defaults('evening'), 'nope')).toEqual(defaults('evening'));
    });

    it('drops an unknown saved task id (a task removed from the code stays removed)', () => {
        const saved = [...defaults('morning'), { ...bag(), id: 'retired-task' }];
        expect(ids(hydrateMissionTasks(defaults('morning'), saved))).toEqual(ids(defaults('morning')));
    });
});

describe('hydrateMissionTasks — a tampered saved id', () => {
    it('ignores an id that names an Object prototype member (constructor, __proto__, toString)', () => {
        const saved = [
            ...defaults('morning'),
            { ...bag(), id: 'constructor' },
            { ...bag(), id: '__proto__' },
            { ...bag(), id: 'toString' },
        ];
        expect(ids(hydrateMissionTasks(defaults('morning'), saved))).toEqual(ids(defaults('morning')));
    });
});
