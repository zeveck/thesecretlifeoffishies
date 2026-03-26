# Fish Gifting Plan

Permanently give a fish to another player. Uses an inbox pattern — gifts are pending until the recipient accepts or declines. Full fish data transfers. 72-hour TTL on unclaimed gifts. Sender gets fish back if gift expires.

## Progress Tracker

- [ ] Phase 1: Worker Gift Endpoints
- [ ] Phase 2: Client Gift API Functions
- [ ] Phase 3: Sender UI
- [ ] Phase 4: Recipient UI

## Dependencies

- **Visit Mode Booping plan must be complete first.** Fish gifting depends on the booping infrastructure being in place before work begins.

---

## Phase 1: Worker Gift Endpoints

### Goal
Add server-side endpoints to `_cloudflare/worker.js` for creating, retrieving, accepting, and declining fish gifts, with rate limiting and TTL-based expiry.

### Work Items

1. **Add gift constants** at the top of `worker.js`:
   ```js
   const GIFT_TTL = 72 * 60 * 60; // 72 hours in seconds
   const GIFT_MAX_PENDING_PER_SENDER = 5; // max outstanding gifts per sender code
   const GIFT_MAX_PAYLOAD = 10 * 1024; // 10KB max for a single fish
   ```

2. **POST /gift — Create a gift**
   - Route match: `path === '/gift'`
   - Request JSON:
     ```json
     {
       "senderCode": "ab12cd34",
       "recipientCode": "ef56gh78",
       "fish": {
         "speciesName": "Guppy",
         "name": "Bubbles",
         "x": 45.2, "y": 32.1, "z": 60.0,
         "heading": 1.23,
         "currentSize": 1.2,
         "hunger": 30,
         "strength": 75,
         "happiness": 85,
         "sadTimer": 0,
         "distanceSwum": 142.5,
         "xp": 14.25,
         "isFry": false,
         "fryAge": 0,
         "tailDots": 7
       }
     }
     ```
   - Validation:
     - `senderCode` must be an 8-char alphanumeric string matching `/^[a-z0-9]{8}$/i`
     - `recipientCode` must be an 8-char alphanumeric string matching `/^[a-z0-9]{8}$/i`
     - `senderCode !== recipientCode` (cannot gift to yourself)
     - `fish` must be an object with at least `speciesName` (string) and `currentSize` (number > 0)
     - Verify `recipientCode` exists: `await env.LIVE_TANKS.get('live:' + recipientCode)` must be non-null (recipient must have an active live share)
     - Content-Length <= `GIFT_MAX_PAYLOAD`
   - Rate limiting — check sender's pending gift count:
     - KV key: `gift_count:{senderCode}` stores a JSON number
     - Read current count; if >= `GIFT_MAX_PENDING_PER_SENDER`, return `429 { error: 'Too many pending gifts', max: 5 }`
     - Increment count on successful create; decrement on accept/decline/expire
   - Gift creation:
     - Generate an 8-char gift code using existing `generateCode()` function
     - KV key: `gift:{giftCode}`
     - KV value:
       ```json
       {
         "giftCode": "xy98wz76",
         "senderCode": "ab12cd34",
         "recipientCode": "ef56gh78",
         "fish": { ... },
         "createdAt": 1711324800000,
         "status": "pending"
       }
       ```
     - `expirationTtl: GIFT_TTL` (Cloudflare KV auto-deletes after 72 hours)
     - Also append gift code to recipient's inbox list:
       - KV key: `gift_inbox:{recipientCode}`
       - KV value: JSON array of gift codes, e.g. `["xy98wz76", "ab12cd34"]`
       - Read existing array, push new code, write back with `expirationTtl: GIFT_TTL`
       - Cap inbox at 20 entries; if full, return `409 { error: 'Recipient inbox full' }`
     - Increment `gift_count:{senderCode}` (read, increment, write with `expirationTtl: GIFT_TTL`)
   - Response: `201 { giftCode: "xy98wz76" }`

