# Performance — Idle Budget & Regression Guards

**Core rule:** when the user is idle on the **Calendar view**, the app must do almost nothing. Because `MCStoreProvider`, `MissionSchedulerBridge`, `RemoteControlBridge`, `MissionOverlay`, and `MoodWindNotification` stay mounted on both views (`src/App.tsx`), any un-gated Mission Control background work also runs while the user is on the Calendar.

## What runs while idle on the Calendar (the budget)

Renderer timers that are allowed to fire on an idle Calendar (kept intentionally small — enforced by `src/__tests__/timer-registry.test.ts`):

| Timer | Cadence | Why it's OK |
|---|---|---|
| `Dashboard.tsx` data refresh | 5 min | Calendar needs fresh events/tasks/weather. |
| `useCurrentDate.ts` | 60 s | Midnight rollover; bails out (no re-render) unless the day changed. |
| `useTheme.ts` | 60 s | Time-based light/dark; bails out unless the theme changed. |
| `useBehaviorHeartbeat.ts` | 60 s | Mood-progress accrual. **Idle-optimized:** `mcReducer` returns the *same* state ref when nothing accrues (night / out of active window / gauge held full at the 5-token cap), so idle ticks cause no re-render and no persist. |

Everything else (mission expiry poll, live clock, game loops, privilege countdown) is gated to an active mission / open game / the Mission Control view and does **not** run on an idle Calendar.

Event-triggered network work from the always-mounted MC tree (no timer): `useSchoolCalendarSync` (mounted in `MCStoreProvider`) invokes `auth:check` then `data:events` in strict mode — one Google Calendar read plus the (cached) holiday feed — on launch, when a mission ends, on `system:resume` and on `auth:success`; never while a mission runs and never on ordinary state changes (pinned by `useSchoolCalendarSync.test.tsx`). A changed answer is one store write; an unchanged one returns the same state.

Main process (always-on by design, independent of view — `electron/`): the Supabase Realtime WebSocket (remote control), a 60 s power-policy check (`main.ts`, can spawn a screen-off command when idle in the sleep window), a 60 s de-dup cleanup, and a 4 h auto-update check.

## Fixes applied (2026-07)

Root cause of the reported "CPU waking up on the Calendar view":

1. **`useMissionScheduler` 15 s expiry poll ran unconditionally** — even with no mission active it woke the main thread 4×/min. → Gated on `activeMission !== 'none'`; no interval exists while idle.
2. **Behavior heartbeat churned state every 60 s** — each tick created a new store object → re-render of all `useMCState` consumers + a `localStorage` write + a remote broadcast, even at night. → `applyBehaviorSync` now returns the same reference when nothing accrues; only advances during active hours.
3. **Dashboard "Syncing…" bar animated `width` forever** — the wrapper only faded to `opacity: 0` (never unmounted), so an infinite, layout-driven CSS loop ran continuously. → Animation classes are applied only while actually syncing.

## Fix applied (2026-09-22)

- **`useMissionScheduler` re-fired every second inside an open mission window**, running or not, on the Calendar view too: after each fire it re-armed at the window it had just handled (about 2 timers/s for up to 90 min a day). `timer-registry.test.ts` cannot see it, because it was a self-rescheduling `setTimeout`, not a `setInterval`. → The scheduler now aims at the next occurrence once today's has run (`Mission.lastActiveAt`, stamped at every start and end of a run), and never at an open window while any mission is running (the run ending re-arms it once). Pinned by `useMissionScheduler.stop.test.tsx` and `useMissionScheduler.early-start.test.tsx` (no timer armed in 10 s once the occurrence has run, while a mission started before its window runs into it, or while the other phase's mission blocks it), and by the named idle guard `idle-performance.test.tsx` (same assertion inside a handled window, while another mission runs, and outside every window).

## Fix applied (2026-10-04): Mission Control's idle main view

