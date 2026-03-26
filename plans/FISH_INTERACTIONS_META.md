# Meta-Plan: Fish Interactions — Booping, Sanctuary, Visiting, Gifting

## Overview

Four interconnected features that expand the game's social and interaction systems:

1. **Visit Mode Booping** — Boop fish when viewing someone's tank (client-only)
2. **Global Sanctuary** — Shared endless tank all players contribute fish to (server + scrolling client)
3. **Fish Visiting** — Temporarily send a fish to another player's tank (server + client)
4. **Fish Gifting** — Permanently give a fish to another player (server + inbox)

Plus shared infrastructure: worker routing refactor and final integration verification.

## Decomposition

### Dependency Graph

```
Phase 1 (Worker Refactor) ─── independent prerequisite for 3, 4, 5
Phase 2 (Booping) ─────────── prerequisite for 3, 4
Phase 3 (Sanctuary) ────────── depends on 1, 2
Phase 4 (Visiting) ─────────── depends on 1, 2
Phase 5 (Gifting) ──────────── depends on 1 only (no booping dependency)
Phase 6 (Integration) ──────── depends on all above
```

### Scope Rationale

- Visit Mode Booping is tiny (2 phases, ~40 lines) and unlocks booping for sanctuary + visiting
- Worker refactor prevents merge conflicts as 3 plans add endpoints to the same file
- Sanctuary, Visiting, and Gifting are independent of each other after their shared prerequisites
- Integration phase catches cross-feature conflicts (mode mutex, z-index, shared UI elements)

### Cross-Plan Integration Notes

**Shared concerns identified by adversarial review:**

1. **`savedStateBeforeVisit` mutex** — Visit mode, sanctuary mode, and potentially gift acceptance all interact with this state variable. The integration phase must verify that only one mode can be active at a time and add guards.

2. **`refreshMyFish()` button layout** — FISH_VISITING adds "Send to Visit" button, FISH_GIFTING adds "Gift" button, GLOBAL_SANCTUARY adds "Retire" button. The last plan to execute should ensure consistent DOM ordering. Integration phase verifies.

3. **`worker.js` route ordering** — After routing refactor, each plan adds routes to the route table. No path collisions exist (different prefixes: `/sanctuary/`, `/live/:code/visitors`, `/gift/`), but the integration phase should verify.

4. **z-index stacking** — Multiple overlays/banners added. Integration phase audits z-index consistency.

5. **`getSaveState()` guards** — Visit mode checks `visitMode`, sanctuary will check `sanctuaryMode`. Both must coexist. Visiting fish are filtered by `isVisitingFish`. Integration phase verifies all guards compose correctly.

6. **Test coverage** — VISIT_BOOPING includes tests. Other plans should add unit tests for pure functions (coordinate math, localStorage helpers, data extraction). The `/verify-changes` step in each `/run-plan` execution will catch gaps.

## Sub-Plans

| Plan | Phases | Dependencies | Notes |
|------|--------|--------------|-------|
| (inline) Worker Refactor | 1 | None | Prerequisite for all backend plans |
| [VISIT_BOOPING.md](VISIT_BOOPING.md) | 2 | None | Client-only, no backend |
| [GLOBAL_SANCTUARY.md](GLOBAL_SANCTUARY.md) | 5 | Worker Refactor, Booping | Largest scope — scrolling, chunks |
| [FISH_VISITING.md](FISH_VISITING.md) | 5 | Worker Refactor, Booping | Temporary transfers |
| [FISH_GIFTING.md](FISH_GIFTING.md) | 4 | Worker Refactor | No booping dependency |
| (inline) Integration | 1 | All above | Cross-feature verification |

## Progress Tracker

| Phase | Status | Commit | Notes |
|-------|--------|--------|-------|
| 1 — Worker routing refactor | ✅ | pending | Route table + parseJsonBody helper |
| 2 — Visit mode booping | ✅ | pending | Sub-plan: VISIT_BOOPING.md |
| 3 — Global sanctuary | ✅ | pending | Sub-plan: GLOBAL_SANCTUARY.md |
| 4 — Fish visiting | ⬚ | | Sub-plan: FISH_VISITING.md |
| 5 — Fish gifting | ⬚ | | Sub-plan: FISH_GIFTING.md |
| 6 — Integration verification | ⬚ | | Inline phase |

