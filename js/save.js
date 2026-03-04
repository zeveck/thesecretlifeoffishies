// save.js — localStorage save/load

const SAVE_KEY = 'fishies_save';
const SAVE_INTERVAL = 30000; // 30 seconds

let lastSaveTime = Date.now();
let savingDisabled = false;

export function saveGame(state) {
    if (savingDisabled) return;
    try {
        const data = {
            version: 1,
            timestamp: Date.now(),
            fish: state.fish,
            tank: state.tank,
            progression: state.progression,
            settings: state.settings,
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        lastSaveTime = Date.now();
    } catch (e) {
        console.warn('Save failed:', e);
    }
}

export function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data;
    } catch (e) {
        console.warn('Load failed:', e);
        return null;
    }
}

export function hasSave() {
    return localStorage.getItem(SAVE_KEY) !== null;
}

export function clearSave() {
    savingDisabled = true;
    localStorage.removeItem(SAVE_KEY);
}

export function exportSaveJSON(state) {
    return JSON.stringify({
        version: 1,
        timestamp: Date.now(),
        fish: state.fish,
        tank: state.tank,
        progression: state.progression,
        settings: state.settings,
    }, null, 2);
}

export function importSaveJSON(json) {
    try {
        const data = JSON.parse(json);
        if (!data.fish || !data.progression) return null;
        return data;
    } catch (e) {
        return null;
    }
}

export function getOfflineSeconds() {
    const data = loadGame();
    if (!data || !data.timestamp) return 0;
    return Math.max(0, (Date.now() - data.timestamp) / 1000);
}

export function shouldAutoSave() {
    return Date.now() - lastSaveTime >= SAVE_INTERVAL;
}

export function initAutoSave(getSaveState) {
    // Save on visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            saveGame(getSaveState());
        }
    });

    // Save before unload
    window.addEventListener('beforeunload', () => {
        saveGame(getSaveState());
    });
}
