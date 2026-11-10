# Design Direction

This file is the source of design direction for SM+ Toolbox. The product owner
stated the direction on 2026-11-09; this document records it so every UI
change can be checked against it. The owner is the author of the decisions
below, transcribed from that session; this file only formats them.

## Identity

SM+ Toolbox is the desktop companion app for ShadowMountPlus: image building,
verification, payload sending and troubleshooting in one place. It wraps a
command-line workflow so the user never has to live in a terminal.

## Brand soul: comfort and ease

Kenyamanan dan kemudahan (comfort and ease). The app should feel like a
well-made tool that removes work, not like a cockpit. Every screen answers
"what do I do next?" without shouting. Wording stays plain and honest: real
names, real states, no marketing buzzwords, no urgency.

## Visual language: modern minimalist, clean, professional

- Neutral, low-saturation surfaces carry the UI. One accent color carries
  meaning (actions, links, progress, focus). Both the dark and the light theme
  are first-class and must stay in sync.
- The accent is selectable in Settings; green is the default identity.
- The accent and status palette is our own, derived from the brand soul: calm,
  slightly desaturated tones rather than values borrowed from another
  product's design system. Light-theme accents are chosen dark enough to stay
  readable on their own soft tints. Exact values live in
  `src/renderer/src/styles.css` and are pinned by `test/palette.test.ts`.
- Typography is the native system stack (system-ui) with a monospace stack for
  paths, commands and file names. Reason: a desktop utility should feel
  native, start instantly and work offline; a webfont would add weight without
  adding character. Labels are sentence case; uppercase micro-labels are not
  part of this identity. Copy avoids the em dash character entirely.
- The app icon is a flat squircle in the brand green carrying a minimal
  two-peak range and a plus sign: a nod to the ShadowMountPlus name that
  borrows nothing from its witch-hat artwork. Colors come from the app's own
  tokens (#4db585, #1d6f4a, #11141a), and small sizes simplify progressively
  (one peak at 24 px, the mountain alone at 16 px).
- Layout: sidebar navigation, one focused view at a time, a build queue panel
  and a terminal dock at the bottom. Whitespace separates groups; the grid
  stays calm and predictable.
- The four action tiles on Home are intentionally uniform: they are
  navigation, not content, and a predictable grid is the comfortable choice
  for a utility app.
- The terminal dock keeps a dark surface in both themes, so its dimmed and
  status text colors always use the dark-theme values.

## Dials

ENERGY 1 / RHYTHM 1 / MOTION 1 (calm on all three).

- ENERGY 1: quiet surfaces, one accent, no decorative gradients or glows.
- RHYTHM 1: consistent cards and spacing; variation comes from content, not
  from layout experiments.
- MOTION 1: motion only as feedback (120-200ms transitions, hover states,
  view enter animations). `prefers-reduced-motion` is respected.

## How this file is used

Antislop (see `anti-slop/`) filters implementation work against this
direction. Audit reports live in `anti-slop/` with rising numbers. Any UI
change that deviates from a line above must either update this file with the
owner's approval or be reverted.
