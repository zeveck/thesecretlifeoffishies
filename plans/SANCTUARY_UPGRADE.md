# Plan: Sanctuary 2D Grid + Fish Invite Mechanic

## Overview

Upgrade the Global Sanctuary from a 1D horizontally-scrolling strip to a 2D chunk grid that players can pan in all directions. Add the ability to "invite" (take) a fish from the sanctuary into your own tank. Add a per-fish rainbow boop effect for sanctuary interactions. Add a floating action menu on tap (Boop / Invite). Track own retired fish so they can be visually identified and reclaimed.

**Files modified:**
- `_cloudflare/worker.js` — 2D chunk keys, `id` field on fish entries, new `/sanctuary/take` endpoint, rate limiting on take
- `js/sanctuary.js` — 2D cache, 2D camera, `takeSanctuaryFish()` API call, own-fish tracking
- `js/main.js` — 2D panning, 2D rendering, minimap, action menu, invite flow
- `js/fish.js` — `rainbowTimer` property, rainbow boop in `drawSide`/`drawTop`, `boopVisit()` sets rainbow
- `js/effects.js` — `addRainbowBoopEffect()` function
- `style.css` — action menu styles

**Coordinate model:** The sanctuary is a 2D grid of chunks. Each chunk is 100x100 world units. The viewport shows roughly one chunk at a time (or up to 4 at chunk boundaries). The camera has `{x, y}` which determines which portion of the world is visible. Fish within a chunk have `fish.x` (horizontal, 0-100) and `fish.y` (vertical, 0-100). To render, each fish's world position is computed as `(chunkCol * 100 + fish.x, chunkRow * 100 + fish.y)` and then the camera offset is subtracted to get viewport-relative `_viewX` and `_viewY`. Fish are always rendered in side view (`drawSide`); Y is vertical position on screen (same semantics as normal tank mode where `fish.y` maps to screen Y).

**Migration note:** Old 1D chunk data (keys like `sanctuary:chunk:0`, `sanctuary:chunk:1`, etc.) will be orphaned when the key format changes to `sanctuary:chunk:CX:CY`. This is acceptable for a pre-release feature — the old data is inert and will not cause errors. No migration code is needed.

## Progress Tracker

| # | Phase | Status |
|---|-------|--------|
| 1 | Worker — 2D Chunks + Take Endpoint | Done |
| 2 | sanctuary.js — 2D Cache, Camera, Visible Fish | Done |
| 3 | main.js — 2D Panning + Rendering + Minimap | Done |
| 4 | Rainbow Boop + Action Menu + Invite Flow | Done |
| 5 | Testing | Done |

**IMPORTANT: Phases 2 and 3 must be applied together.** Phase 2 changes `panCamera` from `(dx)` to `(dx, dy)`, and Phase 3 updates all callers. Applying Phase 2 alone breaks keyboard panning.

---

## Phase 1 — Worker: 2D Chunks + Take Endpoint

### Goal
Convert sanctuary storage from linear chunk indexing (`sanctuary:chunk:N`) to 2D grid indexing (`sanctuary:chunk:CX:CY`). Add an `id` field to every fish entry. Add a new endpoint to atomically remove (take) a fish from a chunk. Add rate limiting on the take endpoint. Add optimistic concurrency via a version field on chunks.

### Work Items

#### 1.1 — Update sanctuary constants

In `_cloudflare/worker.js`, add new constants after the existing sanctuary constants block (line 49):

```js
const SANCTUARY_GRID_WIDTH = 10;   // chunks
const SANCTUARY_GRID_HEIGHT = 10;  // chunks
const SANCTUARY_TOTAL_CHUNKS = SANCTUARY_GRID_WIDTH * SANCTUARY_GRID_HEIGHT; // 100
const TAKE_RATE_LIMIT_KEY_PREFIX = 'ratelimit:take:';
const TAKE_COOLDOWN_SECONDS = 60; // 1 take per minute per IP
```

#### 1.2 — Add `generateFishId()` helper

Add this immediately after the existing `generateCode()` function (after line 38):

```js
function generateFishId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars[bytes[i] % chars.length];
    }
    return id;
}
```

#### 1.3 — Change meta schema

Update `handleGetMeta` (line 224) to return the grid dimensions. Change the default meta shape:

**Old default meta:**
```js
const meta = metaRaw ? JSON.parse(metaRaw) : { totalFish: 0, totalChunks: 0, lastUpdated: 0 };
```

**New default meta (in both `handleRetireFish` and `handleGetMeta`):**
```js
const meta = metaRaw ? JSON.parse(metaRaw) : {
    totalFish: 0,
    gridWidth: SANCTUARY_GRID_WIDTH,
    gridHeight: SANCTUARY_GRID_HEIGHT,
    lastUpdated: 0,
};
```

The `totalChunks` field is removed from meta. The client derives it from `gridWidth * gridHeight`.

#### 1.4 — Change `handleRetireFish` to use 2D chunk placement

Replace the chunk-selection logic (lines 195-198). Instead of sequential fill, place in a random chunk within the grid. Add retry logic for full chunks:

```js
// Pick a random chunk in the grid, retrying if full
let chunkKey, chunk;
for (let attempt = 0; attempt < 5; attempt++) {
    const cx = Math.floor(Math.random() * SANCTUARY_GRID_WIDTH);
    const cy = Math.floor(Math.random() * SANCTUARY_GRID_HEIGHT);
    chunkKey = SANCTUARY_CHUNK_PREFIX + cx + ':' + cy;
    const chunkRaw = await env.LIVE_TANKS.get(chunkKey);
    chunk = chunkRaw ? JSON.parse(chunkRaw) : [];
    if (chunk.length < CHUNK_SIZE) break;
    if (attempt === 4) {
        return json({ error: 'Sanctuary is congested. Try again later.' }, 507, request, env);
    }
}
```

Add `id` field to the fish entry object. The full `fishEntry` becomes:

```js
const fishEntry = {
    id: generateFishId(),
    speciesName: body.speciesName,
    name: (body.name || '').slice(0, 30),
    currentSize: body.currentSize,
    isFry: !!body.isFry,
    tailDots: body.tailDots || 0,
    retiredAt: Date.now(),
    retiredBy: ipHash.slice(0, 4),
};
```

Update the meta write: remove `meta.totalChunks = chunkIndex + 1;` — that field no longer exists. Keep `meta.totalFish += 1;` and `meta.lastUpdated = Date.now();`. Ensure `meta.gridWidth` and `meta.gridHeight` are set to the constants (for forward-compatibility if we change grid size later):

```js
meta.totalFish += 1;
meta.gridWidth = SANCTUARY_GRID_WIDTH;
meta.gridHeight = SANCTUARY_GRID_HEIGHT;
meta.lastUpdated = Date.now();
await env.LIVE_TANKS.put(SANCTUARY_META_KEY, JSON.stringify(meta));
```

Update the retire response to return the generated fish id:
```js
return json({ ok: true, totalFish: meta.totalFish, fishId: fishEntry.id }, 201, request, env);
```

#### 1.5 — Change `handleGetChunk` to accept `cx` and `cy`

Replace the current route entry:
```js
{ method: 'GET', pattern: '/sanctuary/chunk/:index', handler: handleGetChunk },
```
with:
```js
{ method: 'GET', pattern: '/sanctuary/chunk/:cx/:cy', handler: handleGetChunk },
```

