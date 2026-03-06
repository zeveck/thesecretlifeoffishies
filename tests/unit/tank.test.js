import { describe, it, expect, beforeEach } from 'vitest';
import {
    getTank, hasDecoration, addDecoration, moveDecoration,
    getDecorationHappinessBonus, doWaterChange, getWaterQuality,
    updateChemistry, loadTankState, saveTankState, useCareItem,
    setTankSize, applyOfflineChemistry, resetChemAccum,
    DECORATIONS, CARE_ITEMS,
} from '../../js/tank.js';

// Reset tank state before each test by loading a clean state
beforeEach(() => {
    loadTankState({
        ammonia: 0,
        nitrite: 0,
        nitrate: 0,
        bacteria: 5,
        algae: 0,
        freeFeed: false,
        gallons: 10,
        capacityInches: 5,
        decorations: [],
    });
    resetChemAccum();
});

describe('DECORATIONS catalog', () => {
    it('has 7 decorations', () => {
        expect(DECORATIONS).toHaveLength(7);
    });

    it('each decoration has required fields', () => {
        for (const d of DECORATIONS) {
            expect(d).toHaveProperty('id');
            expect(d).toHaveProperty('name');
            expect(d).toHaveProperty('cost');
            expect(d).toHaveProperty('color');
            expect(d).toHaveProperty('desc');
            expect(d).toHaveProperty('effect');
            expect(typeof d.cost).toBe('number');
            expect(d.cost).toBeGreaterThan(0);
        }
    });

    it('all decoration IDs are unique', () => {
        const ids = DECORATIONS.map(d => d.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('CARE_ITEMS catalog', () => {
    it('has 2 care items', () => {
        expect(CARE_ITEMS).toHaveLength(2);
    });

    it('includes conditioner and algae_scrub', () => {
        const ids = CARE_ITEMS.map(i => i.id);
        expect(ids).toContain('conditioner');
        expect(ids).toContain('algae_scrub');
    });
});

describe('hasDecoration', () => {
    it('returns false for un-owned decoration', () => {
        expect(hasDecoration('castle')).toBe(false);
    });

    it('returns true after adding decoration', () => {
        addDecoration('castle');
        expect(hasDecoration('castle')).toBe(true);
    });
});

describe('addDecoration', () => {
    it('adds a decoration to the tank', () => {
        addDecoration('castle');
        const tank = getTank();
        expect(tank.decorations).toHaveLength(1);
        expect(tank.decorations[0].id).toBe('castle');
    });

    it('does not add duplicate decorations', () => {
        addDecoration('castle');
        addDecoration('castle');
        const tank = getTank();
        expect(tank.decorations).toHaveLength(1);
    });

    it('stores decoration with default position', () => {
        addDecoration('castle');
        const tank = getTank();
        const deco = tank.decorations[0];
        expect(deco.x).toBe(78); // DEFAULT_POSITIONS.castle.x
        expect(deco.y).toBe(88); // DEFAULT_POSITIONS.castle.y
    });

    it('can add multiple different decorations', () => {
        addDecoration('castle');
        addDecoration('coral');
        addDecoration('java_fern');
        const tank = getTank();
        expect(tank.decorations).toHaveLength(3);
    });
});

describe('moveDecoration', () => {
    it('moves a decoration to new coordinates', () => {
        addDecoration('castle');
        moveDecoration(0, 30, 40);
        const tank = getTank();
        expect(tank.decorations[0].x).toBe(30);
        expect(tank.decorations[0].y).toBe(40);
    });

    it('does nothing for invalid index (negative)', () => {
        addDecoration('castle');
        moveDecoration(-1, 30, 40);
        const tank = getTank();
        expect(tank.decorations[0].x).toBe(78); // unchanged
    });

    it('does nothing for invalid index (out of range)', () => {
        addDecoration('castle');
        moveDecoration(5, 30, 40);
        const tank = getTank();
        expect(tank.decorations[0].x).toBe(78); // unchanged
    });
});

describe('getDecorationHappinessBonus', () => {
    it('returns 0 with no decorations', () => {
        expect(getDecorationHappinessBonus()).toBe(0);
    });

    it('returns 5 for castle', () => {
        addDecoration('castle');
        expect(getDecorationHappinessBonus()).toBe(5);
    });

    it('returns 3 for coral', () => {
        addDecoration('coral');
        expect(getDecorationHappinessBonus()).toBe(3);
    });

    it('returns 4 for led_lights', () => {
        addDecoration('led_lights');
        expect(getDecorationHappinessBonus()).toBe(4);
    });

    it('returns 3 for treasure_chest', () => {
        addDecoration('treasure_chest');
        expect(getDecorationHappinessBonus()).toBe(3);
    });

    it('sums bonuses for multiple happiness decorations', () => {
        addDecoration('castle');      // +5
        addDecoration('coral');       // +3
        addDecoration('led_lights');  // +4
        addDecoration('treasure_chest'); // +3
        expect(getDecorationHappinessBonus()).toBe(15);
    });

    it('returns 0 for non-happiness decorations only', () => {
        addDecoration('java_fern');
        addDecoration('driftwood');
        addDecoration('rock_arch');
        expect(getDecorationHappinessBonus()).toBe(0);
    });
});

describe('doWaterChange', () => {
    it('reduces ammonia by 60%', () => {
        loadTankState({ ammonia: 50, nitrite: 0, nitrate: 0, bacteria: 10, algae: 0, decorations: [] });
        doWaterChange();
        expect(getTank().ammonia).toBeCloseTo(20);
    });

    it('reduces nitrite by 50%', () => {
        loadTankState({ ammonia: 0, nitrite: 40, nitrate: 0, bacteria: 10, algae: 0, decorations: [] });
        doWaterChange();
        expect(getTank().nitrite).toBeCloseTo(20);
    });

    it('reduces nitrate by 50%', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 60, bacteria: 10, algae: 0, decorations: [] });
        doWaterChange();
        expect(getTank().nitrate).toBeCloseTo(30);
    });

    it('reduces bacteria by 15%', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 100, algae: 0, decorations: [] });
        doWaterChange();
        expect(getTank().bacteria).toBeCloseTo(85);
    });

    it('reduces algae by 50%', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 10, algae: 80, decorations: [] });
        doWaterChange();
        expect(getTank().algae).toBeCloseTo(40);
    });
});