Mission Control's main view is an idle screen too: the child's touchscreen sits on it until it returns to the Calendar by itself (5 min, `useMCAutoReturn`). Release QA for v0.0.44 measured it at 19.5 % of one CPU core (v0.0.43 the same). The cause was the Remote dot's `mc-remote-pulse`, a 2 s `transform` + `opacity` loop marked `infinite`, whose comment called a compositor-driven loop "safe".

How it was measured (and how to measure again): the built app on a throwaway profile (`createIsolatedUserData()`), 1280x720 at `--force-device-scale-factor=1.5`, shown with `showInactive()`, calendar data mocked, remote online. CPU is the delta of `app.getAppMetrics()` `cumulativeCPUUsage` (CPU seconds) over the window, reported as % of one core; not `percentCPUUsage`, which on this Electron is a share of the whole 12-thread machine. Survey: one launch, a fresh `?mc=1` per variant, 25 s settle, 90 s measured.

| Variant (pre-fix build) | % of one core |
|---|---|
| As is: the dot loops inside the status brow | 25.4 (26.5 repeated at the end) |
| Dot still (`animation: none`) | 0.4 |
| Loop, every `backdrop-filter` off | 17.4 |
| Loop, only `.mc-brow`'s `backdrop-filter` off | 18.4 |
| The same loop on a dot in a corner, no backdrop-filter above it | 22.4 |
| Opacity-only loop, in the brow | 27.0 |
| Opacity-only + `will-change: opacity`, in the brow | 25.0 |
| Opacity-only + `will-change`, in a corner (the cheapest loop) | 12.9 |
| 3 pulses, then still (the fix), after they ended | 0.3 |
| `.mc-notification-dot` loop (on screen at most ~10 s per cheat attempt) | 23.4 |
| Cheat-trap finger wag over its 4 px blur overlay (5 s per show) | 40.3 |

