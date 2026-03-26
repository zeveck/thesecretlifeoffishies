import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Fish, SPECIES_CATALOG, createFry } from '../../js/fish.js';
import { loadTankState } from '../../js/tank.js';

function assertCloseTo(actual, expected, precision = 5) {
    const eps = Math.pow(10, -precision) / 2;
    assert.ok(Math.abs(actual - expected) < eps,
        `Expected ${actual} to be close to ${expected}`);
}

beforeEach(() => {
    loadTankState({
        ammonia: 0, nitrite: 0, nitrate: 0,
        bacteria: 5, algae: 0, freeFeed: false,
        gallons: 10, capacityInches: 5,
        decorations: [],
    });
});

describe('SPECIES_CATALOG', () => {
    it('has 14 species', () => {
        assert.strictEqual(SPECIES_CATALOG.length, 14);
    });

    it('all species have required fields', () => {
        for (const s of SPECIES_CATALOG) {
            assert.ok('name' in s);
            assert.ok('sizeInches' in s);
            assert.ok('level' in s);
            assert.ok('body' in s);
            assert.ok('fin' in s);
            assert.ok('belly' in s);
            assert.ok('speed' in s);
            assert.ok('aspect' in s);
            assert.ok('tailStyle' in s);
            assert.ok('finStyle' in s);
            assert.strictEqual(typeof s.name, 'string');
            assert.strictEqual(typeof s.sizeInches, 'number');
            assert.strictEqual(typeof s.level, 'number');
            assert.ok(s.sizeInches > 0);
            assert.ok(s.level >= 1);
            assert.ok(s.level <= 7);
        }
    });

    it('all species names are unique', () => {
        const names = SPECIES_CATALOG.map(s => s.name);
        assert.strictEqual(new Set(names).size, names.length);
    });

    it('species span levels 1-7', () => {
        const levels = new Set(SPECIES_CATALOG.map(s => s.level));
        for (let i = 1; i <= 7; i++) {
            assert.ok(levels.has(i));
        }
    });

    it('each tail style is a valid value', () => {
        const validStyles = ['fork', 'fan', 'round', 'sword'];
        for (const s of SPECIES_CATALOG) {
            assert.ok(validStyles.includes(s.tailStyle));
        }
    });

    it('each fin style is a valid value', () => {
        const validStyles = ['small', 'medium', 'tall', 'flowing'];
        for (const s of SPECIES_CATALOG) {
            assert.ok(validStyles.includes(s.finStyle));
        }
    });

    it('only Neon Tetra has glowStripe', () => {
        const withGlow = SPECIES_CATALOG.filter(s => s.glowStripe);
        assert.strictEqual(withGlow.length, 1);
        assert.strictEqual(withGlow[0].name, 'Neon Tetra');
    });

    it('marks Guppy, Platy, Molly, Swordtail as live bearers', () => {
        const liveBearers = SPECIES_CATALOG.filter(s => s.liveBearer);
        const names = liveBearers.map(s => s.name).sort();
        assert.deepStrictEqual(names, ['Guppy', 'Molly', 'Platy', 'Swordtail']);
    });

    it('non-live-bearer species do not have liveBearer flag', () => {
        const nonLiveBearers = SPECIES_CATALOG.filter(s => !s.liveBearer);
        assert.strictEqual(nonLiveBearers.length, 10);
        for (const s of nonLiveBearers) {
            assert.ok(!s.liveBearer);
        }
    });
});

