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

## 2024-05-18 - Optimized Array Partitioning
**Learning:** Using multiple `.filter()` calls to partition an array into subsets (e.g., separating holidays from standard events) iterates over the array multiple times, causing unnecessary CPU overhead during high-frequency renders like week navigation.
**Action:** Replace multiple `.filter()` calls with a single `for...of` loop when partitioning arrays into mutually exclusive buckets. This reduces the time complexity from O(K * N) to O(N), where K is the number of subsets, providing a measurable performance improvement.

## 2024-05-18 - Avoid Micro-Optimizations in List Filtering
**Learning:** Replacing small array `.filter()` calls (e.g., filtering 5-20 events per day) with a single `for...of` loop is a micro-optimization with no measurable real-world performance impact and slightly degrades readability.
**Action:** Focus optimizations on rendering performance (e.g., memoization) or heavy data processing. Do not optimize small array operations unless they are proven to be a bottleneck.

## 2024-05-18 - Memoize List Items in Monthly Views
**Learning:** Rendering many list items (e.g., events in a monthly calendar grid) inside a parent component that frequently updates (e.g., due to `currentDate` changes or background ticks) forces a full re-render of every item and its expensive inner logic (like color style calculations).
**Action:** Extract list items into standalone `React.memo` components, especially when their props (like `event` and `onEventClick`) remain stable. This ensures the items only re-render when their specific data changes, significantly reducing CPU overhead during view navigation or background updates.
