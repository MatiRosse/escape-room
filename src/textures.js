import * as THREE from 'three';

// Procedural Canvas Texture Generators for Three.js

export function createConcreteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base concrete grey
  ctx.fillStyle = '#2b2e36';
  ctx.fillRect(0, 0, 512, 512);

  // Noise / grain
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 35;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // Concrete slabs & seams
  ctx.strokeStyle = '#181a1f';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 512, 512);
  ctx.strokeRect(0, 256, 512, 256);

  // Rivets/Anchor holes at corners
  ctx.fillStyle = '#111317';
  [
    [24, 24], [488, 24], [24, 488], [488, 488],
    [24, 256], [488, 256]
  ].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a3f4b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createFloorTileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark slate tile pattern
  ctx.fillStyle = '#1e222b';
  ctx.fillRect(0, 0, 512, 512);

  // Grid tiles
  const tileSize = 128;
  for (let x = 0; x < 512; x += tileSize) {
    for (let y = 0; y < 512; y += tileSize) {
      ctx.fillStyle = (x / tileSize + y / tileSize) % 2 === 0 ? '#222733' : '#1c202a';
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
    }
  }

  // Grout lines
  ctx.strokeStyle = '#0e1015';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createHazardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fbc02d'; // Yellow
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#1a1a1a'; // Black stripes
  const stripeWidth = 32;
  for (let i = -256; i < 512; i += stripeWidth * 2) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + stripeWidth, 0);
    ctx.lineTo(i + stripeWidth + 256, 256);
    ctx.lineTo(i + 256, 256);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createSafeDepositGridTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Brushed steel base
  ctx.fillStyle = '#607d8b';
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal gradient sheen
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Draw 4x4 safe boxes
  const cols = 4;
  const rows = 4;
  const boxW = 512 / cols;
  const boxH = 512 / rows;

  let boxNumber = 100;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      boxNumber++;
      const x = c * boxW;
      const y = r * boxH;

      // Box bevel
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 2, boxW - 4, boxH - 4);

      // Number badge
      ctx.fillStyle = boxNumber === 104 ? '#ff9100' : '#cfd8dc';
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.fillText(`#${boxNumber}`, x + 12, y + 30);

      // Keyholes
      ctx.fillStyle = '#101416';
      ctx.fillRect(x + boxW - 32, y + boxH / 2 - 4, 18, 8);
      ctx.fillRect(x + boxW - 54, y + boxH / 2 - 4, 18, 8);
    }
  }

  return new THREE.CanvasTexture(canvas);
}

// Banknote Texture with dynamic UV phosphor reveal
export function renderBanknoteCanvas(canvas, uvIntensity = 0) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Base vintage green bank note
  ctx.fillStyle = '#d5dfd3';
  ctx.fillRect(0, 0, w, h);

  // Intricate guilloche border
  ctx.strokeStyle = '#2d5a37';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, w - 32, h - 32);

  // Watermark seal & denomination
  ctx.fillStyle = '#2d5a37';
  ctx.font = 'bold 22px "Times New Roman", serif';
  ctx.fillText('BANCO CENTRAL - SERIE CONMEMORATIVA', 40, 50);

  ctx.font = 'bold 54px "Times New Roman", serif';
  ctx.fillText('$1,000,000', 40, 140);

  ctx.font = '16px "Courier New", monospace';
  ctx.fillText('N° DE SERIE: SN-849204', 40, 200);
  ctx.fillText('SEGURIDAD NACIONAL - EMISIÓN 1984', 40, 230);

  // Bank crest watermark circle
  ctx.beginPath();
  ctx.arc(w - 120, h / 2, 70, 0, Math.PI * 2);
  ctx.strokeStyle = '#85a38b';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.font = 'bold 18px "Times New Roman", serif';
  ctx.fillText('VERITAS', w - 160, h / 2 + 6);

  // -------------------------------------------------------------
  // UV REVELATION LAYER (Phosphorescent glowing green/cyan ink)
  // -------------------------------------------------------------
  if (uvIntensity > 0.05) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, uvIntensity);

    // Glowing blacklight background tint
    ctx.fillStyle = 'rgba(75, 0, 130, 0.4)';
    ctx.fillRect(0, 0, w, h);

    // Phosphorescent text
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#69f0ae';

    ctx.font = 'bold 26px "Courier New", monospace';
    ctx.fillText('✦ PROTOCOLO BÓVEDA OMEGA ✦', 70, 280);

    ctx.font = 'bold 28px "JetBrains Mono", monospace';
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('CÓDIGO: (84 + 92) * 27 + 73 = 4829', 70, 315);

    ctx.restore();
  }
}

