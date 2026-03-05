# Graphics Status

All decorations are rendered procedurally on canvas — no external image assets are needed.

## Current Decorations (all procedural)

| Decoration | Style | Notes |
|---|---|---|
| Java Fern | 5 swaying bezier fronds with root clump | Subtle sway animation |
| Castle Ruin | Two towers, crenellations, arched doorway, moss | Stone texture lines |
| Coral Reef | Recursive branching coral, tube coral at base | Gentle sway, warm reds/oranges |
| Driftwood | Curved bezier log with branch stub, grain lines | Pulsing biofilm/moss patches |
| LED String Lights | 9-bulb catenary string, rainbow hues | Pulsing glow with `lighter` blend |
| Treasure Chest | Animated lid, gold glow, metal bands | Rising bubbles, sparkle effect |
| Rock Arch | Two pillars with arch span, dark opening | Hanging moss wisps with sway |

All decorations have both side view and top-down view renderers in `js/decorations.js`.
