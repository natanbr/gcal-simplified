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

**Clear localStorage in E2E `beforeEach`.** Stale Mission Control state (an active mission) bleeds across Electron runs and mounts a blocking overlay over the calendar UI. Explicit `localStorage.clear()` guarantees a clean slate.

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
