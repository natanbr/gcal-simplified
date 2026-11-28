// ============================================================
// A duration-only Settings save never changes whether an occurrence is
// handled: the property, over random histories (review of PR 209)
// ------------------------------------------------------------
// Each seed builds a history through the real reducer over three days: starts
// by the scheduler (at an open, unhandled window) and by the phone, stops,
// completions, misses (the expiry tick's two actions), start-time moves (which
// the retime rule and the window stamp react to) and length-only saves, at
// instants drawn near window edges as often as anywhere. At every length-only
// save it compares, for both phases and every occurrence from three days back
// to two ahead, occurrenceHandled before and after the save, read at the save
// and at a later instant. The only change allowed is the window the save
// opened (open under the new length, not open at that start under the old),
// and only from "not handled" to "handled". Deterministic (seeded); the bases
// include the DST weekends of zones that have them.
// The cases this generalises: occurrenceHandled.duration-save.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { occurrenceOn, openOccurrence } from './missionOccurrence';
import { occurrenceHandled } from './occurrenceHandled';
import type { MCAction, MCSettings, MCState, Mission } from '../types';

type Phase = 'morning' | 'evening';
const PHASES: Phase[] = ['morning', 'evening'];
const DURATIONS = [1 / 6, 5, 30, 60, 90, 240, 900];
const BASES = [new Date(2026, 10, 10), new Date(2026, 2, 7), new Date(2026, 9, 31)];
const SEEDS = 400;
const EVENTS = 16;
const MIN = 60_000;
const HOUR = 60 * MIN;

