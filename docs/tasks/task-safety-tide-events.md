# Task: Safety Enhancements & Tide Events

**Status: COMPLETED**

## Requirements

1. **Filter Dark Hours from Spearfishing Best Times**:
   - Remove slack windows that occur during dark hours (before sunrise or after sunset)
   - Diving in darkness is too dangerous and should not be recommended

2. **Add High/Low Tide Events to Marine Events Table**:
   - Detect and display high tide (local maxima of tide height)
   - Detect and display low tide (local minima of tide height)
   - Show tide height for all events in the table

## Implementation

### Step 1: Documentation ✅

- Updated `docs/requirements.md` with safety filter requirement
- Added High Tide and Low Tide to marine events table requirements

### Step 2: Unit Tests (TDD Red Phase) ✅

- Added test in `src/utils/slackWindows.test.ts`:
  - "should filter out slack windows that occur during dark hours"
  - Test initially failed (no implementation)

### Step 3: Implementation ✅

**File**: `src/utils/slackWindows.ts`

- Added optional `sunrise` and `sunset` parameters to `calculateSlackWindows()`
- Implemented filtering logic to exclude windows outside daylight hours
- Returns only slack windows between sunrise and sunset when parameters provided

**File**: `src/components/WeatherDashboard.tsx`

- **Slack Windows**: Updated to pass sunrise/sunset from `weather.daily` data
- **Tide Events**: Added trend-based detection for tide height extrema
  - High Tide: Local maxima of tide height (blue color)
  - Low Tide: Local minima of tide height (cyan color)
- **Table Display**:
  - Added `tideHeight` property to event objects
  - Updated table to show tide height from event data
  - Added visual styling for High/Low Tide events
  - Show "-" for current speed on High/Low Tide rows (not applicable)
  - Increased event limit from 15 to 20 to accommodate tide events
  - Added sorting by time to ensure chronological order

### Step 4: Verification (Green Phase) ✅

**Unit Tests**: All 5 tests passing in `slackWindows.test.ts`

```
✓ should calculate slack window boundaries correctly
✓ should identify high tide slack correctly
✓ should handle multiple slack windows
✓ should handle edge case where slack is at array boundary
✓ should filter out slack windows that occur during dark hours
```

**Integration**: Component tests passing, no breaking changes

## Files Modified

- `docs/requirements.md` - Added safety filter and tide events requirements
- `src/utils/slackWindows.ts` - Added daylight filtering
- `src/utils/slackWindows.test.ts` - Added dark hours test
- `src/components/WeatherDashboard.tsx` - Integrated filtering and added tide events

## Visual Design

**Marine Events Table**:

- **Slack**: Green color
- **High Tide**: Blue color (`text-blue-300`)
- **Low Tide**: Cyan color (`text-cyan-300`)
- **Max Flood/Ebb**: Default zinc color
- Tide height column shows actual height for all events
- Current speed shows "-" for High/Low Tide events

**Best Times for Spearfishing**:

- Now only shows slack windows during daylight hours
- Automatically filtered using sunrise/sunset from weather data
- Safer recommendations for diving activities

## Safety Impact

This update significantly improves safety by:

1. **Preventing dangerous nighttime diving recommendations**
2. **Providing complete tidal information** for better dive planning
3. **Clear visual distinction** between different marine events
