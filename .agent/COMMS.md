# 📡 Agent Communication Board
> **Maintained by**: PM Agent
> **Protocol**: All agents read this file at the start of every session. All agents write here to communicate decisions, blockers, or handoffs.
> **PM responsibility**: Pin critical items to the top, summarize and delete handled temporaries, keep it concise and scannable.

---

## 📌 PINNED — Standing Decisions & Invariants

> These are permanent truths about this project. They do not expire. Do not overwrite without PM approval.

| # | Decision | Owner | Date |
|---|----------|-------|------|
| 1 | Always prefer CHS official data over Open-Meteo for currents. Open-Meteo is fallback ONLY with mandatory UI warning. | Hydrography Engineer | — |
| 2 | Slack/Max Current times MUST come from `wcp-hilo` endpoint, never calculated from hourly bins. | Hydrography Engineer | — |
| 3 | All UI must be responsive: phone, tablet, laptop breakpoints required. Premium "Abyssal Command" design system applies. | UI/UX Expert | — |
| 4 | Safety is non-negotiable. Data correctness takes priority over feature velocity. | PM | — |
| 5 | Developer starts implementation ONLY after PM has approved requirements AND Architect has signed off on approach. | PM | — |
| 6 | TDD Flow: QA writes failing tests before Developer begins. PM enforces this gate — no exceptions. | PM | 2026-04-08 |
| 7 | Dive windows: daylight-only by default. Night dives are opt-in (future filter). Minimum 30-min daylight buffer before sunset. | Hydrography Engineer | 2026-04-08 |
| 8 | Scoring: 5-factor weakest-link model (current 40, swell 20, wind 15, tide 15, viz 10). Strong current (≥1.5kn) = POOR cap. | Hydrography Engineer | 2026-04-08 (PROPOSED — pending user Q1) |

---

## 📬 ACTIVE THREADS

### 🔴 [FROM: QA + Hydrography Engineer → PM | 2026-04-09 | SAFETY CRITICAL — DO NOT CLOSE]
**Subject**: ✅ FIXED — Current data timezone bug identified and patched
**Body**:
**Root Cause Found**: UTC/PDT timezone mismatch in `mapChsDataToHourly()`.
- OM returns times as naive local strings (`"2026-04-08T00:00"` = PDT = UTC-7)
- CHS returns times as UTC strings (`"2026-04-08T07:00:00Z"`)
- They were the SAME moment but parsed differently → 7h offset → all CHS speed mappings returned `0` → `maxSpeed < 2.0` suspect guard triggered → Open-Meteo fallback

**Fix Applied** (`electron/weather.ts`):
- `mapChsDataToHourly` now accepts `utcOffsetSeconds` (from OM response `utc_offset_seconds`)
- OM naive strings parsed as UTC then adjusted by offset → timezone-agnostic alignment
- Also added CHS direction fetch (`wcdp1`) for Race Passage so directions come from CHS too
- Regression test added: `weather_marine.test.ts` — 18/18 tests GREEN

**Expected result after app restart**: Current speeds should match BW Dave values (Max Ebb ~4.5kn, Max Flood ~3.8kn for Apr 8).

**Action Required**: Developer to rebuild Electron app and user to verify data matches BW Dave.
**Status**: FIX SHIPPED — Awaiting user verification

---

### [FROM: PM → ALL AGENTS | 2026-04-08 | Temporary]
**Subject**: Sprint 6 kickoff — User feedback round
**Body**: User submitted 3 clusters of feedback on the dive window UX:
1. Night windows still appearing (P0 safety) — **T1**
2. Duration format, button label, detail panel placement, scoring redesign — **T2–T6**
3. Visibility label ambiguity (air vs water) — **T7**

Full Requirements Brief and task table in `implementation_plan.md`.
**Action Required**: All agents review the plan. Developer is BLOCKED pending 4 user Q&A answers.
**Deadline**: Urgent (awaiting user reply)

---

### [FROM: Hydrography Engineer → PM | 2026-04-08 | Temporary]
**Subject**: Scoring algorithm review — signed off with caveat
**Body**: The current 2-factor scoring model (current + tide only) is inadequate for a marine safety tool. A high-tide + strong-current window should never score GOOD. I have reviewed the proposed 5-factor model and sign off on it with one open question: should we emit an explicit safety warning when current_factor = 0, beyond just the POOR label?
**Action Required**: PM to surface Q1 to user. Pending answer before T4 begins.
**Deadline**: Urgent

---

### [FROM: UI/UX Expert → PM | 2026-04-08 | Temporary]
**Subject**: Detail panel placement + "Why FAIR?" label recommendation
**Body**:
- Right-side panel fails UX heuristic #4 (spatial consistency). Center modal is the clear choice for this layout — focus remains on the content, not on scanning across the screen.
- "See more →" is generic. "Why FAIR? →" (dynamic) is self-explanatory and reduces taps-to-understanding.
- Ready to generate a Stitch mockup of the center modal if user wants to approve before Developer begins.
**Action Required**: Awaiting Q2 and Q3 user answers. If user wants mockup, I'll generate immediately.
**Deadline**: Awaiting user reply

