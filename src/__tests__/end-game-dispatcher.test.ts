// ============================================================
// One event, one entry — structural half.
// ------------------------------------------------------------
// END_GAME is in UNLOGGED_ACTIONS, so a SECOND dispatcher would produce no
// activity-log entry at all — a game close the parent cannot see. This guard
// walks the whole repo watching for that.
//
// It lives in src/__tests__/ rather than beside the reducer BECAUSE it walks
// the repo: it needs helpers/sourceFiles, and importing those from inside
// src/mission-control/ would be the module's only reach into the parent tree
// — exactly what the isolation contract forbids. The behavioural half of this
// rule stays in store/activityLog.attribution.test.ts, which needs no helper.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, stripComments, toRepoPath } from './helpers/sourceFiles';

/**
 * A real `dispatch({ type: 'END_GAME' })`, in any formatting a developer might
 * write it — including the multi-line shape the sibling ADD_LOG dispatch in
 * useQuickGameSession already uses. Matching a fixed literal missed that shape
 * entirely.
 */
const END_GAME_DISPATCH = /dispatch\(\s*\{\s*type:\s*['"]END_GAME['"]/;

describe('END_GAME has exactly one dispatcher', () => {
    it('recognises a real dispatch in any formatting, and a mention in none', () => {
        // The guard's own parsing, pinned. Both of these were proven against the
        // previous literal-substring version: the comment made it RED, the
        // multi-line dispatch left it GREEN.
        const real = [
            "dispatch({ type: 'END_GAME' });",
            'dispatch({ type: "END_GAME" });',
            "dispatch({\n    type: 'END_GAME',\n});",
            "    dispatch(  {  type:  'END_GAME'  }  );",
        ];
        const mentions = [
            "// dispatch({ type: 'END_GAME' }) is deliberately unlogged",
            "/* dispatch({\n * type: 'END_GAME',\n * }); */",
            "const t = 'END_GAME'; dispatch({ type: t });", // indirect — see caveat below
        ];

        for (const src of real) {
            expect(END_GAME_DISPATCH.test(stripComments(src)), `missed a real dispatch:\n${src}`).toBe(true);
        }
        for (const src of mentions.slice(0, 2)) {
            expect(END_GAME_DISPATCH.test(stripComments(src)), `flagged a mere mention:\n${src}`).toBe(false);
        }
        // Caveat, asserted so it stays honest rather than assumed: a dispatch
        // built through a variable is invisible to this guard. Nothing in the
        // codebase does that today, and the outcome test below is the backstop.
        expect(END_GAME_DISPATCH.test(stripComments(mentions[2]))).toBe(false);
    });

    it('stays the only END_GAME dispatcher, so the hand-written entry cannot be bypassed', () => {
        // Structural: if a second dispatch site appears, that caller gets NO log
        // entry at all (END_GAME is in UNLOGGED_ACTIONS), which is a silent gap
        // rather than a duplicate. Re-derive the decision if this ever fails.
        const dispatchers = productionSources(['src'])
            .filter(f => END_GAME_DISPATCH.test(stripComments(readSource(f))))
            .map(toRepoPath);

        expect(
            dispatchers,
            `END_GAME is dispatched from somewhere other than useQuickGameSession.\n` +
            `That caller writes NO activity-log entry at all — a game close a parent\n` +
            `cannot see. Either hand-write an entry there too, or re-derive the decision.`
        ).toEqual(['src/mission-control/hooks/useQuickGameSession.ts']);
    });
});