3. **GET /gift/inbox/:code — List pending gifts for a recipient**
   - Route match: `path.match(/^\/gift\/inbox\/([a-z0-9]{8})$/i)`
   - Read `gift_inbox:{code}` from KV
   - For each gift code in the array, read `gift:{giftCode}` from KV
   - Filter out any null entries (expired gifts whose KV entries were auto-deleted)
   - Clean up the inbox array by removing expired codes, write back
   - Response:
     ```json
     {
       "gifts": [
         {
           "giftCode": "xy98wz76",
           "senderCode": "ab12cd34",
           "fish": { "speciesName": "Guppy", "name": "Bubbles", "currentSize": 1.2, ... },
           "createdAt": 1711324800000
         }
       ]
     }
     ```
   - Return `200 { gifts: [] }` if no inbox key exists

4. **GET /gift/:giftCode — Get a single gift's details**
   - Route match: `path.match(/^\/gift\/([a-z0-9]{8})$/i)` (must be matched AFTER `/gift/inbox/` route)
   - Read `gift:{giftCode}` from KV
   - If not found: `404 { error: 'Gift not found or expired' }`
   - Response: `200` with the full gift object

5. **POST /gift/:giftCode/accept — Accept a gift**
   - Route match: `path.match(/^\/gift\/([a-z0-9]{8})\/accept$/i)`
   - Request JSON: `{ "recipientCode": "ef56gh78" }` (for authorization)
   - Read `gift:{giftCode}` from KV
   - Validate:
     - Gift exists (not expired): if null, return `404 { error: 'Gift not found or expired' }`
     - `gift.status === 'pending'`: if not, return `409 { error: 'Gift already processed' }`
     - `gift.recipientCode === recipientCode`: if not, return `403 { error: 'Not your gift' }`
   - On accept:
     - Delete `gift:{giftCode}` from KV
     - Remove giftCode from `gift_inbox:{recipientCode}` array (read, filter, write back)
     - Decrement `gift_count:{senderCode}` (read, decrement, write back; delete key if count reaches 0)
   - Response: `200 { accepted: true, fish: { ...fullFishData } }`

6. **POST /gift/:giftCode/decline — Decline a gift**
   - Route match: `path.match(/^\/gift\/([a-z0-9]{8})\/decline$/i)`
   - Request JSON: `{ "recipientCode": "ef56gh78" }` (for authorization)
   - Same validation as accept
   - On decline:
     - Delete `gift:{giftCode}` from KV
     - Remove giftCode from `gift_inbox:{recipientCode}` array
     - Decrement `gift_count:{senderCode}`
   - Response: `200 { declined: true, fish: { ...fullFishData } }` (fish data returned so sender-side recovery polling can detect decline and restore the fish)

7. **POST /gift/:giftCode/status — Check gift status (for sender polling)**
   - Route match: `path.match(/^\/gift\/([a-z0-9]{8})\/status$/i)`
   - Read `gift:{giftCode}` from KV
   - If not found (expired or accepted/declined): `404 { error: 'Gift not found or expired' }`
   - Response: `200 { status: "pending", createdAt: 1711324800000 }`

8. **Route ordering** — Add all gift routes in `worker.js` AFTER the existing `/live` routes but BEFORE the final 404 catch-all. The order of gift route matching must be:
   - `POST /gift` (exact match)
   - `GET /gift/inbox/:code`
   - `GET /gift/:giftCode`
   - `POST /gift/:giftCode/accept`
   - `POST /gift/:giftCode/decline`
   - `POST /gift/:giftCode/status`

### Design & Constraints

- **KV key schema summary:**
  - `gift:{giftCode}` — full gift data, TTL 72h
  - `gift_inbox:{recipientCode}` — array of pending gift codes, TTL 72h (refreshed on each write)
  - `gift_count:{senderCode}` — number of pending gifts from this sender, TTL 72h
