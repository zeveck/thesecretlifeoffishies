import { describe, it, expect, beforeEach } from 'vitest';
import { Fish, SPECIES_CATALOG, createFry } from '../../js/fish.js';
import { loadTankState } from '../../js/tank.js';

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
        expect(SPECIES_CATALOG).toHaveLength(14);
    });

    it('all species have required fields', () => {
        for (const s of SPECIES_CATALOG) {
            expect(s).toHaveProperty('name');
            expect(s).toHaveProperty('sizeInches');
            expect(s).toHaveProperty('level');
            expect(s).toHaveProperty('body');
            expect(s).toHaveProperty('fin');
            expect(s).toHaveProperty('belly');
            expect(s).toHaveProperty('speed');
            expect(s).toHaveProperty('aspect');
            expect(s).toHaveProperty('tailStyle');
            expect(s).toHaveProperty('finStyle');
            expect(typeof s.name).toBe('string');
            expect(typeof s.sizeInches).toBe('number');
            expect(typeof s.level).toBe('number');
            expect(s.sizeInches).toBeGreaterThan(0);
            expect(s.level).toBeGreaterThanOrEqual(1);
            expect(s.level).toBeLessThanOrEqual(7);
        }
    });

    it('all species names are unique', () => {
        const names = SPECIES_CATALOG.map(s => s.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('species span levels 1-7', () => {
        const levels = new Set(SPECIES_CATALOG.map(s => s.level));
        for (let i = 1; i <= 7; i++) {
            expect(levels.has(i)).toBe(true);
        }
    });

    it('each tail style is a valid value', () => {
        const validStyles = ['fork', 'fan', 'round', 'sword'];
        for (const s of SPECIES_CATALOG) {
            expect(validStyles).toContain(s.tailStyle);
        }
    });

    it('each fin style is a valid value', () => {
        const validStyles = ['small', 'medium', 'tall', 'flowing'];
        for (const s of SPECIES_CATALOG) {
            expect(validStyles).toContain(s.finStyle);
        }
    });

    it('only Neon Tetra has glowStripe', () => {
        const withGlow = SPECIES_CATALOG.filter(s => s.glowStripe);
        expect(withGlow).toHaveLength(1);
        expect(withGlow[0].name).toBe('Neon Tetra');
    });

    it('marks Guppy, Platy, Molly, Swordtail as live bearers', () => {
        const liveBearers = SPECIES_CATALOG.filter(s => s.liveBearer);
        const names = liveBearers.map(s => s.name).sort();
        expect(names).toEqual(['Guppy', 'Molly', 'Platy', 'Swordtail']);
    });

    it('non-live-bearer species do not have liveBearer flag', () => {
        const nonLiveBearers = SPECIES_CATALOG.filter(s => !s.liveBearer);
        expect(nonLiveBearers.length).toBe(10);
        for (const s of nonLiveBearers) {
            expect(s.liveBearer).toBeFalsy();
        }
    });
});

describe('Fish constructor', () => {
    it('creates a fish with species properties', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
        const fish = new Fish(species, 50, 50, 50);
        expect(fish.species).toBe(species);
        expect(fish.x).toBe(50);
        expect(fish.y).toBe(50);
        expect(fish.z).toBe(50);
    });

    it('auto-generates position when not provided', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species);
        // rand(min, max) returns [min, max)
        expect(fish.x).toBeGreaterThanOrEqual(15);
        expect(fish.x).toBeLessThan(85);
        expect(fish.y).toBeGreaterThanOrEqual(15);
        expect(fish.y).toBeLessThan(80);
        expect(fish.z).toBeGreaterThanOrEqual(15);
        expect(fish.z).toBeLessThan(85);
    });

    it('starts at 60% of max size', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Angelfish');
        const fish = new Fish(species);
        expect(fish.currentSize).toBeCloseTo(species.sizeInches * 0.6);
        expect(fish.maxSize).toBe(species.sizeInches);
    });

    it('starts with default hunger, strength, happiness', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        expect(fish.hunger).toBe(50);
        expect(fish.strength).toBe(80);
        expect(fish.happiness).toBe(80);
    });

    it('starts in wandering state', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        expect(fish.state).toBe('wandering');
    });

    it('assigns an optional name', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species, 50, 50, 50, 'Bubbles');
        expect(fish.name).toBe('Bubbles');
    });

    it('name defaults to empty string', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        expect(fish.name).toBe('');
    });

    it('assigns unique IDs', () => {
        const species = SPECIES_CATALOG[0];
        const fish1 = new Fish(species);
        const fish2 = new Fish(species);
        expect(fish1.id).not.toBe(fish2.id);
    });

    it('initializes distance and xp to 0', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        expect(fish.distanceSwum).toBe(0);
        expect(fish.xp).toBe(0);
    });

    it('initializes leaving state to false', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        expect(fish.leaving).toBe(false);
        expect(fish.leaveProgress).toBe(0);
    });
});

