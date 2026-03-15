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

const ONE_YEAR = 365 * 24 * 60 * 60;
const MAX_PAYLOAD = 50 * 1024; // 50KB max payload

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
        const path = url.pathname;

        // POST /live — create a new live share
        if (request.method === 'POST' && path === '/live') {
            const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
            if (contentLength > MAX_PAYLOAD) {
                return json({ error: 'Payload too large' }, 413, request, env);
            }
            let body;
            try {
                body = await request.json();
            } catch {
                return json({ error: 'Invalid JSON' }, 400, request, env);
            }

            // Try up to 5 times to find a unique code
            for (let attempt = 0; attempt < 5; attempt++) {
                const code = generateCode();
                const key = `live:${code}`;
                const existing = await env.LIVE_TANKS.get(key);
                if (existing) continue;

                const entry = { ...body, version: 1 };
                await env.LIVE_TANKS.put(key, JSON.stringify(entry), { expirationTtl: ONE_YEAR });
                return json({ code, version: 1 }, 201, request, env);
            }

            return json({ error: 'Could not generate unique code' }, 503, request, env);
        }

        // GET /live/:code — fetch tank state
        const getMatch = path.match(/^\/live\/([a-z0-9]{8})$/i);
        if (request.method === 'GET' && getMatch) {
            const code = getMatch[1].toLowerCase();
            const key = `live:${code}`;
            const data = await env.LIVE_TANKS.get(key);
            if (!data) {
                return json({ error: 'Not found' }, 404, request, env);
            }

            // Refresh TTL on read
            await env.LIVE_TANKS.put(key, data, { expirationTtl: ONE_YEAR });
            return json(JSON.parse(data), 200, request, env);
        }

        // PUT /live/:code — update tank state
        const putMatch = path.match(/^\/live\/([a-z0-9]{8})$/i);
        if (request.method === 'PUT' && putMatch) {
            const code = putMatch[1].toLowerCase();
            const key = `live:${code}`;

            const putContentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
            if (putContentLength > MAX_PAYLOAD) {
                return json({ error: 'Payload too large' }, 413, request, env);
            }
            let body;
            try {
                body = await request.json();
            } catch {
                return json({ error: 'Invalid JSON' }, 400, request, env);
            }

            const existing = await env.LIVE_TANKS.get(key);
            if (!existing) {
                return json({ error: 'Not found' }, 404, request, env);
            }

            const current = JSON.parse(existing);
            if (body.version !== current.version) {
                return json({ error: 'Version conflict', currentVersion: current.version }, 409, request, env);
            }

            const updated = { ...body, version: current.version + 1 };
            await env.LIVE_TANKS.put(key, JSON.stringify(updated), { expirationTtl: ONE_YEAR });
            return json({ version: updated.version }, 200, request, env);
        }

        // DELETE /live/:code — remove a live share
        const deleteMatch = path.match(/^\/live\/([a-z0-9]{8})$/i);
        if (request.method === 'DELETE' && deleteMatch) {
            const code = deleteMatch[1].toLowerCase();
            const key = `live:${code}`;
            await env.LIVE_TANKS.delete(key);
            return json({ deleted: true }, 200, request, env);
        }

        return json({ error: 'Not found' }, 404, request, env);
    },
};
