# Architecture patterns, invariants and false positives

Settled decisions from past reviews of `gcal-simplified`. The **false positives** section matters as much as the rest — those are things that look wrong and are deliberate.

---

## Confirmed false positives — do NOT flag these

- **Missing `whileTap` visual feedback on long-press buttons in Mission Control.** Intentional. The user explicitly asked for no visual feedback so long-press features stay hidden from the child.

*(Add to this list whenever a review finding is investigated and turns out to be deliberate. Recording it is what stops the next reviewer from spending a cycle on it.)*

---

## State & data flow

**Transient signals must not live in root `MCState`.** Supabase connection status, heartbeats, or any high-frequency binary flag from an external system re-renders every `useMCState()` consumer if placed in root state. Use an isolated context (`RemoteStatusContext`) that only the relevant indicators subscribe to.

**Bounded log arrays.** `activityLogs` is capped at 200 entries in the `ADD_LOG` reducer case (`.slice(0, 200)`). The 7-day age filter alone is not enough for high-frequency signals. Enforce at the reducer, never at render.

**Hydration migrations.** When removing a class of persisted data, apply a one-time migration at the `useMCStore` hydration point *before* first render, and apply both the filter and the current cap during that migration.

**Global listeners mount at global scope.** A listener that updates a global store (IPC, WebSocket, Supabase) must be mounted at the same level as the store provider — a bridge component in `App.tsx` — not inside a view that unmounts on navigation. Otherwise events are silently dropped whenever the user is on the other view.

**Dedicated channels for non-action signals.** UI status signals (connection state, sync indicators) get their own IPC channel (`remote:status-changed`), separate from the validated `remote-control:action` channel. Mixing status into an action-dispatch channel overloads a security-sensitive boundary.

**Dual mission broadcasting.** The host synchronises and broadcasts both Morning and Evening mission state (task checklist, whining detection, durations) at once, so the remote stays interactive for either phase regardless of which is globally active.

**Backward-compatible sync payloads.** When adding a new structured array (e.g. `missions`) to the realtime payload, build a fallback in the client from the legacy individual fields. An older host must not crash a newer remote, or vice versa.

## Components & hooks

**Extract reusable interaction hooks at the second use site.** Pointer logic (long-press, drag, swipe) used on 2+ elements becomes a hook immediately. `useLongPress(onShort, onLong, thresholdMs)` returns `{ onPointerDown, onPointerUp, onPointerLeave }` and centralises ref cleanup.

**Split large orchestrators by section.** When a dashboard component (e.g. `MainController.tsx`) crosses 300 lines because it renders several distinct sections, extract each section into its own component. Same for helper subcomponents inside a canvas file (`ShapeItem` out of `BlocksCanvas.tsx`).

**Hoist repeated resolution helpers.** `createLogEntry` resolved goal names from `REWARD_MAP` in 5+ places; a single `goalLabel(caseId, state)` helper at the top prevents drift.

**Defer synchronous `setState` in effects.** A synchronous `setState` in a `useEffect` body triggers React render-cascade warnings. Defer it (`setTimeout(() => setDisplay(null), 0)`).

**Keep impure calls out of the render path.** Extract functions calling `Date.now()` and friends to module scope, outside the component declaration.

**A `setState` updater may run more than once — schedule nothing in it.** StrictMode runs it twice in dev; in production a sync-lane update (a pointerup, even from a native window listener — React reads `window.event`) rendered ahead of a pending default/transition update is *replayed* on top of it. `useBlocksGame.placeShape` started the line-clear `setTimeout` in its updater, so one clear resolved twice (2026-09-18). Put the pending thing in state and schedule from an effect keyed on the committed value, with cleanup (`lineClear.ts` + the effect in `useBlocksGame.ts`). A timer whose update must beat the next input wraps it in `flushSync`, or a lift in the same frame is rendered on the old state first and replayed on the new one. The effect's key must stay the *same object* when nothing changed: an exploding row (4s) still read as "full", so every drop minted a fresh `PendingClear` and restarted the timer — one fact ("exploding") stored twice, and the check read the copy that still said "full".

**…and roll nothing in it either: seed outside, generator inside.** The same replay makes `Math.random()` inside an updater re-roll, so the two runs commit different state and the child sees the second one replace the first — the line clear's meteors landed in different cells (2026-09-18), and every deal `useBlocksGame` made inside an updater swapped the shapes in the tray after one drop (2026-09-23). Roll a `seed: number` outside and build `seededRandom(seed)` *inside*. Passing the generator itself is the trap: it is stateful, so the replay continues the sequence rather than repeating it and the symptom survives the "fix" — which is why `refillBank` and `resolvePendingClear` take the number, not an `Rng`. Test it by recording every committed frame in a layout effect and asserting both that more than one frame committed and that they are identical; a varied `Math.random` mock is what makes two independent rolls differ. See `useBlocksGame.deal-replay.test.tsx`.

**Shared time formatting.** Countdown / time-remaining math lives in a shared utility, not copy-pasted between panels and buttons.

## Games

**Decouple game modules from each other.** `games/quiz/` must not import constants from `games/snake/`. Pass props with sensible defaults (`totalLives`) so a module stays reusable across future games.

**Ref-based rAF loops.** Never put mutable game state in the dependency array of the effect driving `requestAnimationFrame` — it tears down and restarts the loop on each change. Store state in a ref and keep `[]` deps. (Also in `perf-learnings.md`.)

**Safe random placement on bounded grids.** Never use rejection sampling (`do…while`) to place an item on a grid that could be fully occupied — precompute the free-cell list and pick from it. O(grid) instead of potentially unbounded.

**`preventDefault` only when consuming the key.** Call it inside the branch that actually handles the key. Blanket prevention breaks accessibility tools and browser navigation during inactive game phases.

**Bounded look-ahead for game-over.** With refreshable fallback slots (e.g. the Golden Rescue shape), a deadlock check must verify that standard shapes *and* current rescue shapes *and* everything in the active pool cannot be placed. Checking less ends the game while the player still has moves.

