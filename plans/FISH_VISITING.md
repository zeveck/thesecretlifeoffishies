# Fish Visiting

Send a fish to temporarily visit another player's tank. The fish appears in their tank for 30 minutes with a visual shimmer. The sender can recall it. Max 3 visitors per tank.

## Progress Tracker

- [ ] Phase 1: Worker visitor endpoints
- [ ] Phase 2: Client visitor API functions in live.js
- [ ] Phase 3: Fish model changes (createVisitingFish, shimmer rendering)
- [ ] Phase 4: Game loop integration (polling, sync, expiration)
- [ ] Phase 5: UI (send dialog, badges, recall, toasts, shared tab section)

## Dependencies

- **Visit Mode Booping** plan must be complete first (visiting fish must be boopable via `boopVisit()` and `updateVisitMode` handling `boopTimer`).

---

## Phase 1: Worker visitor endpoints

### Goal
Add three new endpoints to the Cloudflare Worker under `/live/:code/visitors` backed by a separate KV key `visit:{code}` to manage visiting fish without conflicting with the main `live:{code}` tank data.

### Work Items

1. **Add route matching** in `worker.js` `fetch()` handler, before the final 404, for the three new endpoints below.

2. **POST `/live/:code/visitors`** -- Send a fish to visit a tank.
   - Route regex: `/^\/live\/([a-z0-9]{8})\/visitors$/i`
   - Method: `POST`
   - Request body JSON:
     ```json
     {
       "fish": {
         "speciesName": "Guppy",
         "name": "Bubbles",
         "currentSize": 1.2,
         "isFry": false,
         "tailDots": 7
       },
       "senderCode": "ab12cd34",
       "senderId": "unique-sender-id"
     }
     ```
     - `fish`: same shape as `extractShareData` fish entries (speciesName, name, currentSize, isFry, tailDots).
     - `senderCode`: the sender's own live share code (8 chars). Required so the recipient can see who sent it.
     - `senderId`: a unique string identifying this specific visit (generated client-side as `visit_${Date.now()}_${Math.random().toString(36).slice(2,8)}`). Used for recall.
   - Validation:
     - Verify payload < `MAX_PAYLOAD` (50KB).
     - Parse JSON, reject 400 on failure.
     - Verify `body.fish` exists and `body.fish.speciesName` is a non-empty string.
     - Verify `body.senderCode` is an 8-char alphanumeric string.
     - Verify `body.senderId` is a non-empty string.
     - Read KV key `visit:{code}`. If null, initialize as `{ visitors: [] }`.
     - If `visitors.length >= 3`, return 409: `{ error: "Tank full", maxVisitors: 3 }`.
     - If a visitor with the same `senderId` already exists, return 409: `{ error: "Already visiting" }`.
   - On success:
     - Push to `visitors` array: `{ fish: body.fish, senderCode: body.senderCode, senderId: body.senderId, arrivedAt: Date.now() }`.
     - Write KV key `visit:{code}` with value `JSON.stringify({ visitors })` and `expirationTtl: 3600` (1 hour -- generous buffer beyond the 30-min client-side expiry so stale data self-cleans).
     - Return 201: `{ ok: true, senderId: body.senderId, arrivedAt: <timestamp> }`.

3. **GET `/live/:code/visitors`** -- Fetch current visitors for a tank.
   - Route regex: `/^\/live\/([a-z0-9]{8})\/visitors$/i`
   - Method: `GET`
   - Read KV key `visit:{code}`.
   - If null, return 200: `{ visitors: [] }`.
   - Parse and return 200: `{ visitors: [...] }` (the full array with fish, senderCode, senderId, arrivedAt).
   - Refresh TTL: re-put the value with `expirationTtl: 3600`.

4. **DELETE `/live/:code/visitors/:senderId`** -- Recall a visiting fish.
   - Route regex: `/^\/live\/([a-z0-9]{8})\/visitors\/([a-zA-Z0-9_]+)$/`
   - Method: `DELETE`
   - Read KV key `visit:{code}`.
   - If null or no matching visitor, return 404: `{ error: "Visitor not found" }`.
   - Filter out the visitor whose `senderId` matches the URL param.
   - If remaining visitors is empty, delete the KV key. Otherwise, re-put with `expirationTtl: 3600`.
   - Return 200: `{ recalled: true, senderId: <id> }`.

### Design & Constraints

- **Separate KV key**: `visit:{code}` is entirely independent from `live:{code}`. This avoids version conflicts with the live share push mechanism. No version field needed -- visitors array is append/filter only.
- **TTL of 3600s** on KV: 1 hour auto-expiry ensures abandoned visits are cleaned up even if neither client recalls.
- **Max 3 visitors**: enforced server-side in POST. The client should also check before sending but the server is the authority.
- **No authentication**: consistent with existing live share design. The `senderId` acts as a recall token -- only someone who knows it can delete.
- Payload size check: reuse the existing `MAX_PAYLOAD` constant and `Content-Length` check pattern.

### Acceptance Criteria

