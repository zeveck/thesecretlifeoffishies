import { WORKER_URL } from './live.js';
import { Fish } from './fish.js';

// --- API ---

/** Fetch sanctuary metadata. Returns { totalFish, gridWidth, gridHeight, lastUpdated }. */
export async function fetchSanctuaryMeta() {
    const resp = await fetch(`${WORKER_URL}/sanctuary/meta`);
    if (!resp.ok) return { totalFish: 0, gridWidth: 10, gridHeight: 10, lastUpdated: 0 };
    return resp.json();
}

/** Fetch a single chunk by 2D coordinates. Returns array of fish data objects or []. */
export async function fetchSanctuaryChunk(cx, cy) {
    const resp = await fetch(`${WORKER_URL}/sanctuary/chunk/${cx}/${cy}`);
    if (!resp.ok) return [];
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
    const result = await resp.json();

    // Track this fish as "ours" in localStorage using server-assigned id
    saveOwnRetiredFish(fishData.speciesName, fishData.name, result.fishId);

    return result;
}

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

// --- Own-fish tracking ---

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

// --- Chunk cache ---
// Map<string, { data: FishData[], fish: Fish[], loaded: boolean }>
// Key format: "cx,cy"
const chunkCache = new Map();
let sanctuaryMeta = { totalFish: 0, gridWidth: 10, gridHeight: 10, lastUpdated: 0 };
let loadingChunks = new Set(); // string keys "cx,cy" currently being fetched

function chunkKey(cx, cy) { return `${cx},${cy}`; }

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

/** Remove a fish from the local chunk cache after it's been taken. */
export function removeFishFromCache(cx, cy, sanctuaryId) {
    const key = chunkKey(cx, cy);
    const entry = chunkCache.get(key);
    if (!entry || !entry.loaded) return;
    entry.fish = entry.fish.filter(f => f.sanctuaryId !== sanctuaryId);
    entry.data = entry.data.filter(d => d.id !== sanctuaryId);
}

/** Clear all cached chunks (called on exit). */
export function clearSanctuaryCache() {
    chunkCache.clear();
    loadingChunks.clear();
    sanctuaryMeta = { totalFish: 0, gridWidth: 10, gridHeight: 10, lastUpdated: 0 };
    camera.x = 0;
    camera.y = 0;
}

/** Initialize sanctuary — fetch meta, return it. */
export async function initSanctuary() {
    sanctuaryMeta = await fetchSanctuaryMeta();
    // Ensure gridWidth/gridHeight exist (backward compat)
    if (!sanctuaryMeta.gridWidth) sanctuaryMeta.gridWidth = 10;
    if (!sanctuaryMeta.gridHeight) sanctuaryMeta.gridHeight = 10;
    return sanctuaryMeta;
}

export function getSanctuaryMeta() {
    return sanctuaryMeta;
}

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
