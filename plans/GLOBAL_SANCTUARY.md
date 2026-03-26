# Plan: Global Sanctuary (Endless Tank)

A server-stored, globally shared tank that all players can contribute fish to. The sanctuary is a horizontally scrollable, chunk-based infinite aquarium where retired fish live in perfect conditions — never hungry, always happy, and boopable by anyone who visits.

## Progress Tracker

- [x] Phase 1: Worker Sanctuary Endpoints
- [x] Phase 2: Client Sanctuary Module (`js/sanctuary.js`)
- [x] Phase 3: Canvas Scrolling and Rendering
- [x] Phase 4: Fish Update Loop and Boop Handling
- [x] Phase 5: UI Integration (Retire Flow, Entry Point, Banner)

## Dependencies

- **Visit Mode Booping** plan must be complete first. The sanctuary reuses `boopVisit()` and the visit-mode boop timer handling from that plan. Without it, fish in the sanctuary cannot be booped.

---

## Phase 1: Worker Sanctuary Endpoints

### Goal
Add three new endpoints to the Cloudflare Worker for managing the global sanctuary: retiring fish into it, reading metadata, and fetching fish chunks.

### Work Items

1. **Add sanctuary constants** at the top of `_cloudflare/worker.js`:
   ```js
   const SANCTUARY_META_KEY = 'sanctuary:meta';
   const SANCTUARY_CHUNK_PREFIX = 'sanctuary:chunk:';
   const CHUNK_SIZE = 50; // fish per chunk
   const MAX_SANCTUARY_FISH = 10000;
   const RETIRE_RATE_LIMIT_KEY_PREFIX = 'ratelimit:retire:';
   const RETIRE_COOLDOWN_SECONDS = 60; // 1 retire per minute per IP
   ```

2. **KV Key Schema**:
   - `sanctuary:meta` — JSON object:
     ```json
     {
       "totalFish": 347,
       "totalChunks": 7,
       "lastUpdated": 1711324800000
     }
     ```
   - `sanctuary:chunk:0` through `sanctuary:chunk:N` — JSON arrays of fish objects:
     ```json
     [
       {
         "speciesName": "Guppy",
         "name": "Bubbles",
         "currentSize": 1.2,
         "isFry": false,
         "tailDots": 14,
         "retiredAt": 1711324800000,
         "retiredBy": "a3f8"
       }
     ]
     ```
     Each chunk holds up to `CHUNK_SIZE` (50) fish. The `retiredBy` field is the first 4 chars of a hash of the IP, used only for display flair (not auth). Chunks are append-only; new fish go into the last chunk until it reaches 50, then a new chunk is created.

   - `ratelimit:retire:<ip-hash>` — empty value, TTL = `RETIRE_COOLDOWN_SECONDS`. Presence means "this IP retired recently."

3. **POST `/sanctuary/retire`** — Retire a fish to the sanctuary:
   - **Request body**:
     ```json
     {
       "speciesName": "Guppy",
       "name": "Bubbles",
       "currentSize": 1.2,
       "isFry": false,
       "tailDots": 14
     }
     ```
   - **Rate limiting**: Hash the client IP (`request.headers.get('CF-Connecting-IP')`) with a simple approach: `const ipHash = (await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))).slice(0,4)` converted to hex. Check `ratelimit:retire:<ipHash>` in KV. If present, return `429 { error: 'Too many retirements. Try again in a minute.' }`. Otherwise, set the key with TTL.
   - **Validation**: Verify `speciesName` is a non-empty string, `currentSize` is a positive number <= 10. If invalid, return `400 { error: 'Invalid fish data' }`.
   - **Payload size check**: Same `MAX_PAYLOAD` (50KB) check as existing endpoints.
   - **Append logic**:
     1. Read `sanctuary:meta`. If absent, create `{ totalFish: 0, totalChunks: 0, lastUpdated: Date.now() }`.
     2. If `totalFish >= MAX_SANCTUARY_FISH`, return `507 { error: 'Sanctuary is full' }`.
     3. Calculate `chunkIndex = Math.floor(meta.totalFish / CHUNK_SIZE)`.
     4. Read `sanctuary:chunk:<chunkIndex>`. If absent, start with `[]`.
     5. Append the fish object with `retiredAt: Date.now()` and `retiredBy: ipHash.slice(0,4)`.
     6. Write chunk back. Write updated meta with `totalFish + 1`, recomputed `totalChunks = chunkIndex + 1`, and new `lastUpdated`.
     7. Return `201 { ok: true, totalFish: meta.totalFish + 1 }`.
   - **No TTL** on sanctuary keys — they persist forever.

   Implementation in the `fetch` handler, after the existing DELETE block:
   ```js
   // POST /sanctuary/retire
   if (request.method === 'POST' && path === '/sanctuary/retire') {
       const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
       if (contentLength > MAX_PAYLOAD) {
           return json({ error: 'Payload too large' }, 413, request, env);
       }

       // Rate limit by IP
       const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
       const ipBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
       const ipHash = [...new Uint8Array(ipBuf.slice(0, 4))].map(b => b.toString(16).padStart(2, '0')).join('');
       const rlKey = RETIRE_RATE_LIMIT_KEY_PREFIX + ipHash;
       const rlCheck = await env.LIVE_TANKS.get(rlKey);
       if (rlCheck !== null) {
           return json({ error: 'Too many retirements. Try again in a minute.' }, 429, request, env);
       }

       let body;
       try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, request, env); }

       // Validate
       if (!body.speciesName || typeof body.speciesName !== 'string') {
           return json({ error: 'Invalid fish data' }, 400, request, env);
       }
       if (typeof body.currentSize !== 'number' || body.currentSize <= 0 || body.currentSize > 10) {
           return json({ error: 'Invalid fish data' }, 400, request, env);
       }

       // Read meta
       const metaRaw = await env.LIVE_TANKS.get(SANCTUARY_META_KEY);
       const meta = metaRaw ? JSON.parse(metaRaw) : { totalFish: 0, totalChunks: 0, lastUpdated: Date.now() };

       if (meta.totalFish >= MAX_SANCTUARY_FISH) {
           return json({ error: 'Sanctuary is full' }, 507, request, env);
       }

       const chunkIndex = Math.floor(meta.totalFish / CHUNK_SIZE);
       const chunkKey = SANCTUARY_CHUNK_PREFIX + chunkIndex;
       const chunkRaw = await env.LIVE_TANKS.get(chunkKey);
       const chunk = chunkRaw ? JSON.parse(chunkRaw) : [];

       const fishEntry = {
           speciesName: body.speciesName,
           name: (body.name || '').slice(0, 30),
           currentSize: body.currentSize,
           isFry: !!body.isFry,
           tailDots: body.tailDots || 0,
           retiredAt: Date.now(),
           retiredBy: ipHash.slice(0, 4),
       };
       chunk.push(fishEntry);

       // Write chunk and meta
       await env.LIVE_TANKS.put(chunkKey, JSON.stringify(chunk));
       meta.totalFish += 1;
       meta.totalChunks = chunkIndex + 1;
       meta.lastUpdated = Date.now();
       await env.LIVE_TANKS.put(SANCTUARY_META_KEY, JSON.stringify(meta));

       // Set rate limit
       await env.LIVE_TANKS.put(rlKey, '1', { expirationTtl: RETIRE_COOLDOWN_SECONDS });

       return json({ ok: true, totalFish: meta.totalFish }, 201, request, env);
   }
   ```

