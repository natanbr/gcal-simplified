# Performance — Idle Budget & Regression Guards

**Core rule:** when the user is idle on the **Calendar view**, the app must do almost nothing. Because `MCStoreProvider`, `MissionSchedulerBridge`, `RemoteControlBridge`, `MissionOverlay`, and `MoodWindNotification` stay mounted on both views (`src/App.tsx`), any un-gated Mission Control background work also runs while the user is on the Calendar.

## What runs while idle on the Calendar (the budget)

Renderer timers that are allowed to fire on an idle Calendar (kept intentionally small — enforced by `src/__tests__/timer-registry.test.ts`):

| Timer | Cadence | Why it's OK |
|---|---|---|
| `Dashboard.tsx` data refresh | 5 min | Calendar needs fresh events/tasks/weather. |
| `useCurrentDate.ts` | 60 s | Midnight rollover; bails out (no re-render) unless the day changed. |
| `useTheme.ts` | 60 s | Time-based light/dark; bails out unless the theme changed. |
| `useBehaviorHeartbeat.ts` | 60 s | Mood-progress accrual. **Idle-optimized:** `mcReducer` returns the *same* state ref when nothing accrues (night / out of active window), so idle ticks cause no re-render and no persist. |

Everything else (mission expiry poll, live clock, game loops, privilege countdown) is gated to an active mission / open game / the Mission Control view and does **not** run on an idle Calendar.

Main process (always-on by design, independent of view — `electron/`): the Supabase Realtime WebSocket (remote control), a 60 s power-policy check (`main.ts`, can spawn a screen-off command when idle in the sleep window), a 60 s de-dup cleanup, and a 4 h auto-update check.

## Fixes applied (2026-07)

Root cause of the reported "CPU waking up on the Calendar view":

1. **`useMissionScheduler` 15 s expiry poll ran unconditionally** — even with no mission active it woke the main thread 4×/min. → Gated on `activeMission !== 'none'`; no interval exists while idle.
2. **Behavior heartbeat churned state every 60 s** — each tick created a new store object → re-render of all `useMCState` consumers + a `localStorage` write + a remote broadcast, even at night. → `applyBehaviorSync` now returns the same reference when nothing accrues; only advances during active hours.
3. **Dashboard "Syncing…" bar animated `width` forever** — the wrapper only faded to `opacity: 0` (never unmounted), so an infinite, layout-driven CSS loop ran continuously. → Animation classes are applied only while actually syncing.

## Live HUD (`src/components/PerformanceHud.tsx`)

An always-on, bottom-right readout mounted at the App root (`src/App.tsx`) — visible on **both** views and during games. Colour is the primary signal (green → yellow → orange → red):

- **FPS** — frames/sec (drops when the main thread is busy).
- **JANK** — worst single frame time (ms) in the last second; the clearest "did the UI hitch/freeze" signal.
- **MEM** — JS heap in use (MB), coloured by fraction of the heap limit (watch it climb → leak).

It intentionally runs one `requestAnimationFrame` loop (the only always-on loop on the Calendar) and pushes to React state just once per second, so its own overhead is negligible. It never intercepts clicks (`pointer-events: none`). Escape hatch: `localStorage.setItem('perf-hud','off')` + reload.

## Regression guards (run in `npm run test:unit`)

- **`src/__tests__/timer-registry.test.ts`** — scans `src/` for `setInterval`; fails if one appears in an unregistered file, and caps how many timers may run on an idle Calendar. Adding a timer forces a conscious, reviewed registration.
- **`src/mission-control/__tests__/idle-performance.test.tsx`** — asserts the scheduler creates no interval while idle, and that the heartbeat is a no-op (same state ref) at night / out of window.
- **CLAUDE.md → Performance checklist** — the per-feature self-review (timers, Calendar-idle impact, infinite animations, store-write cadence, effect cleanup).

## Backlog / optional next steps (not yet done — need a decision)

- **Gate the main-process 60 s power-policy interval** (`electron/main.ts`) so it only runs when a sleep window is configured, instead of always.
- **Managed-timer wrapper** (`useManagedInterval(fn, ms, { enabled })`) + an ESLint `no-restricted-syntax` ban on raw `setInterval` in `src/`, to make gating the default and the registry auto-maintained.
- **Dev-only Performance HUD at the app root** (generalize `games/blocks/PerformanceHUD.tsx`) showing live active-interval count, renders/sec, and idle-work warnings.
- **Drop `behaviorProgress` from the remote-sync dependency list** so the per-minute mood drip doesn't push a network broadcast every 60 s during active hours (coarsen to a longer cadence).
- **Consider `backgroundThrottling`** — currently the window is always fullscreen/visible so Chromium never throttles; a hidden/occluded state would.