- [ ] `POST /live/abcd1234/visitors` with valid body returns 201 and persists to KV key `visit:abcd1234`.
- [ ] `POST` to a tank with 3 visitors returns 409 `{ error: "Tank full" }`.
- [ ] `POST` with duplicate `senderId` returns 409 `{ error: "Already visiting" }`.
- [ ] `GET /live/abcd1234/visitors` returns the current visitors array (empty array if none).
- [ ] `DELETE /live/abcd1234/visitors/visit_123_abc` removes that visitor and returns 200.
- [ ] `DELETE` with unknown senderId returns 404.
- [ ] CORS headers are set on all new endpoints (reuse existing `json()` helper).
- [ ] OPTIONS preflight works for all new routes (already handled by the blanket OPTIONS handler).
- [ ] All existing tests still pass (`npm test`).

### Dependencies

- None (worker changes are independent).

---

## Phase 2: Client visitor API functions in live.js

### Goal
Add functions to `live.js` for sending, recalling, fetching visitors, and tracking outgoing visits in localStorage.

### Work Items

1. **New localStorage key** for tracking outgoing visits:
   ```js
   const LS_OUTGOING_VISITS = 'fishies_outgoing_visits';
   ```
   - Shape: array of `{ senderId: string, targetCode: string, fishData: object, sentAt: number }`.
   - `fishData` is the same shape as the POST body's `fish` field.

2. **`sendFishVisit(targetCode, fish)`** -- exported async function.
   - Parameters:
     - `targetCode`: 8-char tank code string.
     - `fish`: a Fish instance from the local `fishes` array.
   - Extract fish data: `{ speciesName: fish.species.name, name: fish.name, currentSize: fish.currentSize, isFry: fish.isFry, tailDots: fish.tailDots }`.
   - Get sender's live code via `getLiveCode()`. If null, throw `Error('Must be live sharing to send visitors')`.
   - Generate `senderId`: `'visit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)`.
   - POST to `${WORKER_URL}/live/${targetCode}/visitors` with body `{ fish: fishData, senderCode: getLiveCode(), senderId }`.
   - On success (201): save to outgoing visits in localStorage, return `{ senderId, arrivedAt }`.
   - On 409: parse error, throw `Error(responseBody.error)` (either "Tank full" or "Already visiting").
   - On other errors: throw `Error('Failed to send visitor')`.

3. **`recallFishVisit(targetCode, senderId)`** -- exported async function.
   - DELETE to `${WORKER_URL}/live/${targetCode}/visitors/${senderId}`.
   - On success (200): remove from outgoing visits localStorage, return `{ recalled: true }`.
   - On 404: still remove from localStorage (stale), return `{ recalled: true }`.
   - On other errors: throw `Error('Failed to recall visitor')`.

4. **`fetchVisitors(code)`** -- exported async function.
   - GET `${WORKER_URL}/live/${code}/visitors`.
   - On success: return `{ visitors: [...] }`.
   - On error: return `{ visitors: [] }`.

5. **`getOutgoingVisits()`** -- exported function.
   - Read and parse `LS_OUTGOING_VISITS` from localStorage.
   - Filter out any visits where `Date.now() - sentAt > 30 * 60 * 1000` (expired).
   - Re-save the filtered array.
   - Return the filtered array.

6. **`removeOutgoingVisit(senderId)`** -- exported function.
   - Filter out the matching entry from localStorage.
   - Used internally by `recallFishVisit` and by expiration cleanup.

7. **`getOutgoingVisitForFish(speciesName, fishName)`** -- exported function.
   - Returns the outgoing visit entry matching the fish, or null.
   - Match by `fishData.speciesName === speciesName && fishData.name === fishName`.
   - Used by UI to show "visiting" badge on fish cards.

### Design & Constraints

- Sender must have an active live share (`getLiveCode()` must return non-null). This is because the visitor endpoint stores `senderCode` so the recipient can see who sent the fish.
- The fish is NOT removed from the sender's local `fishes` array. It continues to exist locally. The visit is a "clone" that appears in the target tank. The sender sees a "Visiting [code]" badge on the fish card.
- `sentAt` is stored as `Date.now()` at send time. Client-side expiration uses this (30 minutes). Server-side expiration is handled by the 1-hour KV TTL.
- All fetch calls use the same pattern as existing `fetchSharedTank`: simple fetch, check `resp.ok`, parse JSON.

### Acceptance Criteria

- [ ] `sendFishVisit` throws if not live sharing.
- [ ] `sendFishVisit` POSTs correct payload and saves to localStorage on success.
- [ ] `recallFishVisit` DELETEs and removes from localStorage.
- [ ] `fetchVisitors` returns visitors array or empty array on error.
- [ ] `getOutgoingVisits` filters expired visits (>30 min).
- [ ] All existing tests still pass (`npm test`).

### Dependencies

- Phase 1 (worker endpoints must exist).

---

## Phase 3: Fish model changes

### Goal
Add a `createVisitingFish` factory that produces fish with an `isVisitingFish` flag, and add shimmer rendering to `drawSide` and `drawTop`.

### Work Items

1. **New static method `Fish.createVisitingFish(data)`** in `js/fish.js`.
   - Parameters: `data` object with shape `{ speciesName, name, currentSize, isFry, tailDots, senderCode, senderId, arrivedAt }`.
   - Implementation:
     ```js
     static createVisitingFish(data) {
         const fish = Fish.createVisitor(data);
         if (!fish) return null;
         fish.isVisitingFish = true;
         fish.senderCode = data.senderCode || '';
         fish.senderId = data.senderId || '';
         fish.arrivedAt = data.arrivedAt || Date.now();
         return fish;
     }
     ```
   - Reuses the existing `createVisitor` logic (sets happiness 80, hunger 0, strength 100, random position, wandering AI).
   - Adds the three metadata fields for identification and expiration.

