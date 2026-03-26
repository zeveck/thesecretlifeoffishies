# Plan: Enable booping fish while in visit mode

## Overview
Currently, tapping fish in visit mode calls `fish.boop()` (via `handleTap()` in main.js line 186), which sets `state='booped'` and `boopTimer=0.6`. However, `updateVisitMode()` (fish.js lines 711-744) never decrements `boopTimer` and never transitions back to `'wandering'`, so the fish freezes permanently in `'booped'` state. Additionally, `boop()` modifies `this.strength` which should not change for visitor fish.

This plan adds a lightweight `boopVisit()` method to Fish that skips stat changes, updates `updateVisitMode()` to handle the boop timer, and wires up a visit-mode branch in `handleTap()` that skips XP, breeding bonuses, and easter egg tracking.

## Progress Tracker
| Phase | Status | Commit | Notes |
|-------|--------|--------|-------|
| 1 — Fish model changes | :white_large_square: | | boopVisit + updateVisitMode boop handling |
| 2 — Main.js visit mode tap handling + tests | :white_large_square: | | handleTap visit branch, unit tests |

## Phase 1 — Fish model changes

### Goal
Add a `boopVisit()` method to Fish that triggers the boop animation without modifying stats, and update `updateVisitMode()` to decrement `boopTimer` and transition back to wandering.

### Work Items
- [ ] Add `boopVisit()` method to the `Fish` class in `js/fish.js`, immediately after the existing `boop()` method (after line 268). The method should:
  ```js
  boopVisit() {
      if (this.state === 'booped') return;
      this.state = 'booped';
      this.boopTimer = 0.6;
      // No strength change — visitor fish stats are immutable
      this.targetHeading = this.heading + (Math.random() > 0.5 ? 1 : -1) * rand(1.5, 2.5);
  }
  ```
  This is identical to `boop()` (lines 261-268) except it omits the `this.strength = clamp(this.strength + 5, 0, 100)` line at line 265.

- [ ] Modify `updateVisitMode(dt)` in `js/fish.js` (lines 711-744) to handle `boopTimer` and skip wandering AI while booped. Insert boop timer handling at the top of the method, right after the opening brace on line 711. The full updated method should be:
  ```js
  updateVisitMode(dt) {
      // Boop timer — skip wandering AI while booped
      if (this.boopTimer > 0) {
          this.boopTimer -= dt;
          if (this.boopTimer <= 0) {
              this.state = 'wandering';
              this.stateTimer = rand(2, 5);
          }
      }

      // Wandering AI (skip if booped)
      if (this.state !== 'booped') {
          this.stateTimer -= dt;
          if (this.stateTimer <= 0) {
              // ... existing wander target logic (lines 715-723 unchanged)
          }
          this.targetHeading = angleTo(this.x, this.z, this.wanderTarget.x, this.wanderTarget.z);
          const dy = this.wanderTarget.y - this.y;
          this.targetPitch = clamp(dy * 0.06, -0.4, 0.4) + Math.sin(this.tailPhase * 0.3) * 0.1;
      }

      // Movement (always runs — booped fish drift in their new direction)
      this.heading = lerpAngle(this.heading, this.targetHeading, 5 * dt);
      this.pitch = lerp(this.pitch, this.targetPitch, 5 * dt);
      const spd = this.speed * 0.8 * 0.16 * dt;
      this.x += Math.cos(this.heading) * Math.cos(this.pitch) * spd;
      this.z += Math.sin(this.heading) * Math.cos(this.pitch) * spd;
      this.y += Math.sin(this.pitch) * spd;

      // Boundaries
      this.x = clamp(this.x, 5, 95);
      this.y = clamp(this.y, 5, 95);
      this.z = clamp(this.z, 5, 95);

      // Tail animation — faster wag when booped
      const wagSpeed = this.state === 'booped' ? 18 : 8;
      this.tailPhase += wagSpeed * dt;
  }
  ```
  Key changes vs. current code:
  1. Add boop timer block (6 lines) at top
  2. Wrap the wandering AI block (lines 713-727) in `if (this.state !== 'booped')`
  3. Change tail animation from hardcoded `this.tailPhase += 8 * dt` (line 743) to use `wagSpeed` ternary matching the pattern from `update()` line 158