4. **GET `/sanctuary/meta`** — Return sanctuary metadata:
   - **Response**: The stored meta object, or defaults if absent.
   ```js
   if (request.method === 'GET' && path === '/sanctuary/meta') {
       const metaRaw = await env.LIVE_TANKS.get(SANCTUARY_META_KEY);
       const meta = metaRaw ? JSON.parse(metaRaw) : { totalFish: 0, totalChunks: 0, lastUpdated: 0 };
       return json(meta, 200, request, env);
   }
   ```

5. **GET `/sanctuary/chunk/:index`** — Return a chunk of fish:
   - Path pattern: `/sanctuary/chunk/<non-negative integer>`
   ```js
   const chunkMatch = path.match(/^\/sanctuary\/chunk\/(\d+)$/);
   if (request.method === 'GET' && chunkMatch) {
       const idx = parseInt(chunkMatch[1], 10);
       const chunkKey = SANCTUARY_CHUNK_PREFIX + idx;
       const chunkRaw = await env.LIVE_TANKS.get(chunkKey);
       if (!chunkRaw) {
           return json({ error: 'Chunk not found' }, 404, request, env);
       }
       return json(JSON.parse(chunkRaw), 200, request, env);
   }
   ```

6. **Update CORS preflight**: No changes needed — the existing OPTIONS handler already covers all methods and paths.

### Design & Constraints
- **Concurrency on retire**: Two simultaneous retires could both read the same chunk count and overwrite each other. KV is eventually consistent but since sanctuary is append-only and the race window is tiny for a casual game, this is acceptable. Worst case: one fish is lost, which is fine for a non-critical feature.
- **KV storage math**: 50 fish per chunk * ~150 bytes per fish = ~7.5KB per chunk (well under 25MB limit). 10,000 fish = 200 chunks max.
- **No auth/secrets**: The sanctuary is fully public. Rate limiting by IP prevents abuse.

### Acceptance Criteria
- [ ] `POST /sanctuary/retire` creates fish entry in the correct chunk, updates meta, returns 201
- [ ] `POST /sanctuary/retire` returns 429 if called twice within 60 seconds from same IP
- [ ] `POST /sanctuary/retire` returns 400 for missing speciesName or invalid currentSize
- [ ] `POST /sanctuary/retire` returns 507 when totalFish >= 10000
- [ ] `GET /sanctuary/meta` returns `{ totalFish, totalChunks, lastUpdated }` (200) or defaults when empty
- [ ] `GET /sanctuary/chunk/0` returns array of fish objects (200) or 404 if not found
- [ ] All endpoints return proper CORS headers

### Dependencies
- None (worker changes are independent)

---

## Phase 2: Client Sanctuary Module (`js/sanctuary.js`)

### Goal
Create a new ES module that handles all sanctuary API calls, chunk caching, camera state, and fish lifecycle management for the sanctuary view.

### Work Items

1. **Create `js/sanctuary.js`** with the following exports:

