// decorations.js — Procedural decoration rendering (side + top views)

import { getTank, hasDecoration } from './tank.js';

// Fixed positions for decorations (tank-percentage coordinates)
const POSITIONS = {
    java_fern:      { x: 15, y: 92 },
    castle:         { x: 78, y: 88 },
    coral:          { x: 50, y: 90 },
    driftwood:      { x: 32, y: 93 },
    led_lights:     { x: 50, y: 8  },  // top of tank
    treasure_chest: { x: 65, y: 92 },
    rock_arch:      { x: 42, y: 90 },
};

// --- Side View ---

export function drawDecorationsSide(ctx, tl, tt, tw, th, time) {
    const owned = getTank().decorations;
    for (const id of owned) {
        const pos = POSITIONS[id];
        if (!pos) continue;
        const cx = tl + (pos.x / 100) * tw;
        const cy = tt + (pos.y / 100) * th;
        switch (id) {
            case 'java_fern':      drawFernSide(ctx, cx, cy, tw, th, time); break;
            case 'castle':         drawCastleSide(ctx, cx, cy, tw, th, time); break;
            case 'coral':          drawCoralSide(ctx, cx, cy, tw, th, time); break;
            case 'driftwood':      drawDriftwoodSide(ctx, cx, cy, tw, th, time); break;
            case 'led_lights':     drawLEDSide(ctx, tl, tt, tw, th, time); break;
            case 'treasure_chest': drawChestSide(ctx, cx, cy, tw, th, time); break;
            case 'rock_arch':      drawArchSide(ctx, cx, cy, tw, th, time); break;
        }
    }
}

// --- Top View ---

export function drawDecorationsTop(ctx, tl, tt, tw, th, time) {
    const owned = getTank().decorations;
    for (const id of owned) {
        const pos = POSITIONS[id];
        if (!pos) continue;
        const cx = tl + (pos.x / 100) * tw;
        const cy = tt + (pos.y / 100) * th;
        switch (id) {
            case 'java_fern':      drawFernTop(ctx, cx, cy, tw, th, time); break;
            case 'castle':         drawCastleTop(ctx, cx, cy, tw, th); break;
            case 'coral':          drawCoralTop(ctx, cx, cy, tw, th, time); break;
            case 'driftwood':      drawDriftwoodTop(ctx, cx, cy, tw, th); break;
            case 'led_lights':     drawLEDTop(ctx, tl, tt, tw, th, time); break;
            case 'treasure_chest': drawChestTop(ctx, cx, cy, tw, th); break;
            case 'rock_arch':      drawArchTop(ctx, cx, cy, tw, th); break;
        }
    }
}

// ========================
// JAVA FERN
// ========================

function drawFernSide(ctx, cx, cy, tw, th, time) {
    const baseW = tw * 0.03;
    const leafH = th * 0.16;

    // Root clump
    ctx.fillStyle = '#5a4a2a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, baseW * 0.8, baseW * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // 5 fronds
    const colors = ['#357828', '#3a7a2a', '#4a8a3a', '#3e8030', '#4a9438'];
    const angles = [-0.45, -0.18, 0.05, 0.22, 0.45];
    for (let i = 0; i < 5; i++) {
        const sway = Math.sin(time * 1.2 + i * 1.3) * 0.05;
        const a = angles[i] + sway;
        const tipX = cx + Math.sin(a) * baseW * 3;
        const tipY = cy - leafH * (0.7 + i * 0.05);

        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.moveTo(cx - 1, cy);
        ctx.bezierCurveTo(
            cx + Math.sin(a) * baseW, cy - leafH * 0.4,
            tipX - 3, tipY + leafH * 0.1, tipX, tipY
        );
        ctx.bezierCurveTo(
            tipX + 3, tipY + leafH * 0.1,
            cx + Math.sin(a) * baseW + 4, cy - leafH * 0.3,
            cx + 1, cy
        );
        ctx.fill();
    }

    // Center vein highlight
    ctx.strokeStyle = 'rgba(120, 200, 80, 0.25)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cx, cy - leafH * 0.4, cx + 2, cy - leafH * 0.6, cx + 2, cy - leafH * 0.7);
    ctx.stroke();
}