export function createBanknoteTexture(uvIntensity = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 700;
  canvas.height = 350;
  renderBanknoteCanvas(canvas, uvIntensity);
  const texture = new THREE.CanvasTexture(canvas);
  texture.userData = { canvas, uvIntensity };
  return texture;
}

export function createVaultKeypadTexture(displayText = '------', powered = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1e24';
  ctx.fillRect(0, 0, 256, 256);

  // Header display bezel
  ctx.fillStyle = '#000';
  ctx.fillRect(16, 16, 224, 60);
  ctx.strokeStyle = '#37474f';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, 224, 60);

  // LCD text
  ctx.font = 'bold 26px "JetBrains Mono", monospace';
  if (!powered) {
    ctx.fillStyle = '#37474f';
    ctx.fillText('SIN ENERGÍA', 28, 55);
  } else {
    ctx.fillStyle = '#00e676';
    ctx.shadowColor = '#00e676';
    ctx.shadowBlur = 10;
    ctx.fillText(displayText || 'INGRESE CLAVE', 28, 55);
  }

  // Keypad button grid representation
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#263238';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const bx = 32 + c * 68;
      const by = 90 + r * 38;
      ctx.fillRect(bx, by, 56, 30);
      ctx.strokeStyle = '#455a64';
      ctx.strokeRect(bx, by, 56, 30);
    }
  }

  return new THREE.CanvasTexture(canvas);
}

export function createVaultDoorDetailTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Metallic brushed steel radial look
  ctx.fillStyle = '#37474f';
  ctx.fillRect(0, 0, 512, 512);

  // Concentric reinforcement rings
  ctx.strokeStyle = '#263238';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(256, 256, 220, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 256, 170, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(256, 256, 100, 0, Math.PI * 2);
  ctx.stroke();

  // Radial bolts markers (8 positions)
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const bx = 256 + Math.cos(angle) * 195;
    const by = 256 + Math.sin(angle) * 195;

    ctx.fillStyle = '#ffab00';
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Stencil Warning
  ctx.fillStyle = '#cfd8dc';
  ctx.font = 'bold 20px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SISTEMA BÓVEDA DE MÁXIMA SEGURIDAD', 256, 210);
  ctx.font = 'bold 28px "JetBrains Mono", monospace';
  ctx.fillStyle = '#00e5ff';
  ctx.fillText('CLASE IV - 20 TONS', 256, 310);

  return new THREE.CanvasTexture(canvas);
}