### Design & Constraints
- `boopVisit()` must NOT modify `hunger`, `strength`, `happiness`, or any stat. Visitor fish stats are display-only and must remain immutable for the "does not change hunger or happiness" test (fish.test.js lines 622-634).
- Movement must always run even during boop, so the fish visually darts away (same behavior as normal mode where movement runs regardless of state in `update()` lines 130-155).
- The existing `boop()` method must remain unchanged -- it is used for the player's own fish.

### Acceptance Criteria
- [ ] `boopVisit()` sets state to `'booped'` and boopTimer to 0.6
- [ ] `boopVisit()` does NOT modify strength, hunger, or happiness
- [ ] `boopVisit()` is a no-op if already booped (same guard as `boop()`)
- [ ] `updateVisitMode()` decrements boopTimer and transitions back to wandering when it expires
- [ ] `updateVisitMode()` skips wandering AI target selection while state is `'booped'`
- [ ] Tail wag speed is 18 during boop, 8 otherwise in visit mode
- [ ] Existing `updateVisitMode` tests still pass (movement, bounds, no stat changes, tail animation)

### Dependencies
None -- this phase modifies only `js/fish.js`.

## Phase 2 — Main.js visit mode tap handling + tests

### Goal
Wire up `handleTap()` to call `boopVisit()` + visual/audio effects when in visit mode, skipping all XP, breeding, and easter egg logic. Add unit tests for the new `boopVisit()` method and the updated `updateVisitMode()` boop handling.

### Work Items
- [ ] Modify `handleTap()` in `js/main.js` (lines 146-231) to add a visit-mode branch. The current side-view boop code is at lines 180-229. Insert a visit-mode check right after the `if (viewAngle > 0.9)` block's closing brace (line 178) and before the current `else` block (line 179). The restructured code should be:
  ```js
  } else if (visitMode) {
      // Visit mode: boop with visual/audio effects only — no XP, breeding, or easter eggs
      for (const fish of fishes) {
          const sx = tankLeft + (fish.x / 100) * tankW;
          const sy = tankTop + (fish.y / 100) * tankH;
          const size = fish.getSizePixels();
          if (dist(px, py, sx, sy) < size * 1.5) {
              fish.boopVisit();
              addBoopEffect(sx, sy);
              playBoopSound();
              break;
          }
      }
  } else {
  ```
  This replaces the existing `} else {` at line 179 with `} else if (visitMode) { ... } else {`. The hit detection logic (lines 181-185) is duplicated exactly but calls `fish.boopVisit()` instead of `fish.boop()`, and omits everything from line 187 to 223 (lastInteractionTime, XP cooldown, breed bonuses, easter egg tracking).