Replace the handler body:

```js
async function handleGetChunk(request, env, params) {
    const cx = parseInt(params.cx, 10);
    const cy = parseInt(params.cy, 10);
    if (isNaN(cx) || isNaN(cy) || cx < 0 || cy < 0) {
        return json({ error: 'Invalid chunk coordinates' }, 400, request, env);
    }
    const chunkKey = SANCTUARY_CHUNK_PREFIX + cx + ':' + cy;
    const chunkRaw = await env.LIVE_TANKS.get(chunkKey);
    if (!chunkRaw) {
        // Return empty array for chunks that exist but have no fish yet
        return json([], 200, request, env);
    }
    return json(JSON.parse(chunkRaw), 200, request, env);
}
```

Note: empty chunks return `[]` (200), not 404. Every grid coordinate is valid.

#### 1.6 — Add `handleTakeFish` endpoint

Add new route entry in the `routes` array:
```js
{ method: 'POST', pattern: '/sanctuary/take', handler: handleTakeFish },
```

Add the handler with rate limiting and optimistic concurrency:

```js
async function handleTakeFish(request, env, params) {
    // Rate limit by IP (same pattern as retire)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const ipHash = [...new Uint8Array(ipBuf.slice(0, 4))].map(b => b.toString(16).padStart(2, '0')).join('');
    const rlKey = TAKE_RATE_LIMIT_KEY_PREFIX + ipHash;
    const rlCheck = await env.LIVE_TANKS.get(rlKey);
    if (rlCheck !== null) {
        return json({ error: 'Too many invites. Try again in a minute.' }, 429, request, env);
    }

    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status, request, env);
    const { cx, cy, fishId } = parsed.body;

    if (typeof cx !== 'number' || typeof cy !== 'number' || typeof fishId !== 'string') {
        return json({ error: 'Invalid parameters' }, 400, request, env);
    }

    const chunkKey = SANCTUARY_CHUNK_PREFIX + cx + ':' + cy;
    const chunkRaw = await env.LIVE_TANKS.get(chunkKey);
    if (!chunkRaw) {
        return json({ error: 'Fish not found' }, 409, request, env);
    }

    const chunk = JSON.parse(chunkRaw);
    const fishIndex = chunk.findIndex(f => f.id === fishId);
    if (fishIndex === -1) {
        return json({ error: 'Fish not found (may have been taken by another player)' }, 409, request, env);
    }

    // Remove fish from chunk
    const [takenFish] = chunk.splice(fishIndex, 1);
    await env.LIVE_TANKS.put(chunkKey, JSON.stringify(chunk));

    // Decrement totalFish in meta
    const metaRaw = await env.LIVE_TANKS.get(SANCTUARY_META_KEY);
    if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        meta.totalFish = Math.max(0, meta.totalFish - 1);
        meta.lastUpdated = Date.now();
        await env.LIVE_TANKS.put(SANCTUARY_META_KEY, JSON.stringify(meta));
    }

    // Set rate limit
    await env.LIVE_TANKS.put(rlKey, '1', { expirationTtl: TAKE_COOLDOWN_SECONDS });

    return json({ ok: true, fish: takenFish }, 200, request, env);
}
```

**Request:** `POST /sanctuary/take`
```json
{ "cx": 3, "cy": 7, "fishId": "a1b2c3d4" }
```

**Success response (200):**
```json
{
    "ok": true,
    "fish": {
        "id": "a1b2c3d4",
        "speciesName": "Neon Tetra",
        "name": "Shimmer",
        "currentSize": 0.8,
        "isFry": false,
        "tailDots": 0,
        "retiredAt": 1711400000000,
        "retiredBy": "3f2a"
    }
}
```

**Conflict response (409):**
```json
{ "error": "Fish not found (may have been taken by another player)" }
```

### Design & Constraints
- **Race condition:** KV does not support atomic compare-and-swap. The read-then-write in `handleTakeFish` has a small race window where two concurrent takes could read the same chunk state. If two requests race for the same fish, one will succeed and the other will succeed too (both read the fish as present). To mitigate: the rate limit (1 take/min/IP) makes rapid concurrent takes from the same user impossible. Cross-user races on the exact same fish are extremely unlikely given random chunk positions and the number of fish. The worst case is a duplicated fish — cosmetically harmless. For a pre-release feature, this is acceptable.
- Empty chunks return `[]` with status 200. This avoids 404 handling for valid grid coordinates.
- The `id` field is 8 characters from `[a-z0-9]`, giving ~2.8 trillion combinations. Collision is negligible.
- **totalFish drift:** The meta's `totalFish` counter can drift slightly if concurrent takes race on the meta update. This is cosmetic — it affects only the displayed count, not functionality.

### Acceptance Criteria
- `POST /sanctuary/retire` places fish into a random 2D chunk key `sanctuary:chunk:CX:CY` with an `id` field, returns `fishId` in the response
- `GET /sanctuary/meta` returns `{ totalFish, gridWidth, gridHeight, lastUpdated }`
- `GET /sanctuary/chunk/3/7` returns `[{id, speciesName, name, ...}, ...]` or `[]`
- `POST /sanctuary/take` with `{cx, cy, fishId}` removes the fish and returns it, or 409 if gone
- Take endpoint has 1/min rate limiting per IP
- Old `GET /sanctuary/chunk/:index` route no longer exists

### Testing
- Unit test: `generateFishId()` returns 8-char string from expected charset
- Unit test: `handleRetireFish` with mocked KV writes fish entry with `id` field to 2D key
- Unit test: `handleTakeFish` removes fish by id, returns 409 when fish missing, returns 429 when rate-limited
- Unit test: `handleGetChunk` with 2D coords returns correct data

### Dependencies
None — this phase is self-contained.

---

## Phase 2 — sanctuary.js: 2D Cache, Camera, Visible Fish

### Goal
Rewrite the sanctuary client module to work with 2D chunk coordinates, 2D camera, and the new `/sanctuary/take` endpoint. Also add own-fish tracking.

**IMPORTANT: This phase must be applied together with Phase 3.** Phase 2 changes `panCamera` from `panCamera(dx)` to `panCamera(dx, dy)`. Phase 3 updates all callers. Applying Phase 2 alone will break keyboard panning.

### Work Items

#### 2.1 — Update `fetchSanctuaryChunk` to take 2D params

```js
/** Fetch a single chunk by 2D coordinates. Returns array of fish data objects or []. */
export async function fetchSanctuaryChunk(cx, cy) {
    const resp = await fetch(`${WORKER_URL}/sanctuary/chunk/${cx}/${cy}`);
    if (!resp.ok) return [];
    return resp.json();
}
```

#### 2.2 — Add `takeSanctuaryFish` API function

Add after `retireFish`:

```js
/** Take a fish from the sanctuary. Returns { ok, fish } or throws on 409/error. */
export async function takeSanctuaryFish(cx, cy, fishId) {
    const resp = await fetch(`${WORKER_URL}/sanctuary/take`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cx, cy, fishId }),
    });
    if (resp.status === 409) {
        throw new Error('This fish was already taken by another player!');
    }
    if (resp.status === 429) {
        throw new Error('Too many invites! Try again in a minute.');
    }
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Network error' }));
        throw new Error(err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
}
```