2. **`isVisitingFish` property** -- initialized to `false` in the Fish constructor (add `this.isVisitingFish = false;` after `this.tailDots` initialization, around line 73).

3. **`senderCode` and `senderId` and `arrivedAt` properties** -- initialized to `''`, `''`, and `0` respectively in the constructor. Only set to real values by `createVisitingFish`.

4. **Shimmer effect in `drawSide`** -- after the `ctx.restore()` at the end of `drawSide` (line 487), add a shimmer overlay:
   ```js
   // Visiting fish shimmer
   if (this.isVisitingFish && gameTime !== undefined) {
       ctx.save();
       ctx.translate(sx, sy);
       if (!facingRight) ctx.scale(-1, 1);

       const shimmerAlpha = 0.12 + 0.08 * Math.sin(gameTime * 3.0 + this.id * 1.7);
       const shimmerHue = (gameTime * 40 + this.id * 30) % 360;

       ctx.globalCompositeOperation = 'lighter';
       ctx.globalAlpha = shimmerAlpha;

       // Outer glow
       ctx.shadowColor = `hsl(${shimmerHue}, 80%, 70%)`;
       ctx.shadowBlur = bodyH * 1.5;
       ctx.fillStyle = `hsl(${shimmerHue}, 80%, 70%)`;
       ctx.beginPath();
       ctx.ellipse(0, 0, bodyW * 1.1, bodyH * 1.1, 0, 0, Math.PI * 2);
       ctx.fill();

       // Sparkle particles (3 small dots orbiting)
       for (let i = 0; i < 3; i++) {
           const angle = gameTime * 2.0 + (i * Math.PI * 2 / 3) + this.id;
           const sparkleX = Math.cos(angle) * bodyW * 1.3;
           const sparkleY = Math.sin(angle) * bodyH * 1.3;
           const sparkleAlpha = 0.5 + 0.5 * Math.sin(gameTime * 5 + i * 2);
           ctx.globalAlpha = shimmerAlpha * sparkleAlpha;
           ctx.beginPath();
           ctx.arc(sparkleX, sparkleY, 2, 0, Math.PI * 2);
           ctx.fill();
       }

       ctx.restore();
   }
   ```
   - Note: `sx`, `sy`, `bodyW`, `bodyH`, and `facingRight` are all local variables already computed earlier in `drawSide`. The shimmer block must be placed BEFORE the final `ctx.restore()` that undoes the translate -- or, more safely, as a separate save/restore block AFTER the final `ctx.restore()`, using `sx` and `sy` directly.
   - **Preferred placement**: add a new `ctx.save()/ctx.restore()` block AFTER the existing final `ctx.restore()` on line 487, using `sx`, `sy`, `bodyW`, `bodyH` which are still in scope as local variables.

5. **Shimmer effect in `drawTop`** -- analogous effect after the final `ctx.restore()` in `drawTop` (line 653):
   ```js
   if (this.isVisitingFish && gameTime !== undefined) {
       ctx.save();
       ctx.translate(sx, sy);

       const shimmerAlpha = 0.12 + 0.08 * Math.sin(gameTime * 3.0 + this.id * 1.7);
       const shimmerHue = (gameTime * 40 + this.id * 30) % 360;

       ctx.globalCompositeOperation = 'lighter';
       ctx.globalAlpha = shimmerAlpha;

       ctx.shadowColor = `hsl(${shimmerHue}, 80%, 70%)`;
       ctx.shadowBlur = bodyW * 2;
       ctx.fillStyle = `hsl(${shimmerHue}, 80%, 70%)`;
       ctx.beginPath();
       ctx.ellipse(0, 0, bodyW * 1.3, bodyLen * 0.8, 0, 0, Math.PI * 2);
       ctx.fill();

       for (let i = 0; i < 3; i++) {
           const angle = gameTime * 2.0 + (i * Math.PI * 2 / 3) + this.id;
           const sparkleX = Math.cos(angle) * bodyW * 1.5;
           const sparkleY = Math.sin(angle) * bodyLen * 0.9;
           const sparkleAlpha = 0.5 + 0.5 * Math.sin(gameTime * 5 + i * 2);
           ctx.globalAlpha = shimmerAlpha * sparkleAlpha;
           ctx.beginPath();
           ctx.arc(sparkleX, sparkleY, 2, 0, Math.PI * 2);
           ctx.fill();
       }

       ctx.restore();
   }
   ```
   - Here `sx`, `sy`, `bodyW`, `bodyLen` are local variables from `drawTop`.

6. **Do NOT modify `serialize()`** -- visiting fish should never be serialized into save data. This is enforced in Phase 4 by filtering them out.

### Design & Constraints

- The shimmer uses `globalCompositeOperation = 'lighter'` for an additive glow effect. The hue slowly rotates (40 degrees/sec) giving a gentle iridescent look.
- Alpha oscillates between 0.04 and 0.20 (via `0.12 + 0.08 * sin(...)`) for a breathing shimmer.
- Three sparkle particles orbit the fish body to distinguish visitors from normal fish at a glance.
- The shimmer should NOT interact with the rainbow glow system -- they can coexist. The shimmer renders after the main body, so it overlays.
- `isVisitingFish` defaults to `false` in the constructor so existing fish and `createVisitor` (visit mode) fish are unaffected.

