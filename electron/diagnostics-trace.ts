// ============================================================
// The diagnostics trace line: its allowlist and its budget (pure, no I/O).
// ------------------------------------------------------------
// diagnostics.ts writes these lines into a folder that is synced off the
// machine, so a line is rebuilt here field by field from the fixed allowlist
// below: finite numbers, clamped strings, real booleans, a short list of short
// reward ids, and nothing the window sent under any other name. The budget keeps
// a window that sends in a loop from filling the folder.
// ============================================================

const TRACE_EVENTS = new Set(['session-start', 'mission-end', 'picker-open', 'locked-tap']);
const STRING_FIELDS = ['nowIso', 'today', 'activeMission', 'endedMission', 'cause', 'eveningStartsAt'] as const;
const NUMBER_FIELDS = ['caseId', 'tzOffsetMins', 'nowMins', 'gameTokens', 'moodWind'] as const;
const BOOLEAN_FIELDS = ['rewardEnabled', 'economyLocked', 'windowOpen', 'pickerVisible', 'useEnabled'] as const;
/** Null is an answer here: the gate read an unreadable time or no concluded morning. */
const NULLABLE_FIELDS = { eveningStartMins: 'number', lastCompletedOrFailedMorningDate: 'string' } as const;
const MAX_STRING_LEN = 80;
/** shownRewards: the reward ids the picker listed (the catalogue has 9). */
const MAX_IDS = 16;
const MAX_ID_LEN = 32;

export type TraceValue = string | number | boolean | null | string[];
export type TraceLine = Record<string, TraceValue>;
/** Written by main, never taken from the window. */
export interface TraceStamp { t: string; host: string; appVersion: string }

function clampString(value: unknown): string | undefined {
    return typeof value === 'string' ? value.slice(0, MAX_STRING_LEN) : undefined;
}

/** Rounded to 2 decimals, and still finite after that: 1e307 * 100 is Infinity, which JSON writes as null. */
function finiteNumber(value: unknown): number | undefined {
    if (typeof value !== 'number') return undefined;
    const rounded = Math.round(value * 100) / 100;
    return Number.isFinite(rounded) ? rounded : undefined;
}

function rebuild(kind: 'string' | 'number' | 'boolean', value: unknown): TraceValue | undefined {
    if (kind === 'string') return clampString(value);
    if (kind === 'number') return finiteNumber(value);
    return typeof value === 'boolean' ? value : undefined;
}

/** An own property only: a key on the prototype is not something the window sent. */
function own(source: object, key: string): unknown {
    return Object.hasOwn(source, key) ? Reflect.get(source, key) : undefined;
}

function rewardIds(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.slice(0, MAX_IDS).filter((id): id is string => typeof id === 'string').map(id => id.slice(0, MAX_ID_LEN));
}

/** Rebuilds an untrusted window payload into a known-shape line, or null when it is not one. */
export function traceLine(raw: unknown, stamp: TraceStamp): TraceLine | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const event = own(raw, 'event');
    if (typeof event !== 'string' || !TRACE_EVENTS.has(event)) return null;

    const line: TraceLine = { t: stamp.t, event, host: stamp.host, appVersion: stamp.appVersion };
    const set = (key: string, value: TraceValue | undefined) => { if (value !== undefined) line[key] = value; };
    for (const key of STRING_FIELDS) set(key, rebuild('string', own(raw, key)));
    for (const key of NUMBER_FIELDS) set(key, rebuild('number', own(raw, key)));
    for (const key of BOOLEAN_FIELDS) set(key, rebuild('boolean', own(raw, key)));
    for (const [key, kind] of Object.entries(NULLABLE_FIELDS)) {
        const value = own(raw, key);
        set(key, value === null ? null : rebuild(kind, value));
    }
    set('shownRewards', rewardIds(own(raw, 'shownRewards')));
    return line;
}

/** The line that says how many traces the budget refused since the last one it took. */
export function droppedLine(count: number, stamp: TraceStamp): TraceLine {
    return { t: stamp.t, event: 'dropped', host: stamp.host, appVersion: stamp.appVersion, count };
}

const CAPACITY = 30;
const REFILL_PER_MS = CAPACITY / 60_000;

/** About 30 lines a minute, bursts included. Refilled when asked, by the clock: no timer. */
export class TraceBudget {
    private tokens = CAPACITY;
    private last: number | null = null;
    private dropped = 0;

    /** ok: take the line (and first say how many were refused since the last one); not ok: drop it. */
    take(nowMs: number): { ok: true; dropped: number } | { ok: false } {
        // A clock set back refills nothing, never a negative amount.
        if (this.last !== null) this.tokens = Math.min(CAPACITY, this.tokens + Math.max(0, nowMs - this.last) * REFILL_PER_MS);
        this.last = nowMs;
        if (this.tokens < 1) {
            this.dropped++;
            return { ok: false };
        }
        this.tokens -= 1;
        const dropped = this.dropped;
        this.dropped = 0;
        return { ok: true, dropped };
    }
}