#### 2.3 — Change chunk cache to use string keys

Replace:
```js
// Map<number, { data: FishData[], fish: Fish[], loaded: boolean }>
const chunkCache = new Map();
```
with:
```js
// Map<string, { data: FishData[], fish: Fish[], loaded: boolean }>
// Key format: "cx,cy"
const chunkCache = new Map();
```

Update `loadingChunks` to use string keys too:
```js
let loadingChunks = new Set(); // string keys "cx,cy" currently being fetched
```

Helper to create cache key:
```js
function chunkKey(cx, cy) { return `${cx},${cy}`; }
```

#### 2.4 — Update `getChunkFish`, `isChunkLoading`, `requestChunk`

```js
/** Get cached Fish instances for a chunk, or null if not loaded. */
export function getChunkFish(cx, cy) {
    const entry = chunkCache.get(chunkKey(cx, cy));
    return entry && entry.loaded ? entry.fish : null;
}

/** Check if a chunk is currently loading. */
export function isChunkLoading(cx, cy) {
    return loadingChunks.has(chunkKey(cx, cy));
}

/** Request a chunk to be loaded. Non-blocking — fetches in background. */
export function requestChunk(cx, cy) {
    const key = chunkKey(cx, cy);
    if (chunkCache.has(key) || loadingChunks.has(key)) return;
    if (cx < 0 || cx >= sanctuaryMeta.gridWidth || cy < 0 || cy >= sanctuaryMeta.gridHeight) return;
    loadingChunks.add(key);
    fetchSanctuaryChunk(cx, cy).then(data => {
        const ownRetired = getOwnRetiredFish();
        const fish = data.map(fd => {
            const f = Fish.createVisitor(fd);
            if (f) {
                f.sanctuaryId = fd.id;           // store the server-side fish id
                f.sanctuaryChunkCX = cx;          // store chunk coords for take API
                f.sanctuaryChunkCY = cy;
                f.sanctuaryRetiredBy = fd.retiredBy || '';
                // Check if this is one of our retired fish (id-based match)
                f.isOwnRetired = ownRetired.some(own => own.fishId && own.fishId === fd.id);
            }
            return f;
        }).filter(Boolean);
        // Distribute fish across the chunk's coordinate range
        for (const f of fish) {
            f.x = Math.random() * 90 + 5;  // 5-95 within chunk-local coords
            f.y = Math.random() * 70 + 10; // 10-80
        }
        chunkCache.set(key, { data, fish, loaded: true });
        loadingChunks.delete(key);
    }).catch(() => {
        loadingChunks.delete(key);
    });
}
```

Note: The `getOwnRetiredFish()` call is hoisted outside the `data.map()` loop so localStorage is parsed once per chunk load, not once per fish.

#### 2.5 — Update `removeFishFromCache`

Add a function to remove a taken fish from the local cache:

```js
/** Remove a fish from the local chunk cache after it's been taken. */
export function removeFishFromCache(cx, cy, sanctuaryId) {
    const key = chunkKey(cx, cy);
    const entry = chunkCache.get(key);
    if (!entry || !entry.loaded) return;
    entry.fish = entry.fish.filter(f => f.sanctuaryId !== sanctuaryId);
    entry.data = entry.data.filter(d => d.id !== sanctuaryId);
}
```

#### 2.6 — 2D Camera

Replace the entire camera section:

```js
// --- Camera ---
const CHUNK_WORLD_WIDTH = 100;
const CHUNK_WORLD_HEIGHT = 100;

let camera = { x: 0, y: 0 };

export function getCameraX() { return camera.x; }
export function getCameraY() { return camera.y; }

export function setCameraX(x) {
    const totalWidth = sanctuaryMeta.gridWidth * CHUNK_WORLD_WIDTH;
    camera.x = Math.max(0, Math.min(x, Math.max(0, totalWidth - CHUNK_WORLD_WIDTH)));
}

export function setCameraY(y) {
    const totalHeight = sanctuaryMeta.gridHeight * CHUNK_WORLD_HEIGHT;
    camera.y = Math.max(0, Math.min(y, Math.max(0, totalHeight - CHUNK_WORLD_HEIGHT)));
}

export function panCamera(dx, dy) {
    setCameraX(camera.x + dx);
    setCameraY(camera.y + dy);
}

export { CHUNK_WORLD_WIDTH, CHUNK_WORLD_HEIGHT };
```

#### 2.7 — 2D `getVisibleChunkIndices`

```js
/** Return array of {cx, cy} objects for chunks overlapping the current viewport. */
export function getVisibleChunkIndices() {
    const left = camera.x;
    const right = camera.x + CHUNK_WORLD_WIDTH;
    const top = camera.y;
    const bottom = camera.y + CHUNK_WORLD_HEIGHT;

    const firstCX = Math.max(0, Math.floor(left / CHUNK_WORLD_WIDTH));
    const lastCX = Math.min(sanctuaryMeta.gridWidth - 1, Math.floor(right / CHUNK_WORLD_WIDTH));
    const firstCY = Math.max(0, Math.floor(top / CHUNK_WORLD_HEIGHT));
    const lastCY = Math.min(sanctuaryMeta.gridHeight - 1, Math.floor(bottom / CHUNK_WORLD_HEIGHT));

    const indices = [];
    for (let cx = firstCX; cx <= lastCX; cx++) {
        for (let cy = firstCY; cy <= lastCY; cy++) {
            indices.push({ cx, cy });
        }
    }
    return indices;
}
```

#### 2.8 — 2D `getVisibleFish`

```js
/** Return all Fish instances visible in the current viewport.
 *  Sets _viewX and _viewY on each fish for rendering.
 *  Pre-fetches 1 chunk ahead in all 4 directions. */
export function getVisibleFish() {
    const visible = getVisibleChunkIndices();
    const result = [];

    // Pre-fetch visible + 1-chunk margin in all directions
    const prefetched = new Set();
    for (const { cx, cy } of visible) {
        for (const [dx, dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]) {
            const nx = cx + dx, ny = cy + dy;
            const key = chunkKey(nx, ny);
            if (!prefetched.has(key)) {
                prefetched.add(key);
                requestChunk(nx, ny); // requestChunk bounds-checks internally
            }
        }
    }

    for (const { cx, cy } of visible) {
        const fish = getChunkFish(cx, cy);
        if (!fish) continue;
        for (const f of fish) {
            const worldX = cx * CHUNK_WORLD_WIDTH + f.x;
            const worldY = cy * CHUNK_WORLD_HEIGHT + f.y;
            const viewportX = worldX - camera.x;
            const viewportY = worldY - camera.y;
            if (viewportX > -10 && viewportX < 110 && viewportY > -10 && viewportY < 110) {
                f._viewX = viewportX;
                f._viewY = viewportY;
                result.push(f);
            }
        }
    }
    return result;
}
```

Note: Prefetching uses a `Set` to avoid redundant `requestChunk` calls for the same neighbor chunk when at a 4-chunk boundary. The `requestChunk` function already bounds-checks against grid dimensions internally, so no explicit bounds check is needed in the prefetch loop.

#### 2.9 — Update `initSanctuary` and `clearSanctuaryCache`

