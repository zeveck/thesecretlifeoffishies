import { test, expect } from '@playwright/test';

// Helper: dismiss the start overlay by clicking the start button
async function startGame(page) {
    // Clear localStorage on load to ensure consistent first-time experience
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');

    // Wait for the start overlay to appear (module script is deferred)
    const startBtn = page.locator('#start-btn');
    await startBtn.waitFor({ state: 'visible', timeout: 5000 });
    await startBtn.click();

    // Wait for the start overlay to stop intercepting (opacity transition + pointer-events)
    await expect(page.locator('#start-overlay')).toHaveClass(/hidden/, { timeout: 10000 });
    // Wait for the HUD to be rendered (indicates game init completed)
    await expect(page.locator('#hud')).toBeVisible({ timeout: 10000 });
    // Allow overlay fade transition to fully complete
    await page.waitForTimeout(600);
}

// --- Drawer Tests ---
test.describe('Drawer', () => {
    test('hamburger menu opens the drawer', async ({ page }) => {
        await startGame(page);
        const drawer = page.locator('#drawer');
        await expect(drawer).toHaveClass(/hidden/);

        await page.locator('#menu-btn').click();
        await expect(drawer).not.toHaveClass(/hidden/);
    });

    test('hamburger menu toggles drawer closed', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        const drawer = page.locator('#drawer');
        await expect(drawer).not.toHaveClass(/hidden/);

        // Drawer overlaps the menu button (z-index 30 vs 10), so dispatch click via JS
        await page.locator('#menu-btn').dispatchEvent('click');
        await expect(drawer).toHaveClass(/hidden/);
    });

    test('clicking overlay closes drawer', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        const drawer = page.locator('#drawer');
        await expect(drawer).not.toHaveClass(/hidden/);

        await page.locator('#drawer-overlay').click({ position: { x: 5, y: 5 } });
        await expect(drawer).toHaveClass(/hidden/);
    });

    test('tabs switch correctly', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();

        // Tank tab is active by default
        const tankTab = page.locator('.tab[data-tab="tank"]');
        const storeTab = page.locator('.tab[data-tab="store"]');
        const fishTab = page.locator('.tab[data-tab="fish"]');

        await expect(tankTab).toHaveClass(/active/);
        await expect(page.locator('#tab-tank')).toHaveClass(/active/);

        // Click Store tab
        await storeTab.click();
        await expect(storeTab).toHaveClass(/active/);
        await expect(page.locator('#tab-store')).toHaveClass(/active/);
        await expect(tankTab).not.toHaveClass(/active/);
        await expect(page.locator('#tab-tank')).not.toHaveClass(/active/);

        // Click My Fish tab
        await fishTab.click();
        await expect(fishTab).toHaveClass(/active/);
        await expect(page.locator('#tab-fish')).toHaveClass(/active/);
        await expect(storeTab).not.toHaveClass(/active/);
    });
});