describe('Fish.displayName', () => {
    it('returns species name when no custom name', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species);
        expect(fish.displayName()).toBe('Guppy');
    });

    it('returns "name (species)" when custom name is set', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species, 50, 50, 50, 'Nemo');
        expect(fish.displayName()).toBe('Nemo (Guppy)');
    });

    it('returns species name for empty string name', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Betta');
        const fish = new Fish(species, 50, 50, 50, '');
        expect(fish.displayName()).toBe('Betta');
    });
});

describe('Fish.boop', () => {
    it('sets state to booped', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boop();
        expect(fish.state).toBe('booped');
    });

    it('sets boopTimer', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boop();
        expect(fish.boopTimer).toBeCloseTo(0.6);
    });

    it('increases strength by 5 (clamped to 100)', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.strength = 50;
        fish.boop();
        expect(fish.strength).toBe(55);
    });

    it('clamps strength at 100', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.strength = 98;
        fish.boop();
        expect(fish.strength).toBe(100);
    });

    it('does not boop again while already booped', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        fish.boop();
        const timer = fish.boopTimer;
        const heading = fish.targetHeading;
        fish.boop(); // should be ignored
        expect(fish.boopTimer).toBe(timer);
    });

    it('changes target heading on boop', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        const originalHeading = fish.targetHeading;
        fish.boop();
        expect(fish.targetHeading).not.toBe(originalHeading);
    });
});

describe('Fish.serialize / Fish.deserialize', () => {
    it('serializes fish state', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Molly');
        const fish = new Fish(species, 30, 40, 50, 'Shadow');
        fish.hunger = 60;
        fish.strength = 70;

        const data = fish.serialize();
        expect(data.speciesName).toBe('Molly');
        expect(data.name).toBe('Shadow');
        expect(data.x).toBe(30);
        expect(data.y).toBe(40);
        expect(data.z).toBe(50);
        expect(data.hunger).toBe(60);
        expect(data.strength).toBe(70);
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
        expect(fish).not.toBeNull();
        expect(fish.species.name).toBe('Molly');
        expect(fish.name).toBe('Shadow');
        expect(fish.x).toBe(30);
        expect(fish.y).toBe(40);
        expect(fish.z).toBe(50);
        expect(fish.heading).toBe(1.5);
        expect(fish.currentSize).toBe(2.5);
        expect(fish.hunger).toBe(60);
        expect(fish.strength).toBe(70);
        expect(fish.happiness).toBe(65);
        expect(fish.sadTimer).toBe(10);
        expect(fish.distanceSwum).toBe(500);
        expect(fish.xp).toBe(100);
    });

    it('returns null for unknown species', () => {
        const data = { speciesName: 'NonExistentFish', x: 50, y: 50, z: 50 };
        const fish = Fish.deserialize(data);
        expect(fish).toBeNull();
    });

    it('roundtrips serialize -> deserialize', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Angelfish');
        const original = new Fish(species, 25, 35, 45, 'Angel');
        original.hunger = 75;
        original.strength = 60;
        original.distanceSwum = 123.4;

        const data = original.serialize();
        const restored = Fish.deserialize(data);

        expect(restored.species.name).toBe('Angelfish');
        expect(restored.name).toBe('Angel');
        expect(restored.x).toBe(25);
        expect(restored.y).toBe(35);
        expect(restored.z).toBe(45);
        expect(restored.hunger).toBe(75);
        expect(restored.strength).toBe(60);
        expect(restored.distanceSwum).toBeCloseTo(123.4);
    });

    it('uses defaults for missing fields on deserialize', () => {
        const data = {
            speciesName: 'Guppy',
            // All other fields missing
        };
        const fish = Fish.deserialize(data);
        expect(fish).not.toBeNull();
        expect(fish.hunger).toBe(50);
        expect(fish.strength).toBe(80);
        expect(fish.happiness).toBe(80);
        expect(fish.sadTimer).toBe(0);
        expect(fish.distanceSwum).toBe(0);
        expect(fish.xp).toBe(0);
        expect(fish.currentSize).toBeCloseTo(1.5 * 0.6);
    });
});

