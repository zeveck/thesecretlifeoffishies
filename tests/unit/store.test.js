import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    getProgression, addXP, addCoins, spendCoins, getCoins,
    getPellets, usePellet, buyFoodPack, fishCost,
    getCurrentLevelInfo, getXPProgress, getTankCapacity,
    getAvailableSpecies, getAllSpecies, canAddFish,
    getCurrentStockInches, isFreeFeed,
    loadProgression, saveProgression,
    updateSwishMeter, getSwishProgress,
    setOnLevelUp,
} from '../../js/store.js';
import { SPECIES_CATALOG } from '../../js/fish.js';
import { getTank, loadTankState } from '../../js/tank.js';

function assertCloseTo(actual, expected, precision = 5) {
    const eps = Math.pow(10, -precision) / 2;
    assert.ok(Math.abs(actual - expected) < eps,
        `Expected ${actual} to be close to ${expected}`);
}

beforeEach(() => {
    // Reset progression
    loadProgression({
        xp: 0,
        level: 1,
        lastPassiveTick: Date.now(),
        coins: 10,
        pellets: 20,
        lastDailyRefresh: Date.now(),
        swishProgress: 0,
    });
    // Reset tank state
    loadTankState({
        ammonia: 0, nitrite: 0, nitrate: 0,
        bacteria: 5, algae: 0, freeFeed: false,
        gallons: 10, capacityInches: 5,
        decorations: [],
    });
});

describe('getProgression', () => {
    it('returns progression object with expected initial values', () => {
        const prog = getProgression();
        assert.strictEqual(prog.xp, 0);
        assert.strictEqual(prog.level, 1);
        assert.strictEqual(prog.coins, 10);
        assert.strictEqual(prog.pellets, 20);
        assert.strictEqual(prog.swishProgress, 0);
    });
});

describe('addXP', () => {
    it('increases XP', () => {
        addXP(50);
        assert.strictEqual(getProgression().xp, 50);
    });

    it('accumulates XP', () => {
        addXP(30);
        addXP(40);
        assert.strictEqual(getProgression().xp, 70);
    });

    it('triggers level up when XP threshold is reached', () => {
        assert.strictEqual(getProgression().level, 1);
        addXP(100); // Level 2 at 100 XP
        assert.strictEqual(getProgression().level, 2);
    });

    it('can skip levels with large XP addition', () => {
        addXP(1000); // Level 5 at 1000 XP
        assert.strictEqual(getProgression().level, 5);
    });
});

describe('level up callback', () => {
    it('calls onLevelUp callback on level up', () => {
        let called = false;
        let newLvl = 0, oldLvl = 0;
        setOnLevelUp((newLevel, oldLevel) => {
            called = true;
            newLvl = newLevel;
            oldLvl = oldLevel;
        });
        addXP(100);
        assert.strictEqual(called, true);
        assert.strictEqual(newLvl, 2);
        assert.strictEqual(oldLvl, 1);
        // Clean up
        setOnLevelUp(null);
    });
});

describe('coins', () => {
    it('starts with 10 coins', () => {
        assert.strictEqual(getCoins(), 10);
    });

    it('addCoins increases coin count', () => {
        addCoins(5);
        assert.strictEqual(getCoins(), 15);
    });

    it('spendCoins deducts and returns true when affordable', () => {
        const result = spendCoins(5);
        assert.strictEqual(result, true);
        assert.strictEqual(getCoins(), 5);
    });

    it('spendCoins returns false and does not deduct when not affordable', () => {
        const result = spendCoins(50);
        assert.strictEqual(result, false);
        assert.strictEqual(getCoins(), 10);
    });

    it('spendCoins allows spending exact balance', () => {
        const result = spendCoins(10);
        assert.strictEqual(result, true);
        assert.strictEqual(getCoins(), 0);
    });
});

describe('pellets', () => {
    it('starts with 20 pellets', () => {
        assert.strictEqual(getPellets(), 20);
    });

    it('usePellet decrements pellet count and returns true', () => {
        const result = usePellet();
        assert.strictEqual(result, true);
        assert.strictEqual(getPellets(), 19);
    });

    it('usePellet returns false when no pellets remain', () => {
        loadProgression({ xp: 0, level: 1, coins: 10, pellets: 0, swishProgress: 0 });
        const result = usePellet();
        assert.strictEqual(result, false);
        assert.strictEqual(getPellets(), 0);
    });
});

