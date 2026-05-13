# Requirements Brief: Mission Control UI Refinement

## 1. Remote App (mc-remote) Enhancements

### 1.1 Recycling Layout
- **Current**: Two buttons (+ and -) in a row.
- **New Layout**: 2-column grid.
  - **Column 1**: 
    - Row 1: Title ("Recycling")
    - Row 2: Current Points (e.g., "1 / 3")
  - **Column 2**: 
    - Row 1-2 (Span): Large "+1" button.
- **Visuals**: Premium styling, large touch target for the +1 button.

### 1.2 Activity Layout
- **Current**: Multiple buttons (Skating, Swimming, Karate).
- **New Layout**: Single button for all activities.
  - **Layout**: Same 2-column grid as Recycling.
  - **Column 1**: Title ("Activity") and Points (e.g., "0 / 3").
  - **Column 2**: Large "+1" button.
- **Icon**: Use Rollerblade emoji (🛼) if possible, otherwise keep Medal (🏅).

### 1.3 State Synchronization
- The Remote must reflect live point counts from the Host.
- **Mechanism**: Host broadcasts a `STATE_UPDATE` payload whenever relevant state changes.

## 2. Main App (gcal-simplified-main) Enhancements

### 2.1 Goal Pedestal Interaction
- **Change**: Show the "Delete" (Refund) button even when the goal is full/complete.
- **Rationale**: Allow users to undo a completion or move tokens back to the bank even after reaching the target.

### 2.2 Activity Log Refinement
- **Location**: ActivityLogView table.
- **Tokens Column**: Split into three distinct pieces of information:
  1. **Action**: 
     - Added (+ icon, Green) or Removed (- icon, Red) from the game.
     - Empty if tokens just moved between bank and goals.
  2. **Total Tokens**: Current total wealth (Bank + all Goal tokens).
  3. **Bank Tokens**: Current tokens in the bank.
- **Snapshot Logic**: The log entry must capture these counts at the moment of the action.

## 3. Success Criteria
- [ ] Remote shows live point counts for Recycling and Activity.
- [ ] Remote Recycling and Activity buttons follow the 2-row span layout.
- [ ] Main app allows deleting/refunding a completed goal.
- [ ] Logs show detailed token breakdown (Action, Total, Bank).
- [ ] All tests pass (Unit + E2E).
