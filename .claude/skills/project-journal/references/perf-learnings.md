# Performance learnings

Real regressions found in `gcal-simplified` and the pattern that fixed each one. The governing invariant is in `CLAUDE.md` and `docs/performance.md`: **idle on the Calendar view must cost almost nothing.**

---

## 2024-05-18 — Isolate high-frequency hooks in leaf components

**Learning:** `useLiveClock` sets state every 1000ms. Placed at the root of an always-mounted component like `MissionOverlay` or `MissionControl`, it re-renders the entire subtree every second — significant background CPU even when the component is visually hidden.

**Action:** Extract high-frequency hooks into small dedicated leaf components (`MissionTimerDisplay`, `LiveClockDisplay`) so only a tiny part of the tree re-renders per tick. For delayed logic that auto-resolves, use an absolute timeout (`setTimeout(fn, endMs - Date.now())`) instead of polling a live-clock state variable.

## 2024-05-18 — Framer Motion infinite loops burn CPU in the background

**Learning:** In Framer Motion, an infinite loop declared on the top-level `transition` prop (`transition: { repeat: Infinity }`) runs a continuous 60fps loop even when the animation is visually static or conditionally disabled.

**Action:** Put infinite transitions inside a conditional `animate` object so the loop only runs while actually triggered.

## 2025-05-19 — Replace infinite Framer loops with CSS keyframes

**Learning:** `framer-motion` `repeat: Infinity` executes JS and layout work on the main thread continuously, degrading React performance — noticeably on slower machines.

**Action:** Move long-running or infinite animations to pure CSS `@keyframes` + classes so the browser can offload them to the compositor thread. Remember the class must be *removed* (or the element unmounted) when inactive — fading to `opacity: 0` does not stop the loop.

## 2026-03-11 — Don't reallocate Dates in hot loops

**Learning:** `eventsByDayMap` in `MonthlyView.tsx` and `splitMultiDayEvents` called `new Date(event.start)` inside O(N) loops even though `event.start` is already hydrated as a `Date` in `useCalendarData.ts`. Pure allocation churn and GC pressure on large datasets.

**Action:** Reuse the existing reference defensively: `event.start instanceof Date ? event.start : new Date(event.start)`. Keeps safety for unhydrated data without paying for the common case.

## 2026-03-12 — O(days × N) filtering → O(N) Map lookup

**Learning:** `days.map(day => events.filter(e => isSameDay(e.start, day)))` in `Dashboard.tsx` is O(days × N) and hammers `date-fns`'s `isSameDay` on every render.

**Action:** One pass over events grouping by a `YYYY-MM-DD` string key into a Map, then map over days with O(1) lookups. Combine with the defensive Date reuse above.

## 2026-03-13 — Initialize singleton hook state lazily

**Learning:** A module-level singleton for `useLiveClock` (`let currentDate = new Date()` at module scope) makes components mount with a stale date if they load long after script evaluation.

**Action:** Initialize the singleton inside the hook on first use (`if (!intervalId) currentDate = new Date()`) so it reflects first mount, not module load.

## 2026-05-22 — Speculative reducer runs and context isolation

**Learning:** Four separate costs found together:
1. Calling `mcReducer(state, action)` inside the `createLogEntry` formatting helper made the whole reducer run ~3× per dispatch.
2. Transient network/connection flags in the global store re-rendered every unrelated consumer.
3. Unbounded log arrays grew past 1000 entries — memory bloat and slow modal rendering.
4. Per-remote-action timers in the main process leaked and produced Vitest errors.

**Action:**
1. Use a lightweight O(1) projection (`deriveSnapshots`) keyed on action type instead of re-running the reducer.
   *(Correction 2026-08-20: this overstated the fix — `deriveSnapshots` still calls the full
   `mcReducer` once per dispatch, before the switch. `createLogEntry` now early-returns `null` for an
   `UNLOGGED_ACTIONS` set before that speculative run; add any new high-frequency action type — the
   first was `RECORD_QUIZ_ANSWER` — to that set, or every dispatch of it pays the reducer twice.)*
2. Restrict invariant syncing (`syncCreamTask`) inside the reducer to actions that actually touch the relevant slices.
3. Put transient status in a dedicated context (`RemoteStatusContext`), not root state.
4. Cap logs at 200 entries in the reducer; use a timestamp-mapped `seenIds` cleanup in `RemoteBridge` with a `.destroy()` called from test `afterEach`.

## 2024-05-19 — Short-circuit hit detection before object lookups

**Learning:** In `GoalPedestal.tsx` and `GlobalBank.tsx`, drag-and-drop hit detection ran an `array.find()` for token config *before* checking whether the pointer was inside the boundary rect — an O(N) lookup for every non-hit element on every release, making the loop O(N²).

