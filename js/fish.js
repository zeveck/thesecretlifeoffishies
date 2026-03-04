// fish.js — Fish class: properties, AI, drawing (both views)

import { lerp, clamp, rand, dist, angleTo, lerpAngle, normalizeAngle, desaturate, adjustSaturation } from './utils.js';
import { getFoods } from './food.js';
import { getWaterQuality } from './tank.js';

export const SPECIES_CATALOG = [
    { name: 'Neon Tetra',     sizeInches: 1,   level: 1, body: '#2244aa', fin: '#ff2030', belly: '#8090bb', speed: 60, aspect: 3.2, tailStyle: 'fork',  finStyle: 'small', glowStripe: '#00ffff' },
    { name: 'Guppy',          sizeInches: 1.5, level: 1, body: '#e68a00', fin: '#ff5533', belly: '#ffe0a0', speed: 55, aspect: 2.5, tailStyle: 'fan',   finStyle: 'small' },
    { name: 'Platy',          sizeInches: 2,   level: 2, body: '#e64040', fin: '#cc3030', belly: '#ffa070', speed: 50, aspect: 2.2, tailStyle: 'fan',   finStyle: 'medium' },
    { name: 'Danio',          sizeInches: 1.5, level: 2, body: '#3070dd', fin: '#4090ff', belly: '#d0e8ff', speed: 70, aspect: 3.0, tailStyle: 'fork',  finStyle: 'small' },
    { name: 'Molly',          sizeInches: 3,   level: 3, body: '#222222', fin: '#333333', belly: '#444444', speed: 45, aspect: 2.3, tailStyle: 'round', finStyle: 'medium' },
    { name: 'Corydoras',      sizeInches: 2,   level: 3, body: '#c09060', fin: '#a07848', belly: '#e8d0b0', speed: 35, aspect: 2.0, tailStyle: 'fork',  finStyle: 'medium' },
    { name: 'Swordtail',      sizeInches: 3,   level: 4, body: '#dd4422', fin: '#ff6633', belly: '#ffbb88', speed: 50, aspect: 2.8, tailStyle: 'sword', finStyle: 'medium' },
    { name: 'Cherry Barb',    sizeInches: 2,   level: 4, body: '#cc2244', fin: '#aa1133', belly: '#ff8899', speed: 55, aspect: 2.6, tailStyle: 'fork',  finStyle: 'small' },
    { name: 'Angelfish',      sizeInches: 4,   level: 5, body: '#d0d0d0', fin: '#b0b0b0', belly: '#ffffff', speed: 35, aspect: 1.5, tailStyle: 'fan',   finStyle: 'tall' },
    { name: 'Gourami',        sizeInches: 4,   level: 5, body: '#3090b0', fin: '#40a8cc', belly: '#a0d8e8', speed: 30, aspect: 2.0, tailStyle: 'round', finStyle: 'medium' },
    { name: 'Rainbowfish',    sizeInches: 4,   level: 6, body: '#4488dd', fin: '#66aaff', belly: '#aaccff', speed: 55, aspect: 2.6, tailStyle: 'fork',  finStyle: 'medium' },
    { name: 'Betta',          sizeInches: 2.5, level: 6, body: '#6622cc', fin: '#8844ff', belly: '#bb88ff', speed: 30, aspect: 2.2, tailStyle: 'fan',   finStyle: 'flowing' },
    { name: 'Discus',         sizeInches: 6,   level: 7, body: '#dd6622', fin: '#cc5511', belly: '#ffaa66', speed: 25, aspect: 1.3, tailStyle: 'round', finStyle: 'medium' },
    { name: 'Clown Loach',    sizeInches: 5,   level: 7, body: '#ff8800', fin: '#222222', belly: '#ffcc66', speed: 40, aspect: 2.8, tailStyle: 'fork',  finStyle: 'small' },
];

let nextFishId = 1;

