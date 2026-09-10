# Space Rescue (blocks) — gesture controls review

**Date:** 2026-09-07 · **Branch:** `claude/tetris-gesture-controls-5c2036` (worktree `eloquent-jennings-2f6112`, based on `d5bc0b1` / 0.0.41) · **Status:** all three groups IMPLEMENTED and green, uncommitted. Nathan confirmed a Windows touchscreen and approved forgiveness snapping. See "What shipped" at the end.

## Decisions — answered 2026-09-07

1. **Device: Windows touchscreen.** Confirmed. The finger-only defects are the load-bearing ones.
2. **Forgiveness snapping: yes**, with the guard rails described under "What shipped" — bounded to
   0.75 of a cell, always previewed in green before release, and refused in red rather than guessed.
3. **Order: A, then C, then B.** All three are now implemented; see "What shipped".

The analysis below is kept as written at the time, so the reasoning can be audited against what was
actually built.

## What actually happened vs. what was expected

You saw a laggy drag where most misses returned the shape to the bank and some landed in the wrong place. Reading the drag path in [BlocksCanvas.tsx](../../src/mission-control/games/blocks/BlocksCanvas.tsx) I found **six concrete defects**, all reproduced by failing tests in [BlocksCanvas.gesture-defects.test.tsx](../../src/mission-control/games/blocks/BlocksCanvas.gesture-defects.test.tsx) (6/6 RED; the existing 50 blocks tests stay green). Mapping your two symptoms to them:

| Symptom the child hit | Defect behind it | Fix group |
|---|---|---|
| Lands in the **wrong spot** | The `pointerup` handler on `window` does not check **which pointer** lifted. A second finger or the edge of the palm touching the screen and lifting drops the shape at *that* pointer's position. A second finger's moves also steer the shape. | A |
| Lands in the **wrong spot** | The drop is recomputed from the `pointerup` coordinates instead of the green ghost the child was looking at. A finger rolls as it lifts, and the ghost is a React state update that can trail the finger by a frame, so "what was green" and "where it lands" can differ by a cell. | A |
| **Returns to the bank** most of the time, and pickup feels jumpy | The grab cell is computed by dividing the touch offset by the **48px board cell**, but the tray renders **36px** cells (rescue slot: **22px**). Grabbing a 4-wide bar by its 4th cell makes the code think you grabbed the 3rd, so the shape teleports under the finger at pickup. From then on the ghost is consistent with the proxy, but the child aims by where they *think* the piece is relative to their finger, and on a touchscreen the piece is under the hand. | A |
| Every miss looks like a glitch | The tray slot is blanked for 250 ms *before* the placement result is known and regardless of it, so a rejected drop makes the shape vanish and pop back. | A |
| Drag "dies" mid-gesture, proxy stuck on screen | No `pointercancel` handler. A cancelled touch (second contact, OS gesture, long-press) leaves `isDragging` true with a frozen proxy and a hidden tray slot until the next pickup. | A |
| Hard to aim, hand hides the target | The piece is centred **under the fingertip** (`-24px`), so on touch the piece *and* the ghost are hidden by the hand. Every commercial block puzzle lifts the piece above the finger for this reason. There is also zero tolerance: a drop half a cell off goes back to the bank. | B |
| Jank right after a line clear (when kids grab the next piece) | 8–16 cells animate `boxShadow`/`backgroundColor` per frame in Framer Motion (main-thread JS + repaint) with a stagger that runs to ~1.36 s against a 1.2 s reset, so cells snap back mid-animation. All of it composites through a full-screen `backdrop-filter: blur(4px)` that is invisible behind an 88 % black backdrop. | C |

Spec drift worth noting: [requirements.md line 132](../../docs/requirements.md) claims "native HTML5 pointer capture" and "0 ms scripting lag". There is no `setPointerCapture` call anywhere in the game; the listeners are plain `window` listeners, which is exactly why other pointers leak in.

## Ranked improvements (lowest complexity and risk first)

### 1. Pointer hygiene + drop where the ghost was — group A, one change
- Record the `pointerId` at pickup; ignore `pointermove`/`pointerup` from any other pointer; refuse a second `pointerdown` while a drag is live.
- Handle `pointercancel` (end the drag, unmount the proxy, un-blank the slot).
- Drop at the **last projected cells** (`lastHoverCoordRef` already exists), not at the lift coordinates. A tap-and-release with no movement therefore has no ghost and is a return-to-bank, not a drop. Ship this together with the pointer-id filter: the test file shows that alone, "drop at the ghost" would let a palm's move relocate the ghost.
- Blank the tray slot only when `placeShape` returned `true` (it already returns a boolean).
- **Complexity:** low (≈30–40 lines). **Risk:** very low; no change in feel except that wrong drops stop. **Side effect to plan for:** `BlocksCanvas.tsx` is already at its 362-line ratchet ceiling, so the drag logic should move into a `useShapeDrag` hook rather than raising the baseline.