**Action:** In pointer/hit-detection loops, always run the cheap primitive bounds check (`x >= rect.left && …`) first so the expensive lookup executes only for the actual hit.

## 2026-05-07 — Don't duplicate a utility's internal contract

**Learning:** Pre-sorting an array, or running several `.filter()` passes, before handing it to a utility that already sorts and slices internally costs an extra O(N log N) plus allocations for nothing.

**Action:** Partition with a single `for…of` loop instead of stacked `.filter()` calls, and don't defensively pre-sort data for a utility that enforces its own sort order.

## 2026-06-29 — Cache canvas geometry on drag start

**Learning:** Grid drag-and-drop that calls `getBoundingClientRect()` on every pointer move forces layout on every frame.

**Action:** Read the canvas geometry once on drag start (and on resize), then map screen coordinates to cell indices arithmetically.

## 2026-07 — The three fixes behind the "CPU wakes up on Calendar" report

**Learning:** The user's actual complaint traced to three independent leaks, all from Mission Control code running on the always-mounted tree:
1. `useMissionScheduler`'s 15s expiry poll ran unconditionally — 4 wakeups/min with no mission active.
2. The 60s behavior heartbeat created a new store object every tick → re-render of all `useMCState` consumers + `localStorage` write + remote broadcast, even at night.
3. The Dashboard "Syncing…" bar animated `width` forever; the wrapper only faded to `opacity: 0` and never unmounted, so a layout-driven CSS loop ran continuously.

**Action:** Gate the scheduler on `activeMission !== 'none'`; make `applyBehaviorSync` return the *same state reference* when nothing accrues; apply animation classes only while actually syncing. All three are now locked in by `src/__tests__/timer-registry.test.ts` and `src/mission-control/__tests__/idle-performance.test.tsx`.

## Ref-based rAF loops for canvas games

**Learning:** Putting mutable game state in the dependency array of a `useCallback`/`useEffect` driving `requestAnimationFrame` tears down and restarts the loop on every state change — visible lag.

**Action:** Store state in a ref (`gameStateRef.current = gameState`) and read from the ref inside a single stable rAF loop with `[]` dependencies.

## 2026-08-20 — Every timestamped dispatch is a mood-accrual tick, and was a broadcast trigger

**Learning:** `useMCDispatch` stamps every action with a timestamp, and `mcReducer` runs
`applyBehaviorSync` for every timestamped action. During active hours every mood level has a
nonzero rate, so *any* dispatch nudges `behaviorProgress` — and `behaviorProgress` sat in
`useRemoteSync`'s dependency array, so every dispatch (including, newly, every answered quiz
question) scheduled a Supabase broadcast. A high-frequency action multiplies whatever is keyed
on "state changed at all".

**Action:** `behaviorProgress` was removed from the sync dependency list (it still rides each
broadcast's payload — the phone sees it at the next real change). When adding any per-event
action, check three fan-outs: the speculative reducer run in `createLogEntry` (UNLOGGED_ACTIONS),
the remote-sync dependency list, and the persisted-blob size. `skill-progress-boundaries.test.ts`
pins the second for `skillProgress`.

## 2026-09-07 — An invisible `backdrop-filter` is visually free, not computationally free

**Learning:** `BlocksGameOverlay` stacked `backdrop-filter: blur(4px)` underneath
`rgba(0,0,0,0.88)`. The blur contributed nothing visible — a filter does not change opacity, and at
88% black there is almost nothing left to smear — yet the browser still re-evaluated the full-screen
backdrop whenever anything behind it painted. The same trap sat on the line-clear feedback card, a
12px blur parked directly over 8–16 animating cells for 1.2s, which is precisely when a child grabs
the next piece.
**Action:** A `backdrop-filter` costs a backdrop re-evaluation on every frame that anything *behind*
it changes. Before animating any surface, grep for a `backdrop-filter` above it, and delete the
filter outright when the layer's own alpha already hides what it would blur. Note the dev-only
`games/blocks/PerformanceHUD.tsx` still carries one: profile against a production build, or the HUD
you are reading is inside your own trace.

## 2026-09-07 — A ref caching a validated decision must be re-derived when its inputs change

**Learning:** The blocks drag stores the projection the green ghost is showing in a ref, and the drop
places on it — deliberately, so a finger rolling on release cannot move the outcome. But the ref was
only recomputed inside `pointermove`. Hold the finger still while the 1200ms line-clear timer fires,
and `applyClearEffects`/`spawnObstacles` can drop a meteor into a cell under a green ghost. The
ghost keeps saying yes, `placeShape` re-validates against the new grid and says no, and the piece
returns to the bank with no explanation — the same "I saw green and it went back" bug the rework
existed to remove, re-entering through a different door.
**Action:** When a ref caches a decision validated against some state, recompute it when that state
changes, not only when the originating event fires — one recompute per data change, not per frame.
More generally: any preview of a future write is a claim about data that something else may be
mutating underneath it.

## 2026-09-10 — A DEV gate strips the mount, not the component

**Learning:** `{import.meta.env.DEV && <PerformanceHUD/>}` looks like it keeps a dev-only component
out of production. Vite folds the flag and Rollup drops the *call site*, but a component declared as
`memo(...)` or `forwardRef(...)` survives anyway: Rollup cannot prove the wrapper call is
side-effect-free, so it keeps it as a bare expression bound to nothing — dead bytes, including any
`setInterval` in the body. Proof inside this repo: `QuizLab` (a plain function behind the identical
gate in `App.tsx`) greps to zero hits in `dist/assets/*.js`, while `games/blocks/PerformanceHUD.tsx`
shipped in full, 200ms poll and all.
**Action:** annotate `/*#__PURE__*/ memo(...)`, or keep dev-only components as plain functions. Never
assume the fold reached the definition — verify by grepping a distinctive string from the component
in `dist/assets/*.js` after `npx vite build`. The same applies to any `React.memo`/`forwardRef`
export you expect a bundler to remove.

## 2026-09-21 — Work derived from constants belongs in a module cache, not on the drop path

**Learning:** The Space Rescue dealer enumerated every template's orientations (rotate, mirror,
normalise, de-duplicate by sorted signature string) on every deal and every game-over check. The
templates are module constants, so the result never changes — and it was 55-70% of what a
bank-emptying drop cost (perf-sentinel's same-session bench: 0.46-0.99ms p50 before, 0.16-0.31ms
after). A variant of "don't reallocate in hot loops": nothing allocated per iteration, but the whole
derivation was recomputed per call.

