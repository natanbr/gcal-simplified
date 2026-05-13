# Architect Decision Record: Mission Control UI Refinement & State Sync

## 1. Remote State Synchronization
- **Challenge**: The remote app is currently "write-only" (sends actions but doesn't see state). The user wants to see point counts on the remote.
- **Solution**: Implement a "push" state sync from the Host (Electron) to the Remote (Mobile Web).
- **Implementation**:
  1. **Main Process**: Add `ipcMain.handle('remote:sync-state', (state) => remoteBridge.broadcastState(state))`.
  2. **Remote Bridge**: Update `broadcastState` to send a `state-update` event with a subset of the MC state.
  3. **Renderer (Host)**: Use a `useEffect` in `useMCStore.tsx` (or a dedicated sync hook) to debounced-send relevant state chunks to the Main process.
  4. **Remote App**: Add a `gameState` state to `useRemoteControl` hook, listening for `state-update` broadcasts.

## 2. Activity Log Schema Extension
- **Challenge**: Logs need more metadata for the 3-column token display.
- **Solution**: Extend `ActivityLogEntry` type.
- **New Fields**:
  - `totalTokens`: number (sum of bank + all cases)
  - `bankTokens`: number (current bankCount)
- **Log Logic**:
  - `ADD_LOG` action in `mcReducer` will expect these fields.
  - Action creators (or components) must calculate these snapshots before dispatching `ADD_LOG`.

## 3. Remote Layout
- **Pattern**: Use CSS Grid for the 2-column, 2-row layout.
- **Class**: `grid grid-cols-[1fr_auto] grid-rows-2`.
- **Button Span**: Use `row-span-2` on the `ControlButton`.

## 4. Goal Refund Logic
- **Change**: In `GoalPedestal.tsx`, remove the conditional that hides the refund button when `isComplete` is true.
- **Visuals**: Maintain the `Button3D` styling.

## 5. Security
- **Isolation**: State sync continues to use the validated `remoteKey`.
- **PII**: Ensure no sensitive calendar data is broadcasted; only MC-specific counts/flags.
