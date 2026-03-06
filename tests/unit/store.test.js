import { describe, it, expect, beforeEach } from 'vitest';
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
        expect(prog.xp).toBe(0);
        expect(prog.level).toBe(1);
        expect(prog.coins).toBe(10);
        expect(prog.pellets).toBe(20);
        expect(prog.swishProgress).toBe(0);
    });
});

describe('addXP', () => {
    it('increases XP', () => {
        addXP(50);
        expect(getProgression().xp).toBe(50);
    });

    it('accumulates XP', () => {
        addXP(30);
        addXP(40);
        expect(getProgression().xp).toBe(70);
    });

    it('triggers level up when XP threshold is reached', () => {
        expect(getProgression().level).toBe(1);
        addXP(100); // Level 2 at 100 XP
        expect(getProgression().level).toBe(2);
    });

    it('can skip levels with large XP addition', () => {
        addXP(1000); // Level 5 at 1000 XP
        expect(getProgression().level).toBe(5);
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
        expect(called).toBe(true);
        expect(newLvl).toBe(2);
        expect(oldLvl).toBe(1);
        // Clean up
        setOnLevelUp(null);
    });
});

describe('coins', () => {
    it('starts with 10 coins', () => {
        expect(getCoins()).toBe(10);
    });

    it('addCoins increases coin count', () => {
        addCoins(5);
        expect(getCoins()).toBe(15);
    });

    it('spendCoins deducts and returns true when affordable', () => {
        const result = spendCoins(5);
        expect(result).toBe(true);
        expect(getCoins()).toBe(5);
    });

    it('spendCoins returns false and does not deduct when not affordable', () => {
        const result = spendCoins(50);
        expect(result).toBe(false);
        expect(getCoins()).toBe(10);
    });

    it('spendCoins allows spending exact balance', () => {
        const result = spendCoins(10);
        expect(result).toBe(true);
        expect(getCoins()).toBe(0);
    });
});

describe('pellets', () => {
    it('starts with 20 pellets', () => {
        expect(getPellets()).toBe(20);
    });

    it('usePellet decrements pellet count and returns true', () => {
        const result = usePellet();
        expect(result).toBe(true);
        expect(getPellets()).toBe(19);
    });

    it('usePellet returns false when no pellets remain', () => {
        loadProgression({ xp: 0, level: 1, coins: 10, pellets: 0, swishProgress: 0 });
        const result = usePellet();
        expect(result).toBe(false);
        expect(getPellets()).toBe(0);
    });
});

describe('free feed mode', () => {
    it('isFreeFeed returns false by default', () => {
        expect(isFreeFeed()).toBe(false);
    });

    it('isFreeFeed returns true when tank freeFeed is set', () => {
        getTank().freeFeed = true;
        expect(isFreeFeed()).toBe(true);
    });

    it('usePellet always returns true in free feed mode without decrementing', () => {
        getTank().freeFeed = true;
        const pelletsBefore = getPellets();
        const result = usePellet();
        expect(result).toBe(true);
        expect(getPellets()).toBe(pelletsBefore);
    });
});

describe('buyFoodPack', () => {
    it('costs 5 coins and gives 10 pellets', () => {
        const result = buyFoodPack();
        expect(result).toBe(true);
        expect(getCoins()).toBe(5); // 10 - 5
        expect(getPellets()).toBe(30); // 20 + 10
    });

    it('fails when not enough coins', () => {
        loadProgression({ xp: 0, level: 1, coins: 3, pellets: 20, swishProgress: 0 });
        const result = buyFoodPack();
        expect(result).toBe(false);
        expect(getCoins()).toBe(3);
        expect(getPellets()).toBe(20);
    });

    it('can buy multiple food packs', () => {
        buyFoodPack(); // 10 -> 5 coins, 20 -> 30 pellets
        buyFoodPack(); // 5 -> 0 coins, 30 -> 40 pellets
        expect(getCoins()).toBe(0);
        expect(getPellets()).toBe(40);
    });
});

describe('fishCost', () => {
    it('calculates cost as level * 10', () => {
        const species = { level: 3 };
        expect(fishCost(species)).toBe(30);
    });

    it('returns 10 for level 1 fish', () => {
        const species = { level: 1 };
        expect(fishCost(species)).toBe(10);
    });

    it('returns 70 for level 7 fish', () => {
        const species = { level: 7 };
        expect(fishCost(species)).toBe(70);
    });
});

describe('getCurrentLevelInfo', () => {
    it('returns current and next level info at level 1', () => {
        const { current, next } = getCurrentLevelInfo();
        expect(current.level).toBe(1);
        expect(next.level).toBe(2);
    });

    it('returns null next at max level', () => {
        loadProgression({ xp: 2500, level: 7, coins: 0, pellets: 0, swishProgress: 0 });
        const { current, next } = getCurrentLevelInfo();
        expect(current.level).toBe(7);
        expect(next).toBeUndefined();
    });
});

describe('getXPProgress', () => {
    it('returns 0 at start of level', () => {
        expect(getXPProgress()).toBe(0);
    });

    it('returns 0.5 halfway through level', () => {
        addXP(50); // Level 1: 0-100 XP, so 50 is halfway
        expect(getXPProgress()).toBeCloseTo(0.5);
    });

    it('returns 1 at max level', () => {
        loadProgression({ xp: 2500, level: 7, coins: 0, pellets: 0, swishProgress: 0 });
        expect(getXPProgress()).toBe(1);
    });
});