describe('Fish constructor', () => {
    it('creates a fish with species properties', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
        const fish = new Fish(species, 50, 50, 50);
        assert.strictEqual(fish.species, species);
        assert.strictEqual(fish.x, 50);
        assert.strictEqual(fish.y, 50);
        assert.strictEqual(fish.z, 50);
    });

    it('auto-generates position when not provided', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species);
        // rand(min, max) returns [min, max)
        assert.ok(fish.x >= 15);
        assert.ok(fish.x < 85);
        assert.ok(fish.y >= 15);
        assert.ok(fish.y < 80);
        assert.ok(fish.z >= 15);
        assert.ok(fish.z < 85);
    });

    it('starts at 60% of max size', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Angelfish');
        const fish = new Fish(species);
        assertCloseTo(fish.currentSize, species.sizeInches * 0.6);
        assert.strictEqual(fish.maxSize, species.sizeInches);
    });

    it('starts with default hunger, strength, happiness', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        assert.strictEqual(fish.hunger, 50);
        assert.strictEqual(fish.strength, 80);
        assert.strictEqual(fish.happiness, 80);
    });

    it('starts in wandering state', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        assert.strictEqual(fish.state, 'wandering');
    });

    it('assigns an optional name', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species, 50, 50, 50, 'Bubbles');
        assert.strictEqual(fish.name, 'Bubbles');
    });

    it('name defaults to empty string', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        assert.strictEqual(fish.name, '');
    });

    it('assigns unique IDs', () => {
        const species = SPECIES_CATALOG[0];
        const fish1 = new Fish(species);
        const fish2 = new Fish(species);
        assert.notStrictEqual(fish1.id, fish2.id);
    });

    it('initializes distance and xp to 0', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        assert.strictEqual(fish.distanceSwum, 0);
        assert.strictEqual(fish.xp, 0);
    });

    it('initializes leaving state to false', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        assert.strictEqual(fish.leaving, false);
        assert.strictEqual(fish.leaveProgress, 0);
    });
});

describe('Fish.displayName', () => {
    it('returns species name when no custom name', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species);
        assert.strictEqual(fish.displayName(), 'Guppy');
    });

    it('returns "name (species)" when custom name is set', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species, 50, 50, 50, 'Nemo');
        assert.strictEqual(fish.displayName(), 'Nemo (Guppy)');
    });

    it('returns species name for empty string name', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Betta');
        const fish = new Fish(species, 50, 50, 50, '');
        assert.strictEqual(fish.displayName(), 'Betta');
    });
});

describe('Fish.boop', () => {
    it('sets state to booped', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boop();
        assert.strictEqual(fish.state, 'booped');
    });

    it('sets boopTimer', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boop();
        assertCloseTo(fish.boopTimer, 0.6);
    });

    it('increases strength by 5 (clamped to 100)', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.strength = 50;
        fish.boop();
        assert.strictEqual(fish.strength, 55);
    });

    it('clamps strength at 100', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.strength = 98;
        fish.boop();
        assert.strictEqual(fish.strength, 100);
    });

    it('does not boop again while already booped', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boop();
        const timer = fish.boopTimer;
        const heading = fish.targetHeading;
        fish.boop(); // should be ignored
        assert.strictEqual(fish.boopTimer, timer);
    });

    it('changes target heading on boop', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        const originalHeading = fish.targetHeading;
        fish.boop();
        assert.notStrictEqual(fish.targetHeading, originalHeading);
    });
});

