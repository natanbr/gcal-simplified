## 2024-05-23 - [Optimized Event Grouping Logic]
**Learning:** Found O(N^2) complexity in `groupOverlappingEvents` due to nested `.some()` loop inside `forEach`.
**Action:** Replaced with O(N) sweep-line algorithm using `maxGroupEnd` tracking.
**Result:** >1000x speedup for 5000 overlapping events (2326ms -> 1.84ms).
**Lesson:** Always profile or benchmark "optimized" code claims in documentation/memory vs actual implementation.
