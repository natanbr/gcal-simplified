## 2025-05-31 - Split mcReducer God File

**Learning:** The `mcReducer.ts` file had grown into a >600 line "God file", handling token economy, missions, settings, and responsibilities. This bloated context windows and made it harder for agents to modify specific domains. I refactored it by extracting domain logic into specific reducer files under `src/mission-control/store/reducers/`, while maintaining the single composed exported `mcReducer` interface. This preserves exact behavioral parity, passing all 467 tests, while significantly improving maintainability and reducing token count for AI reads.
**Action:** Next time I encounter a large, monolithic reducer, I will proactively suggest a similar domain-based split (economy, missions, etc.) to improve modularity and reduce context limits.
## 2025-05-31 - Split mcReducer God File

**Learning:** The `mcReducer.ts` file had grown into a >600 line "God file", handling token economy, missions, settings, and responsibilities. This bloated context windows and made it harder for agents to modify specific domains. I refactored it by extracting domain logic into specific reducer files under `src/mission-control/store/reducers/`, while maintaining the single composed exported `mcReducer` interface. This preserves exact behavioral parity, passing all 467 tests, while significantly improving maintainability and reducing token count for AI reads.
**Action:** Next time I encounter a large, monolithic reducer, I will proactively suggest a similar domain-based split (economy, missions, etc.) to improve modularity and reduce context limits.