export class Fish {
    constructor(species, x, y, z, name) {
        this.id = nextFishId++;
        this.species = species;
        this.name = name || '';
        this.x = x ?? rand(15, 85);
        this.y = y ?? rand(15, 80);
        this.z = z ?? rand(15, 85);
        this.heading = rand(-Math.PI, Math.PI); // XZ plane heading
        this.pitch = 0; // up/down angle for side view
        this.targetHeading = this.heading;
        this.targetPitch = 0;

        this.currentSize = species.sizeInches * 0.6; // Start at 60%
        this.maxSize = species.sizeInches;

        this.hunger = 50;  // 0–100
        this.strength = 80;
        this.happiness = 80;

        this.state = 'wandering';
        this.stateTimer = 0;
        this.wanderTarget = { x: rand(10, 90), y: rand(15, 85), z: rand(10, 90) };

        this.tailPhase = rand(0, Math.PI * 2);
        this.boopTimer = 0;
        this.lastBoopXP = 0; // timestamp for XP cooldown
        this.eatingTimer = 0;

        this.distanceSwum = 0;
        this.xp = 0;

        this.followTarget = null; // {x, y} for finger follow

        this.sadTimer = 0; // Tracks consecutive unhappy time
        this.leaving = false;
        this.leaveProgress = 0;

        this.speed = species.speed;
    }

    update(dt) {
        if (this.leaving) {
            this.leaveProgress += dt * 0.3;
            this.x += Math.cos(this.heading) * 80 * dt;
            return this.leaveProgress < 1;
        }

        // Hunger rises
        this.hunger = clamp(this.hunger + 0.3 * dt, 0, 100);

        // Strength decays slowly
        this.strength = clamp(this.strength - 0.02 * dt, 0, 100);

        // Happiness composite
        const waterQ = getWaterQuality();
        const hungerScore = 100 - this.hunger;
        this.happiness = clamp((hungerScore * 0.4 + this.strength * 0.3 + waterQ * 100 * 0.3), 0, 100);

        // Sad timer
        if (this.happiness < 20) {
            this.sadTimer += dt;
            if (this.sadTimer > 300) { // 5 minutes
                this.leaving = true;
            }
        } else {
            this.sadTimer = Math.max(0, this.sadTimer - dt * 2);
        }

        // Growth when fed and healthy
        if (this.hunger < 60 && this.happiness > 40) {
            this.currentSize = Math.min(this.currentSize + 0.0001 * dt, this.maxSize);
        }

        // AI
        this.stateTimer -= dt;
        this.updateAI(dt);

        // Movement
        this.heading = lerpAngle(this.heading, this.targetHeading, 5 * dt);
        this.pitch = lerp(this.pitch, this.targetPitch, 5 * dt);

        const isActive = this.state === 'seeking_food' || this.state === 'following';
        const happyBonus = isActive
            ? 1 + (this.happiness / 100) * 1.0   // 1x-2x when chasing food/finger
            : 1 + (this.happiness / 100) * 0.3;  // 1x-1.3x when wandering
        const waterPenalty = waterQ < 0.7 ? Math.max(0.5, waterQ) : 1;
        const urgency = (this.state === 'seeking_food')
            ? 1.5 + (this.hunger / 100) * 1.5   // 1.5x-3x: hungrier = faster chase
            : (this.state === 'following')
            ? 2.0
            : 0.8;
        const spd = this.speed * (this.hunger > 80 ? 0.6 : 1) * urgency * happyBonus * waterPenalty;
        const moveSpeed = spd * 0.16 * dt; // normalize to tank % units

        if (this.state !== 'eating') {
            const dx = Math.cos(this.heading) * Math.cos(this.pitch) * moveSpeed;
            const dz = Math.sin(this.heading) * Math.cos(this.pitch) * moveSpeed;
            const dy = Math.sin(this.pitch) * moveSpeed;
            this.x += dx;
            this.z += dz;
            this.y += dy;
            const moved = Math.sqrt(dx * dx + dz * dz + dy * dy);
            this.distanceSwum += moved;
            this.xp += moved * 0.1;
        }

        // Boundaries
        this.x = clamp(this.x, 5, 95);
        this.y = clamp(this.y, 5, 95);
        this.z = clamp(this.z, 5, 95);

        // Animation
        const wagSpeed = this.state === 'booped' ? 18 : (this.state === 'eating' ? 4 : 8);
        this.tailPhase += wagSpeed * dt;

        // Boop timer
        if (this.boopTimer > 0) {
            this.boopTimer -= dt;
            if (this.boopTimer <= 0) {
                this.state = 'wandering';
                this.stateTimer = rand(2, 5);
            }
        }

        // Eating timer
        if (this.eatingTimer > 0) {
            this.eatingTimer -= dt;
            if (this.eatingTimer <= 0) {
                this.state = 'wandering';
                this.stateTimer = rand(2, 4);
            }
        }

        return true; // still alive
    }

