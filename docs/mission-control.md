# Project Specification: "The Big Kid Command Center"

**Status:** Final Specification
**Role:** Project Manager / Tech Lead
**Target User:** 5-year-old child (pre-reading, relies on icons/spatial audio)

---

## Architecture & Technical Guidelines

### 1. Strict Application Isolation

"Mission Control" is treated as an entirely separate external module or plugin within the repository. It has absolute minimal interaction with the main Calendar application.

- **Zero Contamination:** Components, hooks, and utilities will not be imported from the parent directory (`src/components/`, etc.).
- **Independent Configuration:** Mission Control will have its own dedicated configuration state and settings view within its module. We won’t mix settings.

### 2. Directory Structure

To enforce this isolation, the application gets a dedicated domain envelope:

```text
src/
 └── mission-control/            <-- NEW: The isolated sandbox
      ├── MissionControl.tsx     <-- The master entry component for the new app
      ├── components/            <-- Pure UI: Vault, Goals, StatusBrow, DraggableToken
      ├── hooks/                 <-- Logic: usePhysics, useMissionTimer, useEconomy
      ├── store/                 <-- State: The Global Bank ledger, active missions
      ├── styles/                <-- Any specific raw CSS or tailwind constants
      ├── assets/                <-- Sound effects (.mp3)
      └── types.ts               <-- Strict typings: MissionState, Token, Reward
```

### 3. 2D Skeuomorphism

Instead of true WebGL/3D, we are executing a **2D Skeuomorphism** approach to give a 3D feeling:

- **Depth:** Extreme CSS layering, heavy drop-shadows, inset-shadows, and gradients.
- **Physics:** `framer-motion` handles drag gestures, spring animations, gravity simulations, and bouncy UI feedback rather than a rigid body engine.
- **Imagery:** High-quality, standard vector icons (e.g., `lucide-react`) combined with rich styling.

---

## 1. Requirements & Core Components

### A. The Global Bank (Vault)

- **Location:** Center-left of the main stage.
- **Component:** A highly textured 2D tray representing a vault, containing physical point tokens (coins).
- **Manual Override:** A large `(+)` button sits atop the bank to manually add points outside of scheduled missions.
- **Visual Logic:** Point counts are represented by actual stacks of animated coin divs. A "flick" or "drag" gesture moves tokens from the Bank to Goal Pedestals.

### B. The Goal Pedestals (Savings Interface)

- **Location:** Center-right of the main stage.
- **Component:** 2–3 glass "Display Cases" acting as savings buckets.
- **Workflow:**
  - **Selection:** Tap a `(+)` on an empty case to choose a reward (e.g., Movie, Popcorn, Fire icon).
  - **Funding:** Drag coins from the Bank to the case, or use the "Quick Transfer" (Vacuum) button to move all available funds.
  - **Refund:** A "Red Trash Lever" on the case tilts it, tumbling all coins back into the main Bank.

### C. The Status Brow (Privileges)

- **Location:** Top of the screen.
- **Component:** 4–5 backlit "License" cards (e.g., Knife, Scissors, Fire Tongs, Garden).
- **Parental Control:** Clicking a card triggers a popup with suspension durations (1 Day, 3 Days, 1 Week).
- **Visual State:** Suspended cards are covered by a yellow-and-black "Hazard" shutter with a red countdown timer.

### D. Time-Locked Mission Hubs (The Overlays)

- **Morning Mission (6:00 AM – 8:30 AM):** Focuses on T-shirt and Toothbrush tasks.
- **Evening Mission (7:00 PM – 8:30 PM):** A "Race the Sun" sequence.
  - **Tasks:** Shower, PJs, Cleanup, Toothbrushing.
- **Logic-Based Rewards:**
  - **Done by 7:30:** +1 Point.
  - **Done by 7:40:** Standard routine (Book, Talking, Sitting).
  - **Done by 7:50:** "Book" icon grays out.
  - **Done by 8:00:** "Talking" icon grays out.
  - **Done by 8:30:** System lockout.

---

## 2. UI/UX Specialist Input: Family-First Design

### Layout Strategy: The "n-Shape" Console

The interface should mimic a physical dashboard, creating a sense of "Big Kid" responsibility. By framing the screen with the Status Brow and Side Docks, the center becomes a clear "work zone" for managing rewards.

### Interactive Elements

- **Action Buttons:** Every button must have "depth." A press should look like it physically sinks into the dashboard using state-driven `box-shadow` and `transform` properties.
- **The "Vacuum" Effect:** When moving points to a goal, use a framer-motion sequence and sound to make the transfer feel powerful and irreversible.
- **Automatic Transitions:** At 7:00 PM, the Evening Mission should not just "appear"—it should slide down from the top like a heavy mechanical plate over the interface.

