// utils.js — Math helpers, color utilities, angle math

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

export function rand(min, max) {
    return Math.random() * (max - min) + min;
}

export function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

export function dist(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export function dist3(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function angleTo(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

export function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

export function lerpAngle(a, b, t) {
    return a + normalizeAngle(b - a) * t;
}

export function hslToString(h, s, l, a = 1) {
    return a < 1 ? `hsla(${h},${s}%,${l}%,${a})` : `hsl(${h},${s}%,${l}%)`;
}

export function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

export function rgbaString(r, g, b, a = 1) {
    return `rgba(${r},${g},${b},${a})`;
}

export function colorLerp(c1, c2, t) {
    return {
        r: Math.round(lerp(c1.r, c2.r, t)),
        g: Math.round(lerp(c1.g, c2.g, t)),
        b: Math.round(lerp(c1.b, c2.b, t)),
    };
}

export function desaturate(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    return rgbaString(
        Math.round(lerp(r, gray, amount)),
        Math.round(lerp(g, gray, amount)),
        Math.round(lerp(b, gray, amount))
    );
}

// amount > 0 = more saturated, < 0 = less saturated
export function adjustSaturation(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    // Lerp away from gray (boost) or toward gray (reduce)
    return rgbaString(
        clamp(Math.round(r + (r - gray) * amount), 0, 255),
        clamp(Math.round(g + (g - gray) * amount), 0, 255),
        clamp(Math.round(b + (b - gray) * amount), 0, 255)
    );
}
