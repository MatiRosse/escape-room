const fs = require('fs');
const path = require('path');

const mainPath = path.resolve(__dirname, '../src/main.js');
let content = fs.readFileSync(mainPath, 'utf8');

// 1. Add displayedLogIds in constructor
content = content.replace(
  `    this.toastTimeout = null;

    // Clock`,
  `    this.toastTimeout = null;
    this.displayedLogIds = new Set();

    // Clock`
);

// 2. Add Sound toggle, Help modal, and KeyM / KeyH in setupUIBindings
const oldKeydownBlock = `      if (e.code === 'Digit1') {
        this.triggerGreeting();
      } else if (e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
        const slotIdx = parseInt(e.code.replace('Digit', '')) - 1;
        this.selectInventorySlot(slotIdx);
      }
    });

    // Quick greet button in HUD
    document.getElementById('btn-quick-greet')?.addEventListener('click', () => {
      this.triggerGreeting();
    });`;

const newKeydownBlock = `      if (e.code === 'Digit1') {
        this.triggerGreeting();
      } else if (e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
        const slotIdx = parseInt(e.code.replace('Digit', '')) - 1;
        this.selectInventorySlot(slotIdx);
      } else if (e.code === 'KeyM') {
        this.toggleAudioMute();
      } else if (e.code === 'KeyH') {
        this.toggleControlsGuide();
      }
    });

    // Sound toggle button in HUD
    document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
      this.toggleAudioMute();
    });

    // Help controls modal button in HUD
    document.getElementById('btn-help-controls')?.addEventListener('click', () => {
      this.toggleControlsGuide();
    });

    // Quick greet button in HUD
    document.getElementById('btn-quick-greet')?.addEventListener('click', () => {
      this.triggerGreeting();
    });`;

content = content.replace(oldKeydownBlock, newKeydownBlock);

// 3. Replace dials keypad_beep with dial_tick
content = content.replaceAll(
  `        this.safeDials[dialIdx] = (this.safeDials[dialIdx] + 1) % 10;
        digitEl.textContent = this.safeDials[dialIdx];
        sound.playSFX('keypad_beep');`,
  `        this.safeDials[dialIdx] = (this.safeDials[dialIdx] + 1) % 10;
        digitEl.textContent = this.safeDials[dialIdx];
        sound.playSFX('dial_tick');`
);

content = content.replaceAll(
  `        this.safeDials[dialIdx] = (this.safeDials[dialIdx] + 9) % 10;
        digitEl.textContent = this.safeDials[dialIdx];
        sound.playSFX('keypad_beep');`,
  `        this.safeDials[dialIdx] = (this.safeDials[dialIdx] + 9) % 10;
        digitEl.textContent = this.safeDials[dialIdx];
        sound.playSFX('dial_tick');`
);

content = content.replaceAll(
  `        this.jackDials[dialIdx] = (this.jackDials[dialIdx] + 1) % 10;
        if (digitEl) digitEl.textContent = this.jackDials[dialIdx];
        sound.playSFX('keypad_beep');`,
  `        this.jackDials[dialIdx] = (this.jackDials[dialIdx] + 1) % 10;
        if (digitEl) digitEl.textContent = this.jackDials[dialIdx];
        sound.playSFX('dial_tick');`
);

content = content.replaceAll(
  `        this.jackDials[dialIdx] = (this.jackDials[dialIdx] + 9) % 10;
        if (digitEl) digitEl.textContent = this.jackDials[dialIdx];
        sound.playSFX('keypad_beep');`,
  `        this.jackDials[dialIdx] = (this.jackDials[dialIdx] + 9) % 10;
        if (digitEl) digitEl.textContent = this.jackDials[dialIdx];
        sound.playSFX('dial_tick');`
);

// 4. Update triggerGreeting with sweet couple quotes and chime sound
const oldTriggerGreeting = `  triggerGreeting() {
    const greetingText = this.localPlayerSlot === 1
      ? '¡Hola mi amorcito! 👋🤖❤️'
      : '¡Hola mi amorcito! 👋🤖✨';

    sound.playSFX('robot_wave');
    this.showGreetingToast(\`Tú: \${greetingText}\`);
    this.network.sendAction('GREET', { text: greetingText });
  }`;

