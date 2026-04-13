## 2025-05-18 - [Insecure Token Storage & File Conflict]
**Vulnerability:** OAuth tokens were stored in plaintext in `config.json` via `electron-store`. Additionally, `electron/store.ts` used `fs.writeFileSync` to save user settings to the same file, which would overwrite the entire file and delete the tokens.
**Learning:** `electron-store` defaults to `config.json` unless named. Manual `fs` usage on the same file can cause data loss and race conditions. Storing refresh tokens in plaintext exposes user sessions to file system attacks.
**Prevention:** Always use `safeStorage` for sensitive data like tokens. Use named stores (e.g., `new Store({ name: 'auth' })`) for different concerns to isolate data and avoid conflicts.

## 2026-02-16 - [Parameter Injection via Template Literals]
**Vulnerability:** Weather API URLs were constructed using template literals with user-supplied latitude/longitude inputs, allowing parameter injection if inputs were not validated numbers.
**Learning:** Even internal APIs that expect numbers can be vulnerable if inputs are strings via IPC (which bypasses compile-time type checks). Template literals do not encode special characters.
**Prevention:** Always use `URL` and `URLSearchParams` for constructing external API calls. Validate all inputs at the boundary (IPC handler or service method entry).

## 2026-05-20 - [Reflected XSS in Local OAuth Callback]
**Vulnerability:** The OAuth2 callback handler echoed the `error` parameter back to the user without sanitization or setting a safe Content-Type, allowing script execution via XSS if the user visited a malicious localhost link.
**Learning:** Local servers created for OAuth flows are susceptible to XSS if they serve user input. Browsers treat localhost responses just like any other web server response.
**Prevention:** Always set `Content-Type: text/plain` (or sanitize HTML) for dynamic responses in local servers. Never trust query parameters, even on localhost.
## 2025-03-15 - [IPC Input Validation for Date Strings]
**Vulnerability:** The `data:events` IPC handler parsed `timeMin` and `timeMax` directly with `new Date()` without verifying their string type or the validity of the resulting timestamp.
**Learning:** If invalid inputs are sent over IPC, creating a `Date` object results in `Invalid Date`. Downstream logic invoking `toISOString()` on these objects throws a `RangeError`, potentially crashing the main process or leading to denial-of-service conditions.
**Prevention:** Always validate IPC boundary inputs by checking types and verifying that `isNaN(date.getTime())` is false before passing `Date` objects further down the application stack.

## 2025-03-15 - [Unauthorized Window Creation in Electron]
**Vulnerability:** The main Electron window's `webContents` did not implement a `setWindowOpenHandler` handler, allowing potentially unauthorized opening of new browser windows (`window.open`) from the renderer process.
**Learning:** By default, Electron permits `window.open` requests, which can open unrestricted secondary windows exposing vulnerabilities if the renderer script is compromised or injected (e.g. bypassing sandboxes, executing malicious scripts).
**Prevention:** Always implement `setWindowOpenHandler` on `webContents` to return `{ action: 'deny' }` for unneeded scenarios, preventing unauthorized new windows.

## 2026-04-10 - [Predictable ID Generation via Math.random]
**Vulnerability:** Application logic used `Math.random()` to generate fallback IDs for calendar events and activity log entries.
**Learning:** `Math.random()` is not cryptographically secure and uses a predictable seed. In scenarios where IDs are used for state synchronization or deduplication, predictability could lead to collisions or information disclosure.
**Prevention:** Use `crypto.randomUUID()` in Node.js (via `node:crypto`) or the Web Crypto API in the browser to ensure IDs are globally unique and cryptographically secure.