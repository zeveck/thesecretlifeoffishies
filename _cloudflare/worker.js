// Cloudflare Worker — Live tank sharing via KV
// Bindings: LIVE_TANKS (KV namespace), ALLOWED_ORIGIN (var)

const CORS_HEADERS = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function corsOrigin(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || 'https://thesecretlifeoffishies.com';
    if (origin === allowed || origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
        return origin;
    }
    return allowed;
}

function json(data, status, request, env) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': corsOrigin(request, env),
            ...CORS_HEADERS,
        },
    });
}

function generateCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}

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

const ONE_YEAR = 365 * 24 * 60 * 60;
const MAX_PAYLOAD = 50 * 1024; // 50KB max payload

// --- Sanctuary constants ---
const SANCTUARY_META_KEY = 'sanctuary:meta';
const SANCTUARY_CHUNK_PREFIX = 'sanctuary:chunk:';
const CHUNK_SIZE = 50; // fish per chunk
const MAX_SANCTUARY_FISH = 10000;
const SANCTUARY_GRID_WIDTH = 10;   // chunks
const SANCTUARY_GRID_HEIGHT = 10;  // chunks
const SANCTUARY_TOTAL_CHUNKS = SANCTUARY_GRID_WIDTH * SANCTUARY_GRID_HEIGHT; // 100
const RETIRE_RATE_LIMIT_KEY_PREFIX = 'ratelimit:retire:';
const RETIRE_COOLDOWN_SECONDS = 60; // 1 retire per minute per IP
const TAKE_RATE_LIMIT_KEY_PREFIX = 'ratelimit:take:';
const TAKE_COOLDOWN_SECONDS = 60; // 1 take per minute per IP

// --- Shared helpers ---

async function parseJsonBody(request, maxSize = MAX_PAYLOAD) {
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > maxSize) {
        return { ok: false, error: 'Payload too large', status: 413 };
    }
    try {
        const body = await request.json();
        return { ok: true, body };
    } catch {
        return { ok: false, error: 'Invalid JSON', status: 400 };
    }
}

// --- Route table ---

const routes = [
    { method: 'POST', pattern: '/live', handler: handleCreateShare },
    { method: 'GET', pattern: '/live/:code', handler: handleGetShare },
    { method: 'PUT', pattern: '/live/:code', handler: handleUpdateShare },
    { method: 'DELETE', pattern: '/live/:code', handler: handleDeleteShare },
    { method: 'POST', pattern: '/sanctuary/retire', handler: handleRetireFish },
    { method: 'GET', pattern: '/sanctuary/meta', handler: handleGetMeta },
    { method: 'GET', pattern: '/sanctuary/chunk/:cx/:cy', handler: handleGetChunk },
    { method: 'POST', pattern: '/sanctuary/take', handler: handleTakeFish },
];

function matchRoute(method, path) {
    for (const route of routes) {
        if (route.method !== method) continue;
        const patternParts = route.pattern.split('/');
        const pathParts = path.split('/');
        if (patternParts.length !== pathParts.length) continue;
        const params = {};
        let match = true;
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                params[patternParts[i].slice(1)] = pathParts[i];
            } else if (patternParts[i] !== pathParts[i]) {
                match = false;
                break;
            }
        }
        if (match) return { handler: route.handler, params };
    }
    return null;
}

// --- Route handlers ---

async function handleCreateShare(request, env, params) {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status, request, env);

    // Try up to 5 times to find a unique code
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        const key = `live:${code}`;
        const existing = await env.LIVE_TANKS.get(key);
        if (existing) continue;

        const entry = { ...parsed.body, version: 1 };
        await env.LIVE_TANKS.put(key, JSON.stringify(entry), { expirationTtl: ONE_YEAR });
        return json({ code, version: 1 }, 201, request, env);
    }

    return json({ error: 'Could not generate unique code' }, 503, request, env);
}

async function handleGetShare(request, env, params) {
    const code = params.code.toLowerCase();
    const key = `live:${code}`;
    const data = await env.LIVE_TANKS.get(key);
    if (!data) {
        return json({ error: 'Not found' }, 404, request, env);
    }

    // Refresh TTL on read
    await env.LIVE_TANKS.put(key, data, { expirationTtl: ONE_YEAR });
    return json(JSON.parse(data), 200, request, env);
}