**Root cause.** A loop makes Chromium produce a frame on every vsync for as long as the element is on screen: 59 frames a second in the trace, each drawn by the renderer's compositor thread, aggregated and drawn by viz and presented by the GPU process (DXGI swap chain). "Compositor-driven" removes the per-frame main-thread work (style, layout, paint), not the frame: the renderer's main thread ran about 15 frame updates a second in every looping variant, against 59 drawn frames, and the GPU process carried about 80 % of the bill. So the dot was not the problem as an element (with the brow's blur off it had its own layer, reasons "active accelerated transform/opacity animation"); the loop was. Its parent made it worse: `.mc-brow` is a composited layer of its own ("Has a backdrop filter", 1920x108 device px), and with that blur on, viz draws two render passes per frame instead of one, redrawing the brow's 8 px backdrop blur 59 times a second: 25.4 % against 18.4 % with only that blur removed, about a quarter of the cost. Changing the property or promoting the layer did not help (25-27 %), and the cheapest loop measured (12.9 %) is still far above the Calendar's idle level, so the loop had to go.

**Fix.** The dot pulses 3 times (6 s) when the remote's status changes (connected, offline), then stands still at full opacity; its colour carries connected (green) versus offline (red). `RemoteIndicator` keys the dot on the status, so each change remounts it and the finite CSS animation plays again. The other loops on the main view only appear while something happens (a cheat attempt clears within about 10 s) and stay.

5 minutes idle, measured the same way (the auto-return held off with a window `keydown`, the view checked at the end):

| | Before (cb2d1f2, v0.0.44) | After |
|---|---|---|
| Mission Control main view, 1280x720 at 150 % | 24.4 % (GPU 19.0, renderer 5.2) | 0.49 % (GPU 0.19, renderer 0.17) |
| Calendar, default window | 0.19 % | 0.19 % |
| Mission Control memory, first → last sample (peak) | 517 → 505 MB (529) | 500 → 491 MB (517) |

Whole-machine CPU during the runs (other work on the machine, not controlled): 20 % for MC before, 8.6 % for MC after, 9.3 % and 7.9 % for the Calendar runs. QA's numbers on a quiet machine were 19.5 % (MC) and 0.2 % (Calendar).

**Guards.** `src/__tests__/infinite-animation-registry.test.ts` and the render case in `idle-performance.test.tsx` (see below).

**Open.** `.mc-brow`'s `backdrop-filter: blur(8px)` blurs a backdrop that never moves, yet it adds a render pass to every frame anything in the brow changes (the 1 s clock included, at 1 frame a second). Removing it is a visual decision, not made here.

## Live HUD (`src/components/PerformanceHud.tsx`)

An always-on, bottom-right readout mounted at the App root (`src/App.tsx`) — visible on **both** views and during games. Colour is the primary signal (green → yellow → orange → red):

- **FPS** — frames/sec (drops when the main thread is busy).
- **JANK** — worst single frame time (ms) in the last second; the clearest "did the UI hitch/freeze" signal.
- **MEM** — JS heap in use (MB), coloured by fraction of the heap limit (watch it climb → leak).

It intentionally runs one `requestAnimationFrame` loop (the only always-on loop on the Calendar) and pushes to React state just once per second, so its own overhead is negligible. It never intercepts clicks (`pointer-events: none`). Escape hatch: `localStorage.setItem('perf-hud','off')` + reload.

## Regression guards (run in `npm run test:unit`)

- **`src/__tests__/timer-registry.test.ts`** — scans `src/` for `setInterval`; fails if one appears in an unregistered file, and caps how many timers may run on an idle Calendar. Adding a timer forces a conscious, reviewed registration.
- **`src/mission-control/__tests__/idle-performance.test.tsx`** — asserts the scheduler creates no interval while idle, and that the heartbeat is a no-op (same state ref) at night / out of window. Since 2026-10-04 it also renders Mission Control's main view (remote online, no mission, no game) and fails if any element on it matches a looping CSS rule from `mc.css` / `mc-short-screens.css`, carries a Tailwind looping class, or has an inline `infinite`.
- **`src/__tests__/infinite-animation-registry.test.ts`** (2026-10-04) — scans `src/` for every looping animation (CSS `infinite`, Framer `repeat: Infinity`, WAAPI `iterations: Infinity`, Tailwind `animate-spin/ping/pulse/bounce`, an inline `infinite`) and fails on one that is not registered with when it is on screen, or whose count per file changed. The idle-view budget is 0: nothing registered may run on the idle Calendar or Mission Control's idle main view.
- **CLAUDE.md → Performance checklist** — the per-feature self-review (timers, Calendar-idle impact, infinite animations, store-write cadence, effect cleanup).

## Backlog / optional next steps (not yet done — need a decision)

Done 2026-08-20 (reading-practice change): **`behaviorProgress` dropped from the remote-sync
dependency list** — it still rides every broadcast's payload, but no longer *triggers* one, so the
per-minute mood drip (and, new, every answered quiz question) stops pushing Supabase messages.
Related invariants added in the same change: `skillProgress` never enters the broadcast
(`skill-progress-boundaries.test.ts`), and `createLogEntry` short-circuits unlogged action types
before its speculative reducer run, so per-answer recording pays the reducer once, not twice.

- **Gate the main-process 60 s power-policy interval** (`electron/main.ts`) so it only runs when a sleep window is configured, instead of always.
- **Managed-timer wrapper** (`useManagedInterval(fn, ms, { enabled })`) + an ESLint `no-restricted-syntax` ban on raw `setInterval` in `src/`, to make gating the default and the registry auto-maintained.
- **Dev-only Performance HUD at the app root** (generalize `games/blocks/PerformanceHUD.tsx`) showing live active-interval count, renders/sec, and idle-work warnings.
- **Consider `backgroundThrottling`** — currently the window is always fullscreen/visible so Chromium never throttles; a hidden/occluded state would.
