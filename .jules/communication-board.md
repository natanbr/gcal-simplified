# 📋 Communication Board

## 📌 Pinned Decisions
- **Architecture**: Security Isolation (IPC). Supabase connection lives in the **Main Process**.
- **Security**: "Shared Secret" (Key) validated in Main before IPC dispatch.
- **Library**: Using `@supabase/supabase-js` for Broadcast only.

## 🏃 Active Sprint: Remote Control v1.0
**Goal**: Enable mobile web-app control for Mission Control.

| Task | Agent | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Requirements Brief** | PM | ✅ Done | [Blueprint](file:///c:/Users/dev/Documents/Projects/gcal-simplified-main/docs/tasks/remote-control-blueprint.md) |
| **Architect ADR** | Architect | ✅ Done | See below |
| **Setup & Dependencies** | Developer | ✅ Done | Installing supabase-js, qrcode.react |
| **Failing Tests (RED)** | QA | ✅ Done | Waiting for Developer setup |
| **Implementation** | Developer | ✅ Done | Implement Renderer Bridge (`useRemoteControl`) |
| **Validation** | PM/QA | ✅ Done | Validate End-to-End |

---

## 🏃 Active Sprint: Mission Control UI Refinement
**Goal**: Polish Remote UI, Log Columns, and Goal interactions.

| Task | Agent | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Requirements Brief** | PM | ✅ Done | [Blueprint](file:///c:/Users/dev/Documents/Projects/gcal-simplified-main/docs/tasks/mc-ui-refinement-brief.md) |
| **Architect ADR** | Architect | ✅ Done | [ADR](file:///c:/Users/dev/Documents/Projects/gcal-simplified-main/docs/tasks/mc-ui-refinement-adr.md) |
| UI/UX Mockups | UI/UX | ✅ Done | [Mockup](file:///C:/Users/dev/.gemini/antigravity/brain/b1498d5c-8310-4320-9159-5b55ae0f1196/mc_remote_new_layout_1778699074317.png) |
| **TDD (RED)** | QA | ✅ Done | 444 unit tests passing |
| **Implementation** | Developer | ✅ Done | v0.0.26 Released |
| **Snake Game Remote Controller** | Developer | ✅ Done | Added SnakeController to mc-remote and KeyboardEvent dispatch to gcal-simplified |

---

## 🏃 Active Sprint: Log Bounding & Performance (v0.0.31)
**Goal**: Resolve log list memory/rendering bloat and eliminate speculative reducer bottlenecks.

| Task | Agent | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Log Cap & Suppression** | Developer | ✅ Done | Capped logs at 200, silenced heartbeat logs |
| **Live Connection Indicator** | Developer | ✅ Done | Isolated status provider and top-bar pulsing status dot |
| **Log List Lazy Loading** | Developer | ✅ Done | Paginated logs (30 at a time) with IntersectionObserver |
| **Tech Debt Performance** | Developer | ✅ Done | deriveSnapshots helper (3x faster), syncCreamTask guards, interval cleanups |
| **Pre-release & Build** | QA/Dev | ✅ Done | Passed tsc, lint, and all 475 unit tests. Deployed v0.0.31 |

---

## 🏃 Active Sprint: Noto Emoji Animated Reactions (v0.0.33)
**Goal**: Add 10 new animated emoji reactions to both mobile remote and desktop overlays.

| Task | Agent | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Requirements Brief** | PM | ✅ Done | Added to [requirements.md](file:///C:/Users/dev/.gemini/antigravity/worktrees/gcal-simplified-main/mc-phone-games-privileges/docs/requirements.md) |
| **Type-Safe Union Definitions** | Developer | ✅ Done | Added `MCAnimationType` to `types.ts` |
| **High-Performance CDN Overlay** | Developer | ✅ Done | Added `NotoEmojiEffect` to `CelebrationOverlay.tsx` |
| **Mobile Reactions Grid** | Developer | ✅ Done | Added 5-column grid section in `mc-remote/MainController.tsx` |
| **Testing & Verification** | QA | ✅ Done | Passed all 467 unit tests and 28 E2E tests |

---

## 🏗️ Architect Decision Record (ADR)
**Topic**: Remote Control Bridge Security
**Status**: Approved
**Details**:
- `supabase-js` will NOT be initialized in the renderer.
- `electron/remote-bridge.ts` (Main) will handle the Supabase client.
- IPC Channel: `remote-control:action`.
- Payload: `MCAction`.
- Verification: Room ID and Key must match local `electron-store` values.

---

## 🔴 QA: TDD Status
**Status**: ⚪ Waiting
**Failing Tests Plan**:
1. `src/mission-control/hooks/useRemoteControl.test.ts`: Verify hook dispatches to `mcStore` on IPC message.
2. `electron/remote-bridge.test.ts`: Verify validation logic and IPC emission.
3. `e2e/remote-control.spec.ts`: Verify full flow from broadcast simulation to UI change.
