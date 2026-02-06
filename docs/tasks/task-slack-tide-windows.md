# Task: Add Slack Tide Windows for Spearfishing

**Status: COMPLETED**

## Requirements

Add a "Best Times for Spearfishing" feature that calculates and displays slack tide windows - periods when ocean current speed is below 0.5kn, making conditions ideal for spearfishing and diving.

### Key Requirements

1. **Slack Window Calculation**:
   - Identify time windows around each slack tide where current speed remains < 0.5kn
   - Calculate window start/end times and duration
   - Determine tide height at slack time

2. **High Tide Slack Identification**:
   - Highlight slack periods occurring near high tide (upper 25% of tide range)
   - High tide slack is preferred due to better water clarity from fresh ocean water flooding in

3. **Display**:
   - Show next 5 upcoming slack windows
   - Display prominently with visual distinction for high tide slack
   - Include: date, time window, duration, tide height, current speed, and conditions

## Implementation

### Step 1: Documentation ✅

- Updated `docs/requirements.md` with slack tide window requirements
- Specified calculation method and display requirements

### Step 2: Unit Tests (TDD Red Phase) ✅

- Created `src/utils/slackWindows.test.ts` with 4 test cases:
  - Slack window boundary calculation
  - High tide vs low tide identification
  - Multiple slack windows handling
  - Edge case (slack at array boundary)
- All tests initially failed (no implementation)

### Step 3: Implementation ✅

**File**: `src/utils/slackWindows.ts`

- Created `calculateSlackWindows()` function
- Implements window detection by expanding from slack minimum until speed exceeds 0.5kn threshold
- Calculates high tide slack by comparing tide height to range (upper 25% = high tide)

**File**: `src/components/WeatherDashboard.tsx`

- Added import for `calculateSlackWindows`
- Added `slackWindows` useMemo hook to calculate windows from tide data
- Added "Best Times for Spearfishing" UI section with:
  - Card-based layout for each slack window
  - Emerald green highlight for high tide slack windows
  - Time range display (HH:mm - HH:mm)
  - Duration in minutes
  - Tide height, current speed, and peak time
  - Responsive grid showing conditions

### Step 4: Verification (Green Phase) ✅

**Unit Tests**: All 4 tests passing

```
✓ should calculate slack window boundaries correctly
✓ should identify high tide slack correctly
✓ should handle multiple slack windows
✓ should handle edge case where slack is at array boundary
```

**Integration**: Component successfully integrates slack windows into TidesPanel

## Files Modified

- `docs/requirements.md` - Added slack window requirements
- `src/utils/slackWindows.ts` - New utility function
- `src/utils/slackWindows.test.ts` - Unit tests
- `src/components/WeatherDashboard.tsx` - UI implementation

## Visual Design

- **High Tide Slack**: Emerald green background (`bg-emerald-500/10`) with "High Tide - Best!" badge
- **Regular Slack**: Standard zinc background
- **Layout**: Card-based with prominent time display and condition metrics
- **Responsive**: 3-column grid for condition details

## Next Steps

- E2E test to verify slack windows display in the UI
- Consider adding weather-based condition scoring (visibility estimate based on rain/wind)
- Potential enhancement: Add calendar integration to suggest dive times
