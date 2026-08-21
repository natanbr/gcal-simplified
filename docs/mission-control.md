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
      ├── games/
      │    ├── quiz/
      │    │    ├── types.ts              ← QuizQuestion / QuizGenerator interfaces
      │    │    ├── additionQuiz.ts       ← Addition question generator
      │    │    └── QuizOverlay.tsx       ← Reusable in-game quiz UI
      │    └── snake/
      │         ├── types.ts             ← Grid constants, game state types
      │         ├── useSnakeGame.ts      ← Game logic hook (state machine)
      │         ├── SnakeCanvas.tsx      ← Canvas renderer
      │         ├── SnakeGameOverlay.tsx  ← Full-screen overlay (entry point)
      │         └── snake.css            ← Overlay styles
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
| 🕹️    | Quick Game        | 1              |

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

## I. Quick Game (Snake + Math Quiz)

**Status:** ✅ Implemented & Working

### Overview

A "Quick Game" reward that costs 1 coin (configurable via parent settings' reward cost editor). The child drags coins to the goal pedestal as with any other reward. When consumed, a full-screen Snake game overlay opens.

**Prerequisite:** The reward only appears in the reward picker when the child's Total Wealth (coins in the bank + coins assigned to other active cases) is ≥ 10 (defined by the `MIN_WEALTH_FOR_GAMES` constant).

### Architecture (Separate Modules)

The game system is split into two independent modules under `src/mission-control/games/`:

#### Quiz Module (`games/quiz/`)

- **Extensible design:** `QuizQuestion` is a discriminated union on `kind` (`'numeric' | 'choice'`); each question type adds a generator, not a flag.
- **Maths generators:** `generateAdditionQuestion(maxSum = 20)` and friends, via `generateMathQuestion` — all take an injectable `rng`.
- **Reading generators:** `generateReadingQuestion(level, rng)` — see [Section J](#j-reading-practice--the-adaptive-quiz-engine). Which of the two a game gets is decided by the adaptive engine, not by the game.
- **Future expansion:** multiplication, subtraction, verbal challenges, writing/spelling.
- **UI:** `QuizOverlay.tsx` is the shared shell; it swaps the answer surface on `question.kind` — `NumericPanel.tsx` (numpad, keys 0-9/Backspace/Enter) or `ChoicePanel.tsx` (2×2 grid, keys 1-4). Progress dots and animated feedback (shake on wrong, checkmark on correct) are common to both.

#### Snake Module (`games/snake/`)

- **Game Loop:** `useSnakeGame.ts` hook — pure state machine: `waiting → playing → quiz-revive → game-over`.
- **Rendering:** `SnakeCanvas.tsx` — HTML5 Canvas with 20×15 grid, 32px cells (640×480). Gradient snake body, eyes on head that follow direction, radial-gradient apple with stem and leaf.
- **Controls:** Keyboard arrow keys only. Direction queue prevents 180° reversals. First keypress starts the game.
- **Lives:** 3 lives. On death, player enters quiz-revive phase (answer 3 questions). On all lives lost, game over.
- **Overlay:** `SnakeGameOverlay.tsx` — full-screen backdrop, dark glassmorphic container, header with score + lives + close button.

### Game Flow

1. Child consumes "Quick Game" goal → overlay opens.
2. Snake waits at center for first arrow key press.
3. Snake moves at constant speed (~6.7 ticks/sec). Eating apples increases score and snake length.
4. On collision (wall or self): lose 1 life. If lives > 0: quiz overlay appears (3 addition questions). Wrong answers give infinite retries. After 3 correct: snake revives at center, score preserved.
5. On 0 lives: Game Over screen. Press any arrow key to restart.
6. ESC or Close button ends the session.

### Activity Logging

- **Start:** Logged with 🕹️ icon when overlay opens.
- **End:** Logged with 🏁 icon including final score and play duration (e.g., "Quick Game ended — Score: 7 (2m 34s)").

### Backlog

- 🔇 **Background music** — fun music while game is active (TODO: requires audio asset pipeline).
- 🎨 **Sprite-based graphics** — replace canvas primitives with sprite images for richer visuals.
- 📱 **On-screen controls** — touch/click-based directional buttons for tablet use.
- 🧩 **More quiz types** — multiplication and subtraction (reading ✅ shipped, see Section J); configurable by age/topic in settings.
- 🎮 **More games** — Space Rescue (`blocks`) and Fruit Merge (`fruits`) have shipped alongside Snake, all using the shared quiz module. More still welcome.

---

## J. Reading Practice & the Adaptive Quiz Engine

**Status:** ✅ Implemented & Working (2026-08-20)

### Overview

The quiz module is no longer maths-only. Every quiz surface in every game now serves a **mix of maths and reading** questions, chosen by an adaptive engine that tracks an **invisible** reading level per child. The kid never sees a level, a score or a percentage — the level exists solely so the app can pick the questions that are worth asking. The parent sees all of it, behind a hold-gesture, in a Learning tab.

Reading questions are **multiple choice (4 options)** and share the paid-session economics of the existing quizzes: no new coin cost, no new reward, no new surface for the kid to discover.

### The Reading Ladder (L0 → L6)

Seven rungs, three question shapes. `generateReadingQuestion(level, rng, opts)` in
`games/quiz/reading/readingQuestions.ts` **is** the table — the switch there is the spec.

| Level | Shape | Prompt | Choices | What it actually trains |
|---|---|---|---|---|
| **L0** | word → picture | the word `dog` | 4 emoji, **all different initials** (dog / cat / fish / sun) | Confidence. Solvable by recognising the first letter alone — deliberately so. |
| **L1** | word → picture | the word `dog` | 4 emoji, **all the same initial** (dog / dino / dad / duck) | Forces reading past letter 1. |
| **L2** | picture → word | 🐕 | 4 short words, **distinct initials** | Reverse mapping: recall the spelling, don't just recognise it. |
| **L3** | picture → word | 🐕 | 4 **minimal pairs** (dog / dot / dig / dug) | Full decoding — one grapheme apart, no shortcut exists. |
| **L4** | missing letter | `_og` + 🐕 | 4 consonants | Onset/coda phonics on CVC words. |
| **L5** | missing letter | `d_g` + 🐕 | 5 vowels | Medial vowel — the hardest slot for early readers. |
| **L6** | either recognition mode | long word or its picture | 5–6 letter words, near-miss distractors | Applies everything to longer words. |

Content lives in `games/quiz/reading/`: `wordBank.ts` (74 curated `{word, emoji}` pairs +
`CONFUSABLE_EMOJI_GROUPS`) and `minimalPairs.ts` (`MINIMAL_PAIRS`, `LONG_WORD_DISTRACTORS`).

**Two content traps the generators actively avoid:**

- **Emoji ambiguity.** 🐕 and 🐩 are the same picture to a 5-year-old. `CONFUSABLE_EMOJI_GROUPS` + `pickNonConfusable()` guarantee no two choices in one question can be confused.
- **Two right answers.** In picture→word, a distractor whose *own* picture could be the prompt (`ship` under a ⛵) is a correct answer marked wrong. Distractor selection filters those out.

### First-Attempt Contract

Per the original brief: **only a first-attempt correct answer counts.** A miss is recorded as wrong
*and then the kid is allowed to keep hunting until they find the right one* — the question resolves
as `'found'` (soft success: no confetti, no penalty, no dead end), and the next question comes from
the same level. Wrong choices grey out and stay dead; the panel visibly freezes for the feedback
dwell so a mis-tap can't burn the retry.

**Mercy rule:** after `MERCY_MISS_THRESHOLD = 2` misses in a session, the engine backs off — a
struggling kid gets easier questions rather than a wall.

**Retrieval practice:** a missed word is re-queued and re-served `REQUEUE_AFTER_QUESTIONS = 3`
questions later, at the same level, via `forceWordId`. Spaced retrieval, not immediate repetition.

### Sampling (`quizEngine.ts`)

Pure functions, injectable `rng`, no store access:

- **Level mix — 20 / 60 / 20.** `sampleReadingLevel(current, stage, rng)`: 20% at `current − 1`
  (fluency + easy wins), 60% **at level**, 20% stretch to `+1` — or `+2` once the *game* stage is
  deep enough (`DEEP_STRETCH_STAGE = 2`), mirroring how maths difficulty already ramps with game
  progress. Shares collapse correctly at the floor (L0: no down) and cap (L6: no stretch).
- **Reading ⇄ maths mix — 40–60%.** `computeReadingShare()` starts at 50% and leans toward whichever
  subject is *weaker* by recent accuracy, clamped to `[READING_SHARE_MIN 0.40, READING_SHARE_MAX 0.60]`.
  The clamp is the point: neither subject can ever be squeezed out, however lopsided the child is.
  Weighting needs `MIN_ATTEMPTS_FOR_WEIGHTING = 5` attempts and looks back
  `WEIGHTING_LOOKBACK_DAYS = 14` days; below that it stays at the 50/50 base.

`useQuizEngine.ts` is the only store-facing piece. It is created **once** in `MCLayout` and injected
into games as a prop, so game modules stay store-free (the existing `onClose(score)` contract).
Session state and difficulty both reset in `beginSession`, so a level from one game can never leak
into the next.

### Level Movement (`store/skillProgress.ts`)

`applyQuizAnswer(progress, record, localDate)` is a pure function. `RECORD_QUIZ_ANSWER` is the
**only** writer of `skillProgress`.

- **Sliding window** of the last `WINDOW_SIZE = 20` at-level attempts.
- **Promote** at `PROMOTE_MIN_ATTEMPTS = 15`+ attempts with ≥ `PROMOTE_ACCURACY = 0.85` first-try accuracy.
- **Demote** below `DEMOTE_ACCURACY = 0.40` — quietly, and never below L0.
- **Fast-track:** `FAST_TRACK_STREAK = 5` in a row at L0–L2 (`FAST_TRACK_MAX_LEVEL`) promotes
  immediately, so a child who already reads isn't held for 15 questions on the confidence rungs.
- **The window always resets when the rule fires** — including at the floor and the cap, where the
  level can't actually move. Without that reset, a kid parked at L0 with a failing window would
  re-satisfy the rule on *every* subsequent answer and flood the log.

**Off-level attempts are counted separately** (`offAttempts` / `offFirstTry`). Stretch questions are
*supposed* to be missed; folding them into the headline accuracy would make deliberate challenge
look like a reading crisis to the parent.

Storage is bounded by design — `DAY_BUCKET_CAP = 60` days, `LEVEL_HISTORY_CAP = 50` level changes,
`MISSED_WORDS_CAP = 50` words — because this slice shares one `localStorage` blob with everything else.

### Invisible-Level Contract

Enforced structurally by `__tests__/skill-progress-boundaries.test.ts`:

- No level, score, streak or percentage renders on any kid-facing surface.
- The activity-log entry for a level change is deliberately neutral — **"Practice adjusted"**, 📖,
  `source: 'auto'` — because the log is reachable by the kid. It records *that* practice changed,
  not that they were promoted or demoted.
- `RECORD_QUIZ_ANSWER` is excluded from `createLogEntry` (`UNLOGGED_ACTIONS`), before the speculative
  reducer run — every answered question would otherwise be a log line and a full extra reduce.
- `skillProgress` **never rides the remote-sync broadcast**. A child's learning record is not phone
  data, and per-answer broadcasts would be a real network cost.
- `reading/` is private to `games/quiz/`; everything else reaches it through `quizEngine.ts` /
  `useQuizEngine`. The `skills/` domain sits *outside* `games/` so the store never imports upward.

### Parent View — Learning Progress

`components/progress/LearningProgressPanel.tsx` + `ProgressCharts.tsx`, reached via
**⚙️ → 📈 Learning with a 600 ms hold** (a plain tap is a no-op — the same hidden-gesture convention
as every other admin control here, see Design Principles). Charts are hand-rolled SVG; `recharts`
is in `package.json` but imported nowhere, and pulling it in for six small charts wasn't worth the
bundle. `SERIES_COLORS` is the single palette source and is CVD-validated.

Derivations are pure selectors in `skills/progressSelectors.ts`:

- **Momentum** — cumulative net (first-try correct − missed) over time, stock-chart style. This is
  the "how long, and what triggered the level-up" view: the run-up is visible, and level-change
  markers sit on the same axis.
- **Level log** — every change with `fromLevel → toLevel`, date, and the window that caused it, so a
  **demotion renders as honestly as a promotion**.
- **Weekly accuracy**, **daily volume**, **per-game totals**, **hardest words**.
- **Needs work** — weakest skills, gated at `NEEDS_WORK_MIN_ATTEMPTS = 10` so three unlucky answers
  don't get labelled a weakness.

Empty state (`"No practice yet"`) is a first-class case — a fresh profile is the normal state, not an error.

### Backlog

- ✍️ **Writing / spelling modes** — trace or type the word (explicitly deferred at design time).
- 🇫🇷 **French word bank** — the generators are language-agnostic; only `wordBank.ts` and
  `minimalPairs.ts` are English-specific.
- 🔊 **Audio** — dropped by decision, not oversight: phoneme audio was judged overkill for the
  current stage. Revisit only if the child stalls on L4/L5.

---

## Design Principles

- **2D Skeuomorphism:** depth via CSS layering, heavy drop-shadows, inset shadows, gradients
- **Physics feel:** `framer-motion` springs for drag, bouncy token drops, satisfying taps
- **Kid-first:** large targets, icons > text, pastel palette, no punishing interactions
- **Parent-first controls:** hidden gestures / tap zones for admin actions (no visible admin mode)
- **Audio (future):** heavy slide sounds for overlay, clinks for token drops