describe('free feed mode', () => {
    it('isFreeFeed returns false by default', () => {
        assert.strictEqual(isFreeFeed(), false);
    });

    it('isFreeFeed returns true when tank freeFeed is set', () => {
        getTank().freeFeed = true;
        assert.strictEqual(isFreeFeed(), true);
    });

    it('usePellet always returns true in free feed mode without decrementing', () => {
        getTank().freeFeed = true;
        const pelletsBefore = getPellets();
        const result = usePellet();
        assert.strictEqual(result, true);
        assert.strictEqual(getPellets(), pelletsBefore);
    });
});

describe('buyFoodPack', () => {
    it('costs 5 coins and gives 10 pellets', () => {
        const result = buyFoodPack();
        assert.strictEqual(result, true);
        assert.strictEqual(getCoins(), 5); // 10 - 5
        assert.strictEqual(getPellets(), 30); // 20 + 10
    });

    it('fails when not enough coins', () => {
        loadProgression({ xp: 0, level: 1, coins: 3, pellets: 20, swishProgress: 0 });
        const result = buyFoodPack();
        assert.strictEqual(result, false);
        assert.strictEqual(getCoins(), 3);
        assert.strictEqual(getPellets(), 20);
    });

    it('can buy multiple food packs', () => {
        buyFoodPack(); // 10 -> 5 coins, 20 -> 30 pellets
        buyFoodPack(); // 5 -> 0 coins, 30 -> 40 pellets
        assert.strictEqual(getCoins(), 0);
        assert.strictEqual(getPellets(), 40);
    });
});

describe('fishCost', () => {
    it('calculates cost as level * 10', () => {
        const species = { level: 3 };
        assert.strictEqual(fishCost(species), 30);
    });

    it('returns 10 for level 1 fish', () => {
        const species = { level: 1 };
        assert.strictEqual(fishCost(species), 10);
    });

    it('returns 70 for level 7 fish', () => {
        const species = { level: 7 };
        assert.strictEqual(fishCost(species), 70);
    });
});

describe('getCurrentLevelInfo', () => {
    it('returns current and next level info at level 1', () => {
        const { current, next } = getCurrentLevelInfo();
        assert.strictEqual(current.level, 1);
        assert.strictEqual(next.level, 2);
    });

    it('returns null next at max level', () => {
        loadProgression({ xp: 2500, level: 7, coins: 0, pellets: 0, swishProgress: 0 });
        const { current, next } = getCurrentLevelInfo();
        assert.strictEqual(current.level, 7);
        assert.strictEqual(next, undefined);
    });
});

describe('getXPProgress', () => {
    it('returns 0 at start of level', () => {
        assert.strictEqual(getXPProgress(), 0);
    });

    it('returns 0.5 halfway through level', () => {
        addXP(50); // Level 1: 0-100 XP, so 50 is halfway
        assertCloseTo(getXPProgress(), 0.5);
    });

    it('returns 1 at max level', () => {
        loadProgression({ xp: 2500, level: 7, coins: 0, pellets: 0, swishProgress: 0 });
        assert.strictEqual(getXPProgress(), 1);
    });
});

describe('getAvailableSpecies', () => {
    it('returns only level 1 species at level 1', () => {
        const species = getAvailableSpecies();
        // Neon Tetra and Guppy are the two level-1 species in the catalog
        assert.strictEqual(species.length, 2);
        for (const s of species) {
            assert.strictEqual(s.level, 1);
        }
    });

    it('returns more species at higher levels', () => {
        const lvl1Species = getAvailableSpecies();
        addXP(300); // Level 3
        const lvl3Species = getAvailableSpecies();
        assert.ok(lvl3Species.length > lvl1Species.length);
    });
});

describe('getAllSpecies', () => {
    it('returns the full catalog', () => {
        const all = getAllSpecies();
        assert.strictEqual(all, SPECIES_CATALOG);
        assert.strictEqual(all.length, 14);
    });
});

describe('getTankCapacity', () => {
    it('returns 5 at level 1', () => {
        assert.strictEqual(getTankCapacity(), 5);
    });

    it('returns higher capacity at higher levels', () => {
        addXP(1000); // Level 5
        assert.strictEqual(getTankCapacity(), 20);
    });
});

