// main.js — Entry point, game loop, canvas setup, init

import { Fish, SPECIES_CATALOG, createFry } from './fish.js';
import { getTank, updateChemistry, loadTankState, saveTankState, applyOfflineChemistry, moveDecoration } from './tank.js';
import { getFoods, addFood, updateFood, getUneatenCount, drawFoodSide, drawFoodTop } from './food.js';
import { getProgression, addXP, addCoins, loadProgression, saveProgression, applyOfflineRewards, usePellet, refreshDailyPellets, updateSwishMeter, setOnLevelUp, getCurrentStockInches, getTankCapacity } from './store.js';
import { getViewAngle, setViewAngle, updateOrientation, requestOrientationPermission, initDesktopControls, toggleView, setShowToggleOnMobile, getMobileViewMode, setMobileViewMode } from './orientation.js';
import { updateEffects, drawWaterBackground, drawCaustics, drawBubblesSide, drawBubblesTop, drawTankEdges, addRipple, drawRipples, addBoopEffect, addBreedHeart, drawBoopEffects } from './effects.js';
import { drawDecorationsSide, drawDecorationsTop, HIT_RADII } from './decorations.js';
import { initUI, updateHUD, isDrawerOpen, decodeTankState, updateFloatingTip } from './ui.js';
import { saveGame, loadGame, getOfflineSeconds, shouldAutoSave, initAutoSave, hasSave } from './save.js';
import { initAudio, playBoopSound, loadAudioSettings, saveAudioSettings } from './audio.js';
import { initShadowFish, updateShadowFish, drawShadowFishBehind, drawShadowFishFront, getRainbowGlowActive } from './shadowfish.js';
import { clamp, dist, rand } from './utils.js';

// --- State ---
const canvas = document.getElementById('tank');
const ctx = canvas.getContext('2d');
let fishes = [];
let gameTime = 0;
let lastTime = 0;
let breedTimers = {};
// Easter egg: track rapid boops between same-species live bearers
let easterEggBoops = {}; // { speciesName: { count, firstBoopTime } }
let rainbowBonusApplied = false;

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
let lastInteractionTime = 0;
let longPressTimer = null;
let showFishLabels = false;
let longPressStartX = 0, longPressStartY = 0;
let draggingDeco = null;    // index into tank.decorations, or null
let decoGrabOffset = null;  // { dx, dy } so decoration doesn't snap to finger center
let audioInitialized = false;

canvas.addEventListener('pointerdown', (e) => {
    if (!audioInitialized) {
        initAudio();
        audioInitialized = true;
    }
    if (isDrawerOpen()) return;
    pointerDown = true;
    pointerX = e.clientX;
    pointerY = e.clientY;
    longPressStartX = e.clientX;
    longPressStartY = e.clientY;
    lastInteractionTime = Date.now();

    // Start long-press timer (400ms) — check decorations first, then fish labels
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
        // Check decorations first (works in both views)
        const decos = getTank().decorations;
        const pxPct = ((longPressStartX - tankLeft) / tankW) * 100;
        const pyPct = ((longPressStartY - tankTop) / tankH) * 100;
        for (let i = 0; i < decos.length; i++) {
            const deco = decos[i];
            const hitR = HIT_RADII[deco.id] || 0;
            if (hitR <= 0) continue;
            const ddx = pxPct - deco.x;
            const ddy = pyPct - deco.y;
            if (ddx * ddx + ddy * ddy < hitR * hitR) {
                draggingDeco = i;
                decoGrabOffset = { dx: deco.x - pxPct, dy: deco.y - pyPct };
                return;
            }
        }
        // No decoration hit — show fish labels (side view only)
        if (getViewAngle() <= 0.9) {
            showFishLabels = true;
        }
    }, 400);

    handleTap(e.clientX, e.clientY);
});

