// WebSocket Network Client for Escape Room Co-op

export const DEFAULT_CLOUDFLARE_WS_URL = 'wss://escape-room-boveda.andresbulghe.workers.dev/ws';

export class NetworkClient {
  constructor(options = {}) {
    this.ws = null;
    this.serverUrl = options.serverUrl || this.getDefaultWsUrl();
    this.onStateUpdate = options.onStateUpdate || null;
    this.onPlayerMoved = options.onPlayerMoved || null;
    this.onPlayerJoined = options.onPlayerJoined || null;
    this.onPlayerLeft = options.onPlayerLeft || null;
    this.onSfxTrigger = options.onSfxTrigger || null;
    this.onNewLog = options.onNewLog || null;
    this.onPlayerGreeted = options.onPlayerGreeted || null;
    this.onError = options.onError || null;

    this.playerId = null;
    this.playerSlot = null;
    this.lastSentMoveTime = 0;
    this.moveThrottleInterval = 33; // ~30 fps network rate
    this.isConnected = false;

    // Stable client identifier to detect reconnects / page reloads
    if (typeof window !== 'undefined' && window.sessionStorage) {
      this.clientId = sessionStorage.getItem('escape_client_id');
      if (!this.clientId) {
        this.clientId = 'client_' + Math.random().toString(36).substring(2, 10);
        sessionStorage.setItem('escape_client_id', this.clientId);
      }
    } else {
      this.clientId = 'client_' + Math.random().toString(36).substring(2, 10);
    }
    this.pingInterval = null;
  }

  getDefaultWsUrl() {
    if (typeof window !== 'undefined' && window.location) {
      const isHttps = window.location.protocol === 'https:';
      const protocol = isHttps ? 'wss:' : 'ws:';
      const host = window.location.hostname;

      if (['localhost', '127.0.0.1', '[::1]'].includes(host)) {
        // Vite's dev client and the Node WebSocket server use separate ports.
        const port = window.location.port === '5173' ? '3001' : window.location.port;
        return `${protocol}//${host}${port ? `:${port}` : ''}/ws`;
      }

      // If already hosted on Cloudflare Workers or public domain
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `${protocol}//${window.location.host}/ws`;
      }
    }