describe('Fish.serialize / Fish.deserialize', () => {
    it('serializes fish state', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Molly');
        const fish = new Fish(species, 30, 40, 50, 'Shadow');
        fish.hunger = 60;
        fish.strength = 70;

        const data = fish.serialize();
        assert.strictEqual(data.speciesName, 'Molly');
        assert.strictEqual(data.name, 'Shadow');
        assert.strictEqual(data.x, 30);
        assert.strictEqual(data.y, 40);
        assert.strictEqual(data.z, 50);
        assert.strictEqual(data.hunger, 60);
        assert.strictEqual(data.strength, 70);
    });

    it('deserializes fish state', () => {
        const data = {
            speciesName: 'Molly',
            name: 'Shadow',
            x: 30, y: 40, z: 50,
            heading: 1.5,
            currentSize: 2.5,
            hunger: 60,
            strength: 70,
            happiness: 65,
            sadTimer: 10,
            distanceSwum: 500,
            xp: 100,
        };

        const fish = Fish.deserialize(data);
        assert.notStrictEqual(fish, null);
        assert.strictEqual(fish.species.name, 'Molly');
        assert.strictEqual(fish.name, 'Shadow');
        assert.strictEqual(fish.x, 30);
        assert.strictEqual(fish.y, 40);
        assert.strictEqual(fish.z, 50);
        assert.strictEqual(fish.heading, 1.5);
        assert.strictEqual(fish.currentSize, 2.5);
        assert.strictEqual(fish.hunger, 60);
        assert.strictEqual(fish.strength, 70);
        assert.strictEqual(fish.happiness, 65);
        assert.strictEqual(fish.sadTimer, 10);
        assert.strictEqual(fish.distanceSwum, 500);
        assert.strictEqual(fish.xp, 100);
    });

    it('returns null for unknown species', () => {
        const data = { speciesName: 'NonExistentFish', x: 50, y: 50, z: 50 };
        const fish = Fish.deserialize(data);
        assert.strictEqual(fish, null);
    });

    it('roundtrips serialize -> deserialize', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Angelfish');
        const original = new Fish(species, 25, 35, 45, 'Angel');
        original.hunger = 75;
        original.strength = 60;
        original.distanceSwum = 123.4;

        const data = original.serialize();
        const restored = Fish.deserialize(data);

        assert.strictEqual(restored.species.name, 'Angelfish');
        assert.strictEqual(restored.name, 'Angel');
        assert.strictEqual(restored.x, 25);
        assert.strictEqual(restored.y, 35);
        assert.strictEqual(restored.z, 45);
        assert.strictEqual(restored.hunger, 75);
        assert.strictEqual(restored.strength, 60);
        assertCloseTo(restored.distanceSwum, 123.4);
    });

    it('uses defaults for missing fields on deserialize', () => {
        const data = {
            speciesName: 'Guppy',
            // All other fields missing
        };
        const fish = Fish.deserialize(data);
        assert.notStrictEqual(fish, null);
        assert.strictEqual(fish.hunger, 50);
        assert.strictEqual(fish.strength, 80);
        assert.strictEqual(fish.happiness, 80);
        assert.strictEqual(fish.sadTimer, 0);
        assert.strictEqual(fish.distanceSwum, 0);
        assert.strictEqual(fish.xp, 0);
        assertCloseTo(fish.currentSize, 1.5 * 0.6);
    });
});

describe('Fish.getSizePixels', () => {
    it('returns currentSize * 20', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        assert.strictEqual(fish.getSizePixels(), fish.currentSize * 20);
    });
});

describe('Fish speed', () => {
    it('fish speed matches species speed', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Danio');
        const fish = new Fish(species);
        assert.strictEqual(fish.speed, 70); // Danio speed
    });
});

describe('Fish fry properties', () => {
    it('constructor defaults isFry to false and fryAge to 0', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species);
        assert.strictEqual(fish.isFry, false);
        assert.strictEqual(fish.fryAge, 0);
    });
});

describe('createFry', () => {
    it('creates a fry with isFry=true and 20% size', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fry = createFry(species);
        assert.strictEqual(fry.isFry, true);
        assert.strictEqual(fry.fryAge, 0);
        assertCloseTo(fry.currentSize, species.sizeInches * 0.2);
        assert.strictEqual(fry.name, 'Guppy Fry');
    });

    it('creates fry for each live bearer species', () => {
        for (const species of SPECIES_CATALOG.filter(s => s.liveBearer)) {
            const fry = createFry(species);
            assert.strictEqual(fry.isFry, true);
            assertCloseTo(fry.currentSize, species.sizeInches * 0.2);
            assert.strictEqual(fry.name, `${species.name} Fry`);
        }
    });
});

