// ============================================================
// Rule Registry — the index of every rule CLAUDE.md declares, and whether
// anything actually enforces it.
// ------------------------------------------------------------
// The lesson that produced this file: a rule written in CLAUDE.md and reviewed
// by hand for months (Mission Control isolation) was already broken in two
// places the first time a guard was pointed at it. Prose does not enforce
// anything, and "we all know the rule" is not a mechanism.
//
// This registry does not try to parse CLAUDE.md's prose — curated data beats a
// fragile prose diff. The one exception is `## ` section headings, which the
// suite reads to keep every `source` anchor pointing at a section that still
// exists. What the registry does is make the *enforcement status* of every rule
// explicit, so "nothing is watching this one" is visible rather than assumed.
//
// Four honest states:
//   guarded     — a test fails if the rule is broken. The real thing.
//   ratcheted   — already broken at scale; current state frozen, new violations
//                 blocked. Stops the bleeding without a big-bang cleanup.
//   manual      — needs human judgement; no guard is feasible or worth it.
//                 An honest `manual` is better than a guard that fakes it.
//   unguardable — cannot be caught by a test in principle, usually because it
//                 is about code that does NOT exist. Needs a different defence.
// ============================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers/sourceFiles';

type Status = 'guarded' | 'ratcheted' | 'manual' | 'unguardable';

interface Rule {
    /** The rule, as CLAUDE.md states it. */
    rule: string;
    /** Where it is declared. */
    source: string;
    status: Status;
    /** Repo-relative path to the enforcing test. Required for guarded/ratcheted. */
    guard?: string;
    /** How the guard was proven to actually fail. Manual recipe, deliberately
     *  not automated — a mutation-testing framework is more machinery than this
     *  project wants. */
    verifiedRedBy?: string;
    /** For manual/unguardable: what defends the rule instead. */
    defence?: string;
}

