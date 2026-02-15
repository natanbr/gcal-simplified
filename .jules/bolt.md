## 2024-05-23 - React.memo for Polled Data
**Learning:** Components receiving data from frequent polling (e.g., every 5 minutes) often re-render due to new object references, even if the data content is identical. Using `React.memo` with a custom deep comparison function (like `areEventsEqual`) can significantly reduce re-renders.
**Action:** Always check cheap references (functions, booleans) *before* performing expensive deep comparisons in custom `React.memo` functions to avoid performance regressions.
