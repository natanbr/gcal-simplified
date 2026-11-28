// ============================================================
// A Settings save changes whether an occurrence is handled only where its rule
// says: the property, over random histories (review of PR 209)
// ------------------------------------------------------------
// Each seed builds a history through the real reducer over three days: starts
// by the scheduler (at an open, unhandled window) and by the phone, stops,
// completions, misses (the expiry tick's two actions), start-time moves and
// length-only saves, at instants drawn near window edges as often as anywhere.
// At every save it compares, for both phases and every occurrence from three
// days back to two ahead that starts at the same instant before and after the
// save, occurrenceHandled before and after it, read at the save and at a later
// instant. What may change:
//   - the window the save opened (open now, not open at that start before):
//     it must BE handled after the save, at both reads, and only it may go
//     from "not handled" to "handled" by a length save;
//   - for a start move, also the days the new retime stamp covers (the run's
//     own day and the day it decided, retimedOntoItsRun), and nothing may go
//     from "handled" to "not handled": a move onto the same instant (02:40 and
//     03:40 on the spring-forward night) must keep what was covered. A move of
//     the RUNNING mission's start ends the run, which releases what the run
//     held by design, so that phase is not compared at such a save;
//   - the other phase: nothing.
// Deterministic (seeded); the bases include the DST weekends, and a move picks
// the other name of the same instant (02:mm for 03:mm and back) a fifth of the
// time. The cases this generalises: occurrenceHandled.duration-save.test.ts and
// occurrenceHandled.retime-same-start.dst.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { occurrenceOn, openOccurrence, type Occurrence } from './missionOccurrence';
import { occurrenceHandled } from './occurrenceHandled';
import type { MCAction, MCSettings, MCState, Mission } from '../types';

type Phase = 'morning' | 'evening';
type Save = 'length' | 'move';
const PHASES: Phase[] = ['morning', 'evening'];
const DURATIONS = [1 / 6, 5, 30, 60, 90, 240, 900];
const BASES = [new Date(2026, 10, 10), new Date(2026, 2, 7), new Date(2026, 9, 31)];
/** Kept small: a property run is part of every unit run, and must stay cheap under load. */
const SEEDS = 80;
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
const when = (ms: number) => new Date(ms).toString().slice(4, 21);
const startOf = (p: Phase, t: string): Partial<MCSettings> => (p === 'morning' ? { morningStartsAt: t } : { eveningStartsAt: t });
const lengthOf = (p: Phase, d: number): Partial<MCSettings> => (p === 'morning' ? { morningDurationMins: d } : { eveningDurationMins: d });
/** The other name of a 02:mm or 03:mm start (the same instant on the spring-forward day); else the start itself. */
const otherName = (startsAt: string) => (/^0[23]:/.test(startsAt) ? `0${startsAt[1] === '2' ? 3 : 2}${startsAt.slice(2)}` : startsAt);
const missionOf = (s: MCState, p: Phase): Mission => {
    const m = s.missions.find(x => x.phase === p);
    if (!m) throw new Error(`no ${p}`);
    return m;
};

interface Stats { checks: number; moves: number; retimed: number; saved: number; opened: number; covered: number }
interface Violation { seed: number; base: string; detail: string; trace: string[] }

/** Whether the save stamped `after` anew and that stamp covers `day`: its run's own day or the day it decided. */
const newStampCovers = (before: Mission, after: Mission, day: string) =>
    after.startsAtChangedAt !== before.startsAtChangedAt && (after.occurrenceDate === day || after.retimeCoversDay === day);

/** What the save from `prev` to `next` (of `kind`, for `changed`, at `t`) did to each occurrence, read at `t` and `later`. */
function compare(prev: MCState, next: MCState, changed: Phase, kind: Save, t: number, later: number, stats: Stats): string[] {
    const found: string[] = [];
    const at = new Date(t);
    for (const p of PHASES) {
        const before = missionOf(prev, p);
        const after = missionOf(next, p);
        const nowOpen = p === changed ? openOccurrence(after, next.settings, at) : null;
        const opened: Occurrence | null = nowOpen !== null && openOccurrence(before, prev.settings, at)?.startMs !== nowOpen.startMs ? nowOpen : null;
        if (opened !== null) {
            stats.opened++;
            for (const nowMs of [t, later]) {
                if (!occurrenceHandled(next, p, opened, nowMs)) found.push(`${p} ${opened.day} ${hhmm(opened.startMs)}: opened by the save and not handled, read at ${when(nowMs)}`);
            }
        }
        if (after.startsAtChangedAt !== undefined) stats.retimed++;
        if (kind === 'move' && p === changed && prev.activeMission === p && next.activeMission !== p) continue;
        for (let days = -3; days <= 2; days++) {
            const was = occurrenceOn(before, prev.settings, at, days);
            const is = occurrenceOn(after, next.settings, at, days);
            if (was === null || is === null || was.startMs !== is.startMs) continue;
            for (const nowMs of [t, later]) {
                stats.checks++;
                const h0 = occurrenceHandled(prev, p, was, nowMs);
                const h1 = occurrenceHandled(next, p, is, nowMs);
                if (h0 === h1) continue;
                const allowed = !h0 && p === changed && (is.startMs === opened?.startMs || (kind === 'move' && newStampCovers(before, after, is.day)));
                if (allowed) { stats.covered++; continue; }
                found.push(`${p} ${is.day} ${hhmm(is.startMs)}: handled ${h0} → ${h1} by a ${kind} save, read at ${when(nowMs)}`);
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
    const fixture: Partial<MCSettings> = {};
    for (const p of PHASES) Object.assign(fixture, startOf(p, r() < 0.4 ? hhmm(base.getTime() + Math.floor(r() * 1440) * MIN) : missionOf(initialState, p).startsAt), lengthOf(p, pick(DURATIONS)));
    let s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: fixture, timestamp: new Date(0).toISOString() });
    const apply = (action: MCAction, t: number, label: string) => { s = mcReducer(s, { ...action, timestamp: new Date(t).toISOString() }); trace.push(`${when(t)} ${label}`); };
    const saveAndCompare = (p: Phase, kind: Save, settings: Partial<MCSettings>, t: number, label: string) => {
        const prev = s;
        apply({ type: 'SET_SETTINGS', settings }, t, label);
        if (kind === 'move') stats.moves++;
        else if (prev.missions.some(m => m.savedIntoWindows !== undefined)) stats.saved++;
        const found = compare(prev, s, p, kind, t, t + Math.floor(r() * 48 * HOUR), stats);
        if (found.length > 0) violations.push({ seed, base: base.toDateString(), detail: found.join('; '), trace: [...trace] });
    };

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
            const alias = otherName(missionOf(s, p).startsAt);
            const to = r() < 0.2 && alias !== missionOf(s, p).startsAt ? alias
                : hhmm(r() < 0.7 ? t + Math.round(r() * 180 - 120) * MIN : t + Math.floor(r() * 1440) * MIN);
            saveAndCompare(p, 'move', startOf(p, to), t, `move ${p} to ${to}`);
        } else {
            const d = pick(DURATIONS);
            saveAndCompare(p, 'length', lengthOf(p, d), t, `length ${p} ${d} min`);
        }
    }
    return violations;
}