    updateAI(dt) {
        const foods = getFoods();

        // Check for nearby food — only if not totally stuffed
        if ((this.state === 'wandering' || this.state === 'following') && this.hunger > 5 && foods.length > 0) {
            let nearest = null, nearDist = Infinity;
            for (const f of foods) {
                if (f.eaten) continue;
                const d = dist(this.x, this.z, f.x, f.z);
                if (d < nearDist) { nearDist = d; nearest = f; }
            }
            // Hungrier fish detect food from farther away
            const detectRange = 50 + this.hunger;
            if (nearest && nearDist < detectRange) {
                this.state = 'seeking_food';
                this.seekTarget = nearest;
            }
        }

        if (this.state === 'seeking_food') {
            if (!this.seekTarget || this.seekTarget.eaten) {
                this.state = 'wandering';
                this.stateTimer = rand(1, 3);
                return;
            }
            const fdx = this.seekTarget.x - this.x;
            const fdz = this.seekTarget.z - this.z;
            if (Math.abs(fdx) > 2 || Math.abs(fdz) > 2) {
                this.targetHeading = angleTo(this.x, this.z, this.seekTarget.x, this.seekTarget.z);
            }
            const dy = this.seekTarget.y - this.y;
            this.targetPitch = clamp(dy * 0.1, -1.0, 1.0);
            const d = dist(this.x, this.z, this.seekTarget.x, this.seekTarget.z);
            if (d < 5 && Math.abs(dy) < 5) {
                this.seekTarget.eaten = true;
                this.hunger = clamp(this.hunger - 25, 0, 100);
                this.state = 'eating';
                this.eatingTimer = 0.5;
                this.seekTarget = null;
            }
        }

        if (this.state === 'following') {
            if (!this.followTarget) {
                this.state = 'wandering';
                this.stateTimer = rand(1.5, 3.5);
            } else {
                const targetX = this.followTarget.x;
                const targetY = this.followTarget.y;
                this.wanderTarget = { x: targetX, y: targetY, z: this.z };
                const hdx = targetX - this.x;
                // Only update heading when there's meaningful horizontal distance
                // to prevent flipping when target is directly above/below
                if (Math.abs(hdx) > 2) {
                    this.targetHeading = angleTo(this.x, this.z, targetX, this.z);
                }
                const dy = targetY - this.y;
                this.targetPitch = clamp(dy * 0.1, -1.0, 1.0);
            }
        }

        if (this.state === 'wandering') {
            if (this.stateTimer <= 0) {
                let tx, ty, tz;
                for (let attempt = 0; attempt < 5; attempt++) {
                    tx = rand(10, 90);
                    ty = rand(15, 85);
                    tz = rand(10, 90);
                    if (dist(this.x, this.z, tx, tz) >= 25) break;
                }
                this.wanderTarget = { x: tx, y: ty, z: tz };
                this.stateTimer = rand(1.5, 3.5);
            }
            this.targetHeading = angleTo(this.x, this.z, this.wanderTarget.x, this.wanderTarget.z);
            const dy = this.wanderTarget.y - this.y;
            this.targetPitch = clamp(dy * 0.06, -0.4, 0.4) + Math.sin(this.tailPhase * 0.3) * 0.1;
        }
    }

