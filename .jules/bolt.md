## 2024-05-23 - React.memo for Polled Data

**Learning:** Components receiving data from frequent polling (e.g., every 5 minutes) often re-render due to new object references, even if the data content is identical. Using `React.memo` with a custom deep comparison function (like `areEventsEqual`) can significantly reduce re-renders.
**Action:** Always check cheap references (functions, booleans) _before_ performing expensive deep comparisons in custom `React.memo` functions to avoid performance regressions.

## 2024-05-22 - TypeScript Inference with React.memo and External Comparators

**Learning:** When separating a `React.memo` comparison function into a utility file, the interface defined for the comparator's arguments must strictly match the component's full props interface (including callbacks like `onEventClick`), even if those props are ignored in the comparison logic.
**Action:** Always verify that utility interfaces include all props required by the component when using `React.memo` to avoid "Property does not exist" type errors during build.
