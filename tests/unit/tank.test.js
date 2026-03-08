import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    getTank, hasDecoration, addDecoration, moveDecoration,
    getDecorationHappinessBonus, doWaterChange, getWaterQuality,
    updateChemistry, loadTankState, saveTankState, useCareItem,
    setTankSize, applyOfflineChemistry, resetChemAccum,
    DECORATIONS, CARE_ITEMS,
} from '../../js/tank.js';

function assertCloseTo(actual, expected, precision = 5) {
    const eps = Math.pow(10, -precision) / 2;
    assert.ok(Math.abs(actual - expected) < eps,
        `Expected ${actual} to be close to ${expected}`);
}

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
        assert.strictEqual(DECORATIONS.length, 7);
    });

    it('each decoration has required fields', () => {
        for (const d of DECORATIONS) {
            assert.ok('id' in d);
            assert.ok('name' in d);
            assert.ok('cost' in d);
            assert.ok('color' in d);
            assert.ok('desc' in d);
            assert.ok('effect' in d);
            assert.strictEqual(typeof d.cost, 'number');
            assert.ok(d.cost > 0);
        }
    });

    it('all decoration IDs are unique', () => {
        const ids = DECORATIONS.map(d => d.id);
        assert.strictEqual(new Set(ids).size, ids.length);
    });
});

describe('CARE_ITEMS catalog', () => {
    it('has 2 care items', () => {
        assert.strictEqual(CARE_ITEMS.length, 2);
    });

    it('includes conditioner and algae_scrub', () => {
        const ids = CARE_ITEMS.map(i => i.id);
        assert.ok(ids.includes('conditioner'));
        assert.ok(ids.includes('algae_scrub'));
    });
});

describe('hasDecoration', () => {
    it('returns false for un-owned decoration', () => {
        assert.strictEqual(hasDecoration('castle'), false);
    });

    it('returns true after adding decoration', () => {
        addDecoration('castle');
        assert.strictEqual(hasDecoration('castle'), true);
    });
});

describe('addDecoration', () => {
    it('adds a decoration to the tank', () => {
        addDecoration('castle');
        const tank = getTank();
        assert.strictEqual(tank.decorations.length, 1);
        assert.strictEqual(tank.decorations[0].id, 'castle');
    });

    it('does not add duplicate decorations', () => {
        addDecoration('castle');
        addDecoration('castle');
        const tank = getTank();
        assert.strictEqual(tank.decorations.length, 1);
    });

    it('stores decoration with default position', () => {
        addDecoration('castle');
        const tank = getTank();
        const deco = tank.decorations[0];
        assert.strictEqual(deco.x, 78); // DEFAULT_POSITIONS.castle.x
        assert.strictEqual(deco.y, 88); // DEFAULT_POSITIONS.castle.y
    });

    it('can add multiple different decorations', () => {
        addDecoration('castle');
        addDecoration('coral');
        addDecoration('java_fern');
        const tank = getTank();
        assert.strictEqual(tank.decorations.length, 3);
    });
});

describe('moveDecoration', () => {
    it('moves a decoration to new coordinates', () => {
        addDecoration('castle');
        moveDecoration(0, 30, 40);
        const tank = getTank();
        assert.strictEqual(tank.decorations[0].x, 30);
        assert.strictEqual(tank.decorations[0].y, 40);
    });

    it('does nothing for invalid index (negative)', () => {
        addDecoration('castle');
        moveDecoration(-1, 30, 40);
        const tank = getTank();
        assert.strictEqual(tank.decorations[0].x, 78); // unchanged
    });

    it('does nothing for invalid index (out of range)', () => {
        addDecoration('castle');
        moveDecoration(5, 30, 40);
        const tank = getTank();
        assert.strictEqual(tank.decorations[0].x, 78); // unchanged
    });
});

describe('getDecorationHappinessBonus', () => {
    it('returns 0 with no decorations', () => {
        assert.strictEqual(getDecorationHappinessBonus(), 0);
    });

    it('returns 5 for castle', () => {
        addDecoration('castle');
        assert.strictEqual(getDecorationHappinessBonus(), 5);
    });

    it('returns 3 for coral', () => {
        addDecoration('coral');
        assert.strictEqual(getDecorationHappinessBonus(), 3);
    });

    it('returns 4 for led_lights', () => {
        addDecoration('led_lights');
        assert.strictEqual(getDecorationHappinessBonus(), 4);
    });

    it('returns 3 for treasure_chest', () => {
        addDecoration('treasure_chest');
        assert.strictEqual(getDecorationHappinessBonus(), 3);
    });

    it('sums bonuses for multiple happiness decorations', () => {
        addDecoration('castle');      // +5
        addDecoration('coral');       // +3
        addDecoration('led_lights');  // +4
        addDecoration('treasure_chest'); // +3
        assert.strictEqual(getDecorationHappinessBonus(), 15);
    });

    it('returns 0 for non-happiness decorations only', () => {
        addDecoration('java_fern');
        addDecoration('driftwood');
        addDecoration('rock_arch');
        assert.strictEqual(getDecorationHappinessBonus(), 0);
    });
});

