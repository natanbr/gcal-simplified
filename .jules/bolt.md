## 2024-05-23 - React.memo for Polled Data

**Learning:** Components receiving data from frequent polling (e.g., every 5 minutes) often re-render due to new object references, even if the data content is identical. Using `React.memo` with a custom deep comparison function (like `areEventsEqual`) can significantly reduce re-renders.
**Action:** Always check cheap references (functions, booleans) _before_ performing expensive deep comparisons in custom `React.memo` functions to avoid performance regressions.

## 2024-05-22 - TypeScript Inference with React.memo and External Comparators

**Learning:** When separating a `React.memo` comparison function into a utility file, the interface defined for the comparator's arguments must strictly match the component's full props interface (including callbacks like `onEventClick`), even if those props are ignored in the comparison logic.
**Action:** Always verify that utility interfaces include all props required by the component when using `React.memo` to avoid "Property does not exist" type errors during build.

## 2024-10-27 - [Unused Data Structures]

**Learning:** Found that `partitionEventsIntoHourlySlots` was creating an object map of events keyed by hour, but the consumer (`DayColumn`) only needed a flat list of overlapping events. The map structure was pure overhead.
**Action:** When optimizing, verify if complex return structures from utility functions are actually consumed in that format. Flattening to arrays can save significant O(N) operations and object allocations.

## 2024-10-31 - [Array Filtering in Loops]
**Learning:** Calling `Array.prototype.filter` inside a `.map` loop over a fixed grid (like 35 days in `MonthlyView`) results in $O(G \times N)$ complexity (where G is grid size, N is events). Additionally, instantiating `new Date()` within this nested loop creates massive GC overhead.
**Action:** When mapping over a grid, use `useMemo` to pre-calculate and group events into a `Map` keyed by a simplified string (e.g., `YYYY-MM-DD`). This reduces the render loop complexity to $O(N)$ and allows for $O(1)$ lookups, eliminating redundant object creation.

## 2024-10-31 - [Defensive Runtime Types]
**Learning:** Even if TypeScript types define a property as a `Date` (e.g., `AppEvent.start`), data passed from IPC or API responses may be raw ISO strings or numbers if not properly hydrated.
**Action:** Always defensively wrap assumed Date objects in `new Date(value)` before invoking methods like `.getFullYear()` to prevent critical runtime crashes when processing external data.