### Acceptance Criteria

- [ ] `Fish.createVisitingFish({ speciesName: 'Guppy', name: 'Test', currentSize: 1.2, isFry: false, tailDots: 5, senderCode: 'ab12cd34', senderId: 'visit_123', arrivedAt: 1234567890 })` returns a Fish with `isVisitingFish === true`, correct metadata, and standard visitor stats.
- [ ] `createVisitingFish` returns `null` for unknown species.
- [ ] Normal fish have `isVisitingFish === false`.
- [ ] Shimmer renders visibly on visiting fish in both side and top views (visual verification).
- [ ] All existing tests still pass (`npm test`).

### Dependencies

- None (fish.js changes are self-contained).

---

## Phase 4: Game loop integration

### Goal
Poll for visiting fish, synchronize the `fishes` array, exclude visitors from saves/shares/capacity, and handle expiration.

### Work Items

1. **New module-level state in `main.js`**:
   ```js
   let visitorPollInterval = null;
   const VISITOR_POLL_INTERVAL = 15000; // 15 seconds
   const VISITOR_DURATION = 30 * 60 * 1000; // 30 minutes
   ```

2. **Import new functions** at top of `main.js`:
   ```js
   import { fetchVisitors, getOutgoingVisits, removeOutgoingVisit } from './live.js';
   import { Fish } from './fish.js'; // already imported, add createVisitingFish usage
   ```
   - Actually `Fish.createVisitingFish` is a static method, so the existing `Fish` import suffices.

3. **`startVisitorPolling()`** function:
   ```js
   function startVisitorPolling() {
       stopVisitorPolling();
       syncVisitingFish(); // immediate first sync
       visitorPollInterval = setInterval(syncVisitingFish, VISITOR_POLL_INTERVAL);
   }
   ```

4. **`stopVisitorPolling()`** function:
   ```js
   function stopVisitorPolling() {
       if (visitorPollInterval) {
           clearInterval(visitorPollInterval);
           visitorPollInterval = null;
       }
   }
   ```

5. **`syncVisitingFish()`** async function:
   ```js
   async function syncVisitingFish() {
       const code = getLiveCode();
       if (!code || visitMode) return;

       try {
           const { visitors } = await fetchVisitors(code);
           const now = Date.now();

           // Remove expired visitors from server response
           const active = visitors.filter(v => now - v.arrivedAt < VISITOR_DURATION);

           // Current visiting fish in fishes array
           const currentVisitorIds = new Set(
               fishes.filter(f => f.isVisitingFish).map(f => f.senderId)
           );
           const serverVisitorIds = new Set(active.map(v => v.senderId));

           // Remove fish that are no longer on server (recalled or expired)
           for (let i = fishes.length - 1; i >= 0; i--) {
               if (fishes[i].isVisitingFish && !serverVisitorIds.has(fishes[i].senderId)) {
                   fishes.splice(i, 1);
               }
           }

           // Add new visitors not yet in fishes array
           for (const v of active) {
               if (!currentVisitorIds.has(v.senderId)) {
                   const fish = Fish.createVisitingFish({
                       ...v.fish,
                       senderCode: v.senderCode,
                       senderId: v.senderId,
                       arrivedAt: v.arrivedAt,
                   });
                   if (fish) {
                       fishes.push(fish);
                       showVisitorToast(v.fish.name || v.fish.speciesName, 'arrived');
                   }
               }
           }
       } catch {
           // Network error: silently skip
       }
   }
   ```

6. **`showVisitorToast(fishName, action)`** function:
   ```js
   function showVisitorToast(fishName, action) {
       const toast = document.createElement('div');
       toast.className = 'fry-toast'; // reuse existing toast styling
       toast.textContent = action === 'arrived'
           ? `${fishName} is visiting your tank!`
           : `${fishName} has left your tank.`;
       document.body.appendChild(toast);
       setTimeout(() => {
           toast.classList.add('fry-toast-out');
           toast.addEventListener('animationend', () => toast.remove());
       }, 2500);
   }
   ```

7. **Exclude visitors from `getSaveState()`**:
   - In the `getSaveState` function, change the fish serialization line from:
     ```js
     fish: fishes.map(f => f.serialize()),
     ```
     to:
     ```js
     fish: fishes.filter(f => !f.isVisitingFish).map(f => f.serialize()),
     ```

8. **Exclude visitors from `extractShareData()`** in `live.js`:
   - In `extractShareData`, the fish data comes from `saveState.fish` which is already serialized data (not Fish instances). Since visitors are filtered out in `getSaveState()`, they will automatically be excluded from live share pushes. No change needed here.

9. **Exclude visitors from capacity checks**:
   - In `getCurrentStockInches` in `store.js`, change:
     ```js
     export function getCurrentStockInches(fishes) {
         return fishes.reduce((sum, f) => sum + f.currentSize, 0);
     }
     ```
     to:
     ```js
     export function getCurrentStockInches(fishes) {
         return fishes.reduce((sum, f) => sum + (f.isVisitingFish ? 0 : f.currentSize), 0);
     }
     ```

