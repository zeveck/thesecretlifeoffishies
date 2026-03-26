// ui.js — HUD overlay, drawer panel, interaction handling

import { getTank, doWaterChange, DECORATIONS, CARE_ITEMS, hasDecoration, addDecoration, useCareItem } from './tank.js';
import { getProgression, addXP, getXPProgress, getCurrentLevelInfo,
         getAllSpecies, canAddFish, getCurrentStockInches, getTankCapacity,
         getCoins, getPellets, spendCoins, fishCost, buyFoodPack, addCoins,
         getSwishProgress, isFreeFeed } from './store.js';
import { setShowToggleOnMobile, getShowToggleOnMobile } from './orientation.js';
import { SPECIES_CATALOG, Fish } from './fish.js';
import { clamp } from './utils.js';
import { clearSave, exportSaveJSON, importSaveJSON, saveGame } from './save.js';
import { getMasterVolume, setMasterVolume, getSfxVolume, setSfxVolume, getMusicVolume, setMusicVolume } from './audio.js';
import { isLiveSharing, getLiveCode, startLiveShare, stopLiveShare, getBookmarks, removeBookmark } from './live.js';
import { retireFish, extractRetireData, fetchSanctuaryMeta } from './sanctuary.js';

const FISH_TIPS = [
    { tip: "Goldfish can remember things for months -- the 3-second memory myth is totally false.", source: "https://www.livescience.com/goldfish-memory.html" },
    { tip: "Bigger tanks are easier to keep. More water = more stable chemistry.", source: "https://www.aquariumcoop.com/blogs/aquarium/nitrogen-cycle" },
    { tip: "Fish sleep with their eyes open -- they don't have eyelids!", source: "https://oceanservice.noaa.gov/facts/fish-sleep.html" },
    { tip: "Only feed what fish eat in 2 minutes. Uneaten food turns into toxic ammonia.", source: "https://www.aqueon.com/articles/dangers-of-uneaten-fish-food" },
    { tip: "Bettas recognize their owners and swim to the glass when you walk up.", source: "https://thefishingaquarium.com/do-betta-fish-recognize-their-owners/" },
    { tip: "Never replace all filter media at once -- that's where your good bacteria live.", source: "https://www.swelluk.com/help-guides/how-to-change-the-aquarium-filter-without-losing-bacteria/" },
    { tip: "Keep corydoras in groups of 6+ and they'll do a synchronized swimming dance.", source: "https://www.aquariumcoop.com/blogs/aquarium/cory-catfish-care-guide" },
    { tip: "Archerfish recognize human faces with 81% accuracy from a lineup of 44.", source: "https://www.ox.ac.uk/news/2016-06-07-fish-can-recognise-human-faces-new-research-shows" },
    { tip: "Java Fern and Anubias filter your water and are nearly impossible to kill.", source: "https://www.aquariumcoop.com/blogs/aquarium/easy-aquarium-plants" },
    { tip: "Tap water chlorine kills fish in minutes. Always use dechlorinator!", source: "https://www.apifishcare.com/simple-care-guide/freshwater/start-up" },
    { tip: "\"Cycling\" grows bacteria that eat ammonia. It takes 2-8 weeks before adding fish.", source: "https://www.aquariumcoop.com/blogs/aquarium/nitrogen-cycle" },
    { tip: "Some fish sing together in a chorus at dawn and dusk -- underwater choirs!", source: "https://www.onegreenplanet.org/animalsandnature/10-facts-that-prove-fish-are-highly-intelligent-and-emotional-creatures/" },
    { tip: "Elephantnose fish play fetch -- pushing a ball into a current and chasing it.", source: "https://en.wikipedia.org/wiki/Fish_intelligence" },
    { tip: "Neon tetras school in sync to look like one big fish. Mesmerizing in groups of 10+.", source: "https://www.aquariumcoop.com/blogs/aquarium/neon-tetras-and-cardinal-tetras" },
    { tip: "Fish hold grudges -- they remember rivals they've lost fights to.", source: "https://spca.bc.ca/news/fun-facts-about-fish/" },
    { tip: "Your bacteria colony is your best friend -- it eats toxic ammonia and keeps fish safe.", source: "https://www.aquariumcoop.com/blogs/aquarium/nitrogen-cycle" },
    { tip: "Weekly 25% water changes keep fish healthy. Like opening a window for fresh air.", source: "https://modestfish.com/how-to-cycle-your-aquarium/" },
    { tip: "Groupers gesture to moray eels to hunt together -- basically fish sign language.", source: "https://www.onegreenplanet.org/animalsandnature/10-facts-that-prove-fish-are-highly-intelligent-and-emotional-creatures/" },
];
let tipIndex = Math.floor(Math.random() * FISH_TIPS.length);
let tipTimer = 0;
let tipShownFirst = false;

