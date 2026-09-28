// ============================================================
// Mission Control — routine tasks that are not always on the checklist
//
//   Cream       parent-enabled for N days; synced after every mission/settings
//               change by `syncCreamTask` (the reducer wrapper runs it).
//   School Bag  school days only; decided ONCE per run, at the
//               SET_ACTIVE_MISSION fresh start, via `withSchoolBag`. The
//               checklist a child is working through never changes mid-run.
//
// Hydration keeps whichever of these the saved run carried: rebuilding a
// checklist from the defaults alone dropped them on a restart mid-mission.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { Mission, MissionPhase, MissionTask, MCSettings } from '../types';

export const SCHOOL_BAG_TASK_ID = 'school-bag';
export const CREAM_TASK_ID = 'cream';

const SCHOOL_BAG_TASK: MissionTask = {
    id: SCHOOL_BAG_TASK_ID,
    label: 'School Bag',
    icon: '🎒',
    completed: false,
    locksAt: null,
    locked: false,
};

/**
 * Order, in both phases: Cream, then the School Bag. The bag goes last in the
 * morning and immediately before Bed in the evening (at the end if there is no
 * Bed); `syncCreamTask` puts Cream before it. Re-placed at every fresh start,
 * so a bag carried from an earlier run cannot keep an old spot. Not due: removed.
 */
export function withSchoolBag(tasks: MissionTask[], phase: MissionPhase, due: boolean): MissionTask[] {
    const carried = tasks.find(t => t.id === SCHOOL_BAG_TASK_ID);
    if (!due) return carried ? tasks.filter(t => t.id !== SCHOOL_BAG_TASK_ID) : tasks;
    const others = carried ? tasks.filter(t => t.id !== SCHOOL_BAG_TASK_ID) : tasks;
    const bedIndex = phase === 'evening' ? others.findIndex(t => t.id === 'bed') : -1;
    const at = bedIndex === -1 ? others.length : bedIndex;
    return [...others.slice(0, at), carried ?? { ...SCHOOL_BAG_TASK }, ...others.slice(at)];
}

// Safely adds/removes/updates the Cream routine in the active missions arrays.
export function syncCreamTask(missions: Mission[], settings: MCSettings, daysLeft: number): Mission[] {
    return missions.map(m => {
        const isEvening = m.phase === 'evening';
        const isMorning = m.phase === 'morning';
        const schedule = settings.creamTaskSchedule ?? 'evening';

        let shouldHaveCreamInPhase = false;
        if (settings.creamTaskEnabled && daysLeft > 0) {
             if (schedule === 'both' && (isMorning || isEvening)) shouldHaveCreamInPhase = true;
             else if (schedule === 'morning' && isMorning) shouldHaveCreamInPhase = true;
             else if (schedule === 'evening' && isEvening) shouldHaveCreamInPhase = true;
        }

        const hasCream = m.tasks.some(t => t.id === CREAM_TASK_ID);
        const expectedLabel = `Cream (${Math.ceil(daysLeft)}d left)`;

        if (shouldHaveCreamInPhase && !hasCream) {
            // Before the School Bag, else before Bed, else last (Cream, bag, Bed)
            const bagIndex = m.tasks.findIndex(t => t.id === SCHOOL_BAG_TASK_ID);
            const bedIndex = bagIndex !== -1 ? bagIndex : m.tasks.findIndex(t => t.id === 'bed');
            const newTasks = [...m.tasks];
            const creamTask: MissionTask = {
                id: CREAM_TASK_ID,
                label: expectedLabel,
                icon: 'Droplet',
                completed: false,
                locksAt: null,
                locked: false
            };
            if (bedIndex !== -1) newTasks.splice(bedIndex, 0, creamTask);
            else newTasks.push(creamTask);
            return { ...m, tasks: newTasks };
        } else if (!shouldHaveCreamInPhase && hasCream) {
            // Remove it
            return { ...m, tasks: m.tasks.filter(t => t.id !== CREAM_TASK_ID) };
        } else if (hasCream && shouldHaveCreamInPhase) {
            // Ensure label is updated
            const needUpdate = m.tasks.some(t => t.id === CREAM_TASK_ID && t.label !== expectedLabel);
            if (needUpdate) {
                return {
                    ...m,
                    tasks: m.tasks.map(t => t.id === CREAM_TASK_ID ? { ...t, label: expectedLabel } : t)
                };
            }
        }
        return m;
    });
}

/**
 * What a restart restores for the tasks that are not in the defaults. Display
 * values come from the code where they are fixed; Cream keeps its saved label,
 * which carries the days left (`syncCreamTask` refreshes it on the next sync).
 */
const CONDITIONAL_TASKS: Record<string, Pick<MissionTask, 'icon'> & Partial<Pick<MissionTask, 'label'>>> = {
    [CREAM_TASK_ID]: { icon: 'Droplet' },
    [SCHOOL_BAG_TASK_ID]: { icon: SCHOOL_BAG_TASK.icon, label: SCHOOL_BAG_TASK.label },
};

function isSavedTask(value: unknown): value is Partial<MissionTask> & { id: string } {
    return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
}

/**
 * Rebuilds a saved checklist on load. Default tasks are merged over the code's
 * definitions (the code owns their icon and label). A conditional task — Cream,
 * School Bag — is kept, with its completion and position, only if the saved
 * run had it; it is never added. Any other unknown id is dropped.
 */
export function hydrateMissionTasks(defaults: MissionTask[], saved: unknown): MissionTask[] {
    const savedTasks = Array.isArray(saved) ? saved.filter(isSavedTask) : [];
    const tasks = defaults.map(dt => {
        const st = savedTasks.find(t => t.id === dt.id);
        return st ? { ...dt, ...st, icon: dt.icon, label: dt.label } : dt;
    });
    savedTasks.forEach((st, savedIndex) => {
        // Own keys only: a tampered id like "constructor" must not find Object.prototype.
        if (!Object.hasOwn(CONDITIONAL_TASKS, st.id) || tasks.some(t => t.id === st.id)) return;
        const display = CONDITIONAL_TASKS[st.id];
        const restored: MissionTask = {
            id: st.id,
            label: display.label ?? (typeof st.label === 'string' ? st.label : st.id),
            icon: display.icon,
            completed: st.completed === true,
            locksAt: typeof st.locksAt === 'string' ? st.locksAt : null,
            locked: st.locked === true,
        };
        // Right after the nearest saved task before it that survived the merge
        // (an earlier conditional task counts: they are restored in saved order).
        const anchor = savedTasks.slice(0, savedIndex).reverse().find(p => tasks.some(t => t.id === p.id));
        tasks.splice(anchor ? tasks.findIndex(t => t.id === anchor.id) + 1 : 0, 0, restored);
    });
    return tasks;
}