const newTriggerGreeting = `  triggerGreeting() {
    const sweetQuotes = [
      '¡Hola mi amorcito! 👋🤖❤️',
      '¡Juntos somos un equipo imparable! 💖🚀',
      '¡Sos el mejor compañer@ de escape! 🥰✨',
      '¡Vamos que salimos de esta! 🌟🔑',
      '¡Te amo un montón amor! 💖🤖'
    ];
    const greetingText = sweetQuotes[Math.floor(Math.random() * sweetQuotes.length)];

    sound.playSFX('chime_love');
    this.showGreetingToast(\`Tú: \${greetingText}\`);
    this.scene.triggerRemoteGreeting(true, greetingText);
    this.network.sendAction('GREET', { text: greetingText });
  }

  toggleAudioMute() {
    const isMuted = sound.toggleMute();
    const btn = document.getElementById('btn-sound-toggle');
    const icon = document.getElementById('sound-icon');
    const label = document.getElementById('sound-label');
    if (btn) btn.classList.toggle('muted', isMuted);
    if (icon) icon.textContent = isMuted ? '🔇' : '🔊';
    if (label) label.textContent = isMuted ? 'SILENCIO' : 'AUDIO';
  }

  toggleControlsGuide() {
    const modal = document.getElementById('modal-controls-guide');
    if (!modal) return;
    const isHidden = modal.classList.contains('hidden');
    if (isHidden) {
      this.openModal('modal-controls-guide');
      sound.playSFX('controls_open');
    } else {
      this.closeModal(modal);
    }
  }`;

content = content.replace(oldTriggerGreeting, newTriggerGreeting);

// 5. Update toggleUvLight to play flashlight_toggle sound
content = content.replace(
  `  toggleUvLight() {
    this.isUvActive = !this.isUvActive;`,
  `  toggleUvLight() {
    this.isUvActive = !this.isUvActive;
    sound.playSFX('flashlight_toggle');`
);

// 6. Synchronize activityLog in onGameStateUpdate
content = content.replace(
  `    this.scene.applyGameState(state);

    // Update Squad Roster & Remote Avatars (Up to 4 players)`,
  `    this.scene.applyGameState(state);

    // Stream activity log into live terminal
    if (state.activityLog && Array.isArray(state.activityLog)) {
      state.activityLog.forEach(log => {
        if (log && log.id && !this.displayedLogIds.has(log.id)) {
          this.displayedLogIds.add(log.id);
          this.addLogToTerminal(log);
        }
      });
    }

    // Update Squad Roster & Remote Avatars (Up to 4 players)`
);

// 7. Add compass update in loop and method
content = content.replace(
  `    // Render Scene
    this.scene.render();`,
  `    // Update Compass Ribbon UI
    this.updateCompassUI();

    // Render Scene
    this.scene.render();`
);

const compassMethod = `  updateCompassUI() {
    const degEl = document.getElementById('compass-deg');
    const cardEl = document.getElementById('compass-cardinal');
    if (!degEl || !cardEl || !this.controls) return;

    const yawRad = this.controls.currentYaw || 0;
    const deg = Math.round(((-yawRad * 180 / Math.PI) % 360 + 360) % 360);
    degEl.textContent = \`\${String(deg).padStart(3, '0')}°\`;

    let cardinal = 'NORTE';
    if (deg >= 22.5 && deg < 67.5) cardinal = 'NORESTE';
    else if (deg >= 67.5 && deg < 112.5) cardinal = 'ESTE';
    else if (deg >= 112.5 && deg < 157.5) cardinal = 'SURESTE';
    else if (deg >= 157.5 && deg < 202.5) cardinal = 'SUR';
    else if (deg >= 202.5 && deg < 247.5) cardinal = 'SUROESTE';
    else if (deg >= 247.5 && deg < 292.5) cardinal = 'OESTE';
    else if (deg >= 292.5 && deg < 337.5) cardinal = 'NOROESTE';
    cardEl.textContent = cardinal;
  }
}

// Instantiate on DOM load`;

content = content.replace(`}

// Instantiate on DOM load`, compassMethod);

fs.writeFileSync(mainPath, content, 'utf8');
console.log('src/main.js updated successfully!');
