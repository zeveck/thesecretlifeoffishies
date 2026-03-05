// ui.js — HUD overlay, drawer panel, interaction handling

import { getTank, doWaterChange, DECORATIONS, CARE_ITEMS, hasDecoration, addDecoration, useCareItem, getDecorationHappinessBonus } from './tank.js';
import { getProgression, addXP, getXPProgress, getCurrentLevelInfo,
         getAllSpecies, canAddFish, getCurrentStockInches, getTankCapacity,
         getCoins, getPellets, spendCoins, fishCost, buyFoodPack, addCoins,
         getSwishProgress, isFreeFeed } from './store.js';
import { setShowToggleOnMobile, getShowToggleOnMobile } from './orientation.js';
import { SPECIES_CATALOG, Fish } from './fish.js';
import { clamp } from './utils.js';
import { clearSave, exportSaveJSON, importSaveJSON, saveGame } from './save.js';

const FISH_TIPS = [
    { tip: "The \"goldfish have a 3-second memory\" thing is a total myth. Studies show goldfish can remember things for months!", source: "https://www.livescience.com/goldfish-memory.html" },
    { tip: "Bigger tanks are actually easier to care for. More water means more stable chemistry, so a 20-gallon is way more forgiving than a 5-gallon.", source: "https://www.aquariumcoop.com/blogs/aquarium/nitrogen-cycle" },
    { tip: "Fish don't have eyelids, so they sleep with their eyes open. Putting your tank light on a timer helps them keep a healthy sleep schedule.", source: "https://oceanservice.noaa.gov/facts/fish-sleep.html" },
    { tip: "Overfeeding is the #1 beginner mistake. Fish only need what they can eat in about 2 minutes -- uneaten food turns into toxic ammonia.", source: "https://www.aqueon.com/articles/dangers-of-uneaten-fish-food" },
    { tip: "Betta fish can actually recognize their owners! They learn your face and will swim to the front when you walk up.", source: "https://www.lovetoknowpets.com/aquariums/do-betta-fish-recognize-interact-their-owners" },
    { tip: "Never replace all your filter media at once -- that's where your beneficial bacteria live. Swap half at a time to keep the cycle going.", source: "https://www.swelluk.com/help-guides/how-to-change-the-aquarium-filter-without-losing-bacteria/" },
    { tip: "Corydoras catfish are the sweetest schooling fish. Keep them in groups of 6+ and you'll see them do a synchronized swimming dance.", source: "https://www.aquariumcoop.com/blogs/aquarium/cory-catfish-care-guide" },
    { tip: "Archerfish can recognize individual human faces from a lineup of 44 others with 81% accuracy. Not bad for a fish!", source: "https://www.ox.ac.uk/news/2016-06-07-fish-can-recognise-human-faces-new-research-shows" },
    { tip: "Live plants aren't just decoration -- they filter your water by absorbing ammonia and nitrates. Java Fern and Anubias are nearly impossible to kill.", source: "https://www.aquariumcoop.com/blogs/aquarium/easy-aquarium-plants" },
    { tip: "Tap water contains chlorine that can kill fish in minutes. Always treat new water with dechlorinator before adding it -- no exceptions!", source: "https://www.apifishcare.com/simple-care-guide/freshwater/start-up" },
    { tip: "\"Cycling\" your tank means growing colonies of good bacteria that eat toxic ammonia. It takes 2-8 weeks and is the most important thing before adding fish.", source: "https://www.aquariumcoop.com/blogs/aquarium/nitrogen-cycle" },
    { tip: "Some fish species actually sing together in a chorus at dawn and dusk. Researchers have recorded entire underwater fish choirs!", source: "https://www.onegreenplanet.org/animalsandnature/10-facts-that-prove-fish-are-highly-intelligent-and-emotional-creatures/" },
    { tip: "An elephantnose fish was observed pushing a ball into a filter current, chasing it down, and repeating the game -- basically playing fetch with itself.", source: "https://en.wikipedia.org/wiki/Fish_intelligence" },
    { tip: "Neon tetras school together to look like one big fish. A group of 10+ shimmering in sync is one of the most mesmerizing sights in the hobby.", source: "https://www.fishiology.com/underwater-dance-unraveling-the-enigmatic-schooling-behavior-of-neon-tetras/" },
    { tip: "Fish can remember other fish they've lost fights to and will actively avoid those individuals. They hold grudges!", source: "https://spca.bc.ca/news/fun-facts-about-fish/" },
    { tip: "Weekly 25-30% water changes are the easiest way to keep fish healthy. Think of it like opening a window for fresh air -- your fish will thank you with brighter colors.", source: "https://modestfish.com/how-to-cycle-your-aquarium/" },
    { tip: "Groupers and moray eels team up to hunt together on coral reefs. The grouper actually gestures to the eel to join -- it's basically fish sign language.", source: "https://www.onegreenplanet.org/animalsandnature/10-facts-that-prove-fish-are-highly-intelligent-and-emotional-creatures/" },
];
let tipIndex = Math.floor(Math.random() * FISH_TIPS.length);
let tipTimer = 0;
let tipShownFirst = false;