```js
let sanctuaryMeta = { totalFish: 0, gridWidth: 10, gridHeight: 10, lastUpdated: 0 };

export async function initSanctuary() {
    sanctuaryMeta = await fetchSanctuaryMeta();
    // Ensure gridWidth/gridHeight exist (backward compat)
    if (!sanctuaryMeta.gridWidth) sanctuaryMeta.gridWidth = 10;
    if (!sanctuaryMeta.gridHeight) sanctuaryMeta.gridHeight = 10;
    return sanctuaryMeta;
}
```

`clearSanctuaryCache` — also reset camera:
```js
export function clearSanctuaryCache() {
    chunkCache.clear();
    loadingChunks.clear();
    sanctuaryMeta = { totalFish: 0, gridWidth: 10, gridHeight: 10, lastUpdated: 0 };
    camera.x = 0;
    camera.y = 0;
}
```

#### 2.10 — Own-fish tracking

Update `retireFish` to save the retired fish's identity locally using the server-returned id:

```js
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
    const result = await resp.json();

    // Track this fish as "ours" in localStorage using server-assigned id
    saveOwnRetiredFish(fishData.speciesName, fishData.name, result.fishId);

    return result;
}

function saveOwnRetiredFish(speciesName, name, fishId) {
    try {
        const key = 'sanctuary:ownRetired';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push({ speciesName, name, fishId, retiredAt: Date.now() });
        // Keep only last 200 entries
        if (existing.length > 200) existing.splice(0, existing.length - 200);
        localStorage.setItem(key, JSON.stringify(existing));
    } catch { /* localStorage may be unavailable */ }
}

export function getOwnRetiredFish() {
    try {
        return JSON.parse(localStorage.getItem('sanctuary:ownRetired') || '[]');
    } catch { return []; }
}
```

#### 2.11 — Updated exports

The module should export these functions (complete list):
- `fetchSanctuaryMeta`, `fetchSanctuaryChunk`, `retireFish`, `extractRetireData`, `takeSanctuaryFish`
- `getChunkFish`, `isChunkLoading`, `requestChunk`, `clearSanctuaryCache`, `initSanctuary`, `getSanctuaryMeta`, `removeFishFromCache`, `getOwnRetiredFish`
- `getCameraX`, `getCameraY`, `setCameraX`, `setCameraY`, `panCamera`
- `getVisibleChunkIndices`, `getVisibleFish`
- `CHUNK_WORLD_WIDTH`, `CHUNK_WORLD_HEIGHT`

### Design & Constraints
- `_viewX` and `_viewY` are transient properties on Fish, set each frame by `getVisibleFish()` and used only for rendering. `_viewX` is the fish's horizontal screen position (0-100 maps to tankLeft-tankRight). `_viewY` is the fish's vertical screen position (0-100 maps to tankTop-tankBottom). These are computed from the fish's world position minus camera offset.
- `sanctuaryId`, `sanctuaryChunkCX`, `sanctuaryChunkCY`, `sanctuaryRetiredBy`, `isOwnRetired` are transient properties set on visitor Fish instances in `requestChunk`. They are NOT serialized.
- `panCamera` now takes two arguments `(dx, dy)` — all callers must be updated in Phase 3.
- Own-fish matching uses the server-assigned `fishId` for exact matching. This is more reliable than species+name heuristics.

### Acceptance Criteria
- `fetchSanctuaryChunk(3, 7)` calls `GET /sanctuary/chunk/3/7`
- `takeSanctuaryFish(3, 7, 'a1b2c3d4')` calls `POST /sanctuary/take` with correct body
- Chunk cache uses string keys `"cx,cy"`
- Camera has both X and Y, with proper clamping to grid bounds
- `getVisibleChunkIndices()` returns `{cx, cy}` objects
- `getVisibleFish()` sets both `_viewX` and `_viewY`
- Pre-fetching works in all 4 directions without redundant calls
- `retireFish` saves the server-returned `fishId` to localStorage
- `requestChunk` marks own fish using id-based matching

### Testing
- Unit test: `chunkKey(3, 7)` returns `"3,7"`
- Unit test: `getVisibleChunkIndices` returns correct chunks for camera at origin, at boundary, at center
- Unit test: `removeFishFromCache` removes the correct fish and leaves others
- Unit test: `getOwnRetiredFish` / `saveOwnRetiredFish` round-trips through localStorage

### Dependencies
Phase 1 (worker endpoints must exist). **Must be applied together with Phase 3.**

---

## Phase 3 — main.js: 2D Panning + Rendering + Minimap

### Goal
Update all sanctuary interaction and rendering code in main.js to work with 2D panning, 2D fish positions, and replace the scroll indicator with a 2D minimap.

**IMPORTANT: This phase must be applied together with Phase 2.**

### Work Items

#### 3.1 — Update imports

Change the import line from sanctuary.js (line 17-20 of main.js):

```js
import {
    initSanctuary, clearSanctuaryCache, getVisibleFish,
    getCameraX, getCameraY, setCameraX, setCameraY, panCamera, getSanctuaryMeta,
    getVisibleChunkIndices, getChunkFish, requestChunk,
    CHUNK_WORLD_WIDTH, CHUNK_WORLD_HEIGHT,
    takeSanctuaryFish, removeFishFromCache,
} from './sanctuary.js';
```

Note: `SPECIES_CATALOG` is already imported on line 3 of main.js (`import { Fish, SPECIES_CATALOG, createFry } from './fish.js'`). No duplicate import needed.

Add `addRainbowBoopEffect` to the effects.js import:
```js
import { ..., addRainbowBoopEffect } from './effects.js';
```

Add `getTankCapacity`, `getCurrentStockInches` to the store.js import (line 6 already imports both — verify they are present):
```js
import { ..., getCurrentStockInches, getTankCapacity } from './store.js';
```

(Both `getCurrentStockInches` and `getTankCapacity` are already imported on line 6 of main.js.)

#### 3.2 — Update pan state variables

Replace (lines 66-68):
```js
let sanctuaryPanStartX = 0;    // clientX at pointerdown for panning
let sanctuaryPanStartCam = 0;  // camera.x at pointerdown
let sanctuaryIsPanning = false; // true when pointer has moved > 5px horizontally
```
with:
```js
let sanctuaryPanStartX = 0;     // clientX at pointerdown
let sanctuaryPanStartY = 0;     // clientY at pointerdown
let sanctuaryPanStartCamX = 0;  // camera.x at pointerdown
let sanctuaryPanStartCamY = 0;  // camera.y at pointerdown
let sanctuaryIsPanning = false;  // true when pointer has moved > 5px
```

#### 3.3 — Update pointerdown handler (sanctuary branch, ~line 76)

Replace:
```js
sanctuaryPanStartX = e.clientX;
sanctuaryPanStartCam = getCameraX();
sanctuaryIsPanning = false;
```
with:
```js
sanctuaryPanStartX = e.clientX;
sanctuaryPanStartY = e.clientY;
sanctuaryPanStartCamX = getCameraX();
sanctuaryPanStartCamY = getCameraY();
sanctuaryIsPanning = false;
dismissSanctuaryActionMenu();
```

Note: `dismissSanctuaryActionMenu()` is called here to dismiss any open action menu when starting a new pan gesture.

#### 3.4 — Update pointermove handler (sanctuary branch, ~line 123)