function drawFernTop(ctx, cx, cy, tw, th, time) {
    // Rosette of 6 small leaf ellipses
    ctx.fillStyle = '#4a8a3a';
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + Math.sin(time * 0.8 + i) * 0.05;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(tw * 0.015, 0, tw * 0.018, tw * 0.006, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    // Center dot
    ctx.fillStyle = '#5a4a2a';
    ctx.beginPath();
    ctx.arc(cx, cy, tw * 0.005, 0, Math.PI * 2);
    ctx.fill();
}

// ========================
// CASTLE RUIN
// ========================

function drawCastleSide(ctx, cx, cy, tw, th, time) {
    const w = tw * 0.065;
    const h = th * 0.15;

    // Stone gradient
    const grad = ctx.createLinearGradient(cx, cy - h, cx, cy);
    grad.addColorStop(0, '#9a8a6a');
    grad.addColorStop(1, '#6a5a3a');

    // Main wall
    ctx.fillStyle = grad;
    ctx.fillRect(cx - w * 0.4, cy - h * 0.6, w * 0.8, h * 0.6);

    // Left tower (taller)
    ctx.fillStyle = '#8a7a5a';
    ctx.fillRect(cx - w * 0.5, cy - h, w * 0.25, h);

    // Right tower (shorter, ruined)
    ctx.fillRect(cx + w * 0.25, cy - h * 0.72, w * 0.25, h * 0.72);

    // Crenellations left
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(cx - w * 0.5 + i * w * 0.09, cy - h - w * 0.05, w * 0.05, w * 0.05);
    }
    // Crenellations right (broken)
    ctx.fillRect(cx + w * 0.27, cy - h * 0.72 - w * 0.05, w * 0.05, w * 0.05);
    ctx.fillRect(cx + w * 0.4, cy - h * 0.72 - w * 0.025, w * 0.05, w * 0.025);

    // Arched doorway
    ctx.fillStyle = '#1a1a2a';
    const dw = w * 0.14, dh = h * 0.22;
    ctx.fillRect(cx - dw / 2, cy - dh, dw, dh);
    ctx.beginPath();
    ctx.arc(cx, cy - dh, dw / 2, Math.PI, 0);
    ctx.fill();

    // Window slit
    ctx.fillStyle = '#1a2a3a';
    ctx.beginPath();
    ctx.arc(cx - w * 0.37, cy - h * 0.7, w * 0.035, 0, Math.PI * 2);
    ctx.fill();

    // Stone texture lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r < 4; r++) {
        const ly = cy - h * 0.12 - r * h * 0.13;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.38, ly);
        ctx.lineTo(cx + w * 0.38, ly);
        ctx.stroke();
    }

    // Moss patches
    ctx.fillStyle = 'rgba(60, 120, 40, 0.35)';
    ctx.beginPath(); ctx.arc(cx - w * 0.28, cy, w * 0.05, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + w * 0.15, cy - 2, w * 0.035, Math.PI, 0); ctx.fill();
}

function drawCastleTop(ctx, cx, cy, tw, th) {
    // Rectangular footprint with two tower squares
    ctx.fillStyle = '#8a7a5a';
    ctx.fillRect(cx - tw * 0.015, cy - th * 0.012, tw * 0.03, th * 0.024);
    ctx.fillStyle = '#7a6a4a';
    ctx.fillRect(cx - tw * 0.02, cy - th * 0.015, tw * 0.01, th * 0.01);
    ctx.fillRect(cx + tw * 0.01, cy + th * 0.003, tw * 0.009, th * 0.009);
    // Dark doorway
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath();
    ctx.arc(cx, cy, tw * 0.004, 0, Math.PI * 2);
    ctx.fill();
}

// ========================
// CORAL REEF
// ========================

