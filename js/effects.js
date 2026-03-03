// effects.js — Water background, bubbles, caustics, visual FX

import { rand, clamp, lerp } from './utils.js';
import { getTank } from './tank.js';

// Bubbles
const bubbles = [];
const MAX_BUBBLES = 30;

function spawnBubble(tankW, tankH) {
    bubbles.push({
        x: rand(0.05, 0.95),
        y: 1,
        z: rand(0, 1),
        size: rand(2, 6),
        speed: rand(15, 35),
        wobblePhase: rand(0, Math.PI * 2),
        wobbleFreq: rand(2, 4),
        wobbleAmp: rand(0.5, 2),
    });
}

// Caustic nodes for light patterns
const causticNodes = [];
for (let i = 0; i < 8; i++) {
    causticNodes.push({
        x: rand(0.1, 0.9),
        y: rand(0.1, 0.9),
        vx: rand(-0.02, 0.02),
        vy: rand(-0.02, 0.02),
        radius: rand(0.08, 0.2),
    });
}

export function updateEffects(dt) {
    // Update bubbles
    for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y -= (b.speed / 100) * dt * 0.5;
        b.x += Math.sin(b.wobblePhase) * b.wobbleAmp * 0.001;
        b.wobblePhase += b.wobbleFreq * dt;
        if (b.y < -0.05) {
            bubbles.splice(i, 1);
        }
    }

    // Spawn bubbles
    if (bubbles.length < MAX_BUBBLES && Math.random() < 0.3 * dt) {
        spawnBubble();
    }

    // Update caustic nodes
    for (const n of causticNodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 0.05 || n.x > 0.95) n.vx *= -1;
        if (n.y < 0.05 || n.y > 0.95) n.vy *= -1;
        n.x = clamp(n.x, 0, 1);
        n.y = clamp(n.y, 0, 1);
    }
}

export function drawWaterBackground(ctx, w, h, viewAngle) {
    const tank = getTank();

    if (viewAngle < 0.5) {
        // Side view — gradient from light at top to dark at bottom
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#1a4a6e');
        grad.addColorStop(0.3, '#0e3858');
        grad.addColorStop(1, '#061828');
        ctx.fillStyle = grad;
    } else {
        // Top-down — uniform blue-green
        ctx.fillStyle = '#0c3048';
    }
    ctx.fillRect(0, 0, w, h);

    // Water tint based on chemistry
    if (tank.ammonia > 10) {
        ctx.fillStyle = `rgba(180, 160, 50, ${tank.ammonia * 0.003})`;
        ctx.fillRect(0, 0, w, h);
    }
    if (tank.nitrite > 10) {
        ctx.fillStyle = `rgba(180, 80, 120, ${tank.nitrite * 0.003})`;
        ctx.fillRect(0, 0, w, h);
    }
    if (tank.nitrate > 10) {
        ctx.fillStyle = `rgba(50, 150, 50, ${tank.nitrate * 0.002})`;
        ctx.fillRect(0, 0, w, h);
    }
    if (tank.algae > 10) {
        ctx.fillStyle = `rgba(30, 120, 30, ${tank.algae * 0.004})`;
        ctx.fillRect(0, 0, w, h);
    }
}

export function drawCaustics(ctx, w, h, viewAngle, time) {
    if (viewAngle > 0.7) return; // Only visible in side-ish views
    const alpha = viewAngle < 0.3 ? 0.08 : lerp(0.08, 0, (viewAngle - 0.3) / 0.4);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;

    for (const n of causticNodes) {
        const cx = n.x * w;
        const cy = n.y * h;
        const r = n.radius * Math.min(w, h);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(150, 200, 255, 0.5)');
        grad.addColorStop(1, 'rgba(150, 200, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    ctx.restore();
}

export function drawBubblesSide(ctx, tankLeft, tankTop, tankW, tankH) {
    ctx.save();
    for (const b of bubbles) {
        const bx = tankLeft + b.x * tankW;
        const by = tankTop + b.y * tankH;
        ctx.strokeStyle = 'rgba(180, 220, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, b.size, 0, Math.PI * 2);
        ctx.stroke();
        // Highlight
        ctx.fillStyle = 'rgba(220, 240, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(bx - b.size * 0.2, by - b.size * 0.2, b.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

export function drawBubblesTop(ctx, tankLeft, tankTop, tankW, tankH) {
    ctx.save();
    for (const b of bubbles) {
        // In top view, bubbles close to surface (y near 0) are more visible
        const alpha = clamp(1 - b.y, 0, 0.5);
        const bx = tankLeft + b.x * tankW;
        const by = tankTop + b.z * tankH;
        ctx.fillStyle = `rgba(200, 230, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(bx, by, b.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

export function drawTankEdges(ctx, tankLeft, tankTop, tankW, tankH, viewAngle) {
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 160, 200, 0.15)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(80, 140, 180, 0.1)';
    ctx.shadowBlur = 10;
    ctx.strokeRect(tankLeft, tankTop, tankW, tankH);
    ctx.restore();

    // Algae on glass
    const tank = getTank();
    if (tank.algae > 20) {
        const algaeAlpha = (tank.algae - 20) * 0.005;
        ctx.save();
        ctx.globalAlpha = clamp(algaeAlpha, 0, 0.3);
        // Green patches along edges
        ctx.fillStyle = '#2a6630';
        const patchSize = 15;
        for (let x = tankLeft; x < tankLeft + tankW; x += patchSize * 2) {
            const h = rand(5, 15) * (tank.algae / 100);
            ctx.fillRect(x, tankTop + tankH - h, patchSize, h);
            ctx.fillRect(x, tankTop, patchSize, h * 0.5);
        }
        ctx.restore();
    }

    // Sand/gravel at bottom (side view)
    if (viewAngle < 0.6) {
        const grad = ctx.createLinearGradient(0, tankTop + tankH - 8, 0, tankTop + tankH);
        grad.addColorStop(0, 'rgba(160, 140, 100, 0.3)');
        grad.addColorStop(1, 'rgba(120, 100, 70, 0.5)');
        ctx.fillStyle = grad;
        ctx.fillRect(tankLeft, tankTop + tankH - 6, tankW, 6);
    }
}