    boop() {
        if (this.state === 'booped') return;
        this.state = 'booped';
        this.boopTimer = 0.6;
        this.strength = clamp(this.strength + 5, 0, 100);
        // Quick direction change
        this.targetHeading = this.heading + (Math.random() > 0.5 ? 1 : -1) * rand(1.5, 2.5);
    }

    // --- Drawing ---

    drawSide(ctx, tankLeft, tankTop, tankW, tankH) {
        const px = this.currentSize * 20; // pixel size based on fish inches
        const sx = tankLeft + (this.x / 100) * tankW;
        const sy = tankTop + (this.y / 100) * tankH;
        const facingRight = Math.cos(this.heading) >= 0;
        const dir = facingRight ? 1 : -1;

        // Happiness-based saturation: <40 desaturates, 40-70 normal, >70 vivid
        const satAdj = this.happiness > 70 ? (this.happiness - 70) / 100   // up to +0.3
                      : this.happiness < 40 ? -(40 - this.happiness) / 60   // down to -0.67
                      : 0;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(facingRight ? this.pitch : -this.pitch);
        if (!facingRight) ctx.scale(-1, 1);

        if (this.leaving) {
            ctx.globalAlpha = 1 - this.leaveProgress;
        }

        const bodyW = px * (this.species.aspect / 2);
        const bodyH = px * 0.5;
        const tailWag = Math.sin(this.tailPhase) * 0.3;

        // Body color
        const bodyColor = satAdj !== 0 ? adjustSaturation(this.species.body, satAdj) : this.species.body;
        const bellyColor = satAdj !== 0 ? adjustSaturation(this.species.belly, satAdj) : this.species.belly;
        const finColor = satAdj !== 0 ? adjustSaturation(this.species.fin, satAdj) : this.species.fin;

        // Tail
        ctx.fillStyle = finColor;
        ctx.beginPath();
        if (this.species.tailStyle === 'fork') {
            ctx.moveTo(-bodyW * 0.7, 0);
            ctx.bezierCurveTo(-bodyW * 1.0, -bodyH * 0.8 + tailWag * bodyH,
                              -bodyW * 1.3, -bodyH * 0.6 + tailWag * bodyH,
                              -bodyW * 1.1, -bodyH * 0.1 + tailWag * bodyH * 0.5);
            ctx.moveTo(-bodyW * 0.7, 0);
            ctx.bezierCurveTo(-bodyW * 1.0, bodyH * 0.8 + tailWag * bodyH,
                              -bodyW * 1.3, bodyH * 0.6 + tailWag * bodyH,
                              -bodyW * 1.1, bodyH * 0.1 + tailWag * bodyH * 0.5);
        } else if (this.species.tailStyle === 'fan') {
            ctx.moveTo(-bodyW * 0.6, 0);
            ctx.bezierCurveTo(-bodyW * 1.1, -bodyH * 1.4 + tailWag * bodyH,
                              -bodyW * 1.8, -bodyH * 1.1 + tailWag * bodyH,
                              -bodyW * 1.5, 0 + tailWag * bodyH * 0.5);
            ctx.bezierCurveTo(-bodyW * 1.8, bodyH * 1.1 + tailWag * bodyH,
                              -bodyW * 1.1, bodyH * 1.4 + tailWag * bodyH,
                              -bodyW * 0.6, 0);
        } else if (this.species.tailStyle === 'sword') {
            ctx.moveTo(-bodyW * 0.7, 0);
            ctx.bezierCurveTo(-bodyW * 0.9, -bodyH * 0.5 + tailWag * bodyH,
                              -bodyW * 1.1, -bodyH * 0.3 + tailWag * bodyH,
                              -bodyW * 0.9, 0 + tailWag * bodyH * 0.3);
            ctx.moveTo(-bodyW * 0.7, bodyH * 0.1);
            ctx.lineTo(-bodyW * 1.5, bodyH * 0.15 + tailWag * bodyH * 0.3);
            ctx.lineTo(-bodyW * 0.7, bodyH * 0.05);
        } else { // round
            ctx.moveTo(-bodyW * 0.6, 0);
            ctx.bezierCurveTo(-bodyW * 0.9, -bodyH * 0.6 + tailWag * bodyH,
                              -bodyW * 1.1, -bodyH * 0.4 + tailWag * bodyH,
                              -bodyW * 1.0, 0 + tailWag * bodyH * 0.3);
            ctx.bezierCurveTo(-bodyW * 1.1, bodyH * 0.4 + tailWag * bodyH,
                              -bodyW * 0.9, bodyH * 0.6 + tailWag * bodyH,
                              -bodyW * 0.6, 0);
        }
        ctx.fill();

        // Body (ellipse)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, bodyW, bodyH, 0, 0, Math.PI * 2);
        ctx.fill();

        // Belly highlight
        ctx.fillStyle = bellyColor;
        ctx.globalAlpha = (this.leaving ? 1 - this.leaveProgress : 1) * 0.4;
        ctx.beginPath();
        ctx.ellipse(bodyW * 0.1, bodyH * 0.2, bodyW * 0.6, bodyH * 0.4, 0, 0, Math.PI);
        ctx.fill();
        ctx.globalAlpha = this.leaving ? 1 - this.leaveProgress : 1;

        // Neon glow stripe
        if (this.species.glowStripe) {
            const sc = this.species.glowStripe;
            const baseAlpha = this.leaving ? 1 - this.leaveProgress : 1;
            const stripeL = -bodyW * 0.45;
            const stripeR = bodyW * 0.2;
            const stripeY = -bodyH * 0.15;
            // Wide soft bloom
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = baseAlpha * 0.5;
            ctx.strokeStyle = sc;
            ctx.lineWidth = bodyH * 0.4;
            ctx.lineCap = 'round';
            ctx.shadowColor = sc;
            ctx.shadowBlur = bodyH * 1.0;
            ctx.beginPath();
            ctx.moveTo(stripeL, stripeY);
            ctx.lineTo(stripeR, stripeY);
            ctx.stroke();
            ctx.restore();
            // Bright core stripe
            ctx.save();
            ctx.globalAlpha = baseAlpha;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = bodyH * 0.15;
            ctx.lineCap = 'round';
            ctx.shadowColor = sc;
            ctx.shadowBlur = bodyH * 0.9;
            ctx.beginPath();
            ctx.moveTo(stripeL, stripeY);
            ctx.lineTo(stripeR, stripeY);
            ctx.stroke();
            ctx.restore();
            // Saturated color layer on top
            ctx.save();
            ctx.globalAlpha = baseAlpha * 0.8;
            ctx.strokeStyle = sc;
            ctx.lineWidth = bodyH * 0.25;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(stripeL, stripeY);
            ctx.lineTo(stripeR, stripeY);
            ctx.stroke();
            ctx.restore();
        }

        // Dorsal fin
        ctx.fillStyle = finColor;
        ctx.beginPath();
        if (this.species.finStyle === 'tall') {
            ctx.moveTo(-bodyW * 0.2, -bodyH * 0.85);
            ctx.bezierCurveTo(0, -bodyH * 2.0, bodyW * 0.3, -bodyH * 1.8, bodyW * 0.2, -bodyH * 0.8);
        } else if (this.species.finStyle === 'flowing') {
            ctx.moveTo(-bodyW * 0.4, -bodyH * 0.8);
            ctx.bezierCurveTo(-bodyW * 0.1, -bodyH * 1.6 + tailWag * bodyH * 0.3,
                              bodyW * 0.2, -bodyH * 1.4 + tailWag * bodyH * 0.3,
                              bodyW * 0.4, -bodyH * 0.7);
        } else {
            ctx.moveTo(-bodyW * 0.1, -bodyH * 0.9);
            ctx.bezierCurveTo(0, -bodyH * 1.4, bodyW * 0.2, -bodyH * 1.3, bodyW * 0.15, -bodyH * 0.85);
        }
        ctx.fill();

        // Pectoral fin
        ctx.fillStyle = finColor;
        ctx.globalAlpha = (this.leaving ? 1 - this.leaveProgress : 1) * 0.6;
        ctx.beginPath();
        const pfinWag = Math.sin(this.tailPhase * 0.7) * 0.15;
        ctx.moveTo(bodyW * 0.15, bodyH * 0.1);
        ctx.bezierCurveTo(bodyW * 0.4, bodyH * 0.6 + pfinWag * bodyH,
                          bodyW * 0.2, bodyH * 0.9 + pfinWag * bodyH,
                          bodyW * 0.05, bodyH * 0.5);
        ctx.fill();
        ctx.globalAlpha = this.leaving ? 1 - this.leaveProgress : 1;

        // Eye
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(bodyW * 0.55, -bodyH * 0.15, bodyH * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(bodyW * 0.6, -bodyH * 0.15, bodyH * 0.14, 0, Math.PI * 2);
        ctx.fill();

        // Mouth
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bodyW * 0.9, bodyH * 0.05, bodyH * 0.15, -0.3, 0.5);
        ctx.stroke();

        ctx.restore();
    }

