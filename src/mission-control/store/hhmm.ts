// ============================================================
// Mission Control — HH:MM wall-clock times
// The only place a time is parsed (guarded by hhmm-parse-boundary.test.ts).
// A time the parent cleared in Settings is '' and has no minutes; every reader
// must fail closed on it. A NaN mission start once armed setTimeout(fn, NaN),
// which fires at once, and logged "mission skipped" every second.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { DEFAULT_SETTINGS } from '../types';
import type { MCSettings, Mission } from '../types';

/**
 * The one rule for a time a person enters: a real 24-hour "HH:MM" (00:00–23:59),
 * what `<input type="time">` yields. Minutes since midnight, or null.
 */
export function hhmmToMins(value: unknown): number | null {
    const match = typeof value === 'string' ? /^(\d{2}):(\d{2})$/.exec(value) : null;
    if (!match) return null;
    const [h, m] = [Number(match[1]), Number(match[2])];
    return h <= 23 && m <= 59 ? h * 60 + m : null;
}

/** A plain boolean, not `value is string`: a predicate would narrow a string
 *  argument to `never` on the false branch, and '' is a string. */
export function isValidHhmm(value: unknown): boolean {
    return hhmmToMins(value) !== null;
}

/**
 * A mission's `endsAt` is NOT an entered time: it is start + duration, written
 * by `missionWindowEnd`, so it passes midnight unwrapped ('24:30' is 00:30 the
 * next day, which `setHours(24, 30)` understands) and keeps a fraction of a
 * minute (Settings' 10-second test duration), which `missionDurationMins` reads
 * back — the scheduler's `setHours` drops it. Minutes after the start day's
 * midnight, or null.
 */
export function windowEndToMins(value: unknown): number | null {
    const match = typeof value === 'string' ? /^(\d{2}):(\d+(?:\.\d+)?)$/.exec(value) : null;
    if (!match) return null;
    const [h, m] = [Number(match[1]), Number(match[2])];
    return h < 48 && m < 60 ? h * 60 + m : null;
}

function minsToHhmm(totalMins: number): string {
    // Whole seconds first: 60.0000001 % 60 is 1e-7, which String() writes in
    // exponent form that windowEndToMins cannot read back.
    const mins = Math.round(totalMins * 60) / 60;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** The `endsAt` for a mission starting at `startsAt`, or null for a start it cannot read. */
export function missionWindowEnd(startsAt: string, durationMins: number): string | null {
    const start = hhmmToMins(startsAt);
    return start === null ? null : minsToHhmm(start + durationMins);
}

/**
 * A real mission length: one second up to (not including) a day. 0 ends a
 * mission the moment it starts. A day or more would still be running when its
 * next occurrence starts, and its unwrapped end (06:00 + 1440 is '30:00') could
 * pass the 47:59 windowEndToMins reads. Below a second is 0 in disguise:
 * 5e-324 vanishes in start + duration. Fractions are fine: that is the
 * 10-second test duration. A plain boolean, like isValidHhmm.
 */
export function isValidDurationMins(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value >= 1 / 60 && value < 24 * 60;
}

/**
 * How long a mission started now runs: its window, wrapping past midnight for
 * an end stored before `endsAt` stopped wrapping. Never NaN — `elapsedMins >= NaN`
 * never ended the mission — so an unreadable window falls back to the phase's
 * duration setting.
 */
export function missionDurationMins(m: Pick<Mission, 'phase' | 'startsAt' | 'endsAt'>, settings: MCSettings): number {
    const start = hhmmToMins(m.startsAt);
    const end = windowEndToMins(m.endsAt);
    if (start === null || end === null) {
        return m.phase === 'evening' ? settings.eveningDurationMins : settings.morningDurationMins;
    }
    return end < start ? end - start + 24 * 60 : end - start;
}

/**
 * A settings patch minus any mission start time or duration that is not real,
 * so the stored one is kept. Dropping the key (not only the value) matters: a
 * refused time must not count as a change and stop the running mission.
 */
export function withoutInvalidMissionTimes(patch: Partial<MCSettings>): Partial<MCSettings> {
    const { morningStartsAt, eveningStartsAt, morningDurationMins, eveningDurationMins, ...rest } = patch;
    return {
        ...rest,
        ...(isValidHhmm(morningStartsAt) ? { morningStartsAt } : {}),
        ...(isValidHhmm(eveningStartsAt) ? { eveningStartsAt } : {}),
        ...(isValidDurationMins(morningDurationMins) ? { morningDurationMins } : {}),
        ...(isValidDurationMins(eveningDurationMins) ? { eveningDurationMins } : {}),
    };
}

/**
 * Load-time repair for a profile saved before SET_SETTINGS refused these: an
 * unparseable start time or an unreal duration falls back to the default
 * (otherwise that mission silently never runs, or never ends). JSON writes NaN
 * and Infinity as null, so null is what a real profile holds.
 */
export function sanitizeMissionTimes(settings: MCSettings): MCSettings {
    const s = settings;
    const d = DEFAULT_SETTINGS;
    return {
        ...s,
        morningStartsAt: isValidHhmm(s.morningStartsAt) ? s.morningStartsAt : d.morningStartsAt,
        eveningStartsAt: isValidHhmm(s.eveningStartsAt) ? s.eveningStartsAt : d.eveningStartsAt,
        morningDurationMins: isValidDurationMins(s.morningDurationMins) ? s.morningDurationMins : d.morningDurationMins,
        eveningDurationMins: isValidDurationMins(s.eveningDurationMins) ? s.eveningDurationMins : d.eveningDurationMins,
    };
}

/**
 * A mission's window is derived state: this is its one derivation, used by
 * SET_SETTINGS and by hydration, which re-derives it from the (sanitized)
 * settings rather than trusting the saved copy. Repairing only an unreadable
 * copy kept a readable but wrong one: a 0-minute duration's '06:00'–'06:00'
 * ends the mission the moment it starts.
 */
export function deriveMissionWindow(m: Mission, settings: MCSettings): Mission {
    if (m.phase !== 'morning' && m.phase !== 'evening') return m;
    const isMorning = m.phase === 'morning';
    const startsAt = isMorning ? settings.morningStartsAt : settings.eveningStartsAt;
    const endsAt = missionWindowEnd(startsAt, isMorning ? settings.morningDurationMins : settings.eveningDurationMins);
    return endsAt === null ? m : { ...m, startsAt, endsAt };
}

/**
 * Hydration for one mission: its window re-derived, and a mission saved running
 * with no readable duration (JSON writes NaN as null) given one. The expiry
 * check skips a null duration, so that mission never ended, ADJUST_MISSION_END
 * ignored it, and no other mission could start. Running means `active`, not
 * only `startedAt`: an ended mission keeps its startedAt with no duration.
 * (A run from an earlier day is ended at load instead: useMCStore.tsx.)
 */
export function hydrateMissionTimes(m: Mission, settings: MCSettings): Mission {
    const derived = deriveMissionWindow(m, settings);
    if (!derived.active || !derived.startedAt || Number.isFinite(derived.durationMins)) return derived;
    return { ...derived, durationMins: missionDurationMins(derived, settings) };
}
