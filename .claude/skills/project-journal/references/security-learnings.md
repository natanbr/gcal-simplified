# Security learnings

Vulnerabilities actually found and fixed in `gcal-simplified`. This app holds a Google OAuth refresh token and accepts remote commands over a public Supabase Realtime channel, so several of these were live exposures, not theory. Check whether a change reintroduces one before hunting for anything novel.

---

## 2025-05-18 — Insecure token storage + store file collision

**Vulnerability:** OAuth tokens were stored in plaintext in `config.json` via `electron-store`. Separately, `electron/store.ts` used `fs.writeFileSync` on that *same* file to save user settings — overwriting the whole file and destroying the tokens.

**Learning:** `electron-store` defaults to `config.json` unless the store is named. Manual `fs` writes to a store-managed file cause data loss and races. Plaintext refresh tokens expose the user's Google account to anything that can read the filesystem.

**Prevention:** Use `safeStorage` for anything credential-shaped. Use named stores (`new Store({ name: 'auth' })`) so separate concerns never share a file.

## 2026-02-16 — Parameter injection via template literals

**Vulnerability:** Weather API URLs were built with template literals interpolating latitude/longitude that arrived over IPC.

**Learning:** TypeScript types do not survive the IPC boundary — a "number" parameter can arrive as an arbitrary string. Template literals encode nothing.

**Prevention:** Build outbound URLs with `URL` and `URLSearchParams`. Validate inputs at the boundary (IPC handler or service entry), not deeper.

## 2026-05-20 — Reflected XSS in the local OAuth callback

**Vulnerability:** The OAuth callback handler echoed the `error` query parameter back into the response without sanitizing it or setting a safe `Content-Type`, allowing script execution if the user was lured to a crafted localhost URL.

**Learning:** A local server spun up for an OAuth redirect serves ordinary web responses. The browser applies no special trust rules to localhost.

**Prevention:** Set `Content-Type: text/plain` (or properly escape) for any dynamic response from the local server. Never reflect query parameters, even on localhost.

## 2025-03-15 — Missing IPC input validation on date strings

**Vulnerability:** The `data:events` IPC handler passed `timeMin`/`timeMax` straight into `new Date()` without checking type or validity.

**Learning:** An invalid input produces an `Invalid Date`, and the first downstream `.toISOString()` throws a `RangeError` — in the **main process**, which is a crash, not a caught UI error. That's a trivial denial of service from a compromised renderer.

**Prevention:** At every IPC boundary, check the type and verify `!isNaN(date.getTime())` before letting a `Date` travel further.

## 2025-03-15 — Unrestricted window creation

**Vulnerability:** The main window's `webContents` had no `setWindowOpenHandler`, so the renderer could open arbitrary new browser windows via `window.open`.

**Learning:** Electron permits `window.open` by default. A compromised or injected renderer can use it to open unrestricted secondary windows and escape sandbox expectations.

**Prevention:** Always install `setWindowOpenHandler` returning `{ action: 'deny' }` unless a specific window is genuinely needed.

## 2025-05-24 — Unbounded OAuth callback servers (DoS)

**Vulnerability:** The local `http.createServer` used for the OAuth redirect had no concurrency limit and no timeout, so repeated `startAuth()` calls spawned indefinite servers holding ports.

**Learning:** Any function that allocates a system resource (a port, a listener) inside a desktop app needs a single-flight guard and a finite lifetime, or abandoned flows accumulate as zombies.

**Prevention:** Track the in-flight auth flow in module state; reject or reuse on re-entry, and `setTimeout` a forced close that also rejects the pending promise.

## 2025-02-14 — Default-deny permission model

**Vulnerability:** No `setPermissionRequestHandler` or `setPermissionCheckHandler` on `session.defaultSession`, leaving camera/mic/geolocation decisions to Chromium/OS defaults.

**Learning:** Absent handlers mean inherited defaults, which are permissive. This app needs none of those capabilities.

**Prevention:** Explicit default-deny in `electron/main.ts` — return `false` for every permission request and check. Defense in depth; this should be standard for every Electron app.

---

## Standing checklist for `electron/` changes

- New IPC channel → is it an *operation* or a *capability*? Capabilities (fs, shell, child_process, arbitrary fetch) do not belong behind a whitelist entry.
- Inputs validated at the handler, not assumed from types.
- Outbound URLs via `URL`/`URLSearchParams`.
- `contextIsolation: true`, `nodeIntegration` off, window-open denied, permissions denied.
- Remote-control payloads treated as untrusted: timestamp window (60s), replay de-dup (2-min TTL), and no blind cast to a typed interface.
- No secret in code, logs, error strings, or anything reaching the renderer.

Existing tests to run and extend: `electron/auth_security.test.ts`, `electron/main_security.test.ts`, `electron/weather_security.test.ts`, `electron/remote-bridge.test.ts`.

## 2026-08-19 — The remote channel had no action allowlist

**Learning:** `useRemoteControl` forwarded *any* action arriving on the Supabase channel straight
into the reducer. The pairing key stops a stranger, but it does not stop a stale remote build, a
replayed payload, or a tampered client from reaching action types the remote has no button for —
including `CLEAR_LOGS` (destroys the audit evidence), `RESET_GAME_TOKENS`, `ADD_LOG` (forges history)
and `START_GAME` (strands `snakeGameActive` with no overlay to close it).
**Action:** `REMOTE_ALLOWED_ACTIONS` in `src/mission-control/hooks/useRemoteControl.ts` is now an
allowlist. Adding a button to the remote app means adding its action type there too. Authentication
is not authorisation — a valid key should not imply a valid *action*.

## 2026-08-19 — OAuth refresh tokens were being destroyed on every save

**Learning:** "I have to sign in again every couple of days" had three code causes plus one console
cause. (1) Google issues `refresh_token` only on the FIRST consent; every later grant and every
refresh response omits it, and `saveTokens` wrote the response verbatim — destroying the only
long-lived credential. (2) `generateAuthUrl` used `access_type: 'offline'` without
`prompt: 'consent'`, so re-authing an already-authorised account returned no refresh token at all.
(3) google-auth-library refreshes in memory and never notifies the store; without an
`oauth2Client.on('tokens')` listener the persisted blob goes stale. (4) If the Cloud Console consent
screen is in **Testing** publishing status, refresh tokens expire after 7 days regardless of code.
**Action:** All three code fixes are in `electron/auth.ts`. When debugging auth expiry, check the
consent-screen publishing status *first* — no amount of code fixes a 7-day server-side expiry.

## 2026-08-19 — Audit trail: append-only by omission, sanitised by reconstruction

**Learning:** `electron/audit-log.ts` deliberately exposes only `audit:append` and `audit:read`. There
is no clear/delete channel, because the whole point is to survive the in-app CLEAR button and a state
reset. Renderer payloads are rebuilt field-by-field (never spread) with clamped strings, a validated
`src` enum, and a per-append entry cap — `JSON.stringify` also guarantees one line per record, so a
newline inside a message cannot forge a second entry.
**Action:** If a future feature wants to prune the trail, do it in the main process on a time policy —
do not add a renderer-reachable delete channel.