async function handleUpdateShare(request, env, params) {
    const code = params.code.toLowerCase();
    const key = `live:${code}`;

    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status, request, env);

    const existing = await env.LIVE_TANKS.get(key);
    if (!existing) {
        return json({ error: 'Not found' }, 404, request, env);
    }

    const current = JSON.parse(existing);
    if (parsed.body.version !== current.version) {
        return json({ error: 'Version conflict', currentVersion: current.version }, 409, request, env);
    }

    const updated = { ...parsed.body, version: current.version + 1 };
    await env.LIVE_TANKS.put(key, JSON.stringify(updated), { expirationTtl: ONE_YEAR });
    return json({ version: updated.version }, 200, request, env);
}

async function handleDeleteShare(request, env, params) {
    const code = params.code.toLowerCase();
    const key = `live:${code}`;
    await env.LIVE_TANKS.delete(key);
    return json({ deleted: true }, 200, request, env);
}

// --- Sanctuary handlers ---

async function handleRetireFish(request, env, params) {
    // Rate limit by IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const ipHash = [...new Uint8Array(ipBuf.slice(0, 4))].map(b => b.toString(16).padStart(2, '0')).join('');
    const rlKey = RETIRE_RATE_LIMIT_KEY_PREFIX + ipHash;
    const rlCheck = await env.LIVE_TANKS.get(rlKey);
    if (rlCheck !== null) {
        return json({ error: 'Too many retirements. Try again in a minute.' }, 429, request, env);
    }

    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status, request, env);
    const body = parsed.body;

    // Validate
    if (!body.speciesName || typeof body.speciesName !== 'string') {
        return json({ error: 'Invalid fish data' }, 400, request, env);
    }
    if (typeof body.currentSize !== 'number' || body.currentSize <= 0 || body.currentSize > 10) {
        return json({ error: 'Invalid fish data' }, 400, request, env);
    }

    // Read meta
    const metaRaw = await env.LIVE_TANKS.get(SANCTUARY_META_KEY);
    const meta = metaRaw ? JSON.parse(metaRaw) : {
        totalFish: 0,
        gridWidth: SANCTUARY_GRID_WIDTH,
        gridHeight: SANCTUARY_GRID_HEIGHT,
        lastUpdated: 0,
    };

    if (meta.totalFish >= MAX_SANCTUARY_FISH) {
        return json({ error: 'Sanctuary is full' }, 507, request, env);
    }

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
    chunk.push(fishEntry);

    // Write chunk and meta
    await env.LIVE_TANKS.put(chunkKey, JSON.stringify(chunk));
    meta.totalFish += 1;
    meta.gridWidth = SANCTUARY_GRID_WIDTH;
    meta.gridHeight = SANCTUARY_GRID_HEIGHT;
    meta.lastUpdated = Date.now();
    await env.LIVE_TANKS.put(SANCTUARY_META_KEY, JSON.stringify(meta));

    // Set rate limit
    await env.LIVE_TANKS.put(rlKey, '1', { expirationTtl: RETIRE_COOLDOWN_SECONDS });

    return json({ ok: true, totalFish: meta.totalFish, fishId: fishEntry.id }, 201, request, env);
}

async function handleGetMeta(request, env, params) {
    const metaRaw = await env.LIVE_TANKS.get(SANCTUARY_META_KEY);
    const meta = metaRaw ? JSON.parse(metaRaw) : {
        totalFish: 0,
        gridWidth: SANCTUARY_GRID_WIDTH,
        gridHeight: SANCTUARY_GRID_HEIGHT,
        lastUpdated: 0,
    };
    return json(meta, 200, request, env);
}

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

// --- Main fetch handler ---

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': corsOrigin(request, env),
                    ...CORS_HEADERS,
                },
            });
        }

        const url = new URL(request.url);
        const matched = matchRoute(request.method, url.pathname);
        if (matched) {
            return matched.handler(request, env, matched.params);
        }

        return json({ error: 'Not found' }, 404, request, env);
    },
};
