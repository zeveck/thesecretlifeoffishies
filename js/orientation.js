// orientation.js — Device orientation detection, view angle smoothing

import { clamp, lerp } from './utils.js';

let viewAngle = 0; // 0 = side view, 1 = top-down (start side)
let targetViewAngle = 0;
let isDesktop = true; // assume desktop until proven otherwise
let orientationEventCount = 0;
let permissionGranted = false;
let suppressUntil = 0; // timestamp — ignore orientation events until this time

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
        if (btn) btn.classList.add('hidden');
    }

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
    targetViewAngle = targetViewAngle > 0.5 ? 0 : 1;
}

export function initDesktopControls() {
    // Show toggle button after short delay — hide if mobile detected
    setTimeout(() => {
        if (isDesktop) {
            const btn = document.getElementById('view-toggle-btn');
            if (btn) btn.classList.remove('hidden');
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