Replace:
```js
const dx = e.clientX - sanctuaryPanStartX;
if (Math.abs(dx) > 5) sanctuaryIsPanning = true;
if (sanctuaryIsPanning) {
    // Convert screen pixels to world units
    // tankW pixels = CHUNK_WORLD_WIDTH world units
    const worldDx = -(dx / tankW) * CHUNK_WORLD_WIDTH;
    setCameraX(sanctuaryPanStartCam + worldDx);
```
with:
```js
const dx = e.clientX - sanctuaryPanStartX;
const dy = e.clientY - sanctuaryPanStartY;
if (Math.abs(dx) > 5 || Math.abs(dy) > 5) sanctuaryIsPanning = true;
if (sanctuaryIsPanning) {
    const worldDx = -(dx / tankW) * CHUNK_WORLD_WIDTH;
    const worldDy = -(dy / tankH) * CHUNK_WORLD_HEIGHT;
    setCameraX(sanctuaryPanStartCamX + worldDx);
    setCameraY(sanctuaryPanStartCamY + worldDy);
```

Note: `tankH` is the tank height in pixels, already available in scope (module-level variable defined around line 51 of main.js).

#### 3.5 — Update keyboard panning (~line 184)

Replace:
```js
document.addEventListener('keydown', (e) => {
    if (!sanctuaryMode) return;
    if (e.key === 'ArrowLeft') panCamera(-10);
    if (e.key === 'ArrowRight') panCamera(10);
});
```
with:
```js
document.addEventListener('keydown', (e) => {
    if (!sanctuaryMode) return;
    if (e.key === 'ArrowLeft') panCamera(-10, 0);
    if (e.key === 'ArrowRight') panCamera(10, 0);
    if (e.key === 'ArrowUp') panCamera(0, -10);
    if (e.key === 'ArrowDown') panCamera(0, 10);
});
```

#### 3.6 — Update `updateSanctuaryFish`

Replace the function body to use 2D chunk indices:

```js
function updateSanctuaryFish(dt) {
    const visibleChunks = getVisibleChunkIndices();
    for (const { cx, cy } of visibleChunks) {
        const fish = getChunkFish(cx, cy);
        if (!fish) continue;
        for (const f of fish) {
            f.updateVisitMode(dt);
        }
    }
}
```

#### 3.7 — Update `renderSanctuary`

Replace the fish-drawing loop to use both `_viewX` and `_viewY`, with own-fish indicator:

```js
// Fish — use viewport-adjusted positions
const visibleFish = getVisibleFish();
for (const fish of visibleFish) {
    const realX = fish.x;
    const realY = fish.y;
    fish.x = fish._viewX;
    fish.y = fish._viewY;
    fish.drawSide(ctx, tankLeft, tankTop, tankW, tankH, gameTime);
    fish.x = realX;
    fish.y = realY;

    // Own fish indicator: small green diamond above the fish
    if (fish.isOwnRetired) {
        const sx = tankLeft + (fish._viewX / 100) * tankW;
        const sy = tankTop + (fish._viewY / 100) * tankH;
        const size = fish.getSizePixels();
        ctx.save();
        ctx.fillStyle = 'rgba(106, 190, 106, 0.7)';
        ctx.translate(sx, sy - size * 0.7);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
    }
}
```

#### 3.8 — Replace `renderScrollIndicator` with `renderMinimap`

Delete the `renderScrollIndicator` function entirely. Replace the call in `renderSanctuary` with `renderMinimap(ctx)`.

Add the new function:

```js
function renderMinimap(ctx) {
    const meta = getSanctuaryMeta();
    const gw = meta.gridWidth || 10;
    const gh = meta.gridHeight || 10;

    // Minimap dimensions: small rectangle in bottom-right corner
    const mapW = 80;
    const mapH = 80;
    const margin = 12;
    const mapX = window.innerWidth - mapW - margin;
    const mapY = window.innerHeight - mapH - margin;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(mapX, mapY, mapW, mapH);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    // Viewport indicator
    const totalWorldW = gw * CHUNK_WORLD_WIDTH;
    const totalWorldH = gh * CHUNK_WORLD_HEIGHT;
    const vpX = mapX + (getCameraX() / totalWorldW) * mapW;
    const vpY = mapY + (getCameraY() / totalWorldH) * mapH;
    const vpW = (CHUNK_WORLD_WIDTH / totalWorldW) * mapW;
    const vpH = (CHUNK_WORLD_HEIGHT / totalWorldH) * mapH;

    ctx.fillStyle = 'rgba(74, 158, 255, 0.4)';
    ctx.fillRect(vpX, vpY, vpW, vpH);
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
}
```

#### 3.9 — Update `enterSanctuaryMode`

Replace the initial chunk request logic:

```js
// Start camera at center of grid
const centerX = (meta.gridWidth / 2 - 0.5) * CHUNK_WORLD_WIDTH;
const centerY = (meta.gridHeight / 2 - 0.5) * CHUNK_WORLD_HEIGHT;
setCameraX(centerX);
setCameraY(centerY);

// Request surrounding chunks (getVisibleFish handles this, but pre-warm)
const visible = getVisibleChunkIndices();
for (const { cx, cy } of visible) {
    requestChunk(cx, cy);
}
```

This replaces:
```js
requestChunk(0);
if (meta.totalChunks > 1) requestChunk(1);
```

### Design & Constraints
- The minimap is 80x80px in the bottom-right. For a 10x10 grid, each cell is 8x8px. The viewport box is 8x8px (1 chunk visible at a time).
- 2D panning uses the same screen-to-world conversion as the existing 1D panning, extended to Y.
- `tankW` and `tankH` are module-level variables (defined around line 45 of main.js).
- The action menu dismissal in pointerdown ensures the menu doesn't persist during panning. The `pointer-events` on the canvas are unaffected because the action menu is a DOM element with `position: fixed; z-index: 200` — it sits above the canvas, and clicks on it are handled by its own button event listeners with `e.stopPropagation()`. Clicks on the canvas that miss the menu will dismiss it via the pointerdown handler's `dismissSanctuaryActionMenu()` call.

### Acceptance Criteria
- Touch/pointer drag pans in both X and Y
- Arrow keys pan in all 4 directions
- Fish render at correct 2D positions
- Minimap shows viewport position in the grid
- Camera starts at center of grid on enter
- Own-fish green diamond indicator appears above retired fish
- Action menu dismisses on pan start

### Testing
- E2E test: entering sanctuary mode shows minimap element
- E2E test: keyboard arrow keys change camera position

### Dependencies
Phase 2 (2D camera and chunk functions). **Must be applied together with Phase 2.**

---

## Phase 4 — Rainbow Boop + Action Menu + Invite Flow

### Goal
Add a per-fish rainbow glow effect when booped in the sanctuary. Replace the simple boop-on-tap with an action menu offering "Boop" and "Invite to My Tank". Implement the invite flow end-to-end.

### Work Items

#### 4.1 — Add `rainbowTimer` property to Fish constructor

In `js/fish.js`, inside the constructor (after `this.wanderTarget`):

```js
this.rainbowTimer = 0; // seconds remaining of rainbow glow (sanctuary boop)
```

#### 4.2 — Update `boopVisit()` to set rainbow timer

Replace the `boopVisit()` method:

