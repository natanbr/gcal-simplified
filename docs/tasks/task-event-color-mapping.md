# Task: Event Color Mapping from Google Calendar

## Status

In Progress

## Objective

Extract event `colorId` from Google Calendar API and map it to the closest color in the current color schema, ensuring good text contrast.

## Requirements

### 1. Extract colorId from Google Calendar

- Modify `electron/api.ts` to extract the `colorId` field from Google Calendar events
- The `colorId` is already defined in the `AppEvent` interface but not being populated

### 2. Map Google Calendar Colors to Current Schema

Google Calendar uses 11 predefined event colors (colorId 1-11):

- **colorId 1**: `#a4bdfc` (Lavender/Light Blue)
- **colorId 2**: `#7ae7bf` (Sage/Green)
- **colorId 3**: `#dbadff` (Grape/Purple)
- **colorId 4**: `#ff887c` (Flamingo/Red-Orange)
- **colorId 5**: `#fbd75b` (Banana/Yellow)
- **colorId 6**: `#ffb878` (Tangerine/Orange)
- **colorId 7**: `#46d6db` (Peacock/Cyan)
- **colorId 8**: `#e1e1e1` (Graphite/Gray)
- **colorId 9**: `#5484ed` (Blueberry/Blue)
- **colorId 10**: `#51b749` (Basil/Green)
- **colorId 11**: `#dc2127` (Tomato/Red)

Current color schema (from EventCard.tsx):

- Blue: `bg-blue-500` (#3b82f6)
- Green: `bg-green-500` (#22c55e)
- Purple: `bg-purple-500` (#a855f7)
- Pink: `bg-pink-500` (#ec4899)
- Default: `bg-zinc-800` (#27272a)

### 3. Color Mapping Strategy

Map Google Calendar colors to closest Tailwind colors:

- colorId 1 (Lavender) → Blue
- colorId 2 (Sage) → Green
- colorId 3 (Grape) → Purple
- colorId 4 (Flamingo) → Pink/Red
- colorId 5 (Banana) → Yellow (new)
- colorId 6 (Tangerine) → Orange (new)
- colorId 7 (Peacock) → Cyan (new)
- colorId 8 (Graphite) → Gray/Default
- colorId 9 (Blueberry) → Blue
- colorId 10 (Basil) → Green
- colorId 11 (Tomato) → Red (new)

### 4. Priority Rules

The color assignment should follow this priority:

1. **Google Calendar colorId** (if present)
2. **Name-based colors** (Natan, Alon, Uval, Marta) - fallback if no colorId
3. **Default** (zinc-800)

### 5. Text Contrast

- Ensure all text has good contrast against the background
- Light backgrounds should use dark text
- Dark backgrounds should use white text
- Follow WCAG AA standards (contrast ratio ≥ 4.5:1)

## Implementation Plan

1. **Update API extraction** (`electron/api.ts`)
   - Add `colorId: event.colorId` to the event mapping

2. **Create color mapping utility** (`src/utils/colorMapping.ts`)
   - Map Google Calendar colorId to Tailwind classes
   - Include contrast-safe text colors

3. **Update EventCard component** (`src/components/EventCard.tsx`)
   - Modify `getEventColor` to check for `colorId` first
   - Fall back to name-based colors if no `colorId`
   - Apply appropriate text color for contrast

## Testing Requirements

### Unit Tests

- Test color mapping function with all 11 colorIds
- Test fallback to name-based colors
- Test default color when no colorId or name match

### E2E Tests

- Verify events with colorId display correct colors
- Verify events without colorId fall back to name-based colors
- Visual regression test for color contrast

## Acceptance Criteria

- [x] Events from Google Calendar display with their assigned colors
- [x] Color mapping is visually close to Google Calendar colors
- [x] Text contrast meets WCAG AA standards
- [x] Name-based colors still work as fallback
- [x] Unit tests pass (22/22 tests passing)
- [ ] E2E tests pass (pending authentication for full test)
