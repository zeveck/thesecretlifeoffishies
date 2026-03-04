// ui.js — HUD overlay, drawer panel, interaction handling

import { getTank, doWaterChange } from './tank.js';
import { getProgression, addXP, getXPProgress, getCurrentLevelInfo,
         getAllSpecies, canAddFish, getCurrentStockInches, getTankCapacity,
         getCoins, getPellets, spendCoins, fishCost, buyFoodPack, addCoins,
         getSwishProgress } from './store.js';
import { SPECIES_CATALOG, Fish } from './fish.js';
import { clamp } from './utils.js';
import { clearSave, exportSaveJSON, importSaveJSON, saveGame } from './save.js';

let drawerOpen = false;
let onAddFish = null; // callback
let fishesRef = null;  // reference to fish array
let getSaveStateRef = null; // callback to get current save state

export function initUI(fishes, addFishCallback, getSaveState) {
    fishesRef = fishes;
    onAddFish = addFishCallback;
    getSaveStateRef = getSaveState;

    // Menu button
    document.getElementById('menu-btn').addEventListener('click', toggleDrawer);
    document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);

    // Tabs
    document.querySelectorAll('#drawer-tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#drawer-tabs .tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
            if (tab.dataset.tab === 'store') refreshStore();
            if (tab.dataset.tab === 'fish') refreshMyFish();
        });
    });

    // Water change button
    document.getElementById('btn-water-change').addEventListener('click', () => {
        doWaterChange();
        addXP(10);
        addCoins(5);
        refreshTankStats();
    });

    // Free feed toggle
    document.getElementById('toggle-free-feed').addEventListener('change', (e) => {
        getTank().freeFeed = e.target.checked;
    });

    // Export save
    document.getElementById('btn-export-save').addEventListener('click', () => {
        const json = exportSaveJSON(getSaveStateRef());
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fishies-save.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    // Import save
    const fileInput = document.getElementById('import-file');
    document.getElementById('btn-import-save').addEventListener('click', () => {
        fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const data = importSaveJSON(reader.result);
            if (data) {
                saveGame(data);
                location.reload();
            } else {
                alert('Invalid save file.');
            }
        };
        reader.readAsText(file);
        fileInput.value = '';
    });

    // Reset game
    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm('Reset everything? All fish, coins, and progress will be lost.')) {
            clearSave();
            location.reload();
        }
    });
}

function toggleDrawer() {
    drawerOpen = !drawerOpen;
    document.getElementById('drawer').classList.toggle('hidden', !drawerOpen);
    document.getElementById('drawer-overlay').classList.toggle('hidden', !drawerOpen);
    if (drawerOpen) {
        refreshTankStats();
        refreshStore();
        refreshMyFish();
    }
}

function closeDrawer() {
    drawerOpen = false;
    document.getElementById('drawer').classList.add('hidden');
    document.getElementById('drawer-overlay').classList.add('hidden');
}

export function isDrawerOpen() {
    return drawerOpen;
}

function refreshTankStats() {
    const tank = getTank();
    setBar('.ammonia-bar', tank.ammonia);
    setBar('.nitrite-bar', tank.nitrite);
    setBar('.nitrate-bar', tank.nitrate);
    setBar('.bacteria-bar', tank.bacteria);
    setBar('.algae-bar', tank.algae);

    setText('.ammonia-val', Math.round(tank.ammonia));
    setText('.nitrite-val', Math.round(tank.nitrite));
    setText('.nitrate-val', Math.round(tank.nitrate));
    setText('.bacteria-val', Math.round(tank.bacteria));
    setText('.algae-val', Math.round(tank.algae));

    document.getElementById('toggle-free-feed').checked = tank.freeFeed;
}

