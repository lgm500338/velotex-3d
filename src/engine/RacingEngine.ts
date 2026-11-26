import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CAR_LIVERIES, RACES, RIVAL_PROFILES } from '../data/races';
import {
  CalloutEvent,
  CameraMode,
  GamePhase,
  HudTelemetry,
  RaceConfig,
  RacerStanding,
  RivalScreenMarker,
} from '../types/game';
import { AudioEngine } from './AudioEngine';
import { buildSupercarRig, SupercarRig } from './CarBuilder';
import { CockpitDashDisplay, createContactShadowTexture } from './ProceduralTextures';
import { buildTrackWorld, BuiltTrack, TrackFrame } from './TrackSystem';

interface RacerState {
  id: string;
  name: string;
  isPlayer: boolean;
  colorCss: string;
  rig: SupercarRig;
  s: number;
  lateral: number;
  lateralVel: number;
  speedMs: number;
  targetLane: number;
  laneTimer: number;
  skill: number;
  yawOffset: number;
  wheelSpin: number;
  finishTimeSec: number | null;
  nearMissCooldown: number;
  sparkTimer: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface RacingEngineCallbacks {
  onHudUpdate: (hud: HudTelemetry) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onCallout: (event: CalloutEvent) => void;
  onRaceFinished: (hud: HudTelemetry) => void;
  onWebGLFailed: () => void;
}

// Pre-allocated math helpers outside render loop (zero GC)
const _frame: TrackFrame = {
  pos: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  bankAngle: 0,
};
const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _carPos = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();
const _carQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _pitchQuat = new THREE.Quaternion();
const _localUp = new THREE.Vector3(0, 1, 0);
const _localRight = new THREE.Vector3(1, 0, 0);
const _localFwd = new THREE.Vector3(0, 0, -1);
const _projVec = new THREE.Vector3();
const _shakeOffset = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class RacingEngine {
  private container: HTMLElement;
  private callbacks: RacingEngineCallbacks;
  private audio: AudioEngine;

  private isSoftwareGl: boolean;
  private isCoarsePointer: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private keyLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private shadowTexture!: THREE.CanvasTexture;
  private dashDisplay!: CockpitDashDisplay;

  private currentRace: RaceConfig = RACES[0];
  private currentLiveryId = CAR_LIVERIES[0].id;
  private builtTrack: BuiltTrack | null = null;
  private racers: RacerState[] = [];
  private playerRacer!: RacerState;

  // Sparks & Exhaust smoke particle pools
  private sparkPool: SparkParticle[] = [];
  private sparkGeo!: THREE.BoxGeometry;
  private sparkMat!: THREE.MeshBasicMaterial;
  private smokePool: SparkParticle[] = [];
  private smokeGeo!: THREE.SphereGeometry;
  private smokeMat!: THREE.MeshBasicMaterial;
  private speedLinesGroup!: THREE.Group;

  // Game State
  private phase: GamePhase = 'menu';
  private cameraMode: CameraMode = 'chase';
  private autoGas = true;
  private countdownTimer = 3.2;
  private lastCountdownInt = 4;
  private raceElapsedSec = 0;
  private nitroCharge = 100; // starts full so player can feel NOS tension early
  private isNitroActive = false;
  private boostPadTimer = 0;
  private isDrafting = false;
  private draftCalloutCooldown = 0;
  private shakeIntensity = 0;
  private smoothCamPos = new THREE.Vector3();
  private smoothCamLook = new THREE.Vector3();
  private smoothCamUp = new THREE.Vector3(0, 1, 0);
  private camInitialized = false;
  private currentGear = 1;
  private currentRpm = 0.2;
  private topSpeedReached = 0;
  private nearMissCount = 0;
  private previousRank = 6;
  private overtakeCooldown = 0;
  private calloutIdCounter = 1;
  private menuOrbitAngle = 0;

  // Input state
  private keys = new Set<string>();
  private pointerDown = false;
  private pointerLastX = 0;
  private touchSteerTarget = 0;
  private steerSmoothed = 0;
  private touchNitroRequested = false;
  private touchBrakeRequested = false;

  // Loop management
  private frameId = 0;
  private lastTickTime = 0;
  private lastHudPushTime = 0;
  private animTime = 0;
  private disposed = false;

  constructor(container: HTMLElement, audio: AudioEngine, callbacks: RacingEngineCallbacks) {
    this.container = container;
    this.audio = audio;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.isCoarsePointer =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
  }

  public init(): boolean {
    try {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;

      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        powerPreference: 'high-performance',
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      const maxDpr = this.isSoftwareGl ? 1 : this.isCoarsePointer ? 1.5 : 2;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
      this.renderer.setSize(width, height);
      const enableShadows = !this.isSoftwareGl && !this.isCoarsePointer;
      this.renderer.shadowMap.enabled = enableShadows;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.renderer.domElement.style.display = 'block';
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.container.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();

      // Pre-baked high-contrast automotive studio environment map (baked once = zero per-frame mobile cost)
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      const envScene = new RoomEnvironment();
      const envTempDisposables: { dispose: () => void }[] = [];

      // Elongated overhead showroom softbox strips & warm/cool horizon light bands for crisp car paint reflections
      const stripGeo = new THREE.BoxGeometry(16, 0.35, 3.2);
      const topStripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.6, 4.2) });
      const sideStripMatCool = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 4.6, 7.2) });
      const sideStripMatWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(6.2, 4.4, 2.6) });
      envTempDisposables.push(stripGeo, topStripMat, sideStripMatCool, sideStripMatWarm);

      const overhead1 = new THREE.Mesh(stripGeo, topStripMat);
      overhead1.position.set(0, 12.5, -5.5);
      envScene.add(overhead1);

      const overhead2 = new THREE.Mesh(stripGeo, topStripMat);
      overhead2.position.set(0, 12.5, 5.5);
      envScene.add(overhead2);

      const leftHorizon = new THREE.Mesh(stripGeo, sideStripMatCool);
      leftHorizon.position.set(-14, 3.2, 0);
      leftHorizon.rotation.y = Math.PI / 2;
      envScene.add(leftHorizon);

      const rightHorizon = new THREE.Mesh(stripGeo, sideStripMatWarm);
      rightHorizon.position.set(14, 3.2, 0);
      rightHorizon.rotation.y = Math.PI / 2;
      envScene.add(rightHorizon);

      this.envRenderTarget = pmremGenerator.fromScene(envScene, 0.03);
      this.scene.environment = this.envRenderTarget.texture;
      this.scene.environmentIntensity = 0.6;
      for (const d of envTempDisposables) d.dispose();
      pmremGenerator.dispose();
      envScene.dispose();

      this.camera = new THREE.PerspectiveCamera(68, width / height, 0.12, 650);

      // Balanced 3-Point Warm/Cool Studio + Sunlight Rig
      this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
      this.scene.add(this.hemiLight);

      this.keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
      this.keyLight.position.set(28, 48, 26);
      this.keyLight.castShadow = !this.isSoftwareGl && !this.isCoarsePointer;
      this.keyLight.shadow.mapSize.set(1024, 1024);
      this.keyLight.shadow.camera.left = -26;
      this.keyLight.shadow.camera.right = 26;
      this.keyLight.shadow.camera.top = 26;
      this.keyLight.shadow.camera.bottom = -26;
      this.keyLight.shadow.camera.near = 2;
      this.keyLight.shadow.camera.far = 140;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.normalBias = 0.02;
      this.scene.add(this.keyLight);
      this.scene.add(this.keyLight.target);

      this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
      this.rimLight.position.set(-22, 16, -24);
      this.scene.add(this.rimLight);

      const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
      this.shadowTexture = createContactShadowTexture();
      this.dashDisplay = new CockpitDashDisplay(maxAniso);

      this.initParticlePools();
      this.loadRace(this.currentRace, false);

      if (!this.isSoftwareGl) {
        this.renderer.compile(this.scene, this.camera);
      }

      this.bindEvents();
      this.lastTickTime = performance.now();
      this.scheduleNextTick();
      return true;
    } catch {
      this.callbacks.onWebGLFailed();
      return false;
    }
  }

  private initParticlePools(): void {
    this.sparkGeo = new THREE.BoxGeometry(0.10, 0.10, 0.55);
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < 42; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparkPool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0.45 });
    }

    this.smokeGeo = new THREE.SphereGeometry(0.26, 7, 7);
    this.smokeMat = new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(this.smokeGeo, this.smokeMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.smokePool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0.55 });
    }

    // 3D Wind/Speed Streak Lines attached around camera space during high speed & Nitro
    this.speedLinesGroup = new THREE.Group();
    const streakGeo = new THREE.BoxGeometry(0.03, 0.03, 5.5);
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2;
      const rad = 3.2 + (i % 3) * 1.1;
      const line = new THREE.Mesh(streakGeo, streakMat);
      line.position.set(Math.cos(angle) * rad, Math.sin(angle) * rad * 0.65, -8 - (i % 5) * 4.5);
      this.speedLinesGroup.add(line);
    }
    this.speedLinesGroup.visible = false;
    this.camera.add(this.speedLinesGroup);
    this.scene.add(this.camera);
  }

  public loadRace(config: RaceConfig, startImmediately: boolean): void {
    this.currentRace = config;

    // Clean up previous track & racers
    if (this.builtTrack) {
      this.scene.remove(this.builtTrack.group);
      this.builtTrack.dispose();
      this.builtTrack = null;
    }
    for (const r of this.racers) {
      this.scene.remove(r.rig.group);
      this.disposeCarRig(r.rig);
    }
    this.racers = [];

    // Configure sky, fog, and theme-matched lighting
    this.scene.background = new THREE.Color(config.skyBottomHex);
    this.scene.fog = new THREE.FogExp2(config.fogHex, config.fogDensity);

    if (config.theme === 'forest_canopy' || config.theme === 'timber_valley') {
      this.hemiLight.color.setHex(0xdbeafe);
      this.hemiLight.groundColor.setHex(0x365314);
      this.hemiLight.intensity = 1.1;
      this.keyLight.color.setHex(0xfffbeb);
      this.keyLight.intensity = 2.4;
      this.rimLight.color.setHex(0xfef08a);
      this.rimLight.intensity = 0.7;
    } else if (config.theme === 'sunset_gp') {
      this.hemiLight.color.setHex(0xfdba74);
      this.hemiLight.groundColor.setHex(0x1e1b4b);
      this.hemiLight.intensity = 0.95;
      this.keyLight.color.setHex(0xfb923c);
      this.keyLight.intensity = 2.6;
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 1.1;
    } else if (config.theme === 'neon_grid') {
      this.hemiLight.color.setHex(0xf0abfc);
      this.hemiLight.groundColor.setHex(0x17062e);
      this.hemiLight.intensity = 0.95;
      this.keyLight.color.setHex(0xe0f2fe);
      this.keyLight.intensity = 2.0;
      this.rimLight.color.setHex(0xe879f9);
      this.rimLight.intensity = 1.3;
    } else {
      this.hemiLight.color.setHex(0x7dd3fc);
      this.hemiLight.groundColor.setHex(0x081430);
      this.hemiLight.intensity = 0.95;
      this.keyLight.color.setHex(0xe0f2fe);
      this.keyLight.intensity = 2.1;
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 1.25;
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.builtTrack = buildTrackWorld(config, maxAniso);
    this.scene.add(this.builtTrack.group);

    // Spawn 6-car starting grid (5 AI rivals ahead + Player in P6 just like the screenshots!)
    const gridSlots: [number, number][] = [
      [11, -3.1],
      [7, 3.1],
      [3, -3.1],
      [-1, 3.1],
      [-5, -3.1],
      [-9, 2.2], // Player starts P6 so overtaking creates instant excitement!
    ];

    const carEnvMap = this.envRenderTarget?.texture ?? null;

    RIVAL_PROFILES.forEach((profile, idx) => {
      const rig = buildSupercarRig(profile.colorHex, 0xffffff, this.shadowTexture, {
        includeCockpit: false,
        envMap: carEnvMap,
        isMobile: this.isCoarsePointer,
      });
      this.scene.add(rig.group);
      const [sPos, latPos] = gridSlots[idx];
      const racer: RacerState = {
        id: profile.id,
        name: profile.name,
        isPlayer: false,
        colorCss: profile.cssColor,
        rig,
        s: sPos,
        lateral: latPos,
        lateralVel: 0,
        speedMs: 0,
        targetLane: latPos,
        laneTimer: 1.5 + idx * 0.4,
        skill: profile.skill,
        yawOffset: 0,
        wheelSpin: 0,
        finishTimeSec: null,
        nearMissCooldown: 0,
        sparkTimer: 0,
      };
      this.racers.push(racer);
    });

    // Player car
    const livery = CAR_LIVERIES.find((l) => l.id === this.currentLiveryId) ?? CAR_LIVERIES[0];
    const playerRig = buildSupercarRig(livery.primaryHex, livery.accentHex, this.shadowTexture, {
      includeCockpit: true,
      dashTexture: this.dashDisplay.texture,
      envMap: carEnvMap,
      isMobile: this.isCoarsePointer,
    });
    this.scene.add(playerRig.group);

    const [pS, pLat] = gridSlots[5];
    this.playerRacer = {
      id: 'player',
      name: 'PLAYER',
      isPlayer: true,
      colorCss: livery.cssColor,
      rig: playerRig,
      s: pS,
      lateral: pLat,
      lateralVel: 0,
      speedMs: 0,
      targetLane: pLat,
      laneTimer: 0,
      skill: 1,
      yawOffset: 0,
      wheelSpin: 0,
      finishTimeSec: null,
      nearMissCooldown: 0,
      sparkTimer: 0,
    };
    this.racers.push(this.playerRacer);

    this.applyCameraModeVisibility();
    this.resetRaceMetrics();
    this.positionAllCarMeshes(0.016);
    this.camInitialized = false;

    if (startImmediately) {
      this.startCountdown();
    } else {
      this.setPhase('menu');
    }
  }

  private resetRaceMetrics(): void {
    this.raceElapsedSec = 0;
    this.nitroCharge = 100;
    this.isNitroActive = false;
    this.boostPadTimer = 0;
    this.isDrafting = false;
    this.draftCalloutCooldown = 0;
    this.shakeIntensity = 0;
    this.currentGear = 1;
    this.currentRpm = 0.22;
    this.topSpeedReached = 0;
    this.nearMissCount = 0;
    this.previousRank = 6;
    this.overtakeCooldown = 0;
    this.steerSmoothed = 0;
    this.touchSteerTarget = 0;
    this.touchNitroRequested = false;
    this.touchBrakeRequested = false;
  }

  private disposeCarRig(rig: SupercarRig): void {
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();

    rig.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry && !disposedGeos.has(obj.geometry)) {
          disposedGeos.add(obj.geometry);
          obj.geometry.dispose();
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat && !disposedMats.has(mat)) {
            disposedMats.add(mat);
            // Shared textures (this.shadowTexture, this.dashDisplay.texture) are owned by RacingEngine
            mat.dispose();
          }
        }
      }
    });
  }

  public startCountdown(): void {
    this.audio.init();
    this.audio.resume();
    this.audio.setEngineActive(true);
    this.countdownTimer = 3.2;
    this.lastCountdownInt = 4;
    this.camInitialized = false;
    this.setPhase('countdown');
  }

  public setPhase(phase: GamePhase): void {
    this.phase = phase;
    if (phase === 'paused' || phase === 'menu') {
      this.audio.setEngineActive(false);
    } else if (phase === 'racing' || phase === 'countdown') {
      this.audio.setEngineActive(true);
    }
    this.callbacks.onPhaseChange(phase);
    this.pushHudTelemetry(true);
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.applyCameraModeVisibility();
    this.camInitialized = false;
  }

  public getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  public setAutoGas(enabled: boolean): void {
    this.autoGas = enabled;
  }

  public setLivery(liveryId: string): void {
    this.currentLiveryId = liveryId;
    const livery = CAR_LIVERIES.find((l) => l.id === liveryId);
    if (livery && this.playerRacer) {
      this.playerRacer.rig.paintMaterial.color.setHex(livery.primaryHex);
      this.playerRacer.rig.accentMaterial.color.setHex(livery.accentHex);
      this.playerRacer.colorCss = livery.cssColor;
    }
  }

  public triggerNitro(active: boolean): void {
    this.touchNitroRequested = active;
  }

  public triggerBrake(active: boolean): void {
    this.touchBrakeRequested = active;
  }

  public pause(): void {
    if (this.phase === 'racing') {
      this.setPhase('paused');
    }
  }

  public resume(): void {
    if (this.phase === 'paused') {
      this.audio.resume();
      this.lastTickTime = performance.now();
      this.setPhase('racing');
    }
  }

  public restartCurrentRace(): void {
    this.loadRace(this.currentRace, true);
  }

  private applyCameraModeVisibility(): void {
    if (!this.playerRacer) return;
    const isCockpit = this.cameraMode === 'cockpit';
    this.playerRacer.rig.exteriorCabinGroup.visible = !isCockpit;
    if (this.playerRacer.rig.cockpitGroup) {
      this.playerRacer.rig.cockpitGroup.visible = isCockpit;
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private clearActiveInputs(): void {
    this.keys.clear();
    this.pointerDown = false;
    this.touchSteerTarget = 0;
    this.touchNitroRequested = false;
    this.touchBrakeRequested = false;
  }

  private handleWindowBlur = (): void => {
    this.clearActiveInputs();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearActiveInputs();
      if (this.phase === 'racing') {
        this.pause();
      }
      this.audio.suspend();
    }
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (e.code === 'KeyC' && (this.phase === 'racing' || this.phase === 'countdown')) {
      const next: CameraMode =
        this.cameraMode === 'chase' ? 'cockpit' : this.cameraMode === 'cockpit' ? 'hood' : 'chase';
      this.setCameraMode(next);
      window.dispatchEvent(new CustomEvent('velotex-camera-sync', { detail: next }));
    } else if ((e.code === 'Escape' || e.code === 'KeyP') && (this.phase === 'racing' || this.phase === 'paused')) {
      if (this.phase === 'racing') this.pause();
      else this.resume();
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.phase !== 'racing' && this.phase !== 'countdown') return;
    this.audio.init();
    this.audio.resume();
    this.pointerDown = true;
    this.pointerLastX = e.clientX;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.pointerDown || this.phase !== 'racing') return;
    const dx = e.clientX - this.pointerLastX;
    this.pointerLastX = e.clientX;
    this.touchSteerTarget = THREE.MathUtils.clamp(this.touchSteerTarget + dx * 0.014, -1, 1);
  };

  private handlePointerUp = (): void => {
    this.pointerDown = false;
    this.touchSteerTarget = 0;
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onWebGLFailed();
  };

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    if (this.phase !== 'paused') {
      this.animTime += dt;
      this.builtTrack?.updateAnimations(this.animTime);
    }

    if (this.phase === 'menu') {
      this.updateMenuShowcase(dt);
    } else if (this.phase === 'countdown') {
      this.updateCountdown(dt);
    } else if (this.phase === 'racing') {
      this.updateRacingSimulation(dt);
    } else if (this.phase === 'finished') {
      this.updatePostFinishCoast(dt);
    }

    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);

    if (now - this.lastHudPushTime > 55) {
      this.lastHudPushTime = now;
      this.pushHudTelemetry(false);
    }

    this.scheduleNextTick();
  };

  private updateMenuShowcase(dt: number): void {
    if (!this.builtTrack || !this.playerRacer) return;
    this.menuOrbitAngle += dt * 0.32;
    this.builtTrack.spline.trackToWorld(this.playerRacer.s, this.playerRacer.lateral, 0, _carPos);
    const radius = 7.4;
    this.camera.position.set(
      _carPos.x + Math.sin(this.menuOrbitAngle) * radius,
      _carPos.y + 2.55,
      _carPos.z + Math.cos(this.menuOrbitAngle) * radius,
    );
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 54, 4, dt);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(_carPos.x, _carPos.y + 0.85, _carPos.z - 0.6);
    this.speedLinesGroup.visible = false;
  }

  private updateCountdown(dt: number): void {
    this.countdownTimer -= dt;
    const currentInt = Math.max(0, Math.ceil(this.countdownTimer));

    // Update 3D FIA start lights on gantry
    if (this.builtTrack) {
      const lights = this.builtTrack.startLights;
      for (let i = 0; i < lights.length; i++) {
        if (this.countdownTimer <= 0.05) {
          lights[i].emissive.setHex(0x22c55e);
          lights[i].emissiveIntensity = 3.2;
        } else {
          const litCount = Math.min(5, Math.floor((3.2 - this.countdownTimer) * 1.8) + 1);
          lights[i].emissive.setHex(0xef4444);
          lights[i].emissiveIntensity = i < litCount ? 2.8 : 0.1;
        }
      }
    }

    if (currentInt !== this.lastCountdownInt && currentInt <= 3) {
      this.lastCountdownInt = currentInt;
      this.audio.playCountdownBeep(currentInt === 0);
      this.pushHudTelemetry(true);
    }

    // Rev engine on the grid for start-line tension!
    const revPulse = 0.28 + Math.sin(this.animTime * 9.5) * 0.12 + (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 0.38 : 0);
    this.currentRpm = THREE.MathUtils.clamp(revPulse, 0.18, 0.92);
    this.audio.updateTelemetry({
      speedKmh: 0,
      rpm: this.currentRpm,
      gear: 1,
      isNitro: false,
      driftAmount: 0,
      isCockpit: this.cameraMode === 'cockpit',
      throttleLoad: 0.75,
    });

    this.updateCockpitVisuals(dt, 0, false);
    this.updateCamera(dt, 0);

    if (this.countdownTimer <= 0) {
      this.setPhase('racing');
    }
  }

  private updateRacingSimulation(dt: number): void {
    if (!this.builtTrack) return;
    this.raceElapsedSec += dt;

    const p = this.playerRacer;
    const roadHalf = this.currentRace.roadWidth * 0.5 - 1.25;

    // 1. Read Steering, Throttle, Brake, Nitro
    let steerInput = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steerInput -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steerInput += 1;
    if (steerInput === 0 && Math.abs(this.touchSteerTarget) > 0.01) {
      steerInput = this.touchSteerTarget;
      if (!this.pointerDown) {
        this.touchSteerTarget = THREE.MathUtils.damp(this.touchSteerTarget, 0, 10, dt);
      }
    }
    this.steerSmoothed = THREE.MathUtils.damp(this.steerSmoothed, steerInput, 11, dt);

    const braking = this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touchBrakeRequested;
    const manualGas = this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.pointerDown;
    const accelerating = !braking && (this.autoGas || manualGas);

    const wantsNitro =
      this.keys.has('Space') ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      this.touchNitroRequested;

    if (wantsNitro && this.nitroCharge > 4 && !braking) {
      if (!this.isNitroActive) {
        this.emitCallout('nitro');
      }
      this.isNitroActive = true;
    } else if (!wantsNitro || this.nitroCharge <= 0.5 || braking) {
      this.isNitroActive = false;
    }

    if (this.isNitroActive) {
      this.nitroCharge = Math.max(0, this.nitroCharge - dt * 28);
      this.shakeIntensity = Math.max(this.shakeIntensity, 0.14);
    } else {
      // Passive trickling charge when racing fast
      this.nitroCharge = Math.min(100, this.nitroCharge + dt * 3.8);
    }

    if (this.boostPadTimer > 0) {
      this.boostPadTimer = Math.max(0, this.boostPadTimer - dt);
    }

    // 2. Slipstream / Drafting check behind rival cars
    this.isDrafting = false;
    if (this.draftCalloutCooldown > 0) this.draftCalloutCooldown -= dt;
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      const ds = r.s - p.s;
      const dl = Math.abs(r.lateral - p.lateral);
      if (ds > 5.5 && ds < 28 && dl < 2.15 && p.speedMs > 30) {
        this.isDrafting = true;
        this.nitroCharge = Math.min(100, this.nitroCharge + dt * 16);
        if (this.draftCalloutCooldown <= 0) {
          this.emitCallout('draft');
          this.draftCalloutCooldown = 4.5;
        }
        break;
      }
    }

    // 3. Longitudinal Physics (6-speed top speed + nitro + drafting + boost pads)
    const baseMaxMs = this.currentRace.topSpeedKmh / 3.6;
    const nitroBonus = this.isNitroActive ? 1.24 : 1.0;
    const padBonus = this.boostPadTimer > 0 ? 1.22 : 1.0;
    const draftBonus = this.isDrafting ? 1.09 : 1.0;
    const effectiveMaxMs = baseMaxMs * Math.max(nitroBonus, padBonus) * draftBonus;

    if (accelerating) {
      const accelRate = this.isNitroActive ? 38 : this.boostPadTimer > 0 ? 44 : 23;
      const speedRatio = p.speedMs / Math.max(1, effectiveMaxMs);
      const torqueCurve = Math.max(0.18, 1 - speedRatio * 0.72);
      p.speedMs += accelRate * torqueCurve * dt;
    } else if (braking) {
      p.speedMs = Math.max(0, p.speedMs - 48 * dt);
    } else {
      p.speedMs = Math.max(0, p.speedMs - 11 * dt);
    }

    // Smoothly cap overspeed decay after nitro/pad ends
    if (p.speedMs > effectiveMaxMs) {
      p.speedMs = THREE.MathUtils.damp(p.speedMs, effectiveMaxMs, 2.8, dt);
    }

    // Lateral steering + curve centrifugal pull for authentic racing grip tension!
    this.builtTrack.spline.getFrameAt(p.s, _frame);
    const speedFactor = THREE.MathUtils.clamp(p.speedMs / 24, 0.25, 1.15);
    const steerPower = 16.5 * speedFactor;
    const centrifugalPush = _frame.bankAngle * (p.speedMs * 0.14);
    const targetLatVel = this.steerSmoothed * steerPower + centrifugalPush;
    p.lateralVel = THREE.MathUtils.damp(p.lateralVel, targetLatVel, 9.5, dt);
    p.lateral += p.lateralVel * dt;

    // Guardrail contact bounce
    if (Math.abs(p.lateral) > roadHalf) {
      p.lateral = Math.sign(p.lateral) * roadHalf;
      p.lateralVel *= -0.3;
      p.speedMs *= 0.96;
      this.shakeIntensity = Math.max(this.shakeIntensity, 0.25);
      this.spawnSparks(p.s, p.lateral, 5);
    }

    p.s += p.speedMs * dt;
    p.yawOffset = THREE.MathUtils.damp(p.yawOffset, -this.steerSmoothed * 0.17 - p.lateralVel * 0.008, 10, dt);

    const speedKmh = p.speedMs * 3.6;
    if (speedKmh > this.topSpeedReached) this.topSpeedReached = speedKmh;

    // 4. 6-Speed Automatic Transmission & RPM Simulation
    const prevGear = this.currentGear;
    const gearBounds = [0, 68, 122, 178, 232, 286, 430];
    let gear = 1;
    for (let g = 1; g <= 6; g++) {
      if (speedKmh >= gearBounds[g - 1]) gear = g;
    }
    this.currentGear = gear;
    if (gear !== prevGear) {
      this.audio.playGearShift(gear > prevGear);
    }
    const low = gearBounds[gear - 1];
    const high = gearBounds[gear];
    const rawRpm = THREE.MathUtils.clamp((speedKmh - low) / Math.max(1, high - low), 0.14, 1.0);
    this.currentRpm = THREE.MathUtils.damp(this.currentRpm, 0.24 + rawRpm * 0.76, 12, dt);

    // 5. Update AI Rivals with competitive rubber-banding & obstacle dodging
    this.updateRivals(dt, roadHalf);

    // 6. Collisions: Car-to-Car wheel bumping, Boost Pads, and Dynamic 3D Obstacles
    this.resolveCollisions(dt, roadHalf);

    // 7. Position all 3D car meshes, spin wheels, flare brakes & nitro flames
    this.positionAllCarMeshes(dt);
    p.rig.taillightMat.emissiveIntensity = braking ? 5.2 : 2.1;

    // Exhaust smoke puffs at low-mid speed / nitro
    if (Math.random() < (this.isNitroActive ? 0.5 : 0.22) && speedKmh > 15) {
      this.spawnExhaustSmoke(p);
    }

    // 8. Check Rank Overtake celebration
    const currentRank = this.computePlayerRank();
    if (this.overtakeCooldown > 0) this.overtakeCooldown -= dt;
    if (currentRank < this.previousRank && this.raceElapsedSec > 1.8 && this.overtakeCooldown <= 0) {
      this.emitCallout('overtake');
      this.overtakeCooldown = 2.2;
    }
    this.previousRank = currentRank;

    // 9. Audio Engine update
    const driftAmount = Math.min(1, Math.abs(this.steerSmoothed) * (speedKmh > 130 ? 0.85 : 0.2) + (braking && Math.abs(this.steerSmoothed) > 0.3 ? 0.6 : 0));
    this.audio.updateTelemetry({
      speedKmh,
      rpm: this.currentRpm,
      gear: this.currentGear,
      isNitro: this.isNitroActive || this.boostPadTimer > 0,
      driftAmount,
      isCockpit: this.cameraMode === 'cockpit',
      throttleLoad: accelerating ? 1 : 0.25,
    });

    // 10. Update Cockpit Steering Wheel, Shift LEDs, & Live Digital Dash
    this.updateCockpitVisuals(dt, speedKmh, this.isNitroActive || this.boostPadTimer > 0);

    // 11. Update Camera & Speed Lines
    this.updateCamera(dt, speedKmh);

    // 12. Check Finish Line
    if (p.s >= this.currentRace.lengthMeters && p.finishTimeSec === null) {
      p.finishTimeSec = this.raceElapsedSec;
      const finalRank = this.computePlayerRank();
      this.audio.playFinishFanfare(finalRank <= 3);
      this.setPhase('finished');
      const finalHud = this.buildHudSnapshot();
      this.callbacks.onRaceFinished(finalHud);
    }
  }

  private updateRivals(dt: number, roadHalf: number): void {
    if (!this.builtTrack) return;
    const p = this.playerRacer;
    const baseMs = this.currentRace.rivalBaseSpeedKmh / 3.6;

    for (const r of this.racers) {
      if (r.isPlayer) continue;

      if (r.nearMissCooldown > 0) r.nearMissCooldown -= dt;

      // Rubber-banding keeps the pack fiercely competitive without feeling unfair
      const gap = p.s - r.s;
      let paceAdj = 1.0;
      if (gap > 55) paceAdj = 1.13;
      else if (gap > 25) paceAdj = 1.06;
      else if (gap < -85) paceAdj = 0.88;
      else if (gap < -40) paceAdj = 0.94;

      const targetSpeed = baseMs * r.skill * paceAdj;
      if (r.finishTimeSec !== null) {
        // Gracefully slow down and park on the run-off area after crossing the finish line
        const stopTargetS = this.currentRace.lengthMeters + 68;
        const brakingSpeed = r.s < stopTargetS ? Math.max(0, (stopTargetS - r.s) * 0.45) : 0;
        r.speedMs = THREE.MathUtils.damp(r.speedMs, brakingSpeed, 3.2, dt);
        if (r.speedMs < 0.25 && r.s >= stopTargetS - 2) r.speedMs = 0;
      } else {
        r.speedMs = THREE.MathUtils.damp(r.speedMs, targetSpeed, 2.2, dt);
      }

      // AI lane planning + obstacle avoidance
      r.laneTimer -= dt;
      if (r.laneTimer <= 0) {
        r.laneTimer = 1.4 + Math.random() * 2.2;
        r.targetLane = (Math.random() * 2 - 1) * (roadHalf * 0.82);
      }

      // Dodge upcoming obstacle ahead
      for (const obs of this.builtTrack.obstacles) {
        const ds = obs.s - r.s;
        if (ds > 2 && ds < 42) {
          if (obs.type !== 'rotor' && Math.abs(obs.currentLateral - r.lateral) < obs.halfWidth + 1.8) {
            r.targetLane = obs.currentLateral > 0 ? -roadHalf * 0.72 : roadHalf * 0.72;
          }
        }
      }

      const latDelta = r.targetLane - r.lateral;
      r.lateralVel = THREE.MathUtils.damp(r.lateralVel, THREE.MathUtils.clamp(latDelta * 2.6, -9, 9), 5, dt);
      r.lateral = THREE.MathUtils.clamp(r.lateral + r.lateralVel * dt, -roadHalf, roadHalf);
      r.s += r.speedMs * dt;
      r.yawOffset = THREE.MathUtils.damp(r.yawOffset, -r.lateralVel * 0.025, 8, dt);

      if (r.s >= this.currentRace.lengthMeters && r.finishTimeSec === null) {
        r.finishTimeSec = this.raceElapsedSec;
      }
    }
  }

  private resolveCollisions(dt: number, roadHalf: number): void {
    if (!this.builtTrack) return;
    const p = this.playerRacer;

    // 1. Boost Chevron Pads
    for (const pad of this.builtTrack.boostPads) {
      if (pad.cooldown > 0) {
        pad.cooldown -= dt;
        continue;
      }
      if (Math.abs(p.s - pad.s) < pad.length * 0.55 && Math.abs(p.lateral - pad.lateral) < pad.halfWidth + 0.9) {
        pad.cooldown = 2.0;
        this.boostPadTimer = 1.65;
        this.nitroCharge = Math.min(100, this.nitroCharge + 24);
        p.speedMs = Math.max(p.speedMs + 14, (this.currentRace.topSpeedKmh / 3.6) * 1.15);
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.24);
        this.audio.playBoostPad();
        this.emitCallout('boostpad');
      }
    }

    // 2. Dynamic 3D Track Obstacles (Rotors, Hammers, Barriers)
    for (const obs of this.builtTrack.obstacles) {
      if (obs.hitCooldown > 0) obs.hitCooldown -= dt;
      const ds = obs.s - p.s;

      if (Math.abs(ds) < 2.25 && obs.hitCooldown <= 0) {
        let hit = false;
        let closeMiss = false;

        if (obs.type === 'rotor') {
          // Check if any of the 3 rotating blades is pointing downward through the player's lane!
          for (let b = 0; b < 3; b++) {
            const ang = obs.rotorAngle + (b * Math.PI * 2) / 3;
            // Blade tip position relative to hub at (0, 5.2): blade points along (sin(ang), -cos(ang))
            const bladeCos = Math.cos(ang); // +1 when pointing straight down toward road
            if (bladeCos > 0.72) {
              const bladeLateral = Math.sin(ang) * 4.2;
              const latDist = Math.abs(p.lateral - bladeLateral);
              if (latDist < obs.halfWidth + 0.85) {
                hit = true;
              } else if (latDist < obs.halfWidth + 2.4) {
                closeMiss = true;
              }
            }
          }
        } else {
          const latDist = Math.abs(p.lateral - obs.currentLateral);
          if (latDist < obs.halfWidth + 0.85) {
            hit = true;
          } else if (latDist < obs.halfWidth + 2.65) {
            closeMiss = true;
          }
        }

        if (hit) {
          obs.hitCooldown = 1.4;
          p.speedMs *= 0.56;
          p.lateralVel += (p.lateral >= obs.currentLateral ? 1 : -1) * 11;
          this.shakeIntensity = 0.75;
          this.audio.playImpact(0.95);
          this.spawnSparks(p.s, p.lateral, 14);
          this.emitCallout('impact');
        } else if (closeMiss && !obs.nearMissAwarded && p.speedMs > 32) {
          obs.nearMissAwarded = true;
          this.nearMissCount++;
          this.nitroCharge = Math.min(100, this.nitroCharge + 16);
          this.audio.playNearMiss();
          this.emitCallout('nearmiss');
        }
      }
    }

    // 3. Car-to-Car wheel-to-wheel bumping & Rival Near Misses
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      const ds = r.s - p.s;
      const dl = r.lateral - p.lateral;
      const absDs = Math.abs(ds);
      const absDl = Math.abs(dl);

      if (absDs < 4.2 && absDl < 2.05) {
        // Elastic side-to-side & bumper impact with sparks (like Image 4!)
        const pushDir = dl >= 0 ? -1 : 1;
        p.lateral = THREE.MathUtils.clamp(p.lateral + pushDir * 0.42, -roadHalf, roadHalf);
        r.lateral = THREE.MathUtils.clamp(r.lateral - pushDir * 0.42, -roadHalf, roadHalf);
        p.lateralVel += pushDir * 7.5;
        r.lateralVel -= pushDir * 7.5;

        if (ds > 0 && p.speedMs > r.speedMs) {
          const avg = (p.speedMs + r.speedMs) * 0.5;
          p.speedMs = avg * 0.94;
          r.speedMs = avg * 1.05;
        }
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.42);
        this.audio.playImpact(0.65);
        this.spawnSparks((p.s + r.s) * 0.5, (p.lateral + r.lateral) * 0.5, 10);
      } else if (absDs < 4.5 && absDl >= 2.05 && absDl < 3.6 && r.nearMissCooldown <= 0 && p.speedMs > r.speedMs + 6) {
        r.nearMissCooldown = 3.5;
        this.nearMissCount++;
        this.nitroCharge = Math.min(100, this.nitroCharge + 14);
        this.audio.playNearMiss();
        this.emitCallout('nearmiss');
      }
    }
  }

  private positionAllCarMeshes(dt: number): void {
    if (!this.builtTrack) return;
    const spline = this.builtTrack.spline;

    for (const r of this.racers) {
      spline.getFrameAt(r.s, _frame);
      _carPos
        .copy(_frame.pos)
        .addScaledVector(_frame.right, r.lateral)
        .addScaledVector(_frame.up, 0.04);

      r.rig.group.position.copy(_carPos);

      // Basis aligning local -Z to track forward, +X to track right, +Y to track up
      _basisMat.makeBasis(_frame.right, _frame.up, _localFwd.copy(_frame.forward).negate());
      _carQuat.setFromRotationMatrix(_basisMat);
      _yawQuat.setFromAxisAngle(_localUp, r.yawOffset);
      _carQuat.multiply(_yawQuat);

      // Subtle suspension pitch squat under Nitro / braking for player
      if (r.isPlayer) {
        const pitch = this.isNitroActive ? 0.025 : 0;
        _pitchQuat.setFromAxisAngle(_localRight, pitch);
        _carQuat.multiply(_pitchQuat);
      }
      r.rig.group.quaternion.copy(_carQuat);

      // Spin wheels proportional to real forward distance traveled
      r.wheelSpin -= (r.speedMs * dt) / 0.35;
      for (const w of r.rig.wheels) {
        w.rotation.x = r.wheelSpin;
      }

      // Turn front wheels visually
      const steerVis = r.isPlayer ? -this.steerSmoothed * 0.34 : -r.lateralVel * 0.03;
      for (const piv of r.rig.frontSteerPivots) {
        piv.rotation.y = steerVis;
      }

      // Toggle Nitro flame cones
      const showFlame = r.isPlayer && (this.isNitroActive || this.boostPadTimer > 0);
      for (const f of r.rig.nitroFlames) {
        f.visible = showFlame;
        if (showFlame) {
          const flicker = 0.85 + Math.random() * 0.55;
          f.scale.set(1, 1, flicker);
        }
      }
    }

    // Keep shadow key light tracking player car cleanly
    if (this.playerRacer && !this.isSoftwareGl && !this.isCoarsePointer) {
      const pPos = this.playerRacer.rig.group.position;
      this.keyLight.position.set(pPos.x + 26, pPos.y + 44, pPos.z + 24);
      this.keyLight.target.position.copy(pPos);
      this.keyLight.target.updateMatrixWorld();
    }
  }

  private updateCockpitVisuals(_dt: number, speedKmh: number, isBoosting: boolean): void {
    const rig = this.playerRacer?.rig;
    if (!rig || this.cameraMode !== 'cockpit') return;

    // Rotate 3D steering wheel cleanly with steering input (up to +/- 75 deg)
    if (rig.steeringWheelGroup) {
      rig.steeringWheelGroup.rotation.z = -this.steerSmoothed * 1.25;
    }

    // Illuminate 9 shift-light LEDs across steering wheel top rim with live RPM
    const litLeds = Math.floor(this.currentRpm * 9.5);
    const redlineFlash = this.currentRpm > 0.92 && Math.floor(this.animTime * 16) % 2 === 0;
    for (let i = 0; i < rig.shiftLeds.length; i++) {
      rig.shiftLeds[i].emissiveIntensity = redlineFlash ? 3.5 : i < litLeds ? 2.4 : 0.05;
    }

    // Update live procedural CanvasTexture dashboard cluster
    this.dashDisplay.update(
      speedKmh,
      this.currentRpm,
      this.currentGear,
      this.nitroCharge,
      this.computePlayerRank(),
      isBoosting,
    );
  }

  private updateCamera(dt: number, speedKmh: number): void {
    if (!this.builtTrack || !this.playerRacer) return;
    const p = this.playerRacer;
    const spline = this.builtTrack.spline;
    spline.getFrameAt(p.s, _frame);

    // Decay camera shake
    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.4);
    const speedShake = speedKmh > 230 ? ((speedKmh - 230) / 140) * 0.045 : 0;
    const totalShake = this.shakeIntensity * 0.28 + speedShake;
    _shakeOffset.set(
      (Math.random() - 0.5) * totalShake,
      (Math.random() - 0.5) * totalShake * 0.7,
      0,
    );

    const isBoosting = this.isNitroActive || this.boostPadTimer > 0;
    const speedRatio = THREE.MathUtils.clamp(speedKmh / 320, 0, 1.15);

    if (this.cameraMode === 'cockpit') {
      // Authentic Driver's Seat Eye Position inside car (sees steering wheel, dash, A-pillars, and hood!)
      p.rig.group.updateMatrixWorld();
      _camPos.set(0, 1.11, 0.24).applyMatrix4(p.rig.group.matrixWorld);
      // Look far down the track ahead with subtle apex look-into-turn offset
      _camLook
        .set(this.steerSmoothed * 0.55, 1.02, -16)
        .applyMatrix4(p.rig.group.matrixWorld);

      this.camera.position.copy(_camPos).add(_shakeOffset);
      this.camera.up.copy(_frame.up);
      this.camera.lookAt(_camLook);

      const targetFov = 70 + speedRatio * 14 + (isBoosting ? 9 : 0);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      this.camera.updateProjectionMatrix();
    } else if (this.cameraMode === 'hood') {
      // Low-slung Bonnet/Hood Cam for intense velocity perception
      p.rig.group.updateMatrixWorld();
      _camPos.set(0, 1.18, -0.82).applyMatrix4(p.rig.group.matrixWorld);
      _camLook.set(this.steerSmoothed * 0.4, 0.92, -20).applyMatrix4(p.rig.group.matrixWorld);

      this.camera.position.copy(_camPos).add(_shakeOffset);
      this.camera.up.copy(_frame.up);
      this.camera.lookAt(_camLook);

      const targetFov = 74 + speedRatio * 16 + (isBoosting ? 10 : 0);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      this.camera.updateProjectionMatrix();
    } else {
      // 3rd-Person Arcade Supercar Chase Cam (honoring Images 1-5!)
      const backDist = 6.2 + speedRatio * 1.15 + (isBoosting ? 0.9 : 0);
      const upHeight = 2.65 + (isBoosting ? -0.15 : 0);

      _camPos
        .copy(_frame.pos)
        .addScaledVector(_frame.right, p.lateral * 0.88 - this.steerSmoothed * 0.45)
        .addScaledVector(_frame.up, upHeight)
        .addScaledVector(_frame.forward, -backDist);

      _camLook
        .copy(_frame.pos)
        .addScaledVector(_frame.right, p.lateral * 0.92 + this.steerSmoothed * 1.1)
        .addScaledVector(_frame.up, 1.25)
        .addScaledVector(_frame.forward, 18);

      _camUp.copy(_frame.up);

      if (!this.camInitialized) {
        this.smoothCamPos.copy(_camPos);
        this.smoothCamLook.copy(_camLook);
        this.smoothCamUp.copy(_camUp);
        this.camInitialized = true;
      } else {
        const alpha = 1 - Math.exp(-12 * dt);
        this.smoothCamPos.lerp(_camPos, alpha);
        this.smoothCamLook.lerp(_camLook, alpha);
        this.smoothCamUp.lerp(_camUp, 1 - Math.exp(-8 * dt)).normalize();
      }

      this.camera.position.copy(this.smoothCamPos).add(_shakeOffset);
      this.camera.up.copy(this.smoothCamUp);
      this.camera.lookAt(this.smoothCamLook);

      const targetFov = 64 + speedRatio * 16 + (isBoosting ? 11 : 0);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }

    // Animate 3D Speed Wind Lines above 195 km/h or during Nitro
    const showLines = this.phase === 'racing' && (speedKmh > 195 || isBoosting);
    this.speedLinesGroup.visible = showLines;
    if (showLines) {
      const streakSpeed = isBoosting ? 130 : 75;
      for (const child of this.speedLinesGroup.children) {
        child.position.z += streakSpeed * dt;
        if (child.position.z > 2) {
          child.position.z = -24 - Math.random() * 10;
        }
      }
    }
  }

  private updatePostFinishCoast(dt: number): void {
    const p = this.playerRacer;
    const roadHalf = this.currentRace.roadWidth * 0.5 - 1.25;
    this.raceElapsedSec += dt;

    // Decelerate player smoothly to a full stop well before track mesh end (lengthMeters + 140m)
    const maxRunoffS = this.currentRace.lengthMeters + 80;
    const remaining = Math.max(0, maxRunoffS - p.s);
    const targetCoastSpeed = remaining > 6 ? Math.min(18, remaining * 0.42) : 0;
    p.speedMs = THREE.MathUtils.damp(p.speedMs, targetCoastSpeed, remaining < 18 ? 4.2 : 1.8, dt);
    if (remaining <= 0.5 || p.speedMs < 0.2) {
      p.speedMs = 0;
    }
    p.s = Math.min(maxRunoffS, p.s + p.speedMs * dt);
    this.isNitroActive = false;

    // Keep AI rivals racing until they cross the finish line and come to a stop
    this.updateRivals(dt, roadHalf);

    this.positionAllCarMeshes(dt);
    this.updateCamera(dt, p.speedMs * 3.6);
    this.audio.updateTelemetry({
      speedKmh: p.speedMs * 3.6,
      rpm: p.speedMs > 1 ? 0.25 : 0.14,
      gear: p.speedMs > 1 ? 2 : 1,
      isNitro: false,
      driftAmount: 0,
      isCockpit: this.cameraMode === 'cockpit',
      throttleLoad: 0.05,
    });
  }

  private spawnSparks(s: number, lateral: number, count: number): void {
    if (!this.builtTrack) return;
    this.builtTrack.spline.trackToWorld(s, lateral, 0.7, _carPos);
    let spawned = 0;
    for (const sp of this.sparkPool) {
      if (sp.life <= 0 && spawned < count) {
        sp.life = sp.maxLife * (0.6 + Math.random() * 0.5);
        sp.mesh.position.copy(_carPos);
        sp.vel.set(
          (Math.random() - 0.5) * 14,
          3.5 + Math.random() * 7.5,
          (Math.random() - 0.5) * 14,
        );
        sp.mesh.visible = true;
        spawned++;
      }
    }
  }

  private spawnExhaustSmoke(r: RacerState): void {
    for (const sm of this.smokePool) {
      if (sm.life <= 0) {
        sm.life = sm.maxLife;
        r.rig.group.updateMatrixWorld();
        sm.mesh.position
          .set((Math.random() > 0.5 ? 0.48 : -0.48), 0.30, 2.38)
          .applyMatrix4(r.rig.group.matrixWorld);
        sm.vel.set((Math.random() - 0.5) * 1.4, 1.1 + Math.random() * 0.8, (Math.random() - 0.5) * 1.4);
        sm.mesh.scale.setScalar(0.5);
        sm.mesh.visible = true;
        break;
      }
    }
  }

  private updateParticles(dt: number): void {
    for (const sp of this.sparkPool) {
      if (sp.life > 0) {
        sp.life -= dt;
        sp.vel.y -= 18 * dt;
        sp.mesh.position.addScaledVector(sp.vel, dt);
        sp.mesh.scale.setScalar(Math.max(0.01, sp.life / sp.maxLife));
        if (sp.life <= 0) sp.mesh.visible = false;
      }
    }
    for (const sm of this.smokePool) {
      if (sm.life > 0) {
        sm.life -= dt;
        sm.mesh.position.addScaledVector(sm.vel, dt);
        const grow = 1.6 - (sm.life / sm.maxLife) * 1.0;
        sm.mesh.scale.setScalar(grow);
        if (sm.life <= 0) sm.mesh.visible = false;
      }
    }
  }

  private computeStandings(): RacerStanding[] {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finishTimeSec !== null && b.finishTimeSec !== null) {
        return a.finishTimeSec - b.finishTimeSec;
      }
      if (a.finishTimeSec !== null) return -1;
      if (b.finishTimeSec !== null) return 1;
      return b.s - a.s;
    });

    return sorted.map((r, idx) => ({
      id: r.id,
      name: r.name,
      isPlayer: r.isPlayer,
      rank: idx + 1,
      color: r.colorCss,
      progress: THREE.MathUtils.clamp(r.s / this.currentRace.lengthMeters, 0, 1),
      finishTimeSec: r.finishTimeSec,
      speedKmh: Math.round(r.speedMs * 3.6),
    }));
  }

  private computePlayerRank(): number {
    const standings = this.computeStandings();
    return standings.find((s) => s.isPlayer)?.rank ?? 6;
  }

  private buildHudSnapshot(): HudTelemetry {
    const standings = this.computeStandings();
    const playerStanding = standings.find((s) => s.isPlayer);
    const rankMap = new Map<string, number>();
    standings.forEach((st) => rankMap.set(st.id, st.rank));

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const rivalMarkers: RivalScreenMarker[] = [];

    // Project rival car positions into screen space for floating 1st/2nd/3rd markers (Image 4!)
    if (this.phase === 'racing' || this.phase === 'countdown') {
      for (const r of this.racers) {
        if (r.isPlayer) continue;
        const ds = r.s - this.playerRacer.s;
        if (ds < -4 || ds > 115) continue;

        _projVec.copy(r.rig.group.position);
        _projVec.y += 2.15;
        _projVec.project(this.camera);

        if (_projVec.z < 1 && _projVec.x > -0.95 && _projVec.x < 0.95 && _projVec.y > -0.9 && _projVec.y < 0.92) {
          rivalMarkers.push({
            id: r.id,
            rank: rankMap.get(r.id) ?? 6,
            name: r.name,
            color: r.colorCss,
            screenX: (_projVec.x * 0.5 + 0.5) * width,
            screenY: (-_projVec.y * 0.5 + 0.5) * height,
            distanceMeters: Math.round(ds),
            visible: true,
          });
        }
      }
    }

    const p = this.playerRacer;
    return {
      speedKmh: Math.round(p.speedMs * 3.6),
      rpm: this.currentRpm,
      gear: this.currentGear,
      position: playerStanding?.rank ?? 6,
      totalRacers: this.racers.length,
      progress: THREE.MathUtils.clamp(p.s / this.currentRace.lengthMeters, 0, 1),
      elapsedSec: p.finishTimeSec ?? this.raceElapsedSec,
      nitroCharge: Math.round(this.nitroCharge),
      nitroChargesCount: Math.ceil(this.nitroCharge / 34),
      isNitroActive: this.isNitroActive || this.boostPadTimer > 0,
      isDrafting: this.isDrafting,
      isDrifting: Math.abs(this.steerSmoothed) > 0.55 && p.speedMs > 34,
      isBraking: this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touchBrakeRequested,
      countdownValue: Math.max(0, Math.ceil(this.countdownTimer)),
      steerAngle: this.steerSmoothed,
      rivalProgressList: this.racers
        .filter((r) => !r.isPlayer)
        .map((r) => ({
          id: r.id,
          progress: THREE.MathUtils.clamp(r.s / this.currentRace.lengthMeters, 0, 1),
          color: r.colorCss,
        })),
      rivalMarkers,
      standings,
      topSpeedReached: Math.round(this.topSpeedReached),
      nearMissCount: this.nearMissCount,
    };
  }

  private pushHudTelemetry(force: boolean): void {
    if (!this.playerRacer) return;
    if (force || this.phase === 'racing' || this.phase === 'countdown' || this.phase === 'finished') {
      this.callbacks.onHudUpdate(this.buildHudSnapshot());
    }
  }

  private emitCallout(type: CalloutEvent['type']): void {
    this.callbacks.onCallout({
      id: this.calloutIdCounter++,
      type,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);

    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
      this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
      this.renderer.domElement.remove();
    }

    for (const r of this.racers) {
      this.scene.remove(r.rig.group);
      this.disposeCarRig(r.rig);
    }
    this.racers = [];

    this.builtTrack?.dispose();
    this.shadowTexture?.dispose();
    this.dashDisplay?.dispose();
    this.sparkGeo?.dispose();
    this.sparkMat?.dispose();
    this.smokeGeo?.dispose();
    this.smokeMat?.dispose();
    this.envRenderTarget?.dispose();
    this.renderer?.dispose();
  }
}
