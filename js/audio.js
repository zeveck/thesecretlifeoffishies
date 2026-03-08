// audio.js — Web Audio synthesized sounds, music playback, and volume controls

let audioCtx = null;

// Volume state
let masterVolume = 0.7;
let sfxVolume = 0.8;
let musicVolume = 0.5;
let musicMuted = false;

// Music playback state
const MUSIC_TRACKS = [
    'music/00 - Aquarium Afternoon.mp3',
    'music/01 - Aquarium Afternoon2.mp3',
    'music/02 - Glass Tides.mp3',
];
let musicAudio = null;   // current HTMLAudioElement
let currentTrack = 0;
let musicStarted = false;

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

export function playShadowNotes() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const vol = masterVolume * sfxVolume;
    if (vol <= 0) return;

    const now = audioCtx.currentTime;

    // First ominous note ~110Hz (A2) — audible on all speakers
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(110, now);
    const gain1 = audioCtx.createGain();
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol * 0.35, now + 0.25);
    gain1.gain.linearRampToValueAtTime(0, now + 1.4);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 1.5);

    // Second note ~117Hz (Bb2), 0.5s later — half-step up for tension
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(117, now + 0.5);
    const gain2 = audioCtx.createGain();
    gain2.gain.setValueAtTime(0, now + 0.5);
    gain2.gain.linearRampToValueAtTime(vol * 0.35, now + 0.75);
    gain2.gain.linearRampToValueAtTime(0, now + 1.9);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.5);
    osc2.stop(now + 2.0);
}

export function playRevealStinger() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const vol = masterVolume * sfxVolume;
    if (vol <= 0) return;

    const now = audioCtx.currentTime;
    const freqs = [440, 554, 659, 880]; // A4, C#5, E5, A5
    const types = ['sine', 'triangle', 'sine', 'triangle'];

    for (let i = 0; i < freqs.length; i++) {
        const osc = audioCtx.createOscillator();
        osc.type = types[i];
        osc.frequency.setValueAtTime(freqs[i] * 0.8, now);
        osc.frequency.linearRampToValueAtTime(freqs[i], now + 0.15);
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol * 0.2, now + 0.05);
        gain.gain.setValueAtTime(vol * 0.2, now + 0.4);
        gain.gain.linearRampToValueAtTime(0, now + 0.7);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.75);
    }
}

// --- Music playback ---

function applyMusicVolume() {
    if (!musicAudio) return;
    const effectiveVolume = musicMuted ? 0 : masterVolume * musicVolume;
    musicAudio.volume = effectiveVolume;
    if (musicAudio.paused && effectiveVolume > 0) {
        musicAudio.play().catch(() => {
            document.addEventListener('click', resumeOnInteraction);
            document.addEventListener('touchstart', resumeOnInteraction);
            document.addEventListener('keydown', resumeOnInteraction);
        });
    }
}

function resumeOnInteraction() {
    if (musicAudio && musicAudio.paused && !musicMuted && masterVolume * musicVolume > 0) {
        musicAudio.play().catch(() => {});
    }
    document.removeEventListener('click', resumeOnInteraction);
    document.removeEventListener('touchstart', resumeOnInteraction);
    document.removeEventListener('keydown', resumeOnInteraction);
}

function playTrack(index) {
    try {
        if (musicAudio) {
            musicAudio.pause();
            musicAudio.removeEventListener('ended', onTrackEnded);
        }
        currentTrack = index % MUSIC_TRACKS.length;
        musicAudio = new Audio(MUSIC_TRACKS[currentTrack]);
        musicAudio.addEventListener('ended', onTrackEnded);
        musicAudio.volume = musicMuted ? 0 : masterVolume * musicVolume;
        musicAudio.play().catch(() => {
            document.addEventListener('click', resumeOnInteraction);
            document.addEventListener('touchstart', resumeOnInteraction);
            document.addEventListener('keydown', resumeOnInteraction);
        });
    } catch (e) {
        // Audio not supported in this environment
    }
}

function onTrackEnded() {
    playTrack(currentTrack + 1);
}

export function startMusic() {
    if (musicStarted) return;
    musicStarted = true;
    playTrack(0);
}

export function isMusicMuted() { return musicMuted; }

export function toggleMusicMute() {
    musicMuted = !musicMuted;
    applyMusicVolume();
    return musicMuted;
}

// Getters / setters
export function getMasterVolume() { return masterVolume; }
export function setMasterVolume(v) {
    masterVolume = Math.max(0, Math.min(1, v));
    applyMusicVolume();
}
export function getSfxVolume() { return sfxVolume; }
export function setSfxVolume(v) { sfxVolume = Math.max(0, Math.min(1, v)); }
export function getMusicVolume() { return musicVolume; }
export function setMusicVolume(v) {
    musicVolume = Math.max(0, Math.min(1, v));
    applyMusicVolume();
}

export function loadAudioSettings(settings) {
    if (!settings) return;
    if (settings.masterVolume !== undefined) setMasterVolume(settings.masterVolume);
    if (settings.sfxVolume !== undefined) setSfxVolume(settings.sfxVolume);
    if (settings.musicVolume !== undefined) setMusicVolume(settings.musicVolume);
    if (settings.musicMuted !== undefined) {
        musicMuted = settings.musicMuted;
        applyMusicVolume();
    }
}

export function saveAudioSettings() {
    return { masterVolume, sfxVolume, musicVolume, musicMuted };
}
