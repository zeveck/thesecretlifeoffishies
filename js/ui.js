// ui.js — HUD overlay, drawer panel, interaction handling

import { getTank, doWaterChange } from './tank.js';
import { getProgression, addXP, getXPProgress, getCurrentLevelInfo,
         getAllSpecies, canAddFish, getCurrentStockInches, getTankCapacity } from './store.js';
import { SPECIES_CATALOG, Fish } from './fish.js';
import { clamp } from './utils.js';

let drawerOpen = false;
let onAddFish = null; // callback
let fishesRef = null;  // reference to fish array

export function initUI(fishes, addFishCallback) {
    fishesRef = fishes;
    onAddFish = addFishCallback;

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
        refreshTankStats();
    });

    // Free feed toggle
    document.getElementById('toggle-free-feed').addEventListener('change', (e) => {
        getTank().freeFeed = e.target.checked;
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
    cap.textContent = `Tank: ${used.toFixed(1)} / ${total}" stocked`;

    list.innerHTML = '';
    for (const species of SPECIES_CATALOG) {
        const prog = getProgression();
        const available = species.level <= prog.level;
        const canAdd = canAddFish(fishesRef, species);

        const item = document.createElement('div');
        item.className = 'store-item' + (available ? '' : ' locked');

        const preview = document.createElement('div');
        preview.className = 'preview';
        preview.style.background = species.body;

        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML = `
            <div class="name">${species.name}</div>
            <div class="detail">${species.sizeInches}" • Level ${species.level}${!available ? ' (locked)' : !canAdd ? ' (tank full)' : ''}</div>
        `;

        item.appendChild(preview);
        item.appendChild(info);

        if (available && canAdd) {
            item.addEventListener('click', () => {
                if (onAddFish) onAddFish(species);
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
            <div class="name">${fish.species.name}</div>
            <div class="detail">Size: ${fish.currentSize.toFixed(1)}" • Hunger: ${Math.round(fish.hunger)}% • Happy: ${Math.round(fish.happiness)}%</div>
        `;

        item.appendChild(dot);
        item.appendChild(info);
        list.appendChild(item);
    }

    if (fishesRef.length === 0) {
        list.innerHTML = '<div class="detail" style="padding:10px;text-align:center">No fish yet! Visit the Store tab.</div>';
    }
}

export function updateHUD() {
    const tank = getTank();
    const prog = getProgression();

    // Water quality indicator
    const maxToxic = Math.max(tank.ammonia, tank.nitrite);
    const indicator = document.getElementById('water-indicator');
    if (maxToxic > 40) {
        indicator.style.background = '#ef5350';
    } else if (maxToxic > 20 || tank.nitrate > 40) {
        indicator.style.background = '#f9a825';
    } else {
        indicator.style.background = '#4caf50';
    }

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