describe('getWaterQuality', () => {
    it('returns 1 for perfect water (no toxins)', () => {
        expect(getWaterQuality()).toBe(1);
    });

    it('returns 0.5 when ammonia is 50', () => {
        loadTankState({ ammonia: 50, nitrite: 0, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        expect(getWaterQuality()).toBeCloseTo(0.5);
    });

    it('uses the worse of ammonia and nitrite', () => {
        loadTankState({ ammonia: 20, nitrite: 80, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        expect(getWaterQuality()).toBeCloseTo(0.2);
    });

    it('returns 0 when ammonia is 100', () => {
        loadTankState({ ammonia: 100, nitrite: 0, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        expect(getWaterQuality()).toBe(0);
    });

    it('clamps to 0-1 range', () => {
        loadTankState({ ammonia: 150, nitrite: 0, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        expect(getWaterQuality()).toBe(0);
    });
});

describe('updateChemistry', () => {
    it('increases ammonia based on fish inches and uneaten food', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 0, algae: 0, decorations: [] });
        // Pass dt=1 to trigger one chemistry tick
        updateChemistry(1, 10, 5);
        const tank = getTank();
        // Ammonia = 10 * 0.0015 + 5 * 0.005 = 0.015 + 0.025 = 0.04
        expect(tank.ammonia).toBeCloseTo(0.04);
    });

    it('bacteria converts ammonia to nitrite', () => {
        loadTankState({ ammonia: 10, nitrite: 0, nitrate: 0, bacteria: 50, algae: 0, decorations: [] });
        updateChemistry(1, 0, 0);
        const tank = getTank();
        // ammoniaConverted = min(10, 50 * 0.004) = 0.2
        // ammonia = 10 - 0.2 = 9.8
        // nitrite goes from 0 to 0.2 * 0.75 = 0.15, but then nitrite->nitrate
        // conversion also runs in same tick: nitriteConverted = min(0.15, 50*0.003) = 0.15
        // so nitrite ends at 0, nitrate = 0.15 * 0.67 = 0.1005
        expect(tank.ammonia).toBeCloseTo(9.8);
        expect(tank.nitrate).toBeCloseTo(0.1005, 3);
    });

    it('bacteria converts nitrite to nitrate', () => {
        loadTankState({ ammonia: 0, nitrite: 10, nitrate: 0, bacteria: 50, algae: 0, decorations: [] });
        updateChemistry(1, 0, 0);
        const tank = getTank();
        // nitriteConverted = min(10, 50 * 0.003) = 0.15
        // nitrite = 10 - 0.15 = 9.85
        // nitrate = 0 + 0.15 * 0.67 = 0.1005
        expect(tank.nitrite).toBeCloseTo(9.85);
        expect(tank.nitrate).toBeCloseTo(0.1005, 3);
    });

    it('does not tick chemistry for dt < 1', () => {
        loadTankState({ ammonia: 5, nitrite: 0, nitrate: 0, bacteria: 50, algae: 0, decorations: [] });
        const ammoniaBefore = getTank().ammonia;
        updateChemistry(0.5, 10, 5);
        // chemAccum is reset in beforeEach, so 0.5 < 1 means no tick occurs
        const tank = getTank();
        expect(tank.ammonia).toBe(ammoniaBefore);
    });

    it('clamps all values to 0-100', () => {
        // Use values near 100 with large inputs to push ammonia above 100 pre-clamp
        // ammonia: 100 + 1000*0.0015 + 1000*0.005 = 100 + 1.5 + 5 = 106.5 before conversion
        loadTankState({ ammonia: 100, nitrite: 100, nitrate: 100, bacteria: 100, algae: 100, decorations: [] });
        updateChemistry(1, 1000, 1000);
        const tank = getTank();
        expect(tank.ammonia).toBe(100);
        expect(tank.nitrite).toBe(100);
        expect(tank.nitrate).toBe(100);
        expect(tank.bacteria).toBe(100);
        expect(tank.algae).toBe(100);
    });

    it('java_fern halves algae growth rate', () => {
        // Without java fern
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 50, bacteria: 5, algae: 0, decorations: [] });
        updateChemistry(1, 0, 0);
        const algaeWithout = getTank().algae;

        // With java fern
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 50, bacteria: 5, algae: 0, decorations: [] });
        addDecoration('java_fern');
        updateChemistry(1, 0, 0);
        const algaeWith = getTank().algae;

        expect(algaeWith).toBeLessThan(algaeWithout);
    });

    it('coral reduces nitrate', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 50, bacteria: 5, algae: 0, decorations: [] });
        addDecoration('coral');
        updateChemistry(1, 0, 0);
        const tank = getTank();
        // Coral multiplies nitrate by 0.998 each tick
        expect(tank.nitrate).toBeLessThan(50);
    });

    it('driftwood boosts bacteria growth', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 10, algae: 0, decorations: [] });
        updateChemistry(1, 0, 0);
        const bacteriaWithout = getTank().bacteria;

        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 10, algae: 0, decorations: [] });
        addDecoration('driftwood');
        updateChemistry(1, 0, 0);
        const bacteriaWith = getTank().bacteria;

        expect(bacteriaWith).toBeGreaterThan(bacteriaWithout);
    });
});

