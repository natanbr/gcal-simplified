# Diagnostics bundle (synced folder) + quick-game eligibility trace

Status: approved direction 2026-11-09 (owner chose "synced folder" over SSH / a Supabase channel).

## Why
The production laptop is a different machine. Once, every quick-game rule looked true and 🐍 was still
missing from the goal picker. The gate reads only *current* state, so a past refusal cannot be
reconstructed, and nothing records it. We need (1) a record of every input the picker gate used, at the
moment it was used, and (2) a way for the developer machine to read that record.

## What ships (v1)
1. **One eligibility function.** `quickGameEligibility(state, nowIso)` in
   `src/mission-control/store/quickGameEligibility.ts` returns every sub-condition **and** its raw input:
   `gameTokens`, `rewardEnabled` (`isRewardEnabled`), `moodWind`, `activeMission`, `eveningStartsAt` (raw)
   and its `hhmmToMins` result, `lastCompletedOrFailedMorningDate`, today's `getLocalDateString(now)`,
   `economyLocked`, `nowIso`, `tzOffsetMins`, and the verdicts `windowOpen`, `pickerVisible` (🐍 shown in
   the picker), `useEnabled` (the "🎁 Use!" button). `GoalPedestal` decides with this object
   (picker filter and `canUseQuickGame`), so the trace and the gate cannot disagree.
   `isQuickGameWindowOpen` stays the reducer's gate; the new function calls it (or shares its pieces) —
   do not create a second copy of the window rule.
2. **Trace events** (renderer → main, `diagnostics:trace`): emitted on
   - a tap on a pedestal's "+" (also when the economy is locked and the picker does not open),
   - the goal picker opening (same event as above when it opens),
   - session start, and each mission end (completion or miss) — cheap context points.
   Event-driven only: no `setInterval`, no new idle timer.
3. **Main-process writer** `electron/diagnostics.ts`:
   - Off until a folder is chosen. The folder is chosen **only** through a native folder picker in main
     (`diagnostics:choose-folder`, `dialog.showOpenDialog`, `openDirectory`), validated as an existing
     directory, stored with `store.update` in a new main-only `UserConfig` field (`diagnosticsDir`),
     excluded from `SETTINGS_FIELDS` like the pairing fields. The renderer can never supply a path.
   - Writes only to `<dir>/<os.hostname() sanitized>/` with fixed file names:
     `eligibility.ndjson` (trace lines) and `audit-log.ndjson` (a mirror of every entry `AuditLog.append`
     wrote, after its sanitize). Size cap + one rotated generation, like the audit log (4 MB).
   - Rebuilds every trace line **field by field from a fixed allowlist** (same pattern as
     `audit-log.ts` `sanitize`): numbers finite, strings clamped, unknown keys dropped. Never spread a
     renderer object. Adds `appVersion` and `host` itself.
   - Failures are results, not throws; `EBUSY`/`EPERM`/`EACCES` (OneDrive holding the file) are
     transient and swallowed. A write failure never affects the audit log.
   - Channels (prefix `diagnostics:`; never `audit:*`, `preload_contract.test.ts` forbids more):
     `diagnostics:trace`, `diagnostics:status` (on/off + folder for display), `diagnostics:choose-folder`,
     `diagnostics:disable`. All wrapped in `ipcSafe`. Registered from `main.ts` with one call
     (`main.ts` is 242 lines).
4. **Settings UI**: General tab, a "Diagnostics folder" row: current folder or "Off", "Choose folder…"
   and "Turn off". Tailwind (Calendar system).
5. **No whole-state snapshot in v1.** It would send the child's data to a cloud folder on a guess. The
   trace + audit mirror is enough until the trace points somewhere.

## Never
- No pairing field (`remoteKey`, `remoteRoomId`, …), no `config.json`, no `auth-store.json` content in
  the folder. The writer never names `config.json`.
- No renderer-chosen path or file name.
- `GoalPedestal.tsx` must not grow (file-size ratchet: 640, currently 599).

## Guards (same change)
- Unit tests: eligibility function (each sub-condition flips `pickerVisible`; matches
  `isQuickGameWindowOpen`), writer (allowlist rebuild, unknown keys dropped, path stays under the host
  folder, off when unset, transient errors swallowed, rotation), choose-folder rejects a non-directory,
  `settings:save` cannot write `diagnosticsDir`.
- Structural guard `src/__tests__/diagnostics-boundary.test.ts`: only `electron/diagnostics.ts` writes
  into the diagnostics folder; it names no pairing field and no `config.json`; GoalPedestal's quick-game
  decisions come from `quickGameEligibility` (no direct `isQuickGameWindowOpen` / `moodWind` gate left
  there).
- CLAUDE.md rule + `rule-registry.test.ts` entry; `docs/requirements.md` changelog entry.

## Open
- The developer laptop must sync the same OneDrive folder the production laptop picks (owner to confirm).