const REGISTRY: Rule[] = [
    // ── Performance ──────────────────────────────────────────────────────────
    {
        rule: 'Every recurring setInterval must be registered; idle-Calendar timers capped at 4',
        source: 'CLAUDE.md → Performance → 1',
        status: 'guarded',
        guard: 'src/__tests__/timer-registry.test.ts',
        verifiedRedBy: 'add a setInterval to an unregistered file',
    },
    {
        rule: 'Scheduler is gated when idle; the behaviour heartbeat is churn-free on the Calendar view',
        source: 'CLAUDE.md → Performance → 2, 4',
        status: 'guarded',
        guard: 'src/mission-control/__tests__/idle-performance.test.tsx',
        verifiedRedBy: 'make applyBehaviorSync return a new object on a no-op tick',
    },
    {
        rule: 'No repeat: Infinity / CSS infinite animation in the always-mounted tree',
        source: 'CLAUDE.md → Performance → 3',
        status: 'manual',
        defence: 'Reviewed by the perf-sentinel subagent. Currently zero occurrences in the always-mounted tree; a guard would need to model the mount graph to know which components are always-mounted.',
    },
    {
        rule: 'Every setInterval/setTimeout/subscription is cleared in its effect cleanup',
        source: 'CLAUDE.md → Performance → 5',
        status: 'manual',
        defence: 'react-hooks lint rules catch the common shapes; full enforcement needs dataflow analysis. Covered case-by-case in hook unit tests (e.g. the scheduler unsubscribe test).',
    },

    // ── Architecture / boundaries ────────────────────────────────────────────
    {
        rule: 'Audit trail is append-only (no clear/delete IPC channel); renderer payloads are rebuilt field-by-field in the main process, never spread',
        source: 'CLAUDE.md → Architecture → Audit trail',
        status: 'guarded',
        guard: 'electron/audit-log.test.ts',
        verifiedRedBy: 'sanitize() drops unknown fields and clamps types; preload_contract pins the channel list to audit:append/audit:read only',
    },
    {
        rule: 'Mission Control never imports from src/components, src/hooks, src/utils',
        source: 'CLAUDE.md → Conventions',
        status: 'guarded',
        guard: 'src/__tests__/mission-control-isolation.test.ts',
        verifiedRedBy: 'found two live violations on its first run (2026-08-19)',
    },
    {
        rule: 'Every ipcMain.handle channel is whitelisted in preload, and vice versa',
        source: 'CLAUDE.md → Architecture → Preload bridge',
        status: 'guarded',
        guard: 'electron/preload_contract.test.ts',
        verifiedRedBy: "remove 'audit:append' from ALLOWED_INVOKE_CHANNELS",
    },
    {
        rule: 'A non-whitelisted IPC channel throws — it does not silently no-op',
        source: 'CLAUDE.md → Architecture → Preload bridge',
        status: 'guarded',
        guard: 'electron/preload.test.ts',
        verifiedRedBy: 'replace the throw with a return in preload.ts',
    },
    {
        rule: 'Only one instance of the app may run',
        source: 'CLAUDE.md → Architecture → Single instance',
        status: 'unguardable',
        defence: 'Enforced by Electron/the OS, not by a code path a unit test can call. Presence is checked structurally in electron/preload_contract.test.ts; real behaviour is proven by launching the built app twice: node scripts/verify-single-instance.mjs',
    },
    {
        rule: 'mcReducer.ts is a pure reducer — no side effects, no wall-clock reads',
        source: 'CLAUDE.md → Conventions',
        status: 'guarded',
        guard: 'src/mission-control/store/mcReducer.purity.test.ts',
        verifiedRedBy: 'mutate state.bankCount in place inside any case; or read new Date() directly instead of actionInstant(action) — the determinism test goes red',
        defence: 'behaviorSync.ts is covered transitively: every reducer call runs applyBehaviorSync, so the purity suite exercises both.',
    },

    // ── Token economy / attribution ──────────────────────────────────────────
    {
        rule: 'Game tokens come only from the mood gauge; no calendar-day or on-mount grant',
        source: 'CLAUDE.md → Conventions → Token economy',
        status: 'guarded',
        guard: 'src/mission-control/store/mcReducer.token-generation.test.ts',
        verifiedRedBy: 'restore useGameTokenScheduler.ts and wire it into MCStoreProvider',
    },
    {
        rule: 'Earning a token resets moodWind to 0',
        source: 'CLAUDE.md → Conventions → Token economy',
        status: 'guarded',
        guard: 'src/mission-control/store/mcReducer.token-generation.test.ts',
        verifiedRedBy: 'drop the nextMoodWind = 0 line in applyBehaviorSync',
    },
    {
        rule: 'Every log entry carries a source; a token movement with no attribution is a bug',
        source: 'CLAUDE.md → Conventions → Attribution',
        status: 'guarded',
        guard: 'src/mission-control/store/activityLog.attribution.test.ts',
        verifiedRedBy: 'remove `source` from deriveSnapshots',
        defence: 'Covers only the entries createLogEntry DERIVES. An entry built by hand and dispatched straight as ADD_LOG never reaches it — which is exactly how the two useQuickGameSession entries shipped with source undefined (fixed 2026-08-21). There are now TWO hand-building sites: useQuickGameSession, and shieldLog in missionStreak.ts (asserted source === auto by mcReducer.streak-lock.test.ts). The hook carries its own guard: src/mission-control/hooks/useQuickGameSession.test.ts asserts source === local on both entries. A new hand-built entry anywhere else needs its own test; nothing catches one structurally.',
    },
    {
        rule: 'One game close, one 🏁 entry — END_GAME derives nothing because its dispatcher hand-writes the richer entry',
        source: 'Corollary of CLAUDE.md → Conventions → Attribution (a parent cannot see who moved what if one event logs twice, or not at all). Stated in full at UNLOGGED_ACTIONS in src/mission-control/store/activityLog.ts',
        status: 'guarded',
        guard: 'src/mission-control/store/activityLog.attribution.test.ts',
        verifiedRedBy: 'add a SECOND END_GAME dispatcher as a new file under src/mission-control/, written multi-line (the type sits on its own line) — the dispatcher list goes red naming both paths (proven 2026-08-21). Counterpart proof: a file whose only occurrence is inside a line comment stays GREEN. The previous literal-substring matcher failed both ways round — red on the comment, green on the real multi-line dispatch.',
    },
    {
        rule: 'applyStreakChange is the only in-dispatch writer of missedMissionStreak',
        source: 'CLAUDE.md → Conventions → Mission streak shield',
        status: 'guarded',
        guard: 'src/mission-control/__tests__/streak-writer-boundary.test.ts',
        verifiedRedBy: "add `missedMissionStreak: 0` to the SET_MOOD_WIND case in mcReducer.ts — the guard names mcReducer.ts:734 and fails (proven 2026-09-03). A mutation audit showed this exact edit silently unlocked a broken shield with 765 of 766 tests still green, which is why prose was not enough.",
        defence: 'Source-reading, because a NEW reducer case that assigns the field is by definition not covered by any existing behavioural test.',
    },
    {
        rule: 'A refusal writes no log line, and is refused before any optimistic UI commits',
        source: 'CLAUDE.md → Conventions → Refusals must be silent in the log and visible on screen',
        status: 'guarded',
        guard: 'src/mission-control/store/__tests__/mcReducer.streak-lock.test.ts',
        verifiedRedBy: "drop the isRefusedByShieldLock call from createLogEntry — all 5 'writes no activity-log line' cases go red; or remove the window mirror from activityLog.ts's CONSUME_CASE branch — the refused-redemption log case goes red (proven 2026-09-03).",
        defence: 'The drag-handler half (refuse BEFORE the exit animation, so the token springs back instead of vanishing) is covered by the component tests in GlobalBank.test.tsx / GoalPedestal.test.tsx.',
    },
    {
        rule: 'A mission re-trigger clears loggedTimeoutAt, so consecutive misses actually accumulate',
        source: 'CLAUDE.md → Conventions → Mission streak shield',
        status: 'guarded',
        guard: 'src/mission-control/store/__tests__/mcReducer.streak-lifecycle.test.ts',
        verifiedRedBy: "drop `loggedTimeoutAt: undefined` from the SET_ACTIVE_MISSION fresh-start branch — the streak trace becomes [1,2,2,2,2,2] instead of [1,2,3,4,5,6] and four of the seven cases go red (this was the shipped bug, found 2026-09-02).",
        defence: 'Every OTHER streak test injects the counter by hand, which is why 975 tests were green over a counter that capped at 2. This file may only build state by dispatching real actions.',
    },
    {
        rule: 'ADJUST_SHIELD is the parent’s remote shield control, clamped and logged like any other streak move',
        source: 'CLAUDE.md → Conventions → Mission streak shield',
        status: 'guarded',
        guard: 'src/mission-control/store/__tests__/mcReducer.shield-remote.test.ts',
        verifiedRedBy: 'bypass applyStreakChange in the ADJUST_SHIELD case and set missedMissionStreak directly — the unlock/lock transition-log cases go red because no shield line is written.',
    },
    {
        rule: 'A mission that expires unfinished is recorded as a miss wherever it ends, not only when the overlay is on screen',
        source: 'CLAUDE.md → Conventions → Mission streak shield',
        status: 'guarded',
        guard: 'src/mission-control/hooks/useMissionScheduler.resilience.test.tsx',
        verifiedRedBy: "delete the MARK_MISSION_TIMEOUT dispatch from the expiry tick in useMissionScheduler.ts — 'records the miss for a mission that expires with no overlay on screen' goes red (proven 2026-09-02).",
    },
    {
        rule: 'The shield lock freezes the spend side only, and is derived from missedMissionStreak rather than stored',
        source: 'CLAUDE.md → Conventions → Mission streak shield',
        status: 'guarded',
        guard: 'src/mission-control/store/__tests__/mcReducer.streak-lock.test.ts',
        verifiedRedBy: "add 'ADD_TOKENS' to LOCKED_WHILE_SHIELD_BROKEN in missionStreak.ts — the 'earning is the way out' case goes red; or drop the isRefusedByShieldLock call from createLogEntry and all 5 'writes no activity-log line' cases go red (both proven 2026-09-02).",
    },
    {
        rule: "Quick games open only between the day's missions, enforced in the reducer and not only in the UI",
        source: 'CLAUDE.md → Conventions → Quick-game window',
        status: 'guarded',
        guard: 'src/mission-control/store/gameWindow.test.ts',
        verifiedRedBy: 'replace the body of isQuickGameWindowOpen with the old isWakingHour span (morning start → evening end): 5 cases in gameWindow.test.ts and 2 reducer cases in mcReducer.streak-lock.test.ts go red — a game opens at 06:10 and at 19:30 (proven 2026-09-02).',
    },
    {
        rule: 'REMOTE_ALLOWED_ACTIONS is an allowlist; remote buttons must be added to it',
        source: 'CLAUDE.md → Conventions → Remote actions',
        status: 'guarded',
        guard: 'src/mission-control/hooks/useRemoteControl.allowlist.test.ts',
        verifiedRedBy: 'dispatch CLEAR_LOGS over the channel and expect it through',
    },
    {
        rule: 'skillProgress never rides the remote broadcast; reading content stays quiz-internal',
        source: 'CLAUDE.md → Conventions → Skill progress',
        status: 'guarded',
        guard: 'src/mission-control/__tests__/skill-progress-boundaries.test.ts',
        verifiedRedBy: 'caught its own author twice while being written (2026-08-20): a prose "state.skillProgress" mention in useRemoteSync, and useQuizEngine importing reading/ directly',
    },

    // ── Ratcheted: declared, but already broken at scale ──────────────────────
    {
        rule: 'Keep files under 300 lines',
        source: 'CLAUDE.md → Conventions → File size limit',
        status: 'ratcheted',
        guard: 'src/__tests__/file-size-ratchet.test.ts',
        verifiedRedBy: 'append lines to any baselined file',
        defence: '12 files were already over the limit when the guard was written. Frozen at current size; may shrink, never grow. mcReducer.ts (1019) is the top split candidate.',
    },
    {
        rule: 'No raw hex in DOM-styled surfaces — use the owning design system\'s token. Canvas draw palettes are exempt.',
        source: 'CLAUDE.md → Conventions → Styling',
        status: 'ratcheted',
        guard: 'src/__tests__/style-token-ratchet.test.ts',
        verifiedRedBy: 'delete the Token.tsx row from RAW_HEX_BASELINE — the file reappears as un-baselined and "introduces no raw hex in a file that had none" goes red naming it (proven 2026-08-22). Counterpart proof for the exemption: add BlocksCanvas.tsx to CANVAS_PALETTE_EXEMPT — THREE tests go red (proven 2026-08-22, both with drawnBy explicitly itself and with it left implicit), led by "only exempts files that a real canvas renderer paints with" reporting no getContext and no fillStyle in the named renderer, plus "never lets a file be both exempt and baselined" and "tightens the baseline whenever a file improves". Neither recipe edits a component, so the ratchet can be proven honest without touching the code it measures.',
        defence: 'The human decision this entry used to be waiting on was made 2026-08-22 and the rule NARROWED. Canvas half: ctx.fillStyle cannot consume var(--mc-*), so a per-game palette constant is the token source for that surface — 5 files / 54 values moved from "violation" to an explicit exemption list, each one verified to be painted by a real 2D context rather than taken on trust (BlocksCanvas.tsx was wrongly exempted on the first pass purely because of its name). DOM half: still ratcheted, 312 values across 27 files, frozen — may improve, never regress, and a new violation in a non-exempt file fails outright. The cleanup is real work that is still outstanding, not a resolved question.',
    },
    {
        rule: 'The two design systems are disjoint — no cross-contamination of tokens',
        source: 'CLAUDE.md → Conventions → Styling',
        status: 'guarded',
        guard: 'src/__tests__/style-token-ratchet.test.ts',
        verifiedRedBy: 'use bg-family-cyan inside a Mission Control component',
    },

    {
        rule: 'docs/requirements.md is one document — one top-level heading, changelog in date order',
        source: 'CLAUDE.md → Docs',
        status: 'guarded',
        guard: 'src/__tests__/docs-integrity.test.ts',
        verifiedRedBy: 'append a second copy of the file to itself; also verified by duplicating one ### heading, and by adding a backdated changelog entry',
        defence: 'The file was silently triplicated for months and the three copies drifted — a whole feature section survived only in copy 1 while the newest changelog was in copy 3. Nothing about a duplicated markdown file breaks a build, which is why it needs a test.',
    },
    {
        rule: 'E2E specs isolate their userData, or restore what they write to the real one',
        source: 'CLAUDE.md → Testing → userData isolation',
        status: 'guarded',
        guard: 'src/__tests__/e2e-state-isolation.test.ts',
        verifiedRedBy: 'add an un-isolated electron.launch — as a new top-level spec, in a subdirectory, default-importing `test`, alongside the fixture, or with userDataArg computed but never passed; also by restoring config before closing the app. All seven verified red.',
        defence: 'Enforced per LAUNCH, not per spec subject: every electron.launch must carry the throwaway-profile switch, or its spec must be named in NEEDS_REAL_PROFILE (8 left, may only shrink). The behavioural half is e2e/global-profile-leak-check.ts, which fails the run if a profile is left on disk — source text cannot prove cleanup ran.',
    },
    {
        rule: 'Nothing stops production code importing a test kit or a test library but a guard; a new kit is named *TestKit / *Fixtures and listed in TEST_SUPPORT',
        source: 'CLAUDE.md → Testing → Fixtures',
        status: 'guarded',
        guard: 'src/__tests__/test-kit-boundary.test.ts',
        verifiedRedBy: 'append to placement.ts, one at a time: `import { DOT } from \'./dragFixtures\'`, a re-export from \'../quiz/quizTestKit\', `import(\'./dragTestKit\')`, and `import { vi } from \'vitest\'` — each goes red naming the file and specifier; unlisted blocks/fooFixtures.ts and blocks/snakeFixture.ts go red too (proven 2026-09-18). Counterpart proof: a comment that names dragFixtures.ts without an import-shaped `from \'…\'` stays GREEN.',
        defence: 'Nothing else fails: a kit is not a *.test.* file, so tsc, lint and the build accept the import, and a kit\'s own `vitest` import is tree-shaken when its bindings go unused (vitest declares "sideEffects": false). The kit headers used to claim that import was a tripwire; a Vite build proved it is not. A kit that imports no test library is recognised only by its name or its TEST_SUPPORT entry.',
    },
    {
        rule: 'Every suite importing dragTestKit sets vi.setConfig({ testTimeout: CANVAS_SUITE_TIMEOUT_MS }) — its first test renders BlocksCanvas cold',
        source: 'CANVAS_SUITE_TIMEOUT_MS in src/mission-control/games/blocks/dragTestKit.ts (measurements: project journal, 2026-09-21)',
        status: 'guarded',
        guard: 'src/mission-control/games/blocks/dragTestKit.timeout.test.ts',
        verifiedRedBy: 'delete the vi.setConfig line from BlocksCanvas.lift.test.tsx — red naming that file (proven 2026-09-21); so do a kit suite in a subfolder importing \'../dragTestKit\', one importing it with double quotes, one importing \'./dragTestKit.ts\', a .spec.tsx suite, and a suite whose line sits inside a beforeAll, is commented out, or comes after a top-level it() (the beforeAll and after-it forms were each proven to leave the 5s default in place). The constant itself was proven wired in all seven suites by setting it to 1: all 45 tests timed out.',
        defence: 'Nothing else fails: a suite that forgets goes green alone and flakes only on a busy machine, where its first test pays jsdom\'s cold CSS parsing of the canvas\'s inline styles (up to 5.9s with three runs sharing the machine). Scope gap, by choice: the guard keys on importing the kit, not on rendering BlocksCanvas, so a suite that renders the canvas without the kit is not covered; none does today.',
    },

    // ── Manual ───────────────────────────────────────────────────────────────
    {
        rule: 'Each game directory follows the types/use[Game]Game/[Game]Canvas/[Game]GameOverlay/index shape',
        source: 'CLAUDE.md → Conventions → Game structure pattern',
        status: 'manual',
        defence: 'The four existing games diverge from the template in small, deliberate ways (fruits has fruitPhysics.ts, blocks has a grid split). A guard would mostly generate false positives.',
    },
    {
        rule: 'Game hooks use local useState only; integration via onClose(score)',
        source: 'CLAUDE.md → Conventions → Game state',
        status: 'manual',
        defence: 'Partially implied by the MC isolation guard (games cannot reach the parent app). Store access from a game would need an import-graph rule per game directory — worth adding if a game ever grows a store dependency.',
    },
    {
        rule: 'TypeScript strict: no any, no `as unknown as X` laundering',
        source: 'CLAUDE.md → Conventions → TypeScript',
        status: 'guarded',
        guard: '.eslintrc.cjs',
        verifiedRedBy: 'npm run lint with an explicit any — @typescript-eslint/no-explicit-any errors',
        defence: 'One justified `as unknown as` remains in PerformanceHud.tsx for the non-standard performance.memory API.',
    },
    {
        rule: 'Production build injects a strict Content-Security-Policy',
        source: 'CLAUDE.md → Conventions → CSP',
        status: 'guarded',
        guard: 'electron/main_security.test.ts',
        verifiedRedBy: 'loosen the production CSP string in bootstrap()',
    },
];