### 2. Geometry: grab cell, proxy gap, board border — group A, same PR
- Compute the grab cell from the **rendered** cell size (pass `cellSize` through `onStartDrag`, or derive it as `rect.width / widthCells`).
- Render the drag proxy with the board's 4 px gap instead of the tray's 1.5 px so all cells of a 4- or 5-wide piece line up, not just the grabbed one.
- The projection overlay uses `inset: 8` but the board's 2.5 px border sits inside the rect it is measured against; the ghost is drawn 2.5 px up-left of the real cells. Same offset in `getGridCoord`. Cosmetic, one constant.
- **Complexity:** low. **Risk:** low, but *visible*: the piece stops teleporting at pickup, which the child will feel immediately.

### 3. Lift the piece above the finger and derive the ghost from the piece — group B, needs your decision
- On `pointerType === 'touch'`, position the proxy ~70–90 px above the fingertip (mouse keeps the current centring). This is the single biggest "I can see where it goes" win on a touchscreen.
- Once the piece is lifted, the ghost must be computed from the **piece's on-screen anchor** (round its top-left cell to the nearest grid cell), not from which cell the fingertip is in. This also removes the rule that the fingertip must be inside the board.
- Optional forgiveness (your call): if the rounded anchor is invalid, test the 8 neighbouring anchors and take the closest valid one within ~0.75 cell. With item 1 in place the ghost always shows exactly what will happen, so forgiveness cannot surprise the child.
- **Complexity:** medium. **Risk:** medium — it changes game feel and must be judged with the child in the running app, not by tests alone.
- **Test note:** the RED file constructs its `PointerEvent`s without `pointerType`, so it exercises the mouse-like path. The touch-only lift needs its own touch-typed tests; do not assume the existing file covers it.