2. **API functions**:
   ```js
   import { WORKER_URL } from './live.js';
   import { Fish } from './fish.js';

   // --- API ---

   /** Fetch sanctuary metadata. Returns { totalFish, totalChunks, lastUpdated }. */
   export async function fetchSanctuaryMeta() {
       const resp = await fetch(`${WORKER_URL}/sanctuary/meta`);
       if (!resp.ok) return { totalFish: 0, totalChunks: 0, lastUpdated: 0 };
       return resp.json();
   }

   /** Fetch a single chunk by index. Returns array of fish data objects or null. */
   export async function fetchSanctuaryChunk(index) {
       const resp = await fetch(`${WORKER_URL}/sanctuary/chunk/${index}`);
       if (!resp.ok) return null;
       return resp.json();
   }

   /** Retire a fish to the sanctuary. Takes a fish data object (from extractRetireData). Returns { ok, totalFish } or throws. */
   export async function retireFish(fishData) {
       const resp = await fetch(`${WORKER_URL}/sanctuary/retire`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(fishData),
       });
       if (!resp.ok) {
           const err = await resp.json().catch(() => ({ error: 'Network error' }));
           throw new Error(err.error || `HTTP ${resp.status}`);
       }
       return resp.json();
   }

   /** Extract the fields needed for retirement from a Fish instance. */
   export function extractRetireData(fish) {
       return {
           speciesName: fish.species.name,
           name: fish.name,
           currentSize: fish.currentSize,
           isFry: fish.isFry,
           tailDots: fish.tailDots,
       };
   }
   ```

3. **Chunk cache and fish management**:
   ```js
   // --- Chunk cache ---
   // Map<number, { data: FishData[], fish: Fish[], loaded: boolean }>
   const chunkCache = new Map();
   let sanctuaryMeta = { totalFish: 0, totalChunks: 0, lastUpdated: 0 };
   let loadingChunks = new Set(); // chunk indices currently being fetched

   /** Get cached Fish instances for a chunk, or null if not loaded. */
   export function getChunkFish(chunkIndex) {
       const entry = chunkCache.get(chunkIndex);
       return entry && entry.loaded ? entry.fish : null;
   }

   /** Check if a chunk is currently loading. */
   export function isChunkLoading(chunkIndex) {
       return loadingChunks.has(chunkIndex);
   }

   /** Request a chunk to be loaded. Non-blocking — fetches in background. */
   export function requestChunk(chunkIndex) {
       if (chunkCache.has(chunkIndex) || loadingChunks.has(chunkIndex)) return;
       if (chunkIndex < 0 || chunkIndex >= sanctuaryMeta.totalChunks) return;
       loadingChunks.add(chunkIndex);
       fetchSanctuaryChunk(chunkIndex).then(data => {
           if (data) {
               const fish = data.map(fd => Fish.createVisitor(fd)).filter(Boolean);
               // Distribute fish across the chunk's x-range (0-100 within chunk)
               for (const f of fish) {
                   f.x = Math.random() * 90 + 5; // 5-95 within chunk-local coords
                   f.y = Math.random() * 70 + 10; // 10-80
               }
               chunkCache.set(chunkIndex, { data, fish, loaded: true });
           }
           loadingChunks.delete(chunkIndex);
       }).catch(() => {
           loadingChunks.delete(chunkIndex);
       });
   }

   /** Clear all cached chunks (called on exit). */
   export function clearSanctuaryCache() {
       chunkCache.clear();
       loadingChunks.clear();
       sanctuaryMeta = { totalFish: 0, totalChunks: 0, lastUpdated: 0 };
   }

   /** Initialize sanctuary — fetch meta, return it. */
   export async function initSanctuary() {
       sanctuaryMeta = await fetchSanctuaryMeta();
       return sanctuaryMeta;
   }

   export function getSanctuaryMeta() {
       return sanctuaryMeta;
   }
   ```

4. **Camera state** (horizontal scrolling):
   ```js
   // --- Camera ---
   // Camera position in "world X" coordinates.
   // World is divided into chunks. Each chunk spans CHUNK_WORLD_WIDTH in world units.
   // Camera.x is the left edge of the viewport in world coords.
   const CHUNK_WORLD_WIDTH = 100; // each chunk is 100 world units wide

   let camera = { x: 0 }; // world-x of the viewport's left edge

   export function getCameraX() { return camera.x; }

   export function setCameraX(x) {
       const totalWidth = sanctuaryMeta.totalChunks * CHUNK_WORLD_WIDTH;
       // Allow panning from 0 to (totalWidth - 100), so the rightmost chunk is fully visible
       camera.x = Math.max(0, Math.min(x, Math.max(0, totalWidth - CHUNK_WORLD_WIDTH)));
   }

   export function panCamera(dx) {
       setCameraX(camera.x + dx);
   }

   /** Return array of chunk indices that overlap the current viewport. */
   export function getVisibleChunkIndices() {
       const left = camera.x;
       const right = camera.x + CHUNK_WORLD_WIDTH; // viewport is 100 world units wide
       const firstChunk = Math.max(0, Math.floor(left / CHUNK_WORLD_WIDTH));
       const lastChunk = Math.min(
           sanctuaryMeta.totalChunks - 1,
           Math.floor(right / CHUNK_WORLD_WIDTH)
       );
       const indices = [];
       for (let i = firstChunk; i <= lastChunk; i++) {
           indices.push(i);
       }
       return indices;
   }

   export { CHUNK_WORLD_WIDTH };
   ```