**Pause idle timers during gameplay.** An auto-return/idle timer must consult game-active flags so it can't terminate an in-progress game.

## Time & dates

**Duration math across midnight.** Any duration from `startsAt`/`endsAt` `HH:MM` strings must handle the wrap: `if (durationMins < 0) durationMins += 24 * 60`.

**Local-timezone date keys.** Use a local formatter (`toLocaleDateString('sv')` or an explicit YYYY-MM-DD builder) for date comparisons rather than slicing an ISO/UTC string, which produces off-by-one errors across the UTC day boundary.

## Testing

**`IntersectionObserver` must be stubbed in Vitest.** jsdom doesn't implement it. The stub lives in `src/test/setup.ts`; anything adding lazy-loading depends on it.

**Do NOT clear localStorage to get rid of a mission overlay in E2E.** A cleared store falls back to the default windows (06:00, 19:00) and *starts* a mission inside them. Every launch goes through `e2e/helpers/launchApp.ts`, which takes the mission clock out of play (see 2026-09-21, "The E2E suite passed or failed by the time of day").

**Deterministic grid tests.** Grids that initialise randomly must have their target cells manually cleared to 0 inside `act()` before asserting on placement, or the test is flaky.

**Reproducing an updater replay.** `renderHook(..., { wrapper: StrictMode })` for the dev double-run; `startTransition(() => otherUpdate())` then the call under test, in one `act`, for the production rebase (a bare call is default-lane and just batches); a timer plus `fireEvent.click` in one `act` for "input before the timer's render". Count what reached *committed* state (a marker the mocked effect writes into the grid), not spy calls — StrictMode's discarded run increments a spy too. **Trap:** after any `fireEvent`, React's dev build writes `window.event` back and jsdom keeps it, so every later update *in that file* reads as sync and can never be replayed — a replay test after a click passes vacuously. `Reflect.deleteProperty(window, 'event')` in that suite's `afterEach`. See `useBlocksGame.line-clear.test.tsx`.

**Assert on visual tokens when counters are removed.** When a text counter (`x / y completed`) is replaced by visual tokens, assert on the count of the emoji element — remembering to account for header icons and button fallbacks in the expected number.

**Commit tests inside the active worktree.** New test files left untracked in the parent repo while working in a git worktree silently break suite parity.

## Workflow hygiene

**Clean up throwaway scripts.** Temporary scripts written to bulk-edit files must be deleted before committing. Run `git status` and read the exact staged file list.

**Stay in scope.** Fixing unrelated failing tests or type warnings in the same change clutters the diff and introduces unexpected failures. Note them separately.

**Attribute pre-existing failures explicitly.** When a suite has known unrelated failures, name them rather than letting them blur into "some tests fail" — otherwise the next person re-investigates them.

## 2026-08-19 — Shared userData is the hidden global: enforce a single instance

**Learning:** Four unrelated-looking symptoms — bank tokens vanishing and reappearing, activity-log
history missing, missions firing twice, the phone remote showing flapping values — were one bug:
`electron/main.ts` had no `app.requestSingleInstanceLock()`. Two instances share one userData
directory, therefore one renderer `localStorage`, therefore one `mc-state-v5` blob. Both write the
*entire* state on a 500ms debounce, so whichever instance writes last silently reverts the other's
work. The activity log lives inside that same blob, which is why the evidence of the corruption was
destroyed by the corruption. Both instances also join the same Supabase room, so remote actions were
applied twice into two diverging states.
**Action:** The single-instance lock is load-bearing, not hygiene — never remove it. More generally:
in this app userData is a *global mutable singleton* shared by localStorage, `config.json` and
`auth-store`. Any design that assumes "only one writer" needs that assumption enforced, not hoped for.

## 2026-08-19 — Restart-transient state must be reset in `loadPersistedState`, not spread

**Learning:** `loadPersistedState` builds its result with `{...initialState, ...parsed, ...}`. That
spread silently restores *every* field the persisted blob happens to contain, including
`snakeGameActive`. A game only exists while its overlay is mounted, so a crash or quit mid-game — or
a remote `START_GAME` arriving while the Calendar view was showing, where no overlay exists to close
it — left the flag `true` permanently. The phone remote read that flag and kept offering a "remote
game" for a game that was not running.
**Action:** Any state describing a *live, in-memory session* (a game in progress, an open overlay, a
transient animation) must be explicitly reset after the `...parsed` spread. When adding a field to
`MCState`, ask "does this survive a restart?" — if not, pin it in `loadPersistedState`.

## 2026-08-19 — E2E runs against a stale prebuilt bundle

**False positive: `npm run test:run` passing (or failing) tells you nothing about uncommitted work.**
`test:run` is just `npx playwright test`; the specs launch `dist-electron/main.js` directly and
nothing rebuilds it. A suite run can be exercising a build that is months old. Always
`npx tsc && npx vite build` before an E2E run that is meant to verify a change.

Related: the E2E suite runs against the developer's **real** userData directory, so specs that assume
default settings fail on a configured machine. `week-navigation.spec.ts` asserts the first day column
is today, which is only true for `weekStartDay: 'today'`; a machine set to `'monday'` fails 8 specs
across week-navigation, monthly-view, weather-modal and settings-power. These failures are
environmental, not regressions — check `%APPDATA%/gcal-simplified/config.json` before chasing them.

**Follow-up (same day):** the E2E suite is also *non-deterministic* under load. Three full runs on the
same code gave 8, 24 and 8 failures. The 8-failure result is the stable one and matches the
`weekStartDay: 'monday'` explanation; the 24-failure run took 17.7 min against the others' ~11 min
and every spec in it passed when re-run in isolation. Treat a single full-suite run as a weak
signal: before concluding "my change broke E2E", re-run the failing spec file on its own and compare
the *set* of failing specs against a baseline run, not the count.

Electron windows now run offscreen by default (`E2E_HEADLESS` in `electron/main.ts`, set for all
specs by `playwright.config.ts`; `E2E_HEADED=1` to watch). Before this, a suite run threw a
fullscreen window in the developer's face 44 times.

