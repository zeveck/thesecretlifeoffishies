import { describe, it, expect } from 'vitest';
import {
    lerp, clamp, rand, randInt, dist, dist3,
    angleTo, normalizeAngle, lerpAngle,
    hslToString, hexToRgb, rgbaString, colorLerp, desaturate, adjustSaturation,
} from '../../js/utils.js';

describe('clamp', () => {
    it('returns value when within range', () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });

    it('clamps to min when value is below', () => {
        expect(clamp(-3, 0, 10)).toBe(0);
    });

    it('clamps to max when value is above', () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });

    it('returns min when value equals min', () => {
        expect(clamp(0, 0, 10)).toBe(0);
    });

    it('returns max when value equals max', () => {
        expect(clamp(10, 0, 10)).toBe(10);
    });

    it('works with negative ranges', () => {
        expect(clamp(-5, -10, -1)).toBe(-5);
        expect(clamp(-15, -10, -1)).toBe(-10);
        expect(clamp(0, -10, -1)).toBe(-1);
    });

    it('works when min equals max', () => {
        expect(clamp(5, 3, 3)).toBe(3);
    });
});

describe('dist', () => {
    it('returns 0 for same point', () => {
        expect(dist(5, 5, 5, 5)).toBe(0);
    });

    it('computes horizontal distance', () => {
        expect(dist(0, 0, 3, 0)).toBe(3);
    });

    it('computes vertical distance', () => {
        expect(dist(0, 0, 0, 4)).toBe(4);
    });

    it('computes diagonal distance (3-4-5 triangle)', () => {
        expect(dist(0, 0, 3, 4)).toBe(5);
    });

    it('is commutative', () => {
        expect(dist(1, 2, 5, 8)).toBe(dist(5, 8, 1, 2));
    });
});

describe('dist3', () => {
    it('returns 0 for same point', () => {
        expect(dist3(1, 2, 3, 1, 2, 3)).toBe(0);
    });

    it('computes 3D distance correctly', () => {
        // sqrt(1 + 4 + 4) = 3
        expect(dist3(0, 0, 0, 1, 2, 2)).toBe(3);
    });
});

describe('rand', () => {
    it('returns values within the specified range', () => {
        for (let i = 0; i < 100; i++) {
            const val = rand(5, 10);
            expect(val).toBeGreaterThanOrEqual(5);
            expect(val).toBeLessThan(10);
        }
    });

    it('returns min when range is zero width', () => {
        expect(rand(5, 5)).toBe(5);
    });

    it('works with negative ranges', () => {
        for (let i = 0; i < 50; i++) {
            const val = rand(-10, -5);
            expect(val).toBeGreaterThanOrEqual(-10);
            expect(val).toBeLessThan(-5);
        }
    });
});

describe('randInt', () => {
    it('returns integers within range (inclusive)', () => {
        const results = new Set();
        for (let i = 0; i < 200; i++) {
            const val = randInt(1, 3);
            expect(Number.isInteger(val)).toBe(true);
            expect(val).toBeGreaterThanOrEqual(1);
            expect(val).toBeLessThanOrEqual(3);
            results.add(val);
        }
        // With 200 iterations, we should hit all three values
        expect(results.has(1)).toBe(true);
        expect(results.has(2)).toBe(true);
        expect(results.has(3)).toBe(true);
    });
});

describe('lerp', () => {
    it('returns a at t=0', () => {
        expect(lerp(10, 20, 0)).toBe(10);
    });

    it('returns b at t=1', () => {
        expect(lerp(10, 20, 1)).toBe(20);
    });

    it('returns midpoint at t=0.5', () => {
        expect(lerp(10, 20, 0.5)).toBe(15);
    });

    it('extrapolates beyond t=1', () => {
        expect(lerp(0, 10, 2)).toBe(20);
    });
});