function drawCoralSide(ctx, cx, cy, tw, th, time) {
    ctx.save();
    const s = tw * 0.001;

    // Base rock
    ctx.fillStyle = '#4a3a3a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 28, s * 9, 0, Math.PI, 0);
    ctx.fill();

    // Branching coral
    function branch(x, y, angle, len, thick, color, depth) {
        if (depth <= 0 || len < 3) return;
        const sway = Math.sin(time * 0.8 + x * 0.05) * 0.025 * depth;
        const ex = x + Math.sin(angle + sway) * len;
        const ey = y - Math.cos(angle + sway) * len;

        ctx.strokeStyle = color;
        ctx.lineWidth = thick;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();

        // Rounded tip
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(ex, ey, thick * 0.55, 0, Math.PI * 2); ctx.fill();

        branch(ex, ey, angle - 0.5, len * 0.62, thick * 0.7, color, depth - 1);
        branch(ex, ey, angle + 0.4, len * 0.58, thick * 0.65, color, depth - 1);
    }

    branch(cx - s * 10, cy, -0.3, s * 26, s * 3.2, '#e07060', 4);
    branch(cx + s * 5,  cy,  0.1, s * 30, s * 2.8, '#e8906a', 4);
    branch(cx + s * 16, cy,  0.2, s * 20, s * 2.2, '#f0a088', 3);

    // Tube coral at base
    for (let i = 0; i < 4; i++) {
        const tx = cx - s * 7 + i * s * 5;
        const tubH = s * (5 + Math.sin(i * 2.1) * 2.5);
        ctx.fillStyle = '#cc5858';
        ctx.beginPath();
        ctx.ellipse(tx, cy - tubH / 2, s * 1.8, tubH / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Light tip
        ctx.fillStyle = '#ff9090';
        ctx.beginPath(); ctx.arc(tx, cy - tubH, s * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

function drawCoralTop(ctx, cx, cy, tw, th, time) {
    // Cluster of colored circles
    const colors = ['#e07060', '#e8906a', '#f0a088', '#cc5858', '#d05a70'];
    const offsets = [[-8, -4, 5], [4, -6, 4], [8, 2, 3.5], [-3, 5, 4.5], [2, 0, 6]];
    ctx.fillStyle = '#4a3a3a';
    ctx.beginPath(); ctx.ellipse(cx, cy, tw * 0.015, tw * 0.01, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
        const pulse = 0.6 + Math.sin(time * 2 + i) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.arc(cx + offsets[i][0], cy + offsets[i][1], offsets[i][2], 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// ========================
// DRIFTWOOD
// ========================

function drawDriftwoodSide(ctx, cx, cy, tw, th, time) {
    ctx.save();
    const w = tw * 0.08;
    const h = th * 0.035;

    // Main log body
    const grad = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    grad.addColorStop(0, '#8a6a40');
    grad.addColorStop(0.5, '#7a5a3a');
    grad.addColorStop(1, '#6a4a2a');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, cy);
    ctx.bezierCurveTo(cx - w * 0.3, cy - h * 2, cx + w * 0.2, cy - h * 2.5, cx + w * 0.5, cy - h);
    ctx.bezierCurveTo(cx + w * 0.2, cy - h * 1.5, cx - w * 0.3, cy - h * 0.5, cx - w * 0.5, cy);
    ctx.fill();

    // Branch stub
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = h * 0.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.12, cy - h * 2.2);
    ctx.lineTo(cx + w * 0.18, cy - h * 4.5);
    ctx.stroke();

    // Grain lines
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.25)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
        const off = (i - 1) * h * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.38, cy + off);
        ctx.bezierCurveTo(cx - w * 0.1, cy - h * 1.4 + off, cx + w * 0.15, cy - h * 1.8 + off, cx + w * 0.38, cy - h * 0.7 + off);
        ctx.stroke();
    }

    // Moss/biofilm patch
    const mAlpha = 0.15 + Math.sin(time * 0.8) * 0.05;
    ctx.fillStyle = `rgba(70, 130, 50, ${mAlpha})`;
    ctx.beginPath(); ctx.arc(cx - w * 0.15, cy - h * 1.5, h * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + w * 0.05, cy - h * 2.1, h * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function drawDriftwoodTop(ctx, cx, cy, tw, th) {
    // Elongated ellipse
    ctx.fillStyle = '#7a5a3a';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.2);
    ctx.beginPath();
    ctx.ellipse(0, 0, tw * 0.035, tw * 0.008, 0, 0, Math.PI * 2);
    ctx.fill();
    // Root end
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.ellipse(-tw * 0.025, 0, tw * 0.012, tw * 0.009, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ========================
// LED STRING LIGHTS (new)
// ========================

function drawLEDSide(ctx, tl, tt, tw, th, time) {
    const startX = tl + tw * 0.12;
    const endX = tl + tw * 0.88;
    const stringY = tt + th * 0.07;
    const sag = th * 0.05;
    const numLights = 9;
    const hues = [0, 40, 60, 120, 180, 220, 270, 320, 30];

    // String wire
    ctx.strokeStyle = 'rgba(80, 80, 80, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, stringY);
    for (let i = 1; i <= 20; i++) {
        const t = i / 20;
        ctx.lineTo(
            startX + (endX - startX) * t,
            stringY + Math.sin(t * Math.PI) * sag
        );
    }
    ctx.stroke();

    // Light bulbs
    for (let i = 0; i < numLights; i++) {
        const t = (i + 0.5) / numLights;
        const lx = startX + (endX - startX) * t;
        const ly = stringY + Math.sin(t * Math.PI) * sag;
        const hue = hues[i];
        const pulse = 0.6 + Math.sin(time * 2 + i * 0.9) * 0.35;

        // Soft glow
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse * 0.12;
        const glowR = tw * 0.025;
        const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, glowR);
        glow.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.5)`);
        glow.addColorStop(1, `hsla(${hue}, 100%, 65%, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(lx - glowR, ly - glowR, glowR * 2, glowR * 2);
        ctx.restore();

        // Bulb
        ctx.fillStyle = `hsla(${hue}, 90%, ${50 + pulse * 20}%, ${0.7 + pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Highlight dot
        ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.4})`;
        ctx.beginPath();
        ctx.arc(lx - 0.7, ly - 0.7, 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawLEDTop(ctx, tl, tt, tw, th, time) {
    // Line of colored dots along back edge
    const y = tt + th * 0.03;
    const hues = [0, 40, 60, 120, 180, 220, 270, 320, 30];
    for (let i = 0; i < 9; i++) {
        const t = (i + 0.5) / 9;
        const x = tl + tw * (0.12 + 0.76 * t);
        const pulse = 0.5 + Math.sin(time * 2 + i * 0.9) * 0.4;
        ctx.fillStyle = `hsla(${hues[i]}, 90%, 60%, ${pulse * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ========================
// TREASURE CHEST (new)
// ========================

function drawChestSide(ctx, cx, cy, tw, th, time) {
    const w = tw * 0.045;
    const h = th * 0.055;

    // Chest body
    ctx.fillStyle = '#6a4420';
    ctx.fillRect(cx - w / 2, cy - h, w, h);

    // Metal bands
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - h * 0.35); ctx.lineTo(cx + w / 2, cy - h * 0.35);
    ctx.moveTo(cx - w / 2, cy - h * 0.7);  ctx.lineTo(cx + w / 2, cy - h * 0.7);
    ctx.stroke();

    // Lid (animated open/close)
    const lidAngle = 0.25 + Math.sin(time * 0.5) * 0.03;
    ctx.fillStyle = '#7a5430';
    ctx.save();
    ctx.translate(cx - w / 2, cy - h);
    ctx.rotate(-lidAngle);
    ctx.fillRect(0, -h * 0.13, w, h * 0.13);
    ctx.beginPath();
    ctx.arc(w / 2, -h * 0.13, w / 2, Math.PI, 0);
    ctx.fill();
    ctx.restore();

    // Gold glow inside
    const glowA = 0.25 + Math.sin(time * 2) * 0.1;
    const glow = ctx.createRadialGradient(cx, cy - h, 0, cx, cy - h, w * 0.45);
    glow.addColorStop(0, `rgba(255, 200, 50, ${glowA})`);
    glow.addColorStop(1, 'rgba(255, 200, 50, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - w * 0.5, cy - h * 1.4, w, h * 0.5);

    // Clasp
    ctx.fillStyle = '#c0a030';
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.5, w * 0.035, 0, Math.PI * 2);
    ctx.fill();

    // Bubbles rising from chest
    for (let i = 0; i < 3; i++) {
        const phase = (time * 1.5 + i * 2.1) % 4;
        if (phase < 3) {
            const by = cy - h - phase * th * 0.035;
            const bx = cx + Math.sin(phase * 3 + i) * w * 0.2;
            const br = 1.5 + (1 - phase / 3) * 1.2;
            ctx.strokeStyle = `rgba(180, 220, 255, ${(1 - phase / 3) * 0.4})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
        }
    }

    // Sparkle
    const sp = (time * 0.7) % 3;
    if (sp < 0.3) {
        const sa = sp < 0.15 ? sp / 0.15 : (0.3 - sp) / 0.15;
        ctx.fillStyle = `rgba(255, 240, 150, ${sa})`;
        ctx.beginPath();
        ctx.arc(cx + Math.sin(time * 7) * w * 0.12, cy - h * 0.75, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawChestTop(ctx, cx, cy, tw, th) {
    // Simple rectangle from above
    const w = tw * 0.02;
    const h = tw * 0.014;
    ctx.fillStyle = '#6a4420';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    // Golden interior hint
    ctx.fillStyle = 'rgba(255, 200, 50, 0.3)';
    ctx.fillRect(cx - w * 0.3, cy - h * 0.3, w * 0.6, h * 0.6);
}

// ========================
// ROCK ARCH (new)
// ========================

function drawArchSide(ctx, cx, cy, tw, th, time) {
    ctx.save();
    const w = tw * 0.055;
    const h = th * 0.11;

    const stoneColor = '#6a7a6a';
    const stoneDark = '#4a5a4a';

    // Left pillar
    ctx.fillStyle = stoneColor;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, cy);
    ctx.lineTo(cx - w * 0.45, cy - h * 0.88);
    ctx.lineTo(cx - w * 0.2, cy - h * 0.83);
    ctx.lineTo(cx - w * 0.15, cy);
    ctx.fill();

    // Right pillar
    ctx.fillStyle = stoneDark;
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.15, cy);
    ctx.lineTo(cx + w * 0.2, cy - h * 0.78);
    ctx.lineTo(cx + w * 0.5, cy - h * 0.83);
    ctx.lineTo(cx + w * 0.5, cy);
    ctx.fill();

    // Arch span
    ctx.fillStyle = stoneColor;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.45, cy - h * 0.85);
    ctx.bezierCurveTo(cx - w * 0.2, cy - h * 1.12, cx + w * 0.2, cy - h * 1.12, cx + w * 0.5, cy - h * 0.8);
    ctx.lineTo(cx + w * 0.45, cy - h * 0.72);
    ctx.bezierCurveTo(cx + w * 0.15, cy - h * 1.0, cx - w * 0.15, cy - h * 1.0, cx - w * 0.4, cy - h * 0.78);
    ctx.closePath();
    ctx.fill();

    // Dark opening
    ctx.fillStyle = 'rgba(10, 20, 15, 0.45)';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.15, cy);
    ctx.lineTo(cx - w * 0.18, cy - h * 0.7);
    ctx.bezierCurveTo(cx - w * 0.08, cy - h * 0.88, cx + w * 0.08, cy - h * 0.88, cx + w * 0.18, cy - h * 0.65);
    ctx.lineTo(cx + w * 0.15, cy);
    ctx.fill();

    // Pebbles
    const pebbles = ['#7a8a7a', '#5a6a5a', '#8a9a8a', '#6a7060', '#7a7a6a'];
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = pebbles[i];
        ctx.beginPath();
        ctx.ellipse(cx - w * 0.4 + i * w * 0.2, cy + 1, w * 0.028, w * 0.018, i * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Texture lines on pillars
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r < 3; r++) {
        const ry = cy - h * (0.2 + r * 0.22);
        ctx.beginPath(); ctx.moveTo(cx - w * 0.47, ry); ctx.lineTo(cx - w * 0.17, ry); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + w * 0.17, ry); ctx.lineTo(cx + w * 0.47, ry); ctx.stroke();
    }

    // Moss wisps hanging from arch
    ctx.strokeStyle = 'rgba(60, 100, 40, 0.35)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
        const mx = cx + (i - 0.5) * w * 0.2;
        const my = cy - h * 0.75;
        const sway = Math.sin(time * 1.2 + i * 2) * 2;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.bezierCurveTo(mx + sway, my + h * 0.08, mx + sway * 1.5, my + h * 0.14, mx + sway * 0.5, my + h * 0.18);
        ctx.stroke();
    }
    ctx.restore();
}

function drawArchTop(ctx, cx, cy, tw, th) {
    // Two pillar dots connected by arc stroke
    const r = tw * 0.006;
    ctx.fillStyle = '#6a7a6a';
    ctx.beginPath(); ctx.arc(cx - tw * 0.015, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + tw * 0.015, cy, r, 0, Math.PI * 2); ctx.fill();
    // Bridge span
    ctx.strokeStyle = '#6a7a6a';
    ctx.lineWidth = tw * 0.006;
    ctx.beginPath();
    ctx.moveTo(cx - tw * 0.015, cy);
    ctx.lineTo(cx + tw * 0.015, cy);
    ctx.stroke();
    // Dark gap
    ctx.fillStyle = 'rgba(10, 20, 15, 0.3)';
    ctx.fillRect(cx - tw * 0.01, cy - tw * 0.003, tw * 0.02, tw * 0.006);
}