describe('doWaterChange', () => {
    it('reduces ammonia by 60%', () => {
        loadTankState({ ammonia: 50, nitrite: 0, nitrate: 0, bacteria: 10, algae: 0, decorations: [] });
        doWaterChange();
        assertCloseTo(getTank().ammonia, 20);
    });

    it('reduces nitrite by 50%', () => {
        loadTankState({ ammonia: 0, nitrite: 40, nitrate: 0, bacteria: 10, algae: 0, decorations: [] });
        doWaterChange();
        assertCloseTo(getTank().nitrite, 20);
    });

    it('reduces nitrate by 50%', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 60, bacteria: 10, algae: 0, decorations: [] });
        doWaterChange();
        assertCloseTo(getTank().nitrate, 30);
    });

    it('reduces bacteria by 15%', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 100, algae: 0, decorations: [] });
        doWaterChange();
        assertCloseTo(getTank().bacteria, 85);
    });

    it('reduces algae by 50%', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 10, algae: 80, decorations: [] });
        doWaterChange();
        assertCloseTo(getTank().algae, 40);
    });
});

describe('getWaterQuality', () => {
    it('returns 1 for perfect water (no toxins)', () => {
        assert.strictEqual(getWaterQuality(), 1);
    });

    it('returns 0.5 when ammonia is 50', () => {
        loadTankState({ ammonia: 50, nitrite: 0, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        assertCloseTo(getWaterQuality(), 0.5);
    });

    it('uses the worse of ammonia and nitrite', () => {
        loadTankState({ ammonia: 20, nitrite: 80, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        assertCloseTo(getWaterQuality(), 0.2);
    });

    it('returns 0 when ammonia is 100', () => {
        loadTankState({ ammonia: 100, nitrite: 0, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        assert.strictEqual(getWaterQuality(), 0);
    });

    it('clamps to 0-1 range', () => {
        loadTankState({ ammonia: 150, nitrite: 0, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        assert.strictEqual(getWaterQuality(), 0);
    });
});

describe('updateChemistry', () => {
    it('increases ammonia based on fish inches and uneaten food', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 0, algae: 0, decorations: [] });
        // Pass dt=1 to trigger one chemistry tick
        updateChemistry(1, 10, 5);
        const tank = getTank();
        // Ammonia = 10 * 0.0015 + 5 * 0.005 = 0.015 + 0.025 = 0.04
        assertCloseTo(tank.ammonia, 0.04);
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
        assertCloseTo(tank.ammonia, 9.8);
        assertCloseTo(tank.nitrate, 0.1005, 3);
    });

    it('bacteria converts nitrite to nitrate', () => {
        loadTankState({ ammonia: 0, nitrite: 10, nitrate: 0, bacteria: 50, algae: 0, decorations: [] });
        updateChemistry(1, 0, 0);
        const tank = getTank();
        // nitriteConverted = min(10, 50 * 0.003) = 0.15
        // nitrite = 10 - 0.15 = 9.85
        // nitrate = 0 + 0.15 * 0.67 = 0.1005
        assertCloseTo(tank.nitrite, 9.85);
        assertCloseTo(tank.nitrate, 0.1005, 3);
    });

    it('does not tick chemistry for dt < 1', () => {
        loadTankState({ ammonia: 5, nitrite: 0, nitrate: 0, bacteria: 50, algae: 0, decorations: [] });
        const ammoniaBefore = getTank().ammonia;
        updateChemistry(0.5, 10, 5);
        // chemAccum is reset in beforeEach, so 0.5 < 1 means no tick occurs
        const tank = getTank();
        assert.strictEqual(tank.ammonia, ammoniaBefore);
    });

    it('clamps all values to 0-100', () => {
        // Use values near 100 with large inputs to push ammonia above 100 pre-clamp
        // ammonia: 100 + 1000*0.0015 + 1000*0.005 = 100 + 1.5 + 5 = 106.5 before conversion
        loadTankState({ ammonia: 100, nitrite: 100, nitrate: 100, bacteria: 100, algae: 100, decorations: [] });
        updateChemistry(1, 1000, 1000);
        const tank = getTank();
        assert.strictEqual(tank.ammonia, 100);
        assert.strictEqual(tank.nitrite, 100);
        assert.strictEqual(tank.nitrate, 100);
        assert.strictEqual(tank.bacteria, 100);
        assert.strictEqual(tank.algae, 100);
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

        assert.ok(algaeWith < algaeWithout);
    });

    it('coral reduces nitrate', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 50, bacteria: 5, algae: 0, decorations: [] });
        addDecoration('coral');
        updateChemistry(1, 0, 0);
        const tank = getTank();
        // Coral multiplies nitrate by 0.998 each tick
        assert.ok(tank.nitrate < 50);
    });

    it('driftwood boosts bacteria growth', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 10, algae: 0, decorations: [] });
        updateChemistry(1, 0, 0);
        const bacteriaWithout = getTank().bacteria;

        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 10, algae: 0, decorations: [] });
        addDecoration('driftwood');
        updateChemistry(1, 0, 0);
        const bacteriaWith = getTank().bacteria;

        assert.ok(bacteriaWith > bacteriaWithout);
    });
});