10. **Exclude visitors from breeding**:
    - In `updateBreeding` in `main.js`, the `selectPair` function filters `fishes.filter(f => f.species.name === speciesName && !f.isFry)`. Add `&& !f.isVisitingFish`:
      ```js
      const adults = fishes.filter(f => f.species.name === speciesName && !f.isFry && !f.isVisitingFish);
      ```

11. **Visitor fish use `updateVisitMode(dt)`** in the game loop:
    - In the `update()` function's fish update loop (lines 409-413), change from:
      ```js
      for (let i = fishes.length - 1; i >= 0; i--) {
          const alive = fishes[i].update(dt);
          if (!alive) {
              fishes.splice(i, 1);
          }
      }
      ```
      to:
      ```js
      for (let i = fishes.length - 1; i >= 0; i--) {
          if (fishes[i].isVisitingFish) {
              fishes[i].updateVisitMode(dt);
          } else {
              const alive = fishes[i].update(dt);
              if (!alive) {
                  fishes.splice(i, 1);
              }
          }
      }
      ```
    - This ensures visitors use the simple wandering AI, not full stat-based AI. They never die/leave.

12. **Expire outgoing visits client-side**:
    - In the `update()` function, add a periodic check (every 60 seconds, using `gameTime`):
      ```js
      // Expire outgoing visits
      if (Math.floor(gameTime / 60) !== Math.floor((gameTime - dt) / 60)) {
          const outgoing = getOutgoingVisits(); // auto-filters expired
          // outgoing visits that have expired are already cleaned by getOutgoingVisits
      }
      ```
    - This is lightweight -- `getOutgoingVisits()` already filters and re-saves.

13. **Start/stop polling in `init()` and visit mode transitions**:
    - In `init()` after `if (isLiveSharing()) startPushInterval(getSaveState);` (line 837), add:
      ```js
      if (isLiveSharing()) startVisitorPolling();
      ```
    - In `enterVisitMode()`, add `stopVisitorPolling();` alongside `stopPushInterval()`.
    - In `exitVisitMode()` restoration block, add:
      ```js
      if (isLiveSharing()) startVisitorPolling();
      ```
      alongside the existing `startPushInterval` call.
    - When live share is started (in ui.js `refreshSharedTab` start handler), the page needs to start polling. Export `startVisitorPolling` and `stopVisitorPolling` from main.js, or better: start polling inside `startLiveShare` in live.js as a callback. **Preferred approach**: have `startLiveShare` return the code, and in the UI handler, call a new exported `onLiveShareStarted()` function from main.js that starts polling. Similarly `onLiveShareStopped()` stops polling.
    - **Simpler approach**: In `refreshSharedTab` in ui.js, after `startLiveShare` succeeds, dispatch a custom event `document.dispatchEvent(new Event('liveshare-started'))`. In main.js, listen for this event and call `startVisitorPolling()`. Same for stop. This avoids circular imports.

    Actually the simplest approach: export `startVisitorPolling` and `stopVisitorPolling` from main.js. Then import them in ui.js alongside the existing live.js imports. ui.js already imports from many modules.

    **Final approach**: Add to main.js:
    ```js
    export { startVisitorPolling, stopVisitorPolling };
    ```
    In ui.js, import:
    ```js
    import { startVisitorPolling, stopVisitorPolling } from './main.js';
    ```
    **WAIT** -- this creates a circular dependency (main.js imports from ui.js, ui.js imports from main.js). This is already partially the case but should be avoided.

    **Best approach**: Use custom events.
    - In ui.js `refreshSharedTab`, after `startLiveShare` succeeds:
      ```js
      document.dispatchEvent(new CustomEvent('liveshare-change', { detail: { active: true } }));
      ```
    - After `stopLiveShare`:
      ```js
      document.dispatchEvent(new CustomEvent('liveshare-change', { detail: { active: false } }));
      ```
    - In main.js `init()`:
      ```js
      document.addEventListener('liveshare-change', (e) => {
          if (e.detail.active) {
              startVisitorPolling();
          } else {
              stopVisitorPolling();
              // Remove all visiting fish
              for (let i = fishes.length - 1; i >= 0; i--) {
                  if (fishes[i].isVisitingFish) fishes.splice(i, 1);
              }
          }
      });
      ```

14. **Remove all visiting fish on `exitVisitMode()`**:
    - After restoring saved fish state, ensure no visiting fish persist from before. The `savedStateBeforeVisit` is serialized (so no visiting fish), and the fishes array is rebuilt from that data. However, after restoration, polling will resume and re-add visitors. This is correct behavior.

### Design & Constraints

- Visitor polling happens every 15 seconds. This is a light GET request.
- Visitors use `updateVisitMode(dt)` -- wandering AI only, no hunger/stats/leaving/dying.
- Visitors are excluded from: saves, live share pushes, capacity calculations, breeding.
- Visitors ARE included in: rendering, boop interactions (via visit mode booping from prerequisite plan), finger follow.
- The `syncVisitingFish` function is idempotent -- it reconciles the local fishes array with the server state.
- Arrival toast fires only for newly added visitors (not on every poll).
- When live sharing stops, all visitors are removed from the fishes array immediately.

### Acceptance Criteria

