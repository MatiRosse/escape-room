import { EscapeScene } from './scene.js';
import { PlayerControls } from './controls.js';
import { NetworkClient } from './network.js';
import { sound } from './audio.js';
import { renderBanknoteCanvas } from './textures.js';
import { getJackboxState } from '../shared/jackbox.js';
import { CircusPosterScare } from './circus-scare.js';

class EscapeGame {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.scene = null;
    this.controls = null;
    this.network = null;

    // Game state cache
    this.gameState = null;
    this.localPlayerId = null;
    this.localPlayerSlot = 1;
    this.isUvActive = false;
    this.activeInventoryItem = null;

    // Dial states for Safe 104 modal
    this.safeDials = [0, 0, 0, 0];
    // Dial states for Jack-in-the-Box
    this.jackDials = [0, 0, 0, 0];

    // Theme & Room status
    this.selectedMapTheme = 'vault';
    this.vaultAnnounced = false;

    // Room 2 Puzzle states
    this.freqAlfa = 0;
    this.freqBravo = 0;
    this.laserInput = '';
    this.toastTimeout = null;
    this.displayedLogIds = new Set();

    // Clock
    this.lastTime = performance.now();
    this.timerInterval = null;

    this.init();
  }

  init() {
    // 1. Setup 3D Scene
    this.scene = new EscapeScene(this.canvas);

    // 2. Setup Player Controls & Raycast interaction handler
    this.controls = new PlayerControls(
      this.scene.camera,
      this.canvas,
      this.scene.interactiveObjects,
      (actionType, data) => this.handleWorldInteraction(actionType, data)
    );

    // 3. Setup Network
    this.network = new NetworkClient({
      onStateUpdate: (state) => this.onGameStateUpdate(state),
      onPlayerMoved: (id, pos, rot, isUvActive) => {
        if (!id || id === this.localPlayerId) return;
        this.scene.updateRemotePlayer(id, pos, rot, isUvActive);
      },
      onPlayerJoined: (player) => this.onPartnerJoined(player),
      onPlayerLeft: (id, name) => this.onPartnerLeft(id, name),
      onPlayerGreeted: (msg) => this.onPlayerGreeted(msg),
      onSfxTrigger: (sfx) => sound.playSFX(sfx),
      onNewLog: (log) => this.addLogToTerminal(log),
      onError: (err) => this.handleNetworkError(err)
    });

    this.posterScare = new CircusPosterScare({
      poster: document.getElementById('modal-clown-poster'),
      overlay: document.getElementById('circus-screamer'),
      image: document.getElementById('circus-screamer-image'),
      playSound: () => sound.playSFX('clown_screamer'),
      storage: window.sessionStorage
    });

    // 4. Bind UI & Modals
    this.setupUIBindings();

    // 5. Start Render & Game Loop
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setupUIBindings() {
    // Map selection cards in lobby
    const cardVault = document.getElementById('card-map-vault');
    const cardCircus = document.getElementById('card-map-circus');
    const mapInput = document.getElementById('selected-map-theme');
    const briefTitle = document.getElementById('briefing-title');
    const briefDesc = document.getElementById('briefing-desc');
    const briefList = document.getElementById('briefing-list');

    if (cardVault && cardCircus) {
      cardVault.addEventListener('click', () => {
        cardVault.classList.add('active');
        cardCircus.classList.remove('active');
        if (mapInput) mapInput.value = 'vault';
        this.selectedMapTheme = 'vault';
        if (briefTitle) briefTitle.textContent = 'INFORME DE MISIÓN: BÓVEDA OMEGA';
        if (briefDesc) briefDesc.textContent = 'Están atrapados en la antecámara blindada de máxima seguridad. Para escapar deben colaborar en equipo (hasta 4 agentes: Alfa, Bravo, Charlie y Delta):';
        if (briefList) {
          briefList.innerHTML = `
            <li><strong>Directiva 1:</strong> La seguridad de la antecámara oculta marcas invisibles; exploren el mobiliario e inspeccionen cada rincón.</li>
            <li><strong>Directiva 2:</strong> Los archivos confidenciales y el manual técnico contienen las claves del protocolo de emergencia.</li>
            <li><strong>Directiva 3:</strong> La energía auxiliar debe ser estabilizada para alimentar los sistemas biométricos de la compuerta.</li>
            <li><strong>Directiva 4:</strong> Solo descifrando los cálculos aritméticos de los fundadores podrán abrir la cámara del núcleo.</li>
          `;
        }
      });

      cardCircus.addEventListener('click', () => {
        cardCircus.classList.add('active');
        cardVault.classList.remove('active');
        if (mapInput) mapInput.value = 'circus';
        this.selectedMapTheme = 'circus';
        if (briefTitle) briefTitle.textContent = 'INFORME DE MISIÓN: CIRCO MALDITO (TERROR)';
        if (briefDesc) briefDesc.textContent = '¡La carpa está embrujada por payasos siniestros! Para escapar con vida, su escuadrón debe resolver los misterios:';
        if (briefList) {
          briefList.innerHTML = `
            <li><strong>Directiva 1:</strong> Los camerinos abandonados guardan herramientas del personal para cortar y despejar el camino.</li>
            <li><strong>Directiva 2:</strong> Los objetos suspendidos en el aire no están ahí por azar; busquen una manera de alcanzarlos.</li>
            <li><strong>Directiva 3:</strong> La historia del espectáculo y sus funciones pasadas revelarán los secretos del autómata mecánico.</li>
            <li><strong>Directiva 4:</strong> La caja sorpresa custodia la última llave para abrir los barrotes de la carpa.</li>
          `;
        }
      });
    }

    // Lobby Form submit
    const lobbyForm = document.getElementById('lobby-form');
    const wsUrlInput = document.getElementById('ws-url-input');

    if (wsUrlInput) {
      const savedWsUrl = localStorage.getItem('escape_ws_url');
      const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
      wsUrlInput.value = isLocal ? this.network.serverUrl : (savedWsUrl || this.network.serverUrl);
    }

    lobbyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('player-name-input').value.trim() || 'Agente';
      const roomInput = document.getElementById('room-id-input').value.trim() || 'escape-1';
      const chosenTheme = mapInput?.value || this.selectedMapTheme || 'vault';
      const customWsUrl = wsUrlInput ? wsUrlInput.value.trim() : null;

      if (customWsUrl) {
        localStorage.setItem('escape_ws_url', customWsUrl);
      }

      sound.init();

      try {
        const initData = await this.network.connect(roomInput, nameInput, chosenTheme, customWsUrl);
        this.localPlayerId = initData.yourId;
        this.localPlayerSlot = initData.yourSlot;
        const activeTheme = initData.mapTheme || chosenTheme;
        this.selectedMapTheme = activeTheme;

        // Rebuild 3D scene geometry according to theme
        this.scene.buildMap(activeTheme);
        if (this.controls && typeof this.controls.setMapTheme === 'function') {
          this.controls.setMapTheme(activeTheme);
        }
        sound.setMapTheme(activeTheme);

        if (activeTheme === 'circus') {
          document.body.classList.add('circus-theme-active');
        } else {
          document.body.classList.remove('circus-theme-active');
        }

        // Spawn positions for up to 4 players
        if (activeTheme === 'circus') {
          const circusSpawns = [
            null,
            { x: 0, y: 1.6, z: 4.2 },
            { x: 2.5, y: 1.6, z: 2.5 },
            { x: -2.5, y: 1.6, z: 2.5 },
            { x: 0, y: 1.6, z: -3.5 }
          ];
          const sp = circusSpawns[this.localPlayerSlot] || circusSpawns[1];
          this.scene.camera.position.set(sp.x, sp.y, sp.z);
        } else {
          const vaultSpawns = [
            null,
            { x: -2.0, y: 1.6, z: 3.5 },
            { x: 2.0, y: 1.6, z: 3.5 },
            { x: -3.0, y: 1.6, z: 1.5 },
            { x: 3.0, y: 1.6, z: 1.5 }
          ];
          const sp = vaultSpawns[this.localPlayerSlot] || vaultSpawns[1];
          this.scene.camera.position.set(sp.x, sp.y, sp.z);
        }

        // Close lobby modal
        document.getElementById('lobby-modal').classList.add('hidden');
        document.getElementById('hud-overlay').classList.remove('hidden');
        document.getElementById('hud-room-tag').textContent = `SALA: ${roomInput.toUpperCase()} [${activeTheme.toUpperCase()}]`;

        // Lock pointer
        this.controls.lock();

        this.startTimer();
      } catch (err) {
        console.error('[GAME] Error al conectar:', err);
        alert(err?.message || 'No se pudo conectar al servidor WebSocket. Asegúrate de que el servidor esté activo.');
      }
    });

    // Click to play prompt
    document.getElementById('click-to-play').addEventListener('click', () => {
      this.controls.lock();
    });

    // Close inspect buttons
    document.querySelectorAll('.btn-close-inspect').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        this.closeModal(modalId);
      });
    });

    // Close inspect modal by clicking anywhere outside its card (on the backdrop)
    document.querySelectorAll('.inspect-modal').forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

    // Global keyboard handler for modals, puzzles, and inventory
    document.addEventListener('keydown', (e) => {
      if (this.posterScare?.active) {
        if (e.key === 'Escape') this.posterScare.dismiss();
        else if (e.code === 'KeyM') this.toggleAudioMute();
        e.preventDefault();
        return;
      }
      const openModal = document.querySelector('.inspect-modal:not(.hidden)');

      if (e.key === 'Escape') {
        if (openModal) {
          this.closeModal(openModal.id);
        }
        return;
      }

      // If a modal is currently open, enable direct keypad/keyboard input
      if (openModal) {
        if (openModal.id === 'keypad-modal') {
          if (e.key >= '0' && e.key <= '9') {
            this.network.sendAction('KEYPAD_PRESS', { key: e.key });
          } else if (e.key === 'Backspace') {
            this.network.sendAction('KEYPAD_PRESS', { key: 'CLEAR' });
          } else if (e.key === 'Enter') {
            this.network.sendAction('KEYPAD_PRESS', { key: 'ENTER' });
          }
          return;
        }

        if (openModal.id === 'safe-modal' && e.key === 'Enter') {
          document.getElementById('btn-unlock-safe')?.click();
          return;
        }

        if (openModal.id === 'laser-modal') {
          if (e.key >= '0' && e.key <= '9') {
            if (this.laserInput.length < 3) {
              this.laserInput += e.key;
              const d = document.getElementById('laser-input-display');
              if (d) d.textContent = this.laserInput;
              sound.playSFX('keypad_beep');
            }
          } else if (e.key === 'Backspace') {
            this.laserInput = this.laserInput.slice(0, -1);
            const d = document.getElementById('laser-input-display');
            if (d) d.textContent = this.laserInput || '---';
            sound.playSFX('keypad_beep');
          } else if (e.key === 'Enter') {
            document.getElementById('btn-laser-submit')?.click();
          }
          return;
        }

        if (openModal.id === 'jack-modal' && e.key === 'Enter') {
          document.getElementById('btn-unlock-jack')?.click();
          return;
        }
      }

      if (e.code === 'Digit1') {
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

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.posterScare?.dismiss();
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
    });

    // Toggle Mission Guide visibility / minimization
    const toggleGuideBtn = document.getElementById('btn-toggle-guide');
    const guideCard = document.getElementById('hud-mission-guide');
    if (toggleGuideBtn && guideCard) {
      toggleGuideBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        guideCard.classList.toggle('minimized');
        toggleGuideBtn.textContent = guideCard.classList.contains('minimized') ? '👁️' : '➖';
      });
    }

    // Reset mission button
    document.getElementById('btn-reset-mission')?.addEventListener('click', () => {
      if (confirm('¿Deseas reiniciar la misión desde cero? Se cerrará la bóveda y se reestablecerán todos los acertijos.')) {
        this.network.sendAction('RESET_ROOM', { mapTheme: this.selectedMapTheme });
        this.vaultAnnounced = false;
      }
    });

    // -------------------------------------------------------------
    // Puzzle B: Safe 104 Dial Dials UI
    // -------------------------------------------------------------
    document.querySelectorAll('.dial-column').forEach((col) => {
      const dialIdx = parseInt(col.getAttribute('data-dial'));
      const digitEl = col.querySelector('.dial-digit');

      col.querySelector('.btn-dial-up').addEventListener('click', () => {
        this.safeDials[dialIdx] = (this.safeDials[dialIdx] + 1) % 10;
        digitEl.textContent = this.safeDials[dialIdx];
        sound.playSFX('dial_tick');
      });

      col.querySelector('.btn-dial-down').addEventListener('click', () => {
        this.safeDials[dialIdx] = (this.safeDials[dialIdx] + 9) % 10;
        digitEl.textContent = this.safeDials[dialIdx];
        sound.playSFX('dial_tick');
      });
    });

    document.getElementById('btn-unlock-safe').addEventListener('click', () => {
      const enteredCode = this.safeDials.join('');
      this.network.sendAction('SUBMIT_SAFE_CODE', { code: enteredCode });
    });

    // Safe 104 Interior Collect Buttons (Unambiguous looting)
    document.getElementById('btn-modal-take-fuse')?.addEventListener('click', () => {
      this.network.sendAction('TAKE_MASTER_FUSE');
      sound.playSFX('item_pickup');
    });

    document.getElementById('btn-modal-take-keycard')?.addEventListener('click', () => {
      this.network.sendAction('TAKE_KEYCARD');
      sound.playSFX('item_pickup');
    });

    // -------------------------------------------------------------
    // Circus Horror Modals Action Bindings
    // -------------------------------------------------------------
    document.getElementById('btn-modal-take-knife')?.addEventListener('click', () => {
      this.network.sendAction('TAKE_CIRCUS_KNIFE');
      sound.playSFX('item_pickup');
      const fb = document.getElementById('knife-feedback');
      if (fb) {
        fb.textContent = '✓ ¡Cuchillo recogido en tu inventario!';
        fb.style.color = '#00e676';
      }
      this.closeModal('modal-circus-knife');
      this.showGreetingToast('🔪 Has recogido un cuchillo de utilería.', true);
    });

    document.getElementById('btn-modal-pop-balloon')?.addEventListener('click', () => {
      const hasKnife = this.gameState?.circusInventory?.circusKnife?.collected || 
                       this.gameState?.circusInventory?.circus_knife?.collected || 
                       this.gameState?.circusInventory?.circus_dart?.collected ||
                       this.gameState?.circusPuzzles?.knifeCollected;
      const fb = document.getElementById('balloon-feedback');
      if (!hasKnife) {
        sound.playSFX('access_denied');
        if (fb) {
          fb.textContent = '❌ El globo está muy alto y la goma es impenetrable sin una herramienta filosa.';
          fb.style.color = '#ff5252';
        }
        return;
      }
      this.closeModal('modal-circus-balloon');
      this.network.sendAction('POP_BALLOON');
      sound.playSFX('balloon_pop');
      this.showGreetingToast('🎈 ¡El globo ha reventado!', true);
    });

    document.getElementById('btn-modal-take-crank')?.addEventListener('click', () => {
      this.network.sendAction('TAKE_CRANK');
      sound.playSFX('item_pickup');
      this.closeModal('modal-circus-balloon');
      this.showGreetingToast('⚙️ Has recogido una manivela mecánica.', true);
    });

    document.getElementById('btn-modal-activate-booth')?.addEventListener('click', () => {
      this.network.sendAction('ACTIVATE_ANIMATRONIC');
      sound.playSFX('clown_laugh');
      const fb = document.getElementById('animatronic-feedback');
      if (fb) {
        fb.textContent = '🤡 Los ojos del autómata brillan con un fulgor escarlata mientras sus risotadas resuenan por la carpa.';
        fb.style.color = '#00e676';
      }
    });

    // Jack in the box dials
    document.querySelectorAll('[data-jdial]').forEach(col => {
      const dialIdx = parseInt(col.getAttribute('data-jdial'));
      const digitEl = col.querySelector('.dial-digit');
      col.querySelector('.btn-dial-up')?.addEventListener('click', () => {
        this.jackDials[dialIdx] = (this.jackDials[dialIdx] + 1) % 10;
        if (digitEl) digitEl.textContent = this.jackDials[dialIdx];
        sound.playSFX('dial_tick');
      });
      col.querySelector('.btn-dial-down')?.addEventListener('click', () => {
        this.jackDials[dialIdx] = (this.jackDials[dialIdx] + 9) % 10;
        if (digitEl) digitEl.textContent = this.jackDials[dialIdx];
        sound.playSFX('dial_tick');
      });
    });

    document.getElementById('btn-modal-insert-crank')?.addEventListener('click', () => {
      const { hasCrank, crankInserted, open } = getJackboxState(this.gameState);
      if (crankInserted || open) return;
      const jackFb = document.getElementById('jackbox-feedback');
      if (!hasCrank) {
        sound.playSFX('access_denied');
        if (jackFb) {
          jackFb.textContent = '❌ No tienes nada que encaje en ese engranaje.';
          jackFb.style.color = '#ff5252';
        }
        return;
      }
      this.network.sendAction('INSERT_JACK_CRANK');
      sound.playSFX('switch_click');
    });

    document.getElementById('btn-modal-crank-jack')?.addEventListener('click', () => {
      const { hasCrank, open } = getJackboxState(this.gameState);
      if (open) return;
      if (!hasCrank) {
        const jackFb = document.getElementById('jackbox-feedback');
        if (jackFb) {
          jackFb.textContent = '❌ El mecanismo está trabado. Falta un accionador en el engranaje lateral.';
          jackFb.style.color = '#ff5252';
        }
        sound.playSFX('access_denied');
        return;
      }
      sound.playSFX('creepy_music_box');
      // The server inserts the crank and opens the box in one authoritative action.
      this.network.sendAction('SUBMIT_JACK_CODE', { code: this.jackDials.join('') });
      // The server only broadcasts on success, so show a failure message if the box stays shut
      clearTimeout(this.jackCodeTimeout);
      this.jackCodeTimeout = setTimeout(() => {
        if (this.gameState?.circusPuzzles && !getJackboxState(this.gameState).open) {
          const jackFb = document.getElementById('jackbox-feedback');
          if (jackFb) {
            jackFb.textContent = '🎵 La melodía se corta en seco... la tapa sigue cerrada.';
            jackFb.style.color = '#ff5252';
          }
          sound.playSFX('access_denied');
        }
      }, 900);
    });

    document.getElementById('btn-modal-take-tamer-key')?.addEventListener('click', () => {
      this.network.sendAction('TAKE_TAMER_KEY');
      sound.playSFX('item_pickup');
    });

    document.getElementById('btn-modal-take-cage-lever')?.addEventListener('click', () => {
      this.network.sendAction('TAKE_CAGE_LEVER');
      sound.playSFX('item_pickup');
    });

    document.getElementById('btn-modal-escape-circus')?.addEventListener('click', () => {
      const hasKey = this.gameState?.circusInventory?.tamer_key?.collected || this.gameState?.circusInventory?.tamerKey?.collected;
      const hasLever = this.gameState?.circusInventory?.cage_lever?.collected || this.gameState?.circusInventory?.cageLever?.collected;
      const fb = document.getElementById('circus-cage-feedback');
      if (!hasKey || !hasLever) {
        sound.playSFX('access_denied');
        if (fb) {
          fb.textContent = '🔒 El candado maestro de calavera sigue sellado y los engranajes de la reja no ceden.';
          fb.style.color = '#ff5252';
        }
        return;
      }
      this.closeModal('modal-circus-cage');
      this.network.sendAction('ESCAPE_CIRCUS');
    });

    // -------------------------------------------------------------
    // Puzzle C: Fusebox Panel UI
    // -------------------------------------------------------------
    document.getElementById('btn-insert-fuse').addEventListener('click', () => {
      this.network.sendAction('INSERT_MASTER_FUSE');
    });

    document.querySelectorAll('.breaker-switch').forEach((sw, idx) => {
      sw.addEventListener('click', () => {
        this.network.sendAction('TOGGLE_BREAKER', { breakerIndex: idx });
      });
    });

    // -------------------------------------------------------------
    // Puzzle D: Keypad UI
    // -------------------------------------------------------------
    document.querySelectorAll('.key-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        this.network.sendAction('KEYPAD_PRESS', { key });
      });
    });

    document.getElementById('btn-swipe-keycard').addEventListener('click', () => {
      this.network.sendAction('SWIPE_KEYCARD');
    });

    // -------------------------------------------------------------
    // Puzzle A: Bill Inspect Canvas UV toggle
    // -------------------------------------------------------------
    document.getElementById('btn-toggle-bill-uv').addEventListener('click', () => {
      this.toggleUvLight();
      const canvas = document.getElementById('bill-inspect-canvas');
      renderBanknoteCanvas(canvas, this.isUvActive ? 1 : 0);
      const statusText = document.getElementById('bill-uv-status');
      if (this.isUvActive) {
        statusText.textContent = '✦ LUZ ULTRAVIOLETA ACTIVA ✦';
        statusText.classList.add('active');
        this.network.sendAction('REVEAL_BILL_UV');
      } else {
        statusText.textContent = 'LUZ NORMAL ACTIVA';
        statusText.classList.remove('active');
      }
    });

    // -------------------------------------------------------------
    // Room 2: Sintonizadores de Frecuencia Cuántica Alfa & Bravo
    // -------------------------------------------------------------
    document.querySelectorAll('.btn-freq').forEach((btn) => {
      btn.addEventListener('click', () => {
        const channel = btn.getAttribute('data-channel');
        const delta = parseInt(btn.getAttribute('data-delta')) || 0;
        sound.playSFX('quantum_tune');

        if (channel === 'alfa') {
          this.freqAlfa = Math.max(0, Math.min(999, this.freqAlfa + delta));
          document.getElementById('freq-val-alfa').textContent = String(this.freqAlfa).padStart(3, '0');
          this.network.sendAction('SET_ALFA_FREQ', { freq: this.freqAlfa });
        } else if (channel === 'bravo') {
          this.freqBravo = Math.max(0, Math.min(999, this.freqBravo + delta));
          document.getElementById('freq-val-bravo').textContent = String(this.freqBravo).padStart(3, '0');
          this.network.sendAction('SET_BRAVO_FREQ', { freq: this.freqBravo });
        }
      });
    });

    document.getElementById('btn-sync-alfa')?.addEventListener('click', () => {
      sound.playSFX('keypad_beep');
      this.network.sendAction('SET_ALFA_FREQ', { freq: this.freqAlfa });
    });

    document.getElementById('btn-sync-bravo')?.addEventListener('click', () => {
      sound.playSFX('keypad_beep');
      this.network.sendAction('SET_BRAVO_FREQ', { freq: this.freqBravo });
    });

    // -------------------------------------------------------------
    // Room 2: Consola de Desactivación de Barrera Láser
    // -------------------------------------------------------------
    document.querySelectorAll('.laser-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-lkey');
        const displayEl = document.getElementById('laser-display-text');

        if (key === 'CLEAR') {
          this.laserInput = '';
          displayEl.textContent = '---';
          sound.playSFX('beep_clear');
        } else if (key === 'ENTER') {
          sound.playSFX('keypad_beep');
          this.network.sendAction('SUBMIT_LASER_CODE', { code: this.laserInput });
        } else if (this.laserInput.length < 5) {
          this.laserInput += key;
          displayEl.textContent = this.laserInput;
          sound.playSFX('keypad_beep');
        }
      });
    });

    // Replay button
    document.getElementById('btn-replay').addEventListener('click', () => {
      this.network.sendAction('RESET_GAME');
      document.getElementById('victory-modal').classList.add('hidden');
    });
  }

  openModal(modalId) {
    this.controls.unlock();
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (modal) {
      modal.classList.remove('hidden');
      if (modal.id === 'modal-clown-poster') this.posterScare?.schedule();
      else this.posterScare?.dismiss();
    }
  }

  closeModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (modal) {
      modal.classList.add('hidden');
      if (modal.id === 'modal-clown-poster') this.posterScare?.dismiss();
    }
    this.controls.lock();
  }

  handleWorldInteraction(type, data) {
    switch (type) {
      case 'DESK_DRAWER':
        this.network.sendAction('TOGGLE_DRAWER');
        break;

      case 'UV_FLASHLIGHT':
        this.network.sendAction('TAKE_UV_FLASHLIGHT');
        break;

      case 'TOGGLE_UV_KEY':
        if (this.gameState?.inventory.uv_flashlight.collected) {
          this.toggleUvLight();
        }
        break;

      case 'ARCHIVE_FOLDER':
        this.openModal('modal-archive');
        this.network.sendAction('INSPECT_ARCHIVE');
        break;

      case 'GUARD_MANUAL':
        this.openModal('modal-manual');
        break;

      case 'SAFE_104':
        this.openModal('modal-safe104');
        break;

      case 'MASTER_FUSE':
        this.network.sendAction('TAKE_MASTER_FUSE');
        break;

      case 'KEYCARD':
        this.network.sendAction('TAKE_KEYCARD');
        break;

      case 'FUSEBOX_PANEL':
        this.openModal('modal-fusebox');
        break;

      case 'FRAMED_BILL':
        const canvas = document.getElementById('bill-inspect-canvas');
        renderBanknoteCanvas(canvas, this.isUvActive ? 1 : 0);
        this.openModal('modal-bill');
        break;

      case 'VAULT_KEYPAD':
        this.openModal('modal-keypad');
        break;

      case 'VAULT_WHEEL':
        this.network.sendAction('TURN_VAULT_WHEEL', { amount: 0.25 });
        break;

      // Circus Horror World Interactions
      case 'CIRCUS_POSTER':
        this.openModal('modal-clown-poster');
        break;

      case 'CIRCUS_KNIFE':
        this.openModal('modal-circus-knife');
        break;

      case 'CLOWN_BALLOON':
        this.openModal('modal-circus-balloon');
        break;

      case 'CLOWN_CRANK':
        this.network.sendAction('TAKE_CRANK');
        sound.playSFX('item_pickup');
        this.showGreetingToast('⚙️ Has recogido una manivela mecánica.', true);
        break;

      case 'ANIMATRONIC_BOOTH':
        this.openModal('modal-animatronic');
        break;

      case 'JACK_IN_THE_BOX':
        this.openModal('modal-jackbox');
        break;

      case 'CIRCUS_ESCAPE_GATE':
        this.openModal('modal-circus-cage');
        break;

      // Room 2 Interactions
      case 'ROOM2_TABLET':
        this.openModal('modal-room2-tablet');
        this.network.sendAction('INSPECT_ROOM2_TABLET');
        break;

      case 'TERMINAL_ALFA':
        this.openModal('modal-terminal-alfa');
        break;

      case 'TERMINAL_BRAVO':
        this.openModal('modal-terminal-bravo');
        break;

      case 'LASER_CONSOLE':
        this.openModal('modal-laser-console');
        break;

      case 'FINAL_EXTRACTION':
        this.network.sendAction('ACTIVATE_FINAL_EXTRACTION');
        break;

      case 'TRIGGER_GREETING':
        this.triggerGreeting();
        break;
    }
  }

  triggerGreeting() {
    const sweetQuotes = [
      '¡Hola mi amorcito! 👋🤖❤️',
      '¡Juntos somos un equipo imparable! 💖🚀',
      '¡Sos el mejor compañer@ de escape! 🥰✨',
      '¡Vamos que salimos de esta! 🌟🔑',
      '¡Te amo un montón amor! 💖🤖'
    ];
    const greetingText = sweetQuotes[Math.floor(Math.random() * sweetQuotes.length)];

    sound.playSFX('chime_love');
    this.showGreetingToast(`Tú: ${greetingText}`);
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
  }

  showGreetingToast(text, isCombo = false) {
    const toast = document.getElementById('greeting-toast');
    const msg = document.getElementById('toast-msg');
    if (!toast || !msg) return;

    msg.textContent = text;
    toast.classList.remove('hidden');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3400);
  }

  onPlayerGreeted(msg) {
    if (msg.playerId !== this.localPlayerId) {
      this.scene.triggerRemoteGreeting(msg.isCombo, msg.text);
      sound.playSFX(msg.isCombo ? 'couple_synergy' : 'robot_wave');
      this.showGreetingToast(`${msg.name}: ${msg.text}`, msg.isCombo);
    }
  }

  toggleUvLight() {
    this.isUvActive = !this.isUvActive;
    sound.playSFX('flashlight_toggle');
    this.scene.lights.playerUvSpot.intensity = this.isUvActive ? 2.5 : 0;
    this.network.sendAction('TOGGLE_UV_LIGHT', { active: this.isUvActive });

    const uvIndicator = document.getElementById('uv-active-indicator');
    if (this.isUvActive) {
      uvIndicator.classList.remove('hidden');
    } else {
      uvIndicator.classList.add('hidden');
    }
  }

  selectInventorySlot(slotIndex) {
    document.querySelectorAll('.slot-item').forEach((s) => s.classList.remove('active'));
    const slotEl = document.getElementById(`slot-${slotIndex}`);
    if (slotEl && slotEl.classList.contains('has-item')) {
      slotEl.classList.add('active');
    }
  }

  onGameStateUpdate(state) {
    this.gameState = state;
    this.posterScare?.updateState(state);

    // Apply to 3D scene
    this.scene.applyGameState(state);

    // Stream activity log into live terminal
    if (state.activityLog && Array.isArray(state.activityLog)) {
      state.activityLog.forEach(log => {
        if (log && log.id && !this.displayedLogIds.has(log.id)) {
          this.displayedLogIds.add(log.id);
          this.addLogToTerminal(log);
        }
      });
    }

    // Update Squad Roster & Remote Avatars (Up to 4 players)
    this.updatePartnerStatus(state);

    // Update Inventory UI
    this.updateInventoryUI(state);

    // Update Safe Modal Feedback & Opened Interior View
    const safeFeedback = document.getElementById('safe-feedback');
    const safeLockedSec = document.getElementById('safe-locked-section');
    const safeUnlockedSec = document.getElementById('safe-unlocked-section');
    const safeSubtitle = document.getElementById('safe-status-subtitle');

    if (state.puzzles?.puzzleB?.safe104Unlocked || state.puzzles?.puzzleB?.safe104DoorOpen) {
      if (safeLockedSec) safeLockedSec.classList.add('hidden');
      if (safeUnlockedSec) safeUnlockedSec.classList.remove('hidden');
      if (safeSubtitle) safeSubtitle.textContent = 'ESTADO: CERROJO LIBERADO - COMPARTIMENTO ABIERTO';
      if (safeFeedback) {
        safeFeedback.textContent = '✓ ¡Caja fuerte abierta! Recoge los objetos de su interior o presiona [ESC].';
        safeFeedback.style.color = '#00e676';
      }

      // Update Loot buttons inside Safe 104
      const fuseState = document.getElementById('loot-fuse-state');
      const keyState = document.getElementById('loot-keycard-state');
      const fuseCard = document.getElementById('loot-card-fuse');
      const keyCard = document.getElementById('loot-card-keycard');
      const fuseBtn = document.getElementById('btn-modal-take-fuse');
      const keyBtn = document.getElementById('btn-modal-take-keycard');

      if (state.inventory?.master_fuse?.collected) {
        if (fuseState) fuseState.textContent = 'Estado: Recogido en inventario';
        if (fuseCard) fuseCard.classList.add('collected');
        if (fuseBtn) { fuseBtn.disabled = true; fuseBtn.textContent = '✓ RECOGIDO'; }
      }
      if (state.inventory?.security_keycard?.collected) {
        if (keyState) keyState.textContent = 'Estado: Recogido en inventario';
        if (keyCard) keyCard.classList.add('collected');
        if (keyBtn) { keyBtn.disabled = true; keyBtn.textContent = '✓ RECOGIDO'; }
      }
    }

    // Vault Door Announcement (Room 2 Opened)
    if (state.puzzles?.puzzleD?.vaultDoorOpen && !this.vaultAnnounced) {
      this.vaultAnnounced = true;
      this.showGreetingToast('🚪 ¡COMPUERTA ABIERTA! ENTRADA AL NÚCLEO CUÁNTICO (SALA 2) DESBLOQUEADA', true);
      sound.playSFX('vault_open');
    }

    // Update Circus Horror Modals UI
    if (state.circusPuzzles) {
      // Vanity Knife
      const knifeBtn = document.getElementById('btn-modal-take-knife');
      const knifeFb = document.getElementById('knife-feedback');
      const hasKnife = state.circusInventory?.circusKnife?.collected || 
                       state.circusInventory?.circus_knife?.collected || 
                       state.circusInventory?.circus_dart?.collected || 
                       state.circusPuzzles?.knifeCollected;
      if (hasKnife) {
        if (knifeBtn) {
          knifeBtn.disabled = true;
          knifeBtn.textContent = '✓ RECOGIDO';
        }
        if (knifeFb) {
          knifeFb.textContent = '✓ Ya posees el cuchillo de utilería en tu inventario.';
          knifeFb.style.color = '#00e676';
        }
      }

      // Balloon
      const popBtn = document.getElementById('btn-modal-pop-balloon');
      const crankBtn = document.getElementById('btn-modal-take-crank');
      const balloonFb = document.getElementById('balloon-feedback');
      const { hasCrank, crankInserted: isCrankInserted, open: isJackPopped } = getJackboxState(state);

      if (state.circusPuzzles.balloonPopped) {
        if (popBtn) popBtn.classList.add('hidden');
        if (crankBtn) {
          if (!hasCrank) {
            crankBtn.classList.remove('hidden');
          } else {
            crankBtn.classList.add('hidden');
          }
        }
        if (balloonFb) {
          balloonFb.textContent = hasCrank ? '✓ Manivela recogida en tu inventario.' : '💥 ¡Globo reventado!';
          balloonFb.style.color = '#00e676';
        }
      }

      // Animatronic Booth
      const boothSpeech = document.getElementById('booth-speech-text');
      const boothBtn = document.getElementById('btn-modal-activate-booth');
      const boothFb = document.getElementById('animatronic-feedback');
      if (state.circusPuzzles.animatronicActive) {
        if (boothSpeech) boothSpeech.textContent = '"¡JA-JA-JA! ¿QUIEREN ESCAPAR DE MI CARPA? LA RIMA DEL AFICHE GUARDA EL SECRETO... CUENTEN BIEN LOS VERSOS DEL ESPECTÁCULO..."';
        if (boothBtn) {
          boothBtn.disabled = true;
          boothBtn.textContent = '✓ CABINA ACTIVADA';
        }
        const boothEyes = document.getElementById('booth-eyes-indicator');
        if (boothEyes) {
          boothEyes.style.filter = 'drop-shadow(0 0 12px #ff1744)';
        }
        if (boothFb) {
          boothFb.textContent = '🤡 Los ojos del autómata brillan con un fulgor escarlata mientras sus risotadas resuenan por la carpa.';
          boothFb.style.color = '#00e676';
        }
      }

      // Jack in the Box
      const crankStatusText = document.getElementById('jackbox-crank-text') || document.getElementById('jackbox-crank-status');
      const insertCrankBtn = document.getElementById('btn-modal-insert-crank');
      const jackLoot = document.getElementById('jack-loot-section');
      const jackFb = document.getElementById('jackbox-feedback');

      if (isCrankInserted) {
        if (crankStatusText) crankStatusText.innerHTML = 'MANIVELA: <strong style="color:#00e676">INSERTADA ✓</strong>';
        if (insertCrankBtn) insertCrankBtn.classList.add('hidden');
      } else {
        if (hasCrank) {
          if (crankStatusText) crankStatusText.innerHTML = 'MANIVELA: <strong>EN INVENTARIO (LISTA PARA INSERTAR)</strong>';
          if (insertCrankBtn) insertCrankBtn.classList.remove('hidden');
        } else {
          if (crankStatusText) crankStatusText.innerHTML = 'MANIVELA: <strong>NO INSERTADA</strong>';
          if (insertCrankBtn) insertCrankBtn.classList.add('hidden');
        }
      }

      const crankJackBtn = document.getElementById('btn-modal-crank-jack');
      if (crankJackBtn) {
        crankJackBtn.disabled = isJackPopped;
        crankJackBtn.textContent = isJackPopped ? '✓ CAJA ABIERTA' : '🎵 GIRAR MANIVELA Y ABRIR CAJA';
      }
      if (isJackPopped) {
        clearTimeout(this.jackCodeTimeout);
        if (insertCrankBtn) insertCrankBtn.classList.add('hidden');
        if (jackLoot) jackLoot.classList.remove('hidden');
        if (jackFb) {
          jackFb.textContent = '🎁 ¡Caja de sorpresas abierta!';
          jackFb.style.color = '#00e676';
        }
      } else {
        if (jackLoot) jackLoot.classList.add('hidden');
      }

      const tamerBtn = document.getElementById('btn-modal-take-tamer-key');
      const cageLeverBtn = document.getElementById('btn-modal-take-cage-lever');
      const hasTamerKey = state.circusInventory?.tamer_key?.collected || state.circusInventory?.tamerKey?.collected;
      const hasCageLever = state.circusInventory?.cage_lever?.collected || state.circusInventory?.cageLever?.collected;

      if (hasTamerKey && tamerBtn) {
        tamerBtn.disabled = true;
        tamerBtn.textContent = '✓ RECOGIDO';
      }
      if (hasCageLever && cageLeverBtn) {
        cageLeverBtn.disabled = true;
        cageLeverBtn.textContent = '✓ RECOGIDO';
      }

      // Cage Gate Modal
      const escapeBtn = document.getElementById('btn-modal-escape-circus');
      if (escapeBtn) {
        if (hasTamerKey && hasCageLever) {
          escapeBtn.disabled = false;
          escapeBtn.textContent = '🏃 ABRIR Y ESCAPAR DEL CIRCO MALDITO [LISTO]';
        } else {
          escapeBtn.textContent = '🔒 ABRIR REJA DE ESCAPE (BLOQUEADA)';
        }
      }
    }

    // Update Fusebox Modal UI
    if (state.puzzles?.puzzleC) {
      const fuseStatusText = document.getElementById('fusebox-status-text');
      const masterSlot = document.getElementById('master-fuse-slot');
      const fuseLabel = document.getElementById('fuse-slot-label');

      if (state.puzzles.puzzleC.masterFuseInserted) {
        if (masterSlot) masterSlot.classList.add('filled');
        if (fuseLabel) fuseLabel.textContent = 'FUSIBLE MAESTRO COLOCADO';
      } else {
        if (masterSlot) masterSlot.classList.remove('filled');
        if (fuseLabel) fuseLabel.textContent = 'SIN FUSIBLE';
      }

      state.puzzles.puzzleC.breakerStates.forEach((val, i) => {
        const sw = document.getElementById(`breaker-${i}`);
        const valEl = document.getElementById(`val-${i}`);
        if (sw && valEl) {
          if (val) {
            sw.classList.add('on');
            sw.classList.remove('off');
            valEl.textContent = 'ON';
          } else {
            sw.classList.add('off');
            sw.classList.remove('on');
            valEl.textContent = 'OFF';
          }
        }
      });

      if (state.puzzles.puzzleC.powerRestored && fuseStatusText) {
        fuseStatusText.textContent = 'ESTADO: ENERGÍA AUXILIAR ACTIVA (380V)';
        fuseStatusText.classList.add('restored');
      }
    }

    // Update Keypad Modal UI
    if (state.puzzles?.puzzleD) {
      const keypadLed = document.getElementById('keypad-led');
      const keypadDisplayText = document.getElementById('keypad-display-text');
      const keycardReaderStatus = document.getElementById('keycard-reader-status');

      if (keypadLed) {
        state.puzzles.puzzleD.keypadPowered ? keypadLed.classList.add('powered') : keypadLed.classList.remove('powered');
      }

      if (keycardReaderStatus) {
        if (state.puzzles.puzzleD.keycardSwiped) {
          keycardReaderStatus.textContent = 'RANURA DE TARJETA: VALIDADA ✓';
          keycardReaderStatus.style.color = '#00e676';
        } else {
          keycardReaderStatus.textContent = state.puzzles.puzzleC?.powerRestored
            ? 'RANURA DE TARJETA: ESPERANDO DESLIZAMIENTO'
            : 'RANURA DE TARJETA: INACTIVA (SIN ENERGÍA)';
          keycardReaderStatus.style.color = '#8b9bb4';
        }
      }

      if (keypadDisplayText) {
        keypadDisplayText.textContent = state.puzzles.puzzleD.keypadDisplay || '------';
        if (state.puzzles.puzzleD.vaultLockDisengaged) {
          keypadDisplayText.textContent = 'ABIERTO';
          keypadDisplayText.style.color = '#00e676';
        }
      }
    }

    // Update Phase Badge
    const phaseText = document.getElementById('hud-phase-text');
    if (phaseText) {
      if (state.mapTheme === 'circus') {
        phaseText.textContent = '🎪 CIRCO MALDITO';
        phaseText.parentElement.style.borderColor = '#ff1744';
        phaseText.parentElement.style.color = '#ff1744';
      } else if (state.puzzles?.puzzleD?.vaultDoorOpen || state.environment?.room2Unlocked) {
        phaseText.textContent = 'FASE 2: NÚCLEO CUÁNTICO';
        phaseText.parentElement.style.borderColor = '#00e676';
        phaseText.parentElement.style.color = '#00e676';
      } else {
        phaseText.textContent = 'FASE 1: BÓVEDA';
        phaseText.parentElement.style.borderColor = 'var(--cyan-accent)';
        phaseText.parentElement.style.color = 'var(--cyan-accent)';
      }
    }

    // Update Synergy Value
    const synergyEl = document.getElementById('hud-synergy-val');
    if (synergyEl && state.synergy) {
      synergyEl.textContent = `${state.synergy.score}%`;
    }

    // Room 2: Tuner Alfa UI
    if (state.puzzles?.puzzleE) {
      const alfaValEl = document.getElementById('freq-val-alfa');
      const alfaStatusEl = document.getElementById('freq-status-alfa');
      if (alfaValEl && !document.querySelector('#modal-terminal-alfa:not(.hidden)')) {
        this.freqAlfa = state.puzzles.puzzleE.terminalAlfaFreq || 0;
        alfaValEl.textContent = String(this.freqAlfa).padStart(3, '0');
      }
      if (alfaStatusEl) {
        if (state.puzzles.puzzleE.terminalAlfaFreq === state.puzzles.puzzleE.targetAlfaFreq) {
          alfaStatusEl.textContent = 'ESTADO: ✓ RESONANCIA ALFA SINCRONIZADA';
          alfaStatusEl.classList.add('aligned');
        } else {
          alfaStatusEl.textContent = 'ESTADO: DESALINEADO';
          alfaStatusEl.classList.remove('aligned');
        }
      }

      // Tuner Bravo UI
      const bravoValEl = document.getElementById('freq-val-bravo');
      const bravoStatusEl = document.getElementById('freq-status-bravo');
      if (bravoValEl && !document.querySelector('#modal-terminal-bravo:not(.hidden)')) {
        this.freqBravo = state.puzzles.puzzleE.terminalBravoFreq || 0;
        bravoValEl.textContent = String(this.freqBravo).padStart(3, '0');
      }
      if (bravoStatusEl) {
        if (state.puzzles.puzzleE.terminalBravoFreq === state.puzzles.puzzleE.targetBravoFreq) {
          bravoStatusEl.textContent = 'ESTADO: ✓ RESONANCIA BRAVO SINCRONIZADA';
          bravoStatusEl.classList.add('aligned');
        } else {
          bravoStatusEl.textContent = 'ESTADO: DESALINEADO';
          bravoStatusEl.classList.remove('aligned');
        }
      }

      // Room 2: Laser Grid Core Status
      const coreStatusEl = document.getElementById('core-status-display');
      if (coreStatusEl) {
        if (state.puzzles.puzzleE.coreHarmonized) {
          coreStatusEl.textContent = 'ESTADO DEL NÚCLEO: ✓ ARMONIZADO (432Hz + 528Hz | CLAVE: 960)';
          coreStatusEl.classList.add('harmonized');
        } else {
          coreStatusEl.textContent = 'ESTADO DEL NÚCLEO: ESPERANDO SINCRONIZACIÓN DE FRECUENCIAS';
          coreStatusEl.classList.remove('harmonized');
        }
      }
    }

    // Room 2: Laser Grid UI
    if (state.puzzles?.puzzleF) {
      const laserLed = document.getElementById('laser-led');
      const laserDisplay = document.getElementById('laser-display-text');
      if (state.puzzles.puzzleF.laserGridDisabled) {
        if (laserDisplay) laserDisplay.textContent = 'DESACTIVADO';
        if (laserLed) {
          laserLed.style.background = '#00e676';
          laserLed.style.boxShadow = '0 0 12px #00e676';
        }
      }
    }

    // Check Victory
    if (state.status === 'ESCAPED') {
      const victoryModal = document.getElementById('victory-modal');
      const timeEl = document.getElementById('victory-time');
      const synergyEl = document.getElementById('victory-synergy');
      const mins = Math.floor((state.escapeTimeSeconds || 0) / 60);
      const secs = (state.escapeTimeSeconds || 0) % 60;
      if (timeEl) timeEl.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
      if (synergyEl && state.synergy) {
        synergyEl.textContent = `💖 ${state.synergy.score}% (${state.synergy.score >= 120 ? 'MÁXIMA COMPLICIDAD' : 'EXCELENTE'})`;
      }
      const victorySub = victoryModal?.querySelector('.victory-sub');
      const roomsStat = victoryModal?.querySelector('.stat-val.text-success');
      if (state.mapTheme === 'circus') {
        if (victorySub) victorySub.textContent = 'Lograron abrir la reja de las fieras y escapar del Circo Maldito antes de que el payaso despertara.';
        if (roomsStat) roomsStat.textContent = '1 / 1 (100%)';
      } else {
        if (victorySub) victorySub.textContent = 'Ambos robots han superado la Bóveda de Banco y la Cámara del Núcleo Cuántico trabajando en equipo.';
        if (roomsStat) roomsStat.textContent = '2 / 2 (100%)';
      }
      if (victoryModal) victoryModal.classList.remove('hidden');
      this.controls.unlock();
    }

    // Dynamic Mission Objectives Update
    this.updateMissionObjectiveUI(state);
  }

  updateMissionObjectiveUI(state) {
    const descEl = document.getElementById('hud-mission-desc');
    if (!descEl || !state) return;

    if (state.mapTheme === 'circus') {
      const cinv = state.circusInventory || {};
      const cpuz = state.circusPuzzles || {};

      if (!cinv.circusKnife?.collected) {
        descEl.innerHTML = '🎪 <strong>Carpa del Terror:</strong> Explora la carpa e investiga los rincones en busca de pistas y herramientas.';
      } else if (!cpuz.balloonPopped) {
        descEl.innerHTML = '🎈 <strong>Anomalía Flotante:</strong> Algo cuelga en el centro de la carpa; investiga cómo alcanzarlo.';
      } else if (!getJackboxState(state).hasCrank) {
        descEl.innerHTML = '⚙️ <strong>Restos del Espectáculo:</strong> Inspecciona el suelo donde cayó el objeto desprendido.';
      } else if (!cpuz.animatronicActive) {
        descEl.innerHTML = '🎪 <strong>El Espectáculo:</strong> Investiga los carteles y los mecanismos del circo.';
      } else if (!getJackboxState(state).open) {
        descEl.innerHTML = '🎁 <strong>Caja de Sorpresas:</strong> Acopla las piezas recuperadas y deduce la combinación del bufón.';
      } else if (!cinv.tamerKey?.collected) {
        descEl.innerHTML = '🗝️ <strong>Herramientas de Escape:</strong> Inspecciona el interior de la caja de sorpresas.';
      } else if (!cpuz.cageGateOpen) {
        descEl.innerHTML = '🚪 <strong>Vía de Salida:</strong> Utiliza los mecanismos recuperados para abrir la reja de las fieras.';
      } else {
        descEl.innerHTML = '🏆 <strong>¡MISIÓN COMPLETADA!</strong> ¡Han logrado escapar del circo con vida!';
      }
    } else {
      const inv = state.inventory || {};
      const p = state.puzzles || {};

      if (!inv.uv_flashlight?.collected) {
        descEl.innerHTML = '🔍 <strong>Antecámara Blindada:</strong> Inspecciona los compartimentos del puesto de guardia.';
      } else if (!p.puzzleA?.secretRevealed) {
        descEl.innerHTML = '🔦 <strong>Rastreo Forense:</strong> Hay mensajes invisibles a simple vista. Busca anomalías en los muros con la linterna UV.';
      } else if (!p.puzzleB?.safe104Unlocked) {
        descEl.innerHTML = '📁 <strong>Archivo Confidencial:</strong> Cruza los expedientes de clientes con los casilleros para deducir la combinación.';
      } else if (!inv.master_fuse?.collected) {
        descEl.innerHTML = '⚡ <strong>Componentes de Seguridad:</strong> Recupera los suministros que custodiaba la caja fuerte abierta.';
      } else if (!p.puzzleC?.powerRestored) {
        descEl.innerHTML = '🔧 <strong>Red Eléctrica:</strong> Consulta el manual técnico y calibra los disyuntores del panel eléctrico.';
      } else if (!p.puzzleD?.keycardSwiped) {
        descEl.innerHTML = '💳 <strong>Acceso Ejecutivo:</strong> Autentica las credenciales en la ranura de la gran compuerta blindada.';
      } else if (!p.puzzleD?.vaultDoorOpen) {
        descEl.innerHTML = '🔢 <strong>Cerrojos Omega:</strong> Resuelve la ecuación aritmética oculta e introduce la clave en el teclado.';
      } else if (!p.puzzleE?.coreHarmonized) {
        descEl.innerHTML = '🌀 <strong>Cámara del Núcleo:</strong> Sincroniza las frecuencias armónicas en las consolas cuánticas.';
      } else if (!p.puzzleF?.laserGridDisabled) {
        descEl.innerHTML = '🚨 <strong>Perímetro Láser:</strong> Desactiva la barrera ingresando la clave armónica resultante en la consola.';
      } else if (!p.puzzleG?.airlockUnlocked) {
        descEl.innerHTML = '🚀 <strong>Extracción Final:</strong> Inicia la secuencia de evacuación en la plataforma de la esclusa.';
      } else {
        descEl.innerHTML = '🏆 <strong>¡MISIÓN CUMPLIDA!</strong> La bóveda y el núcleo han sido dominados.';
      }
    }
  }

  // Support up to 4 squad members cleanly
  updatePartnerStatus(state) {
    if (!state || !state.players) return;
    const players = Object.values(state.players);

    // Active remote players (excluding self)
    const remotePlayers = players.filter(p => p.id !== this.localPlayerId);
    const activeRemoteIds = new Set(remotePlayers.map(p => p.id));

    // Remove any avatars in 3D scene that are not actively connected
    for (const remoteId of Array.from(this.scene.remotePlayers.keys())) {
      if (!activeRemoteIds.has(remoteId)) {
        this.scene.removeRemotePlayer(remoteId);
      }
    }

    const squadRoster = document.getElementById('hud-squad-roster');
    const synergyBadge = document.getElementById('hud-synergy-badge');
    const greetBtn = document.getElementById('btn-quick-greet');

    // IF SOLO (no other players connected):
    // Hide squad roster pills, synergy badge, and greet button completely!
    if (remotePlayers.length === 0) {
      if (squadRoster) squadRoster.classList.add('hidden');
      if (synergyBadge) synergyBadge.classList.add('hidden');
      if (greetBtn) greetBtn.classList.add('hidden');
      if (this.scene.remotePlayers.size > 0) {
        this.scene.removeRemotePlayer(); // Clears all
      }
      return;
    }

    // MULTIPLAYER MODE (at least 2 players connected):
    if (squadRoster) squadRoster.classList.remove('hidden');
    if (synergyBadge) synergyBadge.classList.remove('hidden');
    if (greetBtn) greetBtn.classList.remove('hidden');

    [1, 2, 3, 4].forEach(slotNum => {
      const pill = document.getElementById(`pill-slot-${slotNum}`);
      const nameEl = document.getElementById(`name-slot-${slotNum}`);
      if (!pill || !nameEl) return;

      const playerInSlot = players.find(p => p.slot === slotNum);
      const slotLabels = ['', 'Alfa', 'Bravo', 'Charlie', 'Delta'];
      const slotLabel = slotLabels[slotNum] || `Agente ${slotNum}`;

      if (playerInSlot) {
        if (playerInSlot.id === this.localPlayerId) {
          pill.classList.remove('hidden', 'waiting');
          pill.classList.add('connected', 'self');
          nameEl.textContent = `${slotLabel} (Tú: ${playerInSlot.name})`;
        } else {
          pill.classList.remove('hidden', 'waiting', 'self');
          pill.classList.add('connected');
          nameEl.textContent = `${slotLabel}: ${playerInSlot.name}`;

          // Ensure 3D avatar exists only for this valid remote player
          if (!this.scene.remotePlayers.has(playerInSlot.id)) {
            this.scene.createRemotePlayerAvatar(playerInSlot.id, playerInSlot.slot, playerInSlot.name, playerInSlot.color);
          }
        }
      } else {
        // If no one is connected in this slot, completely hide the pill
        pill.classList.add('hidden');
        pill.classList.remove('connected', 'self', 'waiting');
      }
    });
  }

  updateInventoryUI(state) {
    if (!state) return;

    if (state.mapTheme === 'circus') {
      const inv = state.circusInventory || {};
      // Slot 1: Circus Knife
      const slot1 = document.getElementById('slot-1');
      if (slot1) {
        if (inv.circusKnife?.collected) {
          slot1.className = 'slot-item has-item';
          slot1.querySelector('.slot-content').innerHTML = `
            <span class="slot-icon">🔪</span>
            <span class="item-name">Cuchillo Circo</span>
          `;
        } else {
          slot1.className = 'slot-item empty';
          slot1.querySelector('.slot-content').innerHTML = `<span class="item-name">Vacío</span>`;
        }
      }

      // Slot 2: Circus Crank
      const slot2 = document.getElementById('slot-2');
      if (slot2) {
        if (getJackboxState(state).hasCrank) {
          slot2.className = 'slot-item has-item';
          slot2.querySelector('.slot-content').innerHTML = `
            <span class="slot-icon">⚙️</span>
            <span class="item-name">${getJackboxState(state).crankInserted ? 'Manivela (Puesta)' : 'Manivela Dorada'}</span>
          `;
        } else {
          slot2.className = 'slot-item empty';
          slot2.querySelector('.slot-content').innerHTML = `<span class="item-name">Vacío</span>`;
        }
      }

      // Slot 3: Tamer Key & Cage Lever
      const slot3 = document.getElementById('slot-3');
      if (slot3) {
        if (inv.tamerKey?.collected || inv.cageLever?.collected) {
          slot3.className = 'slot-item has-item';
          slot3.querySelector('.slot-content').innerHTML = `
            <span class="slot-icon">🗝️</span>
            <span class="item-name">${inv.tamerKey?.collected ? 'Llave Domador' : 'Palanca Jaula'}</span>
          `;
        } else {
          slot3.className = 'slot-item empty';
          slot3.querySelector('.slot-content').innerHTML = `<span class="item-name">Vacío</span>`;
        }
      }
      return;
    }

    // Vault Theme Inventory
    const inventory = state.inventory;
    if (!inventory) return;

    // Slot 1: UV Flashlight
    const slot1 = document.getElementById('slot-1');
    if (slot1) {
      if (inventory.uv_flashlight?.collected) {
        slot1.className = 'slot-item has-item';
        slot1.querySelector('.slot-content').innerHTML = `
          <span class="slot-icon">🔦</span>
          <span class="item-name">Linterna UV [F]</span>
        `;
      } else {
        slot1.className = 'slot-item empty';
        slot1.querySelector('.slot-content').innerHTML = `<span class="item-name">Vacío</span>`;
      }
    }

    // Slot 2: Master Fuse
    const slot2 = document.getElementById('slot-2');
    if (slot2) {
      if (inventory.master_fuse?.collected) {
        slot2.className = 'slot-item has-item';
        slot2.querySelector('.slot-content').innerHTML = `
          <span class="slot-icon">⚡</span>
          <span class="item-name">${inventory.master_fuse.placed ? 'Fusible (Puesto)' : 'Fusible Maestro'}</span>
        `;
      } else {
        slot2.className = 'slot-item empty';
        slot2.querySelector('.slot-content').innerHTML = `<span class="item-name">Vacío</span>`;
      }
    }

    // Slot 3: Security Keycard
    const slot3 = document.getElementById('slot-3');
    if (slot3) {
      if (inventory.security_keycard?.collected) {
        slot3.className = 'slot-item has-item';
        slot3.querySelector('.slot-content').innerHTML = `
          <span class="slot-icon">💳</span>
          <span class="item-name">${inventory.security_keycard.inserted ? 'Tarjeta (Usada)' : 'Tarjeta Acceso'}</span>
        `;
      } else {
        slot3.className = 'slot-item empty';
        slot3.querySelector('.slot-content').innerHTML = `<span class="item-name">Vacío</span>`;
      }
    }
  }

  onPartnerJoined(partner) {
    if (!partner || partner.id === this.localPlayerId) return;
    sound.playSFX('item_pickup');
    if (!this.scene.remotePlayers.has(partner.id)) {
      this.scene.createRemotePlayerAvatar(partner.id, partner.slot, partner.name, partner.color);
    }
  }

  onPartnerLeft(id, name) {
    this.scene.removeRemotePlayer(id);
    this.addLogToTerminal({ sender: 'RED', text: `${name} abandonó la sesión.`, type: 'alert' });
  }

  addLogToTerminal(log) {
    const logsContainer = document.getElementById('terminal-logs');
    if (!logsContainer) return;

    const logEl = document.createElement('div');
    logEl.className = `log-entry ${log.type || 'info'}`;
    logEl.innerHTML = `
      <span class="log-sender">[${log.sender}]:</span>
      <span class="log-text">${log.text}</span>
    `;

    logsContainer.appendChild(logEl);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    const startTime = Date.now();
    const timerEl = document.getElementById('hud-timer');

    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      timerEl.textContent = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }, 1000);
  }

  handleNetworkError(err) {
    console.error('[App] Error de red:', err);
  }

  loop(currentTime) {
    requestAnimationFrame(this.loop);

    const delta = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    const isVaultDoorOpen = this.gameState?.mapTheme === 'circus'
      ? (this.gameState?.circusPuzzles?.cageGateOpen || this.gameState?.circusPuzzles?.cageUnlocked || false)
      : (this.gameState?.puzzles?.puzzleD?.vaultDoorOpen || false);
    const isLaserDisabled = this.gameState?.mapTheme === 'circus'
      ? true
      : (this.gameState?.puzzles?.puzzleF?.laserGridDisabled || false);

    // Update Controls & Physics
    this.controls.update(delta, isVaultDoorOpen, isLaserDisabled);

    // Send position/yaw to partner
    if (this.network.isConnected) {
      this.network.sendPlayerMove(
        this.controls.getTransform(),
        this.isUvActive,
        this.activeInventoryItem
      );
    }

    // Check if UV spotlight reveals framed banknote secret
    const isLit = this.scene.checkUvBanknoteProximity(this.isUvActive);
    if (isLit && !this.gameState?.puzzles.puzzleA.secretRevealed) {
      this.network.sendAction('REVEAL_BILL_UV');
    }

    // Update Compass Ribbon UI
    this.updateCompassUI();

    // Render Scene
    this.scene.render();
  }
  updateCompassUI() {
    const degEl = document.getElementById('compass-deg');
    const cardEl = document.getElementById('compass-cardinal');
    if (!degEl || !cardEl || !this.controls) return;

    const yawRad = this.controls.currentYaw || 0;
    const deg = Math.round(((-yawRad * 180 / Math.PI) % 360 + 360) % 360);
    degEl.textContent = `${String(deg).padStart(3, '0')}°`;

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

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new EscapeGame();
});