// --- Config Dialog Tests ---
test.describe('Config dialog', () => {
    test('gear button opens config dialog', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();

        const configOverlay = page.locator('#config-overlay');
        await expect(configOverlay).toHaveClass(/hidden/);

        await page.locator('#btn-config').click();
        await expect(configOverlay).not.toHaveClass(/hidden/);
    });

    test('close button closes config dialog', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();

        const configOverlay = page.locator('#config-overlay');
        await expect(configOverlay).not.toHaveClass(/hidden/);

        await page.locator('#btn-config-close').click();
        await expect(configOverlay).toHaveClass(/hidden/);
    });

    test('clicking overlay closes config dialog', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();

        const configOverlay = page.locator('#config-overlay');
        await expect(configOverlay).not.toHaveClass(/hidden/);

        // Click the overlay itself (outside the dialog)
        await configOverlay.click({ position: { x: 5, y: 5 } });
        await expect(configOverlay).toHaveClass(/hidden/);
    });

    test('free feed toggle works', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();

        const toggle = page.locator('#toggle-free-feed');
        await expect(toggle).not.toBeChecked();

        await toggle.check();
        await expect(toggle).toBeChecked();
    });

    test('show view toggle is checked by default', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();

        const toggle = page.locator('#toggle-show-view');
        await expect(toggle).toBeChecked();
    });

    test('high contrast toggle applies class to body', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();

        const toggle = page.locator('#toggle-high-contrast');
        await expect(toggle).not.toBeChecked();

        await toggle.check();
        await expect(page.locator('body')).toHaveClass(/high-contrast/);

        await toggle.uncheck();
        await expect(page.locator('body')).not.toHaveClass(/high-contrast/);
    });

    test('volume sliders are visible in config dialog', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();

        await expect(page.locator('#slider-master-volume')).toBeVisible();
        await expect(page.locator('#slider-sfx-volume')).toBeVisible();
        await expect(page.locator('#slider-music-volume')).toBeVisible();
    });

    test('volume slider value labels show percentages', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();

        await expect(page.locator('#val-master-volume')).toHaveText('70%');
        await expect(page.locator('#val-sfx-volume')).toHaveText('80%');
        await expect(page.locator('#val-music-volume')).toHaveText('50%');
    });

    test('volume slider updates displayed value on input', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();

        const slider = page.locator('#slider-master-volume');
        await slider.fill('25');
        await expect(page.locator('#val-master-volume')).toHaveText('25%');
    });
});

// --- Store Tests ---
test.describe('Store', () => {
    test('store tab shows section headers', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="store"]').click();

        await expect(page.locator('#store-section-food')).toBeVisible();
        await expect(page.locator('#store-section-fish')).toBeVisible();
        await expect(page.locator('#store-section-decor')).toBeVisible();
        await expect(page.locator('#store-section-care')).toBeVisible();
    });

    test('store has pill navigation buttons', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="store"]').click();

        const pills = page.locator('.store-pill');
        await expect(pills).toHaveCount(4);

        // Check labels
        await expect(pills.nth(0)).toHaveText('Food');
        await expect(pills.nth(1)).toHaveText('Fish');
        await expect(pills.nth(2)).toHaveText('Decor');
        await expect(pills.nth(3)).toHaveText('Care');
    });

    test('clicking a pill makes it active', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="store"]').click();

        const fishPill = page.locator('.store-pill[data-section="fish"]');
        await fishPill.click();
        await expect(fishPill).toHaveClass(/active/);
    });

    test('store shows tank capacity', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="store"]').click();

        const cap = page.locator('#store-capacity');
        await expect(cap).toBeVisible();
        // Should show something like "Tank: X.X / 5" stocked"
        await expect(cap).toContainText('Tank:');
        await expect(cap).toContainText('stocked');
    });

    test('store lists fish species', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="store"]').click();

        // Should have Neon Tetra and Guppy (level 1 species) listed
        const storeList = page.locator('#store-list');
        await expect(storeList).toContainText('Neon Tetra');
        await expect(storeList).toContainText('Guppy');
    });

    test('store shows food pack option', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="store"]').click();

        const storeList = page.locator('#store-list');
        await expect(storeList).toContainText('Buy Food Pack');
        await expect(storeList).toContainText('10 pellets');
    });

    test('store shows decorations', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="store"]').click();

        const storeList = page.locator('#store-list');
        await expect(storeList).toContainText('Java Fern');
        await expect(storeList).toContainText('Castle Ruin');
        await expect(storeList).toContainText('Coral Reef');
    });

    test('store shows care items', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="store"]').click();

        const storeList = page.locator('#store-list');
        await expect(storeList).toContainText('Water Conditioner');
        await expect(storeList).toContainText('Algae Scrub');
    });
});