```js
boopVisit() {
    if (this.state === 'booped') return;
    this.state = 'booped';
    this.boopTimer = 0.6;
    this.rainbowTimer = 3; // 3 seconds of rainbow glow
    this.targetHeading = this.heading + (Math.random() > 0.5 ? 1 : -1) * rand(1.5, 2.5);
}
```

#### 4.3 — Decrement `rainbowTimer` in `updateVisitMode`

In `updateVisitMode()` (js/fish.js), add at the very top of the method body, before the boop timer check:

```js
if (this.rainbowTimer > 0) {
    this.rainbowTimer -= dt;
    if (this.rainbowTimer < 0) this.rainbowTimer = 0;
}
```

#### 4.4 — Add rainbow glow override in `drawSide`

In `drawSide()` (js/fish.js), modify the existing rainbow glow block (lines 311-318) to also check `rainbowTimer`:

```js
// Rainbow glow override (shadow fish event OR sanctuary boop)
if ((getRainbowGlowActive() || this.rainbowTimer > 0) && gameTime !== undefined) {
    const hue = getRainbowHue(gameTime, this.id);
    bodyColor = `hsl(${hue}, 100%, 55%)`;
    bellyColor = `hsl(${(hue + 30) % 360}, 100%, 70%)`;
    finColor = `hsl(${(hue + 60) % 360}, 100%, 50%)`;
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
    ctx.shadowBlur = bodyH * 1.2;
}
```

This is simpler than the draft's `if/else if` approach — since both effects use the same visual, just OR the conditions together. The shadow fish event and per-fish boop produce identical rainbow visuals.

#### 4.5 — Add rainbow glow override in `drawTop`

In `drawTop()` (js/fish.js), similarly modify the existing rainbow glow block:

```js
if ((getRainbowGlowActive() || this.rainbowTimer > 0) && gameTime !== undefined) {
    const hue = getRainbowHue(gameTime, this.id);
    bodyColor = `hsl(${hue}, 100%, 55%)`;
    finColor = `hsl(${(hue + 60) % 360}, 100%, 50%)`;
}
```

#### 4.6 — Add rainbow glow to glow stripe in `drawSide` and `drawTop`

For the glow stripe sections, add `this.rainbowTimer > 0` as an additional condition:

In `drawSide` (line 402):
```js
const sc = ((getRainbowGlowActive() || this.rainbowTimer > 0) && gameTime !== undefined)
    ? `hsl(${(getRainbowHue(gameTime, this.id) + 90) % 360}, 100%, 65%)`
    : this.species.glowStripe;
```

In `drawTop` (line 581):
```js
const sc = ((getRainbowGlowActive() || this.rainbowTimer > 0) && gameTime !== undefined)
    ? `hsl(${(getRainbowHue(gameTime, this.id) + 90) % 360}, 100%, 65%)`
    : this.species.glowStripe;
```

#### 4.7 — Add `addRainbowBoopEffect` in effects.js

Add after `addBoopEffect`:

```js
export function addRainbowBoopEffect(screenX, screenY) {
    for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 / 10) * i + rand(-0.3, 0.3);
        const speed = rand(50, 100);
        boopParticles.push({
            x: screenX, y: screenY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            age: 0, maxAge: rand(0.4, 0.7),
            size: rand(2.5, 5),
            hue: (i * 36) % 360, // rainbow distribution: 0, 36, 72, 108, ...
        });
    }
    // Rainbow hearts
    const heartCount = 3;
    for (let i = 0; i < heartCount; i++) {
        heartParticles.push({
            x: screenX + rand(-10, 10),
            y: screenY,
            vy: rand(-45, -30),
            swayPhase: rand(0, Math.PI * 2),
            swayFreq: rand(2, 4),
            swayAmp: rand(8, 15),
            age: 0, maxAge: rand(1.2, 1.8),
            size: rand(7, 11),
        });
    }
}
```

This reuses the same `boopParticles` and `heartParticles` arrays so `drawBoopEffects` renders them automatically. The key difference is `hue` spans the full rainbow instead of 30-60 (golden).

#### 4.8 — Add `handleSanctuaryTap` with action menu

In `js/main.js`, replace the current `handleSanctuaryTap` function with the full action menu version:

```js
let sanctuaryActionMenu = null; // DOM element reference

function dismissSanctuaryActionMenu() {
    if (sanctuaryActionMenu) {
        sanctuaryActionMenu.remove();
        sanctuaryActionMenu = null;
    }
}

function handleSanctuaryTap(px, py) {
    // Dismiss any existing action menu
    dismissSanctuaryActionMenu();

    const visibleFish = getVisibleFish();
    let tappedFish = null;
    let tapSX = 0, tapSY = 0;

    for (const fish of visibleFish) {
        const sx = tankLeft + (fish._viewX / 100) * tankW;
        const sy = tankTop + (fish._viewY / 100) * tankH;
        const size = fish.getSizePixels();
        if (dist(px, py, sx, sy) < size * 1.5) {
            tappedFish = fish;
            tapSX = sx;
            tapSY = sy;
            break;
        }
    }

    if (!tappedFish) return;

    // Show action menu near the tapped fish
    showSanctuaryActionMenu(tappedFish, tapSX, tapSY);
}

function showSanctuaryActionMenu(fish, screenX, screenY) {
    dismissSanctuaryActionMenu();

    const menu = document.createElement('div');
    menu.className = 'sanctuary-action-menu';
    // Position near the fish, but keep on screen
    const menuX = Math.min(screenX - 50, window.innerWidth - 120);
    const menuY = Math.max(screenY - 70, 10);
    menu.style.left = `${Math.max(10, menuX)}px`;
    menu.style.top = `${menuY}px`;

    const nameLabel = document.createElement('div');
    nameLabel.className = 'sanctuary-action-name';
    nameLabel.textContent = fish.name || fish.species.name;
    menu.appendChild(nameLabel);

    // Species level check: only show Invite if the player has unlocked this species
    const species = fish.species;
    const prog = getProgression();
    const speciesLocked = species.level > prog.level;

    const boopBtn = document.createElement('button');
    boopBtn.className = 'sanctuary-action-btn sanctuary-action-boop';
    boopBtn.textContent = 'Boop';
    boopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fish.boopVisit();
        addRainbowBoopEffect(screenX, screenY);
        playBoopSound();
        dismissSanctuaryActionMenu();
    });
    menu.appendChild(boopBtn);

    const inviteBtn = document.createElement('button');
    inviteBtn.className = 'sanctuary-action-btn sanctuary-action-invite';
    if (speciesLocked) {
        inviteBtn.textContent = `Locked (Lv ${species.level})`;
        inviteBtn.disabled = true;
        inviteBtn.style.opacity = '0.4';
    } else {
        inviteBtn.textContent = 'Invite';
        inviteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            dismissSanctuaryActionMenu();
            await handleInviteFish(fish);
        });
    }
    menu.appendChild(inviteBtn);

    document.body.appendChild(menu);
    sanctuaryActionMenu = menu;

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
        if (sanctuaryActionMenu === menu) dismissSanctuaryActionMenu();
    }, 4000);
}
```

Note: `getProgression` is already imported from store.js on line 6 of main.js.

#### 4.9 — Add `handleInviteFish` function

Add after the action menu code:

