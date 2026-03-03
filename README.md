# Secret Life of Fishies

A mobile-first interactive fish tank simulator served as a static site. Tilt your phone to switch between side view and top-down view. Feed your fish, keep the water clean, and grow your collection.

## Features

- **Dual perspective** — tilt phone (or press V on desktop) to switch between side view and top-down view with smooth crossfade
- **Procedural fish** — 14 species drawn entirely with canvas paths (no image assets), each with unique body shapes, colors, and tail styles
- **Fish AI** — fish wander, seek food, eat, and respond to boops with playful animations
- **Nitrogen cycle** — realistic water chemistry simulation (ammonia → nitrite → nitrate) with visual water tinting
- **Progression system** — earn XP passively and through interactions, level up to unlock bigger tanks and new species
- **Fish store** — buy fish from a catalog of 14 species across 7 levels
- **Persistence** — auto-saves to localStorage with offline catch-up

## How to Play

1. **Feed fish** — switch to top-down view and tap to drop food
2. **Boop fish** — in side view, tap a fish for a playful swish (+1 XP)
3. **Maintain water** — open the menu drawer and tap "Change Water" to reduce toxins (+10 XP)
4. **Grow your tank** — earn XP to level up, unlock new species and bigger tanks
5. **Don't neglect** — hungry or stressed fish will eventually swim away

## Controls

| Action | Mobile | Desktop |
|--------|--------|---------|
| Switch view | Tilt phone | Press V or Space |
| Feed | Tap (top-down) | Click (top-down) |
| Boop fish | Tap fish (side) | Click fish (side) |
| Menu | Tap ☰ | Click ☰ |

## Tech

- Vanilla JS with ES modules, no build step
- HTML5 Canvas for all rendering
- localStorage for persistence
- Works on GitHub Pages over HTTPS