describe('getAvailableSpecies', () => {
    it('returns only level 1 species at level 1', () => {
        const species = getAvailableSpecies();
        // Neon Tetra and Guppy are the two level-1 species in the catalog
        expect(species).toHaveLength(2);
        for (const s of species) {
            expect(s.level).toBe(1);
        }
    });

    it('returns more species at higher levels', () => {
        const lvl1Species = getAvailableSpecies();
        addXP(300); // Level 3
        const lvl3Species = getAvailableSpecies();
        expect(lvl3Species.length).toBeGreaterThan(lvl1Species.length);
    });
});

describe('getAllSpecies', () => {
    it('returns the full catalog', () => {
        const all = getAllSpecies();
        expect(all).toBe(SPECIES_CATALOG);
        expect(all.length).toBe(14);
    });
});

describe('getTankCapacity', () => {
    it('returns 5 at level 1', () => {
        expect(getTankCapacity()).toBe(5);
    });

    it('returns higher capacity at higher levels', () => {
        addXP(1000); // Level 5
        expect(getTankCapacity()).toBe(20);
    });
});

describe('getCurrentStockInches', () => {
    it('returns 0 for empty array', () => {
        expect(getCurrentStockInches([])).toBe(0);
    });

    it('sums currentSize of all fish', () => {
        const fishes = [
            { currentSize: 1.5 },
            { currentSize: 2.0 },
            { currentSize: 3.5 },
        ];
        expect(getCurrentStockInches(fishes)).toBeCloseTo(7.0);
    });
});

describe('canAddFish', () => {
    it('returns true when tank has capacity and level is met', () => {
        const species = { level: 1, sizeInches: 1 };
        const fishes = [];
        expect(canAddFish(fishes, species)).toBe(true);
    });

    it('returns false when species level exceeds player level', () => {
        const species = { level: 5, sizeInches: 1 };
        const fishes = [];
        expect(canAddFish(fishes, species)).toBe(false);
    });

    it('returns false when tank is too full', () => {
        const species = { level: 1, sizeInches: 10 };
        const fishes = [{ currentSize: 4 }]; // 4 inches used out of 5
        // Adding 10 * 0.6 = 6 inches would make total 10 > 5
        expect(canAddFish(fishes, species)).toBe(false);
    });

    it('uses 60% of sizeInches for capacity check', () => {
        const species = { level: 1, sizeInches: 1.5 };
        // Starting size would be 1.5 * 0.6 = 0.9
        // With 4.2 used, 4.2 + 0.9 = 5.1 > 5 capacity
        const fishes = [{ currentSize: 4.2 }];
        expect(canAddFish(fishes, species)).toBe(false);
    });
});

describe('swish meter', () => {
    it('starts at 0', () => {
        expect(getSwishProgress()).toBe(0);
    });

    it('increases with happy fish over time', () => {
        // rate = (100 / 200) * 1 = 0.5, progress += 0.5 * 1 = 0.5
        // getSwishProgress() = min(0.5 / 100, 1) = 0.005
        updateSwishMeter(1, 100, false);
        expect(getSwishProgress()).toBeCloseTo(0.005);
    });

    it('earns coins when swish meter fills', () => {
        // rate = (200 / 200) * 1 = 1, progress += 1 * 100 = 100
        // while (100 >= 100) => subtract 100, addCoins(1) => coins = 10 + 1 = 11
        // swishProgress = 0 after loop
        updateSwishMeter(100, 200, false);
        expect(getCoins()).toBe(11);
        expect(getSwishProgress()).toBe(0);
    });

    it('interaction triples the rate', () => {
        // Without interaction: rate = (100/200) * 1 = 0.5, progress = 0.5 * 10 = 5
        // getSwishProgress() = 5 / 100 = 0.05
        loadProgression({ xp: 0, level: 1, coins: 10, pellets: 20, swishProgress: 0 });
        updateSwishMeter(10, 100, false);
        const progressNoInteraction = getSwishProgress();
        expect(progressNoInteraction).toBeCloseTo(0.05);

        // With interaction: rate = (100/200) * 3 = 1.5, progress = 1.5 * 10 = 15
        // getSwishProgress() = 15 / 100 = 0.15
        loadProgression({ xp: 0, level: 1, coins: 10, pellets: 20, swishProgress: 0 });
        updateSwishMeter(10, 100, true);
        const progressWithInteraction = getSwishProgress();
        expect(progressWithInteraction).toBeCloseTo(0.15);

        expect(progressWithInteraction).toBeCloseTo(progressNoInteraction * 3);
    });
});

describe('saveProgression / loadProgression', () => {
    it('roundtrips progression data', () => {
        addXP(50);
        addCoins(20);
        const saved = saveProgression();
        expect(saved.xp).toBe(50);
        expect(saved.coins).toBe(30); // 10 + 20

        // Load into fresh state
        loadProgression(saved);
        expect(getProgression().xp).toBe(50);
        expect(getProgression().coins).toBe(30);
    });

    it('handles null input gracefully', () => {
        const before = saveProgression();
        loadProgression(null);
        const after = saveProgression();
        expect(after.xp).toBe(before.xp);
    });

    it('uses defaults for missing fields', () => {
        loadProgression({});
        const prog = getProgression();
        expect(prog.xp).toBe(0);
        expect(prog.level).toBe(1);
        expect(prog.coins).toBe(0);
        expect(prog.pellets).toBe(20);
        expect(prog.swishProgress).toBe(0);
    });
});