```js
let pendingInviteFish = null; // fish data from sanctuary take, added after exiting

async function handleInviteFish(fish) {
    // Capacity check: use the fish's actual currentSize
    // During sanctuary mode, fishes array is empty — use savedStateBeforeVisit
    const realFishes = savedStateBeforeVisit?.fish
        ? savedStateBeforeVisit.fish.map(fd => ({ currentSize: fd.currentSize || 0 }))
        : fishes;
    const cap = getTankCapacity();
    const used = getCurrentStockInches(realFishes);
    if (used + fish.currentSize > cap) {
        showToast('Your tank is too full to invite this fish!');
        return;
    }

    // Attempt to take from sanctuary
    try {
        const result = await takeSanctuaryFish(
            fish.sanctuaryChunkCX,
            fish.sanctuaryChunkCY,
            fish.sanctuaryId
        );

        // Remove from local cache
        removeFishFromCache(fish.sanctuaryChunkCX, fish.sanctuaryChunkCY, fish.sanctuaryId);

        // Store the taken fish data so we can create it after exiting sanctuary
        pendingInviteFish = result.fish;

        // Show toast and exit
        showToast(`${fish.name || fish.species.name} has joined your tank!`);
        exitSanctuaryMode();
    } catch (err) {
        showToast(err.message || 'Could not invite this fish. Try another!');
    }
}
```

