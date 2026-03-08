import { describe, it, expect, beforeEach } from 'vitest';
import {
    getMasterVolume, setMasterVolume,
    getSfxVolume, setSfxVolume,
    getMusicVolume, setMusicVolume,
    loadAudioSettings, saveAudioSettings,
} from '../../js/audio.js';

beforeEach(() => {
    // Reset to defaults
    setMasterVolume(0.7);
    setSfxVolume(0.8);
    setMusicVolume(0.5);
});

describe('volume getters/setters', () => {
    it('masterVolume defaults to 0.7', () => {
        expect(getMasterVolume()).toBeCloseTo(0.7);
    });

    it('sfxVolume defaults to 0.8', () => {
        expect(getSfxVolume()).toBeCloseTo(0.8);
    });

    it('musicVolume defaults to 0.5', () => {
        expect(getMusicVolume()).toBeCloseTo(0.5);
    });

    it('setMasterVolume updates the value', () => {
        setMasterVolume(0.3);
        expect(getMasterVolume()).toBeCloseTo(0.3);
    });

    it('setSfxVolume updates the value', () => {
        setSfxVolume(0.1);
        expect(getSfxVolume()).toBeCloseTo(0.1);
    });

    it('setMusicVolume updates the value', () => {
        setMusicVolume(1.0);
        expect(getMusicVolume()).toBeCloseTo(1.0);
    });

    it('clamps masterVolume below 0', () => {
        setMasterVolume(-0.5);
        expect(getMasterVolume()).toBe(0);
    });

    it('clamps masterVolume above 1', () => {
        setMasterVolume(1.5);
        expect(getMasterVolume()).toBe(1);
    });

    it('clamps sfxVolume below 0', () => {
        setSfxVolume(-1);
        expect(getSfxVolume()).toBe(0);
    });

    it('clamps sfxVolume above 1', () => {
        setSfxVolume(2);
        expect(getSfxVolume()).toBe(1);
    });

    it('clamps musicVolume below 0', () => {
        setMusicVolume(-0.1);
        expect(getMusicVolume()).toBe(0);
    });

    it('clamps musicVolume above 1', () => {
        setMusicVolume(99);
        expect(getMusicVolume()).toBe(1);
    });

    it('allows setting volume to exactly 0', () => {
        setMasterVolume(0);
        expect(getMasterVolume()).toBe(0);
    });

    it('allows setting volume to exactly 1', () => {
        setMasterVolume(1);
        expect(getMasterVolume()).toBe(1);
    });
});

describe('saveAudioSettings', () => {
    it('returns current volume values', () => {
        setMasterVolume(0.5);
        setSfxVolume(0.6);
        setMusicVolume(0.7);
        const saved = saveAudioSettings();
        expect(saved).toEqual({
            masterVolume: 0.5,
            sfxVolume: 0.6,
            musicVolume: 0.7,
        });
    });

    it('returns default values when unchanged', () => {
        const saved = saveAudioSettings();
        expect(saved.masterVolume).toBeCloseTo(0.7);
        expect(saved.sfxVolume).toBeCloseTo(0.8);
        expect(saved.musicVolume).toBeCloseTo(0.5);
    });
});

describe('loadAudioSettings', () => {
    it('loads all three volume values', () => {
        loadAudioSettings({ masterVolume: 0.1, sfxVolume: 0.2, musicVolume: 0.3 });
        expect(getMasterVolume()).toBeCloseTo(0.1);
        expect(getSfxVolume()).toBeCloseTo(0.2);
        expect(getMusicVolume()).toBeCloseTo(0.3);
    });

    it('handles null settings gracefully', () => {
        loadAudioSettings(null);
        expect(getMasterVolume()).toBeCloseTo(0.7);
    });

    it('handles undefined settings gracefully', () => {
        loadAudioSettings(undefined);
        expect(getMasterVolume()).toBeCloseTo(0.7);
    });

    it('only updates provided fields', () => {
        loadAudioSettings({ masterVolume: 0.3 });
        expect(getMasterVolume()).toBeCloseTo(0.3);
        expect(getSfxVolume()).toBeCloseTo(0.8); // unchanged
        expect(getMusicVolume()).toBeCloseTo(0.5); // unchanged
    });

    it('clamps out-of-range values', () => {
        loadAudioSettings({ masterVolume: 5, sfxVolume: -2, musicVolume: 1.5 });
        expect(getMasterVolume()).toBe(1);
        expect(getSfxVolume()).toBe(0);
        expect(getMusicVolume()).toBe(1);
    });

    it('handles empty object', () => {
        loadAudioSettings({});
        expect(getMasterVolume()).toBeCloseTo(0.7);
        expect(getSfxVolume()).toBeCloseTo(0.8);
        expect(getMusicVolume()).toBeCloseTo(0.5);
    });
});

describe('save/load round-trip', () => {
    it('preserves values through save and load', () => {
        setMasterVolume(0.42);
        setSfxVolume(0.15);
        setMusicVolume(0.99);
        const saved = saveAudioSettings();

        // Reset to different values
        setMasterVolume(0);
        setSfxVolume(0);
        setMusicVolume(0);

        // Load saved state
        loadAudioSettings(saved);
        expect(getMasterVolume()).toBeCloseTo(0.42);
        expect(getSfxVolume()).toBeCloseTo(0.15);
        expect(getMusicVolume()).toBeCloseTo(0.99);
    });
});