    drawTop(ctx, tankLeft, tankTop, tankW, tankH) {
        const px = this.currentSize * 20;
        const sx = tankLeft + (this.x / 100) * tankW;
        const sy = tankTop + (this.z / 100) * tankH;

        const satAdj = this.happiness > 70 ? (this.happiness - 70) / 100
                      : this.happiness < 40 ? -(40 - this.happiness) / 60
                      : 0;
        const bodyColor = satAdj !== 0 ? adjustSaturation(this.species.body, satAdj) : this.species.body;
        const finColor = satAdj !== 0 ? adjustSaturation(this.species.fin, satAdj) : this.species.fin;

        const bodyLen = px * (this.species.aspect / 2);
        const bodyW = px * 0.3;
        const tailWag = Math.sin(this.tailPhase) * 0.25;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.heading + Math.PI / 2);

        if (this.leaving) {
            ctx.globalAlpha = 1 - this.leaveProgress;
        }

        // Tail
        ctx.fillStyle = finColor;
        ctx.beginPath();
        ctx.moveTo(0, bodyLen * 0.6);
        ctx.bezierCurveTo(-bodyW * 1.2 + tailWag * bodyW * 2, bodyLen * 1.0,
                          -bodyW * 0.8 + tailWag * bodyW * 2, bodyLen * 1.3,
                          tailWag * bodyW, bodyLen * 1.1);
        ctx.bezierCurveTo(bodyW * 0.8 + tailWag * bodyW * 2, bodyLen * 1.3,
                          bodyW * 1.2 + tailWag * bodyW * 2, bodyLen * 1.0,
                          0, bodyLen * 0.6);
        ctx.fill();