canvas.addEventListener('pointermove', (e) => {
    if (!pointerDown) return;
    pointerX = e.clientX;
    pointerY = e.clientY;

    // Dragging a decoration — move it to follow pointer
    if (draggingDeco !== null) {
        const pxPct = ((e.clientX - tankLeft) / tankW) * 100;
        const pyPct = ((e.clientY - tankTop) / tankH) * 100;
        const newX = clamp(pxPct + decoGrabOffset.dx, 2, 98);
        const newY = clamp(pyPct + decoGrabOffset.dy, 2, 98);
        moveDecoration(draggingDeco, newX, newY);
        return;
    }

    // Cancel long-press if finger moves more than 10px
    if (longPressTimer) {
        const dx = e.clientX - longPressStartX;
        const dy = e.clientY - longPressStartY;
        if (dx * dx + dy * dy > 100) { // 10px threshold
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }
});

canvas.addEventListener('pointerup', () => {
    pointerDown = false;
    clearTimeout(longPressTimer);
    longPressTimer = null;
    draggingDeco = null;
    decoGrabOffset = null;
    clearFingerFollow();
});
canvas.addEventListener('pointercancel', () => {
    pointerDown = false;
    clearTimeout(longPressTimer);
    longPressTimer = null;
    draggingDeco = null;
    decoGrabOffset = null;
    clearFingerFollow();
});

function handleTap(px, py) {
    // If labels are showing, tap anywhere dismisses them
    if (showFishLabels) {
        showFishLabels = false;
        clearFingerFollow();
        return;
    }

    const viewAngle = getViewAngle();

    if (viewAngle > 0.9) {
        // Top-down: place food or ripple
        const fx = ((px - tankLeft) / tankW) * 100;
        const fz = ((py - tankTop) / tankH) * 100;
        if (fx > 0 && fx < 100 && fz > 0 && fz < 100) {
            if (usePellet()) {
                addFood(fx, fz);
                addXP(1);
            } else {
                // No food — tap the surface: ripple + slow attract
                addRipple(fx, fz);
                for (const fish of fishes) {
                    if (fish.state === 'eating' || fish.state === 'seeking_food') continue;
                    fish.wanderTarget = { x: fx, y: fish.y, z: fz };
                    fish.state = 'wandering';
                    fish.stateTimer = rand(2, 4);
                }
            }
        }
    } else {
        // Side view: try to boop a fish
        for (const fish of fishes) {
            const sx = tankLeft + (fish.x / 100) * tankW;
            const sy = tankTop + (fish.y / 100) * tankH;
            const size = fish.getSizePixels();
            if (dist(px, py, sx, sy) < size * 1.5) {
                fish.boop();
                lastInteractionTime = Date.now();
                // XP cooldown: 5s per fish
                const now = Date.now();
                if (now - fish.lastBoopXP > 5000) {
                    addXP(1);
                    fish.lastBoopXP = now;

                    // Boop breeding bonus: add 30s if live bearer with a valid pair
                    if (fish.species.liveBearer && !fish.isFry) {
                        const pairCount = fishes.filter(f => f.species.name === fish.species.name && !f.isFry).length;
                        if (pairCount >= 2) {
                            const entry = getBreedEntry(fish.species.name);
                            if (entry) entry.time += 30;
                        }
                    }
                }

                // Easter egg: rapid boops between same-species live bearers
                if (fish.species.liveBearer && !fish.isFry) {
                    const name = fish.species.name;
                    const pairCount = fishes.filter(f => f.species.name === name && !f.isFry).length;
                    if (pairCount >= 2) {
                        const tracker = easterEggBoops[name] || { count: 0, firstBoopTime: 0 };
                        if (now - tracker.firstBoopTime > 10000) {
                            tracker.count = 1;
                            tracker.firstBoopTime = now;
                        } else {
                            tracker.count++;
                        }
                        easterEggBoops[name] = tracker;
                        if (tracker.count >= 10) {
                            spawnFryEasterEgg(name);
                            tracker.count = 0;
                            tracker.firstBoopTime = 0;
                        }
                    }
                }

                addBoopEffect(sx, sy);
                playBoopSound();
                break;
            }
        }
    }
}

// Finger follow for side view
function updateFingerFollow() {
    if (!pointerDown || getViewAngle() > 0.8) return;

    const followRadius = Math.max(150, tankW * 0.2);
    const targetX = ((pointerX - tankLeft) / tankW) * 100;
    const targetY = ((pointerY - tankTop) / tankH) * 100;
    for (const fish of fishes) {
        if (fish.state === 'booped' || fish.state === 'eating' || fish.state === 'seeking_food') continue;
        const sx = tankLeft + (fish.x / 100) * tankW;
        const sy = tankTop + (fish.y / 100) * tankH;
        const d = dist(pointerX, pointerY, sx, sy);
        if (d < followRadius) {
            fish.followTarget = { x: targetX, y: targetY };
            fish.state = 'following';
            fish.stateTimer = 0.5;
        }
    }
}

function clearFingerFollow() {
    for (const fish of fishes) {
        fish.followTarget = null;
        if (fish.state === 'following') {
            fish.state = 'wandering';
            fish.stateTimer = rand(1.5, 3.5);
        }
    }
}

// --- Breeding ---
// breedTimers: { speciesName: { time, pairIds: [id1, id2] } }
function getBreedEntry(speciesName) {
    let entry = breedTimers[speciesName];
    // Migrate old format (plain number) to new format
    if (typeof entry === 'number') {
        entry = { time: entry, pairIds: [] };
        breedTimers[speciesName] = entry;
    }
    return entry;
}

function selectPair(speciesName) {
    const adults = fishes.filter(f => f.species.name === speciesName && !f.isFry);
    const happy = adults.filter(f => f.happiness > 40);
    if (happy.length < 2) return null;
    happy.sort((a, b) => b.happiness - a.happiness);
    return [happy[0].id, happy[1].id];
}

function updateBreeding(dt) {
    const liveBearerSpecies = SPECIES_CATALOG.filter(s => s.liveBearer);
    for (const species of liveBearerSpecies) {
        let entry = getBreedEntry(species.name);
        if (!entry) {
            entry = { time: 0, pairIds: [] };
            breedTimers[species.name] = entry;
        }

        const pairIds = selectPair(species.name);
        if (pairIds) {
            entry.pairIds = pairIds;
            entry.time += dt;
        } else {
            entry.time = 0;
            entry.pairIds = [];
        }

        if (entry.time >= 3600) {
            const frySizeInches = species.sizeInches * 0.2;
            if (getCurrentStockInches(fishes) + frySizeInches <= getTankCapacity()) {
                const fry = createFry(species);
                fishes.push(fry);
                showFryToast(species.name);
                entry.time = 0;
            } else {
                entry.time = 600; // cap, ready when room opens
            }
        }
    }
}

// Spawn hearts between bonded pairs when they swim near each other
let breedHeartCooldown = 0;
function updateBreedHearts(dt) {
    breedHeartCooldown -= dt;
    if (breedHeartCooldown > 0) return;

    for (const speciesName in breedTimers) {
        const entry = breedTimers[speciesName];
        if (!entry || typeof entry === 'number' || entry.pairIds.length < 2) continue;
        if (entry.time <= 0) continue;

        const fish1 = fishes.find(f => f.id === entry.pairIds[0]);
        const fish2 = fishes.find(f => f.id === entry.pairIds[1]);
        if (!fish1 || !fish2) continue;

        const d = dist(fish1.x, fish1.y, fish2.x, fish2.y);
        if (d > 20) continue;

        // Heart probability increases as breed timer progresses
        const progress = Math.min(entry.time / 3600, 1);
        const chance = 0.15 + progress * 0.35; // 15% to 50%
        if (Math.random() > chance) continue;

        // Spawn heart at midpoint between the pair
        const mx = (fish1.x + fish2.x) / 2;
        const my = (fish1.y + fish2.y) / 2;
        const sx = tankLeft + (mx / 100) * tankW;
        const sy = tankTop + (my / 100) * tankH;
        addBreedHeart(sx, sy);
        breedHeartCooldown = 0.8; // Minimum gap between hearts
        break; // One heart per tick at most
    }
}

export function getBreedTimers() {
    return breedTimers;
}

function spawnFryEasterEgg(speciesName) {
    const species = SPECIES_CATALOG.find(s => s.name === speciesName);
    if (!species) return;
    const frySizeInches = species.sizeInches * 0.2;
    if (getCurrentStockInches(fishes) + frySizeInches <= getTankCapacity()) {
        const fry = createFry(species);
        fishes.push(fry);
        showFryToast(species.name);
        const entry = getBreedEntry(speciesName);
        if (entry) entry.time = 0;
    }
}

function showFryToast(speciesName) {
    const toast = document.createElement('div');
    toast.className = 'fry-toast';
    toast.textContent = `A ${speciesName} fry was born!`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fry-toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 2500);
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

    // Swish meter (coin generation)
    const totalHappiness = fishes.reduce((s, f) => s + f.happiness, 0);
    const interacting = (Date.now() - lastInteractionTime) < 3000;
    updateSwishMeter(dt, totalHappiness, interacting);

    // Shadow fish easter egg
    updateShadowFish(dt);

    // Rainbow bonus: one-time reward when rainbow glow activates
    if (getRainbowGlowActive() && !rainbowBonusApplied) {
        rainbowBonusApplied = true;
        // Max happiness, full strength, sate hunger for all fish
        for (const fish of fishes) {
            fish.happiness = 100;
            fish.strength = 100;
            fish.hunger = clamp(fish.hunger - 40, 0, 100);
        }
        // Bonus rewards
        addCoins(25);
        addXP(50);
    }

    // Breeding
    updateBreeding(dt);
    updateBreedHearts(dt);

    // Auto-save
    if (shouldAutoSave()) {
        saveGame(getSaveState());
    }

    // HUD update (throttled to ~4 fps)
    if (Math.floor(gameTime * 4) !== Math.floor((gameTime - dt) * 4)) {
        updateHUD();
    }

    // Floating tips
    updateFloatingTip(dt);
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

    const isTopDown = viewAngle > 0.9;

    // Decorations (behind fish and food)
    if (isTopDown) {
        drawDecorationsTop(ctx, tankLeft, tankTop, tankW, tankH, gameTime);
    } else {
        drawDecorationsSide(ctx, tankLeft, tankTop, tankW, tankH, gameTime);
    }

    // Food
    const foods = getFoods();
    if (isTopDown) {
        for (const f of foods) drawFoodTop(ctx, f, tankLeft, tankTop, tankW, tankH);
    } else {
        for (const f of foods) drawFoodSide(ctx, f, tankLeft, tankTop, tankW, tankH);
    }

    // Shadow fish (behind)
    drawShadowFishBehind(ctx, tankLeft, tankTop, tankW, tankH, viewAngle, gameTime);

    // Fish
    if (isTopDown) {
        for (const fish of fishes) fish.drawTop(ctx, tankLeft, tankTop, tankW, tankH, gameTime);
    } else {
        for (const fish of fishes) fish.drawSide(ctx, tankLeft, tankTop, tankW, tankH, gameTime);
    }

    // Shadow fish (front — rainbow reveal)
    drawShadowFishFront(ctx, tankLeft, tankTop, tankW, tankH, viewAngle, gameTime);

    // Bubbles
    if (isTopDown) {
        drawBubblesTop(ctx, tankLeft, tankTop, tankW, tankH);
        drawRipples(ctx, tankLeft, tankTop, tankW, tankH);
    } else {
        drawBubblesSide(ctx, tankLeft, tankTop, tankW, tankH);
    }

    // Boop sparkles
    drawBoopEffects(ctx, TICK);

    // Fish info labels (long-press)
    if (showFishLabels && !isTopDown) {
        drawFishLabels(ctx);
    }
}

