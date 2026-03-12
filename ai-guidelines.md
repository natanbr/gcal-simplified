# Guidelines File

## General Guidelines
* Optimize code for token efficiency and readability by AIs. Keep files short and focused.
* Abide by SOLID and DRY principles.
* Use strict, predictable naming conventions.

## Code Standards
* **Strong Types:** Use specific types instead of `any` where possible. Example: use `SerializedAppEvent` for IPC communication instead of `unknown`.
* **Testing:** Use Vitest for unit tests. Run `npm install` before tests if needed. Put unit tests next to the source file (e.g., `src/utils/math.ts` and `src/utils/math.test.ts`).
* **Performance:** Use `React.memo` for components rendering large lists. Avoid redundant Date object instantiation.

## Anti-Patterns to Avoid
* **"God" Components:** Do not place all business logic in one massive component. Split features into logical domains.
* **Leaky Abstractions:** Keep boundaries clean. UI should not directly query the database or use raw IPC calls directly without encapsulation.
* **Missing `await` or floating promises:** Handle promises properly.