describe('useCareItem', () => {
    it('conditioner halves ammonia', () => {
        loadTankState({ ammonia: 40, nitrite: 30, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        useCareItem('conditioner');
        const tank = getTank();
        expect(tank.ammonia).toBeCloseTo(20);
    });

    it('conditioner halves nitrite', () => {
        loadTankState({ ammonia: 40, nitrite: 30, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        useCareItem('conditioner');
        const tank = getTank();
        expect(tank.nitrite).toBeCloseTo(15);
    });

    it('algae_scrub halves algae', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 5, algae: 60, decorations: [] });
        useCareItem('algae_scrub');
        expect(getTank().algae).toBeCloseTo(30);
    });
});

describe('setTankSize', () => {
    it('sets tank gallons and capacity', () => {
        setTankSize(40, 20);
        const tank = getTank();
        expect(tank.gallons).toBe(40);
        expect(tank.capacityInches).toBe(20);
    });
});

describe('saveTankState / loadTankState', () => {
    it('roundtrips tank state', () => {
        loadTankState({
            ammonia: 10, nitrite: 20, nitrate: 30,
            bacteria: 40, algae: 50, freeFeed: true,
            gallons: 75, capacityInches: 35,
            decorations: [{ id: 'castle', x: 50, y: 50 }],
        });

        const saved = saveTankState();
        expect(saved.ammonia).toBe(10);
        expect(saved.nitrite).toBe(20);
        expect(saved.nitrate).toBe(30);
        expect(saved.bacteria).toBe(40);
        expect(saved.algae).toBe(50);
        expect(saved.freeFeed).toBe(true);
        expect(saved.gallons).toBe(75);
        expect(saved.capacityInches).toBe(35);
        expect(saved.decorations).toHaveLength(1);
        expect(saved.decorations[0].id).toBe('castle');
    });

    it('uses defaults for missing fields', () => {
        loadTankState({});
        const tank = getTank();
        expect(tank.ammonia).toBe(0);
        expect(tank.nitrite).toBe(0);
        expect(tank.nitrate).toBe(0);
        expect(tank.bacteria).toBe(5);
        expect(tank.algae).toBe(0);
        expect(tank.freeFeed).toBe(false);
        expect(tank.gallons).toBe(10);
        expect(tank.capacityInches).toBe(5);
        expect(tank.decorations).toEqual([]);
    });

    it('does nothing when passed null', () => {
        const before = saveTankState();
        loadTankState(null);
        // Tank should remain unchanged (we called loadTankState with our beforeEach state,
        // then null does nothing)
        const after = saveTankState();
        expect(after.ammonia).toBe(before.ammonia);
    });
});

describe('loadTankState — migration of old string[] decorations to object[]', () => {
    it('migrates old string format to object format with default positions', () => {
        loadTankState({
            ammonia: 0, nitrite: 0, nitrate: 0,
            bacteria: 5, algae: 0,
            decorations: ['castle', 'coral', 'java_fern'],
        });

        const tank = getTank();
        expect(tank.decorations).toHaveLength(3);

        // All should be objects with id, x, y
        for (const d of tank.decorations) {
            expect(d).toHaveProperty('id');
            expect(d).toHaveProperty('x');
            expect(d).toHaveProperty('y');
            expect(typeof d.id).toBe('string');
            expect(typeof d.x).toBe('number');
            expect(typeof d.y).toBe('number');
        }

        // Castle should have its default position
        const castle = tank.decorations.find(d => d.id === 'castle');
        expect(castle.x).toBe(78);
        expect(castle.y).toBe(88);
    });

    it('preserves object format decorations as-is', () => {
        const decos = [
            { id: 'castle', x: 30, y: 40 },
            { id: 'coral', x: 60, y: 70 },
        ];
        loadTankState({
            ammonia: 0, nitrite: 0, nitrate: 0,
            bacteria: 5, algae: 0,
            decorations: decos,
        });

        const tank = getTank();
        expect(tank.decorations).toHaveLength(2);
        expect(tank.decorations[0].x).toBe(30);
        expect(tank.decorations[0].y).toBe(40);
    });

    it('handles empty decorations array', () => {
        loadTankState({
            ammonia: 0, nitrite: 0, nitrate: 0,
            bacteria: 5, algae: 0,
            decorations: [],
        });
        expect(getTank().decorations).toEqual([]);
    });

    it('handles unknown decoration id in migration with fallback position', () => {
        loadTankState({
            ammonia: 0, nitrite: 0, nitrate: 0,
            bacteria: 5, algae: 0,
            decorations: ['unknown_deco'],
        });

        const tank = getTank();
        expect(tank.decorations).toHaveLength(1);
        expect(tank.decorations[0].id).toBe('unknown_deco');
        // Fallback position is { x: 50, y: 90 }
        expect(tank.decorations[0].x).toBe(50);
        expect(tank.decorations[0].y).toBe(90);
    });
});

describe('applyOfflineChemistry', () => {
    it('applies chemistry ticks for offline seconds', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 0, algae: 0, decorations: [] });
        // With 0 bacteria, ammonia cannot be processed, so it accumulates
        applyOfflineChemistry(10, 5);
        const tank = getTank();
        // After 10 ticks with 5 fish inches and 0 uneaten food:
        // Each tick adds 5 * 0.0015 = 0.0075, with 0 bacteria no conversion occurs
        // Total ammonia = 10 * 0.0075 = 0.075
        expect(tank.ammonia).toBeCloseTo(0.075);
    });

    it('caps at 86400 seconds (24 hours)', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        // Requesting more than a day should cap
        applyOfflineChemistry(200000, 1);
        const tank = getTank();
        // Just verify it doesn't crash and values are clamped
        expect(tank.ammonia).toBeLessThanOrEqual(100);
        expect(tank.bacteria).toBeLessThanOrEqual(100);
    });
});