        // Body — teardrop/leaf
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.moveTo(0, -bodyLen * 0.6);
        ctx.bezierCurveTo(bodyW * 1.2, -bodyLen * 0.2,
                          bodyW * 1.0, bodyLen * 0.3,
                          0, bodyLen * 0.7);
        ctx.bezierCurveTo(-bodyW * 1.0, bodyLen * 0.3,
                          -bodyW * 1.2, -bodyLen * 0.2,
                          0, -bodyLen * 0.6);
        ctx.fill();

        // Dorsal stripe / glow stripe
        if (this.species.glowStripe) {
            const sc = this.species.glowStripe;
            const baseAlpha = this.leaving ? 1 - this.leaveProgress : 1;
            // Wide soft bloom
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = baseAlpha * 0.5;
            ctx.strokeStyle = sc;
            ctx.lineWidth = bodyW * 1.2;
            ctx.lineCap = 'round';
            ctx.shadowColor = sc;
            ctx.shadowBlur = bodyW * 2;
            ctx.beginPath();
            ctx.moveTo(0, -bodyLen * 0.4);
            ctx.lineTo(0, bodyLen * 0.3);
            ctx.stroke();
            ctx.restore();
            // White core
            ctx.save();
            ctx.globalAlpha = baseAlpha;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = bodyW * 0.2;
            ctx.lineCap = 'round';
            ctx.shadowColor = sc;
            ctx.shadowBlur = bodyW * 1.5;
            ctx.beginPath();
            ctx.moveTo(0, -bodyLen * 0.4);
            ctx.lineTo(0, bodyLen * 0.3);
            ctx.stroke();
            ctx.restore();
            // Saturated color layer
            ctx.save();
            ctx.globalAlpha = baseAlpha * 0.8;
            ctx.strokeStyle = sc;
            ctx.lineWidth = bodyW * 0.4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, -bodyLen * 0.4);
            ctx.lineTo(0, bodyLen * 0.3);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.strokeStyle = finColor;
            ctx.lineWidth = bodyW * 0.3;
            ctx.globalAlpha = (this.leaving ? 1 - this.leaveProgress : 1) * 0.5;
            ctx.beginPath();
            ctx.moveTo(0, -bodyLen * 0.4);
            ctx.lineTo(0, bodyLen * 0.3);
            ctx.stroke();
        }
        ctx.globalAlpha = this.leaving ? 1 - this.leaveProgress : 1;

        // Pectoral fins (splayed)
        ctx.fillStyle = finColor;
        ctx.globalAlpha = (this.leaving ? 1 - this.leaveProgress : 1) * 0.5;
        const pfinAngle = Math.sin(this.tailPhase * 0.6) * 0.1;
        // Right
        ctx.beginPath();
        ctx.moveTo(bodyW * 0.6, -bodyLen * 0.05);
        ctx.bezierCurveTo(bodyW * 2.0, bodyLen * 0.1 + pfinAngle * bodyLen,
                          bodyW * 1.5, bodyLen * 0.3 + pfinAngle * bodyLen,
                          bodyW * 0.4, bodyLen * 0.15);
        ctx.fill();
        // Left
        ctx.beginPath();
        ctx.moveTo(-bodyW * 0.6, -bodyLen * 0.05);
        ctx.bezierCurveTo(-bodyW * 2.0, bodyLen * 0.1 + pfinAngle * bodyLen,
                          -bodyW * 1.5, bodyLen * 0.3 + pfinAngle * bodyLen,
                          -bodyW * 0.4, bodyLen * 0.15);
        ctx.fill();
        ctx.globalAlpha = this.leaving ? 1 - this.leaveProgress : 1;

        // Eye dots
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(bodyW * 0.35, -bodyLen * 0.35, bodyW * 0.18, 0, Math.PI * 2);
        ctx.arc(-bodyW * 0.35, -bodyLen * 0.35, bodyW * 0.18, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // Display name: "Bubbles (Neon Tetra)" or just "Neon Tetra"
    displayName() {
        return this.name
            ? `${this.name} (${this.species.name})`
            : this.species.name;
    }

    // Save/load helpers
    serialize() {
        return {
            speciesName: this.species.name,
            name: this.name,
            x: this.x, y: this.y, z: this.z,
            heading: this.heading,
            currentSize: this.currentSize,
            hunger: this.hunger,
            strength: this.strength,
            happiness: this.happiness,
            sadTimer: this.sadTimer,
            distanceSwum: this.distanceSwum,
            xp: this.xp,
        };
    }

    static deserialize(data) {
        const species = SPECIES_CATALOG.find(s => s.name === data.speciesName);
        if (!species) return null;
        const f = new Fish(species, data.x, data.y, data.z, data.name);
        f.heading = data.heading ?? f.heading;
        f.targetHeading = f.heading;
        f.currentSize = data.currentSize ?? species.sizeInches * 0.6;
        f.hunger = data.hunger ?? 50;
        f.strength = data.strength ?? 80;
        f.happiness = data.happiness ?? 80;
        f.sadTimer = data.sadTimer ?? 0;
        f.distanceSwum = data.distanceSwum ?? 0;
        f.xp = data.xp ?? 0;
        return f;
    }

    getSizePixels() {
        return this.currentSize * 20;
    }
}
