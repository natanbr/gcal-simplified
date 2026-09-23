// ============================================================
// Mood gauge — structural boundary pin (streak-writer-boundary style).
//
// What this protects: `moveGauge` in store/moodGauge.ts is the ONLY place
// that may write `behaviorProgress` during a dispatch. It is where the cap
// decides a grant before the progress is spent, where a Quick-Game goal's
// token counts against the cap, and where a non-finite amount is refused. Each
// of those was broken at least once by a writer carrying its own copy of the
// arithmetic: the heartbeat wrapped a full gauge to ~0 % at the cap, the
// mission bonus and the parent adjustment zeroed the mood with no grant, and a
// NaN rate turned into NaN game tokens. The cap itself is checked only through
// `gameTokenRoom`, for the same reason: a raw `gameTokens >= 5` ignored the
// Quick-Game goal's token, so a parent grant filled the room its refund needed.
//
// A behavioural test cannot catch a NEW writer: a new reducer case that
// assigns the field is, by definition, not covered by existing cases.
//
// verifiedRedBy (all proven 2026-09-23 in an isolated copy):
//   - restore TOGGLE_WHINING's inline `behaviorProgress: Math.max(0, …)` in
//     mcReducer.ts → the mcReducer case names the line;
//   - the same clamp moved into a helper ABOVE `_mcReducer` → still named;
//   - `return { ...state, behaviorProgress }` (shorthand, on one line or
//     several) or `['behaviorProgress']: 0` (computed key) in missionStreak.ts,
//     or `next.behaviorProgress = 0` / `next['behaviorProgress'] = 0` in
//     mcReducer.ts → named;
//   - restore `Math.min(5, state.gameTokens + 1)` in REFUND_CASE, or write it
//     swapped / across lines, or a `gameTokens < 5` check → the cap case names it.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

const MC = 'src/mission-control/';
// Read once: every case scans the same files, and re-walking per case pushed
// the suite past the 5 s default under load.
const SOURCES = productionSources(['src/mission-control']).map(f => ({ rel: toRepoPath(f).slice(MC.length), src: readSource(f) }));
const sourceOf = (rel: string) => SOURCES.find(f => f.rel === rel)!.src;

/**
 * Files allowed to assign the field anywhere, each for a stated reason.
 *   moodGauge.ts     — moveGauge itself.
 *   useMCStore.tsx   — hydration sanitizes the persisted value once at load.
 *   useRemoteSync.ts — outbound projection into the phone payload, not a write.
 * mcReducer.ts is scanned separately: `initialState` is its one allowed write.
 */
const ALLOWED = new Set(['store/moodGauge.ts', 'store/useMCStore.tsx', 'store/useRemoteSync.ts']);

