// food.js — Food particles: placement, sinking, decay

import { rand, clamp } from './utils.js';

const foods = [];
const SINK_SPEED = 8;   // pixels per second
const DECAY_TIME = 30;  // seconds before food decays
const WOBBLE_AMP = 2;
const WOBBLE_FREQ = 3;

export function getFoods() {
    return foods;
}

export function addFood(x, z, tankWidth, tankHeight, tankDepth) {
    foods.push({
        x: x,
        y: 0, // starts at surface
        z: z,
        vy: SINK_SPEED,
        age: 0,
        eaten: false,
        wobbleOffset: rand(0, Math.PI * 2),
        size: rand(4, 7),
    });
}

export function updateFood(dt, tankFloorY) {
    for (let i = foods.length - 1; i >= 0; i--) {
        const f = foods[i];
        if (f.eaten) {
            foods.splice(i, 1);
            continue;
        }

        f.age += dt;

        // Sinking
        if (f.y < tankFloorY) {
            f.y += f.vy * dt;
            f.x += Math.sin(f.age * WOBBLE_FREQ + f.wobbleOffset) * WOBBLE_AMP * dt;
            if (f.y >= tankFloorY) {
                f.y = tankFloorY;
                f.vy = 0;
            }
        }

        // Decay
        if (f.age > DECAY_TIME) {
            foods.splice(i, 1);
        }
    }
}

export function getUneatenCount() {
    return foods.length;
}

export function drawFoodSide(ctx, f, tankLeft, tankTop, tankW, tankH) {
    const sx = tankLeft + (f.x / 100) * tankW;
    const sy = tankTop + (f.y / 100) * tankH;
    const alpha = f.age > DECAY_TIME - 5 ? (DECAY_TIME - f.age) / 5 : 1;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = '#c8a050';
    ctx.beginPath();
    ctx.arc(sx, sy, f.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a08030';
    ctx.beginPath();
    ctx.arc(sx - f.size * 0.2, sy - f.size * 0.2, f.size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

export function drawFoodTop(ctx, f, tankLeft, tankTop, tankW, tankH) {
    const sx = tankLeft + (f.x / 100) * tankW;
    const sy = tankTop + (f.z / 100) * tankH;
    const alpha = f.age > DECAY_TIME - 5 ? (DECAY_TIME - f.age) / 5 : 1;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = '#c8a050';
    ctx.beginPath();
    ctx.arc(sx, sy, f.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

export function clearAllFood() {
    foods.length = 0;
}

export function loadFoodState(state) {
    foods.length = 0;
    // Don't restore food — it decays anyway
}

export function saveFoodState() {
    return [];
}
