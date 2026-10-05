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
(`electron/remote-auth.test.ts` here, the same constants in mc-remote).
**Learning (review round):** a protocol change does not revoke a key that already leaked — v2
changed how the key is used, not which key. The first plan was "rotate by hand after deploying",
a manual step nothing enforced. Ship the forced rotation with the fix: the first v2 start renews an
unmarked pairing once (`remotePairingVersion`), and `settings:save` can no longer write a stale copy
of the pairing back. Also: replay defences that live in memory reset on a restart or a page load and
reopen exactly the replay they stop. After a desktop restart `seenIds` is empty, so an action
captured in the previous ≤60 s can be replayed once. Accepted residual risk, documented, not fixed.
**Learning (code review):** de-dup windows judged by the wall clock alone reopen on a backward clock
step: once an id is pruned, the step makes its timestamp fresh again. Keep a floor (the newest sender
timestamp you have forgotten) and stamp your own outgoing sequence monotonically. And never act on a
write you have not confirmed: the renewed pairing is joined only when `store.update` reports it
landed (`store.set` used to swallow the error), and the re-scan notice goes in the same update as the
pairing it describes. A forced security change also needs a notice where the user looks,
held until the other side answers; a main-process log line reaches nobody in a packaged build.
**Learning (second review):** when rotating a credential, a failure path must fail closed, never
fall back to the credential being retired. The first "keep the current pairing if the write fails"
kept the leaked v1 key working for as long as config.json stayed locked; it now stays offline and
retries (5 s doubling to 5 min), never on the retired pairing.

## 2026-10-01 — The Google tokens never loaded on a relaunch (a fourth "sign in again" cause)

**Learning:** `export const authService = new AuthService()` runs when `main.js` is imported, before
Electron's `app` is ready, and the constructor loaded the tokens. On Windows `safeStorage` is
unusable before ready (`isEncryptionAvailable()` false, `decryptString` throws), so the load found
nothing and the OAuth client started every relaunch empty, since v0.0.6 (76c8fb0). `isAuthenticated()` re-read
the store later and said "signed in", so the login screen was skipped and every Google call failed
quietly: an empty week. Two readers of one credential gave two answers. The 2026-08-19 entry
explains "sign in again every few days" with three code causes; this was probably the bigger one.
The old unit tests' `safeStorage` fake had no "before ready" state, so none of them could see it.
**Action:** the readers load once on first use and throw before ready; `isAuthenticated()` answers
from the client's own credentials (`electron/auth.ts`, `ensureCredentialsLoaded`). Pattern: a
module-level singleton must not touch a ready-only Electron API (`safeStorage`, `screen`, sessions)
in its constructor. A fake for such an API must behave like the real one before ready, or the test
proves nothing. Guards: `electron/auth_app_ready.test.ts` (auth.ts itself) and
`src/__tests__/auth-ready-boundary.test.ts` (no module-scope `authService.`/`safeStorage.` read in
`electron/`: a caller there was invisible to every unit test because they all mock `./auth`).
**Second lesson (PR 186 review):** fixing a path that never ran makes its old edge cases live. The
save in the `'tokens'` listener had been unreachable on a relaunched Windows session; once it ran
every hour, a failed write fell back to plain text, the kept refresh token came from a store
re-read that could fail, and a store error thrown inside the library's synchronous emit discarded
the grant. When a fix revives a code path, review that path as new code.

## 2026-10-03 — Moving a secret's home does not delete its old copies

**Learning:** PR 180 made `config.json` the only owner of the remote pairing and stopped the Remote
tab drawing Mission Control's copy, but the copy stayed: the start-up `settings:get` read kept room
and key in `mc-state-v5.settings` (plain localStorage), refreshed when the pairing changed, "kept in
sync" for no reader. It was a second copy of the current key; PR 180 did clear it whenever the read
handed out no v2 pairing, so the v1 key an older build saved there lingered only while that read
kept failing. Guards that pin the readers (the QR, the broadcast projection) cannot see a copy that
nobody reads.
**Action:** when ownership of a secret moves, list every place a copy is *stored*, not only where
it is read, and remove the copies: drop the field from the type (tsc then refuses a literal write),
drop it at hydration so the next save writes it out (`withoutPairingCopy` in
`store/pairingRenewal.ts`), and guard both the names and the imports of the modules that read it
(`remote-key-boundary.test.ts` part iii, on the TypeScript parser) and the saved blob by value
(`pairingCopy.test.tsx`), because a spread of the whole answer names no field. Two traps from the
review: a framer-motion mock that renders `motion.div` as a plain div never calls
`onAnimationStart`, where the Settings overlay resets its draft, so a draft filled from the answer
there stayed green; and an "it was saved" check on a blob the test seeded itself can never fail.

## 2026-10-04 — A credential the server refused is still a credential to the client

**Learning:** google-auth-library keeps its credentials when Google answers `invalid_grant` (access
revoked, or the 7-day expiry while the consent screen is in Testing mode), so "signed in?",
answered from the client since 2026-10-01, said yes over an empty week. And its refresh installs
the result on the client *after* emitting `'tokens'`, with whatever refresh token the client holds
then: a refresh in flight across a sign-out (Reconnect) put an access-only token back on the
client for an hour. Ignoring the event protected the file, not the client. Separately,
electron-store parses its file in its constructor, so a module-scope store made a corrupt
`auth-store.json` stop every launch before the single-instance lock, with no window.
**Action:** the refusal is classified at the library's one refresh request
(`GoogleOAuthClient.refreshTokenNoCache` in `electron/auth-client.ts`, `override`, so a rename is a
tsc error), from the response body's error code, not the message; only `invalid_grant` signs out,
as `logout()` does, and the window gets `auth:signed-out`. One OAuth client per sign-in: a sign-out
replaces it and empties the old one, and callbacks from a client that is no longer current are
ignored. Stores open on first use; an unparseable file is moved aside, logged by a fixed phrase.
Pattern: when a library owns mutable state on an object and may still have async work running
against it, "clear the state" loses the race; replace the object. Guards:
`electron/auth_session.test.ts`, `electron/auth_store_corrupt.test.ts`,
`src/__tests__/auth-ready-boundary.test.ts`.
**Testing notes:** in the built app gaxios fetches through node-fetch (cached after first use), so
patching `globalThis.fetch` does nothing; patch `node:https`'s `request` before `main.js` runs, with
`-r <file>` in Playwright's launch `args` (it deletes `NODE_OPTIONS`). A test that times out only
under a loaded suite may be paying Vite's cold transform of the module it imports first (~90 ms
alone, seconds when every worker queues on the transform server): import once at the top level.
**Review round (PR 191):** replacing the client was not enough either: emptying the old one was
undone by its own in-flight refresh, so a read holding it still reached Google as the signed-out
account. The old client is now *retired* (a refresh that lands on it throws before the library can
install it), and a sign-in exchanges the code on a new client too, or a read refreshing the saved
grant during the consent page could sign the parent out right after signing in. The library also
refreshes after a 401 only when told to (`forceRefreshOnFailure`), so without it a revoke that
killed a still-valid access token went unnoticed for up to an hour. And gaxios keeps a failed
refresh's request body, refresh token included, in its error object, which `api.ts` logged:
log errors through `errorSummary` (`electron/log-safe.ts`), never as objects.
