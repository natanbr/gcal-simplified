// ============================================================
// Mission Control — HH:MM wall-clock times
// A time the parent cleared in Settings is '' and parses to NaN; every reader
// must fail closed on it. A NaN mission start once armed setTimeout(fn, NaN),
// which fires at once, and logged "mission skipped" every second.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { DEFAULT_SETTINGS } from '../types';
import type { MCSettings, Mission } from '../types';

/** True for a real 24-hour "HH:MM" (00:00–23:59) — what `<input type="time">` yields. */
export function isValidHhmm(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
    const [h, m] = value.split(':').map(Number);
    return h <= 23 && m <= 59;
}

export function parseHhmmToMins(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

export function minsToHhmm(totalMins: number): string {
    return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
}

/**
 * A settings patch minus any mission start time that is not a real HH:MM, so
 * the stored time is kept. Dropping the key (not only the value) matters: a
 * refused time must not count as a change and stop the running mission.
 */
export function withoutInvalidStartTimes(patch: Partial<MCSettings>): Partial<MCSettings> {
    const { morningStartsAt, eveningStartsAt, ...rest } = patch;
    return {
        ...rest,
        ...(isValidHhmm(morningStartsAt) ? { morningStartsAt } : {}),
        ...(isValidHhmm(eveningStartsAt) ? { eveningStartsAt } : {}),
    };
}

/**
 * Load-time repair for a profile saved before Save refused a cleared time: an
 * unparseable start time falls back to the default (otherwise that mission
 * silently never runs again) and a broken mission window is re-derived from
 * the settings the way SET_SETTINGS derives it.
 */
export function sanitizeStartTimes(settings: MCSettings): MCSettings {
    return {
        ...settings,
        morningStartsAt: isValidHhmm(settings.morningStartsAt) ? settings.morningStartsAt : DEFAULT_SETTINGS.morningStartsAt,
        eveningStartsAt: isValidHhmm(settings.eveningStartsAt) ? settings.eveningStartsAt : DEFAULT_SETTINGS.eveningStartsAt,
    };
}

export function repairMissionWindow(m: Mission, settings: MCSettings): Mission {
    const endParses = typeof m.endsAt === 'string' && Number.isFinite(parseHhmmToMins(m.endsAt));
    if ((m.phase !== 'morning' && m.phase !== 'evening') || (isValidHhmm(m.startsAt) && endParses)) return m;
    const isMorning = m.phase === 'morning';
    const start = isMorning ? settings.morningStartsAt : settings.eveningStartsAt;
    const dur = isMorning ? settings.morningDurationMins : settings.eveningDurationMins;
    return { ...m, startsAt: start, endsAt: minsToHhmm(parseHhmmToMins(start) + dur) };
}
