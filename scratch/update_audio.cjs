const fs = require('fs');
const path = require('path');

const audioPath = path.resolve(__dirname, '../src/audio.js');
let content = fs.readFileSync(audioPath, 'utf8');

// 1. Update constructor
content = content.replace(
  `  constructor() {
    this.ctx = null;
    this.ambientGain = null;
    this.initialized = false;
  }`,
  `  constructor() {
    this.ctx = null;
    this.ambientGain = null;
    this.masterGain = null;
    this.destNode = null;
    this.isMuted = false;
    this.initialized = false;
  }`
);

// 2. Update init() to create masterGain
content = content.replace(
  `      this.ctx = new AudioContext();
      this.initialized = true;
      this.startAmbientHum();`,
  `      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;
      this.masterGain.connect(this.ctx.destination);
      this.destNode = this.masterGain;
      this.initialized = true;
      this.startAmbientHum();`
);

// 3. Add toggleMute & helper
const toggleMuteCode = `  toggleMute() {
    this.ensureContext();
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1.0, now);
    }
    return this.isMuted;
  }

  ensureContext() {`;

content = content.replace(`  ensureContext() {`, toggleMuteCode);

// 4. In ensureContext ensure destNode is defined
content = content.replace(
  `    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }`,
  `    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.ctx && !this.destNode && this.masterGain) {
      this.destNode = this.masterGain;
    }`
);

// 5. Replace all "this.ctx.destination" with "(this.destNode || this.ctx.destination)"
content = content.replaceAll('this.ctx.destination', '(this.destNode || this.ctx.destination)');

// 6. Add new sound effects before "default:"
const newSFX = `      case 'flashlight_toggle': {
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

      default:`;

content = content.replace('      default:', newSFX);

fs.writeFileSync(audioPath, content, 'utf8');
console.log('src/audio.js updated successfully!');
