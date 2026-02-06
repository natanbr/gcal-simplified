# Task: Fix Tidal Event Detection Algorithm

**Status: COMPLETED**

## Problem

The tidal event detection algorithm was incorrectly identifying two slack tides one after another, which is physically impossible. The issue was caused by the simple peak/trough detection using strict inequalities (`s < prev && s < next`), which failed when the data contained plateaus (consecutive identical values).

### Root Cause

When ocean current speed data contained plateaus (e.g., `[0.1, 0.1, 0.6, 0.6, 0.1, 0.1]`), the strict inequality checks would fail to detect local extrema at the plateau points. This caused the algorithm to:

1. Miss legitimate max current events between slack periods
2. Detect multiple slack events in succession without intervening max events

## Solution

Replaced the simple peak/trough detection with a **trend-based state machine** that:

- Tracks the current trend (increasing/decreasing/unknown)
- Uses an epsilon threshold (0.001) to ignore noise
- Detects extrema when the trend changes direction
- Correctly handles plateaus by maintaining the trend state

### Implementation

**File**: `src/components/WeatherDashboard.tsx` (Lines 97-136)

The new algorithm:

1. Maintains a `lastTrend` state variable (-1: decreasing, 0: unknown, 1: increasing)
2. When trend changes from decreasing to increasing → detected a minimum (Slack)
3. When trend changes from increasing to decreasing → detected a maximum (Max Flood/Ebb)
4. Plateaus don't change the trend, so extrema are correctly identified

## Verification

1. **Debug Script**: Created and ran `debug-tides.ts` to analyze real API data
   - Before fix: Found 10+ instances of adjacent slack tides
   - After fix: Zero adjacent slack tides detected

2. **Unit Test**: Created `src/components/TidesPanel.test.tsx`
   - Tests plateau data pattern: `[0.5, 0.1, 0.1, 0.6, 0.6, 0.1, 0.1, 0.5]`
   - Verifies correct detection: Slack → Max → Slack
   - Asserts no adjacent slack events exist
   - **Test Status**: ✅ PASSED

## Related Files

- `src/components/WeatherDashboard.tsx` - Fixed algorithm
- `src/components/TidesPanel.test.tsx` - Unit test
- `electron/weather.ts` - Data source (unchanged)