- [ ] Visiting fish appear in the fishes array after `syncVisitingFish` and are rendered with shimmer.
- [ ] Visiting fish do NOT appear in save data (`getSaveState().fish`).
- [ ] Visiting fish do NOT count toward tank capacity.
- [ ] Visiting fish do NOT participate in breeding.
- [ ] Visiting fish use `updateVisitMode(dt)` -- they wander but have no stat changes.
- [ ] Visitors are removed when recalled (server returns empty for that senderId).
- [ ] Visitors are removed when live sharing stops.
- [ ] Toast notification appears when a visitor arrives.
- [ ] Polling starts when live sharing is active, stops during visit mode.
- [ ] All existing tests still pass (`npm test`).

### Dependencies

- Phase 1 (worker endpoints).
- Phase 2 (client API functions).
- Phase 3 (createVisitingFish, shimmer rendering).

---

## Phase 5: UI (send dialog, badges, recall, toasts, shared tab)

### Goal
Add UI for sending a fish to visit, showing visiting/outgoing badges on fish cards, recall buttons, and a visitors section in the Shared tab.

### Work Items

1. **Send-to-Visit dialog** -- new overlay in `index.html`, added after the purchase dialog:
   ```html
   <!-- Send Visit dialog -->
   <div id="visit-send-overlay" class="hidden">
       <div id="visit-send-dialog">
           <h3>Send Fish to Visit</h3>
           <canvas id="visit-send-fish" width="200" height="80"></canvas>
           <p id="visit-send-name"></p>
           <input type="text" id="visit-send-code" placeholder="Enter tank code (8 characters)" maxlength="8">
           <div class="confirm-buttons">
               <button id="visit-send-cancel">Cancel</button>
               <button id="visit-send-ok">Send Visit</button>
           </div>
           <p id="visit-send-error" style="font-size:0.75rem;color:#ef5350;margin-top:8px;min-height:1em"></p>
       </div>
   </div>
   ```

2. **CSS for Send Visit dialog** in `style.css`:
   ```css
   #visit-send-overlay {
       position: fixed; inset: 0;
       background: rgba(0,0,0,0.6);
       display: flex; align-items: center; justify-content: center;
       z-index: 50;
   }
   #visit-send-overlay.hidden { display: none; }
   #visit-send-dialog {
       background: #0f1d30; border: 1px solid rgba(255,255,255,0.1);
       border-radius: 12px; padding: 20px 24px;
       max-width: 300px; width: 85vw; text-align: center; color: #b0c8e0;
   }
   #visit-send-dialog h3 {
       font-size: 0.9rem; color: #6090b0; margin-bottom: 12px;
       text-transform: uppercase; letter-spacing: 0.05em;
   }
   #visit-send-fish {
       display: block; margin: 0 auto 12px;
   }
   #visit-send-code {
       width: 100%; padding: 8px 10px; margin-bottom: 12px;
       border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
       background: rgba(255,255,255,0.06); color: #b0c8e0;
       font-size: 1.1rem; text-align: center; letter-spacing: 0.15em;
       font-family: 'SFMono-Regular', 'Consolas', monospace;
       outline: none;
   }
   #visit-send-code:focus { border-color: #4a9eff; }
   ```

3. **"Send Visit" button on fish cards** in `refreshMyFish()` in `ui.js`:
   - After the rename click handler, and only when `isLiveSharing()` is true and the fish is NOT a fry and NOT already visiting (check `getOutgoingVisitForFish`):
   - Add a "Send Visit" button inside each fish card:
     ```js
     // Import at top of ui.js:
     // import { sendFishVisit, recallFishVisit, getOutgoingVisits, getOutgoingVisitForFish } from './live.js';

     const outgoingVisit = getOutgoingVisitForFish(fish.species.name, fish.name);

     if (isLiveSharing() && !fish.isFry && !fish.isVisitingFish) {
         const actionBtn = document.createElement('button');
         actionBtn.style.cssText = 'margin-top:6px;padding:5px 10px;border:1px solid #4a9eff;background:rgba(74,158,255,0.1);color:#4a9eff;border-radius:6px;font-size:0.72rem;cursor:pointer;width:100%';

         if (outgoingVisit) {
             actionBtn.textContent = `Visiting ${outgoingVisit.targetCode} — Recall`;
             actionBtn.style.borderColor = '#ef5350';
             actionBtn.style.color = '#ef5350';
             actionBtn.style.background = 'rgba(239,83,80,0.1)';
             actionBtn.addEventListener('click', async (e) => {
                 e.stopPropagation();
                 actionBtn.disabled = true;
                 actionBtn.textContent = 'Recalling...';
                 try {
                     await recallFishVisit(outgoingVisit.targetCode, outgoingVisit.senderId);
                 } catch { /* ignore */ }
                 refreshMyFish();
             });
         } else {
             actionBtn.textContent = 'Send to Visit...';
             actionBtn.addEventListener('click', (e) => {
                 e.stopPropagation();
                 showSendVisitDialog(fish);
             });
         }
         info.appendChild(actionBtn);
     }
     ```

4. **Visiting fish badge** -- for fish that are visiting FROM another tank (isVisitingFish === true), they won't appear in "My Fish" tab since they're excluded from saves. However they ARE in the fishes array. In `refreshMyFish`, skip visiting fish:
   ```js
   for (const fish of fishesRef) {
       if (fish.isVisitingFish) continue; // visitors shown in Shared tab
       // ... existing card logic
   }
   ```

