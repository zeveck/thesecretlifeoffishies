// audio.js — Web Audio synthesized sounds and volume controls

let audioCtx = null;

// Volume state
let masterVolume = 0.7;
let sfxVolume = 0.8;
let musicVolume = 0.5;

export function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        // Web Audio not supported
    }
}

export function playBoopSound() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const vol = masterVolume * sfxVolume;
    if (vol <= 0) return;

    const now = audioCtx.currentTime;

    // Oscillator: quick pitch sweep 800Hz -> 1200Hz over ~80ms
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(1200, now + 0.08);

    // Gain envelope: attack 10ms, decay 80ms
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.3, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + 0.09);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
}

// Getters / setters
export function getMasterVolume() { return masterVolume; }
export function setMasterVolume(v) { masterVolume = Math.max(0, Math.min(1, v)); }
export function getSfxVolume() { return sfxVolume; }
export function setSfxVolume(v) { sfxVolume = Math.max(0, Math.min(1, v)); }
export function getMusicVolume() { return musicVolume; }
export function setMusicVolume(v) { musicVolume = Math.max(0, Math.min(1, v)); }

export function loadAudioSettings(settings) {
    if (!settings) return;
    if (settings.masterVolume !== undefined) setMasterVolume(settings.masterVolume);
    if (settings.sfxVolume !== undefined) setSfxVolume(settings.sfxVolume);
    if (settings.musicVolume !== undefined) setMusicVolume(settings.musicVolume);
}

export function saveAudioSettings() {
    return { masterVolume, sfxVolume, musicVolume };
}