### 4. Cut the paint work that competes with the drag — group C, standalone
- Remove `backdropFilter: blur(4px)` from the game overlay in [BlocksGameOverlay.tsx](../../src/mission-control/games/blocks/BlocksGameOverlay.tsx) (invisible behind `rgba(0,0,0,0.88)`; a full-screen blur is recomputed whenever anything under it changes). Consider the same for the 12 px blur on the "GOOD!" card, which sits right over the board for 1.2 s.
- Replace the Framer explosion in [GridCell.tsx](../../src/mission-control/games/blocks/GridCell.tsx) with a CSS keyframe on `transform` + `opacity` only (compositor-friendly, matches the project's own "CSS keyframes over Framer loops" learning), and cap the stagger so it finishes inside the 1.2 s reset. The 64 `motion.div` cells can become plain divs with a class; that removes 64 Framer instances from the board.
- **Complexity:** low–medium. **Risk:** low; the explosion will look slightly different. **Honesty note:** I have not profiled paint on the child's device; this is the standard-cost argument. The dev HUD only measures handler script time, not paint, so a DevTools performance trace on that machine is the proof.

### 5. Ref-driven ghost (no React state inside the drag loop) — fits naturally into group B
- Replace `setHoverCells`/`setHoverValid` with a pool of ≤9 absolutely positioned divs moved via `style.transform` from the same `pointermove` handler that moves the proxy, so the ghost is updated in the same frame as the finger and `BlocksCanvas` no longer re-renders on every cell crossing.
- **Complexity:** medium. **Risk:** low.

### Considered and not recommended now: a Canvas rewrite of the board
The proxy is already moved with a compositor-only `transform` on its own layer, and the per-frame DOM work is a ≤9-div overlay. A canvas board would be a rewrite of grid, cells, projection, explosion and feedback plus their tests and the style ratchet, for a bottleneck I cannot show exists. Revisit only if a trace on the child's device shows paint above ~8 ms per frame after group C.

## Recommendation and bottom line

Group A (items 1+2) is one small PR that removes every *wrong-spot* cause and the two things that make a miss look like a glitch. It can start straight from the RED tests via `/bug`. Group C (item 4) is an independent, low-risk PR. Group B (items 3+5) is the one that will change how the game *feels* and is where the "returns to the bank" rate will actually drop; it needs your decision on forgiveness and a session with the child on the real device.

## Evidence

```
npx vitest run src/mission-control/games/blocks
 ✓ types.test.ts (26)  ✓ useBlocksGame.test.ts (14)  ✓ RescueQuizLayer.test.tsx (4)
 ✓ BlocksCanvas.test.tsx (1)  ✓ BlocksGameOverlay.test.tsx (5)
 × BlocksCanvas.gesture-defects.test.tsx (6 tests | 6 failed)
   × grab cell is derived from the 36px tray cell size, not the 48px board size   (got anchor 3, expected 2)
   × a pointerup from a different pointer does not drop the shape                  (placeShape was called)
   × pointermove from a different pointer does not steer the dragged shape          (proxy followed pointer 2)
   × drops where the projection was last shown, not where the finger lifted        (got 3,3, expected 2,2)
   × pointercancel ends the drag                                                    (proxy still mounted)
   × a rejected drop leaves the tray shape visible                                  (opacity 0)
 Test Files  1 failed | 5 passed · Tests  6 failed | 50 passed
```

Also checked and ruled out: framer-motion 12 writes `transform: none` on the overlay once its intro spring settles (`motion-dom/effects/style/transform.mjs`), so the `position: fixed` proxy is not being re-parented into the panel; Electron sets no GPU or touch flags in `electron/main.ts`; the only continuous animations inside the game are compositor-driven CSS pulses.

## Follow-ups (not part of this review)
- Fix the spec line in `docs/requirements.md` (pointer capture, "0 ms scripting lag") in the same PR as group A.
- When group A lands, append the learning to the project journal (`architecture-patterns.md`, Games section): window-level pointer listeners must filter on `pointerId` and handle `pointercancel`, or use `setPointerCapture` on the grabbed element. Nothing is solved yet, so nothing was appended now.
- Noticed in passing, unverified in the browser: `GridCell` passes `boxShadow: 'none'` and `backgroundColor: 'transparent'` in its resting `animate` object, which Framer applies over the `style` prop, so the purple glow on debris cells and the 3.5 % white tint on empty cells may never render.
- The existing `BlocksCanvas.test.tsx` stubs the tray item at a 48 px pitch, which is exactly what hid defect 2; it should adopt the real `ShapeItem` like the new file does.

## How to see the defects in the current build
- Rest a second finger anywhere on the screen mid-drag and lift it: the shape drops at the second finger.
- Grab a 4-wide bar by its right-hand end: the piece jumps at pickup so a different cell sits under the finger.
- Drop a piece half a cell off a valid spot: it blanks in the tray for a quarter second, then pops back.

---

# What shipped (2026-09-07)

All three groups are implemented, uncommitted, and green: **962 unit tests pass**, `npm run lint`
and `npm run tsc` both exit clean. The spec is in `docs/requirements.md` under
"Drag-and-Drop (touchscreen-first)" plus the dated changelog entry.

## Decisions Nathan made
- **Device: Windows touchscreen.** The touch lift and the pointer-ownership fix are therefore the
  load-bearing ones.
- **Forgiveness snapping: yes, with a guard rail.** His concern was that snapping could put a block
  somewhere he did not intend. Three properties answer it, and all three are pinned by tests:
  the snap is capped at **0.75 of a cell** so a shape can never travel to a distant free spot; it is
  computed continuously and **always shown as the green ghost before release**, so a snap he does not
  want is corrected by keeping the finger moving; and when nothing valid is in reach the ghost turns
  **red where the shape actually is** and the lift returns the shape to the bank rather than guessing.

## Structure
The gesture left `BlocksCanvas.tsx`, which fell from 362 to 151 lines and is no longer on the
file-size debt list. It now lives in three focused units:
- `useShapeDrag.ts` — the gesture: pointer ownership, lift, projection, drop, teardown.
- `dragGeometry.ts` — pure maths, no DOM: pointer to shape position, rounding, snapping. This is the
  part that can put a block in the wrong place, so it is testable in isolation and has 22 tests.
- `dragPerf.ts` — the dev HUD's metering, split out so the gesture reads as gesture.

## A defect found only by measuring a real browser
The jsdom tests stub `getBoundingClientRect`, so they cannot see how Chromium actually lays the board
out. Rendering the board in a real browser showed the board's **2.5px border computes to 2px**:
Chromium snaps border widths to whole device pixels, and at the 125%/150% display scaling common on
Windows touch devices it lands somewhere else again. Every projection was therefore half a pixel out,
which is enough to flip the rounding for a shape sitting exactly on a cell boundary.

Two fixes, both "measure, do not assume":
- `measureBoardOrigin` reads the first cell's own rect at drag start instead of adding border and
  padding to the board rect. It falls back to the constants when layout reports nothing, which is the
  jsdom path.
- The projection overlay reproduces the board's box model (a transparent border of the same width
  plus the same padding) instead of insetting by their sum, so the browser applies identical rounding
  to both.

Verified in Chromium afterwards: a ghost cell and the real board cell underneath it match at **0px
offset in both axes**, same size.

