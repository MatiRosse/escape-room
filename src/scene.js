import * as THREE from 'three';
import {
  createConcreteTexture,
  createFloorTileTexture,
  createHazardTexture,
  createSafeDepositGridTexture,
  createBanknoteTexture,
  renderBanknoteCanvas,
  createVaultKeypadTexture,
  createVaultDoorDetailTexture,
  createCyberFloorTexture,
  createServerRackTexture,
  renderRobotVisorCanvas,
  createCircusTentTexture,
  createCircusWoodFloorTexture,
  createCreepyClownPosterTexture,
  createJackInTheBoxTexture,
  createSafeInteriorTexture
} from './textures.js';

export class EscapeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Active map theme ('vault' | 'circus')
    this.mapTheme = 'vault';

    // Core Three.js components
    this.renderer = null;
    this.scene = null;
    this.camera = null;

    // Interactive 3D Objects map for raycasting
    this.interactiveObjects = [];

    // Animated references
    this.animatedObjects = {
      drawer: null,
      safe104Door: null,
      fusePanelDoor: null,
      vaultDoorPivot: null,
      vaultWheel: null,
      vaultBolts: [],
      emergencyBeacon: null,
      uvFlashlightMesh: null,
      masterFuseMesh: null,
      keycardMesh: null,
      breakerSwitches: [],
      // Room 2 Animated Objects
      quantumCore: null,
      quantumCoreMaterial: null,
      quantumRings: [],
      quantumLight: null,
      laserBeams: [],
      laserLight: null,
      airlockDoorLeft: null,
      airlockDoorRight: null,
      floatingHearts: [],
      // Circus Animated Objects
      circusBalloon: null,
      circusCrank: null,
      circusKnife: null,
      animatronicHead: null,
      animatronicEyeLight: null,
      jackBoxLid: null,
      jackSpringHead: null,
      circusCageGate: null
    };

    // Lights
    this.lights = {
      ambient: null,
      mainCeiling1: null,
      mainCeiling2: null,
      emergencyBeaconLight: null,
      playerUvSpot: null,
      safeInteriorLight: null
    };

    // Textures with dynamic updates
    this.banknoteTexture = null;
    this.banknoteMaterial = null;
    this.keypadTexture = null;
    this.keypadMaterial = null;

    // Remote players representation (Map: playerId -> Avatar Group)
    this.remotePlayers = new Map();
    this.remotePlayerMesh = null; // compatibility getter

    this.init();
  }

  init() {
    // 1. High Performance WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      precision: 'mediump'
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(1.0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // 2. Scene setup
    this.scene = new THREE.Scene();

    // 3. Camera
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 50);
    this.camera.position.set(0, 1.6, 3.5);

    // 4. Player UV / Flashlight
    this.setupPlayerFlashlight();

    // 5. Build Environment based on current Map Theme
    this.buildMap(this.mapTheme);

    window.addEventListener('resize', () => this.onWindowResize());
  }

  clearMap() {
    const toRemove = [];
    this.scene.children.forEach(child => {
      if (child !== this.camera) {
        let isRemoteAvatar = false;
        for (const [pid, avatar] of this.remotePlayers.entries()) {
          if (child === avatar) {
            isRemoteAvatar = true;
            break;
          }
        }
        if (!isRemoteAvatar) {
          toRemove.push(child);
        }
      }
    });

    toRemove.forEach(child => {
      this.scene.remove(child);
      child.traverse?.(obj => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
    });

    this.interactiveObjects.length = 0;

    // Reset animated object references
    this.animatedObjects = {
      drawer: null,
      safe104Door: null,
      fusePanelDoor: null,
      vaultDoorPivot: null,
      vaultWheel: null,
      vaultBolts: [],
      emergencyBeacon: null,
      uvFlashlightMesh: null,
      masterFuseMesh: null,
      keycardMesh: null,
      breakerSwitches: [],
      quantumCore: null,
      quantumCoreMaterial: null,
      quantumRings: [],
      quantumLight: null,
      laserBeams: [],
      laserLight: null,
      airlockDoorLeft: null,
      airlockDoorRight: null,
      floatingHearts: [],
      dustParticles: null,
      circusBalloon: null,
      circusCrank: null,
      circusKnife: null,
      animatronicHead: null,
      animatronicEyeLight: null,
      jackBoxLid: null,
      jackSpringHead: null,
      circusCageGate: null
    };

    const uvLight = this.lights.playerUvSpot;
    this.lights = {
      ambient: null,
      mainCeiling1: null,
      mainCeiling2: null,
      emergencyBeaconLight: null,
      playerUvSpot: uvLight,
      safeInteriorLight: null
    };
  }

  buildMap(theme = 'vault') {
    this.mapTheme = theme;
    this.clearMap();

    if (theme === 'circus') {
      this.scene.background = new THREE.Color(0x0e0508);
      this.scene.fog = new THREE.FogExp2(0x0e0508, 0.05);
      this.buildCircusScene();
    } else {
      this.scene.background = new THREE.Color(0x141824);
      this.scene.fog = new THREE.Fog(0x141824, 14, 38);
      this.setupLighting();
      this.buildRoomShell();
      this.buildVaultDoor();
      this.buildSecurityDesk();
      this.buildSafeDepositWall();
      this.buildElectricalPanel();
      this.buildFramedBanknote();
      this.buildCeilingDetails();
      this.buildRoom2();
    }

    this.setupAtmosphericParticles(theme);
  }

  setupAtmosphericParticles(theme) {
    if (this.animatedObjects.dustParticles) {
      this.scene.remove(this.animatedObjects.dustParticles);
      this.animatedObjects.dustParticles = null;
    }

    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8.0;
      positions[i * 3 + 1] = 0.2 + Math.random() * 3.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12.0;

      velocities[i * 3] = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 1] = 0.04 + Math.random() * 0.06;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.userData = { velocities };

    const color = theme === 'circus' ? 0xff5252 : 0x00e5ff;
    const material = new THREE.PointsMaterial({
      color,
      size: 0.04,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);
    this.animatedObjects.dustParticles = particles;
  }

  setupLighting() {
    // Clear, uniform ambient and ceiling illumination
    this.lights.ambient = new THREE.HemisphereLight(0xdce7f6, 0x182030, 1.25);
    this.scene.add(this.lights.ambient);

    // Single-pass directional shadow light (512x512 map for maximum FPS)
    const shadowSun = new THREE.DirectionalLight(0xe0f7fa, 0.8);
    shadowSun.position.set(0, 3.8, 0);
    shadowSun.castShadow = true;
    shadowSun.shadow.mapSize.width = 512;
    shadowSun.shadow.mapSize.height = 512;
    shadowSun.shadow.camera.near = 0.5;
    shadowSun.shadow.camera.far = 10;
    shadowSun.shadow.camera.left = -4.5;
    shadowSun.shadow.camera.right = 4.5;
    shadowSun.shadow.camera.top = 5;
    shadowSun.shadow.camera.bottom = -5;
    shadowSun.shadow.bias = -0.001;
    this.scene.add(shadowSun);

    // Main fluorescent ceiling light (no shadows)
    this.lights.mainCeiling1 = new THREE.PointLight(0xe0f7fa, 0.9, 14, 1.8);
    this.lights.mainCeiling1.position.set(0, 3.3, 0);
    this.lights.mainCeiling1.castShadow = false;
    this.scene.add(this.lights.mainCeiling1);

    // Red Emergency Beacon Light (Rotating)
    this.lights.emergencyBeaconLight = new THREE.PointLight(0xff1744, 1.2, 8, 2.0);
    this.lights.emergencyBeaconLight.position.set(3.4, 3.2, 4.4);
    this.scene.add(this.lights.emergencyBeaconLight);

    // Emergency beacon mesh
    const beaconGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.2, 12);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xff1744,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.85
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.copy(this.lights.emergencyBeaconLight.position);
    this.scene.add(beacon);
    this.animatedObjects.emergencyBeacon = beacon;
  }

  setupPlayerFlashlight() {
    // Player UV Spotlight (attached to camera, activated with [F])
    this.lights.playerUvSpot = new THREE.SpotLight(0xba68c8, 0, 9, Math.PI / 5.5, 0.4, 1.5);
    this.lights.playerUvSpot.position.set(0, 0, 0);
    this.lights.playerUvSpot.castShadow = false;

    // Target slightly in front of camera
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0, -3.5);
    this.camera.add(spotTarget);
    this.camera.add(this.lights.playerUvSpot);
    this.lights.playerUvSpot.target = spotTarget;
    this.scene.add(this.camera);
  }

  buildRoomShell() {
    const roomWidth = 8;
    const roomHeight = 3.6;
    const roomDepth = 10;

    const concreteTex = createConcreteTexture();
    concreteTex.repeat.set(4, 2);

    const floorTex = createFloorTileTexture();
    floorTex.repeat.set(6, 8);

    const wallMat = new THREE.MeshStandardMaterial({
      map: concreteTex,
      roughness: 0.85,
      metalness: 0.15
    });

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.45,
      metalness: 0.25
    });

    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x14171f,
      roughness: 0.9,
      metalness: 0.3
    });

    // Floor
    const floorGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Ceiling
    const ceiling = new THREE.Mesh(floorGeo, ceilingMat);
    ceiling.position.y = roomHeight;
    ceiling.rotation.x = Math.PI / 2;
    this.scene.add(ceiling);

    // Back Wall (Behind spawn points, z = +5.0)
    const backWallGeo = new THREE.PlaneGeometry(roomWidth, roomHeight);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, roomHeight / 2, roomDepth / 2);
    backWall.rotation.y = Math.PI;
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // Left Wall (x = -4.0)
    const sideWallGeo = new THREE.PlaneGeometry(roomDepth, roomHeight);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-roomWidth / 2, roomHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    // Right Wall (x = +4.0)
    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(roomWidth / 2, roomHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    // Front Wall with Vault archway cutout (z = -5.0)
    // Left section
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(2.5, roomHeight, 0.4), wallMat);
    frontWallLeft.position.set(-2.75, roomHeight / 2, -roomDepth / 2);
    frontWallLeft.receiveShadow = true;
    this.scene.add(frontWallLeft);

    // Right section
    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(2.5, roomHeight, 0.4), wallMat);
    frontWallRight.position.set(2.75, roomHeight / 2, -roomDepth / 2);
    frontWallRight.receiveShadow = true;
    this.scene.add(frontWallRight);

    // Top lintel
    const frontWallTop = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.8, 0.4), wallMat);
    frontWallTop.position.set(0, roomHeight - 0.4, -roomDepth / 2);
    frontWallTop.receiveShadow = true;
    this.scene.add(frontWallTop);

    // Hazard caution strips around vault threshold
    const hazardTex = createHazardTexture();
    hazardTex.repeat.set(4, 1);
    const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.5 });
    const hazardFloorStrip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.02, 0.4), hazardMat);
    hazardFloorStrip.position.set(0, 0.01, -roomDepth / 2 + 0.3);
    this.scene.add(hazardFloorStrip);

    // Conduits / Industrial pipes along ceiling
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x455a64, metalness: 0.8, roughness: 0.3 });
    const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, roomDepth, 16), pipeMat);
    pipe1.position.set(-3.7, 3.4, 0);
    pipe1.rotation.x = Math.PI / 2;
    this.scene.add(pipe1);

    const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, roomDepth, 16), pipeMat);
    pipe2.position.set(-3.55, 3.45, 0);
    pipe2.rotation.x = Math.PI / 2;
    this.scene.add(pipe2);
  }

  buildVaultDoor() {
    // Stacks of Gold Bars on side security plinths inside vault threshold!
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.95,
      roughness: 0.15,
      emissive: 0x332600
    });
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x212733, metalness: 0.6, roughness: 0.4 });

    [-1.6, 1.6].forEach(xSide => {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), plinthMat);
      plinth.position.set(xSide, 0.2, -6.0);
      this.scene.add(plinth);

      for (let layer = 0; layer < 3; layer++) {
        for (let g = 0; g < 2; g++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.18), goldMat);
          bar.position.set(xSide - 0.12 + g * 0.24, 0.44 + layer * 0.08, -6.0);
          this.scene.add(bar);
        }
      }
    });

    // Heavy Circular Vault Door Frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x263238,
      metalness: 0.85,
      roughness: 0.3
    });
    const frameMesh = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.15, 16, 32), frameMat);
    frameMesh.position.set(0, 1.5, -4.95);
    this.scene.add(frameMesh);

    // Vault Door Pivot Hinge Group (rotates door open)
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-1.45, 1.5, -4.95);
    this.scene.add(doorPivot);
    this.animatedObjects.vaultDoorPivot = doorPivot;

    // Door Disc Group (offset from pivot by +1.45 so door center is at x=0)
    const doorGroup = new THREE.Group();
    doorGroup.position.set(1.45, 0, 0);
    doorPivot.add(doorGroup);

    const vaultTex = createVaultDoorDetailTexture();
    const vaultDoorMat = new THREE.MeshStandardMaterial({
      map: vaultTex,
      metalness: 0.8,
      roughness: 0.25
    });
    const doorDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.25, 32), vaultDoorMat);
    doorDisc.rotation.x = Math.PI / 2;
    doorDisc.castShadow = true;
    doorDisc.receiveShadow = true;
    doorGroup.add(doorDisc);

    // 8 Radial Locking Bolts
    const boltMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.9, roughness: 0.2 });
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.4, 16), boltMat);
      bolt.position.set(Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0);
      bolt.rotation.z = angle + Math.PI / 2;
      doorGroup.add(bolt);
      this.animatedObjects.vaultBolts.push(bolt);
    }

    // Heavy Central Pressure Wheel
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0, 0, 0.18);
    doorGroup.add(wheelGroup);
    this.animatedObjects.vaultWheel = wheelGroup;

    const wheelHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.12, 16),
      new THREE.MeshStandardMaterial({ color: 0x101416, metalness: 0.9, roughness: 0.2 })
    );
    wheelHub.rotation.x = Math.PI / 2;
    wheelGroup.add(wheelHub);

    const wheelRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.035, 12, 24),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 })
    );
    wheelGroup.add(wheelRim);

    // 4 Spokes
    for (let s = 0; s < 4; s++) {
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.9, 12),
        new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.9, roughness: 0.2 })
      );
      spoke.rotation.z = (s * Math.PI) / 4;
      wheelGroup.add(spoke);
    }

    // Interactive Wheel Hitbox for raycasting
    const wheelHitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    wheelHitbox.rotation.x = Math.PI / 2;
    wheelHitbox.userData = {
      type: 'VAULT_WHEEL',
      prompt: 'Girar Volante de Presión',
      key: 'CLICK'
    };
    wheelGroup.add(wheelHitbox);
    this.interactiveObjects.push(wheelHitbox);

    // Wall-mounted Electronic Keypad (mounted at x = 1.9, y = 1.5, z = -4.75)
    this.keypadTexture = createVaultKeypadTexture('------', false);
    this.keypadMaterial = new THREE.MeshStandardMaterial({
      map: this.keypadTexture,
      roughness: 0.3,
      metalness: 0.5
    });

    const keypadBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.45, 0.08),
      this.keypadMaterial
    );
    keypadBox.position.set(1.8, 1.5, -4.75);
    keypadBox.userData = {
      type: 'VAULT_KEYPAD',
      prompt: 'Usar Teclado Numérico de la Bóveda',
      key: 'CLICK'
    };
    this.scene.add(keypadBox);
    this.interactiveObjects.push(keypadBox);
  }

  buildSecurityDesk() {
    const deskGroup = new THREE.Group();
    deskGroup.position.set(-2.6, 0, 0.5);
    this.scene.add(deskGroup);

    const deskMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.6, roughness: 0.4 });
    const woodTopMat = new THREE.MeshStandardMaterial({ color: 0x4527a0, metalness: 0.1, roughness: 0.6 });

    // Tabletop
    const tabletop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.9), woodTopMat);
    tabletop.position.set(0, 0.85, 0);
    tabletop.castShadow = true;
    tabletop.receiveShadow = true;
    deskGroup.add(tabletop);

    // Metal legs / side pedestals
    const leftPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.85, 0.8), deskMat);
    leftPedestal.position.set(-0.65, 0.425, 0);
    leftPedestal.castShadow = true;
    deskGroup.add(leftPedestal);

    const rightPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.85, 0.8), deskMat);
    rightPedestal.position.set(0.65, 0.425, 0);
    rightPedestal.castShadow = true;
    deskGroup.add(rightPedestal);

    // Sliding Drawer (inside right pedestal)
    const drawerGroup = new THREE.Group();
    drawerGroup.position.set(0.65, 0.6, 0.05); // slides along +Z
    deskGroup.add(drawerGroup);
    this.animatedObjects.drawer = drawerGroup;

    const drawerBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.18, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.7, roughness: 0.3 })
    );
    drawerGroup.add(drawerBody);

    const drawerHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.02, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xffb300, metalness: 0.9, roughness: 0.2 })
    );
    drawerHandle.position.set(0, 0, 0.37);
    drawerGroup.add(drawerHandle);

    // Hitbox for drawer
    const drawerHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.25, 0.8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    drawerHitbox.userData = {
      type: 'DESK_DRAWER',
      prompt: 'Abrir / Cerrar Cajón',
      key: 'E'
    };
    drawerGroup.add(drawerHitbox);
    this.interactiveObjects.push(drawerHitbox);

    // Inside drawer: UV Flashlight item
    const uvMesh = this.buildUvFlashlightItem();
    uvMesh.position.set(0, 0.04, 0);
    drawerGroup.add(uvMesh);
    this.animatedObjects.uvFlashlightMesh = uvMesh;

    // Desktop items: CCTV Monitor
    const monitorMat = new THREE.MeshStandardMaterial({ color: 0x101318, metalness: 0.5, roughness: 0.5 });
    const monitorScreenMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.06), monitorMat);
    monitor.position.set(-0.3, 1.15, -0.15);
    monitor.rotation.y = 0.25;
    deskGroup.add(monitor);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.3), monitorScreenMat);
    screen.position.set(0, 0, 0.035);
    monitor.add(screen);

    // Desktop items: Client Archive Dossier Folder
    const folder = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.03, 0.38),
      new THREE.MeshStandardMaterial({ color: 0xc89d66, roughness: 0.9 })
    );
    folder.position.set(0.1, 0.91, 0.1);
    folder.rotation.y = -0.3;
    folder.userData = {
      type: 'ARCHIVE_FOLDER',
      prompt: 'Inspeccionar Carpeta de Clientes',
      key: 'CLICK'
    };
    deskGroup.add(folder);
    this.interactiveObjects.push(folder);
  }

  buildUvFlashlightItem() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.8, roughness: 0.3 });
    const purpleLensMat = new THREE.MeshStandardMaterial({
      color: 0xba68c8,
      emissive: 0x9c27b0,
      emissiveIntensity: 0.8
    });

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 16), bodyMat);
    tube.rotation.x = Math.PI / 2;
    group.add(tube);

    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.05, 16), bodyMat);
    head.position.z = 0.09;
    head.rotation.x = Math.PI / 2;
    group.add(head);

    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), purpleLensMat);
    lens.position.z = 0.116;
    group.add(lens);

    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.userData = {
      type: 'UV_FLASHLIGHT',
      prompt: 'Recoger Linterna UV',
      key: 'E'
    };
    group.add(hitbox);
    this.interactiveObjects.push(hitbox);

    return group;
  }

  buildSafeDepositWall() {
    const wallGroup = new THREE.Group();
    wallGroup.position.set(3.8, 1.6, 0);
    this.scene.add(wallGroup);

    const gridTex = createSafeDepositGridTexture();
    const gridMat = new THREE.MeshStandardMaterial({ map: gridTex, metalness: 0.8, roughness: 0.3 });

    // 4x4 wall surface
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 2.4), gridMat);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    wallGroup.add(wallMesh);

    // Realistic Recessed Interior Cavity for Safe Box #104
    const cavityMat = new THREE.MeshStandardMaterial({
      map: createSafeInteriorTexture(),
      color: 0x222834,
      metalness: 0.85,
      roughness: 0.25
    });

    // Cavity interior box: back wall, top, bottom, sides
    const cavityBack = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), cavityMat);
    cavityBack.position.set(0.08, 0.3, -0.04);
    cavityBack.rotation.y = -Math.PI / 2;
    wallGroup.add(cavityBack);

    // Cavity interior top/bottom/sides
    const cavityTrimMat = new THREE.MeshStandardMaterial({ color: 0x111620, metalness: 0.9, roughness: 0.2 });
    const cavityTop = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.5), cavityTrimMat);
    cavityTop.position.set(-0.01, 0.55, -0.04);
    cavityTop.rotation.x = Math.PI / 2;
    wallGroup.add(cavityTop);

    const cavityBottom = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.5), cavityTrimMat);
    cavityBottom.position.set(-0.01, 0.05, -0.04);
    cavityBottom.rotation.x = -Math.PI / 2;
    wallGroup.add(cavityBottom);

    const cavitySideL = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.5), cavityTrimMat);
    cavitySideL.position.set(-0.01, 0.3, -0.29);
    wallGroup.add(cavitySideL);

    const cavitySideR = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.5), cavityTrimMat);
    cavitySideR.position.set(-0.01, 0.3, 0.21);
    cavitySideR.rotation.y = Math.PI;
    wallGroup.add(cavitySideR);

    // Warm Interior Spotlight inside Safe #104 (turns on when opened!)
    const safeLight = new THREE.PointLight(0xffb300, 0, 3.5, 2.0);
    safeLight.position.set(-0.08, 0.45, -0.04);
    wallGroup.add(safeLight);
    this.lights.safeInteriorLight = safeLight;

    // Interactive Safe Box #104 Door (hinged at edge z = -0.3)
    const safe104Pivot = new THREE.Group();
    safe104Pivot.position.set(-0.11, 0.3, -0.3);
    wallGroup.add(safe104Pivot);
    this.animatedObjects.safe104Door = safe104Pivot;

    const doorLeafMat = new THREE.MeshStandardMaterial({ color: 0x455a64, metalness: 0.85, roughness: 0.25 });
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.52, 0.52), doorLeafMat);
    doorLeaf.position.set(0, 0, 0.26); // pivot at hinge edge
    safe104Pivot.add(doorLeaf);

    // Door bevel frame detail
    const frameDetail = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.48, 0.48),
      new THREE.MeshStandardMaterial({ color: 0x2e3c43, metalness: 0.9, roughness: 0.2 })
    );
    frameDetail.position.set(0.002, 0, 0.26);
    safe104Pivot.add(frameDetail);

    // Gold brass dial on safe 104
    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.035, 24),
      new THREE.MeshStandardMaterial({ color: 0xffb300, metalness: 0.95, roughness: 0.15 })
    );
    dial.rotation.z = Math.PI / 2;
    dial.position.set(-0.025, 0, 0.26);
    safe104Pivot.add(dial);

    // Safe #104 Hitbox
    const safe104Hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.65, 0.65),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    safe104Hitbox.position.set(-0.15, 0, 0.26);
    safe104Hitbox.userData = {
      type: 'SAFE_104',
      prompt: 'Caja Fuerte Privada #104 [CLICK]',
      key: 'CLICK'
    };
    safe104Pivot.add(safe104Hitbox);
    this.interactiveObjects.push(safe104Hitbox);

    // Inside Safe #104: Items Group
    const insideGroup = new THREE.Group();
    insideGroup.position.set(-0.02, 0.25, -0.04);
    wallGroup.add(insideGroup);

    // Master Fuse Mesh (resting visibly on left velvet stand)
    const fuseGroup = new THREE.Group();
    const ceramicMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      emissive: 0x223344,
      emissiveIntensity: 0.2
    });
    const brassCapMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.95, roughness: 0.12 });

    const fuseBody = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 16), ceramicMat);
    fuseBody.rotation.z = Math.PI / 2;
    fuseGroup.add(fuseBody);

    const capL = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.035, 16), brassCapMat);
    capL.position.x = -0.06;
    capL.rotation.z = Math.PI / 2;
    fuseGroup.add(capL);

    const capR = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.035, 16), brassCapMat);
    capR.position.x = 0.06;
    capR.rotation.z = Math.PI / 2;
    fuseGroup.add(capR);

    fuseGroup.position.set(0, 0, -0.12);
    fuseGroup.rotation.y = -Math.PI / 4;

    const fuseHitbox = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    fuseHitbox.userData = {
      type: 'MASTER_FUSE',
      prompt: '⚡ Recoger Fusible Maestro Cerámico [E]',
      key: 'E'
    };
    fuseGroup.add(fuseHitbox);
    insideGroup.add(fuseGroup);
    this.interactiveObjects.push(fuseHitbox);
    this.animatedObjects.masterFuseMesh = fuseGroup;

    // Security Keycard Mesh (standing visibly on right slot)
    const cardGroup = new THREE.Group();
    const cardMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.7,
      roughness: 0.2
    });
    const cardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.09, 0.15), cardMat);
    cardGroup.add(cardMesh);

    // Glowing cyan magnetic stripe
    const stripeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.025, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.2 })
    );
    stripeMesh.position.set(-0.004, 0, 0);
    stripeMesh.rotation.y = -Math.PI / 2;
    cardGroup.add(stripeMesh);

    // Gold microchip
    const chipMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.035, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.95, roughness: 0.1 })
    );
    chipMesh.position.set(-0.004, 0.02, 0.03);
    chipMesh.rotation.y = -Math.PI / 2;
    cardGroup.add(chipMesh);

    cardGroup.position.set(0, 0.02, 0.12);
    cardGroup.rotation.y = -Math.PI / 6;

    const cardHitbox = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    cardHitbox.userData = {
      type: 'KEYCARD',
      prompt: '💳 Recoger Tarjeta de Seguridad [E]',
      key: 'E'
    };
    cardGroup.add(cardHitbox);
    insideGroup.add(cardGroup);
    this.interactiveObjects.push(cardHitbox);
    this.animatedObjects.keycardMesh = cardGroup;
  }

  buildElectricalPanel() {
    const panelGroup = new THREE.Group();
    panelGroup.position.set(-3.85, 1.6, 2.5);
    this.scene.add(panelGroup);

    // Outer Cabinet
    const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x424242, metalness: 0.8, roughness: 0.3 });
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.9), cabinetMat);
    panelGroup.add(cabinet);

    // Hinged Door
    const doorPivot = new THREE.Group();
    doorPivot.position.set(0.1, 0, -0.45);
    panelGroup.add(doorPivot);
    this.animatedObjects.fusePanelDoor = doorPivot;

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x303030, metalness: 0.85, roughness: 0.3 });
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.16, 0.88), doorMat);
    doorMesh.position.set(0, 0, 0.44);
    doorPivot.add(doorMesh);

    // Hazard decal on door
    const hazardDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xffab00 })
    );
    hazardDecal.position.set(0.02, 0.2, 0.44);
    hazardDecal.rotation.y = Math.PI / 2;
    doorPivot.add(hazardDecal);

    // Manual pinned on inside of door
    const manualDoc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.8 })
    );
    manualDoc.position.set(-0.02, 0, 0.44);
    manualDoc.rotation.y = -Math.PI / 2;
    manualDoc.userData = {
      type: 'GUARD_MANUAL',
      prompt: 'Inspeccionar Manual del Guardia',
      key: 'CLICK'
    };
    doorPivot.add(manualDoc);
    this.interactiveObjects.push(manualDoc);

    // Interior Panel Hitbox for opening/closing
    const panelHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.2, 0.9),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    panelHitbox.userData = {
      type: 'FUSEBOX_PANEL',
      prompt: 'Abrir / Usar Panel de Fusibles',
      key: 'CLICK'
    };
    panelGroup.add(panelHitbox);
    this.interactiveObjects.push(panelHitbox);
  }

  buildFramedBanknote() {
    const frameGroup = new THREE.Group();
    frameGroup.position.set(0, 1.8, 4.9);
    this.scene.add(frameGroup);

    // Wood/Gold frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.7 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.06), frameMat);
    frameGroup.add(frame);

    // Glass & Banknote Plane
    this.banknoteTexture = createBanknoteTexture(0);
    this.banknoteMaterial = new THREE.MeshStandardMaterial({
      map: this.banknoteTexture,
      roughness: 0.4,
      metalness: 0.1
    });

    const billPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.72), this.banknoteMaterial);
    billPlane.position.z = 0.035;
    billPlane.rotation.y = Math.PI; // Face towards room interior (-Z)
    frameGroup.add(billPlane);

    // Interactive Hitbox
    const billHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.9, 0.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    billHitbox.userData = {
      type: 'FRAMED_BILL',
      prompt: 'Inspeccionar Billete Histórico',
      key: 'CLICK'
    };
    frameGroup.add(billHitbox);
    this.interactiveObjects.push(billHitbox);
  }

  buildCeilingDetails() {
    // Fluorescent fixtures meshes
    const fixGeo = new THREE.BoxGeometry(0.4, 0.1, 2.0);
    const fixMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.4 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xe0f7fa });

    [1.5, -2.5].forEach(zPos => {
      const fix = new THREE.Mesh(fixGeo, fixMat);
      fix.position.set(0, 3.55, zPos);
      this.scene.add(fix);

      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 16), bulbMat);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(0, 3.48, zPos);
      this.scene.add(bulb);
    });
  }

  // -------------------------------------------------------------
  // SALA 2: Cámara Secreta del Núcleo Cuántico y Servidores
  // -------------------------------------------------------------
  buildRoom2() {
    const room2Width = 10;
    const room2Height = 4.2;
    const room2Depth = 16;
    const room2CenterZ = -13.0; // from z = -5.0 to -21.0

    // 1. Cyber Floor
    const floorTex = createCyberFloorTexture();
    floorTex.repeat.set(4, 7);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      metalness: 0.7,
      roughness: 0.25
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(room2Width, room2Depth), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, room2CenterZ);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. Ceiling
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e17,
      metalness: 0.85,
      roughness: 0.3
    });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(room2Width, room2Depth), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, room2Height, room2CenterZ);
    this.scene.add(ceiling);

    // 3. Walls (Dark futuristic composite panels with glowing vertical neon conduits)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x111625,
      metalness: 0.75,
      roughness: 0.35
    });

    // Left Wall (x = -5.0)
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(room2Depth, room2Height), wallMat);
    leftWall.position.set(-room2Width / 2, room2Height / 2, room2CenterZ);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);

    // Right Wall (x = +5.0)
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(room2Depth, room2Height), wallMat);
    rightWall.position.set(room2Width / 2, room2Height / 2, room2CenterZ);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    // Far Back Wall (z = -21.0)
    const farWall = new THREE.Mesh(new THREE.PlaneGeometry(room2Width, room2Height), wallMat);
    farWall.position.set(0, room2Height / 2, -21.0);
    this.scene.add(farWall);

    // Neon Vertical Conduits along walls
    const neonCyanMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 1.2
    });
    const neonPurpleMat = new THREE.MeshStandardMaterial({
      color: 0xd500f9,
      emissive: 0xd500f9,
      emissiveIntensity: 1.2
    });

    [-8.0, -11.0, -14.0, -17.0].forEach((zPos, idx) => {
      const conduitMat = idx % 2 === 0 ? neonCyanMat : neonPurpleMat;
      [-4.92, 4.92].forEach(xPos => {
        const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.06, room2Height - 0.4, 0.12), conduitMat);
        conduit.position.set(xPos, room2Height / 2, zPos);
        this.scene.add(conduit);
      });
    });

    // 4. Server Mainframe Racks flanking the corridor
    const rackTex = createServerRackTexture();
    const rackFrontMat = new THREE.MeshStandardMaterial({
      map: rackTex,
      metalness: 0.6,
      roughness: 0.35
    });
    const rackBodyMat = new THREE.MeshStandardMaterial({
      color: 0x141a26,
      metalness: 0.7,
      roughness: 0.4
    });

    const rackPositions = [
      { x: -4.1, z: -8.0, rotY: Math.PI / 2 },
      { x: -4.1, z: -10.0, rotY: Math.PI / 2 },
      { x: -4.1, z: -12.0, rotY: Math.PI / 2 },
      { x: 4.1, z: -8.0, rotY: -Math.PI / 2 },
      { x: 4.1, z: -10.0, rotY: -Math.PI / 2 },
      { x: 4.1, z: -12.0, rotY: -Math.PI / 2 }
    ];

    rackPositions.forEach(pos => {
      const rackGroup = new THREE.Group();
      rackGroup.position.set(pos.x, 1.4, pos.z);
      rackGroup.rotation.y = pos.rotY;

      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.8, 0.8), rackBodyMat);
      rackGroup.add(body);

      const front = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 2.72), rackFrontMat);
      front.position.z = 0.41;
      rackGroup.add(front);

      this.scene.add(rackGroup);
    });

    // 5. Central Quantum Core Reactor (at x = 0, y = 2.1, z = -10.5)
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 2.1, -10.5);
    this.scene.add(coreGroup);

    // Floor Pedestal & Ceiling Emitter
    const metalTrimMat = new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.9, roughness: 0.2 });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x121722, metalness: 0.85, roughness: 0.25 });
    const floorPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 0.5, 24), metalTrimMat);
    floorPedestal.position.set(0, 0.25, -10.5);
    this.scene.add(floorPedestal);

    const ceilingEmitter = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.85, 0.5, 24), metalTrimMat);
    ceilingEmitter.position.set(0, room2Height - 0.25, -10.5);
    this.scene.add(ceilingEmitter);

    // Vertical Energy Containment Beam
    const energyBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, room2Height, 16),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45 })
    );
    energyBeam.position.set(0, room2Height / 2, -10.5);
    this.scene.add(energyBeam);

    // Quantum Core Sphere
    this.animatedObjects.quantumCoreMaterial = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00b0ff,
      emissiveIntensity: 1.4,
      roughness: 0.1,
      metalness: 0.8
    });
    const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), this.animatedObjects.quantumCoreMaterial);
    coreGroup.add(coreSphere);
    this.animatedObjects.quantumCore = coreSphere;

    // Glowing Concentric Gimbal Rings
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.035, 16, 32),
      new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffa000, emissiveIntensity: 0.8, metalness: 0.9 })
    );
    coreGroup.add(ring1);

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.035, 16, 32),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.8, metalness: 0.9 })
    );
    coreGroup.add(ring2);
    this.animatedObjects.quantumRings = [ring1, ring2];

    // Core Dedicated Light
    this.animatedObjects.quantumLight = new THREE.PointLight(0x00e5ff, 2.2, 14, 1.4);
    this.animatedObjects.quantumLight.position.set(0, 2.1, -10.5);
    this.scene.add(this.animatedObjects.quantumLight);

    // 6. Tablet Clue (Bitácora Cuántica) on Pedestal (at x = -1.6, z = -8.2)
    const tabStand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.0, 16), metalTrimMat);
    tabStand.position.set(-1.6, 0.5, -8.2);
    this.scene.add(tabStand);

    const tabGroup = new THREE.Group();
    tabGroup.position.set(-1.6, 1.05, -8.2);
    tabGroup.rotation.x = -Math.PI / 4;
    this.scene.add(tabGroup);

    const tabBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.03), darkMetalMat);
    tabGroup.add(tabBody);

    const tabScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.8
      })
    );
    tabScreen.position.z = 0.02;
    tabGroup.add(tabScreen);

    // Tablet Hitbox
    const tabHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    tabHitbox.position.set(-1.6, 1.05, -8.2);
    tabHitbox.userData = {
      type: 'ROOM2_TABLET',
      prompt: 'Examinar Bitácora del Núcleo Cuántico',
      key: 'CLICK'
    };
    this.scene.add(tabHitbox);
    this.interactiveObjects.push(tabHitbox);

    // 7. Terminal Alfa (Consola Izquierda, at x = -3.4, z = -10.5)
    this.buildRoom2Console(-3.4, -10.5, 'TERMINAL_ALFA', 'Calibrar Frecuencia Alfa [432 Hz]', 0x00e5ff);

    // 8. Terminal Bravo (Consola Derecha, at x = 3.4, z = -10.5)
    this.buildRoom2Console(3.4, -10.5, 'TERMINAL_BRAVO', 'Calibrar Frecuencia Bravo [528 Hz]', 0xff9100);

    // 9. Security Laser Barrier (at z = -14.2)
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x212733, metalness: 0.8, roughness: 0.3 });
    [-4.6, 4.6].forEach(pylonX => {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.4, room2Height, 0.4), pylonMat);
      pylon.position.set(pylonX, room2Height / 2, -14.2);
      this.scene.add(pylon);

      // Warning hazard beacon on top
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.15, 12),
        new THREE.MeshBasicMaterial({ color: 0xff1744 })
      );
      beacon.position.set(pylonX, room2Height - 0.2, -14.2);
      this.scene.add(beacon);
    });

    // 6 Glowing Laser Beams
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xff1744,
      transparent: true,
      opacity: 0.95
    });

    const beamHeights = [0.4, 0.85, 1.3, 1.8, 2.3];
    beamHeights.forEach(h => {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 9.2, 8), laserMat);
      beam.rotation.z = Math.PI / 2;
      beam.position.set(0, h, -14.2);
      this.scene.add(beam);
      this.animatedObjects.laserBeams.push(beam);
    });

    // Diagonal crossing beam
    const diagBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 9.6, 8), laserMat);
    diagBeam.rotation.z = Math.PI / 2 - 0.25;
    diagBeam.position.set(0, 1.35, -14.2);
    this.scene.add(diagBeam);
    this.animatedObjects.laserBeams.push(diagBeam);

    // Laser Glow Light
    this.animatedObjects.laserLight = new THREE.PointLight(0xff1744, 2.0, 8, 1.5);
    this.animatedObjects.laserLight.position.set(0, 1.35, -14.2);
    this.scene.add(this.animatedObjects.laserLight);

    // Laser Control Panel (at x = 1.8, z = -13.5)
    const laserPanelStand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.0, 12), metalTrimMat);
    laserPanelStand.position.set(1.8, 0.5, -13.5);
    this.scene.add(laserPanelStand);

    const laserPanelGroup = new THREE.Group();
    laserPanelGroup.position.set(1.8, 1.1, -13.5);
    laserPanelGroup.rotation.x = -Math.PI / 4;
    this.scene.add(laserPanelGroup);

    const laserPanelBox = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.32, 0.08), darkMetalMat);
    laserPanelGroup.add(laserPanelBox);

    const laserScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xff1744, emissiveIntensity: 0.8 })
    );
    laserScreen.position.z = 0.045;
    laserPanelGroup.add(laserScreen);

    const laserHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.5),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    laserHitbox.position.set(1.8, 1.1, -13.5);
    laserHitbox.userData = {
      type: 'LASER_CONSOLE',
      prompt: 'Consola de Barrera Láser - Clave Armónica',
      key: 'CLICK'
    };
    this.scene.add(laserHitbox);
    this.interactiveObjects.push(laserHitbox);

    // 10. Final Extraction Airlock & Escape Pod (at z = -19.5)
    const airlockFrame = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.2, 16, 32), metalTrimMat);
    airlockFrame.position.set(0, 1.8, -19.5);
    this.scene.add(airlockFrame);

    // Glowing Green Launch Platform Circle on Floor
    const launchPad = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 1.6, 32),
      new THREE.MeshStandardMaterial({
        color: 0x00e676,
        emissive: 0x00e676,
        emissiveIntensity: 1.2,
        side: THREE.DoubleSide
      })
    );
    launchPad.rotation.x = -Math.PI / 2;
    launchPad.position.set(0, 0.02, -18.2);
    this.scene.add(launchPad);

    // Final Extraction Switch / Scanner Pedestal
    const podSwitchGroup = new THREE.Group();
    podSwitchGroup.position.set(0, 1.25, -17.8);
    this.scene.add(podSwitchGroup);

    const podSwitchPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.1, 16), metalTrimMat);
    podSwitchPedestal.position.y = -0.55;
    podSwitchGroup.add(podSwitchPedestal);

    const podScanner = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.25, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 0.9 })
    );
    podSwitchGroup.add(podScanner);

    const airlockHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    airlockHitbox.position.set(0, 1.25, -17.8);
    airlockHitbox.userData = {
      type: 'FINAL_EXTRACTION',
      prompt: '¡Activar Esclusa y Escapar!',
      key: 'CLICK'
    };
    this.scene.add(airlockHitbox);
    this.interactiveObjects.push(airlockHitbox);
  }

  buildRoom2Console(xPos, zPos, interactionType, promptText, accentHex) {
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(xPos, 0, zPos);
    consoleGroup.rotation.y = xPos < 0 ? Math.PI / 3 : -Math.PI / 3;
    this.scene.add(consoleGroup);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1b2230, metalness: 0.8, roughness: 0.3 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: 0.9
    });

    // Console Desk
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.7), metalMat);
    desk.position.y = 0.5;
    consoleGroup.add(desk);

    // Angled Monitor
    const monitorGroup = new THREE.Group();
    monitorGroup.position.set(0, 1.15, -0.05);
    monitorGroup.rotation.x = -Math.PI / 6;
    consoleGroup.add(monitorGroup);

    const monitorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.08), metalMat);
    monitorGroup.add(monitorHousing);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.4), accentMat);
    screen.position.z = 0.045;
    monitorGroup.add(screen);

    // Interactive Hitbox
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 1.0),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.set(xPos, 1.1, zPos);
    hitbox.userData = {
      type: interactionType,
      prompt: promptText,
      key: 'CLICK'
    };
    this.scene.add(hitbox);
    this.interactiveObjects.push(hitbox);
  }

  // -------------------------------------------------------------
  // MAPA 2: CIRCO MALDITO - LA CARPA DEL TERROR (HORROR / PAYASOS)
  // ----------------------------------------  // -------------------------------------------------------------
  // MAPA 2: CIRCO MALDITO - LA GRAN CARPA DEL TERROR (HORROR / PAYASOS)
  // -------------------------------------------------------------
  buildCircusScene() {
    // 1. Lighting: Dim, eerie, moody carnival atmosphere with high contrast
    this.lights.ambient = new THREE.AmbientLight(0x2a1017, 0.6);
    this.scene.add(this.lights.ambient);

    // Tent Chandelier: Central brass ring with 6 warm carnival Edison bulbs
    const chGroup = new THREE.Group();
    chGroup.position.set(0, 5.2, 0);
    this.scene.add(chGroup);

    const chRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.06, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x24180d, metalness: 0.85, roughness: 0.3 })
    );
    chRing.rotation.x = Math.PI / 2;
    chGroup.add(chRing);

    // Center warm chandelier point light
    const chLightWarm = new THREE.PointLight(0xffa726, 1.6, 16, 1.8);
    chLightWarm.position.set(0, 5.0, 0);
    this.scene.add(chLightWarm);

    // Eerie blood-red mood light
    const chLightRed = new THREE.PointLight(0xd50000, 1.1, 14, 1.8);
    chLightRed.position.set(0, 4.4, 0);
    this.scene.add(chLightRed);

    // 6 Chandelier Bulbs on the ring
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const bx = Math.cos(angle) * 1.6;
      const bz = Math.sin(angle) * 1.6;
      const bulbMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshStandardMaterial({
          color: 0xffd54f,
          emissive: 0xffb300,
          emissiveIntensity: 0.9,
          roughness: 0.2
        })
      );
      bulbMesh.position.set(bx, 0, bz);
      chGroup.add(bulbMesh);

      const chainGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(bx, 0, bz),
        new THREE.Vector3(0, 2.4, 0)
      ]);
      const chain = new THREE.Line(chainGeo, new THREE.LineBasicMaterial({ color: 0x3e2723 }));
      chGroup.add(chain);
    }

    // 2. Circus Tent Structure: 16-sided Big Top with diameter 17m (radius 8.5m)
    const tentWallTex = createCircusTentTexture();
    tentWallTex.repeat.set(8, 1);
    const tentWallMat = new THREE.MeshStandardMaterial({
      map: tentWallTex,
      roughness: 0.85,
      side: THREE.DoubleSide
    });

    const tentWall = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 5.4, 16, 1, true), tentWallMat);
    tentWall.position.set(0, 2.7, 0);
    tentWall.receiveShadow = true;
    this.scene.add(tentWall);

    // Soaring conical draped roof (apex up to height 8.2m)
    const tentRoofMat = new THREE.MeshStandardMaterial({
      map: tentWallTex,
      roughness: 0.9,
      side: THREE.DoubleSide
    });
    const tentRoof = new THREE.Mesh(new THREE.ConeGeometry(8.8, 3.2, 16, 1, true), tentRoofMat);
    tentRoof.position.set(0, 7.0, 0);
    this.scene.add(tentRoof);

    // Center Tent Master Mast Pole (Wood & Iron with rigging)
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.7 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 8.8, 16), mastMat);
    mast.position.set(0, 4.4, 0);
    this.scene.add(mast);

    // Iron reinforcement rings on center mast
    const ironRingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.3 });
    [1.5, 3.0, 4.5, 6.0, 7.5].forEach(y => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 16), ironRingMat);
      ring.position.set(0, y, 0);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    });

    // 4 Perimeter support posts
    const postAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
    postAngles.forEach(ang => {
      const px = Math.cos(ang) * 7.4;
      const pz = Math.sin(ang) * 7.4;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.4, 12), mastMat);
      post.position.set(px, 2.7, pz);
      this.scene.add(post);

      const ropeGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 7.8, 0),
        new THREE.Vector3(px, 5.2, pz)
      ]);
      const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x4a3525 }));
      this.scene.add(rope);
    });

    // 3. Wooden Sawdust Arena Floor & Raised Ring Curb
    const floorTex = createCircusWoodFloorTexture();
    floorTex.repeat.set(4, 4);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(8.8, 8.8, 0.2, 32), floorMat);
    floor.position.set(0, -0.1, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Circular arena ring border / curb (radius 5.2m, separating the center circus arena)
    const ringCurb = new THREE.Mesh(
      new THREE.TorusGeometry(5.2, 0.14, 8, 36),
      new THREE.MeshStandardMaterial({ color: 0x6d1b24, roughness: 0.6 })
    );
    ringCurb.position.set(0, 0.12, 0);
    ringCurb.rotation.x = Math.PI / 2;
    this.scene.add(ringCurb);

    // Golden curb star studs
    for (let s = 0; s < 12; s++) {
      const sa = (s / 12) * Math.PI * 2;
      const star = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.04, 5),
        new THREE.MeshStandardMaterial({ color: 0xffd54f, metalness: 0.8, roughness: 0.3 })
      );
      star.position.set(Math.cos(sa) * 5.2, 0.22, Math.sin(sa) * 5.2);
      this.scene.add(star);
    }

    // 4. Carnival Festoon String Lights draped across the ceiling
    for (let s = 0; s < 8; s++) {
      const ang = (s / 8) * Math.PI * 2;
      const targetX = Math.cos(ang) * 8.0;
      const targetZ = Math.sin(ang) * 8.0;

      const p0 = new THREE.Vector3(0, 7.2, 0);
      const pMid = new THREE.Vector3(targetX * 0.5, 4.4, targetZ * 0.5);
      const pEnd = new THREE.Vector3(targetX, 5.0, targetZ);

      const curve = new THREE.QuadraticBezierCurve3(p0, pMid, pEnd);
      const curvePoints = curve.getPoints(12);
      const stringGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const stringLine = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0x261d15 }));
      this.scene.add(stringLine);

      [0.35, 0.7].forEach(t => {
        const pt = curve.getPoint(t);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 6, 6),
          new THREE.MeshStandardMaterial({
            color: s % 2 === 0 ? 0xffb74d : 0xff5252,
            emissive: s % 2 === 0 ? 0xff9800 : 0xd50000,
            emissiveIntensity: 0.8
          })
        );
        bulb.position.copy(pt);
        this.scene.add(bulb);
      });
    }

    // 5. Trapeze Swing suspended high in the dome
    const trapezeGroup = new THREE.Group();
    trapezeGroup.position.set(0, 5.8, -1.5);
    this.scene.add(trapezeGroup);

    const trapRopeMat = new THREE.LineBasicMaterial({ color: 0xd7ccc8 });
    const ropeLeft = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.7, 1.8, 0),
      new THREE.Vector3(-0.7, 0, 0)
    ]), trapRopeMat);
    const ropeRight = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.7, 1.8, 0),
      new THREE.Vector3(0.7, 0, 0)
    ]), trapRopeMat);
    trapezeGroup.add(ropeLeft, ropeRight);

    const trapBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.6 })
    );
    trapBar.rotation.z = Math.PI / 2;
    trapezeGroup.add(trapBar);

    // 6. Vintage Creepy Clown Posters & Easels
    const posterTex = createCreepyClownPosterTexture();
    const posterMat = new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.7 });

    const posterPositions = [
      { x: -5.0, z: -4.8, ry: Math.PI / 4 },
      { x: 5.0, z: -4.8, ry: -Math.PI / 4 },
      { x: -6.6, z: 2.8, ry: Math.PI / 2.5 },
      { x: 6.6, z: 2.8, ry: -Math.PI / 2.5 }
    ];

    posterPositions.forEach(p => {
      const easelGroup = new THREE.Group();
      easelGroup.position.set(p.x, 0, p.z);
      easelGroup.rotation.y = p.ry;
      this.scene.add(easelGroup);

      const woodLegMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.7 });
      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 0.06), woodLegMat);
      leg1.position.set(-0.6, 1.3, 0);
      leg1.rotation.z = 0.1;
      const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 0.06), woodLegMat);
      leg2.position.set(0.6, 1.3, 0);
      leg2.rotation.z = -0.1;
      const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 0.06), woodLegMat);
      backLeg.position.set(0, 1.3, -0.4);
      backLeg.rotation.x = -0.22;
      easelGroup.add(leg1, leg2, backLeg);

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 2.2, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x1f1610, roughness: 0.8 })
      );
      board.position.set(0, 1.6, 0.02);
      easelGroup.add(board);

      const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), posterMat);
      poster.position.set(0, 1.6, 0.05);
      easelGroup.add(poster);

      const pHitbox = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 2.2, 0.6),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      pHitbox.position.set(0, 1.6, 0.1);
      pHitbox.userData = {
        type: 'CIRCUS_POSTER',
        prompt: '📜 Leer Cartel del Gran Payaso Giggles [CLICK]',
        key: 'CLICK'
      };
      easelGroup.add(pHitbox);
      this.interactiveObjects.push(pHitbox);
    });

    // 7. Carnival Crates and Barrels in corners
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.8 });
    [
      { x: -5.6, z: 4.2, r: 0.2 },
      { x: 5.6, z: 4.2, r: -0.3 },
      { x: -6.2, z: -2.0, r: 0.4 },
      { x: 6.2, z: -2.0, r: -0.5 }
    ].forEach(c => {
      const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), crateMat);
      crate1.position.set(c.x, 0.45, c.z);
      crate1.rotation.y = c.r;
      this.scene.add(crate1);

      const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), crateMat);
      crate2.position.set(c.x + 0.1, 1.25, c.z - 0.1);
      crate2.rotation.y = c.r + 0.3;
      this.scene.add(crate2);
    });

    // -------------------------------------------------------------
    // PROP 1: Centro de la Carpa - Pedestal, Globo Rojo Maldito & Manivela
    // -------------------------------------------------------------
    const centerGroup = new THREE.Group();
    centerGroup.position.set(0, 0, 0);
    this.scene.add(centerGroup);

    const pedMat = new THREE.MeshStandardMaterial({ color: 0x880e4f, roughness: 0.5 });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.8, 0.75, 16), pedMat);
    pedestal.position.y = 0.375;
    centerGroup.add(pedestal);

    const pedTrim = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.04, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd54f, metalness: 0.9, roughness: 0.2 })
    );
    pedTrim.position.y = 0.74;
    pedTrim.rotation.x = Math.PI / 2;
    centerGroup.add(pedTrim);

    const balloonGroup = new THREE.Group();
    balloonGroup.position.set(0, 2.3, 0);
    this.scene.add(balloonGroup);
    this.animatedObjects.circusBalloon = balloonGroup;

    const balloonSpot = new THREE.SpotLight(0xff1744, 2.5, 8, Math.PI / 6, 0.4);
    balloonSpot.position.set(0, 4.8, 0);
    balloonSpot.target = balloonGroup;
    this.scene.add(balloonSpot);

    const balloonMat = new THREE.MeshStandardMaterial({
      color: 0xd50000,
      metalness: 0.25,
      roughness: 0.15,
      emissive: 0x660000,
      emissiveIntensity: 0.45
    });
    const balloonSphere = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 24), balloonMat);
    balloonGroup.add(balloonSphere);

    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.07, 8), balloonMat);
    knot.position.y = -0.36;
    knot.rotation.x = Math.PI;
    balloonGroup.add(knot);

    const stringMat = new THREE.LineBasicMaterial({ color: 0xeeeeee });
    const stringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.4, 0),
      new THREE.Vector3(0.02, -0.8, 0.01),
      new THREE.Vector3(-0.02, -1.2, -0.01),
      new THREE.Vector3(0, -1.5, 0)
    ]);
    const stringLine = new THREE.Line(stringGeo, stringMat);
    balloonGroup.add(stringLine);

    const balloonHitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    balloonHitbox.userData = {
      type: 'CLOWN_BALLOON',
      prompt: '🎈 Inspeccionar Globo Rojo [CLICK]',
      key: 'CLICK'
    };
    balloonGroup.add(balloonHitbox);
    this.interactiveObjects.push(balloonHitbox);
    this.animatedObjects.circusBalloonHitbox = balloonHitbox;

    const crankGroup = new THREE.Group();
    crankGroup.position.set(0, 0.77, 0);
    this.scene.add(crankGroup);
    this.animatedObjects.circusCrank = crankGroup;
    crankGroup.visible = false;

    const crankMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, metalness: 0.95, roughness: 0.2 });
    const crankShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 12), crankMat);
    crankShaft.rotation.x = Math.PI / 2;
    crankGroup.add(crankShaft);

    const crankHandle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.14), crankMat);
    crankHandle.position.set(0.08, 0, 0.08);
    crankGroup.add(crankHandle);

    const crankHitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    crankHitbox.userData = {
      type: 'CLOWN_CRANK',
      prompt: '⚙️ Recoger Manivela Dorada [E / CLICK]',
      key: 'E'
    };
    crankGroup.add(crankHitbox);
    this.interactiveObjects.push(crankHitbox);
    this.animatedObjects.circusCrankHitbox = crankHitbox;
    crankHitbox.visible = false;

    // -------------------------------------------------------------
    // PROP 2: Tocador de Camerino y Cuchillo de Utilería (at x = 4.4, z = 0)
    // -------------------------------------------------------------
    const vanityGroup = new THREE.Group();
    vanityGroup.position.set(4.4, 0, 0);
    vanityGroup.rotation.y = -Math.PI / 2;
    this.scene.add(vanityGroup);

    const woodDeskMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.7 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.9), woodDeskMat);
    tableTop.position.y = 0.85;
    vanityGroup.add(tableTop);

    [[-0.8, -0.35], [-0.8, 0.35], [0.8, -0.35], [0.8, 0.35]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.85, 8), woodDeskMat);
      leg.position.set(lx, 0.42, lz);
      vanityGroup.add(leg);
    });

    const mirrorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.2, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x271913, roughness: 0.5 })
    );
    mirrorFrame.position.set(0, 1.55, -0.38);
    vanityGroup.add(mirrorFrame);

    const mirrorGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.95, roughness: 0.1 })
    );
    mirrorGlass.position.set(0, 1.55, -0.34);
    vanityGroup.add(mirrorGlass);

    for (let i = -0.55; i <= 0.55; i += 0.36) {
      const vBulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffe082, emissive: 0xffb300, emissiveIntensity: 0.8 })
      );
      vBulb.position.set(i, 2.18, -0.33);
      vanityGroup.add(vBulb);
    }

    const vanityLight = new THREE.PointLight(0xffb74d, 1.2, 5, 2);
    vanityLight.position.set(0, 1.8, 0.2);
    vanityGroup.add(vanityLight);

    const bustMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });
    const bust = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), bustMat);
    bust.position.set(-0.55, 1.08, -0.1);
    vanityGroup.add(bust);

    const wigMat = new THREE.MeshStandardMaterial({ color: 0x00e676, roughness: 0.8 });
    const wig = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), wigMat);
    wig.position.set(-0.55, 1.15, -0.1);
    vanityGroup.add(wig);

    const matMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.01, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xb71c1c, roughness: 0.9 })
    );
    matMesh.position.set(0.1, 0.895, 0.05);
    vanityGroup.add(matMesh);

    const knifeGroup = new THREE.Group();
    knifeGroup.position.set(0.1, 0.93, 0.05);
    vanityGroup.add(knifeGroup);
    this.animatedObjects.circusKnife = knifeGroup;

    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.98, roughness: 0.1 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.008, 0.28), bladeMat);
    knifeGroup.add(blade);

    const knifeHilt = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.02, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xb71c1c, metalness: 0.8, roughness: 0.3 })
    );
    knifeHilt.position.z = -0.14;
    knifeGroup.add(knifeHilt);

    const knifeHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.6 })
    );
    knifeHandle.position.z = -0.19;
    knifeHandle.rotation.x = Math.PI / 2;
    knifeGroup.add(knifeHandle);

    const knifeHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.4, 1.0),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    knifeHitbox.position.set(0, 1.2, 0);
    knifeHitbox.userData = {
      type: 'CIRCUS_KNIFE',
      prompt: '🗡️ Inspeccionar Tocador y Cuchillo de Utilería [CLICK]',
      key: 'CLICK'
    };
    vanityGroup.add(knifeHitbox);
    this.interactiveObjects.push(knifeHitbox);

    // -------------------------------------------------------------
    // PROP 3: Cabina del Payaso Adivino Animatrónico (at x = 0, z = -5.8)
    // -------------------------------------------------------------
    const boothGroup = new THREE.Group();
    boothGroup.position.set(0, 0, -5.8);
    this.scene.add(boothGroup);

    const boothWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a1414, roughness: 0.6 });
    const boothBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), boothWoodMat);
    boothBase.position.y = 0.55;
    boothGroup.add(boothBase);

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x90caf9,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1
    });
    const glassCase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.1), glassMat);
    glassCase.position.y = 1.8;
    boothGroup.add(glassCase);

    const canopyMat = new THREE.MeshStandardMaterial({ map: tentWallTex, roughness: 0.8 });
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.7, 8), canopyMat);
    canopy.position.y = 2.85;
    boothGroup.add(canopy);

    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.25, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xffd54f, metalness: 0.8, roughness: 0.3 })
    );
    signBoard.position.set(0, 2.55, 0.56);
    boothGroup.add(signBoard);

    const clownTorso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.65, 12),
      new THREE.MeshStandardMaterial({ color: 0x880e4f, roughness: 0.5 })
    );
    clownTorso.position.y = 1.42;
    boothGroup.add(clownTorso);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.09, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
    );
    collar.position.y = 1.76;
    collar.rotation.x = Math.PI / 2;
    boothGroup.add(collar);

    const clownHeadPivot = new THREE.Group();
    clownHeadPivot.position.set(0, 2.02, 0);
    boothGroup.add(clownHeadPivot);
    this.animatedObjects.animatronicHead = clownHeadPivot;

    const clownHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3 })
    );
    clownHeadPivot.add(clownHead);

    const cNose = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xd50000, roughness: 0.2 })
    );
    cNose.position.set(0, 0, 0.2);
    clownHeadPivot.add(cNose);

    const cHat = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd600, roughness: 0.4 })
    );
    cHat.position.set(0, 0.28, 0);
    clownHeadPivot.add(cHat);

    const eyeLight = new THREE.PointLight(0xff1744, 0.8, 4, 2);
    eyeLight.position.set(0, 0.06, 0.2);
    clownHeadPivot.add(eyeLight);
    this.animatedObjects.animatronicEyeLight = eyeLight;

    const boothHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 2.4, 1.4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    boothHitbox.position.set(0, 1.5, 0);
    boothHitbox.userData = {
      type: 'ANIMATRONIC_BOOTH',
      prompt: '🤡 Activar Payaso Mecánico Adivino [CLICK]',
      key: 'CLICK'
    };
    boothGroup.add(boothHitbox);
    this.interactiveObjects.push(boothHitbox);

    // -------------------------------------------------------------
    // PROP 4: La Caja Sorpresa Maldita (Jack-in-the-Box at x = -4.4, z = 0)
    // -------------------------------------------------------------
    const jackStandGroup = new THREE.Group();
    jackStandGroup.position.set(-4.4, 0, 0);
    jackStandGroup.rotation.y = Math.PI / 2;
    this.scene.add(jackStandGroup);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.55, 0.85, 16),
      new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.8 })
    );
    barrel.position.y = 0.42;
    jackStandGroup.add(barrel);

    const jackBoxTex = createJackInTheBoxTexture();
    const jackBoxMat = new THREE.MeshStandardMaterial({ map: jackBoxTex, roughness: 0.4 });
    const jackBox = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), jackBoxMat);
    jackBox.position.y = 1.11;
    jackStandGroup.add(jackBox);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 1.37, -0.26);
    jackStandGroup.add(lidPivot);
    this.animatedObjects.jackBoxLid = lidPivot;

    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.05, 0.54), jackBoxMat);
    lid.position.set(0, 0, 0.27);
    lidPivot.add(lid);

    const springHeadGroup = new THREE.Group();
    springHeadGroup.position.set(0, 1.35, 0);
    jackStandGroup.add(springHeadGroup);
    this.animatedObjects.jackSpringHead = springHeadGroup;
    springHeadGroup.visible = false;

    const coil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.9, roughness: 0.2 })
    );
    springHeadGroup.add(coil);

    const popHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    popHead.position.y = 0.3;
    springHeadGroup.add(popHead);

    const popNose = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff1744 })
    );
    popNose.position.set(0, 0.3, 0.16);
    springHeadGroup.add(popNose);

    const jackHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.4, 1.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    jackHitbox.position.set(0, 1.1, 0);
    jackHitbox.userData = {
      type: 'JACK_IN_THE_BOX',
      prompt: '🎁 Inspeccionar Caja Sorpresa del Bufón [CLICK]',
      key: 'CLICK'
    };
    jackStandGroup.add(jackHitbox);
    this.interactiveObjects.push(jackHitbox);

    // -------------------------------------------------------------
    // PROP 5: La Gran Jaula del Escape (Exit Gate at x = 0, z = 6.4)
    // -------------------------------------------------------------
    const cageGroup = new THREE.Group();
    cageGroup.position.set(0, 0, 6.4);
    this.scene.add(cageGroup);

    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, metalness: 0.95, roughness: 0.25 });

    const archTop = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 0.35), ironMat);
    archTop.position.y = 3.6;
    cageGroup.add(archTop);

    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.35), ironMat);
    postL.position.set(-1.8, 1.8, 0);
    cageGroup.add(postL);

    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.35), ironMat);
    postR.position.set(1.8, 1.8, 0);
    cageGroup.add(postR);

    const gateLeaf = new THREE.Group();
    cageGroup.add(gateLeaf);
    this.animatedObjects.circusCageGate = gateLeaf;

    for (let barX = -1.5; barX <= 1.5; barX += 0.22) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.4, 8), ironMat);
      bar.position.set(barX, 1.7, 0);
      gateLeaf.add(bar);
    }

    const skullPadlock = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffb300, metalness: 0.9, roughness: 0.2 })
    );
    skullPadlock.position.set(0, 1.5, 0.12);
    cageGroup.add(skullPadlock);

    const exitBeacon = new THREE.PointLight(0x00e676, 1.8, 10, 1.8);
    exitBeacon.position.set(0, 4.0, -0.4);
    cageGroup.add(exitBeacon);

    const exitSign = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.35, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00c853, emissiveIntensity: 0.7 })
    );
    exitSign.position.set(0, 3.9, -0.15);
    cageGroup.add(exitSign);

    const gateHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 3.4, 1.0),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    gateHitbox.position.set(0, 1.7, 0);
    gateHitbox.userData = {
      type: 'CIRCUS_ESCAPE_GATE',
      prompt: '🚪 Abrir Jaula y Escapar del Circo Maldito [CLICK]',
      key: 'CLICK'
    };
    cageGroup.add(gateHitbox);
    this.interactiveObjects.push(gateHitbox);
  }

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // Remote Player Robot Avatars in 3D ("Robots Facheros" Squad 1-4)
  // -------------------------------------------------------------
  createRemotePlayerAvatar(id, slot, name, colorHex) {
    let pId = id;
    let pSlot = slot;
    let pName = name;
    let pColorHex = colorHex;

    // Handle legacy call signatures
    if (typeof id === 'number') {
      pSlot = id;
      pName = slot || `Agente ${pSlot}`;
      pColorHex = name || (pSlot === 1 ? '#00e5ff' : pSlot === 2 ? '#ff9100' : pSlot === 3 ? '#d500f9' : '#00e676');
      pId = `slot_${pSlot}`;
    }

    if (!pId) pId = `slot_${pSlot || 2}`;
    if (!pColorHex) {
      const palette = { 1: '#00e5ff', 2: '#ff9100', 3: '#d500f9', 4: '#00e676' };
      pColorHex = palette[pSlot] || '#00e5ff';
    }

    if (this.remotePlayers.has(pId)) {
      this.removeRemotePlayer(pId);
    }

    const group = new THREE.Group();
    const armorColor = new THREE.Color(pColorHex);

    // High quality metallic materials
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x121722,
      metalness: 0.85,
      roughness: 0.25
    });

    const chromeArmorMat = new THREE.MeshStandardMaterial({
      color: armorColor,
      metalness: 0.8,
      roughness: 0.18,
      emissive: armorColor,
      emissiveIntensity: 0.25
    });

    const neonAccentMat = new THREE.MeshStandardMaterial({
      color: armorColor,
      emissive: armorColor,
      emissiveIntensity: 1.5,
      roughness: 0.1
    });

    const goldJointMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.9,
      roughness: 0.2
    });

    // 1. Torso & Chest Plate
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 1.0;
    group.add(torsoGroup);

    // Inner mechanical core
    const innerTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.55, 8), darkMetalMat);
    torsoGroup.add(innerTorso);

    // Angled Front Armor Plate
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.35, 0.14), chromeArmorMat);
    chestPlate.position.set(0, 0.1, 0.14);
    torsoGroup.add(chestPlate);

    // Glowing Arc Reactor / Heart in center of chest
    const arcReactor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16),
      neonAccentMat
    );
    arcReactor.rotation.x = Math.PI / 2;
    arcReactor.position.set(0, 0.12, 0.22);
    torsoGroup.add(arcReactor);

    // Dual Thruster Jetpack on back
    const jetpackBody = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.16), darkMetalMat);
    jetpackBody.position.set(0, 0.08, -0.22);
    torsoGroup.add(jetpackBody);

    // 2 Thruster Exhaust Cones with glowing plasma
    [-0.11, 0.11].forEach(xOffset => {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 12), darkMetalMat);
      nozzle.position.set(xOffset, -0.15, -0.22);
      torsoGroup.add(nozzle);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 12), neonAccentMat);
      flame.rotation.x = Math.PI;
      flame.position.set(xOffset, -0.28, -0.22);
      torsoGroup.add(flame);
    });

    // 2. Head & Visor
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.55, 0);
    group.add(headGroup);

    // Futuristic Aerodynamic Robot Helmet
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.36), darkMetalMat);
    headGroup.add(helmet);

    // Top Cyber-Antenna / Fin with glowing node
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.2), chromeArmorMat);
    antenna.position.set(0, 0.22, 0);
    headGroup.add(antenna);

    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), neonAccentMat);
    antennaTip.position.set(0, 0.32, -0.05);
    headGroup.add(antennaTip);

    // Ear Audio Receptors (Left & Right)
    [-0.19, 0.19].forEach(xPos => {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), goldJointMat);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(xPos, 0, 0.02);
      headGroup.add(ear);
    });

    // Expressive Visor using dynamic Canvas Texture
    const visorCanvas = document.createElement('canvas');
    visorCanvas.width = 256;
    visorCanvas.height = 128;
    renderRobotVisorCanvas(visorCanvas, 'normal', pColorHex);
    const visorTex = new THREE.CanvasTexture(visorCanvas);
    const visorMat = new THREE.MeshBasicMaterial({ map: visorTex });

    const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), visorMat);
    visor.position.set(0, 0.02, 0.185);
    headGroup.add(visor);

    // 3. Right Arm (Fully Rigged for Wave Animation!)
    const rightShoulderGroup = new THREE.Group();
    rightShoulderGroup.position.set(0.34, 1.25, 0);
    group.add(rightShoulderGroup);

    const rightShoulderJoint = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), goldJointMat);
    rightShoulderGroup.add(rightShoulderJoint);

    const rightShoulderPad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.2), chromeArmorMat);
    rightShoulderPad.position.set(0.04, 0.04, 0);
    rightShoulderGroup.add(rightShoulderPad);

    const rightBicep = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.22, 12), darkMetalMat);
    rightBicep.position.set(0, -0.14, 0);
    rightShoulderGroup.add(rightBicep);

    const rightElbowGroup = new THREE.Group();
    rightElbowGroup.position.set(0, -0.26, 0);
    rightShoulderGroup.add(rightElbowGroup);

    const rightElbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), goldJointMat);
    rightElbowGroup.add(rightElbowJoint);

    const rightForearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.09), chromeArmorMat);
    rightForearm.position.set(0, -0.12, 0);
    rightElbowGroup.add(rightForearm);

    // Right Hand
    const rightHandGroup = new THREE.Group();
    rightHandGroup.position.set(0, -0.24, 0);
    rightElbowGroup.add(rightHandGroup);

    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.04), goldJointMat);
    rightHandGroup.add(rightHand);

    // 4. Left Arm (Holds Flashlight / UV spotlight)
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.34, 1.25, 0);
    group.add(leftArmGroup);

    const leftShoulderJoint = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), goldJointMat);
    leftArmGroup.add(leftShoulderJoint);

    const leftShoulderPad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.2), chromeArmorMat);
    leftShoulderPad.position.set(-0.04, 0.04, 0);
    leftArmGroup.add(leftShoulderPad);

    const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.09), chromeArmorMat);
    leftForearm.position.set(-0.02, -0.22, 0.08);
    leftForearm.rotation.x = Math.PI / 6;
    leftArmGroup.add(leftForearm);

    // Flashlight in left hand
    const flashlightHolder = new THREE.Group();
    flashlightHolder.position.set(-0.02, -0.4, 0.18);
    leftArmGroup.add(flashlightHolder);

    const flMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.035, 0.18, 12),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 })
    );
    flMesh.rotation.x = Math.PI / 2;
    flashlightHolder.add(flMesh);

    // Remote UV spotlight
    const remoteSpot = new THREE.SpotLight(0xba68c8, 0, 9, Math.PI / 5.5, 0.4, 1.5);
    remoteSpot.position.set(0, 0, 0.1);
    const remoteTarget = new THREE.Object3D();
    remoteTarget.position.set(0, 0, 4);
    group.add(remoteTarget);
    remoteSpot.target = remoteTarget;
    flashlightHolder.add(remoteSpot);

    // 5. Robot Pelvis & Legs
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.12, 12), darkMetalMat);
    pelvis.position.y = 0.72;
    group.add(pelvis);

    // Left and Right legs
    [-0.14, 0.14].forEach(xLeg => {
      const legGroup = new THREE.Group();
      legGroup.position.set(xLeg, 0.7, 0);
      group.add(legGroup);

      const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), goldJointMat);
      legGroup.add(hipJoint);

      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.32, 0.12), chromeArmorMat);
      thigh.position.y = -0.18;
      legGroup.add(thigh);

      const knee = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), goldJointMat);
      knee.rotation.z = Math.PI / 2;
      knee.position.set(0, -0.34, 0.02);
      legGroup.add(knee);

      const calf = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.11), darkMetalMat);
      calf.position.y = -0.48;
      legGroup.add(calf);

      // Magnetic Hover Boot with glowing sole strip
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), chromeArmorMat);
      boot.position.set(0, -0.66, 0.04);
      legGroup.add(boot);

      const soleGlow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.2), neonAccentMat);
      soleGlow.position.set(0, -0.7, 0.04);
      legGroup.add(soleGlow);
    });

    // 6. Floating 3D Holographic Nametag Billboard
    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 400;
    nameCanvas.height = 100;
    const nctx = nameCanvas.getContext('2d');
    nctx.fillStyle = 'rgba(10, 15, 25, 0.88)';
    nctx.strokeStyle = pColorHex;
    nctx.lineWidth = 3;
    nctx.beginPath();
    nctx.roundRect ? nctx.roundRect(6, 6, 388, 88, 12) : nctx.strokeRect(6, 6, 388, 88);
    nctx.fill();
    nctx.stroke();

    nctx.fillStyle = pColorHex;
    nctx.font = 'bold 28px "Orbitron", sans-serif';
    nctx.textAlign = 'center';
    const slotNames = ['', 'ALFA', 'BRAVO', 'CHARLIE', 'DELTA'];
    const slotLabel = slotNames[pSlot] || `AGENTE ${pSlot}`;
    nctx.fillText(`[${slotLabel}] ${pName || 'Compañero'}`, 200, 42);

    nctx.fillStyle = '#ffffff';
    nctx.font = '16px "Chakra Petch", monospace';
    nctx.fillText('⚡ ENLACE DE COOPERACIÓN ⚡', 200, 74);

    const nameTex = new THREE.CanvasTexture(nameCanvas);
    const nameMat = new THREE.MeshBasicMaterial({ map: nameTex, transparent: true });
    const namePlate = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.32), nameMat);
    namePlate.position.set(0, 1.95, 0);
    group.add(namePlate);

    // 7. Floating 3D Holographic Speech Bubble Above Head
    const speechCanvas = document.createElement('canvas');
    speechCanvas.width = 512;
    speechCanvas.height = 160;
    const speechTex = new THREE.CanvasTexture(speechCanvas);
    const speechMat = new THREE.MeshBasicMaterial({
      map: speechTex,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const speechBubble = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.44), speechMat);
    speechBubble.position.set(0, 2.35, 0);
    group.add(speechBubble);

    group.userData = {
      playerId: pId,
      slot: pSlot,
      name: pName,
      headGroup,
      flashlightHolder,
      remoteSpot,
      rightShoulderGroup,
      rightElbowGroup,
      rightHandGroup,
      torsoGroup,
      visorCanvas,
      visorTex,
      speechCanvas,
      speechTex,
      speechBubble,
      speechMat,
      namePlate,
      armorColorHex: pColorHex,
      isWaving: false,
      waveTimer: 0
    };

    this.remotePlayers.set(pId, group);
    this.remotePlayerMesh = group; // Legacy single-player reference
    this.scene.add(group);

    return group;
  }

  // Trigger robot wave greeting on remote partner(s)
  triggerRemoteGreeting(idOrIsCombo = false, isComboOrText = false, text = '') {
    let targetAvatars = [];
    let isCombo = false;
    let greetText = '';

    if (typeof idOrIsCombo === 'string') {
      const avatar = this.remotePlayers.get(idOrIsCombo);
      if (avatar) targetAvatars.push(avatar);
      isCombo = Boolean(isComboOrText);
      greetText = text;
    } else {
      isCombo = Boolean(idOrIsCombo);
      greetText = typeof isComboOrText === 'string' ? isComboOrText : text;
      targetAvatars = Array.from(this.remotePlayers.values());
    }

    targetAvatars.forEach(avatar => {
      const ud = avatar.userData;
      if (!ud) return;
      ud.isWaving = true;
      ud.waveTimer = 3.5;

      // Change visor face to happy or hearts!
      renderRobotVisorCanvas(ud.visorCanvas, isCombo ? 'hearts' : 'happy', ud.armorColorHex);
      ud.visorTex.needsUpdate = true;

      // Render 3D holographic speech bubble
      const ctx = ud.speechCanvas.getContext('2d');
      const w = ud.speechCanvas.width;
      const h = ud.speechCanvas.height;
      ctx.clearRect(0, 0, w, h);

      // Glowing bubble border
      ctx.fillStyle = 'rgba(10, 15, 25, 0.94)';
      ctx.strokeStyle = isCombo ? '#ff1744' : ud.armorColorHex;
      ctx.lineWidth = 4;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(10, 10, w - 20, h - 35, 18) : ctx.strokeRect(10, 10, w - 20, h - 35);
      ctx.fill();
      ctx.stroke();

      // Pointer triangle
      ctx.beginPath();
      ctx.moveTo(w / 2 - 16, h - 25);
      ctx.lineTo(w / 2, h - 5);
      ctx.lineTo(w / 2 + 16, h - 25);
      ctx.fill();
      ctx.stroke();

      // Text inside bubble
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(greetText || `¡Hola equipo! 👋🤖❤️`, w / 2, 60);

      ctx.font = '16px "Chakra Petch", sans-serif';
      ctx.fillStyle = isCombo ? '#ff80ab' : ud.armorColorHex;
      ctx.fillText(isCombo ? '💖 ¡SUPER SINERGIA COOPERATIVA! 💖' : '🤖 COMUNICACIÓN ABIERTA', w / 2, 92);

      ud.speechTex.needsUpdate = true;
      ud.speechMat.opacity = 1.0;
      ud.speechBubble.scale.set(0.6, 0.6, 0.6);

      // Spawn 3D floating hearts
      this.spawnFloatingHearts(avatar.position, isCombo);
    });

    if (targetAvatars.length === 0 && this.camera) {
      const forward = new THREE.Vector3(0, 0, -1.8).applyQuaternion(this.camera.quaternion);
      const camPos = this.camera.position.clone().add(forward);
      this.spawnFloatingHearts(camPos, isCombo);
    }
  }

  spawnFloatingHearts(originPos, isSuper = false) {
    const heartCount = isSuper ? 10 : 5;
    for (let i = 0; i < heartCount; i++) {
      const heartGeo = new THREE.SphereGeometry(0.07, 8, 8);
      const heartMat = new THREE.MeshBasicMaterial({
        color: isSuper ? 0xff1744 : 0xff4081,
        transparent: true,
        opacity: 0.95
      });
      const heart = new THREE.Mesh(heartGeo, heartMat);
      heart.position.set(
        originPos.x + (Math.random() - 0.5) * 0.8,
        originPos.y + 1.6 + Math.random() * 0.3,
        originPos.z + (Math.random() - 0.5) * 0.8
      );
      heart.userData = {
        vy: 0.8 + Math.random() * 0.6,
        life: 2.4,
        initialLife: 2.4,
        vx: (Math.random() - 0.5) * 0.3,
        vz: (Math.random() - 0.5) * 0.3
      };
      this.scene.add(heart);
      this.animatedObjects.floatingHearts.push(heart);
    }
  }

  updateRemotePlayer(id, pos, rot, isUvActive) {
    if (!id || typeof id !== 'string') return;
    const mesh = this.remotePlayers.get(id);
    if (!mesh || !pos || !rot) return;

    // Interpolate position smoothly
    const targetPos = new THREE.Vector3(pos.x, pos.y - 1.6, pos.z);
    mesh.position.lerp(targetPos, 0.35);

    // Smooth yaw rotation with shortest angular distance
    let diffYaw = rot.yaw - mesh.rotation.y;
    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    mesh.rotation.y += diffYaw * 0.35;

    // Smooth pitch on head
    const ud = mesh.userData;
    if (ud && ud.headGroup) {
      ud.headGroup.rotation.x += (rot.pitch - ud.headGroup.rotation.x) * 0.35;
    }

    if (ud && ud.remoteSpot) {
      ud.remoteSpot.intensity = isUvActive ? 2.5 : 0;
    }
  }

  removeRemotePlayer(id) {
    if (id && this.remotePlayers.has(id)) {
      const mesh = this.remotePlayers.get(id);
      this.scene.remove(mesh);
      this.remotePlayers.delete(id);
      if (this.remotePlayerMesh === mesh) {
        this.remotePlayerMesh = this.remotePlayers.values().next().value || null;
      }
    } else if (!id) {
      this.remotePlayers.forEach(mesh => this.scene.remove(mesh));
      this.remotePlayers.clear();
      this.remotePlayerMesh = null;
    }
  }

  // -------------------------------------------------------------
  // Dynamic State Sync with Server State
  // -------------------------------------------------------------
  applyGameState(state) {
    if (!state) return;

    // 1. Desk Drawer
    if (this.animatedObjects.drawer && state.puzzles?.puzzleA) {
      const targetZ = state.puzzles.puzzleA.deskDrawerOpen ? 0.38 : 0.05;
      this.animatedObjects.drawer.position.z += (targetZ - this.animatedObjects.drawer.position.z) * 0.15;
    }

    // 2. UV Flashlight visibility in drawer
    if (this.animatedObjects.uvFlashlightMesh && state.inventory?.uv_flashlight) {
      this.animatedObjects.uvFlashlightMesh.visible = !state.inventory.uv_flashlight.collected;
    }

    // 3. Safe 104 Door & Warm Golden Interior Light
    if (this.animatedObjects.safe104Door && state.puzzles?.puzzleB) {
      const isOpen = state.puzzles.puzzleB.safe104DoorOpen;
      const targetAngle = isOpen ? -Math.PI / 1.7 : 0;
      this.animatedObjects.safe104Door.rotation.y += (targetAngle - this.animatedObjects.safe104Door.rotation.y) * 0.15;
      
      if (this.lights.safeInteriorLight) {
        this.lights.safeInteriorLight.intensity = isOpen ? 3.0 : 0;
      }
    }

    // 4. Safe contents (Master fuse & keycard)
    if (this.animatedObjects.masterFuseMesh && state.inventory?.master_fuse) {
      this.animatedObjects.masterFuseMesh.visible = !state.inventory.master_fuse.collected;
    }
    if (this.animatedObjects.keycardMesh && state.inventory?.security_keycard) {
      this.animatedObjects.keycardMesh.visible = !state.inventory.security_keycard.collected;
    }

    // 5. Fuse Panel Door
    if (this.animatedObjects.fusePanelDoor && state.puzzles?.puzzleC) {
      const targetAngle = state.puzzles.puzzleC.fusePanelDoorOpen ? Math.PI / 1.8 : 0;
      this.animatedObjects.fusePanelDoor.rotation.y += (targetAngle - this.animatedObjects.fusePanelDoor.rotation.y) * 0.15;
    }

    // 6. Power restoration & Lighting
    if (state.puzzles?.puzzleC) {
      const powerOn = state.puzzles.puzzleC.powerRestored;
      if (this.lights.mainCeiling1) {
        this.lights.mainCeiling1.intensity = powerOn ? 2.8 : 1.2;
      }
      if (this.lights.mainCeiling2) {
        this.lights.mainCeiling2.intensity = powerOn ? 2.8 : 1.2;
      }
      if (this.lights.ambient) {
        this.lights.ambient.intensity = powerOn ? 1.3 : 0.85;
      }
    }

    // 7. Keypad texture
    if (this.keypadTexture && state.puzzles?.puzzleD) {
      this.keypadTexture = createVaultKeypadTexture(
        state.puzzles.puzzleD.keypadDisplay,
        state.puzzles.puzzleD.keypadPowered
      );
      this.keypadMaterial.map = this.keypadTexture;
      this.keypadMaterial.needsUpdate = true;
    }

    // 8. Vault Locking Bolts retraction
    if (state.puzzles?.puzzleD) {
      const boltsRetracted = state.puzzles.puzzleD.vaultLockDisengaged;
      this.animatedObjects.vaultBolts.forEach((bolt, idx) => {
        const angle = (idx * Math.PI) / 4;
        const dist = boltsRetracted ? 1.15 : 1.35;
        const targetPos = new THREE.Vector3(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
        bolt.position.lerp(targetPos, 0.1);
      });
    }

    // 9. Vault Wheel rotation
    if (this.animatedObjects.vaultWheel && state.puzzles?.puzzleD) {
      const targetRot = state.puzzles.puzzleD.vaultWheelTurnProgress * Math.PI * 4;
      this.animatedObjects.vaultWheel.rotation.z += (targetRot - this.animatedObjects.vaultWheel.rotation.z) * 0.15;
    }

    // 10. Vault Door Swing Open
    if (this.animatedObjects.vaultDoorPivot && state.puzzles?.puzzleD) {
      const targetDoorAngle = state.puzzles.puzzleD.vaultDoorOpen ? -Math.PI / 1.9 : 0;
      this.animatedObjects.vaultDoorPivot.rotation.y += (targetDoorAngle - this.animatedObjects.vaultDoorPivot.rotation.y) * 0.08;
    }

    // 11. Room 2: Quantum Core Harmonization State
    if (state.puzzles?.puzzleE?.coreHarmonized) {
      if (this.animatedObjects.quantumCoreMaterial) {
        this.animatedObjects.quantumCoreMaterial.color.setHex(0x00e676);
        this.animatedObjects.quantumCoreMaterial.emissive.setHex(0x00e676);
        this.animatedObjects.quantumCoreMaterial.emissiveIntensity = 2.2;
      }
      if (this.animatedObjects.quantumLight) {
        this.animatedObjects.quantumLight.color.setHex(0x00e676);
      }
    }

    // 12. Room 2: Laser Grid Disabled State
    if (state.puzzles?.puzzleF?.laserGridDisabled) {
      this.animatedObjects.laserBeams.forEach(beam => {
        beam.visible = false;
      });
      if (this.animatedObjects.laserLight) {
        this.animatedObjects.laserLight.intensity = 0;
      }
    }

    // 13. Circus Horror Map State Sync
    if (state.circusPuzzles) {
      // Balloon
      if (this.animatedObjects.circusBalloon) {
        const isBalloonVisible = !state.circusPuzzles.balloonPopped;
        this.animatedObjects.circusBalloon.visible = isBalloonVisible;
        if (this.animatedObjects.circusBalloonHitbox) {
          this.animatedObjects.circusBalloonHitbox.visible = isBalloonVisible;
          const hasKnife = state.circusInventory?.circusKnife?.collected || 
                           state.circusInventory?.circus_knife?.collected || 
                           state.circusInventory?.circus_dart?.collected || 
                           state.circusPuzzles?.knifeCollected;
          this.animatedObjects.circusBalloonHitbox.userData.prompt = '🎈 Inspeccionar Globo Rojo [CLICK]';
        }
      }
      // Crank dropped on floor
      if (this.animatedObjects.circusCrank) {
        const hasCrank = state.circusInventory?.jack_crank?.collected || state.circusInventory?.circusCrank?.collected || state.circusInventory?.jackCrank?.collected || state.circusPuzzles.crankCollected;
        const isCrankVisible = !!state.circusPuzzles.balloonPopped && !hasCrank;
        this.animatedObjects.circusCrank.visible = isCrankVisible;
        if (this.animatedObjects.circusCrankHitbox) {
          this.animatedObjects.circusCrankHitbox.visible = isCrankVisible;
        }
      }
      // Circus Knife on vanity table
      if (this.animatedObjects.circusKnife) {
        const hasKnife = state.circusInventory?.circusKnife?.collected || state.circusInventory?.circus_knife?.collected || state.circusInventory?.circus_dart?.collected || state.circusPuzzles.knifeCollected || state.circusPuzzles.dartCollected;
        this.animatedObjects.circusKnife.visible = !hasKnife;
      }
      // Animatronic Booth Eyes & Glow
      if (this.animatedObjects.animatronicEyeLight) {
        this.animatedObjects.animatronicEyeLight.intensity = state.circusPuzzles.animatronicActive ? 4.5 : 0.6;
      }
      // Jack-in-the-Box Lid & Spring Clown (targets are interpolated every frame in render())
      const isJackPopped = state.circusPuzzles.jackPopped || state.circusPuzzles.jackSpringPopped || state.circusPuzzles.jackBoxUnlocked;
      this.circusTargets = this.circusTargets || {};
      this.circusTargets.lidAngle = isJackPopped ? -Math.PI / 1.6 : 0;
      this.circusTargets.springY = isJackPopped ? 0.6 : 0.05;
      if (this.animatedObjects.jackSpringHead) {
        this.animatedObjects.jackSpringHead.visible = !!isJackPopped;
      }
      // Circus Escape Cage Gate
      const isCageOpen = state.circusPuzzles.cageUnlocked || state.circusPuzzles.cageGateOpen;
      this.circusTargets.gateAngle = isCageOpen ? -Math.PI / 2.2 : 0;
    }
  }

  // Check if UV spotlight is illuminating the framed banknote
  checkUvBanknoteProximity(isLocalUvActive) {
    if (!this.banknoteTexture || !this.banknoteMaterial) return false;

    if (!this._billPos) {
      this._billPos = new THREE.Vector3(0, 1.8, 4.9);
      this._dirToBill = new THREE.Vector3();
      this._camDir = new THREE.Vector3();
    }

    const camPos = this.camera.position;
    const dist = camPos.distanceTo(this._billPos);

    let isLit = false;
    if (isLocalUvActive && dist < 3.8) {
      this._dirToBill.subVectors(this._billPos, camPos).normalize();
      this.camera.getWorldDirection(this._camDir);
      const dot = this._camDir.dot(this._dirToBill);
      if (dot > 0.85) {
        isLit = true;
      }
    }

    // Update texture canvas if state changed
    const currentIntensity = this.banknoteTexture.userData.uvIntensity;
    const targetIntensity = isLit ? 1 : 0;
    if (Math.abs(currentIntensity - targetIntensity) > 0.05) {
      const newIntensity = THREE.MathUtils.lerp(currentIntensity, targetIntensity, 0.2);
      this.banknoteTexture.userData.uvIntensity = newIntensity;
      renderBanknoteCanvas(this.banknoteTexture.userData.canvas, newIntensity);
      this.banknoteTexture.needsUpdate = true;
    }

    return isLit;
  }

  render() {
    const time = performance.now() * 0.001;

    // 1. Emergency beacon in Room 1
    if (this.animatedObjects.emergencyBeacon) {
      this.animatedObjects.emergencyBeacon.rotation.y += 0.04;
    }

    // 2. Quantum Core Gimbal Rings in Room 2
    if (this.animatedObjects.quantumRings && this.animatedObjects.quantumRings.length >= 2) {
      this.animatedObjects.quantumRings[0].rotation.x += 0.025;
      this.animatedObjects.quantumRings[0].rotation.y += 0.015;
      this.animatedObjects.quantumRings[1].rotation.y -= 0.02;
      this.animatedObjects.quantumRings[1].rotation.z += 0.03;
    }

    // 3. Quantum Core Pulsation
    if (this.animatedObjects.quantumLight) {
      const pulse = 1.8 + Math.sin(time * 3.5) * 0.6;
      this.animatedObjects.quantumLight.intensity = pulse;
    }

    // 4. Laser Beams subtle shimmer
    if (this.animatedObjects.laserBeams && this.animatedObjects.laserBeams.length > 0) {
      this.animatedObjects.laserBeams.forEach((beam, idx) => {
        if (beam.visible) {
          beam.material.opacity = 0.85 + Math.sin(time * 10 + idx) * 0.12;
        }
      });
    }

    // 5. Circus Animations: Balloon floating bob & creepy animatronic twitch
    if (this.animatedObjects.circusBalloon && this.animatedObjects.circusBalloon.visible) {
      this.animatedObjects.circusBalloon.position.y = 2.4 + Math.sin(time * 2.2) * 0.08;
    }
    if (this.animatedObjects.animatronicHead && this.animatedObjects.animatronicEyeLight?.intensity > 1) {
      this.animatedObjects.animatronicHead.rotation.y = Math.sin(time * 5.5) * 0.14 + (Math.sin(time * 17) > 0.8 ? 0.08 : 0);
    }

    // Circus mechanisms: smoothly approach the targets set in applyGameState()
    if (this.circusTargets) {
      const t = this.circusTargets;
      if (this.animatedObjects.jackBoxLid) {
        this.animatedObjects.jackBoxLid.rotation.x += (t.lidAngle - this.animatedObjects.jackBoxLid.rotation.x) * 0.15;
      }
      if (this.animatedObjects.jackSpringHead) {
        this.animatedObjects.jackSpringHead.position.y += (t.springY - this.animatedObjects.jackSpringHead.position.y) * 0.15;
      }
      if (this.animatedObjects.circusCageGate) {
        this.animatedObjects.circusCageGate.rotation.y += (t.gateAngle - this.animatedObjects.circusCageGate.rotation.y) * 0.06;
      }
    }

    // 6. Remote Squad Robot Avatars Animation (up to 4 players)
    this.remotePlayers.forEach(avatar => {
      const ud = avatar.userData;
      if (!ud) return;

      // Always point nametag towards local player camera
      if (ud.namePlate) {
        ud.namePlate.quaternion.copy(this.camera.quaternion);
      }

      if (ud.isWaving && ud.waveTimer > 0) {
        ud.waveTimer -= 0.016;

        // Wave right arm
        ud.rightShoulderGroup.rotation.z = -1.7 + Math.sin(time * 8) * 0.2;
        ud.rightShoulderGroup.rotation.x = -0.3;
        ud.rightElbowGroup.rotation.z = -0.9;
        ud.rightHandGroup.rotation.y = Math.sin(time * 14) * 0.6;

        // Animate speech bubble
        if (ud.speechBubble) {
          ud.speechBubble.quaternion.copy(this.camera.quaternion);
          if (ud.speechBubble.scale.x < 1.0) {
            ud.speechBubble.scale.addScalar(0.04);
          }
          if (ud.waveTimer < 0.6) {
            ud.speechMat.opacity = ud.waveTimer / 0.6;
          }
        }

        if (ud.waveTimer <= 0) {
          ud.isWaving = false;
          ud.rightShoulderGroup.rotation.set(0, 0, 0);
          ud.rightElbowGroup.rotation.set(0, 0, 0);
          ud.rightHandGroup.rotation.set(0, 0, 0);
          ud.speechMat.opacity = 0;
          renderRobotVisorCanvas(ud.visorCanvas, 'normal', ud.armorColorHex);
          ud.visorTex.needsUpdate = true;
        }
      } else {
        // Idle hovering bob
        ud.torsoGroup.position.y = 1.0 + Math.sin(time * 2.5) * 0.02;
        if (ud.speechBubble) {
          ud.speechBubble.quaternion.copy(this.camera.quaternion);
        }
      }
    });

    // 7. Floating Hearts Animation
    for (let i = this.animatedObjects.floatingHearts.length - 1; i >= 0; i--) {
      const h = this.animatedObjects.floatingHearts[i];
      h.position.y += h.userData.vy * 0.016;
      h.position.x += h.userData.vx * 0.016;
      h.position.z += h.userData.vz * 0.016;
      h.userData.life -= 0.016;
      h.material.opacity = Math.max(0, h.userData.life / h.userData.initialLife);
      h.rotation.y += 0.04;
      if (h.userData.life <= 0) {
        this.scene.remove(h);
        this.animatedObjects.floatingHearts.splice(i, 1);
      }
    }

    // 8. Atmospheric Dust / Motes Motion
    if (this.animatedObjects.dustParticles) {
      const posAttr = this.animatedObjects.dustParticles.geometry.attributes.position;
      const vels = this.animatedObjects.dustParticles.geometry.userData.velocities;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) + vels[i * 3 + 1] * 0.016;
        if (y > 3.4) y = 0.1;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }
}