5. **Collecting all visible fish for rendering**:
   ```js
   /** Return all Fish instances that should be rendered in the current viewport.
    *  Each fish's x is adjusted to screen-local coords (0-100 range relative to viewport).
    *  Also pre-fetches chunks 1 ahead in each direction. */
   export function getVisibleFish() {
       const visible = getVisibleChunkIndices();
       const result = [];

       // Pre-fetch 1 chunk ahead in each direction
       for (const idx of visible) {
           requestChunk(idx);
           if (idx > 0) requestChunk(idx - 1);
           if (idx < sanctuaryMeta.totalChunks - 1) requestChunk(idx + 1);
       }

       for (const chunkIdx of visible) {
           const fish = getChunkFish(chunkIdx);
           if (!fish) continue;
           for (const f of fish) {
               // Convert chunk-local x (0-100) to world x, then to viewport x (0-100)
               const worldX = chunkIdx * CHUNK_WORLD_WIDTH + f.x;
               const viewportX = worldX - camera.x;
               // Only include if within viewport (with small margin for fish that are partially visible)
               if (viewportX > -10 && viewportX < 110) {
                   // Store the viewport-relative x for rendering; keep original x for AI
                   f._viewX = viewportX;
                   result.push(f);
               }
           }
       }
       return result;
   }
   ```

### Design & Constraints
- **Chunk-local coordinates**: Each fish has x/y in the 0-100 range within its chunk. The `updateVisitMode` AI keeps fish within 5-95, which naturally keeps them within their chunk. Fish do NOT migrate between chunks.
- **Pre-fetching**: Always load 1 chunk ahead in each scroll direction so panning feels smooth.
- **Memory**: Each Fish instance is ~1KB in memory. Max visible at once is ~100 (2 chunks). Total cached might be ~200 fish (4 chunks). Negligible memory impact.
- **No localStorage**: Sanctuary state is purely server-driven. No local persistence needed.

### Acceptance Criteria
- [ ] `fetchSanctuaryMeta()` returns metadata from worker
- [ ] `fetchSanctuaryChunk(0)` returns array of fish data
- [ ] `retireFish(data)` sends POST and returns result or throws
- [ ] `requestChunk(idx)` fetches and caches chunk asynchronously, creating Fish instances via `createVisitor`
- [ ] `getVisibleChunkIndices()` returns correct indices based on camera position
- [ ] `getVisibleFish()` returns Fish instances with correct `_viewX` for rendering
- [ ] `panCamera(dx)` clamps within valid range
- [ ] `clearSanctuaryCache()` resets all state

### Dependencies
- Phase 1 (Worker endpoints must exist to test against)

---

## Phase 3: Canvas Scrolling and Rendering

### Goal
Add horizontal panning input to the canvas and a sanctuary-specific render path that draws fish at camera-offset positions with chunk-on-demand loading.

### Work Items

1. **Add sanctuary mode flag in `js/main.js`**:
   ```js
   import {
       initSanctuary, clearSanctuaryCache, getVisibleFish,
       getCameraX, panCamera, getSanctuaryMeta, CHUNK_WORLD_WIDTH
   } from './sanctuary.js';

   let sanctuaryMode = false;
   ```

2. **Panning input handling** — add to the existing pointer event handlers in `main.js`:

   Add module-level variables:
   ```js
   let sanctuaryPanStartX = 0;    // clientX at pointerdown for panning
   let sanctuaryPanStartCam = 0;  // camera.x at pointerdown
   let sanctuaryIsPanning = false; // true when pointer has moved > 5px horizontally
   ```

   In the `pointerdown` handler, after the existing `if (isDrawerOpen()) return;`:
   ```js
   if (sanctuaryMode) {
       sanctuaryPanStartX = e.clientX;
       sanctuaryPanStartCam = getCameraX();
       sanctuaryIsPanning = false;
       pointerDown = true;
       return; // Don't run handleTap yet — wait for pointerup to distinguish tap vs pan
   }
   ```

   In the `pointermove` handler, after `if (!pointerDown) return;`:
   ```js
   if (sanctuaryMode) {
       const dx = e.clientX - sanctuaryPanStartX;
       if (Math.abs(dx) > 5) sanctuaryIsPanning = true;
       if (sanctuaryIsPanning) {
           // Convert pixel delta to world units: pixels / tankW * CHUNK_WORLD_WIDTH
           const worldDx = -(dx / tankW) * CHUNK_WORLD_WIDTH;
           setCameraX(sanctuaryPanStartCam + worldDx);
       }
       return;
   }
   ```
   (Import `setCameraX` from sanctuary.js.)

   In the `pointerup` handler, before the existing `pointerDown = false`:
   ```js
   if (sanctuaryMode) {
       if (!sanctuaryIsPanning) {
           // It was a tap, not a pan — try to boop
           handleSanctuaryTap(pointerX, pointerY);
       }
       pointerDown = false;
       sanctuaryIsPanning = false;
       return;
   }
   ```

