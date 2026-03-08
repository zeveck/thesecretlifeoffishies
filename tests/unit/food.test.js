import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    getFoods, addFood, updateFood, getUneatenCount,
    clearAllFood, loadFoodState, saveFoodState,
} from '../../js/food.js';

function assertCloseTo(actual, expected, precision = 5) {
    const eps = Math.pow(10, -precision) / 2;
    assert.ok(Math.abs(actual - expected) < eps,
        `Expected ${actual} to be close to ${expected}`);
}

beforeEach(() => {
    clearAllFood();
});

describe('addFood', () => {
    it('adds a food particle at the specified position', () => {
        addFood(50, 60);
        const foods = getFoods();
        assert.strictEqual(foods.length, 1);
        assert.strictEqual(foods[0].x, 50);
        assert.strictEqual(foods[0].z, 60);
    });

    it('food starts at the surface (y=0)', () => {
        addFood(50, 50);
        assert.strictEqual(getFoods()[0].y, 0);
    });

    it('food starts uneaten', () => {
        addFood(50, 50);
        assert.strictEqual(getFoods()[0].eaten, false);
    });

    it('food starts with age 0', () => {
        addFood(50, 50);
        assert.strictEqual(getFoods()[0].age, 0);
    });

    it('food has a wobble offset in valid range', () => {
        addFood(50, 50);
        // wobbleOffset is rand(0, Math.PI * 2), so it should be in [0, 2*PI)
        assert.ok(getFoods()[0].wobbleOffset >= 0);
        assert.ok(getFoods()[0].wobbleOffset < Math.PI * 2);
    });

    it('food has a random size between 2 and 3.5', () => {
        addFood(50, 50);
        const size = getFoods()[0].size;
        // rand(2, 3.5) returns values in [2, 3.5)
        assert.ok(size >= 2);
        assert.ok(size < 3.5);
    });

    it('can add multiple food particles', () => {
        addFood(10, 20);
        addFood(30, 40);
        addFood(50, 60);
        assert.strictEqual(getFoods().length, 3);
    });
});

describe('getUneatenCount', () => {
    it('returns 0 with no food', () => {
        assert.strictEqual(getUneatenCount(), 0);
    });

    it('returns count of food particles', () => {
        addFood(50, 50);
        addFood(60, 60);
        assert.strictEqual(getUneatenCount(), 2);
    });

    it('eaten food is removed on next update so count decreases', () => {
        addFood(50, 50);
        addFood(60, 60);
        getFoods()[0].eaten = true;
        updateFood(0.01, 95);
        assert.strictEqual(getUneatenCount(), 1);
    });
});

describe('updateFood', () => {
    it('ages food particles', () => {
        addFood(50, 50);
        updateFood(2, 95);
        assertCloseTo(getFoods()[0].age, 2);
    });

    it('food floats at surface during float time (first 1 second)', () => {
        addFood(50, 50);
        updateFood(0.5, 95);
        // During float time (age < 1), food should stay at y=0
        assert.strictEqual(getFoods()[0].y, 0);
    });

    it('food starts sinking after float time', () => {
        addFood(50, 50);
        updateFood(1.5, 95); // Past the 1-second float time
        assert.ok(getFoods()[0].y > 0);
    });

    it('food stops sinking at tank floor', () => {
        addFood(50, 50);
        // Sink for a long time
        for (let i = 0; i < 20; i++) {
            updateFood(1, 95);
        }
        const food = getFoods()[0];
        if (food) {
            assert.ok(food.y <= 95);
        }
    });

    it('removes eaten food', () => {
        addFood(50, 50);
        getFoods()[0].eaten = true;
        updateFood(0.01, 95);
        assert.strictEqual(getFoods().length, 0);
    });

    it('removes food after decay time (30 seconds)', () => {
        addFood(50, 50);
        // Age the food past the 30-second decay time
        for (let i = 0; i < 35; i++) {
            updateFood(1, 95);
        }
        assert.strictEqual(getFoods().length, 0);
    });

    it('food drifts horizontally while floating', () => {
        addFood(50, 50);
        const xBefore = getFoods()[0].x;
        updateFood(0.5, 95);
        // Surface drift: x += sin(age * 1.5 + wobbleOffset) * 0.3 * dt
        // With dt=0.5 this should produce a nonzero change
        assert.notStrictEqual(getFoods()[0].x, xBefore);
    });

    it('food wobbles while sinking', () => {
        addFood(50, 50);
        const xBefore = getFoods()[0].x;
        // First update past float time into sinking
        updateFood(1.5, 95);
        const xAfterSinkStart = getFoods()[0].x;
        // Continue sinking with more wobble
        updateFood(0.5, 95);
        // x should change due to wobble during sinking
        assert.notStrictEqual(getFoods()[0].x, xAfterSinkStart);
    });
});

describe('clearAllFood', () => {
    it('removes all food particles', () => {
        addFood(10, 10);
        addFood(20, 20);
        addFood(30, 30);
        clearAllFood();
        assert.strictEqual(getFoods().length, 0);
        assert.strictEqual(getUneatenCount(), 0);
    });
});

describe('saveFoodState / loadFoodState', () => {
    it('saveFoodState returns empty array', () => {
        addFood(50, 50);
        const saved = saveFoodState();
        assert.deepStrictEqual(saved, []);
    });

    it('loadFoodState clears all food', () => {
        addFood(50, 50);
        addFood(60, 60);
        loadFoodState([]);
        assert.strictEqual(getFoods().length, 0);
    });
});
