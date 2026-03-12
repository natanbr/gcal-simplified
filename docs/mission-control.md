# Project Specification: "The Big Kid Command Center"

**Status:** Living Document — Active Development
**Target User:** 5-year-old child (pre-reading, relies on icons/spatial cues)

---

## Architecture & Technical Guidelines

### Strict Application Isolation

Mission Control is a self-contained module inside the repo. Zero contamination with the main Calendar app.

- All components, hooks, stores, and types live under `src/mission-control/`
- Entry point: `src/App.tsx?mc=1` → `<MissionControl />` (dev route)
- State: React context + `useReducer` via `MCStoreProvider` (`useMCStore.tsx`)
- Styling: isolated `mc.css` + inline styles only
- Persistence: `localStorage` key `mc-state-v3`

```text
src/
 └── mission-control/
      ├── MissionControl.tsx       ← root layout component
      ├── components/
      │    ├── GlobalBank.tsx
      │    ├── GoalPedestal.tsx
      │    ├── MissionOverlay.tsx
      │    └── DragLayer.tsx
      ├── hooks/
      │    ├── useMissionScheduler.ts
      │    └── useLiveClock.ts
      ├── store/
      │    └── useMCStore.tsx
      ├── styles/
      │    └── mc.css
      └── types.ts
```

---

## Current Implementation State

### ✅ Implemented & Working

#### A. Global Bank (Vault)

- Left column: animated coin tokens in a tray
- `(+)` / `(-)` buttons to manually add/remove coins
- Drag-and-drop tokens from bank to Goal Pedestals (hit-testing via DOMRect)
- Tokens can be dragged back from Goal Pedestals to the Global Bank
- **Initial bank count: 3 coins** (default, resets on storage key change)

#### B. Goal Pedestals (Savings Cases)

- 3 display cases with states: `empty → selecting → active`
- Reward picker with fixed coin costs (hardcoded, not configurable)
- Vacuum button: transfers all bank coins into the case at once
- Refund (trash lever): returns case coins to bank
- Tokens can be moved individually between active pedestals via drag-and-drop
- **Consume** (reward used): permanently removes tokens — no refund
- Case target count: 5 coins by default

#### Official Reward Catalogue

| Emoji | Reward            | Coins Required |
| ----- | ----------------- | -------------- |
| 🍿    | Movie + Popcorn   | 10             |
| 🎬    | Show              | 10             |
| 🔥    | Campfire          | 10             |
| 🎮    | Game              | 6              |
| 📖    | Extra Story       | 2              |
| 💻    | Story with Points | 2              |

#### C. Status Brow (Privileges)

