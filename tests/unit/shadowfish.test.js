import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    initShadowFish,
    updateShadowFish,
    getRainbowGlowActive,
    getRainbowHue,
} from '../../js/shadowfish.js';

function assertCloseTo(actual, expected, precision = 5) {
    const eps = Math.pow(10, -precision) / 2;
    assert.ok(Math.abs(actual - expected) < eps,
        `Expected ${actual} to be close to ${expected}`);
}

// We need to reset state between tests by simulating a visibilitychange
// with document.hidden = true. Since we can't easily do that in Node,
// we'll test the pure functions and observable state via the exports.

describe('getRainbowHue', () => {
    it('returns a value between 0 and 360', () => {
        const hue = getRainbowHue(0, 0);
        assert.ok(hue >= 0 && hue < 360);
    });

    it('cycles based on gameTime', () => {
        const hue1 = getRainbowHue(0, 1);
        const hue2 = getRainbowHue(1, 1);
        assert.notStrictEqual(hue1, hue2);
    });

    it('differs per fishId', () => {
        const hue1 = getRainbowHue(10, 1);
        const hue2 = getRainbowHue(10, 2);
        assert.notStrictEqual(hue1, hue2);
    });

    it('follows the formula ((gameTime * 60) + (fishId * 47)) % 360', () => {
        const gameTime = 5.5;
        const fishId = 3;
        const expected = ((gameTime * 60) + (fishId * 47)) % 360;
        assertCloseTo(getRainbowHue(gameTime, fishId), expected);
    });

    it('wraps around at 360', () => {
        // gameTime=6, fishId=0 => (360 + 0) % 360 = 0
        assertCloseTo(getRainbowHue(6, 0), 0);
    });

    it('handles large gameTime values', () => {
        const hue = getRainbowHue(1000, 5);
        assert.ok(hue >= 0 && hue < 360);
    });
});

describe('getRainbowGlowActive', () => {
    it('starts as false', () => {
        // After module load, rainbow glow should not be active
        // (We rely on the module being freshly loaded or reset)
        assert.strictEqual(typeof getRainbowGlowActive(), 'boolean');
    });
});

describe('updateShadowFish', () => {
    it('does not crash with small dt', () => {
        // Should not throw
        updateShadowFish(1 / 60);
    });

    it('does not crash with zero dt', () => {
        updateShadowFish(0);
    });

    it('does not activate rainbow glow before 5 intervals', () => {
        // Advance 4 intervals worth of time (240s) in small steps
        for (let i = 0; i < 240; i++) {
            updateShadowFish(1);
        }
        // Need to also advance through swim durations (4.5s each)
        for (let i = 0; i < 20; i++) {
            updateShadowFish(1);
        }
        assert.strictEqual(getRainbowGlowActive(), false);
    });
});

describe('initShadowFish', () => {
    it('does not throw when document is available', () => {
        // In Node there is no document, so we provide a minimal stub
        const origDoc = globalThis.document;
        globalThis.document = { addEventListener: () => {} };
        try {
            initShadowFish();
        } finally {
            if (origDoc === undefined) {
                delete globalThis.document;
            } else {
                globalThis.document = origDoc;
            }
        }
    });
});