describe('Fry growth', () => {
    it('fry grows from 20% to 60% over 86400s', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Molly');
        const fry = createFry(species);

        // At start: 20% of max
        assertCloseTo(fry.currentSize, species.sizeInches * 0.2);

        // Simulate half growth (43200s)
        fry.update(43200);
        assert.strictEqual(fry.isFry, true);
        assertCloseTo(fry.currentSize,
            species.sizeInches * 0.2 + (species.sizeInches * 0.4) * 0.5,
            1
        );

        // Simulate remaining growth
        fry.update(43200);
        assert.strictEqual(fry.isFry, false);
        assertCloseTo(fry.currentSize, species.sizeInches * 0.6, 1);
    });

    it('fry clears isFry flag after 86400s', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fry = createFry(species);
        fry.update(86400);
        assert.strictEqual(fry.isFry, false);
    });

    it('normal fish do not grow when fry (isFry blocks normal growth)', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Platy');
        const fry = createFry(species);
        fry.hunger = 0; // well-fed
        fry.strength = 100;
        const sizeAfterSmallDt = fry.currentSize;
        fry.update(1);
        // Size should be determined by fry growth formula, not normal growth
        const expectedSize = species.sizeInches * 0.2 + (species.sizeInches * 0.4) * (1 / 86400);
        assertCloseTo(fry.currentSize, expectedSize, 4);
    });
});

describe('Fry serialize / deserialize', () => {
    it('serializes fry fields', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Swordtail');
        const fry = createFry(species);
        fry.fryAge = 1000;
        const data = fry.serialize();
        assert.strictEqual(data.isFry, true);
        assert.strictEqual(data.fryAge, 1000);
    });

    it('deserializes fry fields', () => {
        const data = {
            speciesName: 'Guppy',
            name: 'Guppy Fry',
            isFry: true,
            fryAge: 43200,
        };
        const fish = Fish.deserialize(data);
        assert.strictEqual(fish.isFry, true);
        assert.strictEqual(fish.fryAge, 43200);
        // Size should be at 50% growth (between 20% and 60%)
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const expectedSize = species.sizeInches * 0.2 + (species.sizeInches * 0.4) * 0.5;
        assertCloseTo(fish.currentSize, expectedSize, 2);
    });

    it('roundtrips fry serialize -> deserialize', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Molly');
        const fry = createFry(species);
        fry.fryAge = 20000;
        // Update size to match fryAge
        fry.update(0);

        const data = fry.serialize();
        const restored = Fish.deserialize(data);
        assert.strictEqual(restored.isFry, true);
        assert.strictEqual(restored.fryAge, 20000);
        assertCloseTo(restored.currentSize, fry.currentSize, 2);
    });

    it('defaults isFry to false for old saves without fry fields', () => {
        const data = { speciesName: 'Guppy' };
        const fish = Fish.deserialize(data);
        assert.strictEqual(fish.isFry, false);
        assert.strictEqual(fish.fryAge, 0);
    });
});

describe('tailDots', () => {
    it('Guppy constructor assigns tailDots 1–20', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        for (let i = 0; i < 50; i++) {
            const fish = new Fish(species);
            assert.ok(fish.tailDots >= 1 && fish.tailDots <= 20,
                `tailDots ${fish.tailDots} out of range`);
            assert.strictEqual(fish.tailDots, Math.floor(fish.tailDots));
        }
    });

    it('non-Guppy species have tailDots = 0', () => {
        for (const species of SPECIES_CATALOG.filter(s => s.name !== 'Guppy')) {
            const fish = new Fish(species);
            assert.strictEqual(fish.tailDots, 0);
        }
    });

    it('serializes and deserializes tailDots', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species);
        fish.tailDots = 15;
        const data = fish.serialize();
        assert.strictEqual(data.tailDots, 15);
        const restored = Fish.deserialize(data);
        assert.strictEqual(restored.tailDots, 15);
    });

    it('assigns random tailDots 1–20 for old Guppy saves', () => {
        const data = { speciesName: 'Guppy' };
        const fish = Fish.deserialize(data);
        assert.ok(fish.tailDots >= 1 && fish.tailDots <= 20);
    });

    it('fry inherits average of parents tailDots', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const parent1 = new Fish(species);
        parent1.tailDots = 10;
        const parent2 = new Fish(species);
        parent2.tailDots = 16;
        const fry = createFry(species, parent1, parent2);
        assert.strictEqual(fry.tailDots, 13); // Math.round((10+16)/2)
    });

    it('fry inherits rounded average for odd sums', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const parent1 = new Fish(species);
        parent1.tailDots = 7;
        const parent2 = new Fish(species);
        parent2.tailDots = 4;
        const fry = createFry(species, parent1, parent2);
        assert.strictEqual(fry.tailDots, 6); // Math.round(5.5) = 6
    });

    it('fry gets random tailDots 1–20 without parents', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fry = createFry(species);
        assert.ok(fry.tailDots >= 1 && fry.tailDots <= 20);
    });

    it('non-Guppy fry ignores parents tailDots', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Platy');
        const parent1 = new Fish(species);
        parent1.tailDots = 10;
        const parent2 = new Fish(species);
        parent2.tailDots = 16;
        const fry = createFry(species, parent1, parent2);
        assert.strictEqual(fry.tailDots, 0);
    });
});