    // Fallback for environments without a browser location.
    return DEFAULT_CLOUDFLARE_WS_URL;
  }

  setServerUrl(newUrl) {
    if (newUrl && typeof newUrl === 'string' && newUrl.trim()) {
      let trimmed = newUrl.trim();
      if (!trimmed.startsWith('ws://') && !trimmed.startsWith('wss://')) {
        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        trimmed = (isHttps ? 'wss://' : 'ws://') + trimmed.replace(/^https?:\/\//, '');
      }
      this.serverUrl = trimmed;
    }
  }

  connect(roomId, playerName, mapTheme = 'vault', customWsUrl = null) {
    if (customWsUrl) {
      this.setServerUrl(customWsUrl);
    }

    return new Promise((resolve, reject) => {
      let targetUrl = this.serverUrl || this.getDefaultWsUrl();
      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${separator}room=${encodeURIComponent(roomId || 'boveda-1')}&theme=${encodeURIComponent(mapTheme)}`;
      console.log(`[NET] Conectando a ${targetUrl}...`);

      let initResolved = false;

      try {
        this.ws = new WebSocket(targetUrl);
      } catch (err) {
        console.error('[NET] Fallo al iniciar WebSocket:', err);
        if (this.onError) this.onError(err);
        initResolved = true;
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        console.log('[NET] Conexión establecida.');
        this.isConnected = true;

        // Keepalive heartbeat every 2.5s
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send({ type: 'PING', timestamp: Date.now() });
          }
        }, 2500);

        // Send join request with unique clientId
        this.send({
          type: 'JOIN_ROOM',
          roomId,
          name: playerName,
          mapTheme,
          clientId: this.clientId
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ERROR' && !initResolved) {
            initResolved = true;
            reject(new Error(msg.message || 'Error del servidor WebSocket.'));
            return;
          }
          this.handleMessage(msg, (data) => {
            initResolved = true;
            resolve(data);
          });
        } catch (e) {
          console.error('[NET] Error parseando mensaje entrante:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[NET] Error en socket:', err);
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.onError) this.onError(err);
        if (!initResolved) {
          initResolved = true;
          reject(new Error('No se pudo conectar al servidor WebSocket. Revisa el link y que el servidor esté activo.'));
        }
      };

      this.ws.onclose = (event) => {
        console.warn('[NET] Conexión cerrada con el servidor.', event);
        this.isConnected = false;
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (!initResolved) {
          initResolved = true;
          reject(new Error(event.reason || `Conexión rechazada por el servidor (código: ${event.code || 'desconocido'})`));
        }
      };
    });
  }

  handleMessage(msg, resolveInitPromise) {
    switch (msg.type) {
      case 'INIT_STATE': {
        this.playerId = msg.yourId;
        this.playerSlot = msg.yourSlot;
        console.log(`[NET] Inicializado como ${this.playerId} (Slot ${this.playerSlot})`);
        if (resolveInitPromise) resolveInitPromise(msg);
        if (this.onStateUpdate) this.onStateUpdate(msg.state);
        break;
      }

      case 'STATE_UPDATE': {
        if (this.onStateUpdate) this.onStateUpdate(msg.state);
        if (msg.sfx && this.onSfxTrigger) this.onSfxTrigger(msg.sfx);
        break;
      }

      case 'PLAYER_JOINED': {
        console.log('[NET] Nuevo jugador conectado:', msg.player);
        if (this.onPlayerJoined) this.onPlayerJoined(msg.player);
        break;
      }

      case 'PLAYER_MOVED': {
        if (this.onPlayerMoved) {
          this.onPlayerMoved(msg.id, msg.position, msg.rotation, msg.isUvActive);
        }
        break;
      }

      case 'PLAYER_LEFT': {
        console.log('[NET] Jugador desconectado:', msg.name);
        if (this.onPlayerLeft) this.onPlayerLeft(msg.id, msg.name);
        break;
      }

      case 'TRIGGER_SFX': {
        if (this.onSfxTrigger) this.onSfxTrigger(msg.sfx);
        break;
      }

      case 'NEW_LOG': {
        if (this.onNewLog) this.onNewLog(msg.log);
        break;
      }

      case 'PLAYER_GREETED': {
        if (this.onPlayerGreeted) this.onPlayerGreeted(msg);
        break;
      }

      case 'ERROR': {
        console.error('[NET] Error reportado por servidor:', msg.message);
        if (this.onError) this.onError(msg);
        break;
      }
    }
  }

  send(dataObj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(dataObj));
    }
  }

  sendPlayerMove(transform, isUvActive, holdingItem) {
    const now = performance.now();
    if (now - this.lastSentMoveTime < this.moveThrottleInterval) return;

    const p = transform.position;
    const r = transform.rotation;

    // Skip redundant network transmission if standing still and not moving camera
    if (this.lastSentPos && this.lastSentRot) {
      const dPos = (p.x - this.lastSentPos.x) ** 2 + (p.y - this.lastSentPos.y) ** 2 + (p.z - this.lastSentPos.z) ** 2;
      const dRot = Math.abs(r.yaw - this.lastSentRot.yaw) + Math.abs(r.pitch - this.lastSentRot.pitch);
      if (dPos < 0.0001 && dRot < 0.001 && isUvActive === this.lastSentUv && holdingItem === this.lastSentItem) {
        return;
      }
    }

    this.lastSentMoveTime = now;
    this.lastSentPos = { x: p.x, y: p.y, z: p.z };
    this.lastSentRot = { yaw: r.yaw, pitch: r.pitch };
    this.lastSentUv = isUvActive;
    this.lastSentItem = holdingItem;

    this.send({
      type: 'PLAYER_MOVE',
      position: transform.position,
      rotation: transform.rotation,
      isUvActive: Boolean(isUvActive),
      holdingItem: holdingItem || null
    });
  }

  sendAction(actionName, payload = {}) {
    this.send({
      type: 'GAME_ACTION',
      action: actionName,
      payload
    });
  }
}