## Browser evidence (real layout, not jsdom)
| Check | Result |
|---|---|
| Board cell size / pitch / tray cell | 48px / 52px / 36px — as the constants claim |
| Touch drag: shape lifted above fingertip | 78px, exactly 1.5 cells |
| Mouse drag: no lift | 0px, shape stays under the cursor |
| Ghost cell versus real board cell | 0px offset, identical size |
| Drop lands where the ghost showed | yes, in every case tested |
| Near miss with a valid neighbour 0.6 cells away | green ghost on the neighbour, placed there |
| Same miss with the nearest valid anchor a full cell away | **red ghost, nothing placed** |

## Review pass — three independent reviews, then a second round of fixes

Architecture, performance and test-coverage reviews were run over the finished change. The
performance pass found the drag hot path clean (zero React renders for moves inside a cell, one
commit per cell crossing, no layout reads per move, no impact on the idle Calendar). Both other
passes returned real defects, and all four of the serious ones are now fixed:

1. **The board origin was measured from a cell that animates.** `getBoundingClientRect` returns the
   *transformed* box, and cell (0,0) is the first cell to explode in any row-0 or column-0 clear.
   Measured in Chromium: a cell carrying the keyframe's 50% state (`scale(1.2) rotate(45deg)`)
   reports **81.5px instead of 48px, with its origin 16.7px out — 0.32 of a cell** — captured once
   at grab and held for the whole drag. The contaminated window is the ~800ms right after a clear,
   which is exactly when a child grabs the next piece. The geometry now comes from
   `getComputedStyle` on the board, which is transform-independent, and the same Chromium check
   shows the board origin **unchanged** while that cell is transformed.
2. **The ghost could go stale under a still finger.** The projection was only recomputed on pointer
   movement, but the line-clear timer rewrites the grid 1200ms later and can drop a meteor under a
   green ghost. Holding still through that and lifting gave a silent return-to-bank after seeing
   green. The projection is now recomputed when the grid changes, once per change.
3. **The 250ms success mask hid a shape that was really there.** When a placement empties the last
   tray slot the game deals three fresh shapes in the same React commit, so every third placement
   left a new shape invisible and un-grabbable for a quarter second. The mask is deleted; the frame
   it claimed to cover does not exist.
4. **The placement rule was written twice.** The ghost's validity check mirrored the game's own rule.
   Divergence would have shown a green ghost and silently refused it — the original symptom, with no
   failing test. Both now call one `placement.ts`.

Smaller fixes: the dev performance panel no longer blurs (it sat above the board and would land
inside any profile taken to check this work), the explosion stagger gained margin against the reset,
three comments that misstated their own mechanism were corrected, and a test that could not fail was
replaced with one that can.

**Test quality was checked by mutation, not by counting.** The reviewer broke each guard on purpose
and confirmed it went red for the right reason. Three mutations survived the original suite and are
now pinned: a frozen projection, a deleted success mask, and the measured-origin path — which turned
out to be dead code in every test, since jsdom reports the declared 2.5px border and so always took
the fallback branch.

## Still not verified, and only Nathan can
Game feel on the actual device. The 78px lift and the 0.75-cell radius are defensible defaults, not
values tuned against a real hand on a real screen. Both are named constants in `dragGeometry.ts`
(`TOUCH_LIFT_PX`, `SNAP_RADIUS_CELLS`) so they are cheap to retune after watching him play. Also
unconfirmed: that the device reports `pointerType === 'touch'`, which is expected for Windows touch
in Chromium but was not observed on that machine.

## Commit split

Three topical commits, ordered so each one is a single idea:

1. `perf: take the line-clear explosion off the main thread` — the CSS keyframe explosion with its
   stagger inside the reset window, and the two invisible `backdrop-filter` removals.
2. `fix: make the Space Rescue drag land where the child aimed` — the gesture rework: pointer-id
   ownership, `pointercancel`, drop-at-projection, honest grab cell, touch lift, bounded snapping,
   the measured board origin, and the extraction of `useShapeDrag` / `dragGeometry` / `placement` /
   `dragPerf`.
3. `docs: record the Space Rescue gesture rework and its review round` — the spec changelog, this
   brief, and the two project-journal learnings.

The gesture fixes and the touchscreen feel changes live in one commit rather than two: they rewrite
the same functions in the same files, so splitting them would produce a commit that does not stand
on its own.

## Follow-ups deliberately not done here
- No end-to-end coverage drives this drag. Playwright can synthesise pointer events but not a real
  hand, so the honest verification remains a session on the device.
- `TOUCH_LIFT_PX` (78px) and `SNAP_RADIUS_CELLS` (0.75) are defaults, not tuned values — they are
  the two numbers to tune with the child on the real screen.
- The dev `PerformanceHUD` measures handler script time, not paint. Confirming Group C actually
  helped needs a DevTools trace on the child's device, against a production build.
