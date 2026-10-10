const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '../index.html');
let content = fs.readFileSync(indexPath, 'utf8');

// 1. Update hud-header buttons
const oldHeaderButtons = `      <button class="hud-badge btn-reset-mission" id="btn-reset-mission" title="Reiniciar misión desde cero">
        <span class="reset-icon">🔄</span>
        <span>REINICIAR</span>
      </button>
    </header>`;

const newHeaderButtons = `      <div class="hud-header-tools">
        <button class="hud-badge btn-sound-toggle" id="btn-sound-toggle" title="Silenciar / Activar audio [M]">
          <span id="sound-icon">🔊</span>
          <span id="sound-label">AUDIO</span>
        </button>

        <button class="hud-badge btn-help-controls" id="btn-help-controls" title="Guía táctica de controles [H]">
          <span>❓</span>
          <span>AYUDA [H]</span>
        </button>

        <button class="hud-badge btn-reset-mission" id="btn-reset-mission" title="Reiniciar misión desde cero">
          <span class="reset-icon">🔄</span>
          <span>REINICIAR</span>
        </button>
      </div>
    </header>

    <!-- Cinta de Navegación y Brújula Táctica -->
    <div class="hud-compass" id="hud-compass">
      <span class="compass-icon">🧭</span>
      <span class="compass-cardinal" id="compass-cardinal">NORTE</span>
      <span class="compass-degrees" id="compass-deg">000°</span>
    </div>`;

content = content.replace(oldHeaderButtons, newHeaderButtons);

// 2. Fix Dossier archive spoiler
const oldArchiveFooter = `<div class="dossier-footer">
          <span>Pistas: La fecha del contrato es <strong>14 de Julio (14/07)</strong>. Formato de 4 dígitos: <code>1407</code>.</span>
        </div>`;

const newArchiveFooter = `<div class="dossier-footer">
          <span>Aviso de Seguridad: Las cerraduras de seguridad privada se configuran según el día y mes de contratación de cada titular (DDMM).</span>
        </div>`;

content = content.replace(oldArchiveFooter, newArchiveFooter);

// 3. Fix Quantum Core tablet spoiler
const oldTabletCode = `            <div>
              <h3>2. CLAVE DE DESACTIVACIÓN LÁSER</h3>
              <p>Una vez alcanzada la resonancia armónica en el Núcleo, introduzcan en la <strong>Consola del Láser</strong> la suma armónica de ambas frecuencias:</p>
              <div class="formula-box">
                <code>FRECUENCIA ALFA (432) + FRECUENCIA BRAVO (528) = <strong>960</strong></code>
              </div>
            </div>`;

const newTabletCode = `            <div>
              <h3>2. CLAVE DE DESACTIVACIÓN LÁSER</h3>
              <p>Una vez alcanzada la resonancia armónica en el Núcleo, introduzcan en la <strong>Consola del Láser</strong> la suma armónica resultante de ambas frecuencias de fase:</p>
              <div class="formula-box">
                <code>FRECUENCIA RESULTANTE = f(Canal Alfa) + f(Canal Bravo)</code>
              </div>
            </div>`;

content = content.replace(oldTabletCode, newTabletCode);

// 4. Fix Clown poster spoiler
const oldPosterCode = `        <div class="poster-clown-art">
          <div class="art-smile">🤡</div>
          <p class="blood-whisper">"CUANDO LA MÚSICA SE DETENGA, EL NÚMERO SERÁ TU CONDENA: <strong>7341</strong>"</p>
        </div>
        <p class="poster-note">Pista revelada: El código del payaso para la caja de sorpresas es <strong>7341</strong>.</p>`;

const newPosterCode = `        <div class="poster-clown-art">
          <div class="art-smile">🤡</div>
          <p class="blood-whisper">
            "Siete pecados en la carpa oscura,<br>
            Tres payasos en la cuerda floja,<br>
            Cuatro fieras rugiendo de locura,<br>
            Y Un solo escape antes de que la música cese."
          </p>
        </div>
        <p class="poster-note">Nota grabada en la madera: Los números de la rima abren el cerrojo del bufón...</p>`;