describe('a Settings save changes an occurrence\'s handling only where its rule says', () => {
    it(`holds over ${SEEDS * BASES.length} random histories`, () => {
        const stats: Stats = { checks: 0, moves: 0, retimed: 0, saved: 0, opened: 0, covered: 0 };
        const violations = BASES.flatMap(base => Array.from({ length: SEEDS }, (_, i) => history(i * 7919 + 1, base, stats)).flat());
        const shown = violations.slice(0, 3).map(v => `seed ${v.seed} from ${v.base}: ${v.detail}\n    ${v.trace.slice(-8).join('\n    ')}`);
        expect(shown, `${violations.length} saves changed an occurrence outside their rule`).toEqual([]);
        // Not vacuous: the histories reach the states the rules read.
        expect(stats.checks).toBeGreaterThan(20_000);
        expect(stats.moves, 'start moves compared').toBeGreaterThan(500);
        expect(stats.retimed, 'saves after a start move the retime rule stamped').toBeGreaterThan(300);
        expect(stats.saved, 'length saves after a save that covered a window').toBeGreaterThan(300);
        expect(stats.opened, 'saves that opened a window, each checked handled').toBeGreaterThan(200);
        expect(stats.covered, 'occurrences a save rightly covered').toBeGreaterThan(100);
    }, 30_000);

    // Random histories rarely land a run within the hour where the two names'
    // windows behind disagree, so the same-instant move is also swept on a grid:
    // every run end on the spring-forward eve from 12:00 to 19:00, three minute
    // names, both directions. Codex's case (review of PR 209) is inside it.
    it('a move onto the other name of the same instant changes nothing, swept over the spring-forward eve', () => {
        const at = (day: number, mins: number) => new Date(2026, 2, day, 0, mins);
        const act = (s: MCState, action: MCAction, t: Date) => mcReducer(s, { ...action, timestamp: t.toISOString() });
        const found: string[] = [];
        let covered = 0;
        for (let endMins = 12 * 60; endMins < 19 * 60; endMins += 10) {
            for (const mm of ['05', '25', '45']) {
                for (const [first, second] of [[`02:${mm}`, `03:${mm}`], [`03:${mm}`, `02:${mm}`]]) {
                    // The evening started by the scheduler 30 min before `endMins` on the 7th and timed out then.
                    const fixture = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { ...startOf('evening', hhmm(at(7, endMins - 30).getTime())), ...lengthOf('evening', 30) }, timestamp: new Date(0).toISOString() });
                    const started = act(fixture, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'scheduler', occurrenceDate: '2026-03-07' }, at(7, endMins - 30));
                    const missed = act(act(started, { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'evening', origin: 'scheduler' }, at(7, endMins)), { type: 'SET_ACTIVE_MISSION', phase: 'none', origin: 'scheduler' }, at(7, endMins));
                    const moved = act(missed, { type: 'SET_SETTINGS', settings: startOf('evening', first) }, at(8, 60));
                    const again = act(moved, { type: 'SET_SETTINGS', settings: startOf('evening', second) }, at(8, 65));
                    const o0 = occurrenceOn(missionOf(moved, 'evening'), moved.settings, at(8, 720));
                    const o1 = occurrenceOn(missionOf(again, 'evening'), again.settings, at(8, 720));
                    if (o0 === null || o1 === null || o0.startMs !== o1.startMs) throw new Error(`precondition: ${first} and ${second} name one instant on the 8th`);
                    for (const nowMs of [o1.startMs + MIN, at(9, 0).getTime()]) {
                        const h0 = occurrenceHandled(moved, 'evening', o0, nowMs);
                        if (h0) covered++;
                        if (h0 !== occurrenceHandled(again, 'evening', o1, nowMs)) found.push(`run ended ${hhmm(at(7, endMins).getTime())}, ${first} → ${second}: handled ${h0} → ${!h0}`);
                    }
                }
            }
        }
        expect(found).toEqual([]);
        expect(covered, 'not vacuous: some first moves cover the 8th').toBeGreaterThan(50);
    });
});