3. **`handleSanctuaryTap(px, py)` function** in `main.js`:
   ```js
   function handleSanctuaryTap(px, py) {
       // Side view only in sanctuary
       const visibleFish = getVisibleFish();
       for (const fish of visibleFish) {
           const sx = tankLeft + (fish._viewX / 100) * tankW;
           const sy = tankTop + (fish.y / 100) * tankH;
           const size = fish.getSizePixels();
           if (dist(px, py, sx, sy) < size * 1.5) {
               fish.boopVisit();  // from Visit Mode Booping plan
               addBoopEffect(sx, sy);
               playBoopSound();
               break;
           }
       }
   }
   ```
   This uses `boopVisit()` which is the no-XP, no-breeding boop method from the Visit Mode Booping dependency plan. It also uses `addBoopEffect` and `playBoopSound` which are already imported.

4. **Sanctuary render path** — add a `renderSanctuary()` function in `main.js`:
   ```js
   function renderSanctuary() {
       const w = window.innerWidth;
       const h = window.innerHeight;

       ctx.clearRect(0, 0, w, h);

       // Water background (same as normal mode, side view)
       drawWaterBackground(ctx, w, h, 0); // viewAngle = 0 (always side view)

       // Caustics
       drawCaustics(ctx, w, h, 0, gameTime);

       // Tank edges
       drawTankEdges(ctx, tankLeft, tankTop, tankW, tankH, 0);

       // Fish — use viewport-adjusted x positions
       const visibleFish = getVisibleFish();
       for (const fish of visibleFish) {
           // Temporarily override fish.x with viewport-relative x for drawing
           const realX = fish.x;
           fish.x = fish._viewX;
           fish.drawSide(ctx, tankLeft, tankTop, tankW, tankH, gameTime);
           fish.x = realX; // restore
       }

       // Bubbles (side view)
       drawBubblesSide(ctx, tankLeft, tankTop, tankW, tankH);

       // Boop sparkles
       drawBoopEffects(ctx, TICK);

       // Scroll indicator: thin bar at bottom showing viewport position
       renderScrollIndicator(ctx);
   }
   ```

5. **Scroll position indicator** — `renderScrollIndicator(ctx)`:
   ```js
   function renderScrollIndicator(ctx) {
       const meta = getSanctuaryMeta();
       if (meta.totalChunks <= 1) return; // no scrolling needed

       const totalWidth = meta.totalChunks * CHUNK_WORLD_WIDTH;
       const viewFraction = CHUNK_WORLD_WIDTH / totalWidth;
       const posFraction = getCameraX() / totalWidth;

       const barY = window.innerHeight - 6;
       const barW = window.innerWidth * 0.4;
       const barX = (window.innerWidth - barW) / 2;
       const barH = 3;

       // Track
       ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
       ctx.fillRect(barX, barY, barW, barH);

       // Thumb
       const thumbW = Math.max(barW * viewFraction, 12);
       const thumbX = barX + posFraction * (barW - thumbW);
       ctx.fillStyle = 'rgba(74, 158, 255, 0.4)';
       ctx.fillRect(thumbX, barY, thumbW, barH);
   }
   ```

6. **Modify the main `render()` call** — in the `gameLoop` function, replace the `render()` call:
   ```js
   // In gameLoop, replace: render();
   if (sanctuaryMode) {
       renderSanctuary();
   } else {
       render();
   }
   ```

7. **Keyboard panning** (desktop): In `main.js`, add a keydown listener for sanctuary:
   ```js
   document.addEventListener('keydown', (e) => {
       if (!sanctuaryMode) return;
       if (e.key === 'ArrowLeft') panCamera(-10);
       if (e.key === 'ArrowRight') panCamera(10);
   });
   ```

### Design & Constraints
- **Always side view**: The sanctuary is always rendered in side view (`viewAngle = 0`). No top-down mode. This simplifies the rendering path significantly.
- **No decorations**: The sanctuary has no decorations — just water, fish, and bubbles.
- **No food**: No food dropping in sanctuary. Top-down taps are irrelevant since we force side view.
- **Coordinate math**: Fish have chunk-local x (0-100). World x = `chunkIndex * 100 + localX`. Viewport x = `worldX - cameraX`. The viewport is 100 world units wide (same as one chunk). So when cameraX = 0, chunk 0 fills the screen. When cameraX = 50, the right half of chunk 0 and left half of chunk 1 are visible.
- **Pan-vs-tap distinction**: A pointer movement > 5px horizontally is classified as a pan. Otherwise it is a tap (boop attempt). This prevents accidental boops while scrolling.
- **Fish x restoration**: After rendering, `fish.x` is restored to its chunk-local value so `updateVisitMode` AI continues to work in chunk-local space.

### Acceptance Criteria
- [ ] Horizontal drag on canvas pans the sanctuary view
- [ ] Arrow keys pan the sanctuary on desktop
- [ ] Fish from visible chunks are rendered at correct screen positions
- [ ] Tapping a fish triggers boop visual and sound effect
- [ ] Panning does not trigger boops
- [ ] Scroll indicator shows correct position relative to total sanctuary width
- [ ] Pre-fetching loads chunks 1 ahead in each direction
- [ ] Chunks that are not in view are not rendered

### Dependencies
- Phase 2 (sanctuary module must provide camera state and chunk loading)
- Visit Mode Booping plan (for `boopVisit()` method on Fish)