function drawFishLabels(ctx) {
    for (const fish of fishes) {
        const sx = tankLeft + (fish.x / 100) * tankW;
        const sy = tankTop + (fish.y / 100) * tankH;
        const size = fish.getSizePixels();

        const labelX = sx;
        const labelY = sy - size - 12;

        // Background
        const name = fish.displayName();
        ctx.font = '600 11px -apple-system, sans-serif';
        const textW = ctx.measureText(name).width;
        const boxW = Math.max(textW + 16, 70);
        const boxH = 36;

        ctx.fillStyle = 'rgba(10, 22, 40, 0.85)';
        ctx.beginPath();
        const rx = labelX - boxW / 2, ry = labelY - boxH;
        if (ctx.roundRect) {
            ctx.roundRect(rx, ry, boxW, boxH, 6);
        } else {
            ctx.rect(rx, ry, boxW, boxH);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Name
        ctx.fillStyle = '#d0e4f0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(name, labelX, labelY - boxH + 5);

        // Mini happiness bar
        const barY = labelY - boxH + 20;
        const barW = boxW - 12;
        const barX = labelX - barW / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(barX, barY, barW, 4);
        const hColor = fish.happiness > 60 ? '#4caf50' : fish.happiness > 30 ? '#f9a825' : '#ef5350';
        ctx.fillStyle = hColor;
        ctx.fillRect(barX, barY, barW * (fish.happiness / 100), 4);

        // Mood text
        const mood = fish.happiness > 70 ? 'Happy' : fish.happiness > 40 ? 'OK' : fish.happiness > 20 ? 'Stressed' : 'Sad';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(176,200,224,0.6)';
        ctx.fillText(mood, labelX, barY + 6);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
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
        breedTimers: { ...breedTimers },
        settings: {
            freeFeed: getTank().freeFeed,
            showViewToggle: document.getElementById('toggle-show-view')?.checked ?? true,
            highContrast: document.body.classList.contains('high-contrast'),
            mobileViewMode: getMobileViewMode(),
            viewAngle: Math.round(getViewAngle()),
            audio: saveAudioSettings(),
        },
    };
}

// --- Add fish ---
function addFishToTank(species, name) {
    const fish = new Fish(species, undefined, undefined, undefined, name);
    fishes.push(fish);
}

// --- Init ---
function init() {
    // Load saved game
    const saved = loadGame();
    if (saved) {
        loadTankState(saved.tank);
        loadProgression(saved.progression);
        if (saved.breedTimers) breedTimers = { ...saved.breedTimers };

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
            const totalHappiness = fishes.reduce((s, f) => s + f.happiness, 0);
            applyOfflineRewards(offlineSec, fishes.length, totalHappiness);
            // Apply hunger
            for (const fish of fishes) {
                fish.hunger = clamp(fish.hunger + offlineSec * 0.5, 0, 100);
                fish.strength = clamp(fish.strength - offlineSec * 0.02, 0, 100);
            }
        }

        // Daily pellet refresh
        refreshDailyPellets();

        if (saved.settings) {
            if (saved.settings.audio) loadAudioSettings(saved.settings.audio);
            getTank().freeFeed = saved.settings.freeFeed ?? false;
            const showToggle = saved.settings.showViewToggle ?? true;
            setShowToggleOnMobile(showToggle);
            if (saved.settings.highContrast) {
                document.body.classList.add('high-contrast');
            }
            if (saved.settings.viewAngle !== undefined) {
                setViewAngle(saved.settings.viewAngle);
            }
            if (saved.settings.mobileViewMode) {
                setMobileViewMode(saved.settings.mobileViewMode);
            }
        }
    }

    // If no fish, give starter fish
    if (fishes.length === 0) {
        const tetra = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
        const guppy = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        addFishToTank(tetra);
        addFishToTank(guppy);
    }

    // Level-up happiness boost
    setOnLevelUp((newLevel, oldLevel) => {
        for (const fish of fishes) {
            fish.happiness = clamp(fish.happiness + 20, 0, 100);
            fish.strength = clamp(fish.strength + 10, 0, 100);
        }
    });

    // Init UI
    initUI(fishes, addFishToTank, getSaveState, getBreedTimers);

    // Init auto-save
    initAutoSave(getSaveState);

    // Shadow fish easter egg
    initShadowFish();

    // Desktop controls
    initDesktopControls();
    document.getElementById('view-toggle-btn').addEventListener('click', toggleView);
    document.getElementById('view-toggle-btn').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleView();
        }
    });

    // Start game loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    updateHUD();
}

