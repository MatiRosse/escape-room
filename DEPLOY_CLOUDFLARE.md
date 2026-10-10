# 🚀 Guía de Despliegue en Cloudflare (Escape Room 3D)

Esta guía documenta los pasos exactos y los requisitos técnicos para compilar y desplegar el juego en **Cloudflare Workers** con soporte completo para **WebSockets** y **Durable Objects**.

---

## 🌐 URL de Producción
- **Aplicación:** [https://escape-room-boveda.andresbulghe.workers.dev](https://escape-room-boveda.andresbulghe.workers.dev)

---

## 🛠️ Comandos de Despliegue

### En Windows (PowerShell / CMD):
Debido a las políticas de ejecución de scripts en Windows PowerShell (`.ps1`), se debe usar `npm.cmd` y `npx.cmd`:

```powershell
# 1. Compilar el cliente frontend con Vite
npm.cmd run build

# 2. Desplegar los assets y el Worker a Cloudflare
npx.cmd wrangler deploy
```

O en un solo paso:
```powershell
npm.cmd run deploy:cloudflare
```

---

## ⚙️ Arquitectura y Configuración Crítica

### 1. `cloudflare/worker.js` (Backend WebSocket + Durable Objects)
- **Importación Obligatoria:** La clase Durable Object debe importar y extender `DurableObject` de `"cloudflare:workers"`:
  ```javascript
  import { DurableObject } from "cloudflare:workers";

  export class EscapeRoomDO extends DurableObject {
    constructor(ctx, env) {
      super(ctx, env);
      this.sessions = new Map();
      this.gameState = createInitialState("boveda-1");
    }

    async fetch(request) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.handleSession(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    // ...
  }
  ```
- **Ruta WebSocket:** El `fetch` principal del Worker debe interceptar la ruta `/ws` o el encabezado `Upgrade: websocket` y delegar directamente en la sala correspondiente:
  ```javascript
  if (upgradeHeader === "websocket" || url.pathname === "/ws" || url.pathname.startsWith("/ws/")) {
    const roomId = url.searchParams.get("room") || "boveda-1";
    const id = env.ROOMS.idFromName(roomId);
    const roomObj = env.ROOMS.get(id);
    return roomObj.fetch(request);
  }
  ```

### 2. `wrangler.jsonc` (Configuración de Cloudflare)
- Vincula la clase `EscapeRoomDO` a las salas multijugador (`ROOMS`).
- Configura los assets estáticos desde `./dist` con `run_worker_first: true` para que las rutas WebSocket no sean interceptadas por el servidor de archivos estáticos.
- Migración con `new_sqlite_classes: ["EscapeRoomDO"]` para compatibilidad en el plan estándar/gratuito de Cloudflare.

### 3. `src/network.js` (Cliente Frontend)
- Conexión dinámica a WebSocket:
  - En localhost: `ws://localhost:3001`
  - En Cloudflare / Producción HTTPS: `wss://<dominio>/ws?room=<sala>&theme=<mapa>`

---

## 🔍 Solución al Error *"No se pudo conectar al servidor WebSocket"*
Este error ocurre si:
1. **Falta compilar el frontend:** Si se modifica `src/network.js` o `src/main.js` y no se corre `npm.cmd run build`, el bundle en `dist/` no tendrá la ruta `/ws` correcta.
2. **`EscapeRoomDO` no extiende `DurableObject`:** En versiones modernas del runtime de Cloudflare con SQLite, si no se importa `DurableObject` de `cloudflare:workers` y no se extiende la clase base con `super(ctx, env)`, el worker arroja error 500 al recibir la conexión WebSocket.
3. **Revisión de rechazo de socket:** El cliente `network.js` captura el evento `onclose` antes del saludo `INIT_STATE` y notifica el fallo exacto.
