import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { extractShareData, getBookmarks, addBookmark, removeBookmark } from '../../js/live.js';
import { loadTankState } from '../../js/tank.js';
import { loadProgression } from '../../js/store.js';

beforeEach(() => {
    loadTankState({
        ammonia: 0, nitrite: 0, nitrate: 0,
        bacteria: 5, algae: 0, freeFeed: false,
        gallons: 20, capacityInches: 10,
        decorations: [{ id: 'castle', x: 30, y: 80 }],
    });
    loadProgression({ xp: 300, level: 3, coins: 50, pellets: 10, lastDailyRefresh: Date.now(), lastPassiveTick: Date.now() });
    // Clear bookmarks
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('fishies_bookmarks');
        localStorage.removeItem('fishies_live');
    }
});

describe('extractShareData', () => {
    it('filters fish to shareable subset', () => {
        const saveState = {
            fish: [
                { speciesName: 'Neon Tetra', name: 'Zippy', currentSize: 0.8, isFry: false, tailDots: 0, x: 50, y: 50, z: 50, hunger: 60, strength: 70, happiness: 80, heading: 1.5, sadTimer: 0, distanceSwum: 100, xp: 50 },
                { speciesName: 'Guppy', name: '', currentSize: 1.2, isFry: true, tailDots: 12, x: 30, y: 40, z: 60, hunger: 40, strength: 90, happiness: 90, heading: 0, sadTimer: 0, distanceSwum: 200, xp: 80 },
            ],
        };

        const result = extractShareData(saveState, 3);

        assert.strictEqual(result.fish.length, 2);
        assert.strictEqual(result.level, 3);
        assert.strictEqual(result.gallons, 20);

        // Fish should only have shareable fields
        const f1 = result.fish[0];
        assert.strictEqual(f1.speciesName, 'Neon Tetra');
        assert.strictEqual(f1.name, 'Zippy');
        assert.strictEqual(f1.currentSize, 0.8);
        assert.strictEqual(f1.isFry, false);
        assert.strictEqual(f1.tailDots, 0);

        // Private fields must be omitted
        assert.strictEqual(f1.x, undefined);
        assert.strictEqual(f1.y, undefined);
        assert.strictEqual(f1.z, undefined);
        assert.strictEqual(f1.hunger, undefined);
        assert.strictEqual(f1.strength, undefined);
        assert.strictEqual(f1.happiness, undefined);
        assert.strictEqual(f1.heading, undefined);
        assert.strictEqual(f1.sadTimer, undefined);
        assert.strictEqual(f1.distanceSwum, undefined);
        assert.strictEqual(f1.xp, undefined);

        // Second fish
        const f2 = result.fish[1];
        assert.strictEqual(f2.speciesName, 'Guppy');
        assert.strictEqual(f2.isFry, true);
        assert.strictEqual(f2.tailDots, 12);
    });

    it('includes decorations with positions', () => {
        const saveState = { fish: [] };
        const result = extractShareData(saveState, 3);

        assert.strictEqual(result.decorations.length, 1);
        assert.strictEqual(result.decorations[0].id, 'castle');
        assert.strictEqual(result.decorations[0].x, 30);
        assert.strictEqual(result.decorations[0].y, 80);
    });

    it('handles empty fish array', () => {
        const saveState = { fish: [] };
        const result = extractShareData(saveState, 1);
        assert.deepStrictEqual(result.fish, []);
        assert.strictEqual(result.level, 1);
    });

    it('handles missing fish key', () => {
        const saveState = {};
        const result = extractShareData(saveState, 2);
        assert.deepStrictEqual(result.fish, []);
    });

    it('uses progression level when level not specified', () => {
        const saveState = { fish: [] };
        const result = extractShareData(saveState);
        assert.strictEqual(result.level, 3); // From loadProgression above
    });
});

describe('Bookmark CRUD', () => {
    // Skip if localStorage is not available (e.g. in Node without jsdom)
    const hasLocalStorage = typeof localStorage !== 'undefined';

    it('getBookmarks returns empty array initially', { skip: !hasLocalStorage }, () => {
        const bookmarks = getBookmarks();
        assert.deepStrictEqual(bookmarks, []);
    });

    it('addBookmark adds a bookmark', { skip: !hasLocalStorage }, () => {
        addBookmark('abcd1234', 'Test Tank');
        const bookmarks = getBookmarks();
        assert.strictEqual(bookmarks.length, 1);
        assert.strictEqual(bookmarks[0].code, 'abcd1234');
        assert.strictEqual(bookmarks[0].label, 'Test Tank');
        assert.ok(bookmarks[0].visitedAt > 0);
    });

    it('addBookmark does not add duplicates', { skip: !hasLocalStorage }, () => {
        addBookmark('abcd1234', 'Tank 1');
        addBookmark('abcd1234', 'Tank 1 again');
        const bookmarks = getBookmarks();
        assert.strictEqual(bookmarks.length, 1);
    });

    it('addBookmark can add multiple different bookmarks', { skip: !hasLocalStorage }, () => {
        addBookmark('aaaa1111', 'Tank A');
        addBookmark('bbbb2222', 'Tank B');
        const bookmarks = getBookmarks();
        assert.strictEqual(bookmarks.length, 2);
    });

    it('removeBookmark removes by code', { skip: !hasLocalStorage }, () => {
        addBookmark('aaaa1111', 'Tank A');
        addBookmark('bbbb2222', 'Tank B');
        removeBookmark('aaaa1111');
        const bookmarks = getBookmarks();
        assert.strictEqual(bookmarks.length, 1);
        assert.strictEqual(bookmarks[0].code, 'bbbb2222');
    });

    it('removeBookmark is safe for non-existent code', { skip: !hasLocalStorage }, () => {
        addBookmark('aaaa1111', 'Tank A');
        removeBookmark('zzzz9999');
        const bookmarks = getBookmarks();
        assert.strictEqual(bookmarks.length, 1);
    });
});
