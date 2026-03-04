// food.js — Food particles: placement, floating, sinking, decay

import { rand, clamp } from './utils.js';

const foods = [];
const FLOAT_TIME = 1;    // seconds floating at surface
const SINK_SPEED = 12;   // tank-% per second
const DECAY_TIME = 30;   // seconds before food dissolves
const WOBBLE_AMP = 1.5;
const WOBBLE_FREQ = 3;

export function getFoods() {
    return foods;
}

export function addFood(x, z) {
    foods.push({
        x: x,
        y: 0, // starts at surface
        z: z,
        age: 0,
        eaten: false,
        wobbleOffset: rand(0, Math.PI * 2),
        size: rand(2, 3.5),
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

        // Float at surface, then sink
        if (f.age > FLOAT_TIME && f.y < tankFloorY) {
            const sinkProgress = f.age - FLOAT_TIME;
            // Accelerate slowly at first
            const speed = SINK_SPEED * Math.min(sinkProgress, 1);
            f.y += speed * dt;
            f.x += Math.sin(f.age * WOBBLE_FREQ + f.wobbleOffset) * WOBBLE_AMP * dt;
            if (f.y >= tankFloorY) {
                f.y = tankFloorY;
            }
        } else if (f.age <= FLOAT_TIME) {
            // Gentle surface drift while floating
            f.x += Math.sin(f.age * 1.5 + f.wobbleOffset) * 0.3 * dt;
        }

        // Decay / dissolve
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
    // Fade out during last 5 seconds (dissolving)
    const dissolve = f.age > DECAY_TIME - 5 ? (DECAY_TIME - f.age) / 5 : 1;
    ctx.globalAlpha = clamp(dissolve, 0, 1);

    // Flake shape — irregular little crumb
    ctx.fillStyle = '#c8a050';
    ctx.beginPath();
    ctx.ellipse(sx, sy, f.size, f.size * 0.6, f.wobbleOffset, 0, Math.PI * 2);
    ctx.fill();
    // Darker speck
    ctx.fillStyle = '#a07830';
    ctx.beginPath();
    ctx.arc(sx - f.size * 0.15, sy - f.size * 0.15, f.size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
}

export function drawFoodTop(ctx, f, tankLeft, tankTop, tankW, tankH) {
    const sx = tankLeft + (f.x / 100) * tankW;
    const sy = tankTop + (f.z / 100) * tankH;
    const dissolve = f.age > DECAY_TIME - 5 ? (DECAY_TIME - f.age) / 5 : 1;
    ctx.globalAlpha = clamp(dissolve, 0, 1);

    ctx.fillStyle = '#c8a050';
    ctx.beginPath();
    ctx.ellipse(sx, sy, f.size, f.size * 0.7, f.wobbleOffset * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
}

export function clearAllFood() {
    foods.length = 0;
}

export function loadFoodState(state) {
    foods.length = 0;
}

export function saveFoodState() {
    return [];
}