- **No authentication beyond code-matching.** The senderCode/recipientCode are live share codes, which serve as weak identity tokens. This is acceptable for a casual game.
- **Idempotency:** Accept and decline delete the gift KV entry, so repeated calls return 404 (safe).
- **Auto-expiry:** Cloudflare KV `expirationTtl` handles the 72-hour cleanup. The inbox array may contain stale codes that point to expired gifts; the GET inbox endpoint cleans these up on read.
- **Payload size:** A single serialized fish is ~300-500 bytes. The 10KB limit is generous.
- **CORS:** All new endpoints use the same `json()` helper and `corsOrigin()` function as existing endpoints.

### Acceptance Criteria

- [ ] `POST /gift` creates a gift KV entry with 72h TTL and returns a gift code
- [ ] `POST /gift` returns 400 if senderCode or recipientCode is invalid
- [ ] `POST /gift` returns 404 if recipientCode has no active live share
- [ ] `POST /gift` returns 429 if sender has 5+ pending gifts
- [ ] `POST /gift` returns 409 if recipient inbox has 20+ entries
- [ ] `GET /gift/inbox/:code` returns all pending gifts for a recipient, filtering expired entries
- [ ] `GET /gift/:giftCode` returns full gift data or 404
- [ ] `POST /gift/:giftCode/accept` deletes the gift, cleans inbox, decrements sender count, returns fish data
- [ ] `POST /gift/:giftCode/decline` same as accept but returns `declined: true`
- [ ] `POST /gift/:giftCode/accept` returns 403 if recipientCode doesn't match
- [ ] `POST /gift/:giftCode/status` returns current status or 404 if expired/processed
- [ ] All endpoints return proper CORS headers
- [ ] All POST endpoints validate Content-Length against max payload

---

## Phase 2: Client Gift API Functions

### Goal
Add client-side functions in `js/live.js` for sending gifts, checking inbox, accepting/declining, and recovering expired gifts from localStorage backup.

### Work Items

1. **Add localStorage keys** in `js/live.js`:
   ```js
   const LS_PENDING_GIFTS = 'fishies_pending_gifts';
   ```

2. **sendGift(senderCode, recipientCode, fishData) -> Promise<{giftCode}>**
   - `fishData` is the output of `fish.serialize()` (full fish state)
   - POST to `${WORKER_URL}/gift` with `{ senderCode, recipientCode, fish: fishData }`
   - On success (201):
     - Save gift to `LS_PENDING_GIFTS` localStorage for sender-side recovery:
       ```json
       [
         {
           "giftCode": "xy98wz76",
           "recipientCode": "ef56gh78",
           "fish": { ...serialized fish data },
           "sentAt": 1711324800000
         }
       ]
       ```
     - Return `{ giftCode }` from response
   - On error: throw with the error message from the response body
   - Function signature:
     ```js
     export async function sendGift(senderCode, recipientCode, fishData)
     ```

3. **fetchGiftInbox(myCode) -> Promise<{gifts: []}>**
   - GET `${WORKER_URL}/gift/inbox/${myCode}`
   - Returns the gifts array from the response
   - If response is not ok, return `{ gifts: [] }`
   - Function signature:
     ```js
     export async function fetchGiftInbox(myCode)
     ```

4. **acceptGift(giftCode, myCode) -> Promise<{fish}>**
   - POST `${WORKER_URL}/gift/${giftCode}/accept` with `{ recipientCode: myCode }`
   - Returns `{ fish }` from response on success
   - Throws on error
   - Function signature:
     ```js
     export async function acceptGift(giftCode, myCode)
     ```

5. **declineGift(giftCode, myCode) -> Promise<void>**
   - POST `${WORKER_URL}/gift/${giftCode}/decline` with `{ recipientCode: myCode }`
   - Returns void on success
   - Throws on error
   - Function signature:
     ```js
     export async function declineGift(giftCode, myCode)
     ```

