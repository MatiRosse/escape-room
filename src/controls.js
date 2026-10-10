import * as THREE from 'three';
import { sound } from './audio.js';

export class PlayerControls {
  constructor(camera, domElement, interactiveObjects, onInteractCallback) {
    this.camera = camera;
    this.domElement = domElement;
    this.interactiveObjects = interactiveObjects;
    this.onInteract = onInteractCallback;

    // Movement flags
    this.isLocked = false;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.isCrouching = false;

    // Kinematics & Speeds
    this.walkSpeed = 4.2;
    this.sprintSpeed = 6.4;
    this.velocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();

    // Vertical Jump & Crouch Kinematics
    this.jumpVelocity = 0;
    this.jumpOffset = 0;
    this.targetEyeHeight = 1.6;
    this.baseEyeHeight = 1.6;

    // Mouse Look with smoothing
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.mouseSensitivity = 0.0022;

    // Head bobbing & tilt
    this.bobTimer = 0;
    this.bobAmount = 0.04;
    this.bobSpeed = 11.0;
    this.tiltAngle = 0;

    // Active map theme for collision routing ('vault' | 'circus')
    this.mapTheme = 'vault';

    // Raycaster for interactions (reach 3.2m)
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.2;
    this.currentIntersected = null;

    // Footstep timer
    this.stepTimer = 0;

    // UI elements
    this.crosshairEl = document.getElementById('crosshair');
    this.promptEl = document.getElementById('interaction-prompt');
    this.promptKeyEl = document.getElementById('prompt-key');
    this.promptTextEl = document.getElementById('prompt-text');

    this.setupListeners();
  }

