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
};

export function getProgression() {
    return progression;
}

export function addXP(amount) {
    progression.xp += amount;
    checkLevelUp();
}

function checkLevelUp() {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (progression.xp >= LEVELS[i].xp) {
            if (progression.level !== LEVELS[i].level) {
                progression.level = LEVELS[i].level;
                setTankSize(LEVELS[i].gallons, LEVELS[i].capacityInches);
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

export function passiveXPTick(fishCount, averageHappiness) {
    const now = Date.now();
    const elapsed = (now - progression.lastPassiveTick) / 1000;
    if (elapsed >= 60) {
        const minutes = Math.floor(elapsed / 60);
        addXP(minutes * fishCount);
        // +1 coin per fish per minute, scaled by average happiness (0-1)
        const happinessScale = Math.max(0, Math.min(averageHappiness ?? 0, 1));
        const coins = Math.floor(minutes * fishCount * happinessScale);
        if (coins > 0) addCoins(coins);
        progression.lastPassiveTick = now;
    }
}

export function applyOfflineRewards(seconds, fishCount, averageHappiness) {
    const minutes = Math.min(Math.floor(seconds / 60), 1440); // cap at 24h
    addXP(minutes * fishCount);
    // Offline coin catch-up: same passive formula
    const happinessScale = Math.max(0, Math.min(averageHappiness ?? 0, 1));
    const coins = Math.floor(minutes * fishCount * happinessScale);
    if (coins > 0) addCoins(coins);
}

export function loadProgression(data) {
    if (!data) return;
    progression.xp = data.xp ?? 0;
    progression.level = data.level ?? 1;
    progression.lastPassiveTick = data.lastPassiveTick ?? Date.now();
    progression.coins = data.coins ?? 0;
    progression.pellets = data.pellets ?? 5;
    progression.lastDailyRefresh = data.lastDailyRefresh ?? Date.now();
    checkLevelUp();
}

export function saveProgression() {
    return { ...progression };
}