describe('angleTo', () => {
    it('returns 0 for point directly to the right', () => {
        expect(angleTo(0, 0, 1, 0)).toBe(0);
    });

    it('returns PI/2 for point directly below', () => {
        expect(angleTo(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2);
    });

    it('returns PI for point directly to the left', () => {
        expect(angleTo(0, 0, -1, 0)).toBeCloseTo(Math.PI);
    });

    it('returns -PI/2 for point directly above', () => {
        expect(angleTo(0, 0, 0, -1)).toBeCloseTo(-Math.PI / 2);
    });
});

describe('normalizeAngle', () => {
    it('returns angle already in range unchanged', () => {
        expect(normalizeAngle(0)).toBe(0);
        expect(normalizeAngle(1)).toBe(1);
        expect(normalizeAngle(-1)).toBe(-1);
    });

    it('normalizes angles greater than PI', () => {
        const result = normalizeAngle(Math.PI + 1);
        expect(result).toBeCloseTo(1 - Math.PI);
    });

    it('normalizes angles less than -PI', () => {
        const result = normalizeAngle(-Math.PI - 1);
        expect(result).toBeCloseTo(Math.PI - 1);
    });

    it('normalizes large positive angles', () => {
        const result = normalizeAngle(5 * Math.PI);
        expect(result).toBeCloseTo(Math.PI);
    });
});

describe('lerpAngle', () => {
    it('interpolates between two close angles', () => {
        const result = lerpAngle(0, 1, 0.5);
        expect(result).toBeCloseTo(0.5);
    });

    it('takes the short path around the circle', () => {
        // From nearly PI to nearly -PI should go through PI, not through 0
        const result = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
        // The midpoint should be near +/- PI
        expect(Math.abs(result)).toBeCloseTo(Math.PI, 0);
    });
});

describe('hslToString', () => {
    it('returns hsl string without alpha', () => {
        expect(hslToString(180, 50, 60)).toBe('hsl(180,50%,60%)');
    });

    it('returns hsl string with alpha=1', () => {
        expect(hslToString(180, 50, 60, 1)).toBe('hsl(180,50%,60%)');
    });

    it('returns hsla string with alpha<1', () => {
        expect(hslToString(180, 50, 60, 0.5)).toBe('hsla(180,50%,60%,0.5)');
    });
});

describe('hexToRgb', () => {
    it('converts white', () => {
        expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('converts black', () => {
        expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('converts a color correctly', () => {
        expect(hexToRgb('#2244aa')).toEqual({ r: 34, g: 68, b: 170 });
    });
});

describe('rgbaString', () => {
    it('returns rgba with alpha=1 by default', () => {
        expect(rgbaString(255, 128, 0)).toBe('rgba(255,128,0,1)');
    });

    it('includes explicit alpha', () => {
        expect(rgbaString(255, 128, 0, 0.5)).toBe('rgba(255,128,0,0.5)');
    });
});

describe('colorLerp', () => {
    it('returns c1 at t=0', () => {
        const c1 = { r: 0, g: 0, b: 0 };
        const c2 = { r: 255, g: 255, b: 255 };
        expect(colorLerp(c1, c2, 0)).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('returns c2 at t=1', () => {
        const c1 = { r: 0, g: 0, b: 0 };
        const c2 = { r: 255, g: 255, b: 255 };
        expect(colorLerp(c1, c2, 1)).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('returns midpoint at t=0.5', () => {
        const c1 = { r: 0, g: 100, b: 200 };
        const c2 = { r: 100, g: 200, b: 0 };
        const result = colorLerp(c1, c2, 0.5);
        expect(result).toEqual({ r: 50, g: 150, b: 100 });
    });
});

describe('desaturate', () => {
    it('partially desaturates toward gray', () => {
        // #ff0000: r=255, g=0, b=0. gray = 0.299*255 ≈ 76.245
        // r = round(lerp(255, 76.245, 0.5)) = round(165.6225) = 166
        // g = round(lerp(0, 76.245, 0.5)) = round(38.1225) = 38
        // b = round(lerp(0, 76.245, 0.5)) = round(38.1225) = 38
        const result = desaturate('#ff0000', 0.5);
        expect(result).toBe('rgba(166,38,38,1)');
    });

    it('returns gray at full desaturation (amount=1)', () => {
        const result = desaturate('#ff0000', 1);
        // Gray value of pure red: 0.299 * 255 = ~76
        expect(result).toBe('rgba(76,76,76,1)');
    });

    it('returns original color at amount=0', () => {
        const result = desaturate('#ff0000', 0);
        expect(result).toBe('rgba(255,0,0,1)');
    });
});

describe('adjustSaturation', () => {
    it('boosts saturation away from gray', () => {
        // #8080ff: r=128, g=128, b=255. gray = 0.299*128 + 0.587*128 + 0.114*255 ≈ 142.44
        // r = clamp(round(128 + (128 - 142.44) * 0.5), 0, 255) = clamp(round(120.78), 0, 255) = 121
        // g = clamp(round(128 + (128 - 142.44) * 0.5), 0, 255) = 121
        // b = clamp(round(255 + (255 - 142.44) * 0.5), 0, 255) = clamp(round(311.28), 0, 255) = 255
        const result = adjustSaturation('#8080ff', 0.5);
        expect(result).toBe('rgba(121,121,255,1)');
    });

    it('clamps to 0-255 range', () => {
        // Extreme saturation boost on pure red: gray = 0.299*255 ≈ 76.245
        // r = clamp(round(255 + (255 - 76.245) * 10), 0, 255) = 255
        // g = clamp(round(0 + (0 - 76.245) * 10), 0, 255) = 0
        // b = clamp(round(0 + (0 - 76.245) * 10), 0, 255) = 0
        const result = adjustSaturation('#ff0000', 10);
        expect(result).toBe('rgba(255,0,0,1)');
    });
});