### Fun of Use

- **Tactile Physics:** `framer-motion` springs config should reflect weight. When a token is dropped into a chest, the chest div should animate a "shudder".
- **Consequence Visualization:** Graded rewards (the Evening Mission) should feel like a game. As the time passes 7:40 PM, the "Book" icon shouldn't just vanish—it should be covered by a physical metal grate to show it's "locked" for the night.

---

## Phase 1: Core Engine & Physics Setup

Before we build the vault, we need the "world" boundaries and interactions.

### Scene Initialization

- Create the layout using Tailwind CSS for the fixed "n-shape" interface.
- Implement reusable CSS classes for ambient occlusion (inner shadows) and soft drop shadows to guarantee depth.

### The Token Physics (Framer Motion)

- Create a Token component wrapped in `<motion.div>`.
- Configure `drag` constraints to the bounds of the screen/application space.
- Add `whileDrag` and `whileTap` scaling properties to emphasize when a token is lifted.

### The "Sink" Interaction Button

- Create a reusable `Button3D` component. On active state (PointerDown), reduce the drop-shadow and translateY to make the button "press into" the screen.

---

## Phase 2: The Global Bank (Vault)

This is the "Source of Truth" for the app's economy.

### The Vault Container

- Build the visual frame of the Vault using layered divs to imply depth (e.g., a dark inset shadow to simulate the bottom of a tray).
- Render a list of tokens based on the global state.

### The Manual Override (+)

- Place a large 3D button atop the tray.
- **Logic:** `onClick` -> Updates global state. The new Token should animate falling in from the top using a framer-motion `initial={{ y: -50 }}` to `animate={{ y: 0 }}` with a spring bounce.

### The Gesture Controller

- Tokens must be individually draggable.
- Use framer-motion's `onDragEnd` event to determine if the pointer is released over the bounding rect of a Goal Pedestal.

---

## Phase 3: Goal Pedestals (Savings Interface)

This is where the user "spends" their work.

### Display Case States

- Create three renders for the case based on its state:
  - **Empty:** shows `(+)` icon
  - **Selecting:** Render standard `lucide-react` icons to pick a reward type.
  - **Active:** Shows reward icon + tokens dropped in so far.

### The Vacuum (Quick Transfer)

- A button that updates the Token ownership in state from `Bank` to `TargetCase`.
- Provide an overarching animation (using AnimatePresence or layout animations) pulling all tokens across the screen.

### The Red Trash Lever

- A toggle component mimicking a heavy lever.
- **Logic:** Triggers a state flush from the Case back to the Bank. Visually animate the tokens popping out and falling back to the vault layout.

---

## Phase 4: The Status Brow (Privileges)

This acts as the "Notification Center" for what the kid is allowed to do.

### The License Cards

- Create a horizontal flex row at the top of the screen.
- Each card component accepts a Status: `Active`, `Suspended`, or `Locked`.

### Parental Popup

- Create a hidden "Admin Overlay" (triggered by a long press, implementing a custom React hook for delays).
- **Buttons:** "1 Day", "3 Days", "1 Week".

### The Hazard Shutter

- A `<motion.div>` that sits z-indexed above the card.
- **Logic:** If Suspended, animate the shutter sliding down (height 0 -> 100%). Overlay a countdown timer.

---

## Phase 5: Time-Locked Mission Hubs

This is the "Logic Engine" of the app.

### The Mechanical Plate Animation

- Create an "Overlay" component.
- Use framer-motion to slide it down `y: '-100%'` to `y: '0%'` with a heavy bounce transition.
- **Trigger:** Hook comparing system clock to hardcoded constraints (6:00 AM and 7:00 PM).

### The "Race the Sun" Logic

- Create a `useMissionTimer` hook that tracks progression from 7:00 PM.
- **7:30 PM Check:** If MissionsIncomplete, grant +1 point.
- **7:50 PM Check:** Trigger a visual lock on the Book Icon component and disable interactions.
- **8:00 PM Check:** Repeat for the Talking Icon.

### The System Lockout

- At 8:30 PM, trigger the final "Plate" state to cover the entire screen and disable pointers.

---

## Phase 6: Final Polish & Audio

### Assets

- Utilize Lucide React icons configured with consistent stroke weights and coloring.
- Source `.mp3` sound bites.

### Audio Integration

- Implement an audio player hook.
- Play heavy sliding sounds during the Mission Hub drop, clinks for drops, and satisfying clicks for all 3D buttons.
