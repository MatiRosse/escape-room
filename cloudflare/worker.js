// Cloudflare Worker + Durable Objects for Escape Room 3D Co-op
import { getJackboxState, insertJackCrank } from '../shared/jackbox.js';

function createInitialState(roomId, mapTheme = 'vault') {
  const isCircus = mapTheme === 'circus';
  return {
    roomId,
    mapTheme: isCircus ? 'circus' : 'vault',
    createdAt: Date.now(),
    status: 'WAITING_FOR_PLAYERS',
    startTime: null,
    escapeTimeSeconds: null,
    players: {},
    inventory: {
      uv_flashlight: { collected: false, holder: null },
      master_fuse: { collected: false, holder: null, placed: false },
      security_keycard: { collected: false, holder: null, inserted: false }
    },
    puzzles: {
      puzzleA: {
        deskDrawerOpen: false,
        uvFlashlightFound: false,
        framedBillIlluminated: false,
        secretRevealed: false,
        billSerialNumber: 'SN-849204',
        clueEquation: '(84 + 92) * 27 + 73 = 4829'
      },
      puzzleB: {
        archiveFolderInspected: false,
        targetClient: 'Viktor Vance',
        targetDateCode: '1407',
        safe104Unlocked: false,
        safe104DoorOpen: false,
        safeDialDigits: ['0', '0', '0', '0']
      },
      puzzleC: {
        guardManualInspected: false,
        fusePanelDoorOpen: false,
        masterFuseInserted: false,
        breakerStates: [false, false, false, false],
        breakerTargetPattern: [true, false, true, true],
        powerRestored: false
      },
      puzzleD: {
        keycardSwiped: false,
        keypadPowered: false,
        keypadDisplay: '',
        correctVaultCode: '4829',
        vaultLockDisengaged: false,
        vaultWheelTurnProgress: 0,
        vaultDoorOpen: false
      },
      puzzleE: {
        tabletInspected: false,
        terminalAlfaFreq: 0,
        terminalBravoFreq: 0,
        targetAlfaFreq: 432,
        targetBravoFreq: 528,
        coreHarmonized: false
      },
      puzzleF: {
        laserCodeEntered: '',
        correctLaserCode: '960',
        laserGridDisabled: false
      },
      puzzleG: {
        airlockUnlocked: false,
        launchActivated: false
      }
    },
    circusPuzzles: {
      dartCollected: false,
      knifeCollected: false,
      balloonPopped: false,
      crankCollected: false,
      animatronicActive: false,
      animatronicQuoteRevealed: false,
      targetClownCode: '7341',
      jackCrankInserted: false,
      crankInserted: false,
      jackBoxUnlocked: false,
      jackSpringPopped: false,
      jackPopped: false,
      tamerKeyCollected: false,
      cageLeverCollected: false,
      tamerKeyInserted: false,
      cageLeverPulled: false,
      cageGateOpen: false,
      cageUnlocked: false
    },
    circusInventory: {
      circus_dart: { collected: false, holder: null },
      circus_knife: { collected: false, holder: null },
      circusKnife: { collected: false, holder: null },
      jack_crank: { collected: false, holder: null, inserted: false },
      jackCrank: { collected: false, holder: null, inserted: false },
      circusCrank: { collected: false, holder: null, inserted: false },
      tamer_key: { collected: false, holder: null, inserted: false },
      tamerKey: { collected: false, holder: null, inserted: false },
      cage_lever: { collected: false, holder: null, pulled: false },
      cageLever: { collected: false, holder: null, pulled: false }
    },
    synergy: {
      score: 100,
      lastGreetTime: 0,
      lastGreetPlayer: null,
      comboActive: false
    },
    environment: {
      emergencyLightsActive: true,
      mainLightsActive: false,
      ambientLightIntensity: 0.85,
      room2Unlocked: false
    },
    activityLog: [
      {
        id: 'init-1',
        timestamp: Date.now(),
        sender: 'SISTEMA',
        text: isCircus
          ? '🎪 ¡Bienvenidos al Circo Maldito! Escapen antes de que despierte el payaso...'
          : 'Protocolo de Contención Bóveda Omega & Núcleo Cuántico iniciado.',
        type: 'alert'
      }
    ]
  };
}

import { DurableObject } from "cloudflare:workers";

