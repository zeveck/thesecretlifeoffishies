// tank.js — Tank state: water chemistry (nitrogen cycle), algae

import { clamp } from './utils.js';

const tank = {
    ammonia: 0,
    nitrite: 0,
    nitrate: 0,
    bacteria: 5,  // Start with a tiny colony
    algae: 0,
    freeFeed: false,
    // Tank dimensions in "inches" for stocking
    gallons: 10,
    capacityInches: 5,
    decorations: [],  // Array of decoration IDs owned
};

// Decoration catalog
export const DECORATIONS = [
    { id: 'java_fern', name: 'Java Fern', cost: 15, color: '#4a8a3a', desc: 'Reduces algae growth', effect: 'algae' },
    { id: 'castle', name: 'Castle Ruin', cost: 20, color: '#8a7a5a', desc: 'Fish feel safer (+happiness)', effect: 'happiness' },
    { id: 'coral', name: 'Coral Reef', cost: 25, color: '#e07060', desc: 'Absorbs nitrate', effect: 'nitrate' },
    { id: 'driftwood', name: 'Driftwood', cost: 12, color: '#7a5a3a', desc: 'Boosts bacteria growth', effect: 'bacteria' },
    { id: 'led_lights', name: 'LED String Lights', cost: 18, color: '#e060e0', desc: 'Colorful lights (+happiness)', effect: 'happiness' },
    { id: 'treasure_chest', name: 'Treasure Chest', cost: 22, color: '#c0a030', desc: 'Mysterious gold glow (+happiness)', effect: 'happiness' },
    { id: 'rock_arch', name: 'Rock Arch', cost: 16, color: '#6a7a6a', desc: 'Natural hideout, boosts bacteria', effect: 'bacteria' },
];

// Tank care items (consumable)
export const CARE_ITEMS = [
    { id: 'conditioner', name: 'Water Conditioner', cost: 8, color: '#5ab8d6', desc: 'Halves ammonia & nitrite' },
    { id: 'bacteria_dose', name: 'Bacteria Supplement', cost: 10, color: '#5a9ed6', desc: 'Boosts bacteria colony +20' },
];

export function hasDecoration(id) {
    return tank.decorations.includes(id);
}

export function addDecoration(id) {
    if (!tank.decorations.includes(id)) {
        tank.decorations.push(id);
    }
}

export function useCareItem(id) {
    if (id === 'conditioner') {
        tank.ammonia *= 0.5;
        tank.nitrite *= 0.5;
    } else if (id === 'bacteria_dose') {
        tank.bacteria = clamp(tank.bacteria + 20, 0, 100);
    }
}

export function getDecorationHappinessBonus() {
    let bonus = 0;
    if (tank.decorations.includes('castle')) bonus += 5;
    if (tank.decorations.includes('coral')) bonus += 3;
    if (tank.decorations.includes('led_lights')) bonus += 4;
    if (tank.decorations.includes('treasure_chest')) bonus += 3;
    return bonus;
}

// Accumulator for per-second chemistry ticks
let chemAccum = 0;

export function getTank() {
    return tank;
}

export function setTankSize(gallons, inches) {
    tank.gallons = gallons;
    tank.capacityInches = inches;
}

export function updateChemistry(dt, totalFishInches, uneatenFoodCount) {
    chemAccum += dt;
    // Run chemistry once per second
    while (chemAccum >= 1) {
        chemAccum -= 1;
        tickChemistry(totalFishInches, uneatenFoodCount);
    }
}

function tickChemistry(fishInches, uneatenFood) {
    // Ammonia production from fish + uneaten food
    tank.ammonia += fishInches * 0.003 + uneatenFood * 0.01;
    if (tank.freeFeed) {
        // In free feed mode, food doesn't contribute
        tank.ammonia -= uneatenFood * 0.01;
    }

    // Bacteria process ammonia → nitrite
    const ammoniaConverted = Math.min(tank.ammonia, tank.bacteria * 0.004);
    tank.ammonia -= ammoniaConverted;
    tank.nitrite += ammoniaConverted * 0.75;

    // Bacteria process nitrite → nitrate
    const nitriteConverted = Math.min(tank.nitrite, tank.bacteria * 0.003);
    tank.nitrite -= nitriteConverted;
    tank.nitrate += nitriteConverted * 0.67;

    // Algae from nitrate (Java Fern reduces by 50%)
    const algaeRate = tank.decorations.includes('java_fern') ? 0.0005 : 0.001;
    tank.algae += tank.nitrate * algaeRate;

    // Coral absorbs nitrate
    if (tank.decorations.includes('coral')) {
        tank.nitrate *= 0.998;
    }

    // Bacteria growth — slow, faster when ammonia present (Driftwood boosts)
    const ammoniaBonus = tank.ammonia > 1 ? 0.02 : 0;
    const driftwoodBonus = tank.decorations.includes('driftwood') ? 0.01 : 0;
    const archBonus = tank.decorations.includes('rock_arch') ? 0.008 : 0;
    tank.bacteria += 0.01 + ammoniaBonus + driftwoodBonus + archBonus;

    // Clamp everything
    tank.ammonia = clamp(tank.ammonia, 0, 100);
    tank.nitrite = clamp(tank.nitrite, 0, 100);
    tank.nitrate = clamp(tank.nitrate, 0, 100);
    tank.bacteria = clamp(tank.bacteria, 0, 100);
    tank.algae = clamp(tank.algae, 0, 100);
}

export function doWaterChange() {
    tank.ammonia *= 0.75;
    tank.nitrite *= 0.75;
    tank.nitrate *= 0.75;
    tank.bacteria *= 0.95; // Slight bacteria loss
    tank.algae *= 0.8;
}

export function getWaterQuality() {
    // Return 0–1 where 1 is perfect
    const toxicity = Math.max(tank.ammonia, tank.nitrite) / 100;
    return clamp(1 - toxicity, 0, 1);
}

// Apply offline elapsed time (in seconds)
export function applyOfflineChemistry(seconds, fishInches) {
    const ticks = Math.min(seconds, 86400); // Cap at 24 hours
    for (let i = 0; i < ticks; i++) {
        tickChemistry(fishInches, 0);
    }
}

export function loadTankState(state) {
    if (!state) return;
    tank.ammonia = state.ammonia ?? 0;
    tank.nitrite = state.nitrite ?? 0;
    tank.nitrate = state.nitrate ?? 0;
    tank.bacteria = state.bacteria ?? 5;
    tank.algae = state.algae ?? 0;
    tank.freeFeed = state.freeFeed ?? false;
    tank.gallons = state.gallons ?? 10;
    tank.capacityInches = state.capacityInches ?? 5;
    tank.decorations = state.decorations ?? [];
}

export function saveTankState() {
    return { ...tank };
}
