// ============================================================
// Mission Control — the log line for a save that changes a start time
// ------------------------------------------------------------
// A Settings save that moves a mission's start time writes one attributed line
// (owner decision 2026-11-16, found reviewing PR 209): "Evening start changed
// 19:00 → 17:00". Without it, a start moved to an earlier window that has
// already closed left no trace at the save: no start, no miss, no "skipped" line.
//
// createLogEntry returns ONE entry per action, and a save may already write the
// "ended" line (the running mission's start moved) or the "not started" line (a
// window put under the clock). So the change is folded into the line the save
// writes: that line keeps its wording and the change follows after " — ", and
// a save that changes two starts says both in one line. The "ended" line gets the
// same fold, so it names the times too (owner decision 2026-11-16). A save that
// changes no start writes nothing here.
// "Changed" is the reducer's own check (startTimeChanged, missionReschedule.ts):
// a time that is not HH:MM is kept by the reducer and so is no change. No
// reducer pass is taken to decide any of this.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCSettings, MCState } from '../types';
import { startTimeChanged } from './missionReschedule';
import type { Phase } from './occurrenceHandled';

const LABEL: Record<Phase, string> = { morning: 'Morning', evening: 'Evening' };
const KEY = { morning: 'morningStartsAt', evening: 'eveningStartsAt' } as const;

/** A start time a save moves, in the order it is said (morning first). */
export interface StartTimeChange {
    phase: Phase;
    from: string;
    to: string;
}

/** What a log line says, and which phase it is for (none when it is for both). */
export interface SettingsLine {
    icon: string;
    message: string;
    colorKey: Phase | undefined;
}

/** The start times the save `settings` moves, read against `state`. */
export function startTimeChanges(state: MCState, settings: Partial<MCSettings>): StartTimeChange[] {
    return (['morning', 'evening'] as const).flatMap(phase => {
        const to = settings[KEY[phase]];
        return startTimeChanged(state, settings, phase) && to !== undefined ? [{ phase, from: state.settings[KEY[phase]], to }] : [];
    });
}

const say = (changes: StartTimeChange[]) => changes.map(c => `${LABEL[c.phase]} start changed ${c.from} → ${c.to}`).join('; ');

/**
 * The line for a save: `base` (the "ended" or "not started" line it already
 * writes, or null) with `changes` folded in, or the plain change line when
 * there is no base.
 * Null when the save writes nothing.
 */
export function withStartChanges(base: SettingsLine | null, changes: StartTimeChange[]): SettingsLine | null {
    if (base !== null) return changes.length === 0 ? base : { ...base, message: `${base.message} — ${say(changes)}` };
    if (changes.length === 0) return null;
    return { icon: '✏️', message: say(changes), colorKey: changes.length === 1 ? changes[0].phase : undefined };
}
