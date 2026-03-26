import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Fish, SPECIES_CATALOG } from '../../js/fish.js';
import { loadTankState } from '../../js/tank.js';
import {
    extractRetireData,
    setCameraX, setCameraY, getCameraX, getCameraY,
    panCamera,
    getVisibleChunkIndices,
    clearSanctuaryCache,
    CHUNK_WORLD_WIDTH, CHUNK_WORLD_HEIGHT,
} from '../../js/sanctuary.js';

beforeEach(() => {
    loadTankState({
        ammonia: 0, nitrite: 0, nitrate: 0,
        bacteria: 5, algae: 0, freeFeed: false,
        gallons: 10, capacityInches: 5,
        decorations: [],
    });
    // Reset camera and meta to defaults (10x10 grid)
    clearSanctuaryCache();
});

describe('extractRetireData', () => {
    it('extracts correct fields from a Fish instance', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Guppy');
        const fish = new Fish(species, 50, 50, 50, 'Bubbles');
        fish.tailDots = 12;
        fish.currentSize = 1.5;

        const data = extractRetireData(fish);
        assert.strictEqual(data.speciesName, 'Guppy');
        assert.strictEqual(data.name, 'Bubbles');
        assert.strictEqual(data.currentSize, 1.5);
        assert.strictEqual(data.isFry, false);
        assert.strictEqual(data.tailDots, 12);
    });

    it('omits private fields like hunger, strength, position', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
        const fish = new Fish(species, 30, 40, 50);
        fish.hunger = 70;
        fish.strength = 90;

        const data = extractRetireData(fish);
        assert.strictEqual(data.x, undefined);
        assert.strictEqual(data.y, undefined);
        assert.strictEqual(data.z, undefined);
        assert.strictEqual(data.hunger, undefined);
        assert.strictEqual(data.strength, undefined);
    });

    it('includes isFry=true for fry fish', () => {
        const species = SPECIES_CATALOG.find(s => s.name === 'Molly');
        const fish = new Fish(species);
        fish.isFry = true;
        const data = extractRetireData(fish);
        assert.strictEqual(data.isFry, true);
    });
});

describe('Camera clamping', () => {
    // Default meta: gridWidth=10, gridHeight=10
    // totalWidth = 10 * 100 = 1000, max cameraX = 1000 - 100 = 900

    it('setCameraX clamps to 0 when negative', () => {
        setCameraX(-50);
        assert.strictEqual(getCameraX(), 0);
    });

    it('setCameraX clamps to max when exceeding grid', () => {
        setCameraX(9999);
        assert.strictEqual(getCameraX(), 900);
    });

    it('setCameraX allows valid mid-range value', () => {
        setCameraX(450);
        assert.strictEqual(getCameraX(), 450);
    });

    it('setCameraY clamps to 0 when negative', () => {
        setCameraY(-10);
        assert.strictEqual(getCameraY(), 0);
    });

    it('setCameraY clamps to max when exceeding grid', () => {
        setCameraY(9999);
        assert.strictEqual(getCameraY(), 900);
    });

    it('setCameraY allows valid mid-range value', () => {
        setCameraY(300);
        assert.strictEqual(getCameraY(), 300);
    });
});

describe('panCamera', () => {
    it('updates both axes', () => {
        panCamera(150, 200);
        assert.strictEqual(getCameraX(), 150);
        assert.strictEqual(getCameraY(), 200);
    });

    it('accumulates multiple pans', () => {
        panCamera(100, 50);
        panCamera(200, 100);
        assert.strictEqual(getCameraX(), 300);
        assert.strictEqual(getCameraY(), 150);
    });

    it('clamps after pan', () => {
        panCamera(850, 0);
        panCamera(200, 0); // would exceed 900
        assert.strictEqual(getCameraX(), 900);
    });
});

describe('getVisibleChunkIndices', () => {
    it('returns chunks covering viewport at camera origin', () => {
        setCameraX(0);
        setCameraY(0);
        const indices = getVisibleChunkIndices();
        // camera covers [0,100], right edge 100 => floor(100/100)=1
        // So chunks (0,0), (1,0), (0,1), (1,1)
        const keys = indices.map(i => `${i.cx},${i.cy}`).sort();
        assert.ok(keys.includes('0,0'));
        assert.ok(indices.length >= 1);
    });

    it('returns correct chunks when camera aligned to chunk boundary', () => {
        setCameraX(200);
        setCameraY(300);
        const indices = getVisibleChunkIndices();
        // camera covers [200,300] x [300,400]
        // X: floor(200/100)=2, floor(300/100)=3 => cx 2,3
        // Y: floor(300/100)=3, floor(400/100)=4 => cy 3,4
        const keys = indices.map(i => `${i.cx},${i.cy}`).sort();
        assert.ok(keys.includes('2,3'));
        assert.ok(keys.includes('3,3'));
        assert.ok(keys.includes('2,4'));
        assert.ok(keys.includes('3,4'));
        assert.strictEqual(indices.length, 4);
    });

    it('returns multiple chunks when camera spans a boundary', () => {
        setCameraX(50);
        setCameraY(0);
        const indices = getVisibleChunkIndices();
        // X: [50,150] => cx 0,1; Y: [0,100] => cy 0,1
        const keys = indices.map(i => `${i.cx},${i.cy}`).sort();
        assert.ok(keys.includes('0,0'));
        assert.ok(keys.includes('1,0'));
        assert.ok(indices.length >= 2);
    });

    it('returns 4+ chunks when camera spans both axes', () => {
        setCameraX(50);
        setCameraY(50);
        const indices = getVisibleChunkIndices();
        // X: [50,150] => cx 0,1; Y: [50,150] => cy 0,1
        const keys = indices.map(i => `${i.cx},${i.cy}`).sort();
        assert.ok(keys.includes('0,0'));
        assert.ok(keys.includes('1,0'));
        assert.ok(keys.includes('0,1'));
        assert.ok(keys.includes('1,1'));
        assert.ok(indices.length >= 4);
    });

    it('clamps to grid bounds at max camera position', () => {
        setCameraX(900);
        setCameraY(900);
        const indices = getVisibleChunkIndices();
        // camera covers [900,1000], but grid max is 9
        // So cx=9, cy=9 only
        const keys = indices.map(i => `${i.cx},${i.cy}`).sort();
        assert.ok(keys.includes('9,9'));
        assert.strictEqual(indices.length, 1);
    });
});
