/**
 * Immersive Worlds — Audio
 *
 * Constitution §17 asks V1 for ambience per Space, narration cues, transport,
 * mute/volume and captions — and explicitly warns against building a DAW.
 * This is that minimum, and no more.
 *
 * Every sound is synthesised: filtered noise shaped into room tone, with a
 * different filter and level per Space. There is no audio file in the module,
 * which keeps the milestone free of asset-rights questions (IW-DEC-006/016).
 *
 * Narration is delivered as captions first. Speech is offered through the
 * browser's own synthesis when it exists, and its absence changes nothing about
 * the experience — the transcript is the accessible source of truth, not a
 * fallback for it.
 */

const ROOM_TONES = {
  'ambience.lobby': { cutoff: 620, q: 0.7, gain: 0.05, drift: 0.05 },
  'ambience.gallery': { cutoff: 420, q: 0.9, gain: 0.042, drift: 0.035 },
  'ambience.dark-room': { cutoff: 260, q: 1.2, gain: 0.052, drift: 0.02 },
  'ambience.archive': { cutoff: 340, q: 0.8, gain: 0.046, drift: 0.06 }
};

export class AudioDirector {
  constructor({ enabled = true } = {}) {
    this.supported = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
    this.enabled = enabled && this.supported;
    this.muted = false;
    this.volume = 0.7;
    this.currentCue = null;
    this.speaking = false;

    this._ctx = null;
    this._master = null;
    this._bed = null;
    this._filter = null;
    this._lfo = null;
  }

  /** Must be called from a user gesture on most browsers. */
  async resume() {
    if (!this.enabled) return false;
    if (!this._ctx) this._build();
    if (this._ctx.state === 'suspended') await this._ctx.resume();
    return this._ctx.state === 'running';
  }

  get running() {
    return this._ctx?.state === 'running';
  }

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this._ctx = new Ctx();

    // Two seconds of pink-ish noise, looped. Cheap, and it does not repeat
    // audibly once it is filtered down to room tone.
    const length = this._ctx.sampleRate * 2;
    const buffer = this._ctx.createBuffer(1, length, this._ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099;
      b1 = 0.963 * b1 + white * 0.2965;
      b2 = 0.57 * b2 + white * 1.0526;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }

    this._bed = this._ctx.createBufferSource();
    this._bed.buffer = buffer;
    this._bed.loop = true;

    this._filter = this._ctx.createBiquadFilter();
    this._filter.type = 'lowpass';
    this._filter.frequency.value = 420;
    this._filter.Q.value = 0.8;

    this._master = this._ctx.createGain();
    this._master.gain.value = 0;

    // A very slow drift keeps the bed from sounding like a static hiss.
    this._lfo = this._ctx.createOscillator();
    this._lfo.frequency.value = 0.045;
    const lfoGain = this._ctx.createGain();
    lfoGain.gain.value = 60;
    this._lfo.connect(lfoGain).connect(this._filter.frequency);

    this._bed.connect(this._filter).connect(this._master).connect(this._ctx.destination);
    this._bed.start();
    this._lfo.start();
  }

  /** @param {string} cue an ambience id from the Space record */
  setAmbience(cue) {
    this.currentCue = cue;
    if (!this._ctx) return;
    const tone = ROOM_TONES[cue] || ROOM_TONES['ambience.gallery'];
    const now = this._ctx.currentTime;
    this._filter.frequency.cancelScheduledValues(now);
    this._filter.frequency.setTargetAtTime(tone.cutoff, now, 1.2);
    this._filter.Q.setTargetAtTime(tone.q, now, 1.2);
    this._applyGain(tone.gain);
  }

  _applyGain(base = null) {
    if (!this._ctx) return;
    const tone = ROOM_TONES[this.currentCue] || ROOM_TONES['ambience.gallery'];
    const target = this.muted ? 0 : (base ?? tone.gain) * this.volume;
    this._master.gain.setTargetAtTime(target, this._ctx.currentTime, 0.6);
  }

  setMuted(muted) {
    this.muted = muted;
    this._applyGain();
    if (muted) this.stopNarration();
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    this._applyGain();
  }

  /**
   * Narration. The caption is always published by the caller; this only adds
   * voice where the platform provides it and the visitor has not muted.
   */
  speak(text) {
    if (this.muted || !text) return false;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.96;
      utterance.volume = this.volume * 0.9;
      utterance.onstart = () => { this.speaking = true; };
      utterance.onend = () => { this.speaking = false; };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  stopNarration() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.speaking = false;
  }

  dispose() {
    this.stopNarration();
    try {
      this._bed?.stop();
      this._lfo?.stop();
      this._ctx?.close();
    } catch {
      /* the context may already be closed */
    }
    this._ctx = null;
  }
}
