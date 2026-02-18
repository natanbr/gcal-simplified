## 2025-05-18 - [Insecure Token Storage & File Conflict]
**Vulnerability:** OAuth tokens were stored in plaintext in `config.json` via `electron-store`. Additionally, `electron/store.ts` used `fs.writeFileSync` to save user settings to the same file, which would overwrite the entire file and delete the tokens.
**Learning:** `electron-store` defaults to `config.json` unless named. Manual `fs` usage on the same file can cause data loss and race conditions. Storing refresh tokens in plaintext exposes user sessions to file system attacks.
**Prevention:** Always use `safeStorage` for sensitive data like tokens. Use named stores (e.g., `new Store({ name: 'auth' })`) for different concerns to isolate data and avoid conflicts.

## 2026-02-16 - [Parameter Injection via Template Literals]
**Vulnerability:** Weather API URLs were constructed using template literals with user-supplied latitude/longitude inputs, allowing parameter injection if inputs were not validated numbers.
**Learning:** Even internal APIs that expect numbers can be vulnerable if inputs are strings via IPC (which bypasses compile-time type checks). Template literals do not encode special characters.
**Prevention:** Always use `URL` and `URLSearchParams` for constructing external API calls. Validate all inputs at the boundary (IPC handler or service method entry).