/** mulberry32: a small seeded generator, so a failure names a seed that replays. */
function generator(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const startOf = (p: Phase, t: string): Partial<MCSettings> => (p === 'morning' ? { morningStartsAt: t } : { eveningStartsAt: t });
const lengthOf = (p: Phase, d: number): Partial<MCSettings> => (p === 'morning' ? { morningDurationMins: d } : { eveningDurationMins: d });
const missionOf = (s: MCState, p: Phase): Mission => {
    const m = s.missions.find(x => x.phase === p);
    if (!m) throw new Error(`no ${p}`);
    return m;
};

interface Stats { checks: number; retimed: number; saved: number; opened: number }
interface Violation { seed: number; base: string; detail: string; trace: string[] }

/** The occurrences a length save must leave alone (and the one it opened), compared before and after it. */
function compare(prev: MCState, next: MCState, changed: Phase, t: number, later: number, stats: Stats): string[] {
    const found: string[] = [];
    const at = new Date(t);
    for (const p of PHASES) {
        const before = missionOf(prev, p);
        const after = missionOf(next, p);
        const nowOpen = p === changed ? openOccurrence(after, next.settings, at) : null;
        const opened = nowOpen !== null && openOccurrence(before, prev.settings, at)?.startMs !== nowOpen.startMs ? nowOpen.startMs : null;
        if (opened !== null) stats.opened++;
        if (after.startsAtChangedAt !== undefined) stats.retimed++;
        for (let days = -3; days <= 2; days++) {
            const was = occurrenceOn(before, prev.settings, at, days);
            const is = occurrenceOn(after, next.settings, at, days);
            if (was === null || is === null || was.startMs !== is.startMs) continue;
            for (const nowMs of [t, later]) {
                stats.checks++;
                const h0 = occurrenceHandled(prev, p, was, nowMs);
                const h1 = occurrenceHandled(next, p, is, nowMs);
                if (h0 === h1 || (is.startMs === opened && !h0 && h1)) continue;
                found.push(`${p} ${is.day} ${hhmm(is.startMs)}: handled ${h0} → ${h1}, read at ${new Date(nowMs).toString().slice(4, 21)}`);
            }
        }
    }
    return found;
}

function history(seed: number, base: Date, stats: Stats): Violation[] {
    const r = generator(seed);
    const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
    const trace: string[] = [];
    const violations: Violation[] = [];
    const when = (ms: number) => new Date(ms).toString().slice(4, 21);
    const fixture: Partial<MCSettings> = {};
    for (const p of PHASES) Object.assign(fixture, startOf(p, r() < 0.4 ? hhmm(base.getTime() + Math.floor(r() * 1440) * MIN) : missionOf(initialState, p).startsAt), lengthOf(p, pick(DURATIONS)));
    let s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: fixture, timestamp: new Date(0).toISOString() });
    const apply = (action: MCAction, t: number, label: string) => { s = mcReducer(s, { ...action, timestamp: new Date(t).toISOString() }); trace.push(`${when(t)} ${label}`); };

    let t = base.getTime() + Math.floor(r() * 6 * HOUR);
    for (let i = 0; i < EVENTS; i++) {
        // Half the time, near an edge (start or end) of a window, open or next.
        const p = pick(PHASES);
        const o = openOccurrence(missionOf(s, p), s.settings, new Date(t)) ?? occurrenceOn(missionOf(s, p), s.settings, new Date(t), 1);
        const edge = o && r() < 0.5 ? pick([o.startMs, o.endMs]) + Math.round((r() * 40 - 20) * MIN) : NaN;
        t = edge > t ? edge : t + 1_000 + Math.floor(r() * 5 * HOUR);

        if (s.activeMission !== 'none') {
            const running = missionOf(s, s.activeMission);
            const due = Date.parse(running.startedAt ?? '') + (running.durationMins ?? Infinity) * MIN;
            if (due <= t) {
                apply({ type: 'MARK_MISSION_TIMEOUT', missionPhase: s.activeMission, origin: 'scheduler' }, t, `miss ${s.activeMission}`);
                apply({ type: 'SET_ACTIVE_MISSION', phase: 'none', origin: 'scheduler' }, t, 'end');
            }
        }
        const k = r();
        if (k < 0.15) {
            const open = openOccurrence(missionOf(s, p), s.settings, new Date(t));
            if (s.activeMission === 'none' && open && !occurrenceHandled(s, p, open, t)) {
                apply({ type: 'SET_ACTIVE_MISSION', phase: p, origin: 'scheduler', occurrenceDate: open.day }, t, `scheduler start ${p}`);
            }
        } else if (k < 0.23) {
            if (s.activeMission === 'none') apply({ type: 'SET_ACTIVE_MISSION', phase: p, origin: 'remote' }, t, `phone start ${p}`);
        } else if (k < 0.31) {
            if (s.activeMission !== 'none') apply({ type: 'CANCEL_MISSION', missionPhase: s.activeMission, origin: 'remote' }, t, 'phone stop');
        } else if (k < 0.37) {
            if (s.activeMission !== 'none') apply({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: s.activeMission, bonusTokens: 0, origin: 'auto' }, t, 'complete');
        } else if (k < 0.6) {
            const to = hhmm(r() < 0.7 ? t + Math.round(r() * 180 - 120) * MIN : t + Math.floor(r() * 1440) * MIN);
            apply({ type: 'SET_SETTINGS', settings: startOf(p, to) }, t, `move ${p} to ${to}`);
        } else {
            const d = pick(DURATIONS);
            const prev = s;
            apply({ type: 'SET_SETTINGS', settings: lengthOf(p, d) }, t, `length ${p} ${d} min`);
            if (prev.missions.some(m => m.savedIntoWindows !== undefined)) stats.saved++;
            const found = compare(prev, s, p, t, t + Math.floor(r() * 48 * HOUR), stats);
            if (found.length > 0) violations.push({ seed, base: base.toDateString(), detail: found.join('; '), trace: [...trace] });
        }
    }
    return violations;
}

describe('a length-only save changes no occurrence\'s handling, except the window it opened', () => {
    it(`holds over ${SEEDS * BASES.length} random histories`, () => {
        const stats: Stats = { checks: 0, retimed: 0, saved: 0, opened: 0 };
        const violations = BASES.flatMap(base => Array.from({ length: SEEDS }, (_, i) => history(i * 7919 + 1, base, stats)).flat());
        const shown = violations.slice(0, 3).map(v => `seed ${v.seed} from ${v.base}: ${v.detail}\n    ${v.trace.slice(-8).join('\n    ')}`);
        expect(shown, `${violations.length} length saves changed an occurrence they did not open`).toEqual([]);
        // Not vacuous: the histories reach the states the two rules read.
        expect(stats.checks).toBeGreaterThan(20_000);
        expect(stats.retimed, 'length saves after a start move the retime rule stamped').toBeGreaterThan(200);
        expect(stats.saved, 'length saves after a save that covered a window').toBeGreaterThan(200);
        expect(stats.opened, 'length saves that opened a closed window').toBeGreaterThan(50);
    });
});
