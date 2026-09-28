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
- Remote-control payloads treated as untrusted: signature verified FIRST (`openRemoteMessage` in `electron/remote-auth.ts`, before any field is read or any msgId recorded), then required msgId + timestamp, timestamp window (60s), replay de-dup (2-min TTL), and no blind cast to a typed interface. The pairing key never goes on the channel, in either direction.
- No secret in code, logs, error strings, or anything reaching the renderer. A parse error counts: Node's `JSON.parse` message quotes the text around the bad token, so log the errno code or a fixed phrase for a file that holds a secret.
- A secret compared against a value that may come from a fallback needs an explicit "present and non-empty" check first. While config.json could not be read the stored remote key was `undefined`, and `receivedKey === storedKey` accepted an action sent without a key (2026-09-28).
- Check a remote message against the pairing the bridge joined with, not a per-message re-read of the file: a read that fails mid-session otherwise rejects every genuine action (or, with a fallback, accepts a key-less one) while the status still says connected (2026-09-28).
- "Offline" means out of the old room as well. After Regenerate Keys, an init() that stopped early stayed subscribed to the revoked room, still reported online, and would have broadcast state under the new key there (found in review, 2026-09-28).

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

## 2026-09-27 — Calendar content now drives state; third-party text now reaches the phone

**Learning:** The School Bag is the first feature where calendar content *decides* something: an
all-day event whose title matches a no-school keyword removes the task. Google auto-adds invites, so
a stranger's all-day invite titled "No school" can remove the bag that day (accepted: it can never add
a task or move tokens). Raw titles never leave the machine — a keyword match is logged by a fixed
label — but a statutory holiday's nager.at name now reaches the "mission started" log line, therefore
the Supabase broadcast and the NDJSON audit trail. Stripping `\p{Cc}` was not enough: `\p{Cf}`
(U+202E right-to-left override, zero-width characters) passes it and can make a log line display
misleadingly. Pre-existing and tracked as a separate task: `remote-bridge.ts` `broadcastState` sends
`config.remoteKey` in plain text in every `state-update`, so a listener on the room learns the key
that authenticates remote actions.
**Action:** Any third-party or user-authored text on its way to the log, the broadcast or the audit
trail goes through a cleaner that strips `[\p{Cc}\p{Cf}]`, trims and caps. Treat calendar content as
untrusted input the moment it changes state.

## 2026-09-28 — Allowlist entries justified by a local dispatch are not justified

**Learning:** `ADD_TOKEN` and `COMPLETE_MISSION_ROUTINE` sat on `REMOTE_ALLOWED_ACTIONS` from
2026-08-20 under a drift-guard exemption reading "reached indirectly through COMPLETE_TASK flows". No
phone build ever sent either. The indirect path is a *local* dispatch (the mission overlay), and a
local dispatch never passes the allowlist, so the reason could not justify a remote entry. The
entry let a key holder complete a running mission with no task ticked and collect the bonus.
**Action:** Removed both (PR 183). An exemption in the drift guard needs a reason that names a
remote sender or a spec line that makes the type remote-reachable; "the desktop does it itself" is
an argument for removal, not for an exemption.

## 2026-09-28 — The pairing key was broadcast on the channel it protected

**Learning:** `remote-control:{roomId}` is a public Supabase broadcast channel, and v1 authenticated
it with a shared secret that travelled on it: `broadcastState` sent `{ key, state, timestamp }`, and
an action was trusted if its payload repeated the key. The security review saw only the
desktop→phone leak (state-update). The phone also sent the key in plain text in every action and
in the `SYNC_REQUEST` it sends on every reconnect, so a fix on one side alone would have been
theater. A shared secret must never travel on the channel it authenticates; check BOTH directions.
With the key off the wire, the room id is the only secret a listener needs, so it is now logged as
an 8-character prefix. Sign a string body, never an object: Realtime decodes and re-encodes JSON,
so key order is not preserved and a re-serialized object stops verifying. Timestamps and msgIds
must be inside the signed body and required: v1 skipped the staleness check when the timestamp
was absent, and a msgId recorded before verification lets forged traffic pre-burn a genuine one.
**Action:** Both events are `{ v: 2, body, sig }` (HMAC-SHA256 of `event + "\n" + body`, keyed with
`remoteKey`; `electron/remote-auth.ts`); the key is never sent, logged, or put in a URL query (the
pairing QR carries it in the fragment). The shared test vector is pinned in both repos
(`electron/remote-auth.test.ts` here, the same constants in mc-remote). After deploying, rotate the
pairing (Remote tab → "🔄 Regenerate Keys") and re-scan: the old key was on the wire for months.