let drawerOpen = false;
let isVisitMode = false;
let isSanctuaryMode = false;
let enterSanctuaryCallback = null;
let onAddFish = null; // callback
let fishesRef = null;  // reference to fish array
let getSaveStateRef = null; // callback to get current save state
let getBreedTimersRef = null; // callback to get breed timer info
let lastWaterChangeTime = 0;
const WATER_CHANGE_COOLDOWN = 30000; // 30 seconds
let waterChangeCooldownInterval = null;
let cooldownToastTimer = null;

export function initUI(fishes, addFishCallback, getSaveState, getBreedTimers, enterSanctuaryCb) {
    fishesRef = fishes;
    onAddFish = addFishCallback;
    getSaveStateRef = getSaveState;
    getBreedTimersRef = getBreedTimers || (() => ({}));
    enterSanctuaryCallback = enterSanctuaryCb || null;

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
            if (tab.dataset.tab === 'shared') refreshSharedTab();
        });
    });

    // Water change button
    document.getElementById('btn-water-change').addEventListener('click', () => {
        const remaining = WATER_CHANGE_COOLDOWN - (Date.now() - lastWaterChangeTime);
        if (remaining > 0) {
            // Show brief toast message
            const secs = Math.ceil(remaining / 1000);
            const cooldownEl = document.getElementById('water-change-cooldown');
            cooldownEl.textContent = `Fetching fresh water (${secs}s)`;
            cooldownEl.classList.add('show');
            clearTimeout(cooldownToastTimer);
            cooldownToastTimer = setTimeout(() => cooldownEl.classList.remove('show'), 2000);
            return;
        }
        doWaterChange();
        addXP(10);
        addCoins(5);
        lastWaterChangeTime = Date.now();
        refreshTankStats();
        startWaterChangeCooldownTimer();
    });

    // Config dialog
    document.getElementById('btn-config').addEventListener('click', openConfigDialog);
    document.getElementById('config-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeConfigDialog();
    });
    document.getElementById('btn-config-close').addEventListener('click', closeConfigDialog);

    // Config toggles
    document.getElementById('toggle-free-feed').addEventListener('change', (e) => {
        getTank().freeFeed = e.target.checked;
        updateHUD();
    });
    document.getElementById('toggle-show-view').addEventListener('change', (e) => {
        setShowToggleOnMobile(e.target.checked);
    });
    document.getElementById('toggle-high-contrast').addEventListener('change', (e) => {
        document.body.classList.toggle('high-contrast', e.target.checked);
    });

    // Reset game — in config dialog
    document.getElementById('btn-reset').addEventListener('click', () => {
        closeConfigDialog();
        showConfirm('Reset everything? All fish, coins, and progress will be lost.', () => {
            clearSave();
            location.reload();
        });
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

    // Share button
    document.getElementById('btn-share').addEventListener('click', () => {
        shareTank(document.getElementById('btn-share'));
    });

    // Sanctuary button
    document.getElementById('btn-sanctuary').addEventListener('click', () => {
        closeDrawer();
        if (enterSanctuaryCallback) enterSanctuaryCallback();
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

export function setVisitMode(val) {
    isVisitMode = val;
}

export function setSanctuaryMode(val) {
    isSanctuaryMode = val;
}

function openConfigDialog() {
    const overlay = document.getElementById('config-overlay');
    document.getElementById('toggle-free-feed').checked = getTank().freeFeed;
    document.getElementById('toggle-show-view').checked = getShowToggleOnMobile();
    document.getElementById('toggle-high-contrast').checked = document.body.classList.contains('high-contrast');

    // Volume sliders
    setupVolumeSlider('slider-master-volume', 'val-master-volume', getMasterVolume, setMasterVolume);
    setupVolumeSlider('slider-sfx-volume', 'val-sfx-volume', getSfxVolume, setSfxVolume);
    setupVolumeSlider('slider-music-volume', 'val-music-volume', getMusicVolume, setMusicVolume);

    overlay.classList.remove('hidden');
}

function setupVolumeSlider(sliderId, valId, getter, setter) {
    const slider = document.getElementById(sliderId);
    const valEl = document.getElementById(valId);
    slider.value = Math.round(getter() * 100);
    valEl.textContent = slider.value + '%';
    slider.oninput = () => {
        setter(slider.value / 100);
        valEl.textContent = slider.value + '%';
    };
}

function closeConfigDialog() {
    document.getElementById('config-overlay').classList.add('hidden');
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

    updateWaterChangeButton();
}

function updateWaterChangeButton() {
    const btn = document.getElementById('btn-water-change');
    const remaining = WATER_CHANGE_COOLDOWN - (Date.now() - lastWaterChangeTime);
    if (remaining > 0) {
        const secs = Math.ceil(remaining / 1000);
        const raw = Math.min((Date.now() - lastWaterChangeTime) / WATER_CHANGE_COOLDOWN, 1);
        const pct = 20 + raw * 80; // start 20% filled, rise to 100%
        btn.textContent = `Change Water (${secs}s)`;
        btn.classList.add('cooldown', 'filling');
        btn.style.setProperty('--fill', pct + '%');
    } else {
        btn.textContent = 'Change Water (+10 XP, +5 coins)';
        btn.classList.remove('cooldown', 'filling');
        btn.style.setProperty('--fill', '0%');
    }
}

function startWaterChangeCooldownTimer() {
    if (waterChangeCooldownInterval) clearInterval(waterChangeCooldownInterval);
    const btn = document.getElementById('btn-water-change');
    btn.classList.add('cooldown', 'filling');
    waterChangeCooldownInterval = setInterval(() => {
        const remaining = WATER_CHANGE_COOLDOWN - (Date.now() - lastWaterChangeTime);
        if (remaining <= 0) {
            clearInterval(waterChangeCooldownInterval);
            waterChangeCooldownInterval = null;
            btn.classList.remove('cooldown', 'filling');
            btn.style.setProperty('--fill', '0%');
            document.getElementById('water-change-cooldown').classList.remove('show');
        }
        if (drawerOpen) updateWaterChangeButton();
    }, 1000);
}

function refreshStore() {
    const list = document.getElementById('store-list');
    const cap = document.getElementById('store-capacity');
    const used = getCurrentStockInches(fishesRef);
    const total = getTankCapacity();
    const coins = getCoins();
    cap.textContent = `Tank: ${used.toFixed(1)} / ${total}" stocked`;

    list.innerHTML = '';

    // --- Section: Food ---
    const foodHeader = document.createElement('div');
    foodHeader.className = 'store-section-header';
    foodHeader.id = 'store-section-food';
    foodHeader.textContent = 'Food';
    list.appendChild(foodHeader);

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
        foodBtn.addEventListener('click', (e) => {
            if (buyFoodPack()) {
                showFoodBuyAnimation(foodBtn);
            }
            refreshStore();
        });
    }
    list.appendChild(foodBtn);

    // --- Section: Fish ---
    const fishHeader = document.createElement('div');
    fishHeader.className = 'store-section-header';
    fishHeader.id = 'store-section-fish';
    fishHeader.textContent = 'Fish';
    list.appendChild(fishHeader);

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

        if (species.liveBearer) {
            const breedIcon = document.createElement('span');
            breedIcon.className = 'breed-icon';
            breedIcon.title = 'Breeds in pairs';
            item.appendChild(breedIcon);
        }

        if (available && canAdd && canAfford) {
            item.addEventListener('click', () => {
                showPurchaseDialog(species, cost, (sp, name) => {
                    if (onAddFish) onAddFish(sp, name);
                    closeDrawer();
                });
            });
        }

        list.appendChild(item);
    }

    // --- Section: Decorations ---
    const decorHeader = document.createElement('div');
    decorHeader.className = 'store-section-header';
    decorHeader.id = 'store-section-decor';
    decorHeader.textContent = 'Decorations';
    list.appendChild(decorHeader);

    for (const deco of DECORATIONS) {
        const owned = hasDecoration(deco.id);
        const canAffordDeco = coins >= deco.cost;
        const el = document.createElement('div');
        el.className = 'store-item' + (owned || !canAffordDeco ? ' locked' : '');
        el.innerHTML = `
            <div class="preview" style="background:${deco.color};display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:#fff">${owned ? '\u2713' : ''}</div>
            <div class="info">
                <div class="name">${deco.name}${owned ? ' (owned)' : ''}</div>
                <div class="detail">${deco.desc} &mdash; ${deco.cost} coins${!owned && !canAffordDeco ? ' (need ' + (deco.cost - coins) + ' more)' : ''}</div>
            </div>
        `;
        if (!owned && canAffordDeco) {
            el.addEventListener('click', () => {
                if (spendCoins(deco.cost)) {
                    addDecoration(deco.id);
                    refreshStore();
                }
            });
        }
        list.appendChild(el);
    }

    // --- Section: Tank Care ---
    const careHeader = document.createElement('div');
    careHeader.className = 'store-section-header';
    careHeader.id = 'store-section-care';
    careHeader.textContent = 'Tank Care';
    list.appendChild(careHeader);

    for (const item of CARE_ITEMS) {
        const canAffordItem = coins >= item.cost;
        const el = document.createElement('div');
        el.className = 'store-item' + (canAffordItem ? '' : ' locked');
        el.innerHTML = `
            <div class="preview" style="background:${item.color};display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#fff">+</div>
            <div class="info">
                <div class="name">${item.name}</div>
                <div class="detail">${item.desc} &mdash; ${item.cost} coins${!canAffordItem ? ' (need ' + (item.cost - coins) + ' more)' : ''}</div>
            </div>
        `;
        if (canAffordItem) {
            el.addEventListener('click', () => {
                if (spendCoins(item.cost)) {
                    useCareItem(item.id);
                    refreshStore();
                    refreshTankStats();
                }
            });
        }
        list.appendChild(el);
    }

    // --- Pill navigation ---
    initStorePills();
}

function initStorePills() {
    document.querySelectorAll('.store-pill').forEach(pill => {
        // Clone to remove old listeners
        const fresh = pill.cloneNode(true);
        pill.parentNode.replaceChild(fresh, pill);
        fresh.addEventListener('click', () => {
            document.querySelectorAll('.store-pill').forEach(p => p.classList.remove('active'));
            fresh.classList.add('active');
            const target = document.getElementById('store-section-' + fresh.dataset.section);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function refreshMyFish() {
    const list = document.getElementById('fish-list');
    list.innerHTML = '';

    for (const fish of fishesRef) {
        const card = document.createElement('div');
        card.className = 'fish-card';

        // Fish portrait canvas
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 48;
        canvas.className = 'fish-portrait';
        card.appendChild(canvas);

        // Draw the fish
        const cctx = canvas.getContext('2d');
        const tempFish = new Fish(fish.species);
        tempFish.x = 50; tempFish.y = 50;
        tempFish.happiness = fish.happiness;
        tempFish.heading = 0; tempFish.tailPhase = 0; tempFish.pitch = 0;
        tempFish.currentSize = fish.currentSize;
        tempFish.id = fish.id;
        tempFish.tailDots = fish.tailDots;
        const rawPx = tempFish.currentSize * 20;
        const bodyW = rawPx * (fish.species.aspect / 2);
        const bodyH = rawPx * 0.5;
        // Tail extends up to 1.8x bodyW behind; dorsal fin up to 2x bodyH above
        const tailExt = fish.species.tailStyle === 'fan' ? 1.8 : fish.species.tailStyle === 'sword' ? 1.5 : 1.3;
        const finExt = fish.species.finStyle === 'tall' ? 2.0 : fish.species.finStyle === 'flowing' ? 1.6 : 1.4;
        const fishFullW = bodyW + bodyW * tailExt;
        const fishFullH = bodyH * finExt + bodyH;
        const scaleX = (canvas.width * 0.8) / fishFullW;
        const scaleY = (canvas.height * 0.8) / fishFullH;
        const scale = Math.min(scaleX, scaleY);
        cctx.save();
        cctx.translate(canvas.width / 2, canvas.height / 2);
        cctx.scale(scale, scale);
        cctx.translate(-canvas.width / 2, -canvas.height / 2);
        tempFish.drawSide(cctx, 0, 0, canvas.width, canvas.height);
        cctx.restore();

        const mood = fish.happiness > 70 ? 'Happy' :
                     fish.happiness > 40 ? 'Content' :
                     fish.happiness > 20 ? 'Stressed' : 'Miserable';
        const moodColor = fish.happiness > 60 ? '#4caf50' :
                          fish.happiness > 30 ? '#f9a825' : '#ef5350';

        const totalInches = fish.distanceSwum || 0;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        const distStr = feet > 0 ? `${feet}ft ${inches}in` : `${inches}in`;

        const fryBadge = fish.isFry ? '<span class="fry-badge">Fry</span>' : '';
        const fryGrowth = fish.isFry ? `<div class="fry-growth">Growth: ${Math.round(Math.min(fish.fryAge / 86400, 1) * 100)}%</div>` : '';

        // Breed pair indicator
        let breedInfo = '';
        if (fish.species.liveBearer && !fish.isFry) {
            const timers = getBreedTimersRef();
            const entry = timers[fish.species.name];
            if (entry && entry.pairIds && entry.pairIds.includes(fish.id)) {
                const partner = fishesRef.find(f => f.id === entry.pairIds.find(id => id !== fish.id));
                const partnerName = partner ? (partner.name || partner.species.name) : '?';
                const progress = Math.min((entry.time || 0) / 3600, 1);
                const pct = Math.round(progress * 100);
                breedInfo = `<div class="breed-info"><span class="breed-heart">\u2665</span> Paired with ${partnerName}<div class="breed-progress-bg"><div class="breed-progress-bar" style="width:${pct}%"></div></div><span class="breed-pct">${pct}%</span></div>`;
            }
        }

        const info = document.createElement('div');
        info.className = 'fish-card-info';
        info.innerHTML = `
            <div class="fish-card-name">${fish.displayName()}${fryBadge}</div>
            <div class="fish-card-species">${fish.species.name}</div>
            <div class="fish-card-stats">
                <div class="fish-stat-bar"><span>Mood</span><div class="bar-bg"><div class="bar" style="width:${fish.happiness}%;background:${moodColor}"></div></div><span class="stat-label">${mood}</span></div>
                <div class="fish-stat-bar"><span>Hunger</span><div class="bar-bg"><div class="bar" style="width:${fish.hunger}%;background:#e6c84a"></div></div><span class="stat-label">${Math.round(fish.hunger)}%</span></div>
                <div class="fish-stat-bar"><span>Strength</span><div class="bar-bg"><div class="bar" style="width:${fish.strength}%;background:#5a9ed6"></div></div><span class="stat-label">${Math.round(fish.strength)}%</span></div>
            </div>
            <div class="fish-card-detail">${fish.currentSize.toFixed(1)}" long &bull; Swum: ${distStr}</div>
            ${fryGrowth}
            ${breedInfo}
        `;

        card.appendChild(info);

        // Retire button (only in normal mode)
        if (!isVisitMode && !isSanctuaryMode) {
            const retireBtn = document.createElement('button');
            retireBtn.className = 'fish-card-retire';
            retireBtn.textContent = 'Retire';
            retireBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger rename
                showConfirm(
                    `Retire ${fish.displayName()} to the sanctuary? They'll live happily forever, but you can't get them back.`,
                    async () => {
                        try {
                            retireBtn.textContent = 'Retiring...';
                            retireBtn.disabled = true;
                            const data = extractRetireData(fish);
                            await retireFish(data);
                            // Remove fish from local array
                            const idx = fishesRef.indexOf(fish);
                            if (idx >= 0) fishesRef.splice(idx, 1);
                            refreshMyFish();
                            // Show toast
                            showRetireToast(fish.displayName());
                        } catch (err) {
                            retireBtn.textContent = 'Retire';
                            retireBtn.disabled = false;
                            alert(err.message || 'Failed to retire fish. Try again later.');
                        }
                    }
                );
            });
            card.appendChild(retireBtn);
        }

        // Tap to rename
        card.addEventListener('click', () => {
            const newName = prompt(
                `Rename your ${fish.species.name} (or leave blank for species name):`,
                fish.name
            );
            if (newName === null) return;
            fish.name = newName.trim();
            refreshMyFish();
        });

        list.appendChild(card);
    }

    if (fishesRef.length === 0) {
        list.innerHTML = '<div class="fish-card-detail" style="padding:16px;text-align:center;color:#607888">No fish yet! Visit the Store tab.</div>';
    }
}

export function updateHUD() {
    const prog = getProgression();

    // Coin, pellet, and happiness counters
    document.getElementById('coin-count').textContent = '\u25CF ' + getCoins();
    document.getElementById('pellet-count').textContent = '\u2022 ' + (isFreeFeed() ? '\u221E' : getPellets());

    // Average happiness
    const avgHappy = fishesRef && fishesRef.length > 0
        ? Math.round(fishesRef.reduce((sum, f) => sum + f.happiness, 0) / fishesRef.length)
        : 0;
    const happyEl = document.getElementById('happy-count');
    if (happyEl) {
        happyEl.textContent = fishesRef && fishesRef.length > 0 ? `♥ ${avgHappy}%` : '';
    }

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

function showConfirm(message, onConfirm) {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-message').textContent = message;
    overlay.classList.remove('hidden');

    drawConfirmFish();

    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');

    function cleanup() {
        overlay.classList.add('hidden');
        ok.removeEventListener('click', handleOk);
        cancel.removeEventListener('click', handleCancel);
    }
    function handleOk() { cleanup(); onConfirm(); }
    function handleCancel() { cleanup(); }

    ok.addEventListener('click', handleOk);
    cancel.addEventListener('click', handleCancel);
}

async function shareTank(buttonEl) {
    const prog = getProgression();
    const fishCount = fishesRef.length;
    const speciesList = [...new Set(fishesRef.map(f => f.species.name))];

    // Build share text
    const avgHappiness = fishCount > 0
        ? Math.round(fishesRef.reduce((sum, f) => sum + f.happiness, 0) / fishCount)
        : 0;
    let text = `🐟 My Aquarium — The Secret Life of Fishies\n\n`;
    text += `🏆 Level ${prog.level} • ${fishCount} fish\n`;
    if (speciesList.length > 0) {
        text += `🐠 ${speciesList.join(', ')}\n`;
    }
    text += `😊 Happiness: ${avgHappiness}%\n`;

    // Use live share link if active, otherwise just the base URL
    const liveCode = getLiveCode();
    const url = liveCode
        ? `https://thesecretlifeoffishies.com#tank=${liveCode}`
        : 'https://thesecretlifeoffishies.com';
    text += `\n${url}`;

    const shareData = { title: 'The Secret Life of Fishies', text };

    if (navigator.canShare && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }

    try {
        await navigator.clipboard.writeText(text);
        showShareFeedback(buttonEl, 'Copied!');
    } catch (err) {
        // Fallback: select text
        const el = document.createElement('textarea');
        el.value = text;
        el.readOnly = true;
        el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;width:80%;max-width:400px;padding:12px;font-size:14px;background:#0f1d30;color:#b0c8e0;border:1px solid #4a9eff;border-radius:8px;';
        document.body.appendChild(el);
        el.select();
        el.addEventListener('blur', () => el.remove());
    }
}

function showRetireToast(name) {
    const toast = document.createElement('div');
    toast.className = 'fry-toast'; // reuse fry toast styling
    toast.textContent = `${name} has been retired to the sanctuary!`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fry-toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 2500);
}

function showShareFeedback(buttonEl, message) {
    const original = buttonEl.textContent;
    buttonEl.textContent = `✓ ${message}`;
    setTimeout(() => { buttonEl.textContent = original; }, 2000);
}

function showPurchaseDialog(species, cost, onConfirm) {
    const overlay = document.getElementById('purchase-overlay');
    overlay.classList.remove('hidden');

    // Draw the fish on the purchase canvas
    const canvas = document.getElementById('purchase-fish');
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const fish = new Fish(species);
    fish.x = 50; fish.y = 50;
    fish.happiness = 80;
    fish.heading = 0; fish.tailPhase = 0; fish.pitch = 0;
    const rawPx = fish.currentSize * 20;
    const targetPx = Math.min(w * 0.35, h * 0.7);
    const scale = targetPx / rawPx;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
    fish.drawSide(ctx, 0, 0, w, h);
    ctx.restore();

    document.getElementById('purchase-species').textContent = `${species.name} — ${cost} coins`;
    const nameInput = document.getElementById('purchase-name');
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);

    const ok = document.getElementById('purchase-ok');
    const cancel = document.getElementById('purchase-cancel');

    function cleanup() {
        overlay.classList.add('hidden');
        ok.removeEventListener('click', handleOk);
        cancel.removeEventListener('click', handleCancel);
    }
    function handleOk() {
        const name = nameInput.value.trim();
        if (!spendCoins(cost)) return;
        cleanup();
        onConfirm(species, name);
    }
    function handleCancel() { cleanup(); }

    ok.addEventListener('click', handleOk);
    cancel.addEventListener('click', handleCancel);
}

export function updateFloatingTip(dt) {
    tipTimer += dt;
    // Rotate tip every 45 seconds
    if (tipTimer > 45 || !tipShownFirst) {
        tipTimer = 0;
        if (tipShownFirst) tipIndex = (tipIndex + 1) % FISH_TIPS.length;
        tipShownFirst = true;
        const t = FISH_TIPS[tipIndex];
        const textEl = document.getElementById('tank-tip-text');
        const sourceEl = document.getElementById('tank-tip-source');
        if (textEl) textEl.textContent = t.tip;
        if (sourceEl) {
            sourceEl.href = t.source || '';
            sourceEl.style.display = t.source ? '' : 'none';
        }
    }
}

let pelletPulseTimer = null;

function showFoodBuyAnimation(btnEl) {
    const btnRect = btnEl.getBoundingClientRect();
    const pelletEl = document.getElementById('pellet-count');
    const pelletRect = pelletEl.getBoundingClientRect();

    // Create the floating "+10" label
    const floater = document.createElement('div');
    floater.textContent = '+10';
    floater.className = 'food-buy-floater';
    document.body.appendChild(floater);

    // Start position: center of the buy button
    const startX = btnRect.left + btnRect.width / 2;
    const startY = btnRect.top + btnRect.height / 2;
    // End position: pellet counter
    const endX = pelletRect.left + pelletRect.width / 2;
    const endY = pelletRect.top + pelletRect.height / 2;

    // Phase 1: Rise up (0→0.45), Phase 2: Zip to counter (0.45→1)
    floater.animate([
        { left: startX + 'px', top: startY + 'px', opacity: 0, fontSize: '0.8rem', offset: 0 },
        { left: startX + 'px', top: (startY - 60) + 'px', opacity: 1, fontSize: '1.3rem', offset: 0.45 },
        { left: endX + 'px', top: endY + 'px', opacity: 0.6, fontSize: '0.7rem', offset: 1 },
    ], {
        duration: 800,
        easing: 'ease-in-out',
        fill: 'forwards',
    }).onfinish = () => {
        floater.remove();
        // Pulse the pellet counter (reset timer on rapid clicks)
        clearTimeout(pelletPulseTimer);
        pelletEl.classList.add('pellet-pulse');
        pelletPulseTimer = setTimeout(() => pelletEl.classList.remove('pellet-pulse'), 500);
    };
}

function refreshSharedTab() {
    // Fetch sanctuary fish count
    fetchSanctuaryMeta().then(meta => {
        const el = document.getElementById('sanctuary-count');
        if (el) {
            el.textContent = meta.totalFish > 0
                ? `${meta.totalFish} fish living in the sanctuary`
                : 'The sanctuary is empty. Be the first to retire a fish!';
        }
    }).catch(() => {
        const el = document.getElementById('sanctuary-count');
        if (el) el.textContent = 'Could not load sanctuary info.';
    });

    const toggleBtn = document.getElementById('btn-live-toggle');
    const statusEl = document.getElementById('live-share-status');
    const infoEl = document.getElementById('live-share-info');
    const codeEl = document.getElementById('live-share-code');

    if (isLiveSharing()) {
        const code = getLiveCode();
        toggleBtn.textContent = 'Stop Live Share';
        toggleBtn.classList.add('active-share');
        statusEl.textContent = 'Your tank is being shared live!';
        codeEl.textContent = code;
        infoEl.classList.remove('hidden');

        // Wire stop
        toggleBtn.onclick = () => {
            stopLiveShare();
            refreshSharedTab();
        };

        // Wire copy link
        document.getElementById('btn-copy-live-link').onclick = async () => {
            const link = `https://thesecretlifeoffishies.com#tank=${code}`;
            try {
                await navigator.clipboard.writeText(link);
                const btn = document.getElementById('btn-copy-live-link');
                const orig = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = orig; }, 2000);
            } catch {
                // Fallback — do nothing
            }
        };
    } else {
        toggleBtn.textContent = 'Start Live Share';
        toggleBtn.classList.remove('active-share');
        statusEl.textContent = 'Share your tank so friends can watch your fish!';
        infoEl.classList.add('hidden');

        // Wire start
        toggleBtn.onclick = async () => {
            toggleBtn.textContent = 'Starting...';
            toggleBtn.disabled = true;
            try {
                await startLiveShare(getSaveStateRef);
                refreshSharedTab();
            } catch {
                statusEl.textContent = 'Failed to start. Try again later.';
                toggleBtn.textContent = 'Start Live Share';
            } finally {
                toggleBtn.disabled = false;
            }
        };
    }

    refreshBookmarkList();
}

function refreshBookmarkList() {
    const list = document.getElementById('bookmark-list');
    if (!list) return;
    const bookmarks = getBookmarks();
    list.innerHTML = '';

    if (bookmarks.length === 0) {
        list.innerHTML = '<div style="font-size:0.78rem;color:#607888;padding:8px 0">No visited tanks yet.</div>';
        return;
    }

    for (const bm of bookmarks) {
        const card = document.createElement('div');
        card.className = 'bookmark-card';

        const info = document.createElement('div');
        info.className = 'bookmark-info';
        const codeEl = document.createElement('div');
        codeEl.className = 'bookmark-code';
        codeEl.textContent = bm.code;
        const labelEl = document.createElement('div');
        labelEl.className = 'bookmark-label';
        labelEl.textContent = bm.label || '';
        info.appendChild(codeEl);
        info.appendChild(labelEl);

        const actions = document.createElement('div');
        actions.className = 'bookmark-actions';
        const visitBtn = document.createElement('button');
        visitBtn.className = 'bookmark-visit';
        visitBtn.textContent = 'Visit';
        visitBtn.addEventListener('click', () => {
            window.location.hash = `tank=${bm.code}`;
            window.location.reload();
        });
        const removeBtn = document.createElement('button');
        removeBtn.className = 'bookmark-remove';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            removeBookmark(bm.code);
            refreshBookmarkList();
        });
        actions.appendChild(visitBtn);
        actions.appendChild(removeBtn);

        card.appendChild(info);
        card.appendChild(actions);
        list.appendChild(card);
    }
}