**Action:** anything computed only from module constants gets a module-level cache keyed by the
constant's id (`orientationCache` in `candidates.ts`). If the cached value can reach mutable state —
here, a dealt shape's `cells` — hand out copies, so no consumer can corrupt the cache for every
later game.

## 2026-09-22 — A self-rescheduling `setTimeout` is a poll the timer registry cannot see

**Learning:** `useMissionScheduler.schedulePhase` re-arms itself 1 s after every fire, and aimed at
today's occurrence whenever that window was open, without asking whether the occurrence had already
run. So for the whole window (30 min mornings, 60 min evenings, on the Calendar view too) it armed
about 2 timers a second: a 0 ms fire that did nothing, then the next 1 s re-arm. `timer-registry`
scans for `setInterval` only, so this 1 Hz poll passed every guard. It was found only because it was
the second path by which a stopped mission restarted (see requirements, 2026-09-22). A fix in the
fire callback alone would have stopped the restart and kept the poll.
**Action:** A recursive `setTimeout` is an interval. Decide at *arm* time whether there is anything
to wait for, and aim at the next real event (here: tomorrow once today's occurrence ran). To prove
it, spy on `setTimeout` and assert that nothing is armed across a quiet stretch
(`useMissionScheduler.stop.test.tsx`). A scheduler should also remember what it *started*, not
infer it from outcomes. Any exit that records no outcome (a stop) otherwise reads as "not yet run".
Remember both edges of a run, not only the start: a start-only stamp missed a mission started before
the window and stopped inside it, and the re-arm polled again while it ran. And a pending occurrence
blocked by ANOTHER running mission is also nothing to wait for: aim past it and let the run ending
re-arm the effect.
Extending `timer-registry` to recursive timeouts is an open follow-up.

## 2026-09-23 — A random draw inside a replayable updater would cost a remount, not just a flicker

A `setState` updater React runs twice (StrictMode in dev, a sync-lane update rebased over a pending
lower-priority one in production) re-rolls any `Math.random()` inside it, so the two runs commit
different values. When a drawn value feeds a React **key**, that is not a cosmetic difference: the
dealer's id suffix feeds `StandardShapesTray`'s `key={shape.id}`, so two frames would disagree on
every key and React would tear down and rebuild up to three tray slots and their cells instead of
reconciling them — on the drop path, exactly where the 2026-09-07 drag work cared about latency.
(Reasoned from key semantics, not profiled — and on the deal path the replay is unreachable today,
so it never actually cost anything. The lesson is the mechanism, not the bill.) Seeding the updater (roll the seed
outside, build the generator inside — see `architecture-patterns.md`) is therefore the correctness
fix *and* a small saving.

Corollary when reviewing any updater: grep whether anything it randomises ends up in a `key`.

Measured while reviewing PR 171, for the budget record: mulberry32 costs ~1.15x `Math.random` per
call and its closure is scalar-replaced away by TurboFan, so the swap is below the noise floor
(A/B deltas flipped sign across board occupancies). `dealStandardTriple` makes ~114 rng calls on an
open board, ~31 at 60% fill — the deal is *cheaper* on a crowded board, because fewer candidates
fit and there are fewer anchor pairs to walk.
