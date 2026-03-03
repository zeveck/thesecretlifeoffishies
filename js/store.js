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

export function passiveXPTick(fishCount) {
    const now = Date.now();
    const elapsed = (now - progression.lastPassiveTick) / 1000;
    if (elapsed >= 60) {
        const minutes = Math.floor(elapsed / 60);
        addXP(minutes * fishCount);
        progression.lastPassiveTick = now;
    }
}

export function applyOfflineXP(seconds, fishCount) {
    const minutes = Math.min(Math.floor(seconds / 60), 1440); // cap at 24h
    addXP(minutes * fishCount);
}

export function loadProgression(data) {
    if (!data) return;
    progression.xp = data.xp ?? 0;
    progression.level = data.level ?? 1;
    progression.lastPassiveTick = data.lastPassiveTick ?? Date.now();
    checkLevelUp();
}

export function saveProgression() {
    return { ...progression };
}
