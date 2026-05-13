## 😈 DEVIL'S ADVOCATE: PLAN REVIEW

### EXECUTIVE SUMMARY
The plan is fundamentally sound and leverages Supabase Realtime for low-latency, "no-config" connectivity. However, it requires mandatory amendments regarding **security isolation (IPC)**, **dependency management**, and **visual feedback loops**. We recommend proceeding ONLY after addressing the "renderer-security" and "offline-state" concerns.

### 🛑 MANDATORY PLAN AMENDMENTS
1. **Security Isolation (Architect)**: Do NOT initialize `supabase-js` directly in the renderer. Move the Supabase connection to the **Main Process**. Pipe actions to the Renderer via a secure IPC channel (`remote-control:action`). This prevents leaking Supabase credentials in the renderer bundle and centralizes the "shared secret" verification.
2. **Dependency Bloat (Architect)**: `supabase-js` is heavy. Evaluate if we can use a simpler WebSocket or a lightweight alternative if we only need Broadcast. If using Supabase, ensure it's not bundled in the main UI until needed (lazy load).
3. **State Visibility (UX)**: The Electron app MUST show a "Connected Devices: 1" status when a phone is active. It's creepy if a remote device is controlling the UI with no indication.
4. **Offline Handling (PM)**: If the Supabase connection fails, the QR Code should be replaced with a "Connection Offline" warning.
5. **Action Validation (QA)**: The "Secret Key" check must happen in the Main process before dispatching to the store.

### ❓ OPEN QUESTIONS / CLARIFICATIONS
1. **Animation-only actions**: Do we need a new `type: 'TRIGGER_ANIMATION'` in `MCAction`, or do we use existing actions that have side-effect animations?
2. **Persistence**: Should the `room_id` and `key` persist across app restarts, or rotate for security? (Rotation is safer but requires re-scanning QR).
3. **Local Fallback**: Should we attempt a local-network (WiFi) connection first to avoid Supabase dependency for home-only use?

---

### DECISION
- [ ] Approved - Proceed with implementation
- [x] Needs Revision - Address Mandatory Amendments 1 & 2 (Main Process logic)