**The real fix, not yet done:** give each E2E launch its own `userData` directory. That would remove
the config pollution, the shared-`localStorage` interference and any single-instance lock contention
in one move. It is deferred because a fresh userData has no Google auth, so specs that expect a
signed-in Dashboard would need a seeded auth fixture first.

## 2026-08-19 — A declared invariant with no test is already broken

**Learning:** CLAUDE.md has declared the Mission Control isolation contract ("never import
from `src/components/`, `src/hooks/`, `src/utils/`") for months, and it was reviewed by hand every
cycle. The first time a guard was written for it
(`src/__tests__/mission-control-isolation.test.ts`), it found two live violations:
`PrivilegeCardButton.tsx` and `PrivilegesPanel.tsx` both imported `src/utils/timeUtils`. Nothing had
caught it because human review checks the code in the diff, not the rule across the whole tree. The
same session found the IPC whitelist (`preload.ts`) at 0% coverage and the single-instance lock
absent entirely — three declared-or-assumed invariants, none enforced.
**Action:** When a rule is important enough to write in CLAUDE.md, write the guard in the same
change. Source-reading structural tests (the `timer-registry.test.ts` shape) are cheap, fast, and
catch the class of bug that unit tests structurally cannot. `timeUtils` now lives in
`src/mission-control/utils/` — the fix was to move the file inside the boundary, not to relax the rule.

## 2026-08-19 — Test *categories*, not test *counts*

**Learning:** Six user-visible bugs shipped with 639 tests green and high line coverage on the very
files involved. The gap was categorical: the suite tested the happy path of each feature in
isolation and had essentially no negative tests (what must be refused), no lifecycle tests (restart,
resume, re-auth, clock jump), and no structural tests (invariants spanning two files). Coverage
percentage is blind to all three — and completely blind to a missing guard, which has no lines to
cover at all.
**Action:** For anything touching state, IPC, credentials or scheduling, cover all four categories:
happy path, negative, lifecycle, structural. The full analysis with the bug→missed-test table lives
in `docs/test-coverage-plan.md`; read it before writing tests for this repo.

## 2026-08-19 — Verify an OS-level guarantee against the real binary

**Learning:** The single-instance lock cannot be truly verified by a unit test — the mocked `app`
returns whatever the test says. A standalone script that launches the built app twice
(`scripts/verify-single-instance.mjs`) is the only real proof. Writing it surfaced two traps: (1) on
Windows, Electron is a GUI-subsystem binary, so main-process `console.log` does NOT reach piped
stdio without `ELECTRON_ENABLE_LOGGING=1` — without it the script sees empty output and cannot tell
a refusal from a crash; (2) if any other copy of the app is running (the user's everyday instance,
or an orphan from a previous run), the *first* spawned instance is the one that loses the lock and
every subsequent assertion is meaningless. The script now aborts with exit code 2 in that case.
**Action:** `node scripts/verify-single-instance.mjs` after any change to `main.ts` bootstrap. Kill
stray `electron.exe` first — `child.kill()` is advisory on Windows and leaves orphans holding the lock.

## 2026-08-19 — Guard the rules with four honest states, and ratchet what is already broken

**Learning:** Writing guards for CLAUDE.md's rules surfaced a problem the "just add a guard"
instinct misses: **two rules were already violated at scale**. Twelve files exceeded the 300-line
limit; raw hex appeared in 34 files across both apps. A hard guard for either would have failed the
build on day one and been deleted within the week. Meanwhile a third rule (reducer purity) turned
out to be violated in five places — the reducer read the wall clock via `new Date()`/`Date.now()`,
so identical input produced different output. That one only surfaced under load, when two calls in
the determinism test straddened a millisecond boundary.
**Action:** Rules now carry one of four states in `src/__tests__/rule-registry.test.ts`:
`guarded` (a test fails), `ratcheted` (already broken; frozen per-file, may improve, never regress),
`manual` (human judgement; an honest `manual` beats a fake guard), `unguardable` (cannot be caught in
principle — a *missing* guard has no lines to cover). The registry itself asserts that every named
guard file exists, that unguarded rules say what defends them instead, and that the unguarded share
cannot grow silently.

Three details that make ratchets work rather than rot:
1. **Per-file baselines, never an aggregate count.** A total-count ratchet lets a new violation hide
   behind an unrelated improvement elsewhere.
2. **Tighten on improvement.** If a file gets better, the guard fails until the baseline is lowered —
   otherwise a file could be split to 200 lines and quietly regrow to its old baseline.
3. **The failure message is the product.** It must say what to do and offer the pasteable baseline
   line. A ratchet that fails cryptically gets deleted.

The file-size ratchet caught its own author within the hour: fixing the reducer's purity added 14
lines to `mcReducer.ts`. The right response was to raise that one baseline entry with a comment
explaining the trade — which is exactly the reviewable act the mechanism is for.

**Also:** record per guard *how it was proven to fail* (`verifiedRedBy`). A guard nobody has watched
fail may not be capable of failing. Do this by hand — a mutation-testing framework is far more
machinery than this project wants.

**Snapshot guards need a freshness check.** `useRemoteControl.allowlist.test.ts` hardcodes the action
types the separate `mc-remote` repo sends. That snapshot cannot notice the other repo changing, so a
second test re-derives the list from the sibling checkout when it exists and **skips with a console
note when it does not** — a guard that fails for environmental reasons (CI, fresh clone) gets deleted.

**False positive: `preload.ts` exporting its whitelists.** They are exported purely so
`preload_contract.test.ts` can import real values instead of regex-parsing the file (a reformat or a
switch to double quotes would silently defeat a parser). No runtime effect. Do NOT flag as
unnecessary API surface.

## 2026-08-19 — E2E specs leave a live mission running, blocking every later spec

**Learning:** Two specs failed with `mc-mission-overlay ... subtree intercepts pointer events`. It
was not a regression — proven by reverting the suspect change and reproducing the identical failure.
Reading the live persisted state showed why: `activeMission: 'morning'`, `startedAt` ~11 minutes
earlier, `durationMins: 60`. A spec in `mission-control.spec.ts` activates a mission and never
deactivates it, and because the whole suite shares one userData directory, the resulting overlay
covers the UI for **every spec that runs afterwards — and for the next hour of runs**, since the
mission legitimately stays active for its full duration.

That is why the same spec passed 10/10 earlier in the day and failed 7/10 the same evening, and why
running it "in isolation" did not help: the polluting state was already on disk.

**Action:** When an E2E failure is a pointer-interception or visibility timeout in Mission Control,
check for a live mission before suspecting the diff — the app is behaving correctly, the fixture is
dirty. Any spec that activates a mission must deactivate it in `afterEach`. The durable fix is still
per-launch `userData` isolation.

**Also worth knowing:** the E2E suite mutates the user's REAL Mission Control state — the same
localStorage their child's app uses. A test run can leave a real mission running on the real app.
Do not treat that state as disposable; surface it rather than silently resetting it.

## 2026-09-07 — A window pointer listener with no `pointerId` filter belongs to every finger

**Learning:** The blocks game's drag attached `pointermove`/`pointerup` to `window` and acted on
whichever pointer fired. On the child's Windows touchscreen a second finger or a resting palm could
therefore steer a shape in flight and drop it at *its own* coordinates — the "it landed somewhere I
wasn't aiming" bug, which read as lag and was not. `pointercancel` was not handled at all, so a
cancelled touch (Windows palm rejection fires these constantly) froze the proxy on screen with the
tray slot still blanked. Neither is visible when testing with a mouse, which produces one pointer.
**Action:** Any drag built on window-level pointer listeners must record the `pointerId` from the
initiating `pointerdown` and ignore every event from another pointer, must handle `pointercancel` as
a cancel, and must place on the state the *preview* last showed rather than recomputing from the
lift coordinates (a finger rolls as it releases). If you refuse a second `pointerdown` while a drag
is live, add a way out — window `blur`, `visibilitychange`, or a `pointerdown` reusing the same id —
or a drag stranded by a release outside the window blocks every later grab until remount.

**Amendment (same day, from the review of PR 155): `setPointerCapture` is the primitive, and blocks
does not use it.** Capture gives by contract what the recovery trio above approximates: the element
keeps the pointer until release, and `lostpointercapture` is a single canonical "this gesture is
over" signal. Capture *retargets* rather than stopping propagation, so window listeners and the
`pointerId` filter both keep working unchanged — the filter stays load-bearing either way, because a
second finger still reaches `window`. Two facts that decide the trade: Chromium applies **implicit**
capture for touch, so the child's device is already covered by the platform, and the same-id reclaim
branch is therefore **mouse-only** — Chromium keeps one id for the mouse but issues a fresh id per
touch contact, so that branch can never match on a touchscreen. The reason it was not adopted is
cost, not merit: jsdom 28 implements no `setPointerCapture`, so it needs a stub, and this project
documents `src/test/setup.ts` as having exactly one global mock by design. Treat the trio as a
deliberate deferral, not as the pattern to copy into the next game.

## 2026-09-07 — Measure the browser's layout; do not sum the constants you declared

**Learning:** The blocks board declares `border: 2.5px` and `padding: 8px`, so the drag maths used
`BOARD_CONTENT_INSET = 10.5` against `getBoundingClientRect()`. Rendering the real board in Chromium
showed the border laying out as **2px**: border widths are snapped to whole device pixels, and at the
125%/150% display scaling common on Windows touch hardware it lands somewhere else again. Every
projection was half a pixel out, which is enough to flip the rounding for a shape sitting exactly on
a cell boundary. jsdom cannot see this — it returns whatever the test stubs, so a full green suite
proved nothing about the geometry.
**Action:** Derive layout geometry from the browser (`getComputedStyle` for used border/padding
values), keeping the declared constants only as a fallback for environments that report no layout.
Position a coordinate-critical overlay by reproducing the element's own box model — same border
width, same padding — rather than insetting by their sum, so the browser applies identical snapping
to both. **And prefer computed style to a child's `getBoundingClientRect`:** a rect includes CSS
transforms, so measuring a cell that is mid-animation (the line-clear explosion scales and rotates
cell 0,0 first) returns a box that is tens of pixels wrong, captured once and held for the whole
drag. When a geometry constant matters, verify it against a real browser at least once; a temporary
Vite harness that renders the component alone, with the app's real CSS, does it without touching app
state.

## 2026-09-10 — A grid item outranks an `auto` overlay, so the warning hid behind the problem

**Learning:** The blocks board's landing projection is an absolutely-positioned sibling of the grid
with no `z-index`. Every `GridCell` carries `zIndex: 1`. Because **`z-index` applies to a grid or
flex item without it being positioned**, and because neither the board nor its wrapper opens a
stacking context (both are `position: relative; z-index: auto`), the cells painted *above* the
overlay. This hid nothing in the common case — empty cells are `rgba(255,255,255,0.035)`, so the
ghost showed straight through them and the green preview looked perfect — but a *filled* cell is
opaque, so the red "you cannot place here" warning was invisible behind exactly the block that made
the placement invalid. Ten independent code-review angles missed it because the code is correct; only
the lens that asked "what does the child actually see" found it.
**Action:** an overlay that must read on top of a grid needs an explicit `z-index` above the highest
its items can take — and the guard should compare the two *rendered* values, not hardcode one side.
More generally: when a review's lenses all check correctness, at least one must check perception. A
warning that is computed correctly and never seen is not a warning.

**False positive: `ProjectionOverlay` reproducing the board's border and padding rather than
insetting by their sum.** Deliberate. A fractional border does not survive device-pixel snapping, and
only an identical border gets snapped identically; insetting by the sum drew the ghost half a pixel
out, which flips the rounding for a shape on a cell boundary. Do NOT "simplify" it to `inset:
BOARD_CONTENT_INSET`.

## 2026-09-10 — A shared test helper is a production file to the guards

**Learning:** Consolidating the blocks drag suites onto one shared kit (`blocks/dragTestKit.ts`, later
split to keep a DOM-free `dragFixtures.ts`) hit two traps that neither the rule nor the filename
suggests. First, `productionSources()` in `src/__tests__/helpers/sourceFiles.ts` excludes only
`*.test.ts(x)` and `.d.ts`, so a *helper* under a styled root is scanned by `style-token-ratchet` and
`file-size-ratchet` like any component. Copying the shape fixtures' hex colours into the kit would
have failed the build as a **new** violation, and a baseline entry for a file created that day would
be exactly the lie the ratchet exists to prevent. Second, `react-refresh/only-export-components` lints
`.tsx` only, and there it treats a capitalised export initialised by a call (`DOT = fixture(...)`) as
a component, then flags every lowercase helper beside it. Literal and arithmetic constants are exempt
under this repo's `allowConstantExport`, and an `export *` draws a warning of its own.
**Action:** Keep a test kit `.ts`, render with `createElement`, and derive fixtures from the
production source (`SHAPE_POOL` / `HELP_SHAPES`) instead of retyping literals. That satisfies the
ratchets *and* removes the drift the kit exists to prevent: gesture-defects had been measuring the
board's content box from the 8px padding alone, ignoring the 2.5px border, and nothing failed — **a
stale geometry constant does not break a test, it quietly re-points it at a board that does not
exist.** Split DOM-free fixtures from render helpers, or a pure-maths suite loads the whole
component tree. The same blindness runs the other way: nothing stops production code importing a
kit. A bare `import 'vitest'` in the kit looked like a tripwire, but vitest declares
`"sideEffects": false`, so a build drops it and the fixture ships silently. A bundled package's own
import is never a guard; `src/__tests__/test-kit-boundary.test.ts` reads the imports instead.

## 2026-09-10 — A test on an open board proves nothing about a placement rule

**Learning:** The Space Rescue dealer rewrite shipped 24 green tests, and mutation testing found
three of them vacuous — including the one guarding the exact bug the rewrite existed to fix. All
three shared one cause: the fixture board had 46+ free cells of 64. On a board that open, every
shape fits, every pair co-fits, and the first candidate in the list happens to complete a line, so
deleting the clearing bias, the shuffle and the entire co-placement engine changed nothing any
assertion could observe. A second trap sits one step further in: on a board tight enough to
discriminate, filling the last gap in a row COMPLETES it, the line clears, and the board hands back
eight free cells — so a "full board minus one pocket" fixture silently becomes an open board the
moment the code under test places anything.

**Action:** For any rule about placement, fit or space, build the fixture to make exactly that rule
observable, and give the fixture its own guard test. Two rules to follow concretely:
- Scatter isolated single free cells so **every row and every column has a hole**. They stop lines
  being complete (or completable) without adding placements, since the smallest pool shape is 3
  cells. `dealer.test.ts`'s `horizontalCorridor` / `fourRunAndThreeRun` are the worked examples.
- Assert the discriminating property of the fixture itself (`canBothBePlaced(board, BAR4, BAR4)`
  must be `false`), so loosening the board fails loudly instead of quietly gutting the suite.
Prefer a **frequency** assertion over set membership for anything shuffled or probabilistic: the
shuffle guard passed while slot 0 held the gift in 1672 of 2000 deals, because it only asked whether
the gift ever appeared elsewhere. Measure the mutant, then set the threshold between the two numbers
and write both into the test comment.

## 2026-09-10 — Enumerating orientations silently re-weights a shape pool

**Learning:** Replacing a random `transformShape` with an enumeration of each shape's distinct
orientations fixes a real bug (shapes were verified to fit in one orientation and dealt in another),
but drawing uniformly over the resulting candidate list is NOT the same distribution as drawing
uniformly over shapes. Orientation counts differ by shape: an L tetromino has 8, a T has 4, a bar
has 2, a 2x2 square has 1. At level 0 that turns a flat 14.3% each into L 38% and square 4.8% — a
difficulty increase nobody asked for, in a game for an eight-year-old. It also discards the pool's
own hand-tuning: `SHAPE_POOL` lists the trominoes and bars twice each, which is how the easy shapes
were given double odds.

**Action:** When a set is expanded into variants, draw the **entity first, then the variant**
(`pickCandidate` in `dealer.ts`). Any flat draw over an expanded list inherits the expansion's shape
as a weighting. The same trap bit the pair search: walking a shuffled group list in nested-loop
order always tests `(first, first)` first, which on an open board succeeds immediately and deals two
copies of the same shape every round — shuffle the PAIRS, not the groups. `dealer.test.ts` pins the
distribution at a max/min spread under 1.6 (the flat draw gives 3.5).

**Also worth knowing:** string cell keys (`` `${r},${c}` ``) in a per-anchor hot loop cost ~4.5ms per
deal, on the drop path. Numeric keys (`r * GRID_SIZE + c`) plus a short-circuiting `canCompleteLine`
took it to ~1.1ms p50 / 3.2ms p99 on a real layout.

## 2026-09-10 — Coupling by coincidence: ask who relied on the OLD input

**Learning:** The blocks replenish deal used to plan against `gridCopy`, the grid that still has
`CELL.CLEARING` (4) painted on it for 1200ms. That looked like a bug — it deals around lines that
are about to vanish — so it was changed to deal against `withClearsDrained(gridCopy)`. The fix was
right, and it silently broke something a room away: the game-over effect in `useBlocksGame.ts` reads
`state.grid`, the PAINTED one. While those two were the same object, a dealt shape was guaranteed
placeable on the grid the effect judged, so the effect could not false-fire. Nothing declared that
invariant; it held by coincidence. After the fix, on a board whose only free region is the line just
cleared, the freshly dealt hand does not fit the painted grid, the effect calls game-over mid
explosion, and there is no way back — it early-returns once the phase is no longer `playing`, so the
1200ms timeout that would have opened the board never gets to matter. Measured on a tight fixture:
~88% of such clears ended the game.

**Action:** When a fix changes what a value is computed **from**, the question is not "is the new
input better?" but **"who else was relying on those two things being the same object?"** Grep the
other readers of the old input before shipping. Concretely for this game: nothing may judge the board
while a clear is pending. PR 161 made that explicit — the game-over effect returns early on
`pendingClear`, the clear's own state — which is the right signal. Scanning the grid for exploding
cells is the weaker substitute this entry originally prescribed: it infers the state from paint.

**Also worth knowing:** all five game-over tests of the time set up a pre-jammed board with no clear
in flight, so none of them could see this — CLAUDE.md's "negative" category was missing: the tests
covered *when the game should end* and never *when it must not*. PR 161 fixed the same bug
independently and added that test (`useBlocksGame.line-clear.test.tsx`, "completing lines in the
last free cell is not game over").

**Follow-up (2026-09-21):** the drained-board deal that exposed this coupling was itself replaced —
see "Act on the state change, not on a forecast of it" (2026-09-21). The coupling lesson stands independently of that.

## 2026-09-12 — Converting a drag test to touch: move the finger, not the expectation

**Learning:** Space Rescue floats a touch-dragged shape `TOUCH_LIFT_PX` (1.5 board cells) above the
finger and projects the ghost from the shape. Most drag suites sent no `pointerType`, so forcing
`lift: 0` in `useShapeDrag.ts` left every one of their tests green — the child's only real input
path was invisible to them. The obvious conversion (keep the finger on `cellCentre(r, c)`, shift the
expected row) is a trap: a half-cell lift leaves the shape on an exact `.5` boundary, so the
expectation would pin `Math.round`'s tie rule rather than the gesture. And not every touch test
observes the lift at all — a test that never drops a shape (a foreign pointerup or pointermove, the
owner's own pointercancel) cannot be turned red by a lift mutant, and saying it was would be a false
proof. The same subjects tested *through* a drop (a refused second grab, a foreign pointercancel
mid-drag) do observe it.
**Action:** Convert with `fingerBelow(r, c)` from `dragFixtures` (the finger sits `TOUCH_LIFT_PX`
lower, which cancels the lift whatever it is tuned to, off-centre aims included) and keep every
`expect` byte-identical. Prove the conversion is *selective* with one `lift: 0` run — the RED set
must equal the anchor-bearing conversions exactly — and prove the lift-free ones still bite with a
mutant of the rule they guard (drop the `pointerId` ownership check, no-op the cancel handler), run
before and after so the kill sets can be compared. A colour-only ghost precondition is not a
position check: on an empty board every cell is green, so a lift regression slips past it and fails
later under the wrong message. Convert a test when its defect only exists on touch or its anchor is
reached through the lift; leave pixel-literal geometry and pointer-agnostic refusals on the unlifted
path.

## 2026-09-12 — A brief's "false" premise may be true on a branch you haven't looked at

**Learning:** The dealer brief said `canPlaceShape` had been replaced by `isPlaceable` in
`placement.ts`. Checked against `main` and this branch's ancestry, neither existed, so the session
reported the premise as wrong. It was true — on PR 155's unmerged branch, whose description is where
the brief came from. The miss cost a same-path collision (two incompatible `placement.ts` files) that
surfaced only at code review, instead of shaping the design from the first hour.

**Action:** Before calling a brief's premise false, look beyond the checked-out branch:
`git log --all --oneline --grep=<symbol>`, `git log --all -- <path>`, `gh pr list --state open`, and
the other worktrees under `.claude/worktrees/`. If the premise holds somewhere else, say *where*, and
treat that branch as the base the work will eventually have to land on.

## 2026-09-13 — A rule with two halves was `guarded` on one; a tsconfig `exclude` is inherited

**Learning:** The registry marked "no `any`, no `as unknown as`" as `guarded` by `.eslintrc.cjs`, but
its `verifiedRedBy` only ever proved the `any` half. Nothing in the lint config could see a double
assertion; 38 had accumulated. Checking it turned up a bigger hole: `npm run tsc` type-checks
**no** `src/**/*.test.ts(x)`. tsconfig.json excludes them, and `tsconfig.test.json` overrides
`include` but not `exclude`, so it silently inherits the exclusion (`tsc --listFilesOnly` proves
it). 24 type errors were hiding there, including `vi.Mock` used as a type, which vitest 3 doesn't export.
**Action:** A `verifiedRedBy` must prove *every clause* of the rule it guards, not just one. To ban
syntax, prefer an AST `no-restricted-syntax` selector over a grep ratchet: it ignores prose and
strings. Prove the selector with a probe file of should-flag and must-not-flag shapes. Before
trusting a tsconfig for coverage, run `tsc --listFilesOnly -p <config>`: `extends` carries
`exclude` along even when `include` is overridden.
A config file named as a guard only proves the file exists; the registry cannot tell a deleted
rule from a live one. Guard a lint rule with a test that lints a probe through the real config
(`src/__tests__/type-laundering-guard.test.ts`), with cases that must and must not be flagged —
then sweep every file the linter checks with `calculateConfigForFile` and assert each resolves the
rule exactly as the probe did, and that none is ignored. An eslintrc `overrides` block *replaces* a
rule's options for the files it matches, so a hand-picked set of probe paths only covers the globs
someone thought of: seven paths stayed green while the rule was off for 73 Mission Control tests.

## 2026-09-18 — Correcting a test's input numbers can silently remove what it catches

**Learning:** The kit "corrected" gesture-defects' drifted cell centres from 1.95 cells to exactly
2.0. Every assertion stayed identical and every test stayed green, yet two guard tests stopped
catching a floored snap and a grab offset by a whole cell instead of half: at a whole cell, those
mutations land on the same anchor. The drifted constant had been the stricter one, by accident. No
single aim catches everything either — at 0.75 a floor or an over-subtracted offset moves the shape a
full cell, but a *dropped* offset moves it toward the next cell and still rounds back.
**Action:** When a refactor changes the numbers a test feeds in, even to correct them, identical
assertions are no evidence: run the same mutations against the file before and after. Aim
coordinate tests off-centre on purpose (gesture-defects' `OFF_CENTRE`), and name which suite owns
each mutation that aim cannot see.

## 2026-09-18 — A gesture's window listeners read what changes mid-gesture through a layout-synced ref

**Learning:** The drag's window listeners are subscribed in a passive effect and closed over
`placeShape` and the projection function, both rebuilt on every grid change. They stay stale until
the passive flush, and after a commit from a timer that flush is a separate scheduler callback, so a
render that overruns the ~5ms slice lets a native move run first; the stale ghost it draws stands
until the next move. The gap is narrower than it first looked: a layout-effect `setState` (the
recompute changing the ghost) is synchronous, and it flushes the pending passive effects before the
task ends. So a still finger through a clear was always fine; the real failure was a move onto a
cell that changed while the ghost did not. The first regression tests, and the first write-up,
modelled the still-finger case: when the commit also queued a synchronous update, dispatching from
a parent's layout effect reaches a point no native event can. No test had moved the pointer inside
the gap, and the kit's stable, always-accepting `placeShape` spy hid the `placeShape` half.
**Action:** A listener that spans a gesture (drag, long-press) and consults state that changes
during that gesture reads it through a ref synced in `useLayoutEffect`. A `keydown` handler that is
one flush stale does no harm and needs none of this. Before writing a timing test, check the
scenario can happen with real events: a mid-commit harness proves ordering, not reachability. Test
with a collaborator shaped like production's (new identity per input, real validation).

## 2026-09-20 — A test kit's oracle comes from what is drawn, not from what the code reads

**Learning:** `dragFixtures`' `cellCentre` computed the expected cell with `BOARD_CELL_PITCH` — the
constant `dragGeometry` divides by. Nothing renders with it: `BlocksGrid` lays the board out from
`CELL_DISPLAY_SIZE` and `BOARD_GAP`. So the kit followed the code under test rather than the board
the child sees, and the suites it replaced had been stricter by accident, each with its own literal
`52`. That is a tautological oracle — expected value and code computed the same way, so a wrong
formula agrees with itself — and it is the failure mode a *derived* kit invites, in exchange for the
drift it removes. Mutating the pitch, of 45 drag tests:

| drift | kit shares the constant | kit derives its own |
|---|---|---|
| +1px | 0 red | 0 red |
| half the gap (−2px) | 0 red | 1 red |
| the gap dropped (−4px) | 2 red | 7 red |

**Deriving strictly improves detection, and does not make it complete.** A wrong pitch only shows
once the accumulated error crosses a rounding boundary, so on an 8-cell board a 1px drift is
invisible to both. Whoever wants that caught needs a test that aims far from the board origin (the
lift suite's `BOARD_BOTTOM` aim is the one that does) or one that reads the DOM's own geometry.
**Action:** When consolidating literals into derived constants, ask of each one: does production
*render* with it, or only *compute* with it? Only the first is an honest source for an expected
value; derive the rest from the rendering constants, even when that means restating the arithmetic
the code happens to use. Still open by the same argument:
`useShapeDrag.contract.test.tsx`'s `SNAPPED_FINGER` and `dragGeometry`'s `TOUCH_LIFT_PX` bounds are
both expressed in `BOARD_CELL_PITCH`.

## 2026-09-21 — A synchronous test that times out is slow, not hung, and the first test pays for the file

**Learning:** `RescueSlot.refresh-gate`'s first test (a render and one assertion) timed out at 5s
under CPU contention. It was not a bad test. It was the most expensive *first* test in the suite.
Vitest isolates each file in a fresh worker, so test #0 pays every cold start the file triggers.
Measured with an inspector-profiled probe:
- **The render is dominated by jsdom, not React.** About 60% of rendering `BlocksCanvas` cold is
  jsdom 28's CSS engine (cssstyle, css-tree, @asamuzakjp/css-color) parsing every inline `style`.
  That costs 185ms alone and 680ms in a normal full run, against 60ms / 200ms warm.
- **`getByRole` has a fixed cold start.** Its first call cost ~100ms (370ms in a full run), and
  scoping it to a 6-element subtree cost the same. The price is the role and accessible-name
  machinery warming up, not DOM size.

In a normal run all seven kit suites' #0 sat at 1.1–1.3s. With three runs sharing the machine they
reached 3.3–5.9s, and the one that failed first in the repro was `BlocksCanvas.test.tsx`, which has
no role query at all. Fixing refresh-gate's query alone would only have moved the flake to a
neighbour. Also: Vitest checks a synchronous test's timeout *after* it returns (it cannot interrupt
it), so for sync tests the timeout is a post-hoc speed limit with no hang detection to lose.
**Action:** Remove the avoidable cost: refresh-gate queries `getByText(/refresh/i, { selector:
'button' })` (under 1ms; `selector` keeps the real-`<button>` half of the contract). For the cost
that is inherent (cold canvas render in jsdom), every suite importing `dragTestKit` sets
`vi.setConfig({ testTimeout: CANVAS_SUITE_TIMEOUT_MS })` (15s). `dragTestKit.timeout.test.ts`
enforces it, because a suite that forgets goes green alone and flakes only on a busy machine.
Contended repro (3 concurrent full runs): 9 runs before had 1 kit failure; 12 runs after had 0 kit
failures, and the timeout is what carries that: `useShapeDrag.contract` #0 still took 5836ms, a fail
at the old 5s. The whole run was *not* clean: 2 of the 12 failed in `electron/main_single_instance`
(async `await import('./main')` stalling to exactly 5s, where the timeout really is hang detection;
out of scope, not caused here). Refresh-gate #0 fell from median 3179 to 1449ms, but the after
rounds were lighter (untouched kit suites fell 13-38% too), so not all of that is the query. The
timeout holds only as a top-level `vi.setConfig` declared before the first test: Vitest fixes a
test's timeout when `it()` is collected, so the same line in a `beforeAll`, or below a top-level
`it()`, silently does nothing for that test (the guard checks for both).
To diagnose a timing flake,
rank per-test durations from `--reporter=json` across runs: pass/fail counts at a 1-in-6 flake rate
prove nothing either way. The render cost itself only falls if the inline styles move into CSS
classes, which is the same backlog as the raw-hex ratchet. **Trap when mutation-testing a timeout:**
check the runner's own output, not a hand-rolled JSON filter. Mine reported "0 timed out" while all
45 tests had.

## 2026-09-21 — The E2E suite passed or failed by the time of day

**Learning:** Same commit, same evening: 45 of 45 passed at 18:00, 30 failed from 19:02, 13 at 20:03.
The mission scheduler runs on the wall clock and `MissionOverlay` is mounted on both views, so a
launch inside a mission window (default evening 19:00–20:00) covered the app and every click timed
out. After 20:00 the dev profile still had that mission *running*, resumed from an earlier launch,
so the real-profile specs kept failing. Per-launch profile isolation did not help: a fresh profile
gets the default windows, and `week-display-customization`'s `localStorage.clear()` (added to get rid
of an overlay) put the store back on those defaults, which *started* one. Three non-obvious facts
shaped the fix. (1) Playwright's Electron loader releases the app's `ready` inside
`electron.launch()`, so the first document mounts before any test code. Nothing, not even
`context().clock`, can be installed ahead of it. (2) Writing the blob while the app page is loaded
races the store's debounced 500ms persist. `?lab=1` is store-free but stripped from the production
build E2E runs. Every `file://` document shares one localStorage (verified: a blank page in the
scratchpad read the app's `mc-state-v5`), so a checked-in `blank.html` is a store-free page in the
same window. (3) The scheduler reads `missions[].startsAt/endsAt` and skips a phase whose
`lastCompletedOrFailed*Date` is today. But `SET_SETTINGS` re-derives those windows from
`settings`, and `MCStoreProvider` dispatches it at mount whenever the profile has remote pairing
keys. Seeding only `missions[]` lasts a moment (a review cycle first read that case and missed
it). Moving windows would also have been undone; marking the day concluded is not.
**Action:** Launch only through `e2e/helpers/launchApp.ts` (guarded by
`e2e-launch-chokepoint.test.ts`). It hops to `blank.html`, clears any running mission, and marks
today's missions concluded. That touches 4 fields, needs no HH:MM math, and self-heals at midnight
if a run is killed. On the real profile it puts those fields back on `close()`, and specs take
`test` from `launchApp.ts`, whose teardown closes whatever a failed or timed-out test left open.
A spec that tests missions starts one after launch. To reproduce clock failures on demand, use
`E2E_SIMULATE_MISSION_WINDOW=1`, not the wall clock. It logs one line per launch, because the first
full run with it was indistinguishable, by timing, from a run without it.

## 2026-09-21 — Act on the state change, not on a forecast of it

**Learning:** To stop the Space Rescue refill being planned around lines about to vanish, the deal
was pointed at a forecast of the board with the exploding cells already drained. Two review lenses
independently found what that bought: for up to 1.2s the child held a shape whose only room was the
line still exploding, so it was refused at every position — worst in the last few hundred ms, when
the explode animation had already shrunk those cells to visible holes that still refused. Then the
clear resolved and its meteors could land in the very space the hand was dealt for. The forecast was
right about the lines and wrong about everything the resolution does besides (meteors, satellite
blast, electricity), and the child acted during the gap between promise and reality.

**Action:** when an action depends on a state change that is already scheduled, run it *inside* the
code that performs the change, against the result — not earlier against a prediction. Here: an
emptied slot stays empty while a clear is pending, and the clear's resolve updater deals it against
the board it leaves behind (`refillBank` in `useBlocksGame.ts`). The price is visible and honest (an
empty tray during the explosion); the forecast's price was invisible and felt like the game being
wrong. If that code runs in a state updater, draw its randomness from a seed rolled outside it, the
same way the meteors are.

## 2026-09-21 — A gate is the configs a script *runs*, not the configs that exist

**Learning:** Closing the 2026-09-13 hole took two changes, not one. `tsconfig.test.json` needed its
own `"exclude": []`, and `npm run tsc` had to actually run it: `vitest.config.ts` had pointed its
`typecheck.tsconfig` at that file all along, but only `vitest --typecheck` reads it, and no script
does. A correct config nothing invokes guards nothing. The test config's relaxed
`noUnusedLocals`/`noUnusedParameters` was not load-bearing either: switched back on, it caught five
unused `import React` lines (dead under `jsx: react-jsx`; ESLint misses them because
typescript-eslint counts `React` as used whenever the file has JSX).
**Action:** Guard coverage from both ends: parse the npm script for the configs it runs, then
resolve those configs through `ts.parseJsonConfigFileContent` (handles `extends` exactly as tsc
does, in milliseconds) and assert every `.ts(x)` under the checked roots is in the union
(`src/__tests__/typecheck-coverage.test.ts`). Make the guard fail loudly on a shape it doesn't
model (`tsc -b`), and add a case that fails if the file walk comes back empty, so it can't pass
vacuously. It shares the job with PR 160's `typescript-strict-config.test.ts`, one question each:
that guard *pins* the script and owns strictness and `@ts-nocheck`; this one *parses* the script and
owns coverage. A new tsc step therefore edits the pinned `TSC_SCRIPT` there and nothing here.
The review of that split found the rest, and each one generalises. **Two constants that must agree,
where only one is asserted, is a latent lie**: the pinned script and the hand-written config list
were exactly that, so the list is now derived from the pin by a shared parser
(`helpers/tscScript.ts`). **A coverage guard keyed on a list of source roots cannot see a new
root** — walk the repo and keep an explicit list of what is knowingly unchecked, the way the
ratchets do; a probe `shared/thing.ts` proved the old shape blind. **`skipLibCheck: true` means a
.d.ts is compiled but never checked**, so counting one as covered overstates the gate. And a
source scan must read files the way the compiler does: `readFileSync(f, 'utf8')` decodes neither
a UTF-16 BOM nor strips a UTF-8 one, so a `// @ts-nocheck` in a UTF-16LE file — what Windows
PowerShell 5.1 redirection writes — was honoured by tsc and invisible to the scan until it moved
to `ts.sys.readFile`. Every other source-reading ratchet in `src/__tests__/` still has that blind
spot.
