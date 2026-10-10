import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');

const PORT = process.env.PORT || 3001;

// Base initial state template for new rooms
function createInitialState(roomId, mapTheme = 'vault') {
  const isCircus = mapTheme === 'circus';
  return {
    roomId,
    mapTheme: isCircus ? 'circus' : 'vault',
    createdAt: Date.now(),
    status: 'WAITING_FOR_PLAYERS', // 'WAITING_FOR_PLAYERS' | 'IN_PROGRESS' | 'ESCAPED'
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
        targetDateCode: '1407', // 14 de Julio
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
        vaultWheelTurnProgress: 0, // 0 to 1
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
      ambientLightIntensity: 0.35,
      room2Unlocked: false
    },
    activityLog: [
      {
        id: 'init-1',
        timestamp: Date.now(),
        sender: 'SISTEMA',
        text: isCircus
          ? '🎪 ¡Bienvenidos a la Carpa del Circo Maldito! Escapen antes de que el payaso Penny despierte...'
          : 'Protocolo de Contención Bóveda Omega & Núcleo Cuántico iniciado. Esperando agentes...',
        type: 'alert'
      }
    ]
  };
}

// In-memory rooms map
const rooms = new Map();

function getOrCreateRoom(roomId, mapTheme = 'vault') {
  if (!rooms.has(roomId)) {
    console.log(`[ROOM] Creando nueva sala de operaciones: ${roomId} (Mapa: ${mapTheme})`);
    rooms.set(roomId, {
      id: roomId,
      mapTheme,
      state: createInitialState(roomId, mapTheme),
      clients: new Map() // ws -> playerInfo
    });
  }
  return rooms.get(roomId);
}

function broadcastToRoom(room, messageObj, excludeWs = null) {
  const jsonStr = JSON.stringify(messageObj);
  for (const [wsClient] of room.clients.entries()) {
    if (wsClient !== excludeWs && wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(jsonStr);
    }
  }
}

function addLog(room, sender, text, type = 'info') {
  const logItem = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    timestamp: Date.now(),
    sender,
    text,
    type
  };
  room.state.activityLog.push(logItem);
  if (room.state.activityLog.length > 30) {
    room.state.activityLog.shift();
  }
  broadcastToRoom(room, {
    type: 'NEW_LOG',
    log: logItem
  });
}

