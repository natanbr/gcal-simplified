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
    /** Repo-relative path(s) to the enforcing test. Required for guarded/ratcheted.
     *  Several are allowed because a rule can need more than one file to be fully
     *  enforced — naming the second one in `defence` instead leaves it unchecked,
     *  since `defence` is prose and only `guard` is asserted to exist. */
    guard?: string | string[];
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
        verifiedRedBy: 'make moveGauge (store/moodGauge.ts) keep state.moodWind on a grant — the mood-reset cases in mcReducer.token-generation.test.ts go red',
    },
    {
        rule: 'moveGauge is the only in-dispatch writer of behaviorProgress, and the game-token cap is checked only through gameTokenRoom (which counts a Quick-Game goal)',
        source: 'CLAUDE.md → Conventions → Mood gauge writer',
        status: 'guarded',
        guard: 'src/__tests__/gauge-writer-boundary.test.ts',
        verifiedRedBy: "each named by file:line (proven 2026-09-23 in an isolated copy): restore TOGGLE_WHINING's inline `behaviorProgress: Math.max(0, …)` in mcReducer.ts; move that clamp into a helper above _mcReducer; write `return { behaviorProgress }` (shorthand) or a computed key in missionStreak.ts; `nextState.behaviorProgress = 0` in mcReducer.ts; restore `Math.min(5, state.gameTokens + 1)` in REFUND_CASE, swapped, or across lines; a `gameTokens < 5` check.",
    },
    {
        rule: 'The cap decides a gauge grant before the progress is spent: a gauge with no room holds at full',
        source: 'CLAUDE.md → Conventions → Mood gauge writer',
        status: 'guarded',
        guard: 'src/mission-control/store/__tests__/mcReducer.mood-cap.test.ts',
        verifiedRedBy: 'in moveGauge subtract `earned` instead of `granted` tokens of progress — 9 cases go red, the reported-bug case first (proven 2026-09-23 in an isolated copy).',
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
        defence: 'This entry guards the log half only. The drag-handler half is the next entry, guarded since 2026-09-23.',
    },
    {
        rule: 'A locked drop is refused BEFORE the optimistic UI commits, so the coin springs back instead of vanishing',
        source: 'CLAUDE.md → Conventions → Refusals must be silent in the log and visible on screen',
        status: 'guarded',
        guard: [
            'src/mission-control/components/GlobalBank.test.tsx',
            'src/mission-control/components/GoalPedestal.test.tsx',
        ],
        verifiedRedBy: "delete `if (economyLocked) return false` from GlobalBank's handleTokenDrop — the locked case goes red with 2 coins left in a pile of 3; delete it from GoalPedestal's — both locked cases (onto the bank, onto another goal) go red with 1 coin left in 2 slots. Read the lock once at mount (`useRef(isEconomyLocked(state))`) — the six 'while the screen stays open' cases go red and nothing else does. Start GlobalBank's exit animation BEFORE the guard — the vanishing-coin assertion goes red while the coin count alone stays green, because GlobalBank keeps a deposited coin mounted and only shrinks it. Stop Token springing back (`if (false && !consumed)`) — the locked cases go red. Shifting every drop point off the targets reds only the UNLOCKED controls, which is exactly what those controls are for (all proven 2026-09-23 on an isolated copy).",
        defence: "Both files assert the RENDERED pile — on the release frame as well as after the exit window — never only the store: the reducer refuses MOVE_TOKEN too, so a store count stays green over the bug that shipped (the coin animated away and the count kept its old total). Each locked case is paired with an unlocked drop at the same point, so a refusal cannot pass by missing the target, and the lock is moved by ADJUST_SHIELD mid-test so a lock read once at mount cannot pass. KNOWN BLIND SPOT: these tests call the drop handler through a mocked Framer gesture, so they prove the DECISION, not that the gesture is reachable — deleting `drag` from Token.tsx leaves them all green, and no E2E covers the coin (see docs/test-coverage-plan.md).",
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
        rule: 'stampMissionActivity is the only writer of lastActiveAt (every start and end of a run) and nothing clears it, so the scheduler never restarts a stopped mission',
        source: 'CLAUDE.md → Conventions → A mission re-trigger clears loggedTimeoutAt',
        status: 'guarded',
        guard: 'src/mission-control/__tests__/activity-stamp-boundary.test.ts',
        verifiedRedBy: "add `lastActiveAt: undefined` to CANCEL_MISSION's mission reset in mcReducer.ts — both boundary cases fail, naming the file and the case; stop routing the wrapper through stampMissionActivity — the boundary test and 17 behavioural cases in useMissionScheduler.stop/early-start.test.tsx and mcReducer.mission-stop.test.ts go red (proven 2026-09-23).",
        defence: 'The behavioural half is useMissionScheduler.stop.test.tsx and useMissionScheduler.early-start.test.tsx, which drive the real reducer through a stop in both windows, a mission started before its window and stopped inside it, a relaunch and a rollover. Their no-timer cases go red on their own if the arm-time checks in schedulePhase are dropped (20 timers in 10 s).',
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
        verifiedRedBy: 'add an un-isolated electron.launch — as a new top-level spec, in a subdirectory, default-importing `test`, alongside the fixture, or with userDataArg computed but never passed; also by restoring config before closing the app. All seven verified red. Re-proven 2026-09-21 after specs moved to launchApp: the same recipes written as un-isolated launchApp calls, plus the old electron.launch shape, all red.',
        defence: 'Enforced per LAUNCH, not per spec subject: every launch (launchApp, or a raw electron.launch) must carry the throwaway-profile switch, or its spec must be named in NEEDS_REAL_PROFILE (8 left, may only shrink). The behavioural half is e2e/global-profile-leak-check.ts, which fails the run if a profile is left on disk — source text cannot prove cleanup ran.',
    },
    {
        rule: 'Every E2E launch goes through launchApp, which takes the wall-clock mission scheduler out of play before any spec code runs; every spec takes the shared test whose teardown closes (and restores) what it launched, one app per test (no beforeAll/afterAll); no E2E file clears localStorage or calls removeItem',
        source: 'CLAUDE.md → Testing → E2E launches go through launchApp',
        status: 'guarded',
        guard: 'src/__tests__/e2e-launch-chokepoint.test.ts',
        verifiedRedBy: 'each red, one at a time (2026-09-21): a new spec importing `_electron` and calling its launch; the same aliased (`_electron as boot`) in a subdirectory; `_electron` imported into mcApp.ts; the quietMissionClock call commented out (first PASSED: the guard read comments), moved below the return, given `.catch(() => {})`, made `void`, put behind `if (...)` on its own line, behind a braceless `if` on the line before, inside `if { }` and inside `try { } catch { }` (the four review-found forms first PASSED); `lastCompletedOrFailedEveningDate` misspelled as a bracket write and as a dot write (the dot form first PASSED); a spec calling `localStorage.clear()`, one removing `mc-state-v5`, mcApp.ts removing STORAGE_KEY, `window.localStorage.clear()` in a subdirectory; a spec importing `{ test }`, `{ test as base }`, default `test` or `* as pw` from @playwright/test; `auto: true` dropped from the shared test. Delta re-review, each first PASSED: `if (isolated) return app;` above the call, the catch returning the app instead of rethrowing, `test.beforeAll` / `mcTest.afterAll` in a spec, `page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY)`, a helper re-exporting Playwright\'s `test`. Counterpart: a type-only import plus a comment naming localStorage.clear() stays GREEN.',
        defence: 'Source text cannot prove the app is clickable. e2e/mission-clock-independence.spec.ts is the behavioural half: it leaves a throwaway profile with a running mission, or with a mission window containing "now", and requires the next launch to take a click. E2E_SIMULATE_MISSION_WINDOW=1 puts every launch of a full run through the same failure first. The fixture restore was proven by mutation against the dev profile: a real-profile spec that throws mid-test, or hangs to its timeout, leaves the fields identical; the same throw with test from @playwright/test left them quieted. A mission the launch itself started (startedAt at or after launch) is recorded as not running, so it is not put back: proven with a 1.5s delay before the hop inside an open window (without the fix the test-started mission was restored), and pinned by src/__tests__/e2e-mission-clock.test.ts (red on `>=` flipped to `<` or weakened to `>`), which also pins seedFailingState refusing a non-throwaway page (red on the check flipped, removed, or real-profile launches registered as throwaway). Not covered, listed in missionClock.ts: no re-broadcast of the restore to the phone room, one extra SESSION_START per launch, and a killed run keeps "concluded today" until midnight.',
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
        rule: "TypeScript: no `any`, no `as unknown as X` laundering",
        source: "CLAUDE.md → Conventions → TypeScript",
        status: "guarded",
        guard: "src/__tests__/type-laundering-guard.test.ts",
        verifiedRedBy: "Two halves; 33 mutations, all proven 2026-09-21 by a harness that runs the guard's own sweep script (helpers/typeLaunderingSweep.cjs). Probes (sample code linted through the real config, as .ts and .tsx): delete the no-restricted-syntax block — the 15 laundering cases go red; narrow its selector to TSUnknownKeyword — the never/any/object cases (6); narrow it by location with `:not(:function *)` — the nested cases (4), or so it skips test callbacks — the `it(...)` case (2); set @typescript-eslint/no-explicit-any off — the `any` case (2); set @typescript-eslint/ban-types off — the `as {} as` case (2). Sweep (each linted file's resolved parser and rules compared with the probe's; the case names the files): an override turning laundering, or ban-types, off for **/*.test.ts(x) names every test file; one giving src/mission-control/**/*.tsx (excluding tests) its own selector names every such component; laundering off for src/mission-control/**/*.test.* names every Mission Control test; parser espree for e2e/** names every e2e file; a new top-level shared/ with the rule off for it names its file; a junction under src, or a link from src into electron, with the rule off under the link names the files seen through it. Ignore routes: e2e in ignorePatterns or src in .eslintignore reports every file under it; a new shared/ in .eslintignore, a top-level .shared/, a shared/.internal/, a src/node_modules/, a dot-folder under src and an ignored vendor/ whose TypeScript sits behind a link are each reported, as is an .mts file — while coverage/.tmp, an empty .vscode/, Playwright's artifacts folder and a dangling link (even one named stale.ts) fail nothing. Directives, read from the parser's own comments: inline rule config (bare, quoted or brace form) and block eslint-disable (bare, naming the rule, quoted, with a `*` or a multi-line reason, or after a glob string) are each reported. A --rule flag added to the lint script fails the pinned-command case. The seven-path version before the sweep stayed green under the two Mission Control overrides. History: the rule's first run on the real tree reported 38 sites in 12 files (2026-09-13).",
        defence: "Until 2026-09-13 this rule was listed as guarded by .eslintrc.cjs while only its `any` half had a rule; the registry only checks that a guard file exists, so even deleting the rule would not have shown. The selector is syntactic, so these slip past it: a value already typed unknown and cast once; `(v as unknown)! as X` (the non-null assertion sits between the casts); an alias for unknown (`type U = unknown; v as U as X`); a single `as never` (skillProgress.test.ts has one); a `launder<T>(v: unknown): T` helper. `v as {} as X` is left to @typescript-eslint/ban-types, which is probed and swept because typescript-eslint v8 removes that rule. The sweep reads directives the way ESLint 8.57 does (its directive pattern and ` -- reason` split, applied to the parser's comments), so an ESLint upgrade that changes directive syntax needs that mirrored again; the sweep script itself is plain CommonJS outside both lint and tsc, and the test shape-checks everything it reports. Nor does any of it make IPC input typed: Electron types ipcMain.handle arguments as `any`, so a single `arg as Foo` there is neither laundering nor explicit any, and validation at the handler is the only defence. Escape hatches, uncapped, as of 2026-09-21: 3 `eslint-disable-next-line no-restricted-syntax -- reason` (negative tests feeding a deliberately ill-typed value to a runtime guard: mcReducer.purity.test.ts, weather_security.test.ts ×2) and 30 no-explicit-any disables, 3 of them in production code (electron/api.ts, UpdateNotification.tsx ×2). A no-restricted-syntax disable silences every selector under that rule, so a restriction later added to it inherits the three exemptions.",
    },
    {
        rule: "TypeScript: strict",
        source: "CLAUDE.md → Conventions → TypeScript",
        status: "guarded",
        guard: "src/__tests__/typescript-strict-config.test.ts",
        verifiedRedBy: "Twelve mutations, each turning exactly one case red (proven 2026-09-21): `\"strictBuiltinIteratorReturn\": false` or `\"noCheck\": true` in tsconfig.json; electron/** or electron's tests added to its exclude, or e2e removed from its include (the compiled-file case names every dropped file); `// @ts-nocheck`, `// @TS-NOCHECK` or one spelled with a Kelvin sign (TypeScript lower-cases pragmas with Unicode rules) at the top of a production file; `\"strict\": true` deleted from tsconfig.node.json; and the tsc script changed to `tsc --strictNullChecks false`, to `npx tsc`, or to also compile a looser config (the pinned-command case). The pinned strict-flag list is compared with the installed compiler's own, so an upgrade that adds a flag fails too.",
        defence: "The tsc command is pinned (`tsc && tsc -p tsconfig.test.json && tsc -p tsconfig.node.json --composite false --noEmit` since 2026-09-23), not parsed: tsc accepts too many spellings to parse safely, so changing it means updating the configs this guard checks. It reads tsconfig.json, tsconfig.test.json and tsconfig.node.json through the compiler's own config parser, fails on noCheck, fails if any production source under src, electron or e2e, or any electron test, drops out of what tsconfig.json (the app config, free of test globals) compiles, and fails on a @ts-nocheck in any TypeScript file under those roots, tests included. tsconfig.node.json is compiled by its own step in the gate since 2026-09-23 (plain `tsc` does not build project references, so before that nothing compiled it); it stays in this guard's config list either way, so removing that step cannot also remove its strict checks. The root-config entry below owns that step.",
    },
    {
        rule: "TypeScript: strict — test files included",
        source: "CLAUDE.md → Conventions → TypeScript",
        status: "guarded",
        guard: "src/__tests__/typecheck-coverage.test.ts",
        verifiedRedBy: "Six mutations, each proven on its own (2026-09-23, re-run after the walk was rewritten): delete `\"exclude\": []` from tsconfig.test.json — typecheck-coverage's \"leaves no other TypeScript file unchecked\" goes red listing 112 files (109 src tests, the two __tests__ helpers and src/test/setup.ts); set scripts.tsc back to bare `tsc` — that case plus \"runs the app config and the test config\" go red, and so does typescript-strict-config's pinned-command case; `\"strict\": false` in tsconfig.test.json — typescript-strict-config's \"tsconfig.test.json turns strict mode on\" goes red; `// @ts-nocheck` atop a src test — its @ts-nocheck case goes red naming the file, and so does the same pragma in a UTF-16LE-with-BOM file, which the scan missed until it read through ts.sys.readFile (both proven 2026-09-23); a new top-level `shared/thing.ts` — the coverage case goes red naming it, which a fixed list of source roots would have missed.",
        defence: "Two guards, one question each. typecheck-coverage.test.ts parses the tsc script for the configs it runs and fails if any .ts(x) anywhere in the repo is outside all of them, with nothing excepted since 2026-09-23; typescript-strict-config.test.ts owns how strict those configs are and the @ts-nocheck scan. Until 2026-09-21 the gate compiled no src test: tsconfig.test.json inherited tsconfig.json's excludes and no script ran it. 22 strict-mode errors had piled up in 9 test files when the gap was found on 2026-09-13; PR 160 fixed 9 of them and PR 162 the other 13. PR 162 fixed 16 more that the count never included: 5 dead `import React` lines the test config's relaxed noUnusedLocals had hidden, 1 in e2e-mission-clock.test.ts (arrived with PR 164) and 10 in dealer.test.ts / placement.test.ts (arrived with the coherent-hand dealer) — both while it was in review, which is the drift rate the gate exists to stop. The two guards model the script differently — pinned there, parsed here — so a new tsc step (the root-config follow-up) must update typescript-strict-config's TSC_SCRIPT, while this one follows the script by itself. Two things it deliberately does not claim: a .d.ts file is in a config's file list but `skipLibCheck: true` means tsc reports nothing from inside it, so declaration files are left out of the walk rather than counted as checked; and UNCHECKED_BY_DESIGN, the list the root-config entry below owns, is empty since 2026-09-23. The coverage walk reads directory entries without following them: a dangling link names no file and is skipped (before that, a `src/stale-probe.ts` pointing nowhere failed two cases with ENOENT — proven 2026-09-23), and a linked directory is never descended into, so a junction back into the tree cannot loop.",
    },
    {
        rule: "TypeScript: strict — root config files included",
        source: "CLAUDE.md → Conventions → TypeScript",
        status: "guarded",
        guard: ["src/__tests__/typecheck-coverage.test.ts", "src/__tests__/typescript-strict-config.test.ts"],
        verifiedRedBy: "Each of these was proven on its own, in an isolated copy of the tree (2026-09-23) — no count here, because a count is one more thing to keep true. Drop the tsconfig.node.json step from scripts.tsc — typecheck-coverage's \"runs the root-config project\" goes red, \"leaves no other TypeScript file unchecked\" reports 3 files, and typescript-strict-config's pinned-command case goes red. Restore tsconfig.node.json's old two-file include — that coverage case reports 1 file, playwright.config.ts. Drop --noEmit or --composite false from scripts.tsc alone — only the pinned-command case goes red, because the per-step cases read TSC_SCRIPT, and the pin is what makes that constant the real command. Drop --noEmit from both the script and TSC_SCRIPT — \"compiles tsconfig.node.json with no emit and no build-info\" goes red on the emit half, and the real run then writes vite.config.js, vitest.config.js and playwright.config.js into the repo root (only .js while --composite false stands; the .d.ts too once it does not). Drop --composite false from both — the same case goes red on the build-info half, and the real run leaves tsconfig.node.tsbuildinfo there. Append --noCheck to both — \"compiles tsconfig.node.json with checking still on\" goes red; before that case existed this two-line edit turned the whole gate off with every guard green and `npm run tsc` exiting 0 on a real TS2322. Add --strict false to the app step in both — the same case goes red for tsconfig.json. Add --listFilesOnly or --showConfig to both — \"passes tsconfig.node.json no flag this guard cannot model\" goes red, and either flag really does make the step exit 0 with a TS2322 planted in playwright.config.ts. Append `|| true` to both — \"chains its steps with && and nothing else\" goes red, and the real gate then exits 0 on that same planted error. Strip target/lib/types from tsconfig.node.json — \"type-checks the root configs against Node, not a browser\" goes red, and `document.querySelector` in playwright.config.ts does compile clean without them (that case's first spelling read options.lib ?? [], which passes on a deleted lib; the mutation is what caught it). Refuse symlink creation in sourceFiles.test.ts while neutering entryResolves — the dangling-link case reports a real skip rather than the vacuous pass it gave under it.runIf, whose condition vitest reads at collection time, before beforeAll has run. The gate itself, end to end: `const mistyped: number = process.env.CI` appended to playwright.config.ts fails `npm run tsc` with TS2322, while the bare `tsc` that ran before this change exits 0 on the same file (first proven 2026-09-13 against the same step, re-proven 2026-09-23 against this script).",
        defence: "Two guards, split by question. typecheck-coverage.test.ts parses scripts.tsc and fails if any .ts(x) in the tree, root configs included, is outside every config it runs — UNCHECKED_BY_DESIGN is empty since 2026-09-23, and a line naming a file that does not exist is rejected too. typescript-strict-config.test.ts pins the command verbatim and checks each STEP's effective options (the config file's, with the step's flags over the top, which is the precedence tsc applies): no emit, no build-info, noCheck off, strict not opted back out of, only flags it can model, steps joined by && alone, and the root configs typed against Node rather than a browser. Both files are named above because a rename in either leaves half this rule unenforced. composite stays on in tsconfig.node.json because tsconfig.json lists the project under `references` — without it the gate's own first step fails with TS6306 — so the step passes --composite false instead, since composite forces incremental mode and would otherwise drop a .tsbuildinfo in the repo root. What this does not cover: nothing in the suite ever executes the gate — the emit and build-info case models tsc's option resolution rather than observing a run, so a future TypeScript that changed emit behaviour under --composite false would slip past until someone re-ran the recipe above. postcss.config.cjs and tailwind.config.js are JavaScript, which tsc reads only with allowJs, and `npm run build` still runs the app config alone."
    },
    {
        rule: "Discriminated unions over boolean-flag soup",
        source: "CLAUDE.md → Conventions → TypeScript",
        status: "manual",
        defence: "A design judgement with no syntactic signature: a guard cannot tell a bag of related booleans from independent ones. Reviewed case by case by the architect lens. Registered 2026-09-21, when the TypeScript line was split into one entry per clause, so that no clause of it goes uncounted.",
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

/** Normalizes `guard` so both checks below see the same shape. An empty array is
 *  "no guard named" — test the length, never the truthiness of `[]`. */
function guardFiles(rule: Rule): string[] {
    if (!rule.guard) return [];
    return Array.isArray(rule.guard) ? rule.guard : [rule.guard];
}

describe('rule registry', () => {
    it('names a guard file for every guarded or ratcheted rule', () => {
        const missing = REGISTRY
            .filter(r => GUARDED_STATUSES.includes(r.status) && guardFiles(r).length === 0)
            .map(r => r.rule);

        expect(missing, `status says enforced but no guard file is named:\n  ${missing.join('\n  ')}`).toEqual([]);
    });

    it('points every guard at a file that actually exists', () => {
        const broken = REGISTRY
            .flatMap(r => guardFiles(r).map(guard => ({ rule: r.rule, guard })))
            .filter(({ guard }) => !existsSync(join(repoRoot, guard)))
            .map(({ rule, guard }) => `  ${rule}\n    → missing: ${guard}`);

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
        // Cap was 7 from 2026-09-21, when the TypeScript line was split into one
        // entry per clause: the test-files clause closed on 2026-09-22 and its slot
        // was immediately taken by the root-config clause it had been hiding. That
        // clause closed on 2026-09-23 — npm run tsc now compiles vite.config.ts,
        // vitest.config.ts and playwright.config.ts — so the cap is 6.

        expect(
            unenforced.length,
            `${unenforced.length} of ${REGISTRY.length} rules have no automated guard:\n  ` +
            unenforced.map(r => r.rule).join('\n  ') +
            `\n\nIf you added a rule without a guard, raise this number deliberately.`
        ).toBeLessThanOrEqual(6);
    });

    it('covers a meaningful share of the rulebook', () => {
        expect(REGISTRY.length).toBeGreaterThanOrEqual(18);
    });
});
