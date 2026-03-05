// orientation.js — Device orientation detection, view angle smoothing

import { clamp, lerp } from './utils.js';

let viewAngle = 0; // 0 = side view, 1 = top-down (start side)
let targetViewAngle = 0;
let isDesktop = true; // assume desktop until proven otherwise
let orientationEventCount = 0;
let permissionGranted = false;
let suppressUntil = 0; // timestamp — ignore orientation events until this time
let showToggleOnMobile = true;

// Mobile view mode: 'tilt' | 'side' | 'top'
let mobileViewMode = 'tilt';

// Canvas toggle icon state
let toggleCtx = null;
const ICON_BODY = '#5588cc';
const ICON_FIN  = '#3366aa';
const ICON_EYE_W = '#fff';
const ICON_EYE_P = '#111';

const SMOOTH_FACTOR = 0.08;
const MIN_EVENTS_FOR_MOBILE = 3; // need several events to confirm real sensor

export function getViewAngle() {
    return viewAngle;
}

export function setViewAngle(v) {
    viewAngle = clamp(v, 0, 1);
    targetViewAngle = viewAngle;
}

export function updateOrientation() {
    viewAngle = lerp(viewAngle, targetViewAngle, SMOOTH_FACTOR);
    if (Math.abs(viewAngle - targetViewAngle) < 0.001) {
        viewAngle = targetViewAngle;
    }
}

function handleOrientation(e) {
    if (!permissionGranted) return;
    if (Date.now() < suppressUntil) return;

    orientationEventCount++;

    // Ignore early events — desktop Chrome fires a single event with beta=0
    // which would flash top-down view. Require several consistent events.
    if (orientationEventCount < MIN_EVENTS_FOR_MOBILE) return;

    // Once we have real events, this is mobile
    if (isDesktop) {
        isDesktop = false;
        const btn = document.getElementById('view-toggle-btn');
        if (btn) btn.classList.toggle('hidden', !showToggleOnMobile);
        updateToggleButtonLabel();
    }

    // Only follow tilt when in tilt mode
    if (mobileViewMode !== 'tilt') return;

    // beta: 0 = flat (top-down), 90 = upright (side view)
    const beta = clamp(e.beta || 0, 0, 90);
    // Map: 0-20 = top-down, 60-90 = side view
    targetViewAngle = 1 - clamp((beta - 20) / 50, 0, 1);
}

export async function requestOrientationPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const perm = await DeviceOrientationEvent.requestPermission();
            if (perm === 'granted') {
                permissionGranted = true;
                window.addEventListener('deviceorientation', handleOrientation);
            }
        } catch (e) {
            console.log('Orientation permission denied');
        }
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
        permissionGranted = true;
        window.addEventListener('deviceorientation', handleOrientation);
    }
}

export function toggleView() {
    if (isDesktop) {
        // Desktop: simple toggle side/top
        targetViewAngle = targetViewAngle > 0.5 ? 0 : 1;
        updateToggleButtonLabel();
    } else {
        // Mobile: cycle Side -> Top -> Tilt
        if (mobileViewMode === 'tilt') {
            mobileViewMode = 'side';
            targetViewAngle = 0;
        } else if (mobileViewMode === 'side') {
            mobileViewMode = 'top';
            targetViewAngle = 1;
        } else {
            mobileViewMode = 'tilt';
        }
        updateToggleButtonLabel();
    }
}

function setupToggleCanvas() {
    const btn = document.getElementById('view-toggle-btn');
    if (!btn || toggleCtx) return;
    const dpr = Math.max(window.devicePixelRatio || 1, 3);
    btn.width = 32 * dpr;
    btn.height = 32 * dpr;
    btn.style.width = '32px';
    btn.style.height = '32px';
    toggleCtx = btn.getContext('2d');
    toggleCtx.scale(dpr, dpr);
    toggleCtx.translate(2, 0); // nudge icons right to center in button
}

