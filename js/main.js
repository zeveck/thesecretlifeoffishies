// main.js — Entry point, game loop, canvas setup, init

import { Fish, SPECIES_CATALOG } from './fish.js';
import { getTank, updateChemistry, loadTankState, saveTankState, applyOfflineChemistry } from './tank.js';
import { getFoods, addFood, updateFood, getUneatenCount, drawFoodSide, drawFoodTop } from './food.js';
import { getProgression, addXP, passiveXPTick, loadProgression, saveProgression, applyOfflineXP } from './store.js';
import { getViewAngle, updateOrientation, requestOrientationPermission, initDesktopControls } from './orientation.js';
import { updateEffects, drawWaterBackground, drawCaustics, drawBubblesSide, drawBubblesTop, drawTankEdges } from './effects.js';
import { initUI, updateHUD, isDrawerOpen } from './ui.js';
import { saveGame, loadGame, getOfflineSeconds, shouldAutoSave, initAutoSave } from './save.js';
import { clamp, dist } from './utils.js';

// --- State ---
const canvas = document.getElementById('tank');
const ctx = canvas.getContext('2d');
let fishes = [];
let gameTime = 0;
let lastTime = 0;

// Tank display bounds (in pixels)
let tankLeft, tankTop, tankW, tankH;

// --- Canvas sizing ---
function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const margin = 10;
    tankLeft = margin;
    tankTop = margin;
    tankW = window.innerWidth - margin * 2;
    tankH = window.innerHeight - margin * 2;
}
window.addEventListener('resize', resize);
resize();

// --- Pointer interactions ---
let pointerDown = false;
let pointerX = 0, pointerY = 0;

canvas.addEventListener('pointerdown', (e) => {
    if (isDrawerOpen()) return;
    pointerDown = true;
    pointerX = e.clientX;
    pointerY = e.clientY;
    handleTap(e.clientX, e.clientY);
});

canvas.addEventListener('pointermove', (e) => {
    if (!pointerDown) return;
    pointerX = e.clientX;
    pointerY = e.clientY;
});

canvas.addEventListener('pointerup', () => { pointerDown = false; });
canvas.addEventListener('pointercancel', () => { pointerDown = false; });

function handleTap(px, py) {
    const viewAngle = getViewAngle();

    if (viewAngle > 0.5) {
        // Top-down: place food
        const fx = ((px - tankLeft) / tankW) * 100;
        const fz = ((py - tankTop) / tankH) * 100;
        if (fx > 0 && fx < 100 && fz > 0 && fz < 100) {
            addFood(fx, fz, tankW, tankH, 100);
        }
    } else {
        // Side view: try to boop a fish
        for (const fish of fishes) {
            const sx = tankLeft + (fish.x / 100) * tankW;
            const sy = tankTop + (fish.y / 100) * tankH;
            const size = fish.getSizePixels();
            if (dist(px, py, sx, sy) < size * 1.5) {
                fish.boop();
                // XP cooldown: 5s per fish
                const now = Date.now();
                if (now - fish.lastBoopXP > 5000) {
                    addXP(1);
                    fish.lastBoopXP = now;
                }
                break;
            }
        }
    }
}

// Finger follow for side view
function updateFingerFollow() {
    if (!pointerDown || getViewAngle() > 0.5) return;

    for (const fish of fishes) {
        if (fish.state === 'booped') continue;
        const sx = tankLeft + (fish.x / 100) * tankW;
        const sy = tankTop + (fish.y / 100) * tankH;
        const d = dist(pointerX, pointerY, sx, sy);
        if (d < 100) {
            // Fish follows finger
            const targetX = ((pointerX - tankLeft) / tankW) * 100;
            const targetY = ((pointerY - tankTop) / tankH) * 100;
            fish.wanderTarget = { x: targetX, y: targetY, z: fish.z };
            fish.state = 'wandering';
            fish.stateTimer = 0.5;
        }
    }
}

// --- Game loop ---
function update(dt) {
    gameTime += dt;

    updateOrientation();
    updateEffects(dt);
    updateFood(dt, 92); // floor at 92% of tank height
    updateFingerFollow();

    // Fish update
    const totalInches = fishes.reduce((sum, f) => sum + f.currentSize, 0);
    updateChemistry(dt, totalInches, getUneatenCount());

    for (let i = fishes.length - 1; i >= 0; i--) {
        const alive = fishes[i].update(dt);
        if (!alive) {
            fishes.splice(i, 1);
        }
    }

    // Passive XP
    passiveXPTick(fishes.length);

    // Auto-save
    if (shouldAutoSave()) {
        saveGame(getSaveState());
    }

    // HUD update (throttled to ~4 fps)
    if (Math.floor(gameTime * 4) !== Math.floor((gameTime - dt) * 4)) {
        updateHUD();
    }
}

