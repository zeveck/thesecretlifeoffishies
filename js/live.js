// live.js — Client-side live share module

import { getTank } from './tank.js';
import { getProgression } from './store.js';

export const WORKER_URL = 'https://fishies-live.royal-firefly-5112.workers.dev';

const LS_LIVE = 'fishies_live';
const LS_BOOKMARKS = 'fishies_bookmarks';

let pushInterval = null;

// --- Live share state ---

export function isLiveSharing() {
    return !!localStorage.getItem(LS_LIVE);
}

export function getLiveCode() {
    const data = localStorage.getItem(LS_LIVE);
    if (!data) return null;
    try { return JSON.parse(data).liveCode; } catch { return null; }
}

function getLiveVersion() {
    const data = localStorage.getItem(LS_LIVE);
    if (!data) return 1;
    try { return JSON.parse(data).liveVersion || 1; } catch { return 1; }
}

function setLiveData(code, version) {
    localStorage.setItem(LS_LIVE, JSON.stringify({ liveCode: code, liveVersion: version }));
}

function clearLiveData() {
    localStorage.removeItem(LS_LIVE);
}

// --- Extract shareable data ---

export function extractShareData(saveState, level) {
    const tank = getTank();
    const prog = getProgression();
    const fish = (saveState.fish || []).map(f => ({
        speciesName: f.speciesName,
        name: f.name,
        currentSize: f.currentSize,
        isFry: f.isFry,
        tailDots: f.tailDots,
    }));
    const decorations = (tank.decorations || []).map(d => ({
        id: d.id,
        x: d.x,
        y: d.y,
    }));
    let version = 1;
    try { version = getLiveVersion(); } catch { /* no localStorage in tests */ }
    return {
        fish,
        decorations,
        level: level ?? prog.level,
        gallons: tank.gallons,
        version,
    };
}

// --- API calls ---

export async function startLiveShare(getSaveState) {
    const saveState = getSaveState();
    const prog = getProgression();
    const shareData = extractShareData(saveState, prog.level);

    const resp = await fetch(`${WORKER_URL}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shareData),
    });

    if (!resp.ok) throw new Error('Failed to create live share');
    const { code, version } = await resp.json();
    setLiveData(code, version);
    startPushInterval(getSaveState);
    return code;
}

export async function stopLiveShare() {
    stopPushInterval();
    const code = getLiveCode();
    clearLiveData();
    if (code) {
        try {
            await fetch(`${WORKER_URL}/live/${code}`, { method: 'DELETE' });
        } catch { /* network error: ignore */ }
    }
}

export function startPushInterval(getSaveState) {
    stopPushInterval();
    pushInterval = setInterval(() => pushUpdate(getSaveState), 60000);
}

export function stopPushInterval() {
    if (pushInterval) {
        clearInterval(pushInterval);
        pushInterval = null;
    }
}

async function pushUpdate(getSaveState) {
    const code = getLiveCode();
    if (!code) return;

    const saveState = getSaveState();
    const prog = getProgression();
    const shareData = extractShareData(saveState, prog.level);

    try {
        const resp = await fetch(`${WORKER_URL}/live/${code}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(shareData),
        });

        if (resp.ok) {
            const { version } = await resp.json();
            setLiveData(code, version);
        } else if (resp.status === 409) {
            // Version conflict — re-fetch current version and retry once
            const current = await resp.json();
            if (current.currentVersion) {
                setLiveData(code, current.currentVersion);
                const retryData = extractShareData(getSaveState(), prog.level);
                const retry = await fetch(`${WORKER_URL}/live/${code}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(retryData),
                });
                if (retry.ok) {
                    const { version } = await retry.json();
                    setLiveData(code, version);
                }
            }
        }
        // On other errors: silently skip
    } catch {
        // Network error: silently skip
    }
}

export async function fetchSharedTank(code) {
    const resp = await fetch(`${WORKER_URL}/live/${code}`);
    if (!resp.ok) return null;
    return resp.json();
}

// --- Bookmarks ---

export function getBookmarks() {
    try {
        return JSON.parse(localStorage.getItem(LS_BOOKMARKS) || '[]');
    } catch {
        return [];
    }
}

export function addBookmark(code, label) {
    try {
        const bookmarks = getBookmarks();
        if (bookmarks.some(b => b.code === code)) return;
        bookmarks.push({ code, label, visitedAt: Date.now() });
        localStorage.setItem(LS_BOOKMARKS, JSON.stringify(bookmarks));
    } catch { /* no localStorage */ }
}

export function removeBookmark(code) {
    try {
        const bookmarks = getBookmarks().filter(b => b.code !== code);
        localStorage.setItem(LS_BOOKMARKS, JSON.stringify(bookmarks));
    } catch { /* no localStorage */ }
}
