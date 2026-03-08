import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    getMasterVolume, setMasterVolume,
    getSfxVolume, setSfxVolume,
    getMusicVolume, setMusicVolume,
    loadAudioSettings, saveAudioSettings,
    isMusicMuted, toggleMusicMute,
} from '../../js/audio.js';

function assertCloseTo(actual, expected, precision = 5) {
    const eps = Math.pow(10, -precision) / 2;
    assert.ok(Math.abs(actual - expected) < eps,
        `Expected ${actual} to be close to ${expected}`);
}

beforeEach(() => {
    // Reset to defaults
    setMasterVolume(0.7);
    setSfxVolume(0.8);
    setMusicVolume(0.5);
    // Reset mute state
    if (isMusicMuted()) toggleMusicMute();
});

describe('volume getters/setters', () => {
    it('masterVolume defaults to 0.7', () => {
        assertCloseTo(getMasterVolume(), 0.7);
    });

    it('sfxVolume defaults to 0.8', () => {
        assertCloseTo(getSfxVolume(), 0.8);
    });

    it('musicVolume defaults to 0.5', () => {
        assertCloseTo(getMusicVolume(), 0.5);
    });

    it('setMasterVolume updates the value', () => {
        setMasterVolume(0.3);
        assertCloseTo(getMasterVolume(), 0.3);
    });

    it('setSfxVolume updates the value', () => {
        setSfxVolume(0.1);
        assertCloseTo(getSfxVolume(), 0.1);
    });

    it('setMusicVolume updates the value', () => {
        setMusicVolume(1.0);
        assertCloseTo(getMusicVolume(), 1.0);
    });

    it('clamps masterVolume below 0', () => {
        setMasterVolume(-0.5);
        assert.strictEqual(getMasterVolume(), 0);
    });

    it('clamps masterVolume above 1', () => {
        setMasterVolume(1.5);
        assert.strictEqual(getMasterVolume(), 1);
    });

    it('clamps sfxVolume below 0', () => {
        setSfxVolume(-1);
        assert.strictEqual(getSfxVolume(), 0);
    });

    it('clamps sfxVolume above 1', () => {
        setSfxVolume(2);
        assert.strictEqual(getSfxVolume(), 1);
    });

    it('clamps musicVolume below 0', () => {
        setMusicVolume(-0.1);
        assert.strictEqual(getMusicVolume(), 0);
    });

    it('clamps musicVolume above 1', () => {
        setMusicVolume(99);
        assert.strictEqual(getMusicVolume(), 1);
    });

    it('allows setting volume to exactly 0', () => {
        setMasterVolume(0);
        assert.strictEqual(getMasterVolume(), 0);
    });

    it('allows setting volume to exactly 1', () => {
        setMasterVolume(1);
        assert.strictEqual(getMasterVolume(), 1);
    });
});

describe('saveAudioSettings', () => {
    it('returns current volume values', () => {
        setMasterVolume(0.5);
        setSfxVolume(0.6);
        setMusicVolume(0.7);
        const saved = saveAudioSettings();
        assert.deepStrictEqual(saved, {
            masterVolume: 0.5,
            sfxVolume: 0.6,
            musicVolume: 0.7,
            musicMuted: false,
        });
    });

    it('returns default values when unchanged', () => {
        const saved = saveAudioSettings();
        assertCloseTo(saved.masterVolume, 0.7);
        assertCloseTo(saved.sfxVolume, 0.8);
        assertCloseTo(saved.musicVolume, 0.5);
        assert.strictEqual(saved.musicMuted, false);
    });

    it('saves muted state', () => {
        toggleMusicMute();
        const saved = saveAudioSettings();
        assert.strictEqual(saved.musicMuted, true);
    });
});

describe('loadAudioSettings', () => {
    it('loads all three volume values', () => {
        loadAudioSettings({ masterVolume: 0.1, sfxVolume: 0.2, musicVolume: 0.3 });
        assertCloseTo(getMasterVolume(), 0.1);
        assertCloseTo(getSfxVolume(), 0.2);
        assertCloseTo(getMusicVolume(), 0.3);
    });

    it('handles null settings gracefully', () => {
        loadAudioSettings(null);
        assertCloseTo(getMasterVolume(), 0.7);
    });

    it('handles undefined settings gracefully', () => {
        loadAudioSettings(undefined);
        assertCloseTo(getMasterVolume(), 0.7);
    });

    it('only updates provided fields', () => {
        loadAudioSettings({ masterVolume: 0.3 });
        assertCloseTo(getMasterVolume(), 0.3);
        assertCloseTo(getSfxVolume(), 0.8); // unchanged
        assertCloseTo(getMusicVolume(), 0.5); // unchanged
    });

    it('clamps out-of-range values', () => {
        loadAudioSettings({ masterVolume: 5, sfxVolume: -2, musicVolume: 1.5 });
        assert.strictEqual(getMasterVolume(), 1);
        assert.strictEqual(getSfxVolume(), 0);
        assert.strictEqual(getMusicVolume(), 1);
    });

    it('handles empty object', () => {
        loadAudioSettings({});
        assertCloseTo(getMasterVolume(), 0.7);
        assertCloseTo(getSfxVolume(), 0.8);
        assertCloseTo(getMusicVolume(), 0.5);
    });
});

describe('music mute toggle', () => {
    it('starts unmuted', () => {
        assert.strictEqual(isMusicMuted(), false);
    });

    it('toggleMusicMute toggles state', () => {
        const result = toggleMusicMute();
        assert.strictEqual(result, true);
        assert.strictEqual(isMusicMuted(), true);
    });

    it('toggleMusicMute toggles back', () => {
        toggleMusicMute(); // mute
        const result = toggleMusicMute(); // unmute
        assert.strictEqual(result, false);
        assert.strictEqual(isMusicMuted(), false);
    });

    it('loadAudioSettings restores muted state', () => {
        loadAudioSettings({ musicMuted: true });
        assert.strictEqual(isMusicMuted(), true);
    });

    it('loadAudioSettings without musicMuted keeps current state', () => {
        toggleMusicMute(); // mute
        loadAudioSettings({ masterVolume: 0.5 });
        assert.strictEqual(isMusicMuted(), true);
    });
});

describe('save/load round-trip', () => {
    it('preserves values through save and load', () => {
        setMasterVolume(0.42);
        setSfxVolume(0.15);
        setMusicVolume(0.99);
        toggleMusicMute();
        const saved = saveAudioSettings();

        // Reset to different values
        setMasterVolume(0);
        setSfxVolume(0);
        setMusicVolume(0);
        toggleMusicMute(); // unmute

        // Load saved state
        loadAudioSettings(saved);
        assertCloseTo(getMasterVolume(), 0.42);
        assertCloseTo(getSfxVolume(), 0.15);
        assertCloseTo(getMusicVolume(), 0.99);
        assert.strictEqual(isMusicMuted(), true);
    });
});
