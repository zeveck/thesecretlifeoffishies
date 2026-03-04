// store.js — Fish store, species catalog, progression/XP/levels

import { SPECIES_CATALOG, Fish } from './fish.js';
import { getTank, setTankSize } from './tank.js';

const LEVELS = [
    { level: 1, xp: 0,    gallons: 10, capacityInches: 5 },
    { level: 2, xp: 100,  gallons: 10, capacityInches: 5 },
    { level: 3, xp: 300,  gallons: 20, capacityInches: 10 },
    { level: 4, xp: 600,  gallons: 20, capacityInches: 10 },
    { level: 5, xp: 1000, gallons: 40, capacityInches: 20 },
    { level: 6, xp: 1500, gallons: 40, capacityInches: 20 },
    { level: 7, xp: 2500, gallons: 75, capacityInches: 35 },
];

const progression = {
    xp: 0,
    level: 1,
    lastPassiveTick: Date.now(),
    coins: 0,
    pellets: 5,
    lastDailyRefresh: Date.now(),
    swishProgress: 0,
};

let onLevelUpCallback = null;

export function getProgression() {
    return progression;
}

export function setOnLevelUp(callback) {
    onLevelUpCallback = callback;
}

export function addXP(amount) {
    progression.xp += amount;
    checkLevelUp();
}

function checkLevelUp() {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (progression.xp >= LEVELS[i].xp) {
            if (progression.level !== LEVELS[i].level) {
                const oldLevel = progression.level;
                progression.level = LEVELS[i].level;
                setTankSize(LEVELS[i].gallons, LEVELS[i].capacityInches);
                if (onLevelUpCallback) onLevelUpCallback(progression.level, oldLevel);
            }
            break;
        }
    }
}

export function getCurrentLevelInfo() {
    const current = LEVELS.find(l => l.level === progression.level);
    const next = LEVELS.find(l => l.level === progression.level + 1);
    return { current, next };
}

export function getXPProgress() {
    const { current, next } = getCurrentLevelInfo();
    if (!next) return 1; // max level
    const range = next.xp - current.xp;
    const progress = progression.xp - current.xp;
    return Math.min(progress / range, 1);
}

// --- Coin & pellet functions ---

export function addCoins(amount) {
    progression.coins += amount;
}

export function spendCoins(amount) {
    if (progression.coins >= amount) {
        progression.coins -= amount;
        return true;
    }
    return false;
}

export function getCoins() {
    return progression.coins;
}

export function getPellets() {
    return progression.pellets;
}

export function usePellet() {
    if (progression.pellets > 0) {
        progression.pellets--;
        return true;
    }
    return false;
}

export function buyFoodPack() {
    if (spendCoins(5)) {
        progression.pellets += 10;
        return true;
    }
    return false;
}

export function fishCost(species) {
    return species.level * 10;
}

export function refreshDailyPellets() {
    const elapsed = Date.now() - progression.lastDailyRefresh;
    if (elapsed >= 24 * 60 * 60 * 1000 && progression.pellets < 5) {
        progression.pellets = 5;
        progression.lastDailyRefresh = Date.now();
    }
}

export function getAvailableSpecies() {
    return SPECIES_CATALOG.filter(s => s.level <= progression.level);
}

export function getAllSpecies() {
    return SPECIES_CATALOG;
}

export function getTankCapacity() {
    const lvl = LEVELS.find(l => l.level === progression.level);
    return lvl ? lvl.capacityInches : 5;
}

export function getCurrentStockInches(fishes) {
    return fishes.reduce((sum, f) => sum + f.currentSize, 0);
}

export function canAddFish(fishes, species) {
    const cap = getTankCapacity();
    const used = getCurrentStockInches(fishes);
    return species.level <= progression.level && (used + species.sizeInches * 0.6) <= cap;
}

export function updateSwishMeter(dt, totalHappiness) {
    const rate = totalHappiness / 200; // progress per second
    progression.swishProgress += rate * dt;
    while (progression.swishProgress >= 100) {
        progression.swishProgress -= 100;
        addCoins(1);
    }
}

export function getSwishProgress() {
    return Math.min(progression.swishProgress / 100, 1);
}

export function passiveXPTick(fishCount) {
    const now = Date.now();
    const elapsed = (now - progression.lastPassiveTick) / 1000;
    if (elapsed >= 60) {
        const minutes = Math.floor(elapsed / 60);
        addXP(minutes * fishCount);
        progression.lastPassiveTick = now;
    }
}

export function applyOfflineRewards(seconds, fishCount, totalHappiness) {
    const minutes = Math.min(Math.floor(seconds / 60), 1440); // cap at 24h
    addXP(minutes * fishCount);
    // Offline swish catch-up — capped at 5 coins (cost of a food pack)
    const rate = totalHappiness / 200;
    progression.swishProgress += rate * seconds;
    let offlineCoins = 0;
    while (progression.swishProgress >= 100 && offlineCoins < 5) {
        progression.swishProgress -= 100;
        addCoins(1);
        offlineCoins++;
    }
    // Discard any excess progress beyond the cap
    if (progression.swishProgress >= 100) {
        progression.swishProgress = progression.swishProgress % 100;
    }
}

export function loadProgression(data) {
    if (!data) return;
    progression.xp = data.xp ?? 0;
    progression.level = data.level ?? 1;
    progression.lastPassiveTick = data.lastPassiveTick ?? Date.now();
    progression.coins = data.coins ?? 0;
    progression.pellets = data.pellets ?? 5;
    progression.lastDailyRefresh = data.lastDailyRefresh ?? Date.now();
    progression.swishProgress = data.swishProgress ?? 0;
    checkLevelUp();
}

export function saveProgression() {
    return { ...progression };
}