// --- HUD Tests ---
test.describe('HUD', () => {
    test('coin count is visible', async ({ page }) => {
        await startGame(page);
        const coinCount = page.locator('#coin-count');
        await expect(coinCount).toBeVisible();
        // Should show coin symbol + number
        const text = await coinCount.textContent();
        expect(text).toMatch(/\d+/);
    });

    test('pellet count is visible', async ({ page }) => {
        await startGame(page);
        const pelletCount = page.locator('#pellet-count');
        await expect(pelletCount).toBeVisible();
        const text = await pelletCount.textContent();
        expect(text).toMatch(/\d+/);
    });

    test('XP label is visible', async ({ page }) => {
        await startGame(page);
        const xpLabel = page.locator('#xp-label');
        await expect(xpLabel).toBeVisible();
        const text = await xpLabel.textContent();
        expect(text).toMatch(/Lv/);
    });

    test('XP bar exists', async ({ page }) => {
        await startGame(page);
        await expect(page.locator('#xp-bar')).toBeAttached();
    });

    test('coin bar exists', async ({ page }) => {
        await startGame(page);
        await expect(page.locator('#coin-bar')).toBeAttached();
    });

    test('happiness count element exists', async ({ page }) => {
        await startGame(page);
        const happy = page.locator('#happy-count');
        await expect(happy).toBeAttached();
    });
});

// --- Dialog Tests ---
test.describe('Dialogs', () => {
    test('reset button in config shows confirm dialog', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();

        const confirmOverlay = page.locator('#confirm-overlay');
        await expect(confirmOverlay).toHaveClass(/hidden/);

        await page.locator('#btn-reset').click();
        await expect(confirmOverlay).not.toHaveClass(/hidden/);
    });

    test('confirm dialog shows reset message', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();
        await page.locator('#btn-reset').click();

        const message = page.locator('#confirm-message');
        await expect(message).toContainText('Reset everything');
    });

    test('cancel button dismisses confirm dialog', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();
        await page.locator('#btn-reset').click();

        const confirmOverlay = page.locator('#confirm-overlay');
        await expect(confirmOverlay).not.toHaveClass(/hidden/);

        await page.locator('#confirm-cancel').click();
        await expect(confirmOverlay).toHaveClass(/hidden/);
    });

    test('config dialog is closed after reset button is clicked', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('#btn-config').click();
        await page.locator('#btn-reset').click();

        // Config overlay should be hidden (closeConfigDialog is called before showConfirm)
        const configOverlay = page.locator('#config-overlay');
        await expect(configOverlay).toHaveClass(/hidden/);
    });
});

// --- Save/Export Tests ---
test.describe('Save/Export', () => {
    test('export button triggers a download', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();

        // Listen for the download event
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#btn-export-save').click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toBe('fishies-save.json');
    });

    test('export download contains valid JSON with expected fields', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();

        const downloadPromise = page.waitForEvent('download');
        await page.locator('#btn-export-save').click();
        const download = await downloadPromise;

        // Read the downloaded file content
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const content = Buffer.concat(chunks).toString('utf-8');
        const data = JSON.parse(content);

        expect(data).toHaveProperty('version', 1);
        expect(data).toHaveProperty('timestamp');
        expect(data).toHaveProperty('fish');
        expect(data).toHaveProperty('tank');
        expect(data).toHaveProperty('progression');
        expect(data).toHaveProperty('settings');
        expect(Array.isArray(data.fish)).toBe(true);
        expect(data.fish.length).toBe(2); // starter fish: Neon Tetra + Guppy
    });
});

// --- Tank Tab Tests ---
test.describe('Tank tab', () => {
    test('shows water chemistry bars', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();

        // Tank tab is active by default
        await expect(page.locator('.ammonia-bar')).toBeAttached();
        await expect(page.locator('.nitrite-bar')).toBeAttached();
        await expect(page.locator('.nitrate-bar')).toBeAttached();
        await expect(page.locator('.bacteria-bar')).toBeAttached();
        await expect(page.locator('.algae-bar')).toBeAttached();
    });

    test('shows water change button', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();

        const btn = page.locator('#btn-water-change');
        await expect(btn).toBeVisible();
        await expect(btn).toContainText('Change Water');
    });

    test('shows tips section', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();

        const tips = page.locator('.tips-list');
        await expect(tips).toBeVisible();
        await expect(tips).toContainText('Tap the water');
    });
});