describe('Fish.createVisitor', () => {
    it('creates a visitor fish from minimal data', () => {
        const visitor = Fish.createVisitor({
            speciesName: 'Neon Tetra',
            name: 'Zippy',
            currentSize: 0.8,
            isFry: false,
            tailDots: 0,
        });
        assert.notStrictEqual(visitor, null);
        assert.strictEqual(visitor.species.name, 'Neon Tetra');
        assert.strictEqual(visitor.name, 'Zippy');
        assert.strictEqual(visitor.currentSize, 0.8);
        assert.strictEqual(visitor.isFry, false);
        assert.strictEqual(visitor.tailDots, 0);
    });

    it('sets happy defaults', () => {
        const visitor = Fish.createVisitor({ speciesName: 'Guppy' });
        assert.strictEqual(visitor.happiness, 80);
        assert.strictEqual(visitor.hunger, 0);
        assert.strictEqual(visitor.strength, 100);
    });

    it('returns null for unknown species', () => {
        const visitor = Fish.createVisitor({ speciesName: 'UnknownFish' });
        assert.strictEqual(visitor, null);
    });

    it('uses defaults for missing fields', () => {
        const visitor = Fish.createVisitor({ speciesName: 'Molly' });
        const species = SPECIES_CATALOG.find(s => s.name === 'Molly');
        assertCloseTo(visitor.currentSize, species.sizeInches * 0.6);
        assert.strictEqual(visitor.isFry, false);
        assert.strictEqual(visitor.tailDots, 0);
    });

    it('preserves Guppy tailDots', () => {
        const visitor = Fish.createVisitor({
            speciesName: 'Guppy',
            tailDots: 15,
        });
        assert.strictEqual(visitor.tailDots, 15);
    });

    it('creates fry visitors', () => {
        const visitor = Fish.createVisitor({
            speciesName: 'Platy',
            isFry: true,
            currentSize: 0.4,
        });
        assert.strictEqual(visitor.isFry, true);
        assert.strictEqual(visitor.currentSize, 0.4);
    });
});

describe('Fish.updateVisitMode', () => {
    it('moves fish over time', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Danio');
        const fish = new Fish(species, 50, 50, 50);
        const startX = fish.x;
        const startZ = fish.z;
        // Simulate several frames
        for (let i = 0; i < 60; i++) {
            fish.updateVisitMode(1 / 60);
        }
        // Fish should have moved
        const moved = Math.abs(fish.x - startX) + Math.abs(fish.z - startZ);
        assert.ok(moved > 0, 'Fish should move during visit mode');
    });

    it('keeps fish in bounds', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
        const fish = new Fish(species, 95, 95, 95);
        fish.heading = 0; // facing right (toward wall)
        for (let i = 0; i < 300; i++) {
            fish.updateVisitMode(1 / 60);
        }
        assert.ok(fish.x >= 5 && fish.x <= 95, `x=${fish.x} out of bounds`);
        assert.ok(fish.y >= 5 && fish.y <= 95, `y=${fish.y} out of bounds`);
        assert.ok(fish.z >= 5 && fish.z <= 95, `z=${fish.z} out of bounds`);
    });

    it('does not change hunger or happiness', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = Fish.createVisitor({ speciesName: 'Guppy' });
        const startHunger = fish.hunger;
        const startHappiness = fish.happiness;
        const startStrength = fish.strength;
        for (let i = 0; i < 120; i++) {
            fish.updateVisitMode(1 / 60);
        }
        assert.strictEqual(fish.hunger, startHunger);
        assert.strictEqual(fish.happiness, startHappiness);
        assert.strictEqual(fish.strength, startStrength);
    });

    it('advances tail animation', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
        const fish = new Fish(species, 50, 50, 50);
        const startPhase = fish.tailPhase;
        fish.updateVisitMode(1);
        assert.ok(fish.tailPhase > startPhase, 'tailPhase should advance');
    });
});