let drawerOpen = false;
let onAddFish = null; // callback
let fishesRef = null;  // reference to fish array
let getSaveStateRef = null; // callback to get current save state
let lastWaterChangeTime = 0;
const WATER_CHANGE_COOLDOWN = 60000; // 60 seconds
let waterChangeCooldownInterval = null;

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
        const remaining = WATER_CHANGE_COOLDOWN - (Date.now() - lastWaterChangeTime);
        if (remaining > 0) {
            const secs = Math.ceil(remaining / 1000);
            document.getElementById('water-change-cooldown').textContent =
                `Wait ${secs}s — water needs time to settle before changing again.`;
            return;
        }
        doWaterChange();
        addXP(10);
        addCoins(5);
        lastWaterChangeTime = Date.now();
        refreshTankStats();
        startWaterChangeCooldownTimer();
    });

    // Free feed toggle
    document.getElementById('toggle-free-feed').addEventListener('change', (e) => {
        getTank().freeFeed = e.target.checked;
        updateHUD();
    });

    // Show view toggle on mobile
    document.getElementById('toggle-show-view').addEventListener('change', (e) => {
        setShowToggleOnMobile(e.target.checked);
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

    // Reset game — in-game confirm
    document.getElementById('btn-reset').addEventListener('click', () => {
        showConfirm('Reset everything? All fish, coins, and progress will be lost.', () => {
            clearSave();
            location.reload();
        });
    });

    // Share button
    document.getElementById('btn-share').addEventListener('click', () => {
        shareTank(document.getElementById('btn-share'));
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
    document.getElementById('toggle-show-view').checked = getShowToggleOnMobile();
    updateWaterChangeButton();
}

function updateWaterChangeButton() {
    const btn = document.getElementById('btn-water-change');
    const cooldownEl = document.getElementById('water-change-cooldown');
    const remaining = WATER_CHANGE_COOLDOWN - (Date.now() - lastWaterChangeTime);
    if (remaining > 0) {
        const secs = Math.ceil(remaining / 1000);
        btn.textContent = `Change Water (${secs}s)`;
        btn.classList.add('cooldown');
        cooldownEl.textContent = 'Water needs time to settle before changing again.';
    } else {
        btn.textContent = 'Change Water (+10 XP, +5 coins)';
        btn.classList.remove('cooldown');
        cooldownEl.textContent = '';
    }
}

function startWaterChangeCooldownTimer() {
    if (waterChangeCooldownInterval) clearInterval(waterChangeCooldownInterval);
    waterChangeCooldownInterval = setInterval(() => {
        const remaining = WATER_CHANGE_COOLDOWN - (Date.now() - lastWaterChangeTime);
        if (remaining <= 0) {
            clearInterval(waterChangeCooldownInterval);
            waterChangeCooldownInterval = null;
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
        foodBtn.addEventListener('click', () => {
            buyFoodPack();
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
        canvas.width = 120;
        canvas.height = 60;
        canvas.className = 'fish-portrait';
        card.appendChild(canvas);

        // Draw the fish
        const cctx = canvas.getContext('2d');
        const tempFish = new Fish(fish.species);
        tempFish.x = 50; tempFish.y = 50;
        tempFish.happiness = fish.happiness;
        tempFish.heading = 0; tempFish.tailPhase = 0; tempFish.pitch = 0;
        tempFish.currentSize = fish.currentSize;
        const rawPx = tempFish.currentSize * 20;
        const targetPx = Math.min(canvas.width * 0.35, canvas.height * 0.7);
        const scale = targetPx / rawPx;
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

        const info = document.createElement('div');
        info.className = 'fish-card-info';
        info.innerHTML = `
            <div class="fish-card-name">${fish.displayName()}</div>
            <div class="fish-card-species">${fish.species.name}</div>
            <div class="fish-card-stats">
                <div class="fish-stat-bar"><span>Mood</span><div class="bar-bg"><div class="bar" style="width:${fish.happiness}%;background:${moodColor}"></div></div><span class="stat-label">${mood}</span></div>
                <div class="fish-stat-bar"><span>Hunger</span><div class="bar-bg"><div class="bar" style="width:${fish.hunger}%;background:#e6c84a"></div></div><span class="stat-label">${Math.round(fish.hunger)}%</span></div>
                <div class="fish-stat-bar"><span>Strength</span><div class="bar-bg"><div class="bar" style="width:${fish.strength}%;background:#5a9ed6"></div></div><span class="stat-label">${Math.round(fish.strength)}%</span></div>
            </div>
            <div class="fish-card-detail">${fish.currentSize.toFixed(1)}" long &bull; Swum: ${distStr}</div>
        `;

        card.appendChild(info);

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

    // Encode state for shareable link
    const encoded = encodeTankState(prog.level, fishesRef);
    const url = encoded
        ? `https://thesecretlifeoffishies.com?s=${encoded}`
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

function showShareFeedback(buttonEl, message) {
    const original = buttonEl.textContent;
    buttonEl.textContent = `✓ ${message}`;
    setTimeout(() => { buttonEl.textContent = original; }, 2000);
}

// Phase 3: State encoding for shareable links
// Encodes level + up to 14 fish species (by catalog index) into base36
function encodeTankState(level, fishes) {
    try {
        const catalogSize = SPECIES_CATALOG.length;
        // Pack: level (3 bits) + fish count (4 bits) + species indices (4 bits each)
        let value = BigInt(level & 0x7);
        const fishList = fishes.slice(0, 14);
        value = (value << 4n) | BigInt(fishList.length & 0xF);
        for (const fish of fishList) {
            const idx = SPECIES_CATALOG.indexOf(fish.species);
            value = (value << 4n) | BigInt(idx >= 0 ? idx : 0);
        }
        // Checksum (sum of all nibbles mod 16)
        let checksum = 0;
        checksum += level;
        checksum += fishList.length;
        for (const fish of fishList) {
            const idx = SPECIES_CATALOG.indexOf(fish.species);
            checksum += idx >= 0 ? idx : 0;
        }
        value = (value << 4n) | BigInt(checksum & 0xF);
        return value.toString(36);
    } catch (e) {
        return null;
    }
}

export function decodeTankState(encoded) {
    try {
        let value = BigInt(parseInt(encoded, 36));
        // Read checksum (last 4 bits)
        const checksum = Number(value & 0xFn);
        value >>= 4n;

        // We need to read from MSB, but we packed LSB-last
        // Re-parse: convert back to figure out bit length
        // Easier: re-encode from the string
        // Actually, let's unpack from the right (reverse order)
        const nibbles = [];
        let temp = value;
        while (temp > 0n) {
            nibbles.push(Number(temp & 0xFn));
            temp >>= 4n;
        }
        nibbles.reverse();

        if (nibbles.length < 2) return null;
        const level = nibbles[0];
        const fishCount = nibbles[1];
        if (fishCount > 14 || level < 1 || level > 7) return null;
        if (nibbles.length < 2 + fishCount) return null;

        const speciesIndices = [];
        let sum = level + fishCount;
        for (let i = 0; i < fishCount; i++) {
            const idx = nibbles[2 + i];
            if (idx >= SPECIES_CATALOG.length) return null;
            speciesIndices.push(idx);
            sum += idx;
        }

        if ((sum & 0xF) !== checksum) return null;

        return {
            level,
            fish: speciesIndices.map(i => SPECIES_CATALOG[i])
        };
    } catch (e) {
        return null;
    }
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
    const tipEl = document.getElementById('floating-tip');
    if (!tipEl) return;
    // Show a new tip every 45 seconds, with 3s fade transition
    if (tipTimer > 45) {
        tipTimer = 0;
        tipIndex = (tipIndex + 1) % FISH_TIPS.length;
        tipEl.classList.add('hidden');
        setTimeout(() => {
            const t = FISH_TIPS[tipIndex];
            document.getElementById('tip-text').textContent = t.tip;
            const sourceEl = document.getElementById('tip-source');
            if (t.source) {
                sourceEl.href = t.source;
                sourceEl.style.display = '';
            } else {
                sourceEl.style.display = 'none';
            }
            tipEl.classList.remove('hidden');
        }, 1000);
    }
    // On first load, show immediately
    if (!tipShownFirst) {
        tipShownFirst = true;
        const t = FISH_TIPS[tipIndex];
        document.getElementById('tip-text').textContent = t.tip;
        const sourceEl = document.getElementById('tip-source');
        if (t.source) {
            sourceEl.href = t.source;
            sourceEl.style.display = '';
        } else {
            sourceEl.style.display = 'none';
        }
        tipEl.classList.remove('hidden');
    }
    // Hide when drawer is open
    if (drawerOpen) tipEl.classList.add('hidden');
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
