
## Architectural Refactors

* **Reducers:** Large monolithic reducers (e.g. `mcReducer.ts`) should be split into smaller, domain-specific reducers (e.g. `economyReducer`, `missionReducer`) inside a `reducers/` directory, and composed together. This keeps individual files short and focused, reducing token usage for AI agents.