content = content.replace(oldPosterCode, newPosterCode);

// 5. Add Controls Guide Modal before victory modal
const controlsGuideModal = `  <!-- Modal de Guía Táctica y Controles (Tecla [H]) -->
  <div id="modal-controls-guide" class="inspect-modal hidden">
    <div class="inspect-panel controls-guide-panel">
      <button class="btn-close-inspect" data-close="modal-controls-guide">✕ CERRAR [ESC / H]</button>
      <div class="controls-guide-card">
        <div class="controls-guide-header">
          <div class="guide-badge">CENTRO DE OPERACIONES</div>
          <h2>GUÍA DE MANDOS Y COLABORACIÓN</h2>
          <p>Instrucciones de movimiento, exploración física y funciones cooperativas.</p>
        </div>

        <div class="controls-matrix-grid">
          <div class="matrix-card">
            <div class="matrix-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
            <div class="matrix-info">
              <strong>Desplazamiento</strong>
              <span>Moverse libremente por las cámaras</span>
            </div>
          </div>

          <div class="matrix-card">
            <div class="matrix-keys"><kbd>SHIFT</kbd></div>
            <div class="matrix-info">
              <strong>Sombra Táctica</strong>
              <span>Correr a máxima velocidad</span>
            </div>
          </div>

          <div class="matrix-card">
            <div class="matrix-keys"><kbd>C</kbd> / <kbd>CTRL</kbd></div>
            <div class="matrix-info">
              <strong>Agacharse</strong>
              <span>Inspeccionar bajo escritorios y huecos bajos</span>
            </div>
          </div>

          <div class="matrix-card">
            <div class="matrix-keys"><kbd>F</kbd></div>
            <div class="matrix-info">
              <strong>Linterna Ultravioleta (UV)</strong>
              <span>Revelar marcas y ecuaciones ocultas</span>
            </div>
          </div>

          <div class="matrix-card">
            <div class="matrix-keys"><kbd>E</kbd> / <kbd>CLICK</kbd></div>
            <div class="matrix-info">
              <strong>Interactuar</strong>
              <span>Abrir cajones, examinar terminales y cajas</span>
            </div>
          </div>

          <div class="matrix-card highlight-card">
            <div class="matrix-keys"><kbd>1</kbd></div>
            <div class="matrix-info">
              <strong>Saludar / Enviar Amor 💖</strong>
              <span>Incrementar la Sinergia y sincronía de pareja</span>
            </div>
          </div>

          <div class="matrix-card">
            <div class="matrix-keys"><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd></div>
            <div class="matrix-info">
              <strong>Inventario Rápido</strong>
              <span>Seleccionar herramientas recolectadas</span>
            </div>
          </div>

          <div class="matrix-card">
            <div class="matrix-keys"><kbd>M</kbd></div>
            <div class="matrix-info">
              <strong>Silenciar Audio</strong>
              <span>Activar / Desactivar sonidos y música</span>
            </div>
          </div>

          <div class="matrix-card">
            <div class="matrix-keys"><kbd>H</kbd></div>
            <div class="matrix-info">
              <strong>Guía de Controles</strong>
              <span>Abrir / Cerrar esta pantalla de ayuda</span>
            </div>
          </div>

          <div class="matrix-card">
            <div class="matrix-keys"><kbd>ESC</kbd></div>
            <div class="matrix-info">
              <strong>Cursor / Pausa</strong>
              <span>Liberar el ratón y cerrar ventanas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Pantalla de Victoria / Misión Cumplida -->`;

content = content.replace('  <!-- Pantalla de Victoria / Misión Cumplida -->', controlsGuideModal);

fs.writeFileSync(indexPath, content, 'utf8');
console.log('index.html updated successfully!');
