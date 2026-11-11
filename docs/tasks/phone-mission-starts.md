# Phone-only manual mission starts

Requested by the owner on 2026-11-10. Automatic scheduled starts remain enabled
(confirmed in chat). Implementation branch in both repositories:
`codex/phone-mission-starts`.

## Problem and required behavior

The child can use MC Settings' Start buttons after a failed mission ends to create
a fresh paid attempt. The parent must decide when another attempt is available.

- Remove manual Morning and Evening Start controls from desktop MC Settings.
- Keep morning/evening scheduled starts, including the existing occurrence,
  resume, missed-window and one-running-mission protections.
- Keep manual starts on the paired phone, outside scheduled windows as well as
  inside them. A completed, failed or stopped attempt must not impose a daily
  limit: the parent can start another session of either phase the same day.
- Only one mission can run at a time. A new start must not replace a running one.
- The phone can reset only the checklist or deliberately restart the running
  session with a fresh checklist and timer. Restart requires confirmation.
- A retry preserves the miss already charged. It resets attempt-specific state;
  completion follows the existing bonus and one-step shield recovery rules.
- Controls must explain repeat starts and unavailable actions. Session start,
  stop, reset and restart
  controls send no actions while the phone is disconnected or waiting on a
  session command; existing task, timer and whining controls keep their behavior.
- Desktop gestures must not start, stop or reset a mission. Extend the existing
  action-literal structural guard rather than adding a new authorization protocol.

## Architecture decision

The desktop reducer already permits repeated phone starts without a per-day gate.
The phone's prior Done Today badge described failed attempts as done too, which
made the available repeat start unclear. Reuse SET_ACTIVE_MISSION for idle starts,
RESET_MISSION for checklist resets and RESET_MISSION_WITH_TIMER for running
restarts. Preserve the signed transport and the existing remote action allowlist.
No new persistent state, timers, IPC channels or scheduler changes are needed.

Desktop start-time editing remains in MC Settings. Changing a running mission's
start time can end it, as specified before this feature; this change removes the
manual restart path, not all access to scheduling settings.

## Verification and handoff

Status: development and independent architecture, QA, security and UI review
complete. Both changes are ready for owner review; no merge or production release. Phone PR: [mc-remote #6](https://github.com/natanbr/mc-remote/pull/6).

- Desktop: component and structural tests must fail with the old Start controls;
  remote lifecycle tests must prove repeat starts and overlap refusal.
- Phone: test repeat eligibility after outcomes, disconnection/pending state and
  the restart confirmation/action contract.
- Run desktop unit suite, lint, complete typecheck and rebuilt isolated E2E;
  run phone tests, lint and build. Verify the actual UI before handoff.
- Branch in both repositories: `codex/phone-mission-starts`.
- Desktop checkout: `C:\Users\brnat\Documents\Projects\gcal-simplified`, based on
  `5686470` (latest main checked again before commit). Phone checkout:
  `C:\Users\brnat\Documents\Projects\mc-remote`, head `742559f`.
- Desktop: all **2,977 tests in 250 files**, lint and full `npm run tsc` passed.
  Dependencies were stale locally (Electron 40); `npm ci` restored the committed
  Electron 45.2.1 lockfile without changing it. All **34 rebuilt isolated Electron E2E tests passed** (13.7 minutes). The eight Google-authenticated calendar specs that use the real
  household profile are excluded from that run.
- Phone: **114 tests**, lint and production build/typecheck passed. The final
  diff also passes the whitespace check. Vercel's PR preview check passed:
  https://mc-remote-git-codex-phone-mission-starts-natanbrs-projects.vercel.app
- Interactive phone review at 390 x 844: repeat morning/evening starts, restart
  Cancel (no action), confirmed restart (one full-reset action), and disconnected
  and pending controls verified on real components with synthetic state only.
  The temporary fixture server was stopped afterwards.
- Review finding fixed: Stop has a separate eligibility rule, preserving its
  supported recovery of an active card when the global phase is none. Reset and
  restart retain their stricter running-phase checks.
- Desktop screenshot: `phone-only-start-settings.png` in the E2E Settings test's
  results. Both sections retain schedule fields without Start controls.
- No production deployment, release or merge was performed. The phone's Vercel
  preview is automatic PR infrastructure. Both PRs are for owner review.
