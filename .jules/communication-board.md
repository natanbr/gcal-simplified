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
| **TDD (RED)** | QA | 🟡 In Progress | Writing log snapshot tests |
| **Implementation** | Developer | ⚪ Waiting | |
|

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
