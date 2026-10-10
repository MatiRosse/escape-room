# 🏛️ Escape Room 3D Cooperativo: Bóveda de Banco (Omega Protocol)

Prototipo completo y funcional de un videojuego en primera persona 3D para navegador, cooperativo para 2 jugadores en simultáneo, ambientado en la antecámara blindada de un banco de máxima seguridad.

---

## 🎮 Características Principales

1. **Perspectiva y Controles en Primera Persona:**
   - Control de cámara libre con mouse (`PointerLockControls`) y desplazamiento suave `WASD` con detección de colisiones contra muros y mobiliario.
   - Puntero central táctico con **Raycasting de corto alcance (máx. 3 metros)** que detecta objetos interactivos y transforma la mira dinámicamente (`[E]` o `[Click]`).
   - Barra de inventario rápido en pantalla (`[1]`, `[2]`, `[3]`).
   - Modo de inspección de documentos y acertijos en primer plano (`[ESC]` para cerrar).

2. **Multijugador Cooperativo en Tiempo Real (Mismo Espacio Físico):**
   - **Modelo de Estado Autoritativo:** El servidor WebSocket gestiona las transiciones del estado de los puzzles, cerraduras e inventario para evitar desincronizaciones.
   - **Avatar 3D del Compañero:** Cada jugador ve en tiempo real el modelo 3D del otro agente (cuerpo táctico, casco articulado que mira donde el compañero apunta, linterna y mochila).
   - **Sincronización de Luz UV:** Cuando un jugador activa su linterna UV (`[F]`), emite un haz y cono volumétrico púrpura visible por ambos jugadores en la sala.
   - **Libertad Total de Roles:** No hay bloqueos artificiales; cualquier jugador puede resolver cualquier puzzle o colaborar en paralelo.

3. **Ambientación PBR y Gráficos Three.js:**
   - Paredes de concreto reforzado con remaches, texturas de piso de pizarra industrial y bandas de peligro reflectantes.
   - Escritorio de seguridad con monitor CCTV, teclado y cajón deslizable.
   - Muro de cajas de seguridad privadas con casillero #104 interactivo.
   - Panel de fusibles y disyuntores térmicos de 380V.
   - Gran compuerta circular blindada (20 toneladas) con volante de presión y cerrojos radiales.
   - **Audio Procedural (Web Audio API):** Pasos, deslizamiento de cajón, chispazos, teclado digital, alarma y zumbido atmosférico sin dependencias externas.

---

## 🧩 Cadena de Acertijos y Solución

| Pista | Elemento Interactuable | Descripción y Solución |
|---|---|---|
| **Pista A (Luz UV)** | Cajón del escritorio / Billete enmarcado | Se abre el cajón con `[E]`, se recoge la **Linterna UV**. Al encenderla con `[F]` y alumbrar el billete en la pared, la tinta invisible revela la ecuación: `(84 + 92) * 27 + 73 = 4829`. |
| **Pista B (Registro)** | Carpeta de Clientes / Caja #104 | Se inspecciona la carpeta sobre el escritorio. El titular sospechoso es *Viktor Vance* con fecha de contrato `14/07/1998`. El dial de la caja #104 se ajusta a `1407`. Al abrirse, revela el **Fusible Maestro** y la **Tarjeta Magnética**. |
| **Pista C (Fusibles)** | Manual de Guardia / Panel Eléctrico | Se consulta el manual (`SW1 ON`, `SW2 OFF`, `SW3 ON`, `SW4 ON`). Se coloca el fusible maestro en el panel y se configuran los disyuntores. Se restaura la energía auxiliar de 380V (luces principales encienden). |
| **Pista D (Apertura)** | Lector de Tarjetas / Teclado / Volante | Con energía restaurada, se desliza la tarjeta magnética en el lector de la bóveda. Se ingresa el código `4829` en el teclado numérico. Los cerrojos radiales se retraen. Se gira el volante de presión hasta abrir la compuerta blindada. |

---

## 🚀 Instrucciones de Ejecución

### Prerrequisitos
- Node.js (v18 o superior)
- Navegador moderno con soporte WebGL (Chrome, Edge, Firefox, Brave)

### 1. Instalación de Dependencias
En la carpeta raíz del proyecto, ejecuta:
```bash
npm install
```
*(En Windows PowerShell si hay restricciones de script, usa `npm.cmd install`)*

### 2. Levantar el Servidor y la Aplicación

**Modo Unificado (Servidor + Frontend estático integrado):**
```bash
npm run build
npm start
```
Abre en tu navegador:
👉 `http://localhost:3001`

**Modo Desarrollo con Hot Reload (Vite + Node Server):**
```bash
npm run dev
```
Levantará el servidor de WebSocket en el puerto 3001 y el cliente Vite en `http://localhost:5173`.

---

## 👥 Cómo Probar el Modo Cooperativo para 2 Jugadores en Local

1. Abre una ventana de tu navegador en `http://localhost:3001` (o `http://localhost:5173`).
2. En el Lobby, escribe:
   - Nombre: `Agente Alfa`
   - Código de Sala: `boveda-1`
   - Haz clic en **CONECTARSE A LA ANTECÁMARA**.
3. Abre una **segunda ventana (o ventana de incógnito)** en la misma dirección.
4. En el segundo Lobby, escribe:
   - Nombre: `Agente Bravo`
   - Código de Sala: `boveda-1`
   - Haz clic en **CONECTARSE A LA ANTECÁMARA**.
5. ¡Ambos agentes estarán en la misma sala física! Verán el movimiento del otro en 3D, su linterna UV y todas las acciones sincronizadas en tiempo real.

---

## ☁️ Despliegue en Cloudflare Workers

Para compilar y subir los cambios a producción en Cloudflare (incluyendo soporte WebSocket y Durable Objects):

```bash
npm.cmd run build
npx.cmd wrangler deploy
```

Para más detalles sobre la arquitectura y resolución de problemas, consulta el archivo [DEPLOY_CLOUDFLARE.md](file:///c:/Users/andre/OneDrive/Desktop/antigravity/Escape%20room%20-%20juego%20con%20mi%20amorcito/DEPLOY_CLOUDFLARE.md).