describe('useCareItem', () => {
    it('conditioner halves ammonia', () => {
        loadTankState({ ammonia: 40, nitrite: 30, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        useCareItem('conditioner');
        const tank = getTank();
        assertCloseTo(tank.ammonia, 20);
    });

    it('conditioner halves nitrite', () => {
        loadTankState({ ammonia: 40, nitrite: 30, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        useCareItem('conditioner');
        const tank = getTank();
        assertCloseTo(tank.nitrite, 15);
    });

    it('algae_scrub halves algae', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 5, algae: 60, decorations: [] });
        useCareItem('algae_scrub');
        assertCloseTo(getTank().algae, 30);
    });
});

describe('setTankSize', () => {
    it('sets tank gallons and capacity', () => {
        setTankSize(40, 20);
        const tank = getTank();
        assert.strictEqual(tank.gallons, 40);
        assert.strictEqual(tank.capacityInches, 20);
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
        assert.strictEqual(saved.ammonia, 10);
        assert.strictEqual(saved.nitrite, 20);
        assert.strictEqual(saved.nitrate, 30);
        assert.strictEqual(saved.bacteria, 40);
        assert.strictEqual(saved.algae, 50);
        assert.strictEqual(saved.freeFeed, true);
        assert.strictEqual(saved.gallons, 75);
        assert.strictEqual(saved.capacityInches, 35);
        assert.strictEqual(saved.decorations.length, 1);
        assert.strictEqual(saved.decorations[0].id, 'castle');
    });

    it('uses defaults for missing fields', () => {
        loadTankState({});
        const tank = getTank();
        assert.strictEqual(tank.ammonia, 0);
        assert.strictEqual(tank.nitrite, 0);
        assert.strictEqual(tank.nitrate, 0);
        assert.strictEqual(tank.bacteria, 5);
        assert.strictEqual(tank.algae, 0);
        assert.strictEqual(tank.freeFeed, false);
        assert.strictEqual(tank.gallons, 10);
        assert.strictEqual(tank.capacityInches, 5);
        assert.deepStrictEqual(tank.decorations, []);
    });

    it('does nothing when passed null', () => {
        const before = saveTankState();
        loadTankState(null);
        // Tank should remain unchanged (we called loadTankState with our beforeEach state,
        // then null does nothing)
        const after = saveTankState();
        assert.strictEqual(after.ammonia, before.ammonia);
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
        assert.strictEqual(tank.decorations.length, 3);

        // All should be objects with id, x, y
        for (const d of tank.decorations) {
            assert.ok('id' in d);
            assert.ok('x' in d);
            assert.ok('y' in d);
            assert.strictEqual(typeof d.id, 'string');
            assert.strictEqual(typeof d.x, 'number');
            assert.strictEqual(typeof d.y, 'number');
        }

        // Castle should have its default position
        const castle = tank.decorations.find(d => d.id === 'castle');
        assert.strictEqual(castle.x, 78);
        assert.strictEqual(castle.y, 88);
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
        assert.strictEqual(tank.decorations.length, 2);
        assert.strictEqual(tank.decorations[0].x, 30);
        assert.strictEqual(tank.decorations[0].y, 40);
    });

    it('handles empty decorations array', () => {
        loadTankState({
            ammonia: 0, nitrite: 0, nitrate: 0,
            bacteria: 5, algae: 0,
            decorations: [],
        });
        assert.deepStrictEqual(getTank().decorations, []);
    });

    it('handles unknown decoration id in migration with fallback position', () => {
        loadTankState({
            ammonia: 0, nitrite: 0, nitrate: 0,
            bacteria: 5, algae: 0,
            decorations: ['unknown_deco'],
        });

        const tank = getTank();
        assert.strictEqual(tank.decorations.length, 1);
        assert.strictEqual(tank.decorations[0].id, 'unknown_deco');
        // Fallback position is { x: 50, y: 90 }
        assert.strictEqual(tank.decorations[0].x, 50);
        assert.strictEqual(tank.decorations[0].y, 90);
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
        assertCloseTo(tank.ammonia, 0.075, 3);
    });

    it('caps at 86400 seconds (24 hours)', () => {
        loadTankState({ ammonia: 0, nitrite: 0, nitrate: 0, bacteria: 5, algae: 0, decorations: [] });
        // Requesting more than a day should cap
        applyOfflineChemistry(200000, 1);
        const tank = getTank();
        // Just verify it doesn't crash and values are clamped
        assert.ok(tank.ammonia <= 100);
        assert.ok(tank.bacteria <= 100);
    });
});