---

## Phase 4: Fish Update Loop and Boop Handling

### Goal
Integrate sanctuary fish into the game loop so they swim around within their chunks and respond to boops.

### Work Items

1. **Add sanctuary update path** in `main.js`'s `update(dt)` function. Add a new early return block after the existing `if (visitMode)` block:
   ```js
   if (sanctuaryMode) {
       updateOrientation(); // still needed for effects
       updateEffects(dt);
       updateSanctuaryFish(dt);
       return;
   }
   ```

2. **`updateSanctuaryFish(dt)`** function in `main.js`:
   ```js
   function updateSanctuaryFish(dt) {
       const visibleChunks = getVisibleChunkIndices();
       for (const chunkIdx of visibleChunks) {
           const fish = getChunkFish(chunkIdx);
           if (!fish) continue;
           for (const f of fish) {
               f.updateVisitMode(dt);
           }
       }
   }
   ```
   This reuses the existing `updateVisitMode(dt)` on each Fish instance, which handles:
   - Wandering AI (picks random targets within 5-95 range)
   - Movement and heading interpolation
   - Boundary clamping (5-95)
   - Tail animation

   After the Visit Mode Booping plan is implemented, `updateVisitMode` will also handle:
   - `boopTimer` countdown
   - State transition from `'booped'` back to `'wandering'`

3. **Perfect conditions**: Fish created via `createVisitor` already have `happiness: 80, hunger: 0, strength: 100`. The `updateVisitMode` method does NOT modify hunger, strength, or happiness. So fish are permanently in perfect condition. No additional code needed.

4. **Boop handling**: The `handleSanctuaryTap` function (from Phase 3) calls `fish.boopVisit()` which:
   - Sets `state = 'booped'`, `boopTimer = 0.6`
   - Reverses heading (visual reaction)
   - Does NOT award XP, coins, breeding bonuses, or trigger easter eggs

   The `updateVisitMode` method (after Visit Mode Booping plan) processes the `boopTimer`, transitioning back to `'wandering'` when it expires. The `boopTimer > 0` check increases tail wag speed in the animation section (the existing `const wagSpeed = this.state === 'booped' ? 18 : ...` line in `drawSide`).

5. **No off-screen updates**: Only fish in visible chunks are updated. Fish in non-visible chunks are frozen (their `updateVisitMode` is not called). This is acceptable because they are simple wanderers and there is no persistent state to maintain.

### Design & Constraints
- **Reuse, not duplication**: We reuse `updateVisitMode` directly, not a new `updateSanctuary` method. This ensures consistency with visit mode and reduces code surface.
- **No fish death**: Fish in sanctuary never die, never leave, never get hungry. `updateVisitMode` does not check any of these conditions.
- **Chunk-local AI**: Fish wander within 5-95 in their chunk-local coordinate space. They never cross chunk boundaries. This is a deliberate simplification — the sanctuary is meant to feel like a massive school of fish, not a migration simulation.
- **Performance**: Only 2 chunks are ever visible simultaneously (at most ~100 fish). `updateVisitMode` is lightweight (no food seeking, no stat calculations). No performance concerns.

### Acceptance Criteria
- [ ] Fish in visible chunks swim around continuously using `updateVisitMode`
- [ ] Booped fish react visually (faster tail wag, direction change) and return to wandering after 0.6s
- [ ] Fish stats remain constant (hunger: 0, happiness: 80, strength: 100)
- [ ] Fish in non-visible chunks are not updated
- [ ] No errors when sanctuary has 0 fish

### Dependencies
- Phase 2 (chunk loading and fish instances)
- Phase 3 (visible fish collection)
- Visit Mode Booping plan (`boopVisit()` and boop timer in `updateVisitMode`)

---

## Phase 5: UI Integration (Retire Flow, Entry Point, Banner)

### Goal
Add the retire button to fish cards in the My Fish tab, a sanctuary entry point in the Shared tab, and a sanctuary banner with back button.

### Work Items

1. **HTML additions** in `index.html`:

   Add sanctuary banner after the existing `visit-banner` div (around line 98):
   ```html
   <!-- Sanctuary banner -->
   <div id="sanctuary-banner" class="hidden">
       <span id="sanctuary-banner-text"></span>
       <button id="sanctuary-back-btn">Back to My Tank</button>
   </div>
   ```