export class EscapeRoomDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sessions = new Map(); // ws -> playerInfo
    this.gameState = createInitialState("boveda-1");
  }

  async fetch(request) {
    const url = new URL(request.url);
    const upgradeHeader = (request.headers.get("Upgrade") || "").toLowerCase();

    // If HTTP call (like /api/reset), reinitialize room state from 0
    if (upgradeHeader !== "websocket") {
      const theme = url.searchParams.get("theme") || "vault";
      this.sessions.clear();
      this.gameState = createInitialState(this.gameState.roomId || "boveda-1", theme);
      return new Response(JSON.stringify({
        status: "reset_ok",
        message: "Misión reiniciada desde cero exitosamente.",
        state: this.gameState
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    const themeFromQuery = url.searchParams.get("theme");
    if (themeFromQuery && this.sessions.size === 0) {
      this.gameState = createInitialState(url.searchParams.get("room") || this.gameState.roomId || "boveda-1", themeFromQuery);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    this.handleSession(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(messageObj, excludeWs = null) {
    const jsonStr = JSON.stringify(messageObj);
    for (const [ws] of this.sessions.entries()) {
      if (ws !== excludeWs) {
        try {
          ws.send(jsonStr);
        } catch (e) {
          this.sessions.delete(ws);
        }
      }
    }
  }

  addLog(sender, text, type = 'info') {
    const logItem = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      sender,
      text,
      type
    };
    this.gameState.activityLog.push(logItem);
    if (this.gameState.activityLog.length > 30) {
      this.gameState.activityLog.shift();
    }
    this.broadcast({ type: 'NEW_LOG', log: logItem });
  }

  handleSession(ws) {
    let playerId = null;

    ws.addEventListener('message', async (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'JOIN_ROOM': {
            const now = Date.now();
            const incomingClientId = msg.clientId || null;

            // Clean up stale, disconnected, unverified, or duplicate client sockets
            for (const [activeWs, pInfo] of Array.from(this.sessions.entries())) {
              const isDeadSocket = activeWs.readyState !== 1;
              const hasNoTimestamp = !pInfo || typeof pInfo.lastActive !== 'number';
              const isStale = pInfo && (now - pInfo.lastActive > 4000);
              const isSameClient = incomingClientId && pInfo && pInfo.clientId === incomingClientId;

              if (isDeadSocket || hasNoTimestamp || isStale || isSameClient) {
                try { activeWs.close(1000, "Sesión reemplazada o inactiva"); } catch (e) {}
                this.sessions.delete(activeWs);
                if (pInfo && pInfo.id) {
                  delete this.gameState.players[pInfo.id];
                }
              }
            }

            // CRITICAL: If no one else is currently active in this room, or if requested by client,
            // ALWAYS reset the game state completely to 0!
            if (this.sessions.size === 0 || msg.forceReset) {
              this.gameState = createInitialState(this.gameState.roomId, msg.mapTheme || 'vault');
              this.gameState.players = {};
            } else {
              // Reconcile gameState.players strictly with active sessions
              const validPlayers = {};
              for (const p of this.sessions.values()) {
                if (p && p.id) validPlayers[p.id] = p;
              }
              this.gameState.players = validPlayers;
            }

            if (this.sessions.size >= 4) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'ROOM_FULL',
                message: 'La sala ya cuenta con el máximo de 4 agentes conectados.'
              }));
              return;
            }

            const existingSlots = Array.from(this.sessions.values()).map(p => p.slot);
            let assignedSlot = 1;
            for (let s = 1; s <= 4; s++) {
              if (!existingSlots.includes(s)) {
                assignedSlot = s;
                break;
              }
            }

            const isCircus = (msg.mapTheme || this.gameState.mapTheme) === 'circus';
            const slotConfigs = isCircus ? {
              1: { name: 'Víctima Alfa', color: '#ff1744', spawn: { x: 0, y: 1.6, z: 3.5 } },
              2: { name: 'Víctima Bravo', color: '#ffd600', spawn: { x: 2.2, y: 1.6, z: 2.0 } },
              3: { name: 'Víctima Charlie', color: '#00e5ff', spawn: { x: -2.2, y: 1.6, z: 2.0 } },
              4: { name: 'Víctima Delta', color: '#76ff03', spawn: { x: 0, y: 1.6, z: -2.5 } }
            } : {
              1: { name: 'Agente Alfa', color: '#00e5ff', spawn: { x: -2.0, y: 1.6, z: 3.5 } },
              2: { name: 'Agente Bravo', color: '#ff9100', spawn: { x: 2.0, y: 1.6, z: 3.5 } },
              3: { name: 'Agente Charlie', color: '#d500f9', spawn: { x: -0.8, y: 1.6, z: 4.1 } },
              4: { name: 'Agente Delta', color: '#00e676', spawn: { x: 0.8, y: 1.6, z: 4.1 } }
            };

            const config = slotConfigs[assignedSlot] || slotConfigs[1];
            playerId = 'agent-' + assignedSlot + '-' + Math.random().toString(36).substr(2, 6);

            const playerInfo = {
              id: playerId,
              clientId: incomingClientId,
              slot: assignedSlot,
              name: msg.name || config.name,
              color: config.color,
              position: config.spawn,
              rotation: { yaw: 0, pitch: 0 },
              holdingItem: null,
              isUvActive: false,
              lastActive: now,
              ping: 0
            };

            this.sessions.set(ws, playerInfo);
            this.gameState.players[playerId] = playerInfo;

            if (this.gameState.status === 'WAITING_FOR_PLAYERS') {
              this.gameState.status = 'IN_PROGRESS';
              this.gameState.startTime = Date.now();
              this.addLog('SISTEMA', `${playerInfo.name} ha iniciado la misión. (${this.sessions.size}/4 agentes).`, 'success');
            } else {
              this.addLog('SISTEMA', `${playerInfo.name} ha entrado a la sala. (${this.sessions.size}/4 agentes).`, 'info');
            }

            ws.send(JSON.stringify({
              type: 'INIT_STATE',
              yourId: playerId,
              yourSlot: assignedSlot,
              state: this.gameState
            }));

            this.broadcast({
              type: 'PLAYER_JOINED',
              player: playerInfo,
              roomStatus: this.gameState.status
            }, ws);
            break;
          }

          case 'PLAYER_MOVE': {
            if (!playerId) return;
            const player = this.gameState.players[playerId];
            if (!player) return;
            player.lastActive = Date.now();
            player.position = msg.position;
            player.rotation = msg.rotation;
            if (msg.holdingItem !== undefined) player.holdingItem = msg.holdingItem;
            if (msg.isUvActive !== undefined) player.isUvActive = msg.isUvActive;

            this.broadcast({
              type: 'PLAYER_MOVED',
              id: playerId,
              position: player.position,
              rotation: player.rotation,
              isUvActive: player.isUvActive,
              holdingItem: player.holdingItem
            }, ws);
            break;
          }

          case 'GAME_ACTION': {
            if (playerId && this.gameState.players[playerId]) {
              this.gameState.players[playerId].lastActive = Date.now();
            }
            this.handleAction(playerId, msg.action, msg.payload, ws);
            break;
          }

          case 'PING': {
            if (playerId && this.gameState.players[playerId]) {
              this.gameState.players[playerId].lastActive = Date.now();
            }
            ws.send(JSON.stringify({ type: 'PONG', timestamp: msg.timestamp }));
            break;
          }
        }
      } catch (err) {
        console.error('[DO] Error procesando mensaje:', err);
      }
    });

    const handleClose = () => {
      this.sessions.delete(ws);
      if (playerId) {
        const player = this.gameState.players[playerId];
        const pName = player ? player.name : 'Agente';
        delete this.gameState.players[playerId];
        this.addLog('SISTEMA', `${pName} se ha desconectado.`, 'alert');
        this.broadcast({ type: 'PLAYER_LEFT', id: playerId, name: pName });
        playerId = null;
      }
      if (this.sessions.size === 0) {
        this.gameState.players = {};
      }
    };

    ws.addEventListener('close', handleClose);
    ws.addEventListener('error', handleClose);
  }

  handleAction(playerId, action, payload, ws) {
    const state = this.gameState;
    const player = state.players[playerId];
    const playerName = player ? player.name : 'Agente';
    let stateModified = false;
    let sfxTrigger = null;

    switch (action) {
      case 'RESET_ROOM': {
        const theme = payload?.mapTheme || state.mapTheme || 'vault';
        const currentPlayers = { ...this.gameState.players };
        this.gameState = createInitialState(this.gameState.roomId, theme);
        this.gameState.players = currentPlayers;
        this.gameState.status = 'IN_PROGRESS';
        this.gameState.startTime = Date.now();
        this.addLog('SISTEMA', `🔄 Misión reiniciada desde cero por ${playerName}.`, 'alert');
        this.broadcast({ type: 'STATE_UPDATE', state: this.gameState, sfx: 'power_surge_on' });
        return;
      }

      case 'TOGGLE_DRAWER':
        state.puzzles.puzzleA.deskDrawerOpen = !state.puzzles.puzzleA.deskDrawerOpen;
        stateModified = true;
        sfxTrigger = state.puzzles.puzzleA.deskDrawerOpen ? 'drawer_open' : 'drawer_close';
        this.addLog(playerName, `${state.puzzles.puzzleA.deskDrawerOpen ? 'Abrió' : 'Cerró'} el cajón.`);
        break;

      case 'TAKE_UV_FLASHLIGHT':
        if (!state.inventory.uv_flashlight.collected && state.puzzles.puzzleA.deskDrawerOpen) {
          state.inventory.uv_flashlight.collected = true;
          state.inventory.uv_flashlight.holder = playerId;
          state.puzzles.puzzleA.uvFlashlightFound = true;
          player.holdingItem = 'uv_flashlight';
          stateModified = true;
          sfxTrigger = 'item_pickup';
          this.addLog(playerName, 'Encontró y equipó la Linterna UV.', 'action');
        }
        break;

      case 'TOGGLE_UV_LIGHT':
        player.isUvActive = !player.isUvActive;
        sfxTrigger = 'switch_click';
        this.broadcast({ type: 'UV_TOGGLED', playerId, isUvActive: player.isUvActive });
        break;

      case 'REVEAL_BILL_UV':
        if (!state.puzzles.puzzleA.secretRevealed) {
          state.puzzles.puzzleA.secretRevealed = true;
          state.puzzles.puzzleA.framedBillIlluminated = true;
          stateModified = true;
          sfxTrigger = 'clue_revealed';
          this.addLog(playerName, '¡Reveló la ecuación oculta en el billete!', 'success');
        }
        break;

      case 'INSPECT_ARCHIVE':
        state.puzzles.puzzleB.archiveFolderInspected = true;
        sfxTrigger = 'paper_rustle';
        break;

      case 'SUBMIT_SAFE_CODE': {
        const inputCode = String(payload.code || '').trim();
        if (inputCode === state.puzzles.puzzleB.targetDateCode) {
          state.puzzles.puzzleB.safe104Unlocked = true;
          state.puzzles.puzzleB.safe104DoorOpen = true;
          stateModified = true;
          sfxTrigger = 'safe_unlock';
          this.addLog(playerName, '¡Abrió la caja de seguridad #104 (1407)!', 'success');
        } else {
          sfxTrigger = 'access_denied';
          this.addLog(playerName, `Combinación errónea (${inputCode}) en caja #104.`, 'alert');
        }
        break;
      }

      case 'TOGGLE_SAFE_DOOR':
        if (state.puzzles.puzzleB.safe104Unlocked) {
          state.puzzles.puzzleB.safe104DoorOpen = !state.puzzles.puzzleB.safe104DoorOpen;
          stateModified = true;
          sfxTrigger = state.puzzles.puzzleB.safe104DoorOpen ? 'safe_door_open' : 'safe_door_close';
        }
        break;

      case 'TAKE_MASTER_FUSE':
        if (state.puzzles.puzzleB.safe104DoorOpen && !state.inventory.master_fuse.collected) {
          state.inventory.master_fuse.collected = true;
          state.inventory.master_fuse.holder = playerId;
          stateModified = true;
          sfxTrigger = 'item_pickup';
          this.addLog(playerName, 'Recogió el Fusible Maestro Cerámico.', 'action');
        }
        break;

      case 'TAKE_KEYCARD':
        if (state.puzzles.puzzleB.safe104DoorOpen && !state.inventory.security_keycard.collected) {
          state.inventory.security_keycard.collected = true;
          state.inventory.security_keycard.holder = playerId;
          stateModified = true;
          sfxTrigger = 'item_pickup';
          this.addLog(playerName, 'Recogió la Tarjeta de Seguridad.', 'action');
        }
        break;

      case 'INSERT_MASTER_FUSE':
        if (state.inventory.master_fuse.collected && !state.puzzles.puzzleC.masterFuseInserted) {
          state.puzzles.puzzleC.masterFuseInserted = true;
          state.inventory.master_fuse.placed = true;
          stateModified = true;
          sfxTrigger = 'fuse_insert';
          this.addLog(playerName, 'Colocó el Fusible Maestro.', 'action');
          this.checkPower();
        }
        break;

      case 'TOGGLE_BREAKER': {
        const idx = payload.breakerIndex;
        if (idx >= 0 && idx < 4) {
          state.puzzles.puzzleC.breakerStates[idx] = !state.puzzles.puzzleC.breakerStates[idx];
          stateModified = true;
          sfxTrigger = 'breaker_toggle';
          this.checkPower();
        }
        break;
      }

      case 'SWIPE_KEYCARD':
        if (state.inventory.security_keycard.collected && !state.puzzles.puzzleD.keycardSwiped) {
          if (!state.puzzles.puzzleC.powerRestored) {
            sfxTrigger = 'buzz_no_power';
            this.addLog(playerName, 'El lector no responde (sin energía).', 'alert');
          } else {
            state.puzzles.puzzleD.keycardSwiped = true;
            state.inventory.security_keycard.inserted = true;
            stateModified = true;
            sfxTrigger = 'card_swipe_success';
            this.addLog(playerName, 'Tarjeta de seguridad aceptada.', 'success');
          }
        }
        break;

      case 'KEYPAD_PRESS': {
        if (!state.puzzles.puzzleD.keypadPowered || state.puzzles.puzzleD.vaultLockDisengaged) return;
        const key = payload.key;
        if (key === 'CLEAR') {
          state.puzzles.puzzleD.keypadDisplay = '';
          sfxTrigger = 'beep_clear';
          stateModified = true;
        } else if (key === 'ENTER') {
          if (state.puzzles.puzzleD.keypadDisplay === state.puzzles.puzzleD.correctVaultCode) {
            state.puzzles.puzzleD.vaultLockDisengaged = true;
            stateModified = true;
            sfxTrigger = 'vault_unlocked';
            this.addLog(playerName, '¡CÓDIGO OMEGA CORRECTO! Cerrijos liberados.', 'success');
          } else {
            sfxTrigger = 'access_denied';
            state.puzzles.puzzleD.keypadDisplay = 'ERROR';
            stateModified = true;
          }
        } else if (typeof key === 'string' && key.length === 1 && state.puzzles.puzzleD.keypadDisplay.length < 6) {
          if (state.puzzles.puzzleD.keypadDisplay === 'ERROR') state.puzzles.puzzleD.keypadDisplay = key;
          else state.puzzles.puzzleD.keypadDisplay += key;
          sfxTrigger = 'keypad_beep';
          stateModified = true;
        }
        break;
      }

      case 'TURN_VAULT_WHEEL': {
        if (state.puzzles.puzzleD.vaultLockDisengaged && !state.puzzles.puzzleD.vaultDoorOpen) {
          state.puzzles.puzzleD.vaultWheelTurnProgress = Math.min(1, state.puzzles.puzzleD.vaultWheelTurnProgress + (payload.amount || 0.25));
          sfxTrigger = 'wheel_ratchet';
          stateModified = true;

          if (state.puzzles.puzzleD.vaultWheelTurnProgress >= 0.99) {
            state.puzzles.puzzleD.vaultDoorOpen = true;
            state.environment.room2Unlocked = true;
            sfxTrigger = 'vault_door_open_heavy';
            this.addLog('SISTEMA', '🚨 ¡COMPUERTA DE BÓVEDA ABIERTA! Se ha desvelado la Cámara Secreta del Núcleo Cuántico. ¡Avancen a la Sala 2!', 'success');
          }
        }
        break;
      }

      case 'GREET': {
        const now = Date.now();
        const customText = payload.text || '¡Hola mi amorcito! 👋🤖❤️';
        sfxTrigger = 'robot_wave';

        let isCombo = false;
        if (state.synergy.lastGreetPlayer && state.synergy.lastGreetPlayer !== playerId && (now - state.synergy.lastGreetTime) < 6000) {
          isCombo = true;
          state.synergy.score += 50;
          state.synergy.comboActive = true;
          sfxTrigger = 'couple_synergy';
          this.addLog('💖 SINERGIA', `¡Sincronía amorosa perfecta entre los dos robots! (+50 pts: ${state.synergy.score}%)`, 'success');
        } else {
          state.synergy.lastGreetPlayer = playerId;
          state.synergy.lastGreetTime = now;
          state.synergy.score = Math.min(200, state.synergy.score + 10);
          this.addLog(playerName, `saludó a su compañero: "${customText}"`, 'action');
        }

        this.broadcast({
          type: 'PLAYER_GREETED',
          playerId,
          slot: state.players[playerId]?.slot || 1,
          name: playerName,
          text: customText,
          isCombo
        });

        stateModified = true;
        break;
      }

      case 'INSPECT_ROOM2_TABLET': {
        state.puzzles.puzzleE.tabletInspected = true;
        sfxTrigger = 'paper_rustle';
        stateModified = true;
        break;
      }

      case 'SET_ALFA_FREQ': {
        const freq = parseInt(payload.freq) || 0;
        state.puzzles.puzzleE.terminalAlfaFreq = freq;
        stateModified = true;
        sfxTrigger = 'quantum_tune';
        this.addLog(playerName, `Ajustó Frecuencia Cuántica Alfa a ${freq} Hz.`, 'info');
        this.checkCoreHarmonization();
        break;
      }

      case 'SET_BRAVO_FREQ': {
        const freq = parseInt(payload.freq) || 0;
        state.puzzles.puzzleE.terminalBravoFreq = freq;
        stateModified = true;
        sfxTrigger = 'quantum_tune';
        this.addLog(playerName, `Ajustó Frecuencia Cuántica Bravo a ${freq} Hz.`, 'info');
        this.checkCoreHarmonization();
        break;
      }

      case 'SUBMIT_LASER_CODE': {
        const entered = String(payload.code || '').trim();
        state.puzzles.puzzleF.laserCodeEntered = entered;

        if (entered === state.puzzles.puzzleF.correctLaserCode) {
          if (!state.puzzles.puzzleE.coreHarmonized) {
            sfxTrigger = 'access_denied';
            this.addLog(playerName, 'Código válido, pero el Núcleo Cuántico no está armonizado aún en 432Hz y 528Hz.', 'alert');
          } else {
            state.puzzles.puzzleF.laserGridDisabled = true;
            state.puzzles.puzzleG.airlockUnlocked = true;
            stateModified = true;
            sfxTrigger = 'laser_shutdown';
            this.addLog(playerName, '⚡ ¡BARRERA LÁSER DESACTIVADA! La esclusa de escape está lista.', 'success');
          }
        } else {
          sfxTrigger = 'access_denied';
          this.addLog(playerName, `Código incorrecto (${entered}) en la consola del láser.`, 'alert');
        }
        stateModified = true;
        break;
      }

      case 'ACTIVATE_FINAL_EXTRACTION': {
        if (state.puzzles.puzzleF.laserGridDisabled && !state.puzzles.puzzleG.launchActivated) {
          state.puzzles.puzzleG.airlockUnlocked = true;
          state.puzzles.puzzleG.launchActivated = true;
          state.status = 'ESCAPED';
          state.escapeTimeSeconds = Math.round((Date.now() - (state.startTime || Date.now())) / 1000);
          stateModified = true;
          sfxTrigger = 'elevator_open';
          this.addLog('SISTEMA', `🏆 ¡MISIÓN CUMPLIDA! Tiempo: ${Math.floor(state.escapeTimeSeconds / 60)}m ${state.escapeTimeSeconds % 60}s`, 'success');
        }
        break;
      }

      // -------------------------------------------------------------
      // CIRCO MALDITO (PAYASOS / TERROR) ACCIONES
      // -------------------------------------------------------------
      case 'TAKE_CIRCUS_KNIFE': {
        if (!state.circusInventory.circusKnife?.collected && !state.circusInventory.circus_knife?.collected) {
          state.circusInventory.circus_knife.collected = true;
          state.circusInventory.circus_knife.holder = playerId;
          state.circusInventory.circusKnife.collected = true;
          state.circusInventory.circusKnife.holder = playerId;
          state.circusInventory.circus_dart.collected = true;
          state.circusInventory.circus_dart.holder = playerId;
          state.circusPuzzles.dartCollected = true;
          state.circusPuzzles.knifeCollected = true;
          player.holdingItem = 'circus_knife';
          stateModified = true;
          sfxTrigger = 'item_pickup';
          this.addLog(playerName, 'Recogió la Daga / Cuchillo de Utilería del camerino del circo.', 'action');
        }
        break;
      }

      case 'POP_BALLOON': {
        if (!state.circusPuzzles.balloonPopped) {
          state.circusPuzzles.balloonPopped = true;
          stateModified = true;
          sfxTrigger = 'balloon_pop';
          this.addLog(playerName, '🎈 ¡Reventó el Globo Rojo en el centro de la carpa!', 'alert');
        }
        break;
      }

      case 'TAKE_CRANK': {
        if (state.circusPuzzles.balloonPopped && !state.circusInventory.jack_crank?.collected) {
          state.circusInventory.jack_crank.collected = true;
          state.circusInventory.jack_crank.holder = playerId;
          state.circusInventory.circusCrank.collected = true;
          state.circusInventory.circusCrank.holder = playerId;
          state.circusInventory.jackCrank.collected = true;
          state.circusInventory.jackCrank.holder = playerId;
          state.circusPuzzles.crankCollected = true;
          player.holdingItem = 'jack_crank';
          stateModified = true;
          sfxTrigger = 'item_pickup';
          this.addLog(playerName, 'Recogió una manivela mecánica del pedestal.', 'action');
        }
        break;
      }

      case 'ACTIVATE_ANIMATRONIC': {
        state.circusPuzzles.animatronicActive = true;
        state.circusPuzzles.animatronicQuoteRevealed = true;
        stateModified = true;
        sfxTrigger = 'clown_laugh';
        this.addLog(playerName, '🤡 Activó el Payaso Mecánico Adivino: su risa macabra resuena por toda la carpa...', 'alert');
        break;
      }

      case 'INSERT_JACK_CRANK': {
        if (!getJackboxState(state).crankInserted && insertJackCrank(state)) {
          stateModified = true;
          sfxTrigger = 'switch_click';
          this.addLog(playerName, 'Acopló la manivela al mecanismo lateral de la caja.', 'action');
        }
        break;
      }

      case 'SUBMIT_JACK_CODE': {
        const jackbox = getJackboxState(state);
        if (jackbox.open) break;
        if (!jackbox.hasCrank) {
          sfxTrigger = 'access_denied';
          this.addLog(playerName, 'Falta la manivela en el mecanismo de la caja del bufón.', 'alert');
          break;
        }
        const code = String(payload?.code || '').trim();
        if (code === state.circusPuzzles.targetClownCode) { // '7341'
          insertJackCrank(state);
          state.circusPuzzles.jackBoxUnlocked = true;
          state.circusPuzzles.jackSpringPopped = true;
          state.circusPuzzles.jackPopped = true;
          stateModified = true;
          sfxTrigger = 'jack_spring';
          this.addLog(playerName, '🎪 ¡Combinación correcta! ¡La Caja Sorpresa se abrió de golpe!', 'success');
        } else {
          sfxTrigger = 'access_denied';
          this.addLog(playerName, `Combinación errónea (${code}) en el candado de la caja del bufón.`, 'alert');
        }
        break;
      }

      case 'TAKE_TAMER_KEY': {
        if (getJackboxState(state).open && !state.circusInventory.tamer_key?.collected) {
          state.circusInventory.tamer_key.collected = true;
          state.circusInventory.tamer_key.holder = playerId;
          state.circusInventory.tamerKey.collected = true;
          state.circusInventory.tamerKey.holder = playerId;
          state.circusPuzzles.tamerKeyCollected = true;
          stateModified = true;
          sfxTrigger = 'item_pickup';
          this.addLog(playerName, 'Recogió la Llave Maestra del Domador.', 'action');
        }
        break;
      }

      case 'TAKE_CAGE_LEVER': {
        if (getJackboxState(state).open && !state.circusInventory.cage_lever?.collected) {
          state.circusInventory.cage_lever.collected = true;
          state.circusInventory.cage_lever.holder = playerId;
          state.circusInventory.cageLever.collected = true;
          state.circusInventory.cageLever.holder = playerId;
          state.circusPuzzles.cageLeverCollected = true;
          stateModified = true;
          sfxTrigger = 'item_pickup';
          this.addLog(playerName, 'Recogió la Palanca de Apertura de la Jaula.', 'action');
        }
        break;
      }

      case 'ESCAPE_CIRCUS': {
        const hasKey = state.circusInventory.tamer_key?.collected || state.circusInventory.tamerKey?.collected;
        const hasLever = state.circusInventory.cage_lever?.collected || state.circusInventory.cageLever?.collected;
        if (hasKey && hasLever && !state.circusPuzzles.cageGateOpen) {
          state.circusPuzzles.tamerKeyInserted = true;
          state.circusPuzzles.cageLeverPulled = true;
          state.circusPuzzles.cageGateOpen = true;
          state.circusPuzzles.cageUnlocked = true;
          state.status = 'ESCAPED';
          state.escapeTimeSeconds = Math.round((Date.now() - (state.startTime || Date.now())) / 1000);
          stateModified = true;
          sfxTrigger = 'cage_creak';
          this.addLog('SISTEMA', `🏆 ¡ESCAPARON DEL CIRCO MALDITO! Han abierto la reja de las fieras y burlado al payaso. Tiempo: ${Math.floor(state.escapeTimeSeconds / 60)}m ${state.escapeTimeSeconds % 60}s`, 'success');
        }
        break;
      }

      case 'RESET_GAME': {
        const curPlayers = { ...state.players };
        const activeTheme = this.gameState.mapTheme || 'vault';
        this.gameState = createInitialState(this.gameState.roomId, activeTheme);
        this.gameState.players = curPlayers;
        this.gameState.status = 'IN_PROGRESS';
        this.gameState.startTime = Date.now();
        stateModified = true;
        sfxTrigger = 'reset_chime';
        this.addLog(playerName, 'Ha reiniciado la sala.', 'alert');
        break;
      }
    }

    if (stateModified) {
      this.broadcast({ type: 'STATE_UPDATE', state: this.gameState, sfx: sfxTrigger, triggeredBy: playerName });
    } else if (sfxTrigger) {
      this.broadcast({ type: 'TRIGGER_SFX', sfx: sfxTrigger });
    }
  }

  checkCoreHarmonization() {
    const state = this.gameState;
    const { terminalAlfaFreq, terminalBravoFreq, targetAlfaFreq, targetBravoFreq, coreHarmonized } = state.puzzles.puzzleE;
    if (terminalAlfaFreq === targetAlfaFreq && terminalBravoFreq === targetBravoFreq && !coreHarmonized) {
      state.puzzles.puzzleE.coreHarmonized = true;
      this.addLog('SISTEMA', '🌀 ¡RESONANCIA CUÁNTICA ALCANZADA! El Núcleo está armonizado en 432Hz y 528Hz. Clave armónica: 960.', 'success');
      this.broadcast({ type: 'STATE_UPDATE', state: this.gameState, sfx: 'quantum_unlock' });
    }
  }

  checkPower() {
    const state = this.gameState;
    const { masterFuseInserted, breakerStates, breakerTargetPattern } = state.puzzles.puzzleC;
    const match = breakerStates.every((val, i) => val === breakerTargetPattern[i]);
    if (masterFuseInserted && match && !state.puzzles.puzzleC.powerRestored) {
      state.puzzles.puzzleC.powerRestored = true;
      state.puzzles.puzzleD.keypadPowered = true;
      state.environment.mainLightsActive = true;
      this.addLog('SISTEMA', '⚡ ¡Energía eléctrica auxiliar restaurada!', 'success');
      this.broadcast({ type: 'TRIGGER_SFX', sfx: 'power_surge_on' });
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const upgradeHeader = (request.headers.get("Upgrade") || request.headers.get("upgrade") || "").toLowerCase();

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    // Info / Health endpoint confirming the WebSocket link
    if (url.pathname === "/api/info" || url.pathname === "/ws/info") {
      return new Response(JSON.stringify({
        status: "online",
        websocketUrl: `wss://${url.host}/ws`,
        message: "Escape Room Cloudflare Worker activo con WebSockets y Durable Objects."
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Explicit API endpoint to reset room state back to 0
    if (url.pathname === "/api/reset" || url.pathname === "/ws/reset") {
      const roomId = url.searchParams.get("room") || "boveda-1";
      const id = env.ROOMS.idFromName(roomId);
      const roomObj = env.ROOMS.get(id);
      return roomObj.fetch(request);
    }

    // WebSocket route for multiplayer rooms
    if (upgradeHeader === "websocket" || url.pathname === "/ws" || url.pathname.startsWith("/ws/")) {
      const roomId = url.searchParams.get("room") || "boveda-1";
      const id = env.ROOMS.idFromName(roomId);
      const roomObj = env.ROOMS.get(id);
      return roomObj.fetch(request);
    }

    // Serve static assets from ./dist
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Escape Room Backend Activo.", { status: 200 });
  }
};
