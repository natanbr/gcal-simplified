---
name: premium-ui
description: Craft guidance for building polished, tactile UI in gcal-simplified within its hard idle-CPU budget — motion timing, depth, typography, and the Framer Motion patterns that are safe in an always-mounted Electron tree. Use when building or refining any visual surface, when a UI "works but feels cheap", when adding animation or transitions, and when deciding how a new Mission Control component should look and respond.
---

# Premium UI, on a CPU budget

Most "premium web UI" advice assumes a marketing page: scroll-driven narratives, preloaders, magnetic cursors, WebGL. None of that applies here and some of it is actively harmful. This app is an Electron window that sits **open all day** with a documented rule that idle time must cost nearly nothing. Polish has to come from craft, not from continuous computation.

The bar: it should feel considered and physical, and it should cost zero CPU when nobody is touching it.

---

## Know which surface you're on

The two design systems are described in `CLAUDE.md` and `.claude/agents/ui-reviewer.md`. Short version:

- **Calendar view** — Tailwind, Inter, dark-mode-by-class. Purpose is *glanceability*: the user reads this from a distance, briefly, dozens of times a day. Information density and contrast beat decoration. Restraint here is the premium quality.
- **Mission Control** — `mc.css` `--mc-*` pastel tokens, Nunito, chunky pressable surfaces with depth and inset shadows. Purpose is *tactility*: a child taps it and it should feel like pressing a real button. Here, decoration is the point.

Designing a Mission Control component like a calendar component (or vice versa) is the most common way UI work here goes wrong. Ask which one you're on before choosing a treatment.

---

## Motion

**Timing.** Data reveals stay under ~400ms — the user wants the information, not the transition. Micro-interactions (press, hover, toggle) live around 120–200ms. Anything slower than about 500ms in a utility app reads as lag, not elegance.

**Physics over easing curves.** Framer Motion springs (`type: 'spring'`, tuned `stiffness`/`damping`) feel like objects with weight. Linear and generic `ease-in-out` feel like software. This matters most in Mission Control, where the whole visual language is "physical thing you press".

**Stagger sparingly.** A staggered entrance on a list of events is charming once and irritating on the twentieth render. Reserve entrance choreography for things that appear rarely — an overlay opening, a reward landing — not for content that re-renders on every data refresh.

**Press feedback is not optional in Mission Control.** A child who taps something with no response taps it five more times. Depth tokens (`--mc-btn-shadow` → `--mc-btn-pressed-shadow`) exist for exactly this. One documented exception: long-press affordances that are *deliberately* hidden from the child have no visual feedback by design — see the false-positive list in `project-journal`.

---

## The performance rules that constrain all of the above

These are not stylistic preferences; violating them shows up as the fan spinning on an idle screen.

- **Animate only `transform` and `opacity`.** Animating `width`, `height`, `top`, `margin` forces layout on every frame. This project already shipped that bug once — a "Syncing…" bar animating `width` forever.
- **No infinite loops in the always-mounted tree.** No `repeat: Infinity` in Framer, no `... infinite` in CSS, anywhere that stays mounted on the Calendar view. And note: fading a wrapper to `opacity: 0` does **not** stop a CSS keyframe loop. The element must unmount, or the animation class must come off.
- **In Framer, put infinite transitions inside a conditional `animate` object**, never on the top-level `transition` prop — the top-level form runs a 60fps loop even when visually static.
- **Long-running or ambient animation belongs in CSS `@keyframes`**, not Framer, so the compositor thread owns it instead of the main thread.
- **`will-change: transform` is a loan, not a gift.** Apply it to genuinely complex moving elements and remove it when the animation ends, or you leak GPU memory.
- **Respect `prefers-reduced-motion`.** Wrap non-essential motion in `@media (prefers-reduced-motion: no-preference)`. Accessibility is not a tradeoff against polish.

`perf-sentinel` enforces all of this, and `src/__tests__/timer-registry.test.ts` plus `idle-performance.test.tsx` fail the build for the worst violations.

---

## Depth, texture, type

**Depth via shadow pairs, not borders.** Mission Control's look comes from an outer depth shadow plus an inset highlight (`--mc-depth-shadow`, `--mc-inset-shadow`). Use the token pair; a lone `box-shadow` you invented will read as foreign.

**Glass with restraint.** `backdrop-filter: blur()` plus a thin semi-transparent border is a genuine premium signal, but it's expensive to composite and it destroys legibility over busy content. Use it for a modal or overlay layer, not for the surfaces the user reads all day.

**Type hierarchy is the cheapest luxury there is.** The calendar's scale already goes to extremes (`text-giant` 10rem, `text-mega` 4rem, `text-big` 2rem) — use them. Contrast in scale reads as intentional design; three sizes within 4px of each other reads as an accident.

**Never introduce a new colour.** If the value you want isn't a token, either an existing token is close enough or the design system needs an actual decision. Raw hex in a component is a finding, not a shortcut.

---

## The four states, always

A surface isn't finished until loading, empty, error, and success are all designed. In this app the "unhappy" states are the ones users see most often on a bad day — expired Google auth, network down, a weather fetch that returned nothing, a genuinely empty week. A blank panel with no explanation is the default failure, and it's the thing most likely to make the app feel broken rather than idle.

Empty states in Mission Control deserve particular care: a child seeing an empty mission list needs to know it's *done*, not *broken*.

---

## Libraries

Already available and appropriate: **Framer Motion** (transitions, springs, layout animation), **CSS keyframes** (ambient/looping), **Canvas API** (game rendering), **lucide-react** (icons), **recharts** (charts), **clsx** (conditional classes).

Do not reach for GSAP, Lenis, ScrollTrigger, React Three Fiber, or a scroll-hijacking library. There is no scroll narrative in a calendar window, and each of those adds bundle weight and main-thread work against a budget this project actively defends. If a design genuinely needs one, that's an architecture decision to raise, not a dependency to add mid-feature.
