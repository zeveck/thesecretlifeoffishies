// shadowfish.js — Shadow Fish Easter Egg
// A mysterious large fish appears in the background after 60s, returning every 60s
// slightly closer, until at 5 minutes it swims across the foreground as a rainbow fish.

import { playShadowNotes, playRevealStinger } from './audio.js';

// --- Constants ---
const INTERVAL = 60; // seconds between appearances
const SWIM_DURATION = 4.5; // seconds to cross screen
const STAGES = [
    { opacity: 0.05, scale: 1.8 },
    { opacity: 0.12, scale: 2.2 },
    { opacity: 0.20, scale: 2.7 },
    { opacity: 0.35, scale: 3.5 },
    { opacity: 1.0,  scale: 4.0 }, // rainbow reveal
];

// --- State ---
let elapsedTime = 0;
let appearanceCount = 0;
let swimProgress = -1; // -1 = idle, 0..1 = crossing
let swimDirection = 1; // 1 = left-to-right, -1 = right-to-left
let rainbowGlowActive = false;

function resetShadowFish() {
    elapsedTime = 0;
    appearanceCount = 0;
    swimProgress = -1;
    swimDirection = 1;
    rainbowGlowActive = false;
}

// --- Exports ---

export function initShadowFish() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) resetShadowFish();
    });
}

export function updateShadowFish(dt) {
    if (rainbowGlowActive) return;

    elapsedTime += dt;

    if (swimProgress >= 0) {
        // Advancing a swim
        swimProgress += dt / SWIM_DURATION;
        if (swimProgress >= 1) {
            swimProgress = -1;
            if (appearanceCount >= 5) {
                rainbowGlowActive = true;
            }
        }
    } else {
        // Check if it's time for the next appearance
        if (appearanceCount < 5 && elapsedTime >= (appearanceCount + 1) * INTERVAL) {
            swimProgress = 0;
            appearanceCount++;
            swimDirection *= -1;
            if (appearanceCount < 5) {
                playShadowNotes();
            } else {
                playRevealStinger();
            }
        }
    }
}

export function drawShadowFishBehind(ctx, tankLeft, tankTop, tankW, tankH, viewAngle, gameTime) {
    if (swimProgress < 0 || appearanceCount >= 5) return;
    const stageIdx = appearanceCount - 1;
    drawShadowFishShape(ctx, tankLeft, tankTop, tankW, tankH, viewAngle, gameTime, stageIdx);
}

export function drawShadowFishFront(ctx, tankLeft, tankTop, tankW, tankH, viewAngle, gameTime) {
    if (swimProgress < 0 || appearanceCount < 5) return;
    drawShadowFishShape(ctx, tankLeft, tankTop, tankW, tankH, viewAngle, gameTime, 4);
}

export function getRainbowGlowActive() {
    return rainbowGlowActive;
}

export function getRainbowHue(gameTime, fishId) {
    return ((gameTime * 60) + (fishId * 47)) % 360;
}

