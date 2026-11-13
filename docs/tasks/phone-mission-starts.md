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

## Status of the two repositories

- Desktop (this change): the Settings Start buttons are removed, the structural
  guard pins every sender of SET_ACTIVE_MISSION, and phone starts keep working
  with the phone on mc-remote main.
- Phone: [mc-remote #6](https://github.com/natanbr/mc-remote/pull/6) is **not yet
  merged**. It adds the confirmed Restart session button, the repeat-start labels
  and the disabled controls. Until it is merged the full Reset
  (RESET_MISSION_WITH_TIMER) stays allowlisted with no sender, and
  `useRemoteControl.drift.test.ts` is unchanged from main (mc-remote 7372b89).
  Update the drift test's captured list in the same change that merges the phone.

## Known gap (open owner decision)

Saving a new start time in MC Settings while a mission runs ends the run with no
outcome and stamps `lastActiveAt` before the new time. The scheduler then reads
the occurrence at the new time as not run and starts a fresh attempt with a full
timer. It can be repeated, so a child can dodge a miss. Past midnight, after a
miss in an overnight phase, a save that moves the start time to just after
midnight can pull the next day's occurrence forward the same way. After a miss is logged, a
same-day change of the start time starts nothing, because the scheduler reads
`lastCompletedOrFailed*Date`; `useRemoteControl.start.test.tsx` pins that. So
"only the phone starts a retry" holds for desktop gestures, not for this path.

## Verification and handoff

Status: development and independent architecture, QA, security and UI review
complete for the desktop change; the review follow-up of 2026-11-13 is in. No
merge or production release. The phone change is mc-remote #6, not yet merged.

- Desktop: component and structural tests must fail with the old Start controls;
  remote lifecycle tests must prove repeat starts and overlap refusal, a relaunch
  inside the open window after a logged miss, and a later start time after one,
  each with a control that does start without the logged outcome.
- Phone: test repeat eligibility after outcomes, disconnection/pending state and
  the restart confirmation/action contract.
- Run desktop unit suite, lint, complete typecheck and rebuilt isolated E2E;
  run phone tests, lint and build. Verify the actual UI before handoff.
- Branch in both repositories: `codex/phone-mission-starts`. Desktop base:
  `5686470` (latest main checked again before commit).
- Desktop at the first review: all **2,977 tests in 250 files**, lint and full
  `npm run tsc` passed. All **34 rebuilt isolated Electron E2E tests passed**
  (13.7 minutes). The eight Google-authenticated calendar specs that use the real
  household profile are excluded from that run.
- Desktop after the 2026-11-13 review follow-up: **2,984 tests in 250 files** (2,982
  passed, 2 skipped; three load-sensitive cases failed once in the full run and
  passed when re-run alone), lint and full `npm run tsc` clean, and
  `e2e/mc-settings.spec.ts` passed 5 of 5 on a rebuilt app.
- Phone: **114 tests**, lint and production build/typecheck passed. The final
  diff also passes the whitespace check. Vercel's PR preview check passed.
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