// --- My Fish Tab Tests ---
test.describe('My Fish tab', () => {
    test('shows starter fish', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="fish"]').click();

        const fishList = page.locator('#fish-list');
        // Should have at least 2 fish cards (starter fish: Neon Tetra + Guppy)
        const cards = fishList.locator('.fish-card');
        await expect(cards).toHaveCount(2);
    });

    test('fish cards show species name', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="fish"]').click();

        const fishList = page.locator('#fish-list');
        await expect(fishList).toContainText('Neon Tetra');
        await expect(fishList).toContainText('Guppy');
    });

    test('fish cards show stat bars', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();
        await page.locator('.tab[data-tab="fish"]').click();

        const stats = page.locator('.fish-stat-bar');
        // Each fish card has Mood, Hunger, Strength bars = 6 total for 2 fish
        await expect(stats).toHaveCount(6);
    });
});

// --- Shadow Fish Easter Egg Tests ---
test.describe('Shadow Fish', () => {
    test('shadow fish module loads without errors', async ({ page }) => {
        await startGame(page);
        // Verify no console errors from shadowfish module
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.waitForTimeout(1000);
        const shadowErrors = errors.filter(e => e.includes('shadowfish') || e.includes('shadow'));
        expect(shadowErrors.length).toBe(0);
    });

    test('rainbow glow is not active on startup', async ({ page }) => {
        await startGame(page);
        const active = await page.evaluate(() => {
            return import('/js/shadowfish.js').then(m => m.getRainbowGlowActive());
        });
        expect(active).toBe(false);
    });

    test('getRainbowHue returns cycling values per fish', async ({ page }) => {
        await startGame(page);
        const hues = await page.evaluate(() => {
            return import('/js/shadowfish.js').then(m => ({
                hue1: m.getRainbowHue(0, 1),
                hue2: m.getRainbowHue(0, 2),
                hue3: m.getRainbowHue(1, 1),
            }));
        });
        // Different fishId => different hue
        expect(hues.hue1).not.toBe(hues.hue2);
        // Different gameTime => different hue
        expect(hues.hue1).not.toBe(hues.hue3);
    });
});

// --- Canvas Tests ---
test.describe('Canvas', () => {
    test('game canvas exists and is visible', async ({ page }) => {
        await startGame(page);
        await expect(page.locator('#tank')).toBeVisible();
    });

    test('canvas has non-zero dimensions', async ({ page }) => {
        await startGame(page);
        const canvas = page.locator('#tank');
        const width = await canvas.getAttribute('width');
        const height = await canvas.getAttribute('height');
        expect(Number(width)).toBeGreaterThan(0);
        expect(Number(height)).toBeGreaterThan(0);
    });
});

// --- Start Overlay Tests ---
test.describe('Start overlay', () => {
    test('shows for first-time visitors', async ({ page }) => {
        await page.addInitScript(() => localStorage.clear());
        await page.goto('/');

        const overlay = page.locator('#start-overlay');
        await overlay.waitFor({ state: 'visible', timeout: 5000 });
        await expect(overlay).not.toHaveClass(/hidden/);
        await expect(overlay).toContainText('The Secret Life of Fishies');
    });

    test('start button dismisses overlay', async ({ page }) => {
        await page.addInitScript(() => localStorage.clear());
        await page.goto('/');

        const overlay = page.locator('#start-overlay');
        await overlay.waitFor({ state: 'visible', timeout: 5000 });
        await expect(overlay).not.toHaveClass(/hidden/);

        await page.locator('#start-btn').click();
        await expect(overlay).toHaveClass(/hidden/);
    });
});

// --- Share Button ---
test.describe('Share', () => {
    test('share button is visible in drawer', async ({ page }) => {
        await startGame(page);
        await page.locator('#menu-btn').click();

        await expect(page.locator('#btn-share')).toBeVisible();
        await expect(page.locator('#btn-share')).toContainText('Share My Tank');
    });
});