function drawConfirmFish() {
    const canvas = document.getElementById('confirm-fish');
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Pick a fish from the tank, or create a default Neon Tetra
    let species = SPECIES_CATALOG.find(s => s.name === 'Neon Tetra');
    if (fishesRef && fishesRef.length > 0) {
        species = fishesRef[Math.floor(Math.random() * fishesRef.length)].species;
    }

    // Create a temporary fish and draw it scaled to fill the canvas
    const fish = new Fish(species);
    fish.x = 50;
    fish.y = 50;
    fish.happiness = 20; // sad desaturation
    fish.heading = 0; // facing right
    fish.tailPhase = 0;
    fish.pitch = 0;

    // Scale up so the fish fills the canvas nicely
    const rawPx = fish.currentSize * 20;
    const targetPx = Math.min(w * 0.35, h * 0.7);
    const scale = targetPx / rawPx;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
    fish.drawSide(ctx, 0, 0, w, h);
    ctx.restore();

    // Add a frown over the mouth area
    const bodyW = targetPx * (species.aspect / 2);
    const bodyH = targetPx * 0.5;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(bodyW * 0.85, bodyH * 0.15, bodyH * 0.18, Math.PI + 0.5, Math.PI * 2 - 0.5);
    ctx.stroke();
    ctx.restore();
}