function refreshStore() {
    const list = document.getElementById('store-list');
    const cap = document.getElementById('store-capacity');
    const used = getCurrentStockInches(fishesRef);
    const total = getTankCapacity();
    const coins = getCoins();
    cap.textContent = `Tank: ${used.toFixed(1)} / ${total}" stocked`;

    list.innerHTML = '';

    // Food pack button
    const foodBtn = document.createElement('div');
    const canAffordFood = coins >= 5;
    foodBtn.className = 'store-item' + (canAffordFood ? '' : ' locked');
    foodBtn.innerHTML = `
        <div class="preview" style="background:#a0c8a0;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#1a3a1a">&#8226;</div>
        <div class="info">
            <div class="name">Buy Food Pack</div>
            <div class="detail">10 pellets &mdash; 5 coins${!canAffordFood ? ' (need ' + (5 - coins) + ' more)' : ''}</div>
        </div>
    `;
    if (canAffordFood) {
        foodBtn.addEventListener('click', () => {
            buyFoodPack();
            refreshStore();
        });
    }
    list.appendChild(foodBtn);

    for (const species of SPECIES_CATALOG) {
        const prog = getProgression();
        const available = species.level <= prog.level;
        const canAdd = canAddFish(fishesRef, species);
        const cost = fishCost(species);
        const canAfford = coins >= cost;

        const item = document.createElement('div');
        const dimmed = !available || !canAdd || !canAfford;
        item.className = 'store-item' + (dimmed ? ' locked' : '');

        const preview = document.createElement('div');
        preview.className = 'preview';
        preview.style.background = species.body;

        let statusText = '';
        if (!available) statusText = ' (locked)';
        else if (!canAdd) statusText = ' (tank full)';
        else if (!canAfford) statusText = ` (need ${cost - coins} coins)`;

        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML = `
            <div class="name">${species.name}</div>
            <div class="detail">${species.sizeInches}" • Level ${species.level} • ${cost} coins${statusText}</div>
        `;

        item.appendChild(preview);
        item.appendChild(info);

        if (available && canAdd && canAfford) {
            item.addEventListener('click', () => {
                const name = prompt(`Name your ${species.name} (or leave blank):`);
                if (name === null) return; // cancelled
                if (!spendCoins(cost)) return; // double-check
                if (onAddFish) onAddFish(species, name.trim());
                refreshStore();
                refreshMyFish();
            });
        }

        list.appendChild(item);
    }
}

function refreshMyFish() {
    const list = document.getElementById('fish-list');
    list.innerHTML = '';

    for (const fish of fishesRef) {
        const item = document.createElement('div');
        item.className = 'fish-item';

        const dot = document.createElement('div');
        dot.className = 'happiness-dot';
        dot.style.background = fish.happiness > 60 ? '#4caf50' :
                               fish.happiness > 30 ? '#f9a825' : '#ef5350';

        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML = `
            <div class="name">${fish.displayName()}</div>
            <div class="detail">Size: ${fish.currentSize.toFixed(1)}" • Hunger: ${Math.round(fish.hunger)}% • Happy: ${Math.round(fish.happiness)}%</div>
        `;

        item.appendChild(dot);
        item.appendChild(info);

        // Tap to rename
        item.addEventListener('click', () => {
            const newName = prompt(
                `Rename your ${fish.species.name} (or leave blank for species name):`,
                fish.name
            );
            if (newName === null) return; // cancelled
            fish.name = newName.trim();
            refreshMyFish();
        });

        list.appendChild(item);
    }

    if (fishesRef.length === 0) {
        list.innerHTML = '<div class="detail" style="padding:10px;text-align:center">No fish yet! Visit the Store tab.</div>';
    }
}

export function updateHUD() {
    const prog = getProgression();

    // Coin and pellet counters
    document.getElementById('coin-count').textContent = '\u25CF ' + getCoins();
    document.getElementById('pellet-count').textContent = '\u2022 ' + getPellets();

    // Coin (swish) bar
    const swishProgress = getSwishProgress();
    document.getElementById('coin-bar').style.width = (swishProgress * 100) + '%';

    // XP bar
    const xpProgress = getXPProgress();
    document.getElementById('xp-bar').style.width = (xpProgress * 100) + '%';

    const { current, next } = getCurrentLevelInfo();
    const label = next ? `Lv ${prog.level} • ${prog.xp}/${next.xp} XP` : `Lv ${prog.level} MAX`;
    document.getElementById('xp-label').textContent = label;

    // Refresh drawer stats if open
    if (drawerOpen) {
        refreshTankStats();
    }
}

function setBar(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.style.width = clamp(value, 0, 100) + '%';
}

function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
}