6. **checkGiftStatus(giftCode) -> Promise<{status, createdAt} | null>**
   - POST `${WORKER_URL}/gift/${giftCode}/status`
   - Returns `{ status, createdAt }` on 200
   - Returns `null` on 404 (gift expired or processed)
   - Function signature:
     ```js
     export async function checkGiftStatus(giftCode)
     ```

7. **getPendingGifts() -> Array**
   - Read `LS_PENDING_GIFTS` from localStorage, parse JSON, return array
   - Return `[]` on any error
   - Function signature:
     ```js
     export function getPendingGifts()
     ```

8. **addPendingGift(giftCode, recipientCode, fishData)**
   - Read current pending gifts, append new entry with `sentAt: Date.now()`, write back
   - Function signature:
     ```js
     export function addPendingGift(giftCode, recipientCode, fishData)
     ```

9. **removePendingGift(giftCode)**
   - Read current pending gifts, filter out the matching giftCode, write back
   - Function signature:
     ```js
     export function removePendingGift(giftCode)
     ```

10. **recoverExpiredGifts() -> Array<fishData>**
    - Read `LS_PENDING_GIFTS` from localStorage
    - For each pending gift, call `checkGiftStatus(giftCode)`
    - If status is `null` (gift expired/processed) AND `Date.now() - sentAt > GIFT_TTL * 1000`:
      - The gift expired (not accepted/declined) — return the fish data for recovery
      - Remove from pending gifts list
    - If status is still `"pending"`: leave in pending list, skip
    - Return array of fish data objects that should be restored to the sender's tank
    - This function is called on app startup (in `init()`) and periodically (every 5 minutes)
    - Function signature:
      ```js
      export async function recoverExpiredGifts()
      ```
    - **Important edge case:** If the gift was accepted or declined (not expired), the KV entry is deleted. The sender cannot distinguish "accepted" from "expired" via status alone. To handle this:
      - If `checkGiftStatus` returns null AND `sentAt + GIFT_TTL_MS` has NOT passed yet, the gift was likely accepted/declined (not expired) — remove from pending list but do NOT recover the fish
      - If `checkGiftStatus` returns null AND `sentAt + GIFT_TTL_MS` HAS passed, the gift expired — recover the fish

### Design & Constraints

- **localStorage backup is the safety net.** The sender's fish data is stored locally so that if the gift expires (recipient never responds), the fish can be restored. This is critical because the fish is removed from the sender's tank immediately upon sending.
- **No polling loop for gift status.** Recovery checks happen on app startup and every 5 minutes via a `setInterval` started in `init()`. This keeps network usage low.
- **All API functions follow the same pattern as existing live.js functions:** fetch with WORKER_URL, JSON content type, simple error handling.
- **Export all new functions** so `ui.js` and `main.js` can import them.

### Acceptance Criteria

- [ ] `sendGift` POSTs to `/gift` and saves backup to localStorage on success
- [ ] `fetchGiftInbox` returns pending gifts array for a given code
- [ ] `acceptGift` POSTs to accept endpoint and returns fish data
- [ ] `declineGift` POSTs to decline endpoint
- [ ] `checkGiftStatus` returns status or null for expired/processed gifts
- [ ] `getPendingGifts` reads from localStorage correctly
- [ ] `addPendingGift` / `removePendingGift` correctly maintain the localStorage array
- [ ] `recoverExpiredGifts` returns fish data only for truly expired gifts (past 72h), not accepted/declined ones
- [ ] `recoverExpiredGifts` removes processed gifts from localStorage pending list regardless of outcome

---

## Phase 3: Sender UI

### Goal
Add a "Give" button to fish cards in the My Fish tab, a recipient code dialog with bookmark picker, an "away" badge on gifted fish, and a confirmation flow.

### Work Items