// Room 2: Cyber Circuit Floor Texture
export function createCyberFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark metallic background
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, 512, 512);

  // Hexagonal and square tech grid
  ctx.strokeStyle = '#162035';
  ctx.lineWidth = 2;
  const step = 64;
  for (let x = 0; x <= 512; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let y = 0; y <= 512; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Glowing neon cyan / magenta data circuit traces
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 3;

  // Circuit trace 1
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(128, 128);
  ctx.lineTo(192, 192);
  ctx.lineTo(384, 192);
  ctx.lineTo(448, 256);
  ctx.lineTo(512, 256);
  ctx.stroke();

  // Circuit trace 2
  ctx.shadowColor = '#d500f9';
  ctx.strokeStyle = '#d500f9';
  ctx.beginPath();
  ctx.moveTo(128, 512);
  ctx.lineTo(128, 384);
  ctx.lineTo(256, 256);
  ctx.lineTo(256, 64);
  ctx.lineTo(320, 0);
  ctx.stroke();

  // Integrated circuit nodes
  [
    [128, 128, '#00e5ff'], [384, 192, '#00e5ff'], [448, 256, '#00e5ff'],
    [128, 384, '#d500f9'], [256, 256, '#00e5ff'], [256, 64, '#d500f9']
  ].forEach(([cx, cy, col]) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Room 2: Server Mainframe Rack Front Panel Texture
export function createServerRackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark matte rack chassis
  ctx.fillStyle = '#10141d';
  ctx.fillRect(0, 0, 256, 512);

  // Server blade modules (12 units)
  const units = 10;
  const unitH = 512 / units;
  for (let i = 0; i < units; i++) {
    const y = i * unitH;
    // Server panel
    ctx.fillStyle = i % 2 === 0 ? '#181e2b' : '#141822';
    ctx.fillRect(8, y + 2, 240, unitH - 4);
    ctx.strokeStyle = '#263045';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, y + 2, 240, unitH - 4);

    // Ventilation slots
    ctx.fillStyle = '#0a0d14';
    for (let s = 24; s < 140; s += 10) {
      ctx.fillRect(s, y + 14, 6, unitH - 28);
    }

    // Status LEDs
    const ledCols = ['#00e676', '#00e5ff', '#ffab00', '#00e676'];
    ledCols.forEach((col, lIdx) => {
      ctx.fillStyle = Math.random() > 0.15 ? col : '#263238';
      ctx.beginPath();
      ctx.arc(160 + lIdx * 18, y + unitH / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Drive handle
    ctx.fillStyle = '#37474f';
    ctx.fillRect(230, y + 8, 8, unitH - 16);
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Robot Visor Dynamic Canvas Renderer (Expression: 'normal', 'happy', 'hearts')
export function renderRobotVisorCanvas(canvas, expression = 'normal', colorHex = '#00e5ff') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Dark cyber-glass visor
  ctx.fillStyle = '#050a12';
  ctx.fillRect(0, 0, w, h);

  // Visor edge scanline effect
  ctx.fillStyle = 'rgba(0, 229, 255, 0.05)';
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 2);
  }

  ctx.shadowColor = colorHex;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = colorHex;
  ctx.fillStyle = colorHex;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';

  if (expression === 'happy') {
    // Happy robot eyes: ^  ^
    // Left eye ^
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.65);
    ctx.lineTo(w * 0.35, h * 0.35);
    ctx.lineTo(w * 0.48, h * 0.65);
    ctx.stroke();

    // Right eye ^
    ctx.beginPath();
    ctx.moveTo(w * 0.52, h * 0.65);
    ctx.lineTo(w * 0.65, h * 0.35);
    ctx.lineTo(w * 0.78, h * 0.65);
    ctx.stroke();

    // Small smile line: ‿
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.68, 12, 0.1 * Math.PI, 0.9 * Math.PI, false);
    ctx.stroke();
  } else if (expression === 'hearts') {
    // Heart eyes for amorcito! ♥  ♥
    const drawHeart = (cx, cy, size) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy + size * 0.4);
      ctx.bezierCurveTo(cx - size, cy - size * 0.4, cx - size * 0.6, cy - size, cx, cy - size * 0.4);
      ctx.bezierCurveTo(cx + size * 0.6, cy - size, cx + size, cy - size * 0.4, cx, cy + size * 0.4);
      ctx.fill();
    };
    ctx.fillStyle = '#ff1744';
    ctx.shadowColor = '#ff1744';
    drawHeart(w * 0.35, h * 0.5, 18);
    drawHeart(w * 0.65, h * 0.5, 18);

    // Smile
    ctx.strokeStyle = '#ff80ab';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.72, 10, 0, Math.PI, false);
    ctx.stroke();
  } else {
    // Normal / Tactical scan eyes: Sleek angled glowing optic bars
    // Left eye bar
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(w * 0.22, h * 0.42, w * 0.22, 12, 6) : ctx.rect(w * 0.22, h * 0.42, w * 0.22, 12);
    ctx.fill();

    // Right eye bar
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(w * 0.56, h * 0.42, w * 0.22, 12, 6) : ctx.rect(w * 0.56, h * 0.42, w * 0.22, 12);
    ctx.fill();

    // Subtle tactical dot
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// CIRCUS / CLOWN HORROR TEXTURES
// ---------------------------------------------------------------------------

export function createCircusTentTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Red & Black/Deep Crimson Circus stripes with grim grime
  const stripeW = 64;
  for (let x = 0; x < 512; x += stripeW) {
    const isRed = (x / stripeW) % 2 === 0;
    ctx.fillStyle = isRed ? '#8a1018' : '#141416';
    ctx.fillRect(x, 0, stripeW, 512);

    // Weathered canvas shading
    const grad = ctx.createLinearGradient(x, 0, x + stripeW, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.4)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, stripeW, 512);
  }

  // Grime and blood splatters / distress
  for (let i = 0; i < 40; i++) {
    const sx = Math.random() * 512;
    const sy = Math.random() * 512;
    const rad = 2 + Math.random() * 6;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(40, 5, 5, 0.45)' : 'rgba(10, 10, 10, 0.5)';
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Canvas cloth fibers noise
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createCircusWoodFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark weathered barnwood floor with creepy circus stains
  ctx.fillStyle = '#1c1613';
  ctx.fillRect(0, 0, 512, 512);

  const plankH = 64;
  for (let y = 0; y < 512; y += plankH) {
    // Individual plank tone variation
    const baseTone = 20 + Math.floor(Math.random() * 14);
    ctx.fillStyle = `rgb(${baseTone + 8}, ${baseTone + 2}, ${baseTone})`;
    ctx.fillRect(0, y + 2, 512, plankH - 4);

    // Wood grain lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const lineY = y + 6 + Math.random() * (plankH - 12);
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.bezierCurveTo(170, lineY + (Math.random() - 0.5) * 6, 340, lineY + (Math.random() - 0.5) * 6, 512, lineY);
      ctx.stroke();
    }

    // Plank seams and nail holes
    ctx.strokeStyle = '#0a0807';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, y, 512, plankH);

    ctx.fillStyle = '#0a0807';
    [24, 256, 488].forEach(nx => {
      ctx.beginPath();
      ctx.arc(nx, y + 10, 2.5, 0, Math.PI * 2);
      ctx.arc(nx, y + plankH - 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Blood splatters and scratches
  ctx.fillStyle = 'rgba(110, 10, 10, 0.4)';
  ctx.beginPath();
  ctx.arc(280, 220, 28, 0, Math.PI * 2);
  ctx.fill();
  for (let s = 0; s < 8; s++) {
    ctx.beginPath();
    ctx.arc(280 + (Math.random() - 0.5) * 70, 220 + (Math.random() - 0.5) * 70, 3 + Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createCreepyClownPosterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  // Aged yellowish poster background
  ctx.fillStyle = '#c8b488';
  ctx.fillRect(0, 0, 512, 768);

  // Distressed border
  ctx.strokeStyle = '#3e1a14';
  ctx.lineWidth = 14;
  ctx.strokeRect(20, 20, 472, 728);
  ctx.lineWidth = 3;
  ctx.strokeRect(32, 32, 448, 704);

  // Header banner
  ctx.fillStyle = '#6b1111';
  ctx.fillRect(36, 36, 440, 100);

  ctx.fillStyle = '#ffd54f';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CIRCO DEL TERROR', 256, 96);

  // Clown face illustration in center
  const cx = 256;
  const cy = 340;

  // Clown white face
  ctx.fillStyle = '#e8e5db';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 95, 120, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Frizzy red/orange hair puffs
  ctx.fillStyle = '#c2185b';
  [-95, 95].forEach(hx => {
    ctx.beginPath();
    ctx.arc(cx + hx, cy - 30, 45, 0, Math.PI * 2);
    ctx.arc(cx + hx, cy + 20, 40, 0, Math.PI * 2);
    ctx.fill();
  });

  // Creepy arched eyes with blue triangles
  ctx.fillStyle = '#0288d1';
  // Left eye paint
  ctx.beginPath();
  ctx.moveTo(cx - 45, cy - 70);
  ctx.lineTo(cx - 20, cy - 10);
  ctx.lineTo(cx - 70, cy - 10);
  ctx.closePath();
  ctx.fill();
  // Right eye paint
  ctx.beginPath();
  ctx.moveTo(cx + 45, cy - 70);
  ctx.lineTo(cx + 70, cy - 10);
  ctx.lineTo(cx + 20, cy - 10);
  ctx.closePath();
  ctx.fill();

  // Sinister yellow glowing eyes
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath();
  ctx.arc(cx - 45, cy - 25, 9, 0, Math.PI * 2);
  ctx.arc(cx + 45, cy - 25, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(cx - 45, cy - 25, 4, 0, Math.PI * 2);
  ctx.arc(cx + 45, cy - 25, 4, 0, Math.PI * 2);
  ctx.fill();

  // Bulbous red nose
  ctx.fillStyle = '#d32f2f';
  ctx.beginPath();
  ctx.arc(cx, cy + 12, 22, 0, Math.PI * 2);
  ctx.fill();

  // Wide sinister red smile with sharp jagged teeth
  ctx.fillStyle = '#b71c1c';
  ctx.beginPath();
  ctx.moveTo(cx - 75, cy + 30);
  ctx.quadraticCurveTo(cx, cy + 110, cx + 75, cy + 30);
  ctx.quadraticCurveTo(cx, cy + 60, cx - 75, cy + 30);
  ctx.fill();
  ctx.stroke();

  // Sharp teeth
  ctx.fillStyle = '#fff';
  for (let t = -50; t <= 50; t += 20) {
    ctx.beginPath();
    ctx.moveTo(cx + t - 6, cy + 46);
    ctx.lineTo(cx + t, cy + 60);
    ctx.lineTo(cx + t + 6, cy + 46);
    ctx.fill();
  }

  // Teardrop on cheek
  ctx.fillStyle = '#0288d1';
  ctx.beginPath();
  ctx.arc(cx - 38, cy + 22, 6, 0, Math.PI * 2);
  ctx.fill();

  // Poster slogans
  ctx.fillStyle = '#8b0000';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('¡SONRÍE O NO ESCAPAS!', 256, 520);

  ctx.fillStyle = '#222';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('EL GRAN PENNY TE ESPERA', 256, 560);
  ctx.fillText('GRAN FUNCION DE MEDIANOCHE', 256, 600);

  ctx.fillStyle = '#6b1111';
  ctx.font = 'italic 16px sans-serif';
  ctx.fillText('"Nadie ha logrado salir con vida de esta carpa..."', 256, 680);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export function createJackInTheBoxTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Harlequin checkered clown pattern (Deep Red & Dirty Gold)
  const size = 64;
  for (let x = 0; x < 512; x += size) {
    for (let y = 0; y < 512; y += size) {
      const isAlt = (x / size + y / size) % 2 === 0;
      ctx.fillStyle = isAlt ? '#991b1b' : '#d97706';
      ctx.fillRect(x, y, size, size);

      // Diamond accents
      ctx.fillStyle = isAlt ? '#7f1d1d' : '#b45309';
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y + 10);
      ctx.lineTo(x + size - 10, y + size / 2);
      ctx.lineTo(x + size / 2, y + size - 10);
      ctx.lineTo(x + 10, y + size / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Metal brass edge border
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, 496, 496);

  // Corner brass rivets
  ctx.fillStyle = '#fef08a';
  [
    [24, 24], [488, 24], [24, 488], [488, 488],
    [256, 24], [256, 488], [24, 256], [488, 256]
  ].forEach(([rx, ry]) => {
    ctx.beginPath();
    ctx.arc(rx, ry, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export function createSafeInteriorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Dark gunmetal interior lining with velvet sheen
  ctx.fillStyle = '#181b22';
  ctx.fillRect(0, 0, 256, 256);

  // Brushed steel scratches
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // Safe serial stamp
  ctx.fillStyle = '#374151';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('CAJA DE SEGURIDAD #104 - DEPOSITO VIP', 16, 240);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