2. **CSS additions** in `style.css`:

   Sanctuary banner (reuse visit-banner style):
   ```css
   /* Sanctuary banner */
   #sanctuary-banner {
       position: fixed; top: 0; left: 0; right: 0;
       background: rgba(10, 22, 40, 0.85);
       color: #b0d4f1; font-size: 0.85rem;
       padding: 10px 16px; z-index: 50;
       display: flex; align-items: center; justify-content: space-between;
       border-bottom: 1px solid rgba(106, 190, 106, 0.3);
   }
   #sanctuary-banner.hidden { display: none; }
   #sanctuary-back-btn {
       padding: 6px 14px; border: 1px solid #6abe6a;
       background: rgba(106, 190, 106, 0.1); color: #6abe6a;
       border-radius: 6px; font-size: 0.8rem; cursor: pointer;
   }
   #sanctuary-back-btn:active { background: rgba(106, 190, 106, 0.25); }
   ```

   Retire button on fish cards:
   ```css
   /* Retire button on fish cards */
   .fish-card-retire {
       padding: 4px 10px;
       border: 1px solid #6abe6a;
       background: rgba(106, 190, 106, 0.1);
       color: #6abe6a;
       border-radius: 6px;
       font-size: 0.68rem;
       cursor: pointer;
       white-space: nowrap;
       flex-shrink: 0;
       margin-left: 8px;
   }
   .fish-card-retire:active { background: rgba(106, 190, 106, 0.25); }
   ```

   Sanctuary entry button in shared tab:
   ```css
   /* Sanctuary entry */
   #btn-sanctuary {
       width: 100%; padding: 10px;
       border: 1px solid #6abe6a;
       background: rgba(106, 190, 106, 0.1);
       color: #6abe6a;
       border-radius: 8px; font-size: 0.85rem;
       cursor: pointer; margin-bottom: 10px;
       transition: all 0.2s;
   }
   #btn-sanctuary:active { background: rgba(106, 190, 106, 0.25); }
   #sanctuary-count {
       font-size: 0.72rem; color: #607888;
       margin-bottom: 12px; text-align: center;
   }
   ```

3. **HTML: Sanctuary entry point in Shared tab** — Add inside `#tab-shared`, before the `<h3>Live Share</h3>`:
   ```html
   <h3>Sanctuary</h3>
   <p id="sanctuary-count" style="font-size:0.78rem;color:#7898a8;margin-bottom:8px">Loading...</p>
   <button id="btn-sanctuary">Visit the Sanctuary</button>
   ```

4. **Retire button on fish cards** — Modify `refreshMyFish()` in `js/ui.js`:

   Import the sanctuary module at the top of `ui.js`:
   ```js
   import { retireFish, extractRetireData } from './sanctuary.js';
   ```

   In the `refreshMyFish()` function, after the `card.appendChild(info)` line and before the rename click handler, add a retire button:
   ```js
   // Retire button
   const retireBtn = document.createElement('button');
   retireBtn.className = 'fish-card-retire';
   retireBtn.textContent = 'Retire';
   retireBtn.addEventListener('click', (e) => {
       e.stopPropagation(); // Don't trigger rename
       showConfirm(
           `Retire ${fish.displayName()} to the sanctuary? They'll live happily forever, but you can't get them back.`,
           async () => {
               try {
                   retireBtn.textContent = 'Retiring...';
                   retireBtn.disabled = true;
                   const data = extractRetireData(fish);
                   await retireFish(data);
                   // Remove fish from local array
                   const idx = fishesRef.indexOf(fish);
                   if (idx >= 0) fishesRef.splice(idx, 1);
                   refreshMyFish();
                   // Show toast
                   showRetireToast(fish.displayName());
               } catch (err) {
                   retireBtn.textContent = 'Retire';
                   retireBtn.disabled = false;
                   alert(err.message || 'Failed to retire fish. Try again later.');
               }
           }
       );
   });
   card.appendChild(retireBtn);
   ```

   Add a toast helper in `ui.js`:
   ```js
   function showRetireToast(name) {
       const toast = document.createElement('div');
       toast.className = 'fry-toast'; // reuse fry toast styling
       toast.textContent = `${name} has been retired to the sanctuary!`;
       document.body.appendChild(toast);
       setTimeout(() => {
           toast.classList.add('fry-toast-out');
           toast.addEventListener('animationend', () => toast.remove());
       }, 2500);
   }
   ```