5. **`showSendVisitDialog(fish)`** function in `ui.js`:
   ```js
   function showSendVisitDialog(fish) {
       const overlay = document.getElementById('visit-send-overlay');
       overlay.classList.remove('hidden');

       // Draw fish preview
       const canvas = document.getElementById('visit-send-fish');
       const ctx = canvas.getContext('2d');
       ctx.clearRect(0, 0, canvas.width, canvas.height);
       const tempFish = new Fish(fish.species);
       tempFish.x = 50; tempFish.y = 50;
       tempFish.happiness = 80;
       tempFish.heading = 0; tempFish.tailPhase = 0; tempFish.pitch = 0;
       tempFish.currentSize = fish.currentSize;
       tempFish.id = fish.id;
       tempFish.tailDots = fish.tailDots;
       const rawPx = tempFish.currentSize * 20;
       const targetPx = Math.min(canvas.width * 0.35, canvas.height * 0.7);
       const scale = targetPx / rawPx;
       ctx.save();
       ctx.translate(canvas.width / 2, canvas.height / 2);
       ctx.scale(scale, scale);
       ctx.translate(-canvas.width / 2, -canvas.height / 2);
       tempFish.drawSide(ctx, 0, 0, canvas.width, canvas.height);
       ctx.restore();

       document.getElementById('visit-send-name').textContent = fish.displayName();
       const codeInput = document.getElementById('visit-send-code');
       const errorEl = document.getElementById('visit-send-error');
       codeInput.value = '';
       errorEl.textContent = '';
       setTimeout(() => codeInput.focus(), 50);

       const ok = document.getElementById('visit-send-ok');
       const cancel = document.getElementById('visit-send-cancel');

       function cleanup() {
           overlay.classList.add('hidden');
           ok.removeEventListener('click', handleOk);
           cancel.removeEventListener('click', handleCancel);
       }
       async function handleOk() {
           const code = codeInput.value.trim().toLowerCase();
           if (!/^[a-z0-9]{8}$/.test(code)) {
               errorEl.textContent = 'Enter a valid 8-character tank code.';
               return;
           }
           if (code === getLiveCode()) {
               errorEl.textContent = 'You cannot visit your own tank.';
               return;
           }
           ok.disabled = true;
           ok.textContent = 'Sending...';
           errorEl.textContent = '';
           try {
               await sendFishVisit(code, fish);
               cleanup();
               refreshMyFish();
               // Show success toast
               const toast = document.createElement('div');
               toast.className = 'fry-toast';
               toast.textContent = `${fish.displayName()} is now visiting ${code}!`;
               document.body.appendChild(toast);
               setTimeout(() => {
                   toast.classList.add('fry-toast-out');
                   toast.addEventListener('animationend', () => toast.remove());
               }, 2500);
           } catch (err) {
               errorEl.textContent = err.message || 'Failed to send visitor.';
           } finally {
               ok.disabled = false;
               ok.textContent = 'Send Visit';
           }
       }
       function handleCancel() { cleanup(); }

       ok.addEventListener('click', handleOk);
       cancel.addEventListener('click', handleCancel);
   }
   ```

6. **Visitors section in Shared tab** -- in `refreshSharedTab()` in `ui.js`, add a "Visitors in My Tank" section after the live share section and before "Visited Tanks":
   ```js
   // After the existing live share section logic, before refreshBookmarkList():
   refreshVisitorSection();
   ```

   New function `refreshVisitorSection()`:
   ```js
   async function refreshVisitorSection() {
       // Find or create the visitors container
       let section = document.getElementById('visitor-section');
       if (!section) {
           const tab = document.getElementById('tab-shared');
           const bookmarkHeader = tab.querySelector('h3:last-of-type'); // "Visited Tanks" header
           section = document.createElement('div');
           section.id = 'visitor-section';
           tab.insertBefore(section, bookmarkHeader);
       }

       if (!isLiveSharing()) {
           section.innerHTML = '';
           return;
       }

       section.innerHTML = '<h3>Visitors in My Tank</h3><div style="font-size:0.78rem;color:#607888;padding:4px 0">Loading...</div>';

       const code = getLiveCode();
       const { visitors } = await fetchVisitors(code);
       const now = Date.now();
       const active = visitors.filter(v => now - v.arrivedAt < 30 * 60 * 1000);

       if (active.length === 0) {
           section.innerHTML = '<h3>Visitors in My Tank</h3><div style="font-size:0.78rem;color:#607888;padding:8px 0">No visitors right now. Share your tank code so friends can send fish!</div>';
           return;
       }

       let html = `<h3>Visitors in My Tank (${active.length}/3)</h3>`;
       for (const v of active) {
           const elapsed = now - v.arrivedAt;
           const remaining = Math.max(0, 30 * 60 * 1000 - elapsed);
           const mins = Math.ceil(remaining / 60000);
           html += `
               <div class="bookmark-card">
                   <div class="bookmark-info">
                       <div class="bookmark-code" style="letter-spacing:0">${v.fish.name || v.fish.speciesName}</div>
                       <div class="bookmark-label">From tank ${v.senderCode} &bull; ${mins}min left</div>
                   </div>
               </div>
           `;
       }
       section.innerHTML = html;
   }
   ```