describe('getCurrentStockInches', () => {
    it('returns 0 for empty array', () => {
        assert.strictEqual(getCurrentStockInches([]), 0);
    });

    it('sums currentSize of all fish', () => {
        const fishes = [
            { currentSize: 1.5 },
            { currentSize: 2.0 },
            { currentSize: 3.5 },
        ];
        assertCloseTo(getCurrentStockInches(fishes), 7.0);
    });
});

describe('canAddFish', () => {
    it('returns true when tank has capacity and level is met', () => {
        const species = { level: 1, sizeInches: 1 };
        const fishes = [];
        assert.strictEqual(canAddFish(fishes, species), true);
    });

    it('returns false when species level exceeds player level', () => {
        const species = { level: 5, sizeInches: 1 };
        const fishes = [];
        assert.strictEqual(canAddFish(fishes, species), false);
    });

    it('returns false when tank is too full', () => {
        const species = { level: 1, sizeInches: 10 };
        const fishes = [{ currentSize: 4 }]; // 4 inches used out of 5
        // Adding 10 * 0.6 = 6 inches would make total 10 > 5
        assert.strictEqual(canAddFish(fishes, species), false);
    });

    it('uses 60% of sizeInches for capacity check', () => {
        const species = { level: 1, sizeInches: 1.5 };
        // Starting size would be 1.5 * 0.6 = 0.9
        // With 4.2 used, 4.2 + 0.9 = 5.1 > 5 capacity
        const fishes = [{ currentSize: 4.2 }];
        assert.strictEqual(canAddFish(fishes, species), false);
    });
});

describe('swish meter', () => {
    it('starts at 0', () => {
        assert.strictEqual(getSwishProgress(), 0);
    });

    it('increases with happy fish over time', () => {
        // rate = (100 / 200) * 1 = 0.5, progress += 0.5 * 1 = 0.5
        // getSwishProgress() = min(0.5 / 100, 1) = 0.005
        updateSwishMeter(1, 100, false);
        assertCloseTo(getSwishProgress(), 0.005);
    });

    it('earns coins when swish meter fills', () => {
        // rate = (200 / 200) * 1 = 1, progress += 1 * 100 = 100
        // while (100 >= 100) => subtract 100, addCoins(1) => coins = 10 + 1 = 11
        // swishProgress = 0 after loop
        updateSwishMeter(100, 200, false);
        assert.strictEqual(getCoins(), 11);
        assert.strictEqual(getSwishProgress(), 0);
    });

    it('interaction triples the rate', () => {
        // Without interaction: rate = (100/200) * 1 = 0.5, progress = 0.5 * 10 = 5
        // getSwishProgress() = 5 / 100 = 0.05
        loadProgression({ xp: 0, level: 1, coins: 10, pellets: 20, swishProgress: 0 });
        updateSwishMeter(10, 100, false);
        const progressNoInteraction = getSwishProgress();
        assertCloseTo(progressNoInteraction, 0.05);

        // With interaction: rate = (100/200) * 3 = 1.5, progress = 1.5 * 10 = 15
        // getSwishProgress() = 15 / 100 = 0.15
        loadProgression({ xp: 0, level: 1, coins: 10, pellets: 20, swishProgress: 0 });
        updateSwishMeter(10, 100, true);
        const progressWithInteraction = getSwishProgress();
        assertCloseTo(progressWithInteraction, 0.15);

        assertCloseTo(progressWithInteraction, progressNoInteraction * 3);
    });
});

describe('saveProgression / loadProgression', () => {
    it('roundtrips progression data', () => {
        addXP(50);
        addCoins(20);
        const saved = saveProgression();
        assert.strictEqual(saved.xp, 50);
        assert.strictEqual(saved.coins, 30); // 10 + 20

        // Load into fresh state
        loadProgression(saved);
        assert.strictEqual(getProgression().xp, 50);
        assert.strictEqual(getProgression().coins, 30);
    });

    it('handles null input gracefully', () => {
        const before = saveProgression();
        loadProgression(null);
        const after = saveProgression();
        assert.strictEqual(after.xp, before.xp);
    });

    it('uses defaults for missing fields', () => {
        loadProgression({});
        const prog = getProgression();
        assert.strictEqual(prog.xp, 0);
        assert.strictEqual(prog.level, 1);
        assert.strictEqual(prog.coins, 0);
        assert.strictEqual(prog.pellets, 20);
        assert.strictEqual(prog.swishProgress, 0);
    });
});