1. **Add "Give" button to fish cards in `refreshMyFish()` in `js/ui.js`:**
   - After the existing rename click handler on each fish card, add a "Give" button element
   - Button is a small secondary button below the fish card info, labeled "Gift"
   - Button is ONLY shown when `isLiveSharing()` is true (sender must have an active live share)
   - Button is NOT shown during visit mode (`isVisitMode` is true)
   - Button is NOT shown for fry (`fish.isFry` is true) — fry cannot be gifted
   - Button click opens the gift dialog (see next item) and stops event propagation (so it doesn't trigger the rename handler)
   - HTML structure inside each `.fish-card`:
     ```html
     <button class="fish-gift-btn">Gift</button>
     ```

2. **Gift dialog (`showGiftDialog(fish)`) in `js/ui.js`:**
   - Reuse the pattern from `showPurchaseDialog` / `showConfirm`
   - Add new HTML elements to `index.html`:
     ```html
     <div id="gift-overlay" class="overlay hidden">
       <div class="dialog gift-dialog">
         <div class="gift-dialog-title">Gift Fish</div>
         <div id="gift-fish-name" class="gift-fish-name"></div>
         <canvas id="gift-fish-canvas" width="160" height="96"></canvas>
         <div class="gift-recipient-section">
           <label for="gift-recipient-input">Recipient's tank code:</label>
           <input id="gift-recipient-input" type="text" maxlength="8" placeholder="e.g. ab12cd34" autocomplete="off" />
           <div id="gift-bookmark-picker" class="gift-bookmark-picker"></div>
         </div>
         <div id="gift-error" class="gift-error hidden"></div>
         <div class="dialog-actions">
           <button id="gift-cancel" class="btn-cancel">Cancel</button>
           <button id="gift-confirm" class="btn-confirm">Send Gift</button>
         </div>
       </div>
     </div>
     ```
   - The dialog shows:
     - Fish portrait (drawn on `gift-fish-canvas` using the same technique as `refreshMyFish` portrait drawing)
     - Fish display name
     - Text input for recipient tank code (8-char alphanumeric)
     - Bookmark picker: list the sender's bookmarks (from `getBookmarks()`) as clickable chips. Clicking a chip fills the input with that bookmark's code.
     - Error message area (hidden by default)
     - Cancel and Send Gift buttons

3. **Bookmark picker in gift dialog:**
   - In `showGiftDialog`, populate `#gift-bookmark-picker` with bookmark chips:
     ```html
     <button class="gift-bookmark-chip" data-code="ef56gh78">ef56gh78 (Lv3, 5 fish)</button>
     ```
   - Clicking a chip sets `#gift-recipient-input.value` to the chip's `data-code`
   - If no bookmarks exist, show: "Visit a friend's tank to add them as a bookmark"

4. **Gift confirmation flow in `showGiftDialog`:**
   - On "Send Gift" click:
     - Validate input: code must be exactly 8 alphanumeric chars. If invalid, show error: "Enter a valid 8-character tank code"
     - Validate: code must not equal sender's own `getLiveCode()`. If same, show error: "You can't gift a fish to yourself"
     - Disable the confirm button, change text to "Sending..."
     - Call `sendGift(getLiveCode(), recipientCode, fish.serialize())`
     - On success:
       - Remove the fish from `fishes` array in `main.js` (need to expose a `removeFishById(id)` function — see below)
       - Close the dialog
       - Show a toast: "Gift sent! {fishName} is on their way."
       - Trigger a save (`saveGame(getSaveState())`)
       - Refresh the My Fish tab
     - On error:
       - Re-enable button, restore text to "Send Gift"
       - Show error message from the API response (e.g., "Recipient inbox full", "Too many pending gifts")

5. **Expose `removeFishById(id)` from `main.js`:**
   - Add to `main.js`:
     ```js
     export function removeFishById(id) {
         const idx = fishes.findIndex(f => f.id === id);
         if (idx !== -1) fishes.splice(idx, 1);
     }
     ```
   - Import in `ui.js` alongside the other main.js imports (currently none directly, but `initUI` receives fishes reference — so alternatively, filter the `fishesRef` array directly since it's a reference to the same array in main.js)
   - **Preferred approach:** Since `fishesRef` is a reference to the `fishes` array in `main.js`, directly splice from `fishesRef`:
     ```js
     const idx = fishesRef.findIndex(f => f.id === fish.id);
     if (idx !== -1) fishesRef.splice(idx, 1);
     ```
   - This avoids adding a new export to `main.js`.

6. **"Away" badge on pending gifts in My Fish tab:**
   - When rendering fish cards in `refreshMyFish()`, check `getPendingGifts()` to see if any pending gift references this fish (by matching serialized fish data — use `fish.name` + `fish.species.name` + `fish.currentSize` as a loose match key, or better: the fish is already removed from the array so it won't appear).
   - **Actually:** Since the fish is removed from `fishes` on send, there is no "away" badge needed on the My Fish tab. The fish simply disappears. Instead, show pending outgoing gifts as a separate section at the bottom of the My Fish tab:
     ```html
     <div class="pending-gifts-section">
       <div class="section-header">Pending Gifts</div>
       <!-- For each pending gift: -->
       <div class="pending-gift-card">
         <div class="pending-gift-name">Bubbles (Guppy)</div>
         <div class="pending-gift-status">Sent to ef56gh78 — awaiting response</div>
         <div class="pending-gift-expires">Expires in 47h</div>
       </div>
     </div>
     ```
   - This section only appears if `getPendingGifts().length > 0`
   - Show time remaining: `Math.max(0, 72 * 60 * 60 * 1000 - (Date.now() - sentAt))` formatted as hours

7. **Gift toast notification** — reuse the existing `showFryToast` pattern from `main.js`:
   - Add a `showGiftToast(message)` function in `ui.js`:
     ```js
     function showGiftToast(message) {
         const toast = document.createElement('div');
         toast.className = 'fry-toast'; // reuse existing toast styling
         toast.textContent = message;
         document.body.appendChild(toast);
         setTimeout(() => {
             toast.classList.add('fry-toast-out');
             toast.addEventListener('animationend', () => toast.remove());
         }, 2500);
     }
     ```

### Design & Constraints

- **Gift button only appears when live sharing is active.** Both sender and recipient must have live shares for gifting to work (recipient's code must be a valid live share code).
- **Fry cannot be gifted.** This prevents exploiting breeding mechanics across tanks.
- **Fish is removed from sender's tank immediately** on successful API call. The localStorage backup in `LS_PENDING_GIFTS` is the safety net for recovery.
- **Bookmark picker provides convenience** — no need to manually type codes if you've visited the recipient's tank before.
- **The gift dialog prevents self-gifting** by comparing against `getLiveCode()`.
- **Stop propagation on gift button click** to prevent the rename prompt from firing.

### Acceptance Criteria

- [ ] "Gift" button appears on each fish card when live sharing is active
- [ ] "Gift" button does NOT appear for fry, during visit mode, or when not live sharing
- [ ] Gift dialog opens with fish portrait, name, recipient code input, and bookmark picker
- [ ] Bookmark chips populate from `getBookmarks()` and fill the input on click
- [ ] Input validation: rejects non-8-char codes, self-gifting
- [ ] Successful send: removes fish from tank, closes dialog, shows toast, triggers save
- [ ] Failed send: shows error message, re-enables button
- [ ] Pending gifts section appears at bottom of My Fish tab with expiry countdown
- [ ] Fish card rename still works (gift button click doesn't bubble)

### Dependencies

- Phase 1 (Worker endpoints) must be complete
- Phase 2 (Client API functions) must be complete

---

## Phase 4: Recipient UI

### Goal
Add a gift notification banner, accept/decline buttons with capacity check, and toast notifications for incoming gifts. Wire up gift recovery on app startup.

### Work Items

1. **Gift notification banner in `index.html`:**
   ```html
   <div id="gift-banner" class="gift-banner hidden">
     <div class="gift-banner-content">
       <div id="gift-banner-text" class="gift-banner-text"></div>
       <div class="gift-banner-actions">
         <button id="gift-accept-btn" class="btn-confirm">Accept</button>
         <button id="gift-decline-btn" class="btn-cancel">Decline</button>
       </div>
     </div>
   </div>
   ```
   - Positioned at top of screen, below the visit banner area, using CSS:
     ```css
     .gift-banner {
         position: fixed;
         top: 0;
         left: 0;
         right: 0;
         z-index: 900;
         background: linear-gradient(135deg, #1a3a5c, #0f2a44);
         border-bottom: 2px solid #4a9eff;
         padding: 12px 16px;
         text-align: center;
         color: #d0e4f0;
         font-size: 0.9rem;
         animation: slideDown 0.3s ease-out;
     }
     .gift-banner.hidden { display: none; }
     .gift-banner-actions {
         display: flex;
         gap: 8px;
         justify-content: center;
         margin-top: 8px;
     }
     ```

2. **Gift inbox polling — `checkGiftInbox()` in `js/ui.js`:**
   - Function called on app startup (after `init()`) and every 60 seconds
   - Only runs if `isLiveSharing()` is true
   - Calls `fetchGiftInbox(getLiveCode())`
   - If gifts array is non-empty, show the first pending gift in the banner
   - Store the current inbox in a module-level variable `currentGiftInbox = []`
   - Function signature:
     ```js
     async function checkGiftInbox()
     ```

3. **Show gift banner — `showGiftBanner(gift)` in `js/ui.js`:**
   - `gift` is one entry from the inbox response
   - Set banner text: "You received a gift! {fish.name || fish.speciesName} ({fish.currentSize}" long) from tank {gift.senderCode}"
   - Show the banner by removing `hidden` class
   - Wire accept button:
     - **Capacity check first:** Before accepting, verify the fish will fit:
       ```js
       const used = getCurrentStockInches(fishesRef);
       const cap = getTankCapacity();
       const fishSize = gift.fish.currentSize;
       if (used + fishSize > cap) {
           showGiftToast('Your tank is too full for this fish!');
           return;
       }
       ```
     - Also check species level requirement:
       ```js
       const species = SPECIES_CATALOG.find(s => s.name === gift.fish.speciesName);
       if (species && species.level > getProgression().level) {
           showGiftToast(`You need Level ${species.level} to keep a ${species.name}!`);
           return;
       }
       ```
     - On passing checks:
       - Disable both buttons, set accept text to "Accepting..."
       - Call `acceptGift(gift.giftCode, getLiveCode())`
       - On success:
         - Deserialize the fish: `const fish = Fish.deserialize(response.fish)`
         - Add to tank: `fishesRef.push(fish)`
         - Hide the banner
         - Show toast: "{fishName} joined your tank!"
         - Trigger save
         - Advance to next gift in inbox (if any) or hide banner
       - On error:
         - Re-enable buttons
         - Show toast with error message
   - Wire decline button:
     - Show confirmation: "Are you sure? The fish will be returned to the sender."
     - On confirm:
       - Disable both buttons
       - Call `declineGift(gift.giftCode, getLiveCode())`
       - On success:
         - Hide the banner
         - Show toast: "Gift declined."
         - Advance to next gift in inbox
       - On error: re-enable buttons, show error toast

4. **Gift inbox index tracking:**
   - Module-level variable `currentGiftIndex = 0`
   - After accepting/declining, increment `currentGiftIndex`
   - If `currentGiftIndex < currentGiftInbox.length`, show next gift banner
   - Otherwise, hide banner and reset index to 0

5. **Wire gift inbox check into app startup in `main.js`:**
   - After `init()` completes and if `isLiveSharing()`:
     ```js
     // Check for incoming gifts
     if (isLiveSharing()) {
         checkGiftInbox();
         setInterval(checkGiftInbox, 60000);
     }
     ```
   - Export `checkGiftInbox` from `ui.js` and import in `main.js`
   - Also start the check when live sharing is started (in the shared tab toggle handler)

6. **Wire expired gift recovery into app startup in `main.js`:**
   - After `init()` completes:
     ```js
     // Recover expired gifts
     recoverExpiredGifts().then(recoveredFish => {
         for (const fishData of recoveredFish) {
             const fish = Fish.deserialize(fishData);
             if (fish) {
                 fishes.push(fish);
                 showGiftToast(`${fish.displayName()} returned home (gift expired)`);
             }
         }
         if (recoveredFish.length > 0) {
             saveGame(getSaveState());
         }
     });
     ```
   - Also set up a 5-minute interval for ongoing recovery checks:
     ```js
     setInterval(async () => {
         const recovered = await recoverExpiredGifts();
         for (const fishData of recovered) {
             const fish = Fish.deserialize(fishData);
             if (fish) {
                 fishes.push(fish);
                 showGiftToast(`${fish.displayName()} returned home (gift expired)`);
             }
         }
         if (recovered.length > 0) saveGame(getSaveState());
     }, 5 * 60 * 1000);
     ```

7. **Export `showGiftToast` from `ui.js`** so `main.js` can use it for recovery toasts. Alternatively, define the recovery toast logic inside `main.js` using the existing `showFryToast` pattern.

8. **Gift notification dot on menu button:**
   - When `checkGiftInbox` finds pending gifts, add a notification dot to the menu button:
     ```html
     <span id="gift-dot" class="gift-dot hidden"></span>
     ```
   - CSS:
     ```css
     .gift-dot {
         position: absolute;
         top: 2px;
         right: 2px;
         width: 8px;
         height: 8px;
         background: #ff4444;
         border-radius: 50%;
         border: 1px solid #0a1628;
     }
     .gift-dot.hidden { display: none; }
     ```
   - Show dot when `currentGiftInbox.length > 0`, hide when all gifts are processed

### Design & Constraints

- **Capacity and level checks happen client-side before accepting.** The server does not validate tank capacity — it only stores and transfers data. The client is trusted to check capacity because there's no competitive advantage to cheating in a casual fish game.
- **One gift shown at a time** in the banner. After processing, the next gift in the inbox is shown. This avoids overwhelming the UI.
- **The banner does NOT block gameplay.** Fish continue swimming. The player can dismiss the banner by declining or accepting. If they ignore it, it stays visible as a gentle reminder.
- **Gift recovery on startup** handles the case where the sender closed the app while gifts were pending and they expired. The fish data from localStorage is deserialized and added back to the tank.
- **Recovery distinguishes expired from accepted/declined** using the timestamp logic from Phase 2's `recoverExpiredGifts()`. Fish are only restored if 72+ hours have passed AND the server returns 404 for the gift status.
- **The 60-second inbox poll interval** is intentionally slow. Gifts are not time-critical; a 1-minute delay is acceptable.
- **Visit mode skips gift checks.** `checkGiftInbox` early-returns if `isVisitMode` is true.

### Acceptance Criteria

- [ ] Gift banner appears when there are pending incoming gifts
- [ ] Accept button checks tank capacity and species level before accepting
- [ ] Accept button adds the deserialized fish to the tank and triggers save
- [ ] Decline button shows confirmation, then returns the fish to the sender's recovery pool
- [ ] Capacity error shows a clear toast message
- [ ] Level requirement error shows the required level
- [ ] Banner advances to next gift after processing one
- [ ] Gift inbox is polled every 60 seconds when live sharing is active
- [ ] Expired gifts are recovered on startup and every 5 minutes
- [ ] Recovered fish appear in the tank with a toast notification
- [ ] Notification dot appears on menu button when gifts are pending
- [ ] Gift checks do not run during visit mode

### Dependencies

- Phase 1 (Worker endpoints) must be complete
- Phase 2 (Client API functions) must be complete
- Phase 3 (Sender UI) must be complete (so the full send-accept-decline cycle can be tested end-to-end)