7. **Outgoing visits section in Shared tab** -- add after the visitor section, showing fish you have sent out:
   ```js
   // In refreshSharedTab, also call:
   refreshOutgoingVisitsSection();
   ```

   New function `refreshOutgoingVisitsSection()`:
   ```js
   function refreshOutgoingVisitsSection() {
       let section = document.getElementById('outgoing-visits-section');
       if (!section) {
           const tab = document.getElementById('tab-shared');
           const bookmarkHeader = tab.querySelector('h3:last-of-type');
           section = document.createElement('div');
           section.id = 'outgoing-visits-section';
           tab.insertBefore(section, bookmarkHeader);
       }

       const outgoing = getOutgoingVisits();
       if (outgoing.length === 0) {
           section.innerHTML = '';
           return;
       }

       let html = '<h3>Fish on Visits</h3>';
       for (const v of outgoing) {
           const elapsed = Date.now() - v.sentAt;
           const remaining = Math.max(0, 30 * 60 * 1000 - elapsed);
           const mins = Math.ceil(remaining / 60000);
           const fishName = v.fishData.name || v.fishData.speciesName;
           html += `
               <div class="bookmark-card">
                   <div class="bookmark-info">
                       <div class="bookmark-code" style="letter-spacing:0">${fishName}</div>
                       <div class="bookmark-label">Visiting ${v.targetCode} &bull; ${mins}min left</div>
                   </div>
                   <div class="bookmark-actions">
                       <button class="bookmark-remove" data-target="${v.targetCode}" data-sender="${v.senderId}">Recall</button>
                   </div>
               </div>
           `;
       }
       section.innerHTML = html;

       // Wire recall buttons
       section.querySelectorAll('.bookmark-remove').forEach(btn => {
           btn.addEventListener('click', async () => {
               btn.textContent = 'Recalling...';
               btn.disabled = true;
               try {
                   await recallFishVisit(btn.dataset.target, btn.dataset.sender);
               } catch { /* ignore */ }
               refreshOutgoingVisitsSection();
               refreshMyFish();
           });
       });
   }
   ```

8. **Update imports in `ui.js`**:
   ```js
   import { isLiveSharing, getLiveCode, startLiveShare, stopLiveShare, getBookmarks, removeBookmark,
            sendFishVisit, recallFishVisit, fetchVisitors, getOutgoingVisits, getOutgoingVisitForFish } from './live.js';
   ```

9. **CSS for visiting badge** in `style.css` (optional, reuses fry-badge pattern):
   ```css
   .visit-badge {
       display: inline-block;
       font-size: 0.6rem;
       color: #a070ff;
       background: rgba(160, 112, 255, 0.15);
       border: 1px solid rgba(160, 112, 255, 0.3);
       border-radius: 8px;
       padding: 1px 6px;
       margin-left: 6px;
       vertical-align: middle;
   }
   ```
   - Used in fish card names for outgoing visits:
     ```js
     const visitBadge = outgoingVisit
         ? `<span class="visit-badge">Visiting ${outgoingVisit.targetCode}</span>`
         : '';
     // In the fish card name line:
     `<div class="fish-card-name">${fish.displayName()}${fryBadge}${visitBadge}</div>`
     ```

10. **Dispatch `liveshare-change` events** from `refreshSharedTab` in ui.js:
    - After `startLiveShare` succeeds:
      ```js
      document.dispatchEvent(new CustomEvent('liveshare-change', { detail: { active: true } }));
      ```
    - After `stopLiveShare`:
      ```js
      document.dispatchEvent(new CustomEvent('liveshare-change', { detail: { active: false } }));
      ```

### Design & Constraints

- The send dialog validates: 8-char alphanumeric code, not own code, code input auto-lowercased.
- Fish card "Send to Visit" button only appears when live sharing is active. This is a natural constraint since `senderCode` is required.
- The recall button appears both in fish cards (My Fish tab) and in the outgoing visits section (Shared tab).
- Visiting fish (from others) do NOT appear in My Fish tab -- they are filtered out. They appear in "Visitors in My Tank" section of the Shared tab.
- The visitor section shows remaining time (countdown in minutes).
- The outgoing section shows remaining time for sent fish.
- Both sections refresh when the Shared tab is opened.
- Toast notifications reuse the existing `fry-toast` CSS class for consistency.
- The send dialog reuses the same dialog patterns as purchase dialog (overlay, canvas preview, input, buttons).

### Acceptance Criteria

- [ ] "Send to Visit" button appears on fish cards only when live sharing is active.
- [ ] "Send to Visit" button does NOT appear on fry or visiting fish.
- [ ] Clicking "Send to Visit" opens the dialog with fish preview and code input.
- [ ] Entering own tank code shows error "You cannot visit your own tank."
- [ ] Entering invalid code shows validation error.
- [ ] Successful send shows toast and updates fish card with "Visiting [code]" badge and "Recall" button.
- [ ] Clicking "Recall" button removes the outgoing visit and refreshes the card.
- [ ] "Visitors in My Tank" section in Shared tab shows active visitors with countdown.
- [ ] "Fish on Visits" section in Shared tab shows outgoing visits with recall buttons.
- [ ] Visiting fish from others are NOT shown in My Fish tab.
- [ ] Visit badge (purple) appears on fish card names for outgoing visits.
- [ ] All existing tests still pass (`npm test`).

### Dependencies

- Phase 1 (worker endpoints).
- Phase 2 (client API functions).
- Phase 3 (createVisitingFish for rendering visitors).
- Phase 4 (polling and sync integration).