## Phase 1 — Worker Routing Refactor

### Goal
Refactor `_cloudflare/worker.js` from a flat if/else chain into a route-table structure, so subsequent plans can add endpoints without merge conflicts.

### Execution: inline

This is a small refactoring phase (~30 lines changed) that doesn't warrant a full sub-plan.

### Work Items
- [ ] Extract a `routes` array of `{ method, pattern, handler }` objects from the existing 4 endpoints
- [ ] Create a `matchRoute(method, path, routes)` function that returns `{ handler, params }` or null
- [ ] Extract shared middleware: `parseJsonBody(request, maxSize)` for Content-Length check + JSON parse
- [ ] Convert existing POST/GET/PUT/DELETE handlers to route entries
- [ ] Verify all existing endpoints work identically after refactor

### Design & Constraints
Route table structure:
```js
const routes = [
  { method: 'POST', pattern: '/live', handler: handleCreateShare },
  { method: 'GET', pattern: '/live/:code', handler: handleGetShare },
  { method: 'PUT', pattern: '/live/:code', handler: handleUpdateShare },
  { method: 'DELETE', pattern: '/live/:code', handler: handleDeleteShare },
];
```

Pattern matching: `:param` segments captured as `params.param`. Static segments match exactly. Pattern validation (e.g., `[a-z0-9]{8}` for codes) stays in handlers.

`parseJsonBody(request, maxSize)`: returns `{ ok: true, body }` or `{ ok: false, response }` (pre-built error Response). Eliminates the duplicated Content-Length + try/catch pattern across POST and PUT handlers.

Each handler receives `(request, env, params, body)` where body may be null for GET/DELETE.

### Acceptance Criteria
- [ ] All 4 existing endpoints return identical responses
- [ ] `curl` tests from the live share deployment still work
- [ ] worker.js has a clear place to add new route entries
- [ ] `parseJsonBody` is reusable by new endpoints
- [ ] All existing tests pass (`npm test`)

### Dependencies
None.

## Phase 2 — Implement: Visit Mode Booping

### Goal
Enable booping fish while viewing someone else's tank.

### Execution: delegate /run-plan plans/VISIT_BOOPING.md finish auto

### Acceptance Criteria
- [ ] All phases in VISIT_BOOPING.md are marked Done
- [ ] All tests pass on main after landing
- [ ] Booping works in visit mode with visual/audio feedback
- [ ] No XP, breeding, or stat changes from visit boops

### Dependencies
None.

## Phase 3 — Implement: Global Sanctuary

### Goal
Build the shared endless tank that all players can contribute fish to.

### Execution: delegate /run-plan plans/GLOBAL_SANCTUARY.md finish auto

### Acceptance Criteria
- [ ] All phases in GLOBAL_SANCTUARY.md are marked Done
- [ ] All tests pass on main after landing
- [ ] Sanctuary endpoints respond correctly on the live worker
- [ ] Fish can be retired and viewed in the sanctuary with horizontal scrolling
- [ ] Fish are boopable in the sanctuary

### Dependencies
Phase 1 (Worker Refactor) and Phase 2 (Visit Mode Booping) must be complete.

**Note:** This plan was drafted before Phase 1 was implemented. Worker endpoint code references the old if/else routing pattern. `/run-plan` should auto-refresh to use the new route table structure.

## Phase 4 — Implement: Fish Visiting

### Goal
Allow players to send a fish to temporarily visit another player's tank.

### Execution: delegate /run-plan plans/FISH_VISITING.md finish auto

### Acceptance Criteria
- [ ] All phases in FISH_VISITING.md are marked Done
- [ ] All tests pass on main after landing
- [ ] Fish can be sent to visit, appear with shimmer, and return after timeout or recall
- [ ] Visiting fish are excluded from saves, shares, and capacity

### Dependencies
Phase 1 (Worker Refactor) and Phase 2 (Visit Mode Booping) must be complete.