function render() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const viewAngle = getViewAngle();

    ctx.clearRect(0, 0, w, h);

    // Water background
    drawWaterBackground(ctx, w, h, viewAngle);

    // Caustics
    drawCaustics(ctx, w, h, viewAngle, gameTime);

    // Tank edges
    drawTankEdges(ctx, tankLeft, tankTop, tankW, tankH, viewAngle);

    // Food
    const foods = getFoods();
    if (viewAngle < 0.3) {
        for (const f of foods) drawFoodSide(ctx, f, tankLeft, tankTop, tankW, tankH);
    } else if (viewAngle > 0.7) {
        for (const f of foods) drawFoodTop(ctx, f, tankLeft, tankTop, tankW, tankH);
    } else {
        // Crossfade zone
        const sideAlpha = 1 - (viewAngle - 0.3) / 0.4;
        const topAlpha = (viewAngle - 0.3) / 0.4;
        ctx.globalAlpha = sideAlpha;
        for (const f of foods) drawFoodSide(ctx, f, tankLeft, tankTop, tankW, tankH);
        ctx.globalAlpha = topAlpha;
        for (const f of foods) drawFoodTop(ctx, f, tankLeft, tankTop, tankW, tankH);
        ctx.globalAlpha = 1;
    }

    // Fish
    if (viewAngle < 0.3) {
        for (const fish of fishes) fish.drawSide(ctx, tankLeft, tankTop, tankW, tankH);
    } else if (viewAngle > 0.7) {
        for (const fish of fishes) fish.drawTop(ctx, tankLeft, tankTop, tankW, tankH);
    } else {
        // Crossfade
        const sideAlpha = 1 - (viewAngle - 0.3) / 0.4;
        const topAlpha = (viewAngle - 0.3) / 0.4;
        ctx.globalAlpha = sideAlpha;
        for (const fish of fishes) fish.drawSide(ctx, tankLeft, tankTop, tankW, tankH);
        ctx.globalAlpha = topAlpha;
        for (const fish of fishes) fish.drawTop(ctx, tankLeft, tankTop, tankW, tankH);
        ctx.globalAlpha = 1;
    }

    // Bubbles
    if (viewAngle < 0.5) {
        drawBubblesSide(ctx, tankLeft, tankTop, tankW, tankH);
    } else {
        drawBubblesTop(ctx, tankLeft, tankTop, tankW, tankH);
    }
}

// Fixed timestep update, variable render
const TICK = 1 / 60;
let accumulator = 0;

function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;
    accumulator += dt;

    while (accumulator >= TICK) {
        update(TICK);
        accumulator -= TICK;
    }

    render();
    requestAnimationFrame(gameLoop);
}

// --- Save state ---
function getSaveState() {
    return {
        fish: fishes.map(f => f.serialize()),
        tank: saveTankState(),
        progression: saveProgression(),
        settings: { freeFeed: getTank().freeFeed },
    };
}

// --- Add fish ---
function addFishToTank(species) {
    const fish = new Fish(species);
    fishes.push(fish);
}

// --- Init ---
function init() {
    // Load saved game
    const saved = loadGame();
    if (saved) {
        loadTankState(saved.tank);
        loadProgression(saved.progression);

        if (saved.fish && saved.fish.length > 0) {
            for (const fd of saved.fish) {
                const fish = Fish.deserialize(fd);
                if (fish) fishes.push(fish);
            }
        }

        // Offline catch-up
        const offlineSec = getOfflineSeconds();
        if (offlineSec > 60) {
            const totalInches = fishes.reduce((s, f) => s + f.currentSize, 0);
            applyOfflineChemistry(offlineSec, totalInches);
            applyOfflineXP(offlineSec, fishes.length);
            // Apply hunger
            for (const fish of fishes) {
                fish.hunger = clamp(fish.hunger + offlineSec * 0.5, 0, 100);
                fish.strength = clamp(fish.strength - offlineSec * 0.02, 0, 100);
            }
        }

        if (saved.settings) {
            getTank().freeFeed = saved.settings.freeFeed ?? false;
        }
    }

    // If no fish, give starter fish
    if (fishes.length === 0) {
        const tetra = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
        const guppy = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        addFishToTank(tetra);
        addFishToTank(guppy);
    }

    // Init UI
    initUI(fishes, addFishToTank);

    // Init auto-save
    initAutoSave(getSaveState);

    // Desktop controls
    initDesktopControls();

    // Start game loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    updateHUD();
}

// --- Start button (for orientation permission) ---
document.getElementById('start-btn').addEventListener('click', async () => {
    await requestOrientationPermission();
    document.getElementById('start-overlay').classList.add('hidden');
    init();
});

// Also allow starting with any key on desktop
document.addEventListener('keydown', function startOnKey(e) {
    if (!document.getElementById('start-overlay').classList.contains('hidden')) {
        document.getElementById('start-overlay').classList.add('hidden');
        init();
        document.removeEventListener('keydown', startOnKey);
    }
});