- Top bar: 4 privilege cards (Knife 🔪, Scissors ✂️, Fire 🔥, Garden 🌱)
- Visual states: `active` / `suspended` (hazard overlay)
- **Known issue: clicking cards does nothing — suspension popup not implemented yet** (see Backlog #5)

#### D. Mission Overlay

- Slides down from top (`y: -100% → 0`) when a mission is active
- Header: phase emoji + title, large countdown timer (center), Hide / Reset buttons (right)
- Task cards: horizontal flex row, `flex: 1 1 auto`, max 20% width each (up to 5 cards fill the bar)
- Whining toggle card: compact 80px card pinned to the right of the task row
  - Toggle on = −1 bonus star, shown as a small pill badge
  - Resets when the mission resets
- All-done screen: shows 🎉, final star count (pre-reduced by whining toggle), "Collect" button
- Minimized pill: peeks from bottom, shows phase label and task progress (X/N)

**Depleting progress bar** (full-width stripe below the header):

- Fills from left to right; depletes as the mission runs.
- Progress formula: `pct = 1 − elapsed / totalMs` (anchored on `startedAt`) — **NOT** `remainingSecs / totalMs`.
  - The `startedAt`-anchored formula ensures the bar moves correctly even when `durationMins` is adjusted mid-mission.
  - _Bug fixed (2025-03-06): old `remainingSecs/total` formula caused the bar to jump in the wrong direction after a reduce-time action._
- **Long-press gesture (600ms)** to adjust remaining time while mission is active:
  - Long-press the **left half** of the bar → subtract 5 minutes
  - Long-press the **right half** of the bar → add 5 minutes
  - The bar cursor shows `pointer` when `onAdjust` is set.

#### E. Mission Scheduler (`useMissionScheduler.ts`)

- Polls every 30 seconds (+ immediate tick on mount)
- Uses a `stateRef` pattern to always read fresh state (stale closure bug was fixed)
- **Auto-trigger:** fires `SET_ACTIVE_MISSION` if current time is within `startsAt–endsAt` window and mission hasn't already been started today
- **Auto-deactivate:** fires `SET_ACTIVE_MISSION: 'none'` only when `startedAt + durationMins` countdown expires — NOT based on `endsAt` wall-clock (prevents premature dismissal)
- Task locking: locks tasks whose `locksAt` time has passed

#### F. Mission Timer

- `durationMins` computed from `(endsAt - startsAt)` when mission is activated via `SET_ACTIVE_MISSION`
- `startedAt` = ISO timestamp of activation
- Countdown in overlay uses `startedAt + durationMins` — works correctly for manual triggers at any time of day

#### G. Current Default Mission Config

| Mission | Starts At | Ends At | Duration |
| ------- | --------- | ------- | -------- |
| Morning | 06:00     | 06:30   | 30 min   |
| Evening | 19:00     | 20:00   | 60 min   |

**Evening tasks:**

| Task     | Icon             | Locks At                          |
| -------- | ---------------- | --------------------------------- |
| Shower   | Droplets 🚿      | —                                 |
| Cream    | Droplets 🧴      | _(Optional, drops off when days reach 0)_ |
| PJs      | Moon 🌙          | — _(see Backlog #4)_              |
| Clean Up | Sparkles ✨      | — _(see Backlog #4)_              |
| Teeth    | Smile 🦷         | — _(see Backlog #4)_              |
| Book     | BookOpen 📖      | 19:50                             |
| Bed      | BedDouble 🛏️     | —                                 |

**Morning tasks:** T-Shirt (👕), Teeth (🦷)

#### H. Parent Controls

- **Progress bar long-press gesture** (replaces old emoji gesture, removed 2025-03-06):
  - **Long-press LEFT half (600ms)** → subtract 5 minutes from `durationMins`
  - **Long-press RIGHT half (600ms)** → add 5 minutes to `durationMins`
  - No secret interaction on the emoji anymore.
- Manual mission triggers: ☀️ AM / 🌙 PM buttons in top bar

---

## Backlog (Prioritized)

### 1. Bank Management Subscreen

- Clicking the Bank icon opens a hidden management popup
- Options:
  - Add coin (manual)
  - Remove coin (manual)
- Hidden from child (parent-only feature, accessed via tap on bank header/icon)

### 2. Settings Screen

- Settings button on the Mission Control screen
- Configurable options:
  - **Morning mission:** scheduled trigger time (default 7:30 AM) + duration (default 30 min)
  - **Evening mission:** scheduled trigger time (default 7:00 PM) + duration (default 60 min)
  - **Routine Add-ons:** Toggle for "Put on cream" (evening task), with configurable days required logic.
  - **Privilege management** (see #5)

### 3. Mission Trigger & Timer Logic (Full Spec)

**Two trigger modes:**

**Manual:**

- Activated by ☀️ AM or 🌙 PM button
- Starts a new mission immediately
- Only one mission at a time — if one is already running, show the running one (don't reset)
- Duration comes from settings (default: morning 30 min, evening 60 min)

**Automatic:**

- Triggers at scheduled times (configurable in settings, default: morning 7:30 AM, evening 7:00 PM)
- Same behavior as manual once triggered

**Both modes:** mission panel stays visible until:

- Countdown timer reaches 0 (auto-close), OR
- User taps "Hide" (min pill shows at bottom, tapping restores it)

**Time adjustment gestures (current — triple-tap add is unreliable):**

- Long press emoji → −5 min ✅ working
- Triple tap → +5 min ⚠️ intermittent

**Proposed alternatives for time adjustment:**

- Option A: Two long-press zones — left half of emoji = −5 min, right half = +5 min
- Option B: Swipe left on emoji = −5 min, swipe right = +5 min
- Option C: Two small overlay buttons (−5 / +5) that appear on first tap of emoji → _simplest to implement_

### 4. Evening Mission Task Improvements

Icon replacements needed — find better Lucide icons:

| Task     | Current Icon  | Requested Change                      |
| -------- | ------------- | ------------------------------------- |
| PJs      | Moon 🌙       | Clothes/pajamas icon (e.g., `Shirt`?) |
| Clean Up | Sparkles ✨   | Toys / blocks icon                    |
| Teeth    | Smile 🦷      | Toothbrush icon                       |
| Book     | BookOpen 📖   | Keep                                  |
| Talking  | MessageCircle | **Remove this task**                  |

**Add:** Bed / "Going to bed" task at the end

### 5. Privilege Panel Improvements

**Current issues:**

- Clicking privilege icons does nothing (suspension popup not implemented)

**Requested functionality:**

- Clicking a privilege icon opens a parental control popup with:
  - Enable / Disable the privilege (hides it from the top bar if disabled)
  - Suspension duration picker (multi-choice: 1 Day, 3 Days, 1 Week)
  - _(Duration picker moves to Settings — remove from main screen)_
- Suspended cards show: **"X days left"** or **"X hours left"** if < 1 day remaining
- **Larger buttons** — easier to tap from a distance
- **Larger top bar overall:**
  - Larger ☀️ AM / 🌙 PM trigger buttons
  - Larger clock display

### 6. Future Ideas

- **Analog clock mode** — replace digital clock in top bar with a rendered analog clock face

---

## Design Principles

- **2D Skeuomorphism:** depth via CSS layering, heavy drop-shadows, inset shadows, gradients
- **Physics feel:** `framer-motion` springs for drag, bouncy token drops, satisfying taps
- **Kid-first:** large targets, icons > text, pastel palette, no punishing interactions
- **Parent-first controls:** hidden gestures / tap zones for admin actions (no visible admin mode)
- **Audio (future):** heavy slide sounds for overlay, clinks for token drops