describe('Fish.getSizePixels', () => {
    it('returns currentSize * 20', () => {
        const species = SPECIES_CATALOG[0];
        const fish = new Fish(species);
        expect(fish.getSizePixels()).toBe(fish.currentSize * 20);
    });
});

describe('Fish speed', () => {
    it('fish speed matches species speed', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Danio');
        const fish = new Fish(species);
        expect(fish.speed).toBe(70); // Danio speed
    });
});

describe('Fish fry properties', () => {
    it('constructor defaults isFry to false and fryAge to 0', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species);
        expect(fish.isFry).toBe(false);
        expect(fish.fryAge).toBe(0);
    });
});

describe('createFry', () => {
    it('creates a fry with isFry=true and 20% size', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fry = createFry(species);
        expect(fry.isFry).toBe(true);
        expect(fry.fryAge).toBe(0);
        expect(fry.currentSize).toBeCloseTo(species.sizeInches * 0.2);
        expect(fry.name).toBe('Guppy Fry');
    });

    it('creates fry for each live bearer species', () => {
        for (const species of SPECIES_CATALOG.filter(s => s.liveBearer)) {
            const fry = createFry(species);
            expect(fry.isFry).toBe(true);
            expect(fry.currentSize).toBeCloseTo(species.sizeInches * 0.2);
            expect(fry.name).toBe(`${species.name} Fry`);
        }
    });
});

describe('Fry growth', () => {
    it('fry grows from 20% to 60% over 86400s', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Molly');
        const fry = createFry(species);

        // At start: 20% of max
        expect(fry.currentSize).toBeCloseTo(species.sizeInches * 0.2);

        // Simulate half growth (43200s)
        fry.update(43200);
        expect(fry.isFry).toBe(true);
        expect(fry.currentSize).toBeCloseTo(
            species.sizeInches * 0.2 + (species.sizeInches * 0.4) * 0.5,
            1
        );

        // Simulate remaining growth
        fry.update(43200);
        expect(fry.isFry).toBe(false);
        expect(fry.currentSize).toBeCloseTo(species.sizeInches * 0.6, 1);
    });

    it('fry clears isFry flag after 86400s', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fry = createFry(species);
        fry.update(86400);
        expect(fry.isFry).toBe(false);
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
        expect(fry.currentSize).toBeCloseTo(expectedSize, 4);
    });
});

describe('Fry serialize / deserialize', () => {
    it('serializes fry fields', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Swordtail');
        const fry = createFry(species);
        fry.fryAge = 1000;
        const data = fry.serialize();
        expect(data.isFry).toBe(true);
        expect(data.fryAge).toBe(1000);
    });

    it('deserializes fry fields', () => {
        const data = {
            speciesName: 'Guppy',
            name: 'Guppy Fry',
            isFry: true,
            fryAge: 43200,
        };
        const fish = Fish.deserialize(data);
        expect(fish.isFry).toBe(true);
        expect(fish.fryAge).toBe(43200);
        // Size should be at 50% growth (between 20% and 60%)
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const expectedSize = species.sizeInches * 0.2 + (species.sizeInches * 0.4) * 0.5;
        expect(fish.currentSize).toBeCloseTo(expectedSize, 2);
    });

    it('roundtrips fry serialize -> deserialize', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Molly');
        const fry = createFry(species);
        fry.fryAge = 20000;
        // Update size to match fryAge
        fry.update(0);

        const data = fry.serialize();
        const restored = Fish.deserialize(data);
        expect(restored.isFry).toBe(true);
        expect(restored.fryAge).toBe(20000);
        expect(restored.currentSize).toBeCloseTo(fry.currentSize, 2);
    });

    it('defaults isFry to false for old saves without fry fields', () => {
        const data = { speciesName: 'Guppy' };
        const fish = Fish.deserialize(data);
        expect(fish.isFry).toBe(false);
        expect(fish.fryAge).toBe(0);
    });
});