**Note:** This plan was drafted before Phase 1 was implemented. `/run-plan` should auto-refresh worker endpoint code to use the route table.

**UI coordination:** If Phase 3 (Sanctuary) landed first, the "Retire" button already exists on fish cards. This plan's "Send to Visit" button should be placed alongside it consistently.

## Phase 5 — Implement: Fish Gifting

### Goal
Allow players to permanently give a fish to another player.

### Execution: delegate /run-plan plans/FISH_GIFTING.md finish auto

### Acceptance Criteria
- [ ] All phases in FISH_GIFTING.md are marked Done
- [ ] All tests pass on main after landing
- [ ] Fish can be gifted, received, accepted/declined
- [ ] Expired gifts restore to sender

### Dependencies
Phase 1 (Worker Refactor) must be complete. Does NOT depend on Phase 2 (Booping).

**Note:** This plan was drafted before Phases 1-4 were implemented. `/run-plan` should auto-refresh to account for: route table structure, any new buttons on fish cards from earlier phases, any new mode flags in main.js.

**UI coordination:** Fish card buttons from earlier phases (Retire, Send to Visit) already exist. The "Gift" button should be placed in a consistent action row.

## Phase 6 — Integration Verification

### Goal
Verify all four features work correctly together with no cross-feature conflicts.

### Execution: inline

### Work Items
- [ ] **Mode mutex**: Verify that entering visit mode, sanctuary mode, and receiving a gift notification cannot corrupt `savedStateBeforeVisit`. Add guards if missing (e.g., disable sanctuary entry during visit mode and vice versa).
- [ ] **Fish card button layout**: Verify that Retire, Send to Visit, and Gift buttons on fish cards have consistent DOM ordering and don't overlap. Fix layout if needed.
- [ ] **z-index audit**: Check all new overlays/banners (`#sanctuary-banner`, `#visit-send-overlay`, `#gift-overlay`, `#gift-banner`) for stacking conflicts. Normalize z-index values.
- [ ] **`getSaveState()` composition**: Verify all mode guards (`visitMode`, `sanctuaryMode`) and fish filters (`isVisitingFish`) compose correctly when multiple features are active.
- [ ] **`worker.js` route audit**: Verify no route shadowing between sanctuary, visitor, and gift endpoints.
- [ ] **Cross-feature edge cases**: Test these scenarios:
  - Gift a fish that is currently on a visit (should be blocked — fish is "away")
  - Retire a fish that has a pending gift (should be blocked — fish is "away")
  - Enter sanctuary while a gift banner is showing (banner should persist)
  - Accept a gift while in sanctuary mode (should queue for return to main tank)
  - Receive a visiting fish while viewing the sanctuary (polling should still work)
- [ ] **Run full test suite**: `npm test` — all unit and E2E tests pass
- [ ] **Deploy worker**: Verify all new endpoints work on the live Cloudflare Worker

### Acceptance Criteria
- [ ] No mode corruption possible via any transition sequence
- [ ] All overlays render without z-index conflicts
- [ ] All fish card actions coexist cleanly
- [ ] All cross-feature edge cases handled or explicitly guarded
- [ ] Full test suite passes
- [ ] Worker is deployed and all endpoints respond

### Dependencies
All previous phases must be complete.

## Plan Quality

**Drafting process:** /research-and-plan with 4 parallel research agents, 4 parallel /draft-plan agents, 1 round of adversarial decomposition review (reviewer + devil's advocate)

**Decomposition review findings addressed:**
- Worker routing refactor added as Phase 1 (finding: worker.js bloat)
- False dependency removed: FISH_GIFTING no longer depends on VISIT_BOOPING (finding: copy-paste dependency)
- Integration phase added as Phase 6 (finding: missing glue, cross-feature conflicts)
- Mode mutex, z-index, UI coordination noted as integration concerns
- Test coverage gaps noted — `/run-plan` + `/verify-changes` will catch them

**Remaining concerns:**
- FISH_VISITING Phase 4 may be overloaded (14 work items) — splitting can happen during execution if needed
- KV race conditions in gifting rate limiting — accepted as low-risk for casual game
- Sanctuary scrolling has no unit tests for coordinate math — should be added during execution