describe('Fish.boopVisit', () => {
    it('sets state to booped', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boopVisit();
        assert.strictEqual(fish.state, 'booped');
    });

    it('sets boopTimer to 0.6', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boopVisit();
        assertCloseTo(fish.boopTimer, 0.6);
    });

    it('does NOT change strength', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.strength = 50;
        fish.boopVisit();
        assert.strictEqual(fish.strength, 50);
    });

    it('does not boop again while already booped', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boopVisit();
        const timer = fish.boopTimer;
        fish.boopVisit();
        assert.strictEqual(fish.boopTimer, timer);
    });

    it('changes target heading on boop', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        const originalHeading = fish.targetHeading;
        fish.boopVisit();
        assert.notStrictEqual(fish.targetHeading, originalHeading);
    });
});

describe('Fish.updateVisitMode boop handling', () => {
    it('decrements boopTimer during visit mode', () => {
        const fish = Fish.createVisitor({ speciesName: 'Guppy' });
        fish.boopVisit();
        assert.strictEqual(fish.state, 'booped');
        fish.updateVisitMode(0.3);
        assertCloseTo(fish.boopTimer, 0.3);
        assert.strictEqual(fish.state, 'booped');
    });

    it('transitions back to wandering when boopTimer expires', () => {
        const fish = Fish.createVisitor({ speciesName: 'Guppy' });
        fish.boopVisit();
        fish.updateVisitMode(0.7);
        assert.strictEqual(fish.state, 'wandering');
        assert.ok(fish.boopTimer <= 0);
    });

    it('uses faster tail wag during boop', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
        const fish = new Fish(species, 50, 50, 50);
        const phaseBefore = fish.tailPhase;
        fish.boopVisit();
        fish.updateVisitMode(0.5); // Stay within 0.6s boop timer
        const phaseAdvance = fish.tailPhase - phaseBefore;
        assertCloseTo(phaseAdvance, 9, 0); // wagSpeed 18 * 0.5s = 9
    });

    it('does not change stats after boop + recovery cycle', () => {
        const fish = Fish.createVisitor({ speciesName: 'Guppy' });
        const startHunger = fish.hunger;
        const startStrength = fish.strength;
        const startHappiness = fish.happiness;
        fish.boopVisit();
        for (let i = 0; i < 60; i++) {
            fish.updateVisitMode(1 / 60);
        }
        assert.strictEqual(fish.hunger, startHunger);
        assert.strictEqual(fish.strength, startStrength);
        assert.strictEqual(fish.happiness, startHappiness);
    });
});

describe('Rainbow boop (sanctuary)', () => {
    it('rainbowTimer initializes to 0', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        assert.strictEqual(fish.rainbowTimer, 0);
    });

    it('boopVisit sets rainbowTimer to 3', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boopVisit();
        assert.strictEqual(fish.rainbowTimer, 3);
    });

    it('updateVisitMode decrements rainbowTimer', () => {
        const fish = Fish.createVisitor({ speciesName: 'Guppy' });
        fish.boopVisit();
        assert.strictEqual(fish.rainbowTimer, 3);
        fish.updateVisitMode(1);
        assertCloseTo(fish.rainbowTimer, 2);
    });

    it('rainbowTimer does not go below 0', () => {
        const fish = Fish.createVisitor({ speciesName: 'Guppy' });
        fish.boopVisit();
        fish.updateVisitMode(5); // well past the 3s timer
        assert.strictEqual(fish.rainbowTimer, 0);
    });
});