const GUARDED_STATUSES: Status[] = ['guarded', 'ratcheted'];

describe('rule registry', () => {
    it('names a guard file for every guarded or ratcheted rule', () => {
        const missing = REGISTRY
            .filter(r => GUARDED_STATUSES.includes(r.status) && !r.guard)
            .map(r => r.rule);

        expect(missing, `status says enforced but no guard file is named:\n  ${missing.join('\n  ')}`).toEqual([]);
    });

    it('points every guard at a file that actually exists', () => {
        const broken = REGISTRY
            .filter(r => r.guard && !existsSync(join(repoRoot, r.guard)))
            .map(r => `  ${r.rule}\n    → missing: ${r.guard}`);

        expect(
            broken,
            `Registry points at guard file(s) that do not exist. A guard that was renamed or\n` +
            `deleted leaves the rule silently unenforced — the exact failure this registry exists\n` +
            `to prevent.\n\n${broken.join('\n')}`
        ).toEqual([]);
    });

    it('explains what defends every rule that has no guard', () => {
        const unexplained = REGISTRY
            .filter(r => !GUARDED_STATUSES.includes(r.status) && !r.defence)
            .map(r => r.rule);

        expect(
            unexplained,
            `manual/unguardable rules must say what defends them instead — otherwise the status\n` +
            `is just a shrug:\n  ${unexplained.join('\n  ')}`
        ).toEqual([]);
    });

    it('records how each guard was proven to fail', () => {
        // A guard nobody has ever seen fail may not be capable of failing.
        const unverified = REGISTRY
            .filter(r => GUARDED_STATUSES.includes(r.status) && !r.verifiedRedBy)
            .map(r => r.rule);

        expect(
            unverified,
            `Guarded rule(s) with no recorded way to make the guard go red.\n` +
            `Break the rule locally, watch the test fail, then record the recipe here:\n  ${unverified.join('\n  ')}`
        ).toEqual([]);
    });

    it('anchors every CLAUDE.md source to a section that still exists', () => {
        // `source` is prose, and a section renamed or moved in CLAUDE.md used to
        // leave its anchors dangling with nothing noticing. Only the `## `
        // section segment is validated — deeper segments name bold labels or
        // checklist numbers, and matching those is exactly the fragile prose
        // diff this registry avoids.
        const sections = new Set(
            readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8')
                .split('\n')
                .filter(line => line.startsWith('## '))
                .map(line => line.slice(3).trim())
        );

        const dangling = REGISTRY
            .filter(r => r.source.startsWith('CLAUDE.md → '))
            .map(r => ({ rule: r.rule, section: r.source.split(' → ')[1] }))
            .filter(({ section }) => !sections.has(section))
            .map(({ rule, section }) => `  ${rule}\n    → no "## ${section}" in CLAUDE.md`);

        expect(
            dangling,
            `source anchor(s) point at CLAUDE.md sections that do not exist:\n${dangling.join('\n')}`
        ).toEqual([]);
    });

    it('does not let the unenforced share of the rulebook grow silently', () => {
        // Not a quality bar — a tripwire. Adding a rule without a guard is
        // allowed, but it has to be a deliberate edit to this number.
        const unenforced = REGISTRY.filter(r => r.status === 'manual' || r.status === 'unguardable');

        expect(
            unenforced.length,
            `${unenforced.length} of ${REGISTRY.length} rules have no automated guard:\n  ` +
            unenforced.map(r => r.rule).join('\n  ') +
            `\n\nIf you added a rule without a guard, raise this number deliberately.`
        ).toBeLessThanOrEqual(5);
    });

    it('covers a meaningful share of the rulebook', () => {
        expect(REGISTRY.length).toBeGreaterThanOrEqual(18);
    });
});