// --- Easing ---
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// --- Drawing ---
function drawShadowFishShape(ctx, tankLeft, tankTop, tankW, tankH, viewAngle, gameTime, stageIdx) {
    const stage = STAGES[stageIdx];
    const isRainbow = stageIdx === 4;
    const isTopDown = viewAngle > 0.9;
    const baseSize = 30; // base fish size in pixels
    const fishSize = baseSize * stage.scale;

    // X position: swim across with easing
    const eased = easeInOutCubic(swimProgress);
    const margin = fishSize * 2;
    const startX = swimDirection > 0 ? tankLeft - margin : tankLeft + tankW + margin;
    const endX = swimDirection > 0 ? tankLeft + tankW + margin : tankLeft - margin;
    const cx = startX + (endX - startX) * eased;

    // Y position: ~50% with gentle sine undulation
    const baseY = tankTop + tankH * 0.5;
    const cy = baseY + Math.sin(gameTime * 0.8 + swimProgress * Math.PI * 2) * tankH * 0.05;

    ctx.save();

    if (isRainbow) {
        // Rainbow gradient fill
        const grad = ctx.createLinearGradient(cx - fishSize * 1.5, cy, cx + fishSize * 1.5, cy);
        const offset = (gameTime * 0.3) % 1;
        const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#4400ff', '#8800ff'];
        for (let i = 0; i < colors.length; i++) {
            grad.addColorStop(((i / (colors.length - 1)) + offset) % 1, colors[i]);
        }
        // Add wrap-around stop
        grad.addColorStop(0, colors[Math.floor(offset * (colors.length - 1)) % colors.length]);
        ctx.fillStyle = grad;
        ctx.globalAlpha = stage.opacity;
        ctx.shadowColor = `hsl(${(gameTime * 60) % 360}, 100%, 60%)`;
        ctx.shadowBlur = fishSize * 0.8;
    } else {
        ctx.fillStyle = '#0a1520';
        ctx.globalAlpha = stage.opacity;
    }

    ctx.translate(cx, cy);
    if (swimDirection < 0) ctx.scale(-1, 1);

    if (isTopDown) {
        drawShadowTeardrop(ctx, fishSize, gameTime);
    } else {
        drawShadowProfile(ctx, fishSize, gameTime);
    }

    ctx.restore();
}

function drawShadowProfile(ctx, size, gameTime) {
    const bodyW = size * 1.5;
    const bodyH = size * 0.5;
    const tailWag = Math.sin(gameTime * 2) * 0.2;

    // Body ellipse
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyW, bodyH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Forked tail with slow wag
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.7, 0);
    ctx.bezierCurveTo(-bodyW * 1.0, -bodyH * 0.9 + tailWag * bodyH,
                      -bodyW * 1.4, -bodyH * 0.7 + tailWag * bodyH,
                      -bodyW * 1.2, -bodyH * 0.1 + tailWag * bodyH * 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.7, 0);
    ctx.bezierCurveTo(-bodyW * 1.0, bodyH * 0.9 + tailWag * bodyH,
                      -bodyW * 1.4, bodyH * 0.7 + tailWag * bodyH,
                      -bodyW * 1.2, bodyH * 0.1 + tailWag * bodyH * 0.5);
    ctx.fill();

    // Dorsal fin
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.1, -bodyH * 0.9);
    ctx.bezierCurveTo(bodyW * 0.05, -bodyH * 1.6, bodyW * 0.3, -bodyH * 1.4, bodyW * 0.2, -bodyH * 0.85);
    ctx.fill();
}

function drawShadowTeardrop(ctx, size, gameTime) {
    const bodyLen = size * 1.5;
    const bodyW = size * 0.4;
    const tailWag = Math.sin(gameTime * 2) * 0.2;

    // Teardrop body
    ctx.beginPath();
    ctx.moveTo(0, -bodyLen * 0.6);
    ctx.bezierCurveTo(bodyW * 1.2, -bodyLen * 0.2,
                      bodyW * 1.0, bodyLen * 0.3,
                      0, bodyLen * 0.7);
    ctx.bezierCurveTo(-bodyW * 1.0, bodyLen * 0.3,
                      -bodyW * 1.2, -bodyLen * 0.2,
                      0, -bodyLen * 0.6);
    ctx.fill();

    // Tail
    ctx.beginPath();
    ctx.moveTo(0, bodyLen * 0.6);
    ctx.bezierCurveTo(-bodyW * 1.2 + tailWag * bodyW * 2, bodyLen * 1.0,
                      -bodyW * 0.8 + tailWag * bodyW * 2, bodyLen * 1.3,
                      tailWag * bodyW, bodyLen * 1.1);
    ctx.bezierCurveTo(bodyW * 0.8 + tailWag * bodyW * 2, bodyLen * 1.3,
                      bodyW * 1.2 + tailWag * bodyW * 2, bodyLen * 1.0,
                      0, bodyLen * 0.6);
    ctx.fill();
}