---

### [FROM: User/Critic (Jordan) → PM | 2026-04-08 | Temporary]
**Subject**: Night windows + Visibility label — field perspective
**Body**:
- 🔴 Night windows showing at 02:00 AM: unacceptable. I do not night dive. These must be gone.
- 🟡 "FAIR with low current and high tide" — I don't understand why. Show me the limiting factor on the card.
- 🟡 "Visibility: 4.2 km" — is that underwater or surface? Km is aviation units. This is confusing at the boat ramp.
**Action Required**: PM confirm T1 is treated as P0. T7 visibility labels are a quick fix — ship with T1.
**Deadline**: T1 urgent. T7 can follow immediately after.

---

### [FROM: PM → ALL AGENTS | 2026-04-09 | Sprint 8 Kickoff]
**Subject**: Sprint 8 — UI Polish + Sunrise/Sunset + Chart Sync
**Body**: User submitted 4 requests — all UI/presentation layer, no data safety implications.
1. R1: Table max-width on 4K — layout fix, trivial
2. R2: Sunrise/Sunset events — new event type in table + chart lines
3. R3: Tide direction arrows — replace `—` dashes with ↗↘ based on tide trend
4. R4: Table hover → chart highlight sync — shared state, new prop threading

Requirements Brief posted to `implementation_plan.md`. 3 open questions blocking full start — awaiting user answers.
**Status**: AWAITING USER APPROVAL

---

### [FROM: PM → ALL AGENTS | 2026-04-10 | Sprint 9 Kickoff]
**Subject**: Sprint 9 — Spearfishing Mode
**Body**: User requested a dedicated "Spearfishing" profile.
1. T1: New tab for activity switching.
2. T2: swell_period data integration.
3. T3: New scoring formula (Spearfishing-specific).
4. T4: Tactical tips in GuidePanel.
**Status**: AWAITING USER APPROVAL

---

## 📋 CURRENT SPRINT TASKS

| ID | Task | Assigned To | Status | Notes |
|----|------|-------------|--------|-------|
| S7-T1 | Night filter audit + fix | QA → Developer | ✅ DONE | Shipped — all T1 regression tests GREEN |
| S7-T2 | Duration format humanization | Developer | 🟡 READY | No blockers |
| S7-T3 | "Why FAIR?" button label | Developer | 🔴 BLOCKED | Awaiting user Q3 |
| S7-T4 | Scoring algorithm redesign | Hydro + Developer | 🔴 BLOCKED | Superseded by S9 — see below |
| S7-T5 | Center modal detail panel | Developer | 🔴 BLOCKED | Awaiting user Q2 |
| S7-T6 | Score breakdown bars | Developer | 🔴 BLOCKED | Blocked on S7-T4/S9-T4 |
| S7-T7 | Visibility label clarification | Developer | 🟡 READY | No blockers |
| **S8-R1** | Table max-width (4K fix) | Developer | ⏳ PENDING | Awaiting user approval |
| **S8-R2** | Sunrise/Sunset events | Developer | ⏳ PENDING | Q1 open (all 7 days vs today only) |
| **S8-R3** | Tide direction arrows | Developer | ⏳ PENDING | Q3 open (alone vs alongside height) |
| **S8-R4** | Table hover → chart sync | Developer | ⏳ PENDING | Awaiting user approval |
| **S9-T1** | Spearfishing tab (ActivityProfile + switcher) | Developer | ✅ DONE | 3-tab switcher live — Spearfishing added as primary tab |
| **S9-T2** | swell_period column in MarineEventsTable | Developer | ✅ DONE | Period column shown in seconds, amber color when < 6s |
| **S9-T3** | Spearfishing Q-score formula + useSpearfishingWindows hook | Hydro + Developer | ✅ DONE | 13 tests GREEN — No-Go filters + Q = (V+F) - W |
| **S9-T4** | GuidePanel — Spearfishing tactical tips section | Developer | ✅ DONE | 4 tactical tips shown when spearfishing tab active |

---

## ✅ RECENTLY RESOLVED (Last 6)

| Sprint | Task | Resolution |
|--------|------|-----------|
| 7 | T8 — Dive window expansion bug (12–17h windows) | Fixed: midpoint territory bounds in calculateSlackWindows(). 24/24 tests GREEN. |
| 7 | T9 — Chart day separator lines | Shipped: vertical ReferenceLine at midnight + "Wed, Apr 8" label |
| 7 | T10 — Chart 1h resolution | Shipped: removed 3x thinning, every hourly point rendered |
| 7 | T11 — Night overlay on chart | Shipped: darkened ReferenceArea bands (sunset→sunrise), sunrises/sunsets wired from weather |
| 5d | DebugPanel + useDataAssertions | Shipped — dev-mode verification screen live |
| 5d | Solar hard block (solarAvailable flag) | Shipped — no dive windows without solar data |