function drawSideFishIcon(ctx) {
    ctx.clearRect(0, 0, 32, 32);
    ctx.save();
    ctx.translate(16, 16);
    // Body ellipse
    ctx.fillStyle = ICON_BODY;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail (two bezier lobes)
    ctx.fillStyle = ICON_FIN;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.bezierCurveTo(-13, -3, -16, -6, -14, -7);
    ctx.bezierCurveTo(-12, -7, -10, -3, -10, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.bezierCurveTo(-13, 3, -16, 6, -14, 7);
    ctx.bezierCurveTo(-12, 7, -10, 3, -10, 0);
    ctx.fill();
    // Dorsal fin
    ctx.beginPath();
    ctx.moveTo(-2, -5);
    ctx.bezierCurveTo(0, -9, 4, -8, 5, -5);
    ctx.lineTo(-2, -5);
    ctx.fill();
    // Eye (white + pupil)
    ctx.fillStyle = ICON_EYE_W;
    ctx.beginPath();
    ctx.arc(5, -1.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ICON_EYE_P;
    ctx.beginPath();
    ctx.arc(5.6, -1.5, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawTopFishIcon(ctx) {
    ctx.clearRect(0, 0, 32, 32);
    ctx.save();
    ctx.translate(16, 16);
    // Body: teardrop via bezier
    ctx.fillStyle = ICON_BODY;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.bezierCurveTo(10, -4, 2, -5, -6, -3);
    ctx.bezierCurveTo(-10, -1.5, -10, 1.5, -6, 3);
    ctx.bezierCurveTo(2, 5, 10, 4, 10, 0);
    ctx.fill();
    // Tail fan
    ctx.fillStyle = ICON_FIN;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.bezierCurveTo(-11, -2, -15, -5, -13, -6);
    ctx.bezierCurveTo(-11, -6, -9, -2, -8, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.bezierCurveTo(-11, 2, -15, 5, -13, 6);
    ctx.bezierCurveTo(-11, 6, -9, 2, -8, 0);
    ctx.fill();
    // Pectoral fins (splayed, 50% alpha)
    ctx.fillStyle = 'rgba(51, 102, 170, 0.5)';
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.bezierCurveTo(-2, -6, -5, -8, -3, -9);
    ctx.bezierCurveTo(-1, -9, 1, -6, 0, -3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.bezierCurveTo(-2, 6, -5, 8, -3, 9);
    ctx.bezierCurveTo(-1, 9, 1, 6, 0, 3);
    ctx.fill();
    // Dorsal stripe
    ctx.strokeStyle = ICON_FIN;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, 0);
    ctx.stroke();
    // Eyes at front corners
    ctx.fillStyle = ICON_EYE_W;
    ctx.beginPath();
    ctx.arc(7, -2.2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7, 2.2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ICON_EYE_P;
    ctx.beginPath();
    ctx.arc(7.4, -2.2, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7.4, 2.2, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawAutoIcon(ctx) {
    ctx.clearRect(0, 0, 32, 32);
    ctx.save();
    ctx.translate(14, 16); // offset left to compensate for global +2 fish nudge

    ctx.fillStyle = '#aaccee';

    const r = 9;
    const hw = 1.3; // half-width of arc band
    const arcSpan = 2.3;
    const s1 = -Math.PI * 0.75;
    const e1 = s1 + arcSpan;
    const s2 = s1 + Math.PI;
    const e2 = s2 + arcSpan;

    // Each arrow is one unified path: arc band that widens into an arrowhead
    drawCurvedArrow(ctx, r, hw, s1, e1);
    drawCurvedArrow(ctx, r, hw, s2, e2);

    ctx.restore();
}

function drawCurvedArrow(ctx, r, hw, startAngle, endAngle) {
    const headStart = endAngle - 0.45; // where the arrowhead widens
    const tipAngle = endAngle + 0.05;  // tip extends just past arc end
    const aw = 3; // extra width of arrowhead beyond the band

    ctx.beginPath();
    // Outer arc band from start to where arrowhead begins
    ctx.arc(0, 0, r + hw, startAngle, headStart);
    // Widen out to arrowhead outer edge
    ctx.lineTo((r + hw + aw) * Math.cos(headStart), (r + hw + aw) * Math.sin(headStart));
    // Tip on the arc centerline
    ctx.lineTo(r * Math.cos(tipAngle), r * Math.sin(tipAngle));
    // Narrow in to arrowhead inner edge
    ctx.lineTo((r - hw - aw) * Math.cos(headStart), (r - hw - aw) * Math.sin(headStart));
    // Back to inner arc band width
    ctx.lineTo((r - hw) * Math.cos(headStart), (r - hw) * Math.sin(headStart));
    // Inner arc band back to start (reversed)
    ctx.arc(0, 0, r - hw, headStart, startAngle, true);
    ctx.closePath();
    ctx.fill();
}

function updateToggleButtonLabel() {
    const btn = document.getElementById('view-toggle-btn');
    if (!btn) return;
    if (!toggleCtx) setupToggleCanvas();
    if (!toggleCtx) return;
    if (isDesktop) {
        if (targetViewAngle > 0.5) {
            drawTopFishIcon(toggleCtx);
            btn.title = 'Top View — click for Side';
        } else {
            drawSideFishIcon(toggleCtx);
            btn.title = 'Side View — click for Top';
        }
    } else if (mobileViewMode === 'tilt') {
        drawAutoIcon(toggleCtx);
        btn.title = 'Tilt Control';
    } else if (mobileViewMode === 'side') {
        drawSideFishIcon(toggleCtx);
        btn.title = 'Side View (locked)';
    } else {
        drawTopFishIcon(toggleCtx);
        btn.title = 'Top View (locked)';
    }
}

export function setShowToggleOnMobile(show) {
    showToggleOnMobile = show;
    if (!isDesktop) {
        const btn = document.getElementById('view-toggle-btn');
        if (btn) btn.classList.toggle('hidden', !show);
    }
}

export function getShowToggleOnMobile() {
    return showToggleOnMobile;
}

export function getMobileViewMode() {
    return mobileViewMode;
}

export function setMobileViewMode(mode) {
    mobileViewMode = mode;
    if (mode === 'side') targetViewAngle = 0;
    else if (mode === 'top') targetViewAngle = 1;
    updateToggleButtonLabel();
}

export function initDesktopControls() {
    // Show toggle button after short delay
    setTimeout(() => {
        // Mobile fallback: touch-primary device that hasn't fired orientation events
        if (isDesktop && navigator.maxTouchPoints > 0 &&
            window.matchMedia('(pointer: coarse)').matches) {
            isDesktop = false;
        }

        const btn = document.getElementById('view-toggle-btn');
        if (btn) {
            if (isDesktop) {
                btn.classList.remove('hidden');
            } else {
                btn.classList.toggle('hidden', !showToggleOnMobile);
            }
            updateToggleButtonLabel();
        }
    }, 500);

    // When returning to tab, suppress orientation events briefly
    // (Chrome can fire stale/bogus events on tab focus)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isDesktop) {
            suppressUntil = Date.now() + 1000;
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'v' || e.key === 'V' || e.key === ' ') {
            e.preventDefault();
            toggleView();
        }
    });

    window.addEventListener('wheel', (e) => {
        targetViewAngle = clamp(targetViewAngle + e.deltaY * 0.002, 0, 1);
    }, { passive: true });
}

export function hasOrientationSupport() {
    return !isDesktop;
}

export function getIsDesktop() {
    return isDesktop;
}