// MIME types for static serving
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// HTTP server for health checks and static client hosting
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', activeRooms: rooms.size }));
    return;
  }

  // Serve static files from dist if built
  if (fs.existsSync(DIST_DIR)) {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(DIST_DIR, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    } else {
      // Fallback for SPA routing to index.html
      const indexPath = path.join(DIST_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(indexPath).pipe(res);
        return;
      }
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Servidor WebSocket Escape Room Bóveda Banco 3D - Activo. Ejecuta "npm run dev" para el cliente Vite o compila con "npm run build".');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentPlayerId = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(ws, msg);
    } catch (err) {
      console.error('[WS] Error parseando mensaje:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom && currentPlayerId) {
      handleDisconnect(currentRoom, ws, currentPlayerId);
    }
  });

  function handleMessage(clientWs, msg) {
    switch (msg.type) {
      case 'JOIN_ROOM': {
        const reqRoomId = (msg.roomId || 'boveda-central').trim().toLowerCase();
        const mapTheme = msg.mapTheme || 'vault';
        const room = getOrCreateRoom(reqRoomId, mapTheme);

        // Check if room is already full (max 4 players)
        if (room.clients.size >= 4) {
          clientWs.send(JSON.stringify({
            type: 'ERROR',
            code: 'ROOM_FULL',
            message: `La sala "${reqRoomId}" ya tiene el máximo de 4 agentes. Ingresa otro código de sala.`
          }));
          return;
        }

        // Assign lowest available slot (1 to 4)
        const existingSlots = Array.from(room.clients.values()).map(p => p.slot);
        let assignedSlot = 1;
        for (let s = 1; s <= 4; s++) {
          if (!existingSlots.includes(s)) {
            assignedSlot = s;
            break;
          }
        }

        const slotConfigs = {
          1: { name: 'Agente Alfa', color: '#00e5ff', spawn: { x: -2.0, y: 1.6, z: 3.5 } },
          2: { name: 'Agente Bravo', color: '#ff9100', spawn: { x: 2.0, y: 1.6, z: 3.5 } },
          3: { name: 'Agente Charlie', color: '#d500f9', spawn: { x: -0.8, y: 1.6, z: 4.1 } },
          4: { name: 'Agente Delta', color: '#00e676', spawn: { x: 0.8, y: 1.6, z: 4.1 } }
        };

        const config = slotConfigs[assignedSlot] || slotConfigs[1];
        const playerId = 'agent-' + assignedSlot + '-' + Math.random().toString(36).substr(2, 6);

        const playerInfo = {
          id: playerId,
          slot: assignedSlot,
          name: msg.name || config.name,
          color: config.color,
          position: config.spawn,
          rotation: { yaw: 0, pitch: 0 },
          holdingItem: null,
          isUvActive: false,
          ping: 0
        };

        currentRoom = room;
        currentPlayerId = playerId;
        room.clients.set(clientWs, playerInfo);
        room.state.players[playerId] = playerInfo;

        if (room.state.status === 'WAITING_FOR_PLAYERS') {
          room.state.status = 'IN_PROGRESS';
          room.state.startTime = Date.now();
          addLog(room, 'SISTEMA', `${playerInfo.name} ha iniciado la sesión de escape. (${room.clients.size}/4 agentes activos).`, 'success');
        } else {
          addLog(room, 'SISTEMA', `${playerInfo.name} se ha unido a la misión. (${room.clients.size}/4 agentes activos).`, 'info');
        }

        // Send full state to joining player
        clientWs.send(JSON.stringify({
          type: 'INIT_STATE',
          yourId: playerId,
          yourSlot: assignedSlot,
          state: room.state
        }));

        // Notify other players in the room
        broadcastToRoom(room, {
          type: 'PLAYER_JOINED',
          player: playerInfo,
          roomStatus: room.state.status
        }, clientWs);
          roomStatus: room.state.status
        }, clientWs);

        console.log(`[ROOM ${room.id}] ${playerInfo.name} (${playerId}) unido como Slot ${assignedSlot}`);
        break;
      }

      case 'PLAYER_MOVE': {
        if (!currentRoom || !currentPlayerId) return;
        const player = currentRoom.state.players[currentPlayerId];
        if (!player) return;

        player.position = msg.position;
        player.rotation = msg.rotation;
        if (msg.holdingItem !== undefined) player.holdingItem = msg.holdingItem;
        if (msg.isUvActive !== undefined) player.isUvActive = msg.isUvActive;

        // Broadcast lightweight transform update to other player
        broadcastToRoom(currentRoom, {
          type: 'PLAYER_MOVED',
          id: currentPlayerId,
          position: player.position,
          rotation: player.rotation,
          isUvActive: player.isUvActive,
          holdingItem: player.holdingItem
        }, clientWs);
        break;
      }

      case 'GAME_ACTION': {
        if (!currentRoom || !currentPlayerId) return;
        handleGameAction(currentRoom, currentPlayerId, msg.action, msg.payload, clientWs);
        break;
      }

      case 'PING': {
        clientWs.send(JSON.stringify({ type: 'PONG', timestamp: msg.timestamp }));
        break;
      }

      case 'CHAT_MESSAGE': {
        if (!currentRoom || !currentPlayerId) return;
        const sender = currentRoom.state.players[currentPlayerId]?.name || 'Agente';
        addLog(currentRoom, sender, msg.text, 'action');
        break;
      }
    }
  }

  function handleGameAction(room, playerId, action, payload, senderWs) {
    const state = room.state;
    const player = state.players[playerId];
    const playerName = player ? player.name : 'Agente';

    let stateModified = false;
    let sfxTrigger = null;

    switch (action) {
      // ---------------------------------------------------------------
      // PUZZLE A: Cajón y Linterna UV
      // ---------------------------------------------------------------
      case 'TOGGLE_DRAWER': {
        state.puzzles.puzzleA.deskDrawerOpen = !state.puzzles.puzzleA.deskDrawerOpen;
        stateModified = true;
        sfxTrigger = state.puzzles.puzzleA.deskDrawerOpen ? 'drawer_open' : 'drawer_close';
        addLog(room, playerName, `${state.puzzles.puzzleA.deskDrawerOpen ? 'Abrió' : 'Cerró'} el cajón del escritorio.`);
        break;
      }

      case 'TAKE_UV_FLASHLIGHT': {
        if (!state.inventory.uv_flashlight.collected && state.puzzles.puzzleA.deskDrawerOpen) {
          state.inventory.uv_flashlight.collected = true;
          state.inventory.uv_flashlight.holder = playerId;
          state.puzzles.puzzleA.uvFlashlightFound = true;
          player.holdingItem = 'uv_flashlight';
          stateModified = true;
          sfxTrigger = 'item_pickup';
          addLog(room, playerName, 'Encontró y equipó la Linterna de Luz Negra (UV).', 'action');
        }
        break;
      }

      case 'TOGGLE_UV_LIGHT': {
        player.isUvActive = !player.isUvActive;
        sfxTrigger = 'switch_click';
        // Broadcast immediately for low latency visual
        broadcastToRoom(room, {
          type: 'UV_TOGGLED',
          playerId,
          isUvActive: player.isUvActive
        });
        break;
      }

      case 'REVEAL_BILL_UV': {
        if (!state.puzzles.puzzleA.secretRevealed) {
          state.puzzles.puzzleA.secretRevealed = true;
          state.puzzles.puzzleA.framedBillIlluminated = true;
          stateModified = true;
          sfxTrigger = 'clue_revealed';
          addLog(room, playerName, '¡Descubrió tinta invisible en el billete con la luz UV!', 'success');
        }
        break;
      }

      // ---------------------------------------------------------------
      // PUZZLE B: Carpeta de Clientes y Caja Fuerte #104
      // ---------------------------------------------------------------
      case 'INSPECT_ARCHIVE': {
        state.puzzles.puzzleB.archiveFolderInspected = true;
        sfxTrigger = 'paper_rustle';
        break;
      }

      case 'SUBMIT_SAFE_CODE': {
        const inputCode = String(payload.code || '').trim();
        if (inputCode === state.puzzles.puzzleB.targetDateCode) { // "1407"
          state.puzzles.puzzleB.safe104Unlocked = true;
          state.puzzles.puzzleB.safe104DoorOpen = true;
          stateModified = true;
          sfxTrigger = 'safe_unlock';
          addLog(room, playerName, '¡Combinación correcta (14/07)! La caja de seguridad #104 se ha destrabado.', 'success');
        } else {
          sfxTrigger = 'access_denied';
          addLog(room, playerName, `Intentó combinación incorrecta (${inputCode}) en la caja #104.`, 'alert');
        }
        break;
      }

      case 'TOGGLE_SAFE_DOOR': {
        if (state.puzzles.puzzleB.safe104Unlocked) {
          state.puzzles.puzzleB.safe104DoorOpen = !state.puzzles.puzzleB.safe104DoorOpen;
          stateModified = true;
          sfxTrigger = state.puzzles.puzzleB.safe104DoorOpen ? 'safe_door_open' : 'safe_door_close';
        }
        break;
      }

      case 'TAKE_MASTER_FUSE': {
        if ((state.puzzles.puzzleB.safe104DoorOpen || state.puzzles.puzzleB.safe104Unlocked) && !state.inventory.master_fuse.collected) {
          state.inventory.master_fuse.collected = true;
          state.inventory.master_fuse.holder = playerId;
          stateModified = true;
          sfxTrigger = 'item_pickup';
          addLog(room, playerName, 'Recogió el Fusible Maestro Cerámico de la caja #104.', 'action');
        }
        break;
      }

      case 'TAKE_KEYCARD': {
        if ((state.puzzles.puzzleB.safe104DoorOpen || state.puzzles.puzzleB.safe104Unlocked) && !state.inventory.security_keycard.collected) {
          state.inventory.security_keycard.collected = true;
          state.inventory.security_keycard.holder = playerId;
          stateModified = true;
          sfxTrigger = 'item_pickup';
          addLog(room, playerName, 'Recogió la Tarjeta Magnética de Seguridad.', 'action');
        }
        break;
      }

      // ---------------------------------------------------------------
      // PUZZLE C: Panel Eléctrico y Fusibles
      // ---------------------------------------------------------------
      case 'TOGGLE_FUSE_PANEL': {
        state.puzzles.puzzleC.fusePanelDoorOpen = !state.puzzles.puzzleC.fusePanelDoorOpen;
        stateModified = true;
        sfxTrigger = state.puzzles.puzzleC.fusePanelDoorOpen ? 'metal_door_open' : 'metal_door_close';
        break;
      }

      case 'INSERT_MASTER_FUSE': {
        if (state.inventory.master_fuse.collected && !state.puzzles.puzzleC.masterFuseInserted) {
          state.puzzles.puzzleC.masterFuseInserted = true;
          state.inventory.master_fuse.placed = true;
          stateModified = true;
          sfxTrigger = 'fuse_insert';
          addLog(room, playerName, 'Colocó el Fusible Maestro en el receptáculo principal.', 'action');
          checkPowerRestoration(room);
        }
        break;
      }

      case 'TOGGLE_BREAKER': {
        const idx = payload.breakerIndex;
        if (idx >= 0 && idx < 4) {
          state.puzzles.puzzleC.breakerStates[idx] = !state.puzzles.puzzleC.breakerStates[idx];
          stateModified = true;
          sfxTrigger = 'breaker_toggle';
          checkPowerRestoration(room);
        }
        break;
      }

      // ---------------------------------------------------------------
      // PUZZLE D: Tarjeta, Teclado Numérico y Bóveda
      // ---------------------------------------------------------------
      case 'SWIPE_KEYCARD': {
        if (state.inventory.security_keycard.collected && !state.puzzles.puzzleD.keycardSwiped) {
          if (!state.puzzles.puzzleC.powerRestored) {
            sfxTrigger = 'buzz_no_power';
            addLog(room, playerName, 'El lector no responde: La antecámara no tiene energía auxiliar.', 'alert');
          } else {
            state.puzzles.puzzleD.keycardSwiped = true;
            state.inventory.security_keycard.inserted = true;
            stateModified = true;
            sfxTrigger = 'card_swipe_success';
            addLog(room, playerName, 'Tarjeta de seguridad validada. Teclado numérico habilitado.', 'success');
          }
        }
        break;
      }

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
            addLog(room, playerName, '¡CÓDIGO OMEGA ACEPTADO! Los cerrojos de la bóveda se han liberado. Giren el volante.', 'success');
          } else {
            sfxTrigger = 'access_denied';
            addLog(room, playerName, `Código erróneo (${state.puzzles.puzzleD.keypadDisplay}) en teclado de bóveda.`, 'alert');
            state.puzzles.puzzleD.keypadDisplay = 'ERROR';
            stateModified = true;
          }
        } else if (typeof key === 'string' && key.length === 1 && state.puzzles.puzzleD.keypadDisplay.length < 6) {
          if (state.puzzles.puzzleD.keypadDisplay === 'ERROR') {
            state.puzzles.puzzleD.keypadDisplay = key;
          } else {
            state.puzzles.puzzleD.keypadDisplay += key;
          }
          sfxTrigger = 'keypad_beep';
          stateModified = true;
        }
        break;
      }

      case 'TURN_VAULT_WHEEL': {
        if (state.puzzles.puzzleD.vaultLockDisengaged && !state.puzzles.puzzleD.vaultDoorOpen) {
          state.puzzles.puzzleD.vaultWheelTurnProgress = Math.min(
            1,
            state.puzzles.puzzleD.vaultWheelTurnProgress + (payload.amount || 0.25)
          );
          sfxTrigger = 'wheel_ratchet';
          stateModified = true;

          if (state.puzzles.puzzleD.vaultWheelTurnProgress >= 0.99) {
            state.puzzles.puzzleD.vaultDoorOpen = true;
            state.environment.room2Unlocked = true;
            sfxTrigger = 'vault_door_open_heavy';
            addLog(
              room,
              'SISTEMA',
              '🚨 ¡COMPUERTA DE BÓVEDA ABIERTA! Se ha desvelado la Cámara Secreta del Núcleo Cuántico. ¡Avancen a la Sala 2!',
              'success'
            );
          }
        }
        break;
      }

      // ---------------------------------------------------------------
      // ROBOT GREETING & AMORCITO / PARTNER SYNERGY
      // ---------------------------------------------------------------
      case 'GREET': {
        const now = Date.now();
        const customText = payload.text || '¡Hola mi amorcito! 👋🤖❤️';
        sfxTrigger = 'robot_wave';

        // Check for partner synergy wave combo (within 6 seconds)
        let isCombo = false;
        if (state.synergy.lastGreetPlayer && state.synergy.lastGreetPlayer !== playerId && (now - state.synergy.lastGreetTime) < 6000) {
          isCombo = true;
          state.synergy.score += 50;
          state.synergy.comboActive = true;
          sfxTrigger = 'couple_synergy';
          addLog(room, '💖 SINERGIA', `¡Sincronía amorosa perfecta entre los dos robots! (+50 pts de Sinergia: ${state.synergy.score}%)`, 'success');
        } else {
          state.synergy.lastGreetPlayer = playerId;
          state.synergy.lastGreetTime = now;
          state.synergy.score = Math.min(200, state.synergy.score + 10);
          addLog(room, playerName, `saludó a su compañero: "${customText}"`, 'action');
        }

        // Broadcast dedicated greeting event so other avatar immediately animates wave + speech bubble
        broadcastToRoom(room, {
          type: 'PLAYER_GREETED',
          playerId,
          slot: player ? player.slot : 1,
          name: playerName,
          text: customText,
          isCombo
        });

        stateModified = true;
        break;
      }

      // ---------------------------------------------------------------
      // SALA 2: PUZZLE E - Frecuencias Cuánticas Alfa & Bravo
      // ---------------------------------------------------------------
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
        addLog(room, playerName, `Ajustó la Frecuencia Cuántica Alfa a ${freq} Hz.`, 'info');
        checkCoreHarmonization(room);
        break;
      }

      case 'SET_BRAVO_FREQ': {
        const freq = parseInt(payload.freq) || 0;
        state.puzzles.puzzleE.terminalBravoFreq = freq;
        stateModified = true;
        sfxTrigger = 'quantum_tune';
        addLog(room, playerName, `Ajustó la Frecuencia Cuántica Bravo a ${freq} Hz.`, 'info');
        checkCoreHarmonization(room);
        break;
      }

      // ---------------------------------------------------------------
      // SALA 2: PUZZLE F - Consola de Desactivación de Barrera Láser
      // ---------------------------------------------------------------
      case 'SUBMIT_LASER_CODE': {
        const entered = String(payload.code || '').trim();
        state.puzzles.puzzleF.laserCodeEntered = entered;

        if (entered === state.puzzles.puzzleF.correctLaserCode) { // "960" (432 + 528)
          if (!state.puzzles.puzzleE.coreHarmonized) {
            sfxTrigger = 'access_denied';
            addLog(room, playerName, 'Código matemáticamente válido, pero el Núcleo Cuántico no está armonizado aún en 432Hz y 528Hz.', 'alert');
          } else {
            state.puzzles.puzzleF.laserGridDisabled = true;
            state.puzzles.puzzleG.airlockUnlocked = true;
            stateModified = true;
            sfxTrigger = 'laser_shutdown';
            addLog(room, playerName, '⚡ ¡BARRERA LÁSER DESACTIVADA! El campo de fuerza se ha disipado. La esclusa de evacuación está lista.', 'success');
          }
        } else {
          sfxTrigger = 'access_denied';
          addLog(room, playerName, `Código incorrecto (${entered}) en la consola del láser.`, 'alert');
        }
        stateModified = true;
        break;
      }

      // ---------------------------------------------------------------
      // SALA 2: PUZZLE G - Esclusa de Evacuación Final / Pod de Escape
      // ---------------------------------------------------------------
      case 'ACTIVATE_FINAL_EXTRACTION': {
        if (state.puzzles.puzzleF.laserGridDisabled && !state.puzzles.puzzleG.launchActivated) {
          state.puzzles.puzzleG.airlockUnlocked = true;
          state.puzzles.puzzleG.launchActivated = true;
          state.status = 'ESCAPED';
          state.escapeTimeSeconds = Math.round((Date.now() - (state.startTime || Date.now())) / 1000);
          stateModified = true;
          sfxTrigger = 'elevator_open';
          addLog(
            room,
            'SISTEMA',
            `🏆 ¡MISIÓN CUMPLIDA! Ambos robots han escapado de la Bóveda y del Núcleo Cuántico. Tiempo total: ${formatTime(state.escapeTimeSeconds)}`,
            'success'
          );
        }
        break;
      }

      // ---------------------------------------------------------------
      // CIRCO MALDITO: ACCIONES DE ESCAPE ROOM DE TERROR (PAYASOS)
      // ---------------------------------------------------------------
      case 'TAKE_CIRCUS_KNIFE': {
        if (!state.circusInventory.circusKnife?.collected && !state.circusInventory.circus_knife?.collected) {
          state.circusInventory.circus_knife = { collected: true, holder: playerId };
          state.circusInventory.circusKnife = { collected: true, holder: playerId };
          state.circusInventory.circus_dart = { collected: true, holder: playerId };
          state.circusPuzzles.dartCollected = true;
          state.circusPuzzles.knifeCollected = true;
          player.holdingItem = 'circus_knife';
          stateModified = true;
          sfxTrigger = 'item_pickup';
          addLog(room, playerName, 'Recogió la Daga / Cuchillo de Utilería del camerino del circo.', 'action');
        }
        break;
      }

      case 'POP_BALLOON': {
        if (!state.circusPuzzles.balloonPopped) {
          state.circusPuzzles.balloonPopped = true;
          stateModified = true;
          sfxTrigger = 'balloon_pop';
          addLog(room, playerName, '🎈 ¡Reventó el Globo Rojo en el centro de la carpa!', 'alert');
        }
        break;
      }

      case 'TAKE_CRANK': {
        if (state.circusPuzzles.balloonPopped && !state.circusInventory.jack_crank?.collected) {
          state.circusInventory.jack_crank = { collected: true, holder: playerId };
          state.circusInventory.circusCrank = { collected: true, holder: playerId };
          state.circusInventory.jackCrank = { collected: true, holder: playerId };
          state.circusPuzzles.crankCollected = true;
          player.holdingItem = 'jack_crank';
          stateModified = true;
          sfxTrigger = 'item_pickup';
          addLog(room, playerName, 'Recogió una manivela mecánica del pedestal.', 'action');
        }
        break;
      }

      case 'ACTIVATE_ANIMATRONIC': {
        state.circusPuzzles.animatronicActive = true;
        state.circusPuzzles.animatronicQuoteRevealed = true;
        stateModified = true;
        sfxTrigger = 'clown_laugh';
        addLog(room, playerName, '🤡 Activó el Payaso Mecánico Adivino: su risa macabra resuena por toda la carpa...', 'alert');
        break;
      }

      case 'INSERT_JACK_CRANK': {
        const hasCrank = state.circusInventory.jack_crank?.collected || state.circusInventory.circusCrank?.collected || state.circusInventory.jackCrank?.collected;
        if (hasCrank && !state.circusPuzzles.jackCrankInserted) {
          state.circusPuzzles.jackCrankInserted = true;
          state.circusPuzzles.crankInserted = true;
          state.circusInventory.jack_crank.inserted = true;
          state.circusInventory.circusCrank.inserted = true;
          state.circusInventory.jackCrank.inserted = true;
          stateModified = true;
          sfxTrigger = 'switch_click';
          addLog(room, playerName, 'Acopló la manivela al mecanismo lateral de la caja.', 'action');
        }
        break;
      }

      case 'SUBMIT_JACK_CODE': {
        const code = String(payload?.code || '').trim();
        if (code === state.circusPuzzles.targetClownCode) { // "7341"
          state.circusPuzzles.jackBoxUnlocked = true;
          state.circusPuzzles.jackSpringPopped = true;
          state.circusPuzzles.jackPopped = true;
          stateModified = true;
          sfxTrigger = 'jack_spring';
          addLog(room, playerName, '🎪 ¡Combinación correcta! ¡La Caja Sorpresa se abrió de golpe!', 'success');
        } else {
          sfxTrigger = 'access_denied';
          addLog(room, playerName, `Combinación incorrecta (${code}) en el candado de la caja del bufón.`, 'alert');
        }
        break;
      }

      case 'TAKE_TAMER_KEY': {
        if (state.circusPuzzles.jackBoxUnlocked && !state.circusInventory.tamer_key?.collected) {
          state.circusInventory.tamer_key = { collected: true, holder: playerId };
          state.circusInventory.tamerKey = { collected: true, holder: playerId };
          state.circusPuzzles.tamerKeyCollected = true;
          stateModified = true;
          sfxTrigger = 'item_pickup';
          addLog(room, playerName, 'Recogió la Llave Maestra del Domador.', 'action');
        }
        break;
      }

      case 'TAKE_CAGE_LEVER': {
        if (state.circusPuzzles.jackBoxUnlocked && !state.circusInventory.cage_lever?.collected) {
          state.circusInventory.cage_lever = { collected: true, holder: playerId };
          state.circusInventory.cageLever = { collected: true, holder: playerId };
          state.circusPuzzles.cageLeverCollected = true;
          stateModified = true;
          sfxTrigger = 'item_pickup';
          addLog(room, playerName, 'Recogió la Palanca de Apertura de la Jaula.', 'action');
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
          addLog(room, 'SISTEMA', `🏆 ¡ESCAPARON DEL CIRCO MALDITO! Han abierto la jaula y escapado de los payasos con vida. Tiempo total: ${formatTime(state.escapeTimeSeconds)}`, 'success');
        }
        break;
      }

      case 'RESET_GAME': {
        const currentPlayers = { ...room.state.players };
        room.state = createInitialState(room.id, room.mapTheme);
        room.state.players = currentPlayers;
        room.state.status = 'IN_PROGRESS';
        room.state.startTime = Date.now();
        stateModified = true;
        sfxTrigger = 'reset_chime';
        addLog(room, playerName, 'Ha reiniciado la sala de operaciones.', 'alert');
        break;
      }
    }

    if (stateModified) {
      broadcastToRoom(room, {
        type: 'STATE_UPDATE',
        state: room.state,
        sfx: sfxTrigger,
        triggeredBy: playerName
      });
    } else if (sfxTrigger) {
      broadcastToRoom(room, {
        type: 'TRIGGER_SFX',
        sfx: sfxTrigger
      });
    }
  }

  function checkPowerRestoration(room) {
    const state = room.state;
    const { masterFuseInserted, breakerStates, breakerTargetPattern } = state.puzzles.puzzleC;
    const breakersMatch = breakerStates.every((val, i) => val === breakerTargetPattern[i]);

    if (masterFuseInserted && breakersMatch && !state.puzzles.puzzleC.powerRestored) {
      state.puzzles.puzzleC.powerRestored = true;
      state.puzzles.puzzleD.keypadPowered = true;
      state.environment.mainLightsActive = true;
      state.environment.ambientLightIntensity = 0.8;
      addLog(room, 'SISTEMA', '⚡ ¡Energía eléctrica auxiliar restaurada! Los sistemas digitales de la bóveda están en línea.', 'success');
      broadcastToRoom(room, {
        type: 'TRIGGER_SFX',
        sfx: 'power_surge_on'
      });
    }
  }

  function checkCoreHarmonization(room) {
    const state = room.state;
    const { terminalAlfaFreq, terminalBravoFreq, targetAlfaFreq, targetBravoFreq, coreHarmonized } = state.puzzles.puzzleE;

    if (terminalAlfaFreq === targetAlfaFreq && terminalBravoFreq === targetBravoFreq && !coreHarmonized) {
      state.puzzles.puzzleE.coreHarmonized = true;
      addLog(room, 'SISTEMA', '🌀 ¡RESONANCIA CUÁNTICA ALCANZADA! El Núcleo Cuántico está estabilizado (432Hz + 528Hz). Clave armónica desbloqueada: 960.', 'success');
      broadcastToRoom(room, {
        type: 'STATE_UPDATE',
        state: room.state,
        sfx: 'quantum_unlock'
      });
    }
  }

  function handleDisconnect(room, clientWs, playerId) {
    const player = room.state.players[playerId];
    const pName = player ? player.name : 'Agente';
    room.clients.delete(clientWs);
    delete room.state.players[playerId];

    addLog(room, 'SISTEMA', `${pName} se ha desconectado.`, 'alert');

    broadcastToRoom(room, {
      type: 'PLAYER_LEFT',
      id: playerId,
      name: pName
    });

    console.log(`[ROOM ${room.id}] Jugador desconectado: ${pName} (${playerId}). Restantes: ${room.clients.size}`);

    // If room is empty, clear it after 15 minutes of inactivity
    if (room.clients.size === 0) {
      setTimeout(() => {
        if (room.clients.size === 0) {
          rooms.delete(room.id);
          console.log(`[ROOM ${room.id}] Sala eliminada por inactividad.`);
        }
      }, 15 * 60 * 1000);
    }
  }
});

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
}

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Servidor WebSocket Escape Room Bóveda Banco`);
  console.log(`🌐 Escuchando en el puerto: ${PORT}`);
  console.log(`🔌 URL de conexión: ws://localhost:${PORT}`);
  console.log(`=======================================================`);
});
