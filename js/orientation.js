// orientation.js — Device orientation detection, view angle smoothing

import { clamp, lerp } from './utils.js';

let viewAngle = 0; // 0 = side view, 1 = top-down
let targetViewAngle = 0;
let hasOrientation = false;
let permissionGranted = false;

const SMOOTH_FACTOR = 0.08;

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
                hasOrientation = true;
            }
        } catch (e) {
            console.log('Orientation permission denied');
        }
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
        permissionGranted = true;
        window.addEventListener('deviceorientation', handleOrientation);
        // Check if events actually fire
        setTimeout(() => {
            if (!hasOrientation) {
                console.log('No orientation events — using desktop controls');
            }
        }, 1000);
        hasOrientation = true;
    }
}

export function initDesktopControls() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'v' || e.key === 'V' || e.key === ' ') {
            e.preventDefault();
            targetViewAngle = targetViewAngle > 0.5 ? 0 : 1;
        }
    });

    window.addEventListener('wheel', (e) => {
        targetViewAngle = clamp(targetViewAngle + e.deltaY * 0.002, 0, 1);
    }, { passive: true });
}

export function hasOrientationSupport() {
    return hasOrientation;
}
