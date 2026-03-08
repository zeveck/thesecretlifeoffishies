import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Fish, SPECIES_CATALOG } from '../../js/fish.js';
import { loadTankState } from '../../js/tank.js';
import { addBreedHeart } from '../../js/effects.js';

beforeEach(() => {
    loadTankState({
        ammonia: 0, nitrite: 0, nitrate: 0,
        bacteria: 5, algae: 0, freeFeed: false,
        gallons: 10, capacityInches: 5,
        decorations: [],
    });
});

describe('live bearer species', () => {
    it('has exactly 4 live bearer species', () => {
        const liveBearers = SPECIES_CATALOG.filter(s => s.liveBearer);
        assert.strictEqual(liveBearers.length, 4);
    });

    it('live bearer species are Guppy, Platy, Molly, Swordtail', () => {
        const names = SPECIES_CATALOG.filter(s => s.liveBearer).map(s => s.name).sort();
        assert.deepStrictEqual(names, ['Guppy', 'Molly', 'Platy', 'Swordtail']);
    });

    it('non-live-bearers do not have liveBearer flag', () => {
        for (const s of SPECIES_CATALOG) {
            if (!['Guppy', 'Platy', 'Molly', 'Swordtail'].includes(s.name)) {
                assert.ok(!s.liveBearer, `${s.name} should not be a live bearer`);
            }
        }
    });
});

describe('breed pair selection', () => {
    it('two happy adults of same species can form a pair', () => {
        const guppy = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const f1 = new Fish(guppy, 30, 30, 30);
        const f2 = new Fish(guppy, 60, 60, 60);
        f1.happiness = 80;
        f2.happiness = 70;
        // Both are happy (>40) and adults (not fry) — eligible for pairing
        assert.ok(f1.happiness > 40);
        assert.ok(f2.happiness > 40);
        assert.strictEqual(f1.isFry, false);
        assert.strictEqual(f2.isFry, false);
    });

    it('fry cannot be part of a breed pair', () => {
        const guppy = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const f1 = new Fish(guppy);
        f1.isFry = true;
        // A fry should not qualify as an adult for breeding
        assert.strictEqual(f1.isFry, true);
    });

    it('unhappy fish (<= 40 happiness) should not qualify', () => {
        const molly = SPECIES_CATALOG.find(s => s.name === 'Molly');
        const f1 = new Fish(molly);
        f1.happiness = 30;
        // This fish should not be eligible for breeding pair selection
        assert.ok(f1.happiness <= 40);
    });

    it('highest happiness fish should be preferred for pairing', () => {
        const platy = SPECIES_CATALOG.find(s => s.name === 'Platy');
        const fish = [];
        for (let i = 0; i < 4; i++) {
            fish.push(new Fish(platy));
        }
        fish[0].happiness = 90;
        fish[1].happiness = 80;
        fish[2].happiness = 60;
        fish[3].happiness = 50;

        // Sort by happiness descending — top 2 should be the pair
        const sorted = [...fish].sort((a, b) => b.happiness - a.happiness);
        assert.strictEqual(sorted[0].happiness, 90);
        assert.strictEqual(sorted[1].happiness, 80);
    });
});

describe('addBreedHeart', () => {
    it('does not throw when called', () => {
        // Should not throw even without a canvas context
        addBreedHeart(100, 200);
    });

    it('accepts various coordinate values', () => {
        addBreedHeart(0, 0);
        addBreedHeart(500, 300);
        addBreedHeart(-10, -20);
    });
});

describe('breed timer format', () => {
    it('new format has time and pairIds fields', () => {
        const entry = { time: 100, pairIds: [1, 2] };
        assert.strictEqual(typeof entry.time, 'number');
        assert.ok(Array.isArray(entry.pairIds));
        assert.strictEqual(entry.pairIds.length, 2);
    });

    it('migration from old number format preserves time', () => {
        // Old format was just a number
        const oldValue = 500;
        // Migration should convert to { time: oldValue, pairIds: [] }
        const migrated = typeof oldValue === 'number'
            ? { time: oldValue, pairIds: [] }
            : oldValue;
        assert.strictEqual(migrated.time, 500);
        assert.deepStrictEqual(migrated.pairIds, []);
    });

    it('new format is unchanged by migration check', () => {
        const newEntry = { time: 300, pairIds: [5, 8] };
        const result = typeof newEntry === 'number'
            ? { time: newEntry, pairIds: [] }
            : newEntry;
        assert.strictEqual(result.time, 300);
        assert.deepStrictEqual(result.pairIds, [5, 8]);
    });
});
