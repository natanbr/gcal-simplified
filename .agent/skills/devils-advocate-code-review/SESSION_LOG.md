# Devil's Advocate — Session Log

> Updated after every run. Append entries; never delete past entries.
> This log prevents redundant re-discovery of already-identified issues across sessions.

---

## Known False Positives (global — never re-flag)

> Add global false positives here as they are confirmed across multiple sessions.

*(none yet)*

---

## Recurring Anti-Patterns (project-wide)

> Patterns that appear in many files — flag quickly without full analysis:

- **Template getter/setter**: Widespread in older components. Always flag as MEDIUM+ (DV category). See `ai-guidelines.md`.
- **God class**: `CryptoCurrenciesHelper` was already decomposed (2025-03-05). Do not flag the facade itself, but flag any new callers that bypass specialists.

---

<!-- ============================================================ -->
<!-- Append new session entries BELOW this line                   -->
<!-- ============================================================ -->
