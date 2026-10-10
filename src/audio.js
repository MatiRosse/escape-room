// Web Audio API Synthesizer for procedural Escape Room sound effects

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ambientGain = null;
    this.masterGain = null;
    this.destNode = null;
    this.isMuted = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;
      this.masterGain.connect((this.destNode || this.ctx.destination));
      this.destNode = this.masterGain;
      this.initialized = true;
      // Ambient hum disabled per user request (annoying motor noise)
    } catch (e) {
      console.warn('[Audio] Web Audio API no soportado o bloqueado:', e);
    }
  }

  toggleMute() {
    this.ensureContext();
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1.0, now);
    }
    return this.isMuted;
  }

  ensureContext() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.ctx && !this.destNode && this.masterGain) {
      this.destNode = this.masterGain;
    }
  }

  setMapTheme(theme = 'vault') {
    this.mapTheme = theme;
  }

  startAmbientHum(theme = 'vault') {
    // Ambient motor noise completely removed
    if (this.ambientOscs) {
      this.ambientOscs.forEach(o => {
        try { o.stop(); } catch (e) {}
      });
    }
    this.ambientOscs = [];
  }

  playFootstep() {
    this.ensureContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.06;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350 + Math.random() * 100, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect((this.destNode || this.ctx.destination));

    noise.start(now);
  }

  playSFX(type) {
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const now = Math.max(this.ctx.currentTime || 0, 0.001);

      switch (type) {
      case 'drawer_open': {
        // Metallic drawer sliding open
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(320, now + 0.35);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }

      case 'drawer_close': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.25);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }

      case 'item_pickup': {
        // High-tech ding
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }

      case 'switch_click': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      }

      case 'keypad_beep': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(941, now); // DTMF-like tone
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.09);
        break;
      }

      case 'access_denied': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }

      case 'safe_unlock': {
        // Heavy multi-tumbler mechanical lock clank and bolt slide
        [0, 0.08, 0.16, 0.28].forEach((timeOffset, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = idx % 2 === 0 ? 'triangle' : 'square';
          osc.frequency.setValueAtTime(260 - idx * 40, now + timeOffset);
          osc.frequency.exponentialRampToValueAtTime(70, now + timeOffset + 0.08);

          gain.gain.setValueAtTime(0.35, now + timeOffset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.09);

          osc.connect(gain);
          gain.connect((this.destNode || this.ctx.destination));
          osc.start(now + timeOffset);
          osc.stop(now + timeOffset + 0.1);
        });

        // Final heavy metallic bolt release thud
        const thudOsc = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thudOsc.type = 'sawtooth';
        thudOsc.frequency.setValueAtTime(140, now + 0.35);
        thudOsc.frequency.exponentialRampToValueAtTime(45, now + 0.55);

        thudGain.gain.setValueAtTime(0.4, now + 0.35);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        thudOsc.connect(thudGain);
        thudGain.connect((this.destNode || this.ctx.destination));
        thudOsc.start(now + 0.35);
        thudOsc.stop(now + 0.62);
        break;
      }

      case 'card_swipe_success': {
        // Double electronic affirmative chime
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now); // E5
        osc2.frequency.setValueAtTime(1046.50, now + 0.12); // C6

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));

        osc1.start(now);
        osc1.stop(now + 0.12);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.45);
        break;
      }

      case 'power_surge_on': {
        // Massive generator power up sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 1.2);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 1.6);
        break;
      }

      case 'wheel_ratchet': {
        // Heavy metallic gear turn
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(70, now + 0.15);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }

      case 'vault_unlocked': {
        // Heavy locking pins clacking disengaged
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.setValueAtTime(120, now + 0.1);
        osc.frequency.setValueAtTime(60, now + 0.25);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.6);
        break;
      }

      case 'vault_door_open_heavy': {
        // Sub-bass rumble and pneumatic hiss
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(45, now);
        osc.frequency.linearRampToValueAtTime(30, now + 2.5);

        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 3.0);
        break;
      }

      case 'clue_revealed': {
        // Ethereal chord
        [440, 554.37, 659.25, 880].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.05);

          gain.gain.setValueAtTime(0.12, now + idx * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

          osc.connect(gain);
          gain.connect((this.destNode || this.ctx.destination));
          osc.start(now + idx * 0.05);
          osc.stop(now + 1.2);
        });
        break;
      }

      case 'robot_wave': {
        // Cute robotic chirp / arpeggio ("Beep-boop-whirr! 👋")
        [587.33, 880.00, 1174.66, 1318.51].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.07);

          gain.gain.setValueAtTime(0.18, now + idx * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.16);

          osc.connect(gain);
          gain.connect((this.destNode || this.ctx.destination));
          osc.start(now + idx * 0.07);
          osc.stop(now + idx * 0.07 + 0.18);
        });
        break;
      }

      case 'couple_synergy': {
        // Warm celebratory romantic chime with harmonic sparkles (Amorcito synergy!)
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);

          gain.gain.setValueAtTime(0.15, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 1.0);

          osc.connect(gain);
          gain.connect((this.destNode || this.ctx.destination));
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 1.1);
        });
        break;
      }

      case 'quantum_tune': {
        // Sci-fi frequency dial change tone
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);

        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }

      case 'quantum_unlock': {
        // Resonant quantum power unlock
        [329.63, 440.00, 554.37, 659.25, 880.00].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.09);

          gain.gain.setValueAtTime(0.18, now + idx * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 1.5);

          osc.connect(gain);
          gain.connect((this.destNode || this.ctx.destination));
          osc.start(now + idx * 0.09);
          osc.stop(now + idx * 0.09 + 1.6);
        });
        break;
      }

      case 'laser_shutdown': {
        // High to sub-bass power drain sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 1.2);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.linearRampToValueAtTime(200, now + 1.2);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 1.4);
        break;
      }

      case 'laser_zap': {
        // Energy barrier deflection buzz
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(280, now + 0.15);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.22);
        break;
      }

      case 'elevator_open': {
        // Pneumatic airlock hiss and triumphant bell
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now + 0.3);
        osc.frequency.setValueAtTime(659.25, now + 0.5);
        osc.frequency.setValueAtTime(1046.50, now + 0.7);

        gain.gain.setValueAtTime(0.22, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now + 0.3);
        osc.stop(now + 2.3);
        break;
      }

      // -------------------------------------------------------------
      // Safe Door Sounds
      // -------------------------------------------------------------
      case 'safe_door_open': {
        // Heavy metal door swing with hinges squeak
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.4);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.52);
        break;
      }

      case 'safe_door_close': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 0.38);
        break;
      }

      // -------------------------------------------------------------
      // HORROR CIRCUS & EVIL CLOWN SOUNDS
      // -------------------------------------------------------------
      case 'clown_laugh': {
        // Procedural sinister clown cackle: "HE-HE-HE-HA-HA-HA!"
        // Staccato laughing bursts with descending/modulating formants
        const laughPitches = [340, 420, 360, 440, 310, 260, 220, 180];
        laughPitches.forEach((pitch, i) => {
          const t = now + i * 0.16;
          const osc = this.ctx.createOscillator();
          const oscHarm = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();

          osc.type = 'sawtooth';
          oscHarm.type = 'sine';
          osc.frequency.setValueAtTime(pitch, t);
          osc.frequency.linearRampToValueAtTime(pitch - 40, t + 0.12);
          oscHarm.frequency.setValueAtTime(pitch * 2, t);

          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(800 + (i % 2) * 400, t);
          filter.Q.value = 3.5;

          gain.gain.setValueAtTime(0.26, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

          osc.connect(filter);
          oscHarm.connect(filter);
          filter.connect(gain);
          gain.connect((this.destNode || this.ctx.destination));

          osc.start(t);
          oscHarm.start(t);
          osc.stop(t + 0.15);
          oscHarm.stop(t + 0.15);
        });
        break;
      }

      case 'creepy_music_box': {
        // Discordant music box chime in diminished/minor key
        const notes = [830.61, 783.99, 659.25, 622.25, 493.88, 523.25, 466.16];
        notes.forEach((freq, i) => {
          const t = now + i * 0.28;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);

          gain.gain.setValueAtTime(0.18, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

          osc.connect(gain);
          gain.connect((this.destNode || this.ctx.destination));
          osc.start(t);
          osc.stop(t + 1.3);
        });
        break;
      }

      case 'balloon_pop': {
        // Sudden loud pop with high frequency snap and air compression
        try {
          const t = Math.max(now, this.ctx.currentTime || 0) + 0.002;
          const sRate = this.ctx.sampleRate || 44100;
          const bufferSize = Math.max(1, Math.floor(sRate * 0.12));
          const buffer = this.ctx.createBuffer(1, bufferSize, sRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.08));
          }
          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;

          const snapGain = this.ctx.createGain();
          snapGain.gain.setValueAtTime(0.6, t);
          snapGain.gain.linearRampToValueAtTime(0.0001, t + 0.12);

          const subOsc = this.ctx.createOscillator();
          const subGain = this.ctx.createGain();
          subOsc.type = 'triangle';
          subOsc.frequency.setValueAtTime(140, t);
          subOsc.frequency.linearRampToValueAtTime(40, t + 0.09);
          subGain.gain.setValueAtTime(0.5, t);
          subGain.gain.linearRampToValueAtTime(0.0001, t + 0.1);

          noise.connect(snapGain);
          snapGain.connect((this.destNode || this.ctx.destination));
          subOsc.connect(subGain);
          subGain.connect((this.destNode || this.ctx.destination));

          noise.start(t);
          noise.stop(t + 0.13);
          subOsc.start(t);
          subOsc.stop(t + 0.13);
        } catch (e) {
          console.warn('[Audio] Error al sintetizar balloon_pop:', e);
        }
        break;
      }

      case 'jack_spring': {
        // High tension spring popping out: "SPROINGGG!"
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(540, now + 0.15);
        osc.frequency.linearRampToValueAtTime(320, now + 0.4);

        // Modulate with fast spring wobble
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(22, now);
        lfoGain.gain.setValueAtTime(60, now);
        lfo.connect(osc.frequency);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        lfo.start(now);
        osc.start(now);
        lfo.stop(now + 0.85);
        osc.stop(now + 0.85);
        break;
      }

      case 'cage_creak': {
        // Heavy rusted iron gate groan and rattling chains
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(85, now);
        osc.frequency.linearRampToValueAtTime(160, now + 0.5);
        osc.frequency.linearRampToValueAtTime(75, now + 1.2);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

        osc.connect(gain);
        gain.connect((this.destNode || this.ctx.destination));
        osc.start(now);
        osc.stop(now + 1.45);
        break;
      }

      case 'flashlight_toggle': {
        // High-tactile mechanical button click with dual impulse
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        osc.connect(gain);
        gain.connect(this.destNode || this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);

        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'square';
        subOsc.frequency.setValueAtTime(260, now + 0.015);
        subGain.gain.setValueAtTime(0.16, now + 0.015);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        subOsc.connect(subGain);
        subGain.connect(this.destNode || this.ctx.destination);
        subOsc.start(now + 0.015);
        subOsc.stop(now + 0.055);
        break;
      }

      case 'dial_tick': {
        // Crisp brass tumbler gear click
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.025);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        osc.connect(gain);
        gain.connect(this.destNode || this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.035);
        break;
      }

      case 'chime_love':
      case 'couple_synergy': {
        // Harmonic uplifting chord with chime shimmer for partner interactions
        const chordFreqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        chordFreqs.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.06);
          gain.gain.setValueAtTime(0.18, now + idx * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.6);
          osc.connect(gain);
          gain.connect(this.destNode || this.ctx.destination);
          osc.start(now + idx * 0.06);
          osc.stop(now + idx * 0.06 + 0.65);
        });
        break;
      }

      case 'fuse_spark': {
        // Electric arc zap when placing master fuse
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(450, now + 0.05);
        osc.frequency.linearRampToValueAtTime(90, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.destNode || this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }

      case 'laser_shutdown': {
        // Deep power-down drone sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 1.2);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
        osc.connect(gain);
        gain.connect(this.destNode || this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.3);
        break;
      }

      case 'ui_click':
      case 'controls_open': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.connect(gain);
        gain.connect(this.destNode || this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.warn('[Audio] SFX execution error:', type, err);
  }
}
}

export const sound = new SoundEngine();