  setupListeners() {
    // Mouse look
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;

      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      this.targetYaw -= movementX * this.mouseSensitivity;
      this.targetPitch -= movementY * this.mouseSensitivity;

      // Clamp vertical pitch (-85 deg to +85 deg)
      this.targetPitch = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, this.targetPitch));
    });

    // Keyboard inputs
    document.addEventListener('keydown', (e) => {
      const anyModalOpen = document.querySelector('.inspect-modal:not(.hidden)');
      const lobbyModal = document.getElementById('lobby-modal');
      const isLobbyOpen = lobbyModal && !lobbyModal.classList.contains('hidden');
      if (anyModalOpen || isLobbyOpen) return;

      // Auto-lock pointer on movement key press if playing in game
      if (!this.isLocked && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        this.lock();
      }

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.isSprinting = true;
          break;
        case 'KeyC':
          this.isCrouching = !this.isCrouching;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          this.isCrouching = true;
          break;
        case 'Space':
          if (this.jumpOffset <= 0.02) {
            this.jumpVelocity = 3.8;
            sound.playSFX('item_pickup');
          }
          break;
        case 'KeyE':
          this.triggerCurrentInteraction('E');
          break;
        case 'KeyF':
          if (this.onInteract) this.onInteract('TOGGLE_UV_KEY', null);
          break;
        case 'Digit1':
        case 'Numpad1':
          if (this.onInteract) this.onInteract('TRIGGER_GREETING', null);
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.isSprinting = false;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          this.isCrouching = false;
          break;
      }
    });

    // Click interaction
    document.addEventListener('mousedown', (e) => {
      if (this.isLocked && e.button === 0) {
        this.triggerCurrentInteraction('CLICK');
      }
    });

    // PointerLock state
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      const pointerPrompt = document.getElementById('click-to-play');
      const lobbyModal = document.getElementById('lobby-modal');

      if (!this.isLocked) {
        const anyModalOpen = document.querySelector('.inspect-modal:not(.hidden)');
        if (!lobbyModal || lobbyModal.classList.contains('hidden')) {
          if (!anyModalOpen && pointerPrompt) {
            pointerPrompt.classList.remove('hidden');
          }
        }
      } else {
        if (pointerPrompt) pointerPrompt.classList.add('hidden');
        // Synchronize initial angles with camera quaternion
        const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(this.camera.quaternion);
        this.targetYaw = euler.y;
        this.currentYaw = euler.y;
        this.targetPitch = euler.x;
        this.currentPitch = euler.x;
      }
    });

    // If the browser rejects the lock request, ask the player to click instead of silently freezing the camera
    document.addEventListener('pointerlockerror', () => this.showClickToPlay());

    // Auto-relock when clicking directly on the 3D canvas if no modal is open
    this.domElement.addEventListener('click', () => {
      const anyModalOpen = document.querySelector('.inspect-modal:not(.hidden)');
      const lobbyModal = document.getElementById('lobby-modal');
      const isLobbyOpen = lobbyModal && !lobbyModal.classList.contains('hidden');
      if (!this.isLocked && !anyModalOpen && !isLobbyOpen) {
        this.lock();
      }
    });
  }

  showClickToPlay() {
    const anyModalOpen = document.querySelector('.inspect-modal:not(.hidden)');
    const lobbyModal = document.getElementById('lobby-modal');
    const isLobbyOpen = lobbyModal && !lobbyModal.classList.contains('hidden');
    const pointerPrompt = document.getElementById('click-to-play');
    if (!this.isLocked && !anyModalOpen && !isLobbyOpen && pointerPrompt) {
      pointerPrompt.classList.remove('hidden');
    }
  }

  lock() {
    try {
      const p = this.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') {
        p.catch(() => this.showClickToPlay());
      }
    } catch (e) {
      this.showClickToPlay();
    }
    // Fallback for browsers that neither return a promise nor fire pointerlockerror
    setTimeout(() => {
      if (document.pointerLockElement !== this.domElement) this.showClickToPlay();
    }, 400);
  }

  unlock() {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } catch (e) {
      // Ignore pointer unlock failures
    }
  }

  setMapTheme(theme) {
    this.mapTheme = theme || 'vault';
  }

  triggerCurrentInteraction(pressedKey) {
    if (this.currentIntersected && this.currentIntersected.object.userData) {
      const data = this.currentIntersected.object.userData;
      if (this.onInteract) {
        this.onInteract(data.type, data);
      }
    }
  }

  update(delta, isVaultDoorOpen = false, isLaserDisabled = false) {
    const anyModalOpen = document.querySelector('.inspect-modal:not(.hidden)');
    const lobbyModal = document.getElementById('lobby-modal');
    const isLobbyOpen = lobbyModal && !lobbyModal.classList.contains('hidden');

    if (anyModalOpen || isLobbyOpen) {
      this.updateCrosshair(null);
      this.velocity.set(0, 0, 0);
      return;
    }

    // 1. Direct, fluid Mouse Look (when pointer locked)
    if (this.isLocked) {
      this.currentYaw = this.targetYaw;
      this.currentPitch = this.targetPitch;
    }

    // 2. Compute Input Direction
    const inputZ = Number(this.moveForward) - Number(this.moveBackward);
    const inputX = Number(this.moveRight) - Number(this.moveLeft);

    const inputLen = Math.hypot(inputX, inputZ);
    const normX = inputLen > 0 ? inputX / inputLen : 0;
    const normZ = inputLen > 0 ? inputZ / inputLen : 0;

    let currentSpeed = this.isSprinting ? this.sprintSpeed : this.walkSpeed;
    if (this.isCrouching) currentSpeed *= 0.55;

    // Convert input to world velocity based on current Yaw
    const sinYaw = Math.sin(this.currentYaw);
    const cosYaw = Math.cos(this.currentYaw);

    // Forward is -Z in Three.js coordinates
    const forwardX = -sinYaw;
    const forwardZ = -cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    this.targetVelocity.x = (forwardX * normZ + rightX * normX) * currentSpeed;
    this.targetVelocity.z = (forwardZ * normZ + rightZ * normX) * currentSpeed;

    // Snappy Velocity response (no ice skating)
    const accelRate = inputLen > 0 ? 30.0 : 24.0;
    const velSmoothing = 1 - Math.exp(-accelRate * delta);
    this.velocity.lerp(this.targetVelocity, velSmoothing);

    // 3. Collision Detection with Axis Sliding
    const currentPos = this.camera.position;
    const deltaX = this.velocity.x * delta;
    const deltaZ = this.velocity.z * delta;

    if (this.mapTheme === 'circus') {
      // 1. Active depenetration against circus props to guarantee player NEVER gets trapped inside
      const circusObstacles = [
        { cx: 0, cz: 0, r: 0.52 },         // Center pedestal (small radius, no trapping)
        { cx: 0, cz: -5.8, r: 1.15 },      // Animatronic booth
        { cx: -4.4, cz: 0, r: 1.05 },      // Jack-in-the-box table
        { cx: 4.4, cz: 0, r: 1.05 }        // Dressing vanity table
      ];

      for (const obs of circusObstacles) {
        const dx = currentPos.x - obs.cx;
        const dz = currentPos.z - obs.cz;
        const dist = Math.hypot(dx, dz);
        if (dist < obs.r) {
          const angle = dist > 0.0001 ? Math.atan2(dz, dx) : 0;
          currentPos.x = obs.cx + Math.cos(angle) * (obs.r + 0.015);
          currentPos.z = obs.cz + Math.sin(angle) * (obs.r + 0.015);
        }
      }

      // 2. Big Top Circus Tent: Circular perimeter with radius ~8.0m
      const isExitingGate = isVaultDoorOpen && (currentPos.z + deltaZ > 6.0) && Math.abs(currentPos.x + deltaX) < 1.6;

      const testPosX = currentPos.x + deltaX;
      const distFromCenterTestX = Math.hypot(testPosX, currentPos.z);
      if ((distFromCenterTestX <= 8.0 || isExitingGate) && !this.checkObstacleCollision(testPosX, currentPos.z, isVaultDoorOpen, currentPos.x, currentPos.z)) {
        currentPos.x = testPosX;
      }

      const testPosZ = currentPos.z + deltaZ;
      const distFromCenterTestZ = Math.hypot(currentPos.x, testPosZ);
      if ((distFromCenterTestZ <= 8.0 || isExitingGate) && !this.checkObstacleCollision(currentPos.x, testPosZ, isVaultDoorOpen, currentPos.x, currentPos.z)) {
        currentPos.z = testPosZ;
      }
    } else {
      // Vault map bounds
      const maxZ = 4.4;
      const minZ = isVaultDoorOpen ? -20.0 : -4.4;

      // Test X movement independently
      const testPosX = currentPos.x + deltaX;
      const isRoom2X = currentPos.z < -5.5;
      const isDoorwayX = currentPos.z <= -4.5 && currentPos.z >= -5.5;
      const maxX = isDoorwayX ? 1.35 : (isRoom2X ? 4.5 : 3.5);
      const minX = -maxX;

      if (testPosX >= minX && testPosX <= maxX && !this.checkObstacleCollision(testPosX, currentPos.z, isLaserDisabled)) {
        currentPos.x = testPosX;
      }

      // Test Z movement independently
      const testPosZ = currentPos.z + deltaZ;
      const willBeInDoorway = testPosZ <= -4.5 && testPosZ >= -5.5;
      const willBeBlockedByDoorway = willBeInDoorway && Math.abs(currentPos.x) > 1.35;

      // Laser barrier check
      const hitLaser = !isLaserDisabled && testPosZ <= -13.9 && testPosZ >= -14.5;
      if (hitLaser) {
        sound.playSFX('laser_zap');
      }

      if (testPosZ >= minZ && testPosZ <= maxZ && !willBeBlockedByDoorway && !hitLaser && !this.checkObstacleCollision(currentPos.x, testPosZ, isLaserDisabled)) {
        currentPos.z = testPosZ;
      }
    }

    // 4. Smooth Head Bobbing, Crouch transition, and Jump arc
    const targetEye = this.isCrouching ? 1.05 : 1.6;
    this.baseEyeHeight += (targetEye - this.baseEyeHeight) * (1 - Math.exp(-12 * delta));

    if (this.jumpVelocity !== 0 || this.jumpOffset > 0) {
      this.jumpVelocity -= 14.0 * delta;
      this.jumpOffset += this.jumpVelocity * delta;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.jumpVelocity = 0;
      }
    }

    const actualSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    let bobY = 0;
    if (actualSpeed > 0.3) {
      const bobFreq = this.isSprinting ? 14.0 : 9.5;
      this.bobTimer += delta * bobFreq;
      bobY = Math.sin(this.bobTimer) * (this.isSprinting ? 0.05 : 0.028);

      // Subtle strafe tilt (roll)
      const targetTilt = -normX * 0.015;
      this.tiltAngle += (targetTilt - this.tiltAngle) * 0.15;

      // Footstep audio cues
      this.stepTimer += delta * (this.isSprinting ? 1.4 : 1.0);
      if (this.stepTimer > 0.44) {
        sound.playFootstep();
        this.stepTimer = 0;
      }
    } else {
      this.tiltAngle += (0 - this.tiltAngle) * 0.15;
      this.stepTimer = 0.2;
    }

    currentPos.y = this.baseEyeHeight + bobY + this.jumpOffset;

    // 5. Apply Rotation & Tilt to Camera
    const euler = new THREE.Euler(this.currentPitch, this.currentYaw, this.tiltAngle, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // 6. Raycast from camera center (throttled to ~20Hz to free main render thread)
    this.raycastTimer = (this.raycastTimer || 0) + delta;
    if (this.raycastTimer >= 0.05) {
      this.raycastTimer = 0;
      this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
      const allHits = this.raycaster.intersectObjects(this.interactiveObjects, true);
      // Filter out any hit whose mesh or ancestor is invisible
      const intersects = allHits.filter(hit => {
        let p = hit.object;
        while (p) {
          if (p.visible === false) return false;
          p = p.parent;
        }
        return true;
      });

      if (intersects.length > 0) {
        const hit = intersects[0];
        let targetObj = hit.object;
        while (targetObj && (!targetObj.userData || !targetObj.userData.type) && targetObj.parent) {
          targetObj = targetObj.parent;
        }

        if (targetObj && targetObj.userData && targetObj.userData.type) {
          this.currentIntersected = { object: targetObj, distance: hit.distance };
          this.updateCrosshair(targetObj.userData);
        } else {
          this.currentIntersected = null;
          this.updateCrosshair(null);
        }
      } else {
        this.currentIntersected = null;
        this.updateCrosshair(null);
      }
    }
  }

  checkObstacleCollision(x, z, isLaserDisabled = false, fromX = null, fromZ = null) {
    if (this.mapTheme === 'circus') {
      const obstacles = [
        { cx: 0, cz: 0, r: 0.52 },         // Center pedestal (never traps player)
        { cx: 0, cz: -5.8, r: 1.15 },      // Animatronic booth
        { cx: -4.4, cz: 0, r: 1.05 },      // Jack-in-the-box table
        { cx: 4.4, cz: 0, r: 1.05 }        // Dressing table
      ];

      for (const obs of obstacles) {
        const newDist = Math.hypot(x - obs.cx, z - obs.cz);
        if (newDist < obs.r) {
          // If player is moving outward away from obstacle, allow it!
          if (fromX !== null && fromZ !== null) {
            const oldDist = Math.hypot(fromX - obs.cx, fromZ - obs.cz);
            if (newDist >= oldDist) continue;
          }
          return true;
        }
      }

      // Exit cage gate at (0, 6.2)
      if (!isLaserDisabled && Math.hypot(x, z - 6.2) < 1.35) {
        if (fromZ !== null && z <= fromZ) return false; // Allowed to back out
        return true;
      }
      return false;
    }

    // 1. Room 1: Security Desk with padding: x in [-3.5, -1.6], z in [-0.2, 1.2]
    if (x < -1.55 && z > -0.25 && z < 1.25) return true;

    // 2. Room 1: Safe Deposit Box Wall: x in [3.3, 4.0], z in [-1.3, 1.3]
    if (x > 3.25 && z > -1.3 && z < 1.3) return true;

    // 3. Room 2: Central Quantum Core reactor pedestal (at x=0, z=-10.5)
    if (Math.hypot(x, z - (-10.5)) < 1.15) return true;

    // 4. Room 2: Server Mainframes on left and right walls
    if (x < -3.3 && z < -7.0 && z > -13.2) return true;
    if (x > 3.3 && z < -7.0 && z > -13.2) return true;

    // 5. Room 2: Laser Grid collision
    if (!isLaserDisabled && z < -13.9 && z > -14.5) return true;

    // 6. Room 2: Final extraction airlock pedestal
    if (Math.hypot(x, z - (-17.8)) < 0.5) return true;

    return false;
  }

  updateCrosshair(userData) {
    if (userData && userData.prompt) {
      this.crosshairEl.classList.add('hover-active');
      this.promptEl.classList.remove('hidden');
      this.promptKeyEl.textContent = userData.key || 'CLICK';
      this.promptTextEl.textContent = userData.prompt;
    } else {
      this.crosshairEl.classList.remove('hover-active');
      this.promptEl.classList.add('hidden');
    }
  }

  getTransform() {
    return {
      position: {
        x: Number(this.camera.position.x.toFixed(3)),
        y: Number(this.camera.position.y.toFixed(3)),
        z: Number(this.camera.position.z.toFixed(3))
      },
      rotation: {
        yaw: Number(this.currentYaw.toFixed(3)),
        pitch: Number(this.currentPitch.toFixed(3))
      }
    };
  }
}