- [ ] Add unit tests to `tests/unit/fish.test.js`. Append the following test blocks after the existing `Fish.updateVisitMode` describe block (after line 643):

  **Test block 1: `Fish.boopVisit`**
  ```js
  describe('Fish.boopVisit', () => {
      it('sets state to booped', () => {
          const species = SPECIES_CATALOG[0];
          const fish = new Fish(species);
          fish.boopVisit();
          assert.strictEqual(fish.state, 'booped');
      });

      it('sets boopTimer to 0.6', () => {
          const species = SPECIES_CATALOG[0];
          const fish = new Fish(species);
          fish.boopVisit();
          assertCloseTo(fish.boopTimer, 0.6);
      });

      it('does NOT change strength', () => {
          const species = SPECIES_CATALOG[0];
          const fish = new Fish(species);
          fish.strength = 50;
          fish.boopVisit();
          assert.strictEqual(fish.strength, 50);
      });

      it('does not boop again while already booped', () => {
          const species = SPECIES_CATALOG[0];
          const fish = new Fish(species);
          fish.boopVisit();
          const timer = fish.boopTimer;
          const heading = fish.targetHeading;
          fish.boopVisit();
          assert.strictEqual(fish.boopTimer, timer);
      });

      it('changes target heading on boop', () => {
          const species = SPECIES_CATALOG[0];
          const fish = new Fish(species);
          const originalHeading = fish.targetHeading;
          fish.boopVisit();
          assert.notStrictEqual(fish.targetHeading, originalHeading);
      });
  });
  ```

  **Test block 2: `updateVisitMode boop handling`**
  ```js
  describe('Fish.updateVisitMode boop handling', () => {
      it('decrements boopTimer during visit mode', () => {
          const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
          const fish = Fish.createVisitor({ speciesName: 'Guppy' });
          fish.boopVisit();
          assert.strictEqual(fish.state, 'booped');
          fish.updateVisitMode(0.3);
          assertCloseTo(fish.boopTimer, 0.3);
          assert.strictEqual(fish.state, 'booped');
      });

      it('transitions back to wandering when boopTimer expires', () => {
          const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
          const fish = Fish.createVisitor({ speciesName: 'Guppy' });
          fish.boopVisit();
          // Run enough dt to expire the 0.6s timer
          fish.updateVisitMode(0.7);
          assert.strictEqual(fish.state, 'wandering');
          assert.ok(fish.boopTimer <= 0);
      });

      it('uses faster tail wag during boop', () => {
          const species = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
          const fish = new Fish(species, 50, 50, 50);
          const phaseBefore = fish.tailPhase;
          fish.boopVisit();
          fish.updateVisitMode(1);
          // wagSpeed 18 vs normal 8 — phase should advance by 18
          const phaseAdvance = fish.tailPhase - phaseBefore;
          assertCloseTo(phaseAdvance, 18, 0);
      });

      it('does not change stats after boop + recovery cycle', () => {
          const fish = Fish.createVisitor({ speciesName: 'Guppy' });
          const startHunger = fish.hunger;
          const startStrength = fish.strength;
          const startHappiness = fish.happiness;
          fish.boopVisit();
          for (let i = 0; i < 60; i++) {
              fish.updateVisitMode(1 / 60);
          }
          assert.strictEqual(fish.hunger, startHunger);
          assert.strictEqual(fish.strength, startStrength);
          assert.strictEqual(fish.happiness, startHappiness);
      });
  });
  ```

- [ ] Verify all existing tests still pass by running `npm run test:unit`.

### Design & Constraints
- The visit-mode `handleTap` branch must NOT call `addXP()`, modify `lastInteractionTime`, touch `breedTimers`, or update `easterEggBoops`. These are all local-player-only concerns.
- The visit-mode branch must NOT call `usePellet()` or `addFood()` in top-down view. The existing `if (viewAngle > 0.9)` block at lines 156-178 should also be guarded. Add `if (visitMode) return;` at the very top of `handleTap()`, right after the `showFishLabels` dismissal block (after line 152), but ONLY for the top-down case. Actually, the cleaner approach: the `else if (visitMode)` branch handles side view booping; for top-down view during visit mode, taps should simply do nothing. Add a guard at line 156: change `if (viewAngle > 0.9)` to `if (viewAngle > 0.9 && !visitMode)`.

  So the full conditional chain becomes:
  ```js
  if (viewAngle > 0.9 && !visitMode) {
      // Top-down: place food or ripple (lines 157-178, unchanged)
  } else if (visitMode) {
      // Visit mode side view: boop only (new code)
  } else {
      // Normal side view: full boop with XP/breeding/easter eggs (lines 180-229, unchanged)
  }
  ```

- The `updateFingerFollow()` function (main.js lines 237-259) already runs only outside visit mode (it's called from `update()` line 403, which is after the `if (visitMode) { ... return; }` block at lines 393-398). No changes needed there.
- Long-press decoration dragging (lines 77-93) works in visit mode and should continue to -- visited tanks have decorations. No changes needed.
- Long-press fish labels (lines 94-97) work in visit mode already. No changes needed.

### Acceptance Criteria
- [ ] Tapping a fish in side view during visit mode calls `boopVisit()`, plays the boop sound, and shows sparkle/heart effects
- [ ] Tapping in top-down view during visit mode does nothing (no food, no ripple)
- [ ] No XP is awarded, no breeding bonus applied, no easter egg tracking during visit mode boops
- [ ] Fish recovers from booped state after ~0.6s and resumes wandering
- [ ] All new unit tests pass
- [ ] All existing unit tests pass (especially `Fish.updateVisitMode` "does not change hunger or happiness" test)
- [ ] All E2E tests pass

### Dependencies
Phase 1 must be complete (boopVisit method and updateVisitMode changes).
