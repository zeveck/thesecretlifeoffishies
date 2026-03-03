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
};

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

    // Algae from nitrate
    tank.algae += tank.nitrate * 0.001;

    // Bacteria growth — slow, faster when ammonia present
    const ammoniaBonus = tank.ammonia > 1 ? 0.02 : 0;
    tank.bacteria += 0.01 + ammoniaBonus;

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
}

export function saveTankState() {
    return { ...tank };
}