// --- Check for shared tank link ---
const sharedParam = new URLSearchParams(window.location.search).get('s');
let sharedHandled = false;
if (sharedParam) {
    const sharedState = decodeTankState(sharedParam);
    if (sharedState) {
        sharedHandled = true;
        const overlay = document.getElementById('start-overlay');
        const content = overlay.querySelector('.start-content');
        const fishList = sharedState.fish.map(s => s.name).join(', ');
        content.innerHTML = `
            <h1>Shared Aquarium</h1>
            <p>Level ${sharedState.level} tank with ${sharedState.fish.length} fish</p>
            <p style="font-size:0.8rem;opacity:0.6;margin-bottom:1rem">${fishList}</p>
            <button id="start-btn" style="padding:0.8rem 2rem;font-size:1.1rem;border:2px solid #4a9eff;background:rgba(74,158,255,0.15);color:#4a9eff;border-radius:2rem;cursor:pointer">Play Now!</button>
        `;
        overlay.classList.remove('hidden');
        document.getElementById('start-btn').addEventListener('click', () => {
            window.history.replaceState({}, '', window.location.pathname);
            overlay.classList.add('hidden');
            init();
        });
    }
}

// --- Start: skip overlay for returning players ---
if (!sharedHandled) {
    if (hasSave()) {
        // Returning player — go straight into game
        requestOrientationPermission().then(() => init());
    } else {
        // First time — show start overlay
        document.getElementById('start-overlay').classList.remove('hidden');
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
    }
}
