import { describe, it, expect, beforeEach } from 'vitest';
import {
    getFoods, addFood, updateFood, getUneatenCount,
    clearAllFood, loadFoodState, saveFoodState,
} from '../../js/food.js';

beforeEach(() => {
    clearAllFood();
});

describe('addFood', () => {
    it('adds a food particle at the specified position', () => {
        addFood(50, 60);
        const foods = getFoods();
        expect(foods).toHaveLength(1);
        expect(foods[0].x).toBe(50);
        expect(foods[0].z).toBe(60);
    });

    it('food starts at the surface (y=0)', () => {
        addFood(50, 50);
        expect(getFoods()[0].y).toBe(0);
    });

    it('food starts uneaten', () => {
        addFood(50, 50);
        expect(getFoods()[0].eaten).toBe(false);
    });

    it('food starts with age 0', () => {
        addFood(50, 50);
        expect(getFoods()[0].age).toBe(0);
    });

    it('food has a wobble offset in valid range', () => {
        addFood(50, 50);
        // wobbleOffset is rand(0, Math.PI * 2), so it should be in [0, 2*PI)
        expect(getFoods()[0].wobbleOffset).toBeGreaterThanOrEqual(0);
        expect(getFoods()[0].wobbleOffset).toBeLessThan(Math.PI * 2);
    });

    it('food has a random size between 2 and 3.5', () => {
        addFood(50, 50);
        const size = getFoods()[0].size;
        // rand(2, 3.5) returns values in [2, 3.5)
        expect(size).toBeGreaterThanOrEqual(2);
        expect(size).toBeLessThan(3.5);
    });

    it('can add multiple food particles', () => {
        addFood(10, 20);
        addFood(30, 40);
        addFood(50, 60);
        expect(getFoods()).toHaveLength(3);
    });
});

describe('getUneatenCount', () => {
    it('returns 0 with no food', () => {
        expect(getUneatenCount()).toBe(0);
    });

    it('returns count of food particles', () => {
        addFood(50, 50);
        addFood(60, 60);
        expect(getUneatenCount()).toBe(2);
    });

    it('eaten food is removed on next update so count decreases', () => {
        addFood(50, 50);
        addFood(60, 60);
        getFoods()[0].eaten = true;
        updateFood(0.01, 95);
        expect(getUneatenCount()).toBe(1);
    });
});

describe('updateFood', () => {
    it('ages food particles', () => {
        addFood(50, 50);
        updateFood(2, 95);
        expect(getFoods()[0].age).toBeCloseTo(2);
    });

    it('food floats at surface during float time (first 1 second)', () => {
        addFood(50, 50);
        updateFood(0.5, 95);
        // During float time (age < 1), food should stay at y=0
        expect(getFoods()[0].y).toBe(0);
    });

    it('food starts sinking after float time', () => {
        addFood(50, 50);
        updateFood(1.5, 95); // Past the 1-second float time
        expect(getFoods()[0].y).toBeGreaterThan(0);
    });

    it('food stops sinking at tank floor', () => {
        addFood(50, 50);
        // Sink for a long time
        for (let i = 0; i < 20; i++) {
            updateFood(1, 95);
        }
        const food = getFoods()[0];
        if (food) {
            expect(food.y).toBeLessThanOrEqual(95);
        }
    });

    it('removes eaten food', () => {
        addFood(50, 50);
        getFoods()[0].eaten = true;
        updateFood(0.01, 95);
        expect(getFoods()).toHaveLength(0);
    });

    it('removes food after decay time (30 seconds)', () => {
        addFood(50, 50);
        // Age the food past the 30-second decay time
        for (let i = 0; i < 35; i++) {
            updateFood(1, 95);
        }
        expect(getFoods()).toHaveLength(0);
    });

    it('food drifts horizontally while floating', () => {
        addFood(50, 50);
        const xBefore = getFoods()[0].x;
        updateFood(0.5, 95);
        // Surface drift: x += sin(age * 1.5 + wobbleOffset) * 0.3 * dt
        // With dt=0.5 this should produce a nonzero change
        expect(getFoods()[0].x).not.toBe(xBefore);
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
        expect(getFoods()[0].x).not.toBe(xAfterSinkStart);
    });
});

describe('clearAllFood', () => {
    it('removes all food particles', () => {
        addFood(10, 10);
        addFood(20, 20);
        addFood(30, 30);
        clearAllFood();
        expect(getFoods()).toHaveLength(0);
        expect(getUneatenCount()).toBe(0);
    });
});

describe('saveFoodState / loadFoodState', () => {
    it('saveFoodState returns empty array', () => {
        addFood(50, 50);
        const saved = saveFoodState();
        expect(saved).toEqual([]);
    });

    it('loadFoodState clears all food', () => {
        addFood(50, 50);
        addFood(60, 60);
        loadFoodState([]);
        expect(getFoods()).toHaveLength(0);
    });
});