Note: The capacity check uses a single approach — check `savedStateBeforeVisit.fish` if available (we are in sanctuary mode), otherwise fall back to `fishes` (shouldn't happen, but defensive). No separate helper function needed.

#### 4.10 — Add invited fish to tank on sanctuary exit

In `exitSanctuaryMode()`, after the state restoration block (after `if (saved.breedTimers) breedTimers = { ...saved.breedTimers };`), add:

```js
// Add pending invite fish if any
if (pendingInviteFish) {
    const fd = pendingInviteFish;
    pendingInviteFish = null;
    const species = SPECIES_CATALOG.find(s => s.name === fd.speciesName);
    if (species) {
        const newFish = new Fish(species, undefined, undefined, undefined, fd.name || '');
        newFish.currentSize = fd.currentSize ?? species.sizeInches * 0.6;
        newFish.isFry = fd.isFry ?? false;
        newFish.tailDots = fd.tailDots ?? 0;
        newFish.happiness = 80;
        newFish.hunger = 50;
        newFish.strength = 80;
        fishes.push(newFish);
    }
}

// Explicit save after adding invited fish
saveGame(fishes, gameTime, breedTimers);
```

This creates a REAL Fish (not a visitor) from the taken sanctuary data. It gets a new local `id` from the Fish constructor's `nextFishId++`. The explicit `saveGame()` call ensures the invited fish is persisted immediately, so it won't be lost if the app closes before the next auto-save.

Note: `SPECIES_CATALOG` is already imported on line 3 of main.js (`import { Fish, SPECIES_CATALOG, createFry } from './fish.js'`). No additional import needed.

#### 4.11 — `showToast` utility

Add a generic toast function in main.js (near the existing `showFryToast`):

```js
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fry-toast'; // reuse the existing fry-toast styling
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fry-toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 2500);
}
```

#### 4.12 — Dismiss action menu on exit

In `exitSanctuaryMode`, add at the top:
```js
dismissSanctuaryActionMenu();
```

#### 4.13 — Add CSS for action menu

In `style.css`, add:

```css
.sanctuary-action-menu {
    position: fixed;
    z-index: 200;
    background: rgba(20, 40, 60, 0.92);
    border: 1px solid rgba(106, 190, 106, 0.4);
    border-radius: 10px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 100px;
    pointer-events: auto;
    animation: sanctuary-menu-in 0.15s ease-out;
}

@keyframes sanctuary-menu-in {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
}

.sanctuary-action-name {
    color: #b0d0b0;
    font-size: 0.75rem;
    text-align: center;
    padding: 2px 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
}

.sanctuary-action-btn {
    background: rgba(106, 190, 106, 0.2);
    color: #c0e8c0;
    border: 1px solid rgba(106, 190, 106, 0.3);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s;
    pointer-events: auto;
}

.sanctuary-action-btn:hover {
    background: rgba(106, 190, 106, 0.35);
}

.sanctuary-action-btn:disabled {
    cursor: not-allowed;
}

.sanctuary-action-invite {
    background: rgba(74, 158, 255, 0.2);
    border-color: rgba(74, 158, 255, 0.3);
    color: #a0d0ff;
}

.sanctuary-action-invite:hover:not(:disabled) {
    background: rgba(74, 158, 255, 0.35);
}
```

### Design & Constraints
- `rainbowTimer` is a per-fish countdown. It is NOT serialized — it only matters during the current session.
- The OR-combined condition `(getRainbowGlowActive() || this.rainbowTimer > 0)` in drawSide/drawTop means both rainbow sources produce the same visual. The shadow fish global rainbow and per-fish sanctuary boop are visually identical, which is intentional.
- The action menu is a DOM element with `position: fixed; z-index: 200` over the canvas. Button clicks use `e.stopPropagation()` to prevent the canvas pointerdown handler from interfering. The canvas pointerdown handler calls `dismissSanctuaryActionMenu()` to dismiss the menu when tapping elsewhere.
- The action menu does NOT drift with the fish during panning — it is dismissed on pan start (Phase 3.3). This is deliberate: the 4-second auto-dismiss timeout would expire before significant drift anyway, and dismissing on pan is the expected UX.
- `pointer-events: auto` on the menu and buttons ensures clicks are captured even though the canvas handles pointer events separately. The menu sits above the canvas in z-order.
- Species level check prevents inviting fish the player hasn't unlocked yet. The button appears but is disabled with a level requirement label.
- `addRainbowBoopEffect` pushes into the same particle arrays as `addBoopEffect`, so no new render code is needed.
- Capacity check uses `getCurrentStockInches` with the fish's actual `currentSize`, not the store's `canAddFish` default of `species.sizeInches * 0.6`. This is correct because sanctuary fish may be fully grown.
- Explicit `saveGame()` call after invite ensures the new fish is persisted immediately.

### Acceptance Criteria
- Tapping a sanctuary fish shows a floating menu with fish name, "Boop" and "Invite" buttons
- "Boop" triggers rainbow glow on the fish for 3 seconds + rainbow sparkle particles
- Rainbow glow uses the same HSL cycling as the shadow fish rainbow, but only on the tapped fish
- "Invite" button disabled with level requirement for locked species
- Tapping "Invite" on an unlocked fish: capacity checked, fish removed from server, player exits sanctuary, fish appears in tank, game saved
- If tank is full, toast says "Your tank is too full to invite this fish!"
- If another player took the fish first (409), toast says "This fish was already taken by another player!"
- If rate-limited (429), toast says "Too many invites! Try again in a minute."
- Menu auto-dismisses after 4 seconds
- Tapping empty space, another fish, or starting a pan dismisses the existing menu
- Invited fish eat, grow, breed, and behave like any fish added from the store

### Testing
- Unit test: Fish `rainbowTimer` initializes to 0, `boopVisit()` sets it to 3
- Unit test: `rainbowTimer` decrements in `updateVisitMode`
- E2E test: tapping a fish in sanctuary mode shows action menu with Boop and Invite buttons
- E2E test: clicking Boop triggers rainbow effect (fish gets `rainbowTimer > 0`)

### Dependencies
Phase 2 & 3 (2D viewport, `_viewX`, `_viewY`, action menu dismiss on pan).

---

## Phase 5 — Testing

### Goal
Add comprehensive unit and E2E tests covering the new functionality. All tests must pass before merging (enforced by pre-commit hook).

### Work Items

#### 5.1 — Worker unit tests (`tests/unit/worker.test.js`)

Create a test file for the worker's sanctuary endpoints:
- Test `generateFishId()` returns 8-char alphanumeric string
- Test retire endpoint writes to 2D chunk key format, includes `id` field, returns `fishId`
- Test take endpoint removes fish by id, returns 409 when fish not found
- Test take endpoint returns 429 when rate-limited
- Test chunk GET with 2D coords
- Test meta returns `gridWidth` and `gridHeight`

#### 5.2 — Sanctuary client unit tests (`tests/unit/sanctuary.test.js`)

- Test `chunkKey` helper
- Test `getVisibleChunkIndices` for various camera positions
- Test `removeFishFromCache` removes correct fish
- Test `getOwnRetiredFish` / `saveOwnRetiredFish` localStorage round-trip
- Test camera clamping: `setCameraX`/`setCameraY` clamp to grid bounds

#### 5.3 — Fish unit tests (`tests/unit/fish-rainbow.test.js`)

- Test `rainbowTimer` initialized to 0
- Test `boopVisit()` sets `rainbowTimer` to 3
- Test `updateVisitMode` decrements `rainbowTimer`

#### 5.4 — E2E tests (`tests/e2e/sanctuary.spec.js`)

- Test entering sanctuary mode shows minimap
- Test panning changes camera position
- Test tapping a fish shows action menu
- Test action menu has Boop and Invite buttons
- Test clicking Boop dismisses menu and triggers effect
- Test invited fish appears in tank after exiting sanctuary

### Design & Constraints
- Use Vitest for unit tests, Playwright for E2E tests (per project conventions)
- Worker tests will need to mock the KV namespace (`env.LIVE_TANKS`)
- Sanctuary client tests will need to mock `fetch` for API calls
- E2E tests may need to seed the sanctuary with test data

### Acceptance Criteria
- `npm run test:unit` passes with all new tests
- `npm run test:e2e` passes with all new tests
- Coverage for critical paths: take race (409), rate limit (429), capacity check, species level lock

### Dependencies
All previous phases.

---

## Review Findings Resolution Log

This section documents how each finding from the Round 1 review was addressed.

### Reviewer Findings

| # | Finding | Resolution |
|---|---------|------------|
| 1 | Phase 1.4: Add retry loop code for full chunks | FIXED: Phase 1.4 now includes the full retry loop code with 5 attempts |
| 2 | Phase 1: Add fishId to retire response | FIXED: Phase 1.4 now includes `fishId: fishEntry.id` in the retire response |
| 3 | Phase 5.1/5.2: Remove duplicate capacity-check | FIXED: Collapsed into single inline check in Phase 4.9 using `savedStateBeforeVisit?.fish` fallback |
| 4 | Phase 5.3: Remove SPECIES_CATALOG import instruction | FIXED: Phase 3.1 and 4.10 note that SPECIES_CATALOG is already imported on line 3 of main.js |
| 5 | Phase 5.6/5.9: Collapse into one approach (id-based) | FIXED: Collapsed into Phase 2.4 (requestChunk) and 2.10 (retireFish). Only id-based matching, no heuristic fallback |
| 6 | Add testing work items | FIXED: Added Testing subsections to each phase + dedicated Phase 5 for tests |
| 7 | Note Phases 2+3 must be applied together | FIXED: Bold warning in Phase 2 header, Phase 3 header, and Progress Tracker note |
| 8 | Old sanctuary data migration | FIXED: Migration note in Overview explaining old 1D keys are orphaned, acceptable for pre-release |
| 9 | Meta totalFish drift from concurrent takes | FIXED: Documented as cosmetic in Phase 1 Design & Constraints |
| 10 | Phase 3.10 stub replaced by Phase 4.8 — wasteful | FIXED: Removed Phase 3.10 stub entirely. Phase 4.8 contains the final `handleSanctuaryTap` directly |

### Devil's Advocate Findings

| # | Finding | Resolution |
|---|---------|------------|
| 1 | Take endpoint race condition | DOCUMENTED: Phase 1 Design & Constraints explains the race window, mitigations (rate limit, low probability), and acceptable worst case (duplicate fish). KV has no CAS — accepted as pre-release limitation |
| 2 | Phase 2 without 3 breaks keyboard pan | FIXED: Bold co-application warning on both phases |
| 3 | Missing species.level check on invite | FIXED: Phase 4.8 checks `species.level > prog.level` and disables the Invite button with level label |
| 4 | Action menu DOM may not receive clicks | FIXED: Phase 4.13 adds `pointer-events: auto` on menu and buttons. Phase 4.8 uses `e.stopPropagation()`. Phase 4 Design & Constraints explains the z-ordering |
| 5 | No saveGame() after invite | FIXED: Phase 4.10 adds explicit `saveGame(fishes, gameTime, breedTimers)` after adding the invited fish |
| 6 | No rate limit on take endpoint | FIXED: Phase 1.1 adds `TAKE_RATE_LIMIT_KEY_PREFIX` and `TAKE_COOLDOWN_SECONDS`. Phase 1.6 adds full rate-limiting logic mirroring the retire endpoint |
| 7 | Orphaned old 1D chunk data | DOCUMENTED: Migration note in Overview |
| 8 | Y axis semantics gap | FIXED: Overview now includes a "Coordinate model" section explaining: camera.y selects which chunk row is visible, fish.y is vertical position within the chunk, `_viewY = (chunkRow * 100 + fish.y) - camera.y`. Both `_viewX` and `_viewY` are needed and coherent |
| 9 | Contradictory capacity-check in 5.1 vs 5.2 | FIXED: Collapsed into single approach in Phase 4.9 |
| 10 | Action menu drifts from fish during pan | FIXED: Menu dismissed on pan start (Phase 3.3 pointerdown handler). Documented in Phase 4 Design & Constraints |
| 11 | localStorage parsed per chunk load for own-fish checking | FIXED: Phase 2.4 hoists `getOwnRetiredFish()` call outside the `data.map()` loop — parsed once per chunk, not per fish |
| 12 | No prefetch rate limiting | ACCEPTED: Phase 2.8 adds a `Set`-based dedup to avoid redundant `requestChunk` calls at chunk boundaries. The `requestChunk` function already short-circuits if the key is in `chunkCache` or `loadingChunks`. With a 10x10 grid and 1-chunk prefetch margin, the maximum concurrent fetches is ~9 (3x3 at a 4-way boundary), which is acceptable |

## Plan Quality

**Drafting process:** /draft-plan with 2 rounds of adversarial review
**Convergence:** Converged at round 2 (0 new substantive issues)
**Remaining concerns:** None

### Round History
| Round | Reviewer Findings | Devil's Advocate Findings | Resolved |
|-------|-------------------|---------------------------|----------|
| 1     | 10 issues         | 12 issues                 | 22/22    |
| 2     | 0 issues          | 0 issues                  | Converged|