5. **Sanctuary entry point wiring** in `ui.js`:

   In `initUI()`, add event listener setup for the sanctuary button:
   ```js
   // Sanctuary button
   document.getElementById('btn-sanctuary').addEventListener('click', () => {
       closeDrawer();
       enterSanctuaryMode(); // defined in main.js, needs to be exported or called via callback
   });
   ```

   To avoid circular imports (main.js imports ui.js, ui.js can't import main.js), pass the `enterSanctuaryMode` function as a callback to `initUI`:

   Modify `initUI` signature:
   ```js
   export function initUI(fishes, addFishCallback, getSaveState, getBreedTimers, enterSanctuaryCb) {
       // ... existing code ...
       enterSanctuaryCallback = enterSanctuaryCb;
   }
   ```
   And store it in a module-level variable `let enterSanctuaryCallback = null;`.

   Wire the button:
   ```js
   document.getElementById('btn-sanctuary').addEventListener('click', () => {
       closeDrawer();
       if (enterSanctuaryCallback) enterSanctuaryCallback();
   });
   ```

   In `refreshSharedTab()`, fetch and display the sanctuary fish count:
   ```js
   // At the start of refreshSharedTab():
   fetchSanctuaryMeta().then(meta => {
       const el = document.getElementById('sanctuary-count');
       if (el) {
           el.textContent = meta.totalFish > 0
               ? `${meta.totalFish} fish living in the sanctuary`
               : 'The sanctuary is empty. Be the first to retire a fish!';
       }
   }).catch(() => {
       const el = document.getElementById('sanctuary-count');
       if (el) el.textContent = 'Could not load sanctuary info.';
   });
   ```
   Import `fetchSanctuaryMeta` from `./sanctuary.js` at the top of `ui.js`.

6. **Enter/exit sanctuary mode** in `main.js`:

   ```js
   async function enterSanctuaryMode() {
       // Capture state (same pattern as visit mode)
       if (initDone) {
           savedStateBeforeVisit = getSaveState();
       }

       sanctuaryMode = true;
       visitMode = false; // ensure visit mode is off
       setUIVisitMode(false);
       stopPushInterval();
       fishes.length = 0; // clear local fish

       // Hide HUD, show sanctuary banner
       document.getElementById('hud').classList.add('hidden');
       const banner = document.getElementById('sanctuary-banner');

       try {
           const meta = await initSanctuary();
           document.getElementById('sanctuary-banner-text').textContent =
               `Sanctuary — ${meta.totalFish} fish from players worldwide`;
           banner.classList.remove('hidden');

           // Request initial chunks
           const { requestChunk } = await import('./sanctuary.js');
           requestChunk(0);
           if (meta.totalChunks > 1) requestChunk(1);
       } catch {
           document.getElementById('sanctuary-banner-text').textContent = 'Sanctuary';
           banner.classList.remove('hidden');
       }

       document.getElementById('sanctuary-back-btn').onclick = () => exitSanctuaryMode();

       // Start game loop if not running
       if (!gameLoopRunning) {
           gameLoopRunning = true;
           lastTime = performance.now();
           requestAnimationFrame(gameLoop);
       }
   }

   function exitSanctuaryMode() {
       sanctuaryMode = false;
       clearSanctuaryCache();
       fishes.length = 0;
       document.getElementById('sanctuary-banner').classList.add('hidden');
       document.getElementById('hud').classList.remove('hidden');

       // Restore state (same pattern as exitVisitMode)
       if (initDone && savedStateBeforeVisit) {
           const saved = savedStateBeforeVisit;
           savedStateBeforeVisit = null;
           if (saved.tank) loadTankState(saved.tank);
           if (saved.fish) {
               for (const fd of saved.fish) {
                   const fish = Fish.deserialize(fd);
                   if (fish) fishes.push(fish);
               }
           }
           if (saved.breedTimers) breedTimers = { ...saved.breedTimers };
           updateHUD();
           if (isLiveSharing()) startPushInterval(getSaveState);
       } else {
           normalStartup();
       }
   }
   ```

   Add `enterSanctuaryMode` and `exitSanctuaryMode` imports/exports as needed. Pass `enterSanctuaryMode` to `initUI`:
   ```js
   // In init():
   initUI(fishes, addFishToTank, getSaveState, getBreedTimers, enterSanctuaryMode);
   ```

7. **Guard `getSaveState`** for sanctuary mode — update the existing function:
   ```js
   function getSaveState() {
       if ((visitMode || sanctuaryMode) && savedStateBeforeVisit) {
           return savedStateBeforeVisit;
       }
       // ... rest unchanged
   }
   ```

8. **Prevent drawer My Fish tab from showing retire buttons in visit/sanctuary mode** — In the retire button creation code, wrap with a guard:
   ```js
   if (!isVisitMode && !isSanctuaryMode) {
       // ... retire button creation ...
   }
   ```
   Add `let isSanctuaryMode = false;` to ui.js module state, and export a setter:
   ```js
   export function setSanctuaryMode(val) { isSanctuaryMode = val; }
   ```
   Call `setSanctuaryMode(true)` when entering sanctuary, `setSanctuaryMode(false)` when exiting, from `main.js`. (Or reuse the existing `setVisitMode` pattern.)

### Design & Constraints
- **Green color scheme**: Sanctuary UI uses `#6abe6a` (green) instead of the blue `#4a9eff` used elsewhere. This visually distinguishes sanctuary from the normal game and visit mode.
- **Confirmation dialog**: Retirement uses the existing `showConfirm()` dialog pattern. The fish is permanently removed from the local tank and cannot be recovered.
- **State capture pattern**: Entering sanctuary uses the same `savedStateBeforeVisit` capture/restore pattern as visit mode. This is intentional — only one of visit/sanctuary can be active at a time, and they share the same state slot.
- **Shared tab placement**: The sanctuary section appears at the top of the Shared tab, above Live Share, making it the first thing users see.
- **No retire in visit/sanctuary mode**: Retire buttons only appear when viewing your own tank. This prevents confusion.

### Acceptance Criteria
- [ ] "Retire" button appears on each fish card in the My Fish tab
- [ ] Tapping "Retire" shows a confirmation dialog with fish name
- [ ] Confirming retirement calls the API, removes fish from local tank, shows toast
- [ ] "Visit the Sanctuary" button appears in the Shared tab with fish count
- [ ] Tapping "Visit the Sanctuary" enters sanctuary mode with banner
- [ ] Sanctuary banner shows fish count and has a "Back to My Tank" button
- [ ] Exiting sanctuary restores original tank state correctly
- [ ] Retire buttons are hidden during visit mode and sanctuary mode
- [ ] API errors during retirement show user-friendly error message
- [ ] Rate limit errors (429) show "try again in a minute" message

### Dependencies
- Phase 1 (API endpoints)
- Phase 2 (sanctuary module)
- Phase 3 (rendering)
- Phase 4 (fish updates)
