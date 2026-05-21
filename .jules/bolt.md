## 2024-05-18 - Isolated High-Frequency Hook Updates
**Learning:** `useLiveClock` updates state every 1000ms. Placing it at the root of a globally mounted, always-present component like `MissionOverlay` or `MissionControl` forces the entire component tree to re-render every second, causing significant background CPU usage even when the component is hidden.
**Action:** Extract high-frequency hooks into small, dedicated leaf components (like `MissionTimerDisplay` or `LiveClockDisplay`) so that only a tiny fraction of the DOM and React tree re-renders on each tick. Use absolute timeouts (`setTimeout(..., endMs - Date.now())`) for auto-resolving delayed logic instead of constantly checking a live clock state variable.
## 2024-05-18 - Framer Motion Infinite Loops Background CPU Usage
**Learning:** In Framer Motion, placing an infinite loop (e.g., `transition: { repeat: Infinity }`) strictly at the root level of a motion component forces the browser to run a continuous 60fps loop, even when the animation might be visually static or conditionally disabled. This causes unnecessary high background CPU usage.
**Action:** Always place infinite transitions inside conditional `animate` objects instead of using the top-level `transition` prop. This ensures the loop only runs when the animation is actively triggered.
## 2026-03-11 - Prevent Redundant Date Allocations
**Learning:** High-frequency event processing functions and hooks like `eventsByDayMap` in `MonthlyView.tsx` and `splitMultiDayEvents` were calling `new Date(event.start)` inside large O(N) loops. This unnecessarily creates new object instances since `event.start` is already typed and usually instantiated as a `Date` object in this application (via hydration in `useCalendarData.ts`), causing unnecessary background CPU overhead and garbage collection pauses when processing large datasets or re-rendering.
**Action:** Defensively wrap potential date string properties with `event.start instanceof Date ? event.start : new Date(event.start)` to reuse existing memory references while preserving safety for unhydrated data. Doing this reduces memory churn significantly.

## 2026-03-12 - Replacing O(Days * N) filtering with O(N) Map lookups
**Learning:** Computing day-by-day segments for events using `days.map(day => events.filter(e => isSameDay(e.start, day)))` introduces O(Days * N) complexity and heavily hits date library utilities like `date-fns`'s `isSameDay`. In `Dashboard.tsx`, this caused significant overhead during React renders when managing many events.
**Action:** Replace `isSameDay` filtering loops with an O(N) Hash Map approach. First iterate through the events once to group them by a date string key (`YYYY-MM-DD`), avoiding redundant date instantiations per event using defensive wrapping (`event.start instanceof Date ? event.start : new Date(event.start)`). Then, map over the days and look up the pre-grouped events from the map in O(1) time.
## 2026-03-13 - Module-level singleton state initialization issue
**Learning:** When using a module-level singleton state pattern for hooks (like `useLiveClock`), initializing the state statically at the module level (`let currentDate = new Date()`) causes components to mount with a stale date if they are loaded much later than the script evaluation time.
**Action:** Initialize the singleton state dynamically inside the hook when it's first used (e.g. `if (!intervalId) currentDate = new Date()`) to ensure it gets the accurate value at the time the first component actually mounts.

## 2026-05-22 - Speculative Reducer Runs and React Context Status Isolation
**Learning:**
1. Running `mcReducer(state, action)` inside log formatting helper `createLogEntry` to compute state wealth snapshots causes the entire reducer to execute 3x per dispatch (once for the action dispatch, once for formatting the log entry, and once inside other calculations).
2. Placing transient network connection flags directly in global store states causes wide-scale re-renders of unrelated components.
3. Unbounded log arrays can grow past 1000+ entries, causing memory bloat and slow modal rendering.
4. Active timers instantiated per remote action in the main process leak memory and cause Vitest run errors if not batched or cleaned up in test boundaries.

**Action:**
1. Extract a lightweight, O(1) state projection function (`deriveSnapshots`) to compute wealth changes from the action type instead of evaluating the full `mcReducer` state tree.
2. Restrict invariant task syncing (`syncCreamTask`) inside the reducer to run only on actions that modify relevant attributes (tasks, settings).
3. Use a dedicated React Context (`RemoteStatusContext`) for UI status indicators instead of placing transient/connection signals in the root state.
4. Enforce a strict log capping limit of 200 elements in the reducer.
5. Use a timestamp-mapped `seenIds` interval cleanup pattern inside `RemoteBridge` and implement a `.destroy()` cleanup method called inside test `afterEach` hooks.

## 2025-05-19 - Removed infinite motion loops
**Learning:** `framer-motion` `repeat: Infinity` loops trigger JS execution and layout computations on the main thread continuously, significantly degrading React performance and increasing CPU usage, especially on slower devices.
**Action:** Replace all infinite or long-running `framer-motion` animations with pure CSS `@keyframes` and `.classes` so the browser can offload the work to the compositor thread.

## 2026-03-14 - Optimize Hit Detection during Drag Events
**Learning:** In components with high-frequency interactions like drag-and-drop (`GlobalBank.tsx`, `GoalPedestal.tsx`), performing object lookups (`cases.find(...)`) inside coordinate boundary checks for each target creates unnecessary O(N) overhead during a hot execution path.
**Action:** Reorder logic to perform the fast, mathematical bounds check first (`x >= rect.left && ...`). If the bounds check passes, use a memoized `Map` constructed via `useMemo` for O(1) object lookups instead of iterating through arrays with `.find()`.