const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
const isTypeDecl = (line: string) => /behaviorProgress\??\s*:\s*number\s*;/.test(line);
const isDestructuringRead = (line: string) => /^\s*(const|let|var)\s*\{/.test(line);

/** An object-literal key (plain, quoted or computed), the `{ behaviorProgress }` shorthand, or `x.behaviorProgress =`. */
function writesGauge(line: string): boolean {
    if (isComment(line) || isTypeDecl(line) || isDestructuringRead(line)) return false;
    return /\bbehaviorProgress['"]?\s*\]?\s*:/.test(line)
        // `(?<!=)` skips a JSX expression, `prop={behaviorProgress}`, which is a read.
        || /((?<!=)\{|,)\s*behaviorProgress\s*[,}]/.test(line)
        // A multi-line object literal puts the shorthand alone on its line. (A
        // multi-line destructuring read would trip this too; none exists.)
        || /^\s*behaviorProgress\s*,?\s*$/.test(line)
        || /(\.behaviorProgress|\[\s*['"]behaviorProgress['"]\s*\])\s*(=(?!=)|\+=|-=)/.test(line);
}

const CAP = '(5|MAX_GAME_TOKENS)\\b';
/** Any comparison of the balance against the cap, either way round. */
const RAW_CAP_LINE = new RegExp(`gameTokens\\s*(>=|>|<=|<|===|!==|==|!=)\\s*${CAP}|\\b${CAP}\\s*(>=|>|<=|<|===|!==|==|!=)\\s*[\\w.]*gameTokens`);
/** `Math.min(…gameTokens…, 5)` or `Math.min(5, …gameTokens…)`, even across lines. */
const RAW_CAP_MIN = new RegExp(`Math\\.min\\(([^()]|\\([^()]*\\))*?gameTokens([^()]|\\([^()]*\\))*?,\\s*${CAP}|Math\\.min\\(\\s*${CAP}\\s*,([^()]|\\([^()]*\\))*?gameTokens`, 'g');

describe('behaviorProgress has exactly one in-dispatch writer', () => {
    it('is not assigned anywhere outside the allowed files', () => {
        expect(SOURCES.length, 'the file walk found nothing — the guard would pass vacuously').toBeGreaterThan(20);

        const offenders: string[] = [];
        for (const { rel, src } of SOURCES) {
            if (ALLOWED.has(rel) || rel === 'store/mcReducer.ts') continue;
            src.split('\n').forEach((line, i) => {
                if (writesGauge(line)) offenders.push(`${rel}:${i + 1} — ${line.trim()}`);
            });
        }

        expect(
            offenders,
            'These write behaviorProgress directly. Spread moveGauge(state, amount, maxGrants).patch ' +
            'instead, or the cap, the Quick-Game reservation and the NaN guard are skipped:\n  ' +
            offenders.join('\n  '),
        ).toEqual([]);
    });

    it('is assigned in mcReducer.ts exactly once, inside initialState', () => {
        const lines = sourceOf('store/mcReducer.ts').split('\n');
        const start = lines.findIndex(l => l.startsWith('export const initialState'));
        const end = lines.findIndex((l, i) => i > start && /^};\s*$/.test(l));
        expect(start, 'could not locate initialState').toBeGreaterThan(0);
        expect(end, 'could not locate the end of initialState').toBeGreaterThan(start);

        const writes = lines.map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => writesGauge(line));
        const outside = writes.filter(({ n }) => n - 1 < start || n - 1 > end);

        expect(
            outside.map(o => `mcReducer.ts:${o.n} — ${o.line.trim()}`),
            'mcReducer.ts writes behaviorProgress outside initialState. Spread moveGauge(...).patch instead.',
        ).toEqual([]);
        expect(writes, 'initialState should set the gauge exactly once').toHaveLength(1);
    });

    it('checks the game-token cap only through gameTokenRoom, which counts Quick-Game goals', () => {
        const offenders: string[] = [];
        for (const { rel, src } of SOURCES) {
            if (rel === 'store/moodGauge.ts') continue;
            src.split('\n').forEach((line, i) => {
                if (!isComment(line) && RAW_CAP_LINE.test(line)) offenders.push(`${rel}:${i + 1} — ${line.trim()}`);
            });
            const lines = src.split('\n');
            for (const m of src.matchAll(RAW_CAP_MIN)) {
                const n = src.slice(0, m.index).split('\n').length;
                if (isComment(lines[n - 1])) continue; // e.g. `// was: Math.min(5, …)`
                offenders.push(`${rel}:${n} — ${m[0].replace(/\s+/g, ' ')}`);
            }
        }
        expect(offenders, 'Use gameTokenRoom(state) from store/moodGauge.ts:\n  ' + offenders.join('\n  ')).toEqual([]);
    });

    it('names moveGauge and gameTokenRoom as the functions it protects, so the rule is discoverable', () => {
        const src = sourceOf('store/moodGauge.ts');
        expect(src).toMatch(/export function moveGauge/);
        expect(src).toMatch(/export function gameTokenRoom/);
    });
});
