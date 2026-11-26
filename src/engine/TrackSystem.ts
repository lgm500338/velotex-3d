import * as THREE from 'three';
import { RaceConfig } from '../types/game';
import {
  createBoostPadTexture,
  createCheckeredTexture,
  createRoadTexture,
  createTunnelTexture,
} from './ProceduralTextures';

export interface TrackFrame {
  pos: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bankAngle: number;
}

export interface TrackObstacle {
  id: number;
  type: 'rotor' | 'hammer' | 'barrier';
  s: number;
  phase: number;
  speed: number;
  /** Current lateral danger center (for hammer/barrier) or angle (for rotor) */
  currentLateral: number;
  halfWidth: number;
  /** Whether rotor currently has a blade sweeping road level */
  rotorAngle: number;
  pivot: THREE.Object3D;
  hitCooldown: number;
  nearMissAwarded: boolean;
}

export interface BoostPad {
  s: number;
  lateral: number;
  halfWidth: number;
  length: number;
  cooldown: number;
}

export class TrackSpline {
  private readonly curveScale: number;
  private readonly hillScale: number;
  private readonly seed: number;

  constructor(config: RaceConfig) {
    this.curveScale = config.curveIntensity;
    this.hillScale = config.hillIntensity;
    this.seed = config.id * 1.73;
  }

  public samplePosition(s: number, out: THREE.Vector3): THREE.Vector3 {
    // Keep start straight calm for first 70m so starting grid looks clean and readable
    const ramp = THREE.MathUtils.smoothstep(s, 15, 95);
    const x =
      ramp *
      this.curveScale *
      (Math.sin(s * 0.0082 + this.seed) * 28 +
        Math.sin(s * 0.0195 + this.seed * 1.7) * 14 +
        Math.cos(s * 0.0041 - this.seed * 0.5) * 20 -
        Math.cos(-this.seed * 0.5) * 20);

    const y =
      ramp *
      this.hillScale *
      (Math.sin(s * 0.0105 + this.seed * 0.9) * 8.5 +
        Math.cos(s * 0.023 + this.seed * 0.4) * 3.8);

    return out.set(x, y, -s);
  }

  public getFrameAt(s: number, out: TrackFrame): TrackFrame {
    const eps = 1.2;
    this.samplePosition(s, out.pos);
    this.samplePosition(s + eps, _tmpNext);
    this.samplePosition(s - eps, _tmpPrev);

    out.forward.subVectors(_tmpNext, _tmpPrev).normalize();

    // Estimate horizontal curvature for natural banking
    const dxNext = _tmpNext.x - out.pos.x;
    const dxPrev = out.pos.x - _tmpPrev.x;
    const curvature = (dxNext - dxPrev) / (eps * eps);
    const bankAngle = THREE.MathUtils.clamp(-curvature * 3.8, -0.34, 0.34);
    out.bankAngle = bankAngle;

    // Horizontal right vector before banking
    out.right.crossVectors(out.forward, _worldUp).normalize();
    // Apply banking roll around forward axis
    _bankQuat.setFromAxisAngle(out.forward, bankAngle);
    out.right.applyQuaternion(_bankQuat).normalize();
    // Right-handed up: right x forward = +Y when forward = -Z, right = +X
    out.up.crossVectors(out.right, out.forward).normalize();
    return out;
  }

  public trackToWorld(s: number, lateral: number, heightOffset: number, outPos: THREE.Vector3): TrackFrame {
    this.getFrameAt(s, _sharedFrame);
    outPos
      .copy(_sharedFrame.pos)
      .addScaledVector(_sharedFrame.right, lateral)
      .addScaledVector(_sharedFrame.up, heightOffset);
    return _sharedFrame;
  }
}

const _tmpNext = new THREE.Vector3();
const _tmpPrev = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _bankQuat = new THREE.Quaternion();
const _sharedFrame: TrackFrame = {
  pos: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  bankAngle: 0,
};

export interface BuiltTrack {
  group: THREE.Group;
  spline: TrackSpline;
  obstacles: TrackObstacle[];
  boostPads: BoostPad[];
  startLights: THREE.MeshStandardMaterial[];
  updateAnimations: (timeSec: number) => void;
  dispose: () => void;
}

export function buildTrackWorld(config: RaceConfig, maxAnisotropy: number): BuiltTrack {
  const group = new THREE.Group();
  const spline = new TrackSpline(config);
  const disposables: { dispose: () => void }[] = [];
  const obstacles: TrackObstacle[] = [];
  const boostPads: BoostPad[] = [];
  const startLights: THREE.MeshStandardMaterial[] = [];

  const startS = -45;
  const endS = config.lengthMeters + 140;
  const totalS = endS - startS;
  const stepS = 3.2;
  const segments = Math.ceil(totalS / stepS);
  const halfW = config.roadWidth * 0.5;

  // 1. Road Surface Ribbon + Side Curbs + Under-deck (Custom indexed BufferGeometry)
  const roadTex = createRoadTexture(config.theme, maxAnisotropy, totalS / 15);
  disposables.push(roadTex);

  const roadPositions: number[] = [];
  const roadNormals: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];

  // Guardrail curb geometry arrays
  const railPositions: number[] = [];
  const railNormals: number[] = [];
  const railIndices: number[] = [];

  const frame: TrackFrame = {
    pos: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    bankAngle: 0,
  };
  const vLeft = new THREE.Vector3();
  const vRight = new THREE.Vector3();
  const vRailOutL = new THREE.Vector3();
  const vRailTopL = new THREE.Vector3();
  const vRailOutR = new THREE.Vector3();
  const vRailTopR = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const s = startS + (i / segments) * totalS;
    spline.getFrameAt(s, frame);

    vLeft.copy(frame.pos).addScaledVector(frame.right, -halfW);
    vRight.copy(frame.pos).addScaledVector(frame.right, halfW);

    roadPositions.push(vLeft.x, vLeft.y, vLeft.z, vRight.x, vRight.y, vRight.z);
    roadNormals.push(frame.up.x, frame.up.y, frame.up.z, frame.up.x, frame.up.y, frame.up.z);
    const vCoord = i / segments;
    roadUvs.push(0, vCoord, 1, vCoord);

    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      roadIndices.push(a, b, c, b, d, c);
    }

    // Raised curb barriers along both sides of road
    const railH = config.theme === 'timber_valley' || config.theme === 'forest_canopy' ? 0.78 : 0.62;
    vRailOutL.copy(frame.pos).addScaledVector(frame.right, -(halfW + 0.15)).addScaledVector(frame.up, -0.35);
    vRailTopL.copy(frame.pos).addScaledVector(frame.right, -(halfW + 0.08)).addScaledVector(frame.up, railH);
    vRailOutR.copy(frame.pos).addScaledVector(frame.right, halfW + 0.15).addScaledVector(frame.up, -0.35);
    vRailTopR.copy(frame.pos).addScaledVector(frame.right, halfW + 0.08).addScaledVector(frame.up, railH);

    railPositions.push(
      vRailOutL.x, vRailOutL.y, vRailOutL.z,
      vRailTopL.x, vRailTopL.y, vRailTopL.z,
      vRailTopR.x, vRailTopR.y, vRailTopR.z,
      vRailOutR.x, vRailOutR.y, vRailOutR.z,
    );
    railNormals.push(
      frame.right.x, frame.right.y, frame.right.z,
      frame.right.x, frame.right.y, frame.right.z,
      -frame.right.x, -frame.right.y, -frame.right.z,
      -frame.right.x, -frame.right.y, -frame.right.z,
    );

    if (i < segments) {
      const base = i * 4;
      const next = (i + 1) * 4;
      // Left wall
      railIndices.push(base, base + 1, next, base + 1, next + 1, next);
      // Right wall
      railIndices.push(base + 2, base + 3, next + 2, base + 3, next + 3, next + 2);
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);
  disposables.push(roadGeo);

  const isNeonRoad = config.theme === 'neon_grid' || config.theme === 'cyber_tunnel';
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: isNeonRoad ? 0.38 : 0.72,
    metalness: isNeonRoad ? 0.25 : 0.08,
    emissive: isNeonRoad ? new THREE.Color(config.theme === 'neon_grid' ? 0x260947 : 0x05183b) : new THREE.Color(0x000000),
    emissiveIntensity: isNeonRoad ? 0.55 : 0,
  });
  disposables.push(roadMat);

  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(railPositions, 3));
  railGeo.setAttribute('normal', new THREE.Float32BufferAttribute(railNormals, 3));
  railGeo.setIndex(railIndices);
  disposables.push(railGeo);

  const railColor =
    config.theme === 'forest_canopy' || config.theme === 'timber_valley'
      ? 0x92400e
      : config.theme === 'neon_grid'
        ? 0xd946ef
        : config.theme === 'cyber_tunnel'
          ? 0x0ea5e9
          : 0x334155;
  const railMat = new THREE.MeshStandardMaterial({
    color: railColor,
    roughness: isNeonRoad ? 0.3 : 0.75,
    metalness: isNeonRoad ? 0.5 : 0.15,
    emissive: isNeonRoad ? new THREE.Color(railColor) : new THREE.Color(0x000000),
    emissiveIntensity: isNeonRoad ? 0.45 : 0,
    side: THREE.DoubleSide,
  });
  disposables.push(railMat);
  group.add(new THREE.Mesh(railGeo, railMat));

  // 2. Curved Tunnel Sections (for Cyber Tunnel, Neon Grid, and Sunset GP underpasses)
  if (config.tunnelCoverage > 0) {
    const tunnelRanges: [number, number][] =
      config.theme === 'sunset_gp'
        ? [
            [420, 860],
            [1580, 2060],
          ]
        : [
            [60, config.lengthMeters * 0.45],
            [config.lengthMeters * 0.53, config.lengthMeters * 0.94],
          ];

    for (const [tStart, tEnd] of tunnelRanges) {
      const tMesh = buildTunnelSegment(spline, tStart, tEnd, config, maxAnisotropy, disposables);
      group.add(tMesh);
    }
  }

  // 3. Natural Outdoor Landscape & Instanced Environment Scenery (No floating box void!)
  if (config.theme === 'forest_canopy' || config.theme === 'timber_valley' || config.theme === 'sunset_gp') {
    buildOutdoorTerrainAndScenery(group, spline, config, disposables);
  } else {
    buildCyberSpaceAtmosphere(group, spline, config, disposables);
  }

  // 4. Boost Chevron Pads along the track
  const boostTex = createBoostPadTexture(maxAnisotropy);
  disposables.push(boostTex);
  const boostPadMat = new THREE.MeshBasicMaterial({
    map: boostTex,
    transparent: true,
    opacity: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: false,
  });
  const boostPadGeo = new THREE.PlaneGeometry(3.4, 15.0);
  boostPadGeo.rotateX(-Math.PI / 2);
  disposables.push(boostPadMat, boostPadGeo);

  const padSpacing = 185;
  for (let s = 140; s < config.lengthMeters - 160; s += padSpacing) {
    const laneOffset = ((Math.round(s / padSpacing) % 3) - 1) * (halfW * 0.48);
    spline.getFrameAt(s, frame);

    const padMesh = new THREE.Mesh(boostPadGeo, boostPadMat);
    padMesh.position
      .copy(frame.pos)
      .addScaledVector(frame.right, laneOffset)
      .addScaledVector(frame.up, 0.06);

    const rotMat = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.forward.clone().negate());
    padMesh.quaternion.setFromRotationMatrix(rotMat);
    group.add(padMesh);

    boostPads.push({
      s,
      lateral: laneOffset,
      halfWidth: 1.95,
      length: 15.0,
      cooldown: 0,
    });
  }

  // 5. Dynamic 3D Track Obstacles (Spinning 3-Blade Rotors, Swinging Red Pendulum Hammers, Sliding Barriers)
  const obstacleSpacing = Math.round(135 / config.obstacleFrequency);
  let obsId = 1;

  for (let s = 210; s < config.lengthMeters - 130; s += obstacleSpacing) {
    // Decide obstacle type based on race theme (honoring user screenshots!)
    let obsType: 'rotor' | 'hammer' | 'barrier';
    if (config.theme === 'cyber_tunnel') {
      obsType = obsId % 3 === 0 ? 'barrier' : 'rotor';
    } else if (config.theme === 'neon_grid') {
      obsType = obsId % 2 === 0 ? 'rotor' : 'barrier';
    } else if (config.theme === 'timber_valley') {
      obsType = obsId % 4 === 0 ? 'barrier' : 'hammer';
    } else if (config.theme === 'forest_canopy') {
      obsType = obsId % 2 === 0 ? 'hammer' : 'barrier';
    } else {
      // Sunset GP combines all three for the ultimate finale!
      const m = obsId % 3;
      obsType = m === 0 ? 'rotor' : m === 1 ? 'hammer' : 'barrier';
    }

    const obs = createObstacleAt(spline, config, obsType, s, obsId, disposables);
    group.add(obs.root);
    obstacles.push(obs.data);
    obsId++;
  }

  // 6. Start Gantry (with 5 FIA lights) & Finish Checkered Gantry
  const checkerTex = createCheckeredTexture(maxAnisotropy);
  disposables.push(checkerTex);
  buildStartFinishGantries(group, spline, config, checkerTex, startLights, disposables);

  // Per-frame obstacle animation updater
  const updateAnimations = (timeSec: number) => {
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (obs.type === 'rotor') {
        const angle = timeSec * obs.speed + obs.phase;
        obs.rotorAngle = angle;
        obs.pivot.rotation.z = angle;
      } else if (obs.type === 'hammer') {
        const swing = Math.sin(timeSec * obs.speed + obs.phase);
        const maxSwingAngle = 0.76;
        obs.pivot.rotation.z = swing * maxSwingAngle;
        // Lateral position of hammer head at road level (arm length ~6.1m)
        obs.currentLateral = Math.sin(swing * maxSwingAngle) * 6.1;
      } else {
        const slide = Math.sin(timeSec * obs.speed + obs.phase) * (config.roadWidth * 0.34);
        obs.currentLateral = slide;
        obs.pivot.position.x = slide;
      }
    }
  };

  const dispose = () => {
    for (const d of disposables) {
      d.dispose();
    }
  };

  return {
    group,
    spline,
    obstacles,
    boostPads,
    startLights,
    updateAnimations,
    dispose,
  };
}

function buildTunnelSegment(
  spline: TrackSpline,
  startS: number,
  endS: number,
  config: RaceConfig,
  maxAnisotropy: number,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const tunnelGroup = new THREE.Group();
  const len = endS - startS;
  const segs = Math.ceil(len / 5);
  const radialSegs = config.theme === 'neon_grid' ? 8 : 16;
  const radius = config.roadWidth * 0.68;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const frame: TrackFrame = {
    pos: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    bankAngle: 0,
  };
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i <= segs; i++) {
    const s = startS + (i / segs) * len;
    spline.getFrameAt(s, frame);

    for (let j = 0; j <= radialSegs; j++) {
      // Arch spans from -20deg below right road edge up and over to 200deg on left edge
      const t = j / radialSegs;
      const theta = -0.18 + t * (Math.PI + 0.36);
      const cx = Math.cos(theta) * radius;
      const cy = Math.sin(theta) * (radius * 0.86) + 1.1;

      p.copy(frame.pos).addScaledVector(frame.right, cx).addScaledVector(frame.up, cy);
      // Inward normal pointing toward center of tunnel
      n.set(0, 0, 0)
        .addScaledVector(frame.right, -Math.cos(theta))
        .addScaledVector(frame.up, -Math.sin(theta))
        .normalize();

      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(t, i / segs);
    }

    if (i < segs) {
      const stride = radialSegs + 1;
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = a + 1;
        const c = (i + 1) * stride + j;
        const d = c + 1;
        // Inward winding
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  disposables.push(geo);

  const tunnelTex = createTunnelTexture(config.theme, maxAnisotropy, len / 22);
  disposables.push(tunnelTex);

  const mat = new THREE.MeshStandardMaterial({
    map: tunnelTex,
    emissiveMap: tunnelTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: config.theme === 'sunset_gp' ? 0.45 : 0.72,
    roughness: 0.42,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });
  disposables.push(mat);

  tunnelGroup.add(new THREE.Mesh(geo, mat));

  // Add dark metallic rib rings inside tunnel for crisp sense of velocity (like Image 1!)
  const ringCount = Math.floor(len / 48);
  const ringGeo = new THREE.TorusGeometry(radius * 0.96, 0.34, 8, 22, Math.PI + 0.25);
  const ringMat = new THREE.MeshStandardMaterial({
    color: config.theme === 'neon_grid' ? 0x2dd4bf : 0x0f172a,
    emissive: config.theme === 'neon_grid' ? 0x14b8a6 : 0x0284c7,
    emissiveIntensity: config.theme === 'neon_grid' ? 0.75 : 0.25,
    roughness: 0.35,
    metalness: 0.7,
  });
  disposables.push(ringGeo, ringMat);

  const ringInst = new THREE.InstancedMesh(ringGeo, ringMat, Math.max(1, ringCount));
  const dummy = new THREE.Object3D();
  const basis = new THREE.Matrix4();

  for (let r = 0; r < ringCount; r++) {
    const s = startS + 14 + r * 48;
    spline.getFrameAt(s, frame);
    dummy.position.copy(frame.pos).addScaledVector(frame.up, 1.0);
    basis.makeBasis(frame.right, frame.up, frame.forward.clone().negate());
    dummy.quaternion.setFromRotationMatrix(basis);
    dummy.updateMatrix();
    ringInst.setMatrixAt(r, dummy.matrix);
  }
  ringInst.instanceMatrix.needsUpdate = true;
  ringInst.computeBoundingSphere();
  tunnelGroup.add(ringInst);

  return tunnelGroup;
}

function buildOutdoorTerrainAndScenery(
  group: THREE.Group,
  spline: TrackSpline,
  config: RaceConfig,
  disposables: { dispose: () => void }[],
): void {
  // Extended sweeping valley terrain far below & beyond track (prevents floating in empty void)
  const terrainGeo = new THREE.PlaneGeometry(520, config.lengthMeters + 600, 32, 90);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const sampleP = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i) - config.lengthMeters * 0.48;
    const s = Math.max(-40, Math.min(config.lengthMeters + 100, -z));
    spline.samplePosition(s, sampleP);
    const distFromTrack = Math.abs(x - sampleP.x);
    // Keep terrain cleanly below road near track center, rising into natural canyon hills further out
    const hillRise = Math.max(0, distFromTrack - 18) * 0.28 + Math.sin(x * 0.045) * Math.cos(z * 0.03) * 6;
    const y = sampleP.y - 4.2 + hillRise;
    posAttr.setXYZ(i, x + sampleP.x * 0.35, y, z);
  }
  terrainGeo.computeVertexNormals();
  disposables.push(terrainGeo);

  const terrainColor =
    config.theme === 'forest_canopy'
      ? 0x2d5a1e
      : config.theme === 'timber_valley'
        ? 0x3f7a18
        : 0x3b2219;
  const terrainMat = new THREE.MeshStandardMaterial({
    color: terrainColor,
    roughness: 0.92,
    metalness: 0.02,
  });
  disposables.push(terrainMat);
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // Instanced Multi-Part Trees / Palms / Canyon Rocks along the track (honoring Images 4 & 5!)
  const isForest = config.theme === 'forest_canopy' || config.theme === 'timber_valley';
  const count = isForest ? 150 : 110;

  // Trunk + Canopy as two coordinated InstancedMeshes with scale & color tint variation
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.95, isForest ? 18 : 13, 8);
  trunkGeo.translate(0, isForest ? 9 : 6.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: isForest ? 0x6b4226 : 0x5c4033,
    roughness: 0.9,
    metalness: 0.04,
  });

  const canopyGeo = isForest
    ? new THREE.DodecahedronGeometry(6.8, 1)
    : new THREE.ConeGeometry(4.2, 3.6, 7);
  canopyGeo.scale(1.45, 0.75, 1.35);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: isForest ? 0x4d9e28 : 0x1e4620,
    roughness: 0.82,
    metalness: 0.04,
  });

  disposables.push(trunkGeo, trunkMat, canopyGeo, canopyMat);

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, count);

  const dummy = new THREE.Object3D();
  const frame: TrackFrame = {
    pos: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    bankAngle: 0,
  };
  const tint = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const s = 20 + (i / count) * (config.lengthMeters + 40);
    spline.getFrameAt(s, frame);
    const side = i % 2 === 0 ? -1 : 1;
    const dist = config.roadWidth * 0.5 + 3.8 + (i % 5) * 2.8;
    const scale = 0.85 + ((i * 37) % 100) * 0.0035;

    dummy.position
      .copy(frame.pos)
      .addScaledVector(frame.right, side * dist)
      .addScaledVector(frame.up, -1.8);
    // In forest canopy, lean giant trees inward overhead like Image 4!
    dummy.rotation.set(
      (((i * 13) % 10) - 5) * 0.02,
      (i * 1.1) % (Math.PI * 2),
      isForest ? side * 0.24 : side * 0.08,
    );
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    // Position canopy at top of leaning trunk
    dummy.position
      .copy(frame.pos)
      .addScaledVector(frame.right, side * (dist - (isForest ? 3.8 : 1.0)))
      .addScaledVector(frame.up, (isForest ? 15.5 : 11.5) * scale);
    dummy.rotation.set(0, i * 0.9, 0);
    dummy.scale.set(scale * 1.15, scale * 0.95, scale * 1.15);
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);

    if (isForest) {
      tint.setHSL(0.24 + ((i * 19) % 15) * 0.004, 0.62, 0.36 + ((i * 7) % 10) * 0.015);
    } else {
      tint.setHSL(0.32 + ((i * 11) % 12) * 0.004, 0.45, 0.24 + ((i * 5) % 8) * 0.012);
    }
    canopies.setColorAt(i, tint);
  }

  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere();
  canopies.computeBoundingSphere();
  group.add(trunks, canopies);
}

function buildCyberSpaceAtmosphere(
  group: THREE.Group,
  spline: TrackSpline,
  config: RaceConfig,
  disposables: { dispose: () => void }[],
): void {
  // Glowing floating geometric light arches & orbital pylons framing open cyber/neon sections
  const count = 64;
  const pylonGeo = new THREE.BoxGeometry(0.75, 16, 0.75);
  const pylonMat = new THREE.MeshStandardMaterial({
    color: config.theme === 'neon_grid' ? 0xe879f9 : 0x38bdf8,
    emissive: config.theme === 'neon_grid' ? 0xd946ef : 0x0284c7,
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.8,
  });
  disposables.push(pylonGeo, pylonMat);

  const pylons = new THREE.InstancedMesh(pylonGeo, pylonMat, count);
  const dummy = new THREE.Object3D();
  const frame: TrackFrame = {
    pos: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    bankAngle: 0,
  };

  for (let i = 0; i < count; i++) {
    const s = 15 + (i / count) * config.lengthMeters;
    spline.getFrameAt(s, frame);
    const side = i % 2 === 0 ? -1 : 1;
    dummy.position
      .copy(frame.pos)
      .addScaledVector(frame.right, side * (config.roadWidth * 0.5 + 8.5))
      .addScaledVector(frame.up, 2.0);
    dummy.rotation.set(0, 0, side * 0.18);
    dummy.scale.set(1, 0.85 + (i % 4) * 0.25, 1);
    dummy.updateMatrix();
    pylons.setMatrixAt(i, dummy.matrix);
  }
  pylons.instanceMatrix.needsUpdate = true;
  pylons.computeBoundingSphere();
  group.add(pylons);
}

function createObstacleAt(
  spline: TrackSpline,
  config: RaceConfig,
  type: 'rotor' | 'hammer' | 'barrier',
  s: number,
  id: number,
  disposables: { dispose: () => void }[],
): { root: THREE.Group; data: TrackObstacle } {
  const root = new THREE.Group();
  const frame: TrackFrame = {
    pos: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    bankAngle: 0,
  };
  spline.getFrameAt(s, frame);

  root.position.copy(frame.pos);
  const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.forward.clone().negate());
  root.quaternion.setFromRotationMatrix(basis);

  const phase = id * 1.45;
  let pivot: THREE.Object3D;
  let speed = 1.1;
  let halfWidth = 1.65;

  if (type === 'rotor') {
    // 3-Blade Spinning Rotor Barrier (Image 1!)
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.82,
      roughness: 0.25,
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0x450a0a,
      emissiveIntensity: 0.45,
      metalness: 0.45,
      roughness: 0.35,
    });
    disposables.push(hubMat, bladeMat);

    pivot = new THREE.Group();
    pivot.position.set(0, 5.2, 0);

    const hubGeo = new THREE.CylinderGeometry(1.15, 1.15, 1.4, 12);
    hubGeo.rotateX(Math.PI / 2);
    disposables.push(hubGeo);
    pivot.add(new THREE.Mesh(hubGeo, hubMat));

    const bladeGeo = new THREE.BoxGeometry(1.45, 5.3, 1.25);
    disposables.push(bladeGeo);

    for (let b = 0; b < 3; b++) {
      const arm = new THREE.Group();
      arm.rotation.z = (b * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = -2.95;
      blade.castShadow = true;
      arm.add(blade);
      pivot.add(arm);
    }

    root.add(pivot);
    speed = 0.88 + config.difficulty * 0.14;
    halfWidth = 1.55;
  } else if (type === 'hammer') {
    // Giant Swinging Red Pendulum Hammer on Truss Gantry (Image 5!)
    const trussMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.72,
      metalness: 0.15,
    });
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.42,
      metalness: 0.25,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.28,
      roughness: 0.35,
      metalness: 0.2,
    });
    disposables.push(trussMat, poleMat, headMat);

    const halfSpan = config.roadWidth * 0.5 + 1.2;
    const towerGeo = new THREE.BoxGeometry(1.1, 8.2, 1.1);
    const barGeo = new THREE.CylinderGeometry(0.32, 0.32, halfSpan * 2 + 1.4, 10);
    barGeo.rotateZ(Math.PI / 2);
    disposables.push(towerGeo, barGeo);

    for (const side of [-1, 1]) {
      const tower = new THREE.Mesh(towerGeo, trussMat);
      tower.position.set(side * halfSpan, 4.1, 0);
      root.add(tower);
    }
    const crossbar = new THREE.Mesh(barGeo, poleMat);
    crossbar.position.set(0, 7.6, 0);
    root.add(crossbar);

    // Swinging pendulum arm
    pivot = new THREE.Group();
    pivot.position.set(0, 7.6, 0);

    const armGeo = new THREE.BoxGeometry(0.85, 6.2, 0.75);
    const headGeo = new THREE.CylinderGeometry(1.55, 1.55, 2.2, 18);
    headGeo.rotateX(Math.PI / 2);
    disposables.push(armGeo, headGeo);

    const arm = new THREE.Mesh(armGeo, trussMat);
    arm.position.y = -3.1;
    pivot.add(arm);

    const hammerHead = new THREE.Mesh(headGeo, headMat);
    hammerHead.position.y = -6.15;
    hammerHead.castShadow = true;
    pivot.add(hammerHead);

    // Counterweight on top (just like Image 5!)
    const counter = new THREE.Mesh(headGeo, headMat);
    counter.scale.setScalar(0.68);
    counter.position.y = 1.65;
    pivot.add(counter);

    root.add(pivot);
    speed = 1.35 + config.difficulty * 0.16;
    halfWidth = 1.95;
  } else {
    // Sliding Neon / Armored Hazard Barrier
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.65,
    });
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    });
    disposables.push(bodyMat, stripMat);

    pivot = new THREE.Group();
    const gateGeo = new THREE.BoxGeometry(3.8, 1.45, 0.9);
    const stripGeo = new THREE.BoxGeometry(3.6, 0.26, 0.96);
    disposables.push(gateGeo, stripGeo);

    const gate = new THREE.Mesh(gateGeo, bodyMat);
    gate.position.y = 0.75;
    gate.castShadow = true;
    pivot.add(gate);

    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.y = 1.15;
    pivot.add(strip);

    root.add(pivot);
    speed = 1.25 + config.difficulty * 0.18;
    halfWidth = 2.05;
  }

  return {
    root,
    data: {
      id,
      type,
      s,
      phase,
      speed,
      currentLateral: 0,
      halfWidth,
      rotorAngle: 0,
      pivot,
      hitCooldown: 0,
      nearMissAwarded: false,
    },
  };
}

function buildStartFinishGantries(
  group: THREE.Group,
  spline: TrackSpline,
  config: RaceConfig,
  checkerTex: THREE.Texture,
  startLights: THREE.MeshStandardMaterial[],
  disposables: { dispose: () => void }[],
): void {
  const halfSpan = config.roadWidth * 0.5 + 0.9;
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.72,
    roughness: 0.3,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    map: checkerTex,
    roughness: 0.4,
    metalness: 0.1,
  });
  const pillarGeo = new THREE.BoxGeometry(0.9, 8.2, 0.9);
  const beamGeo = new THREE.BoxGeometry(halfSpan * 2 + 1.4, 1.5, 0.8);
  const lampGeo = new THREE.SphereGeometry(0.32, 12, 12);
  disposables.push(pillarMat, bannerMat, pillarGeo, beamGeo, lampGeo);

  const placeGantry = (s: number, isStart: boolean) => {
    const gantry = new THREE.Group();
    const frame: TrackFrame = {
      pos: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      bankAngle: 0,
    };
    spline.getFrameAt(s, frame);
    gantry.position.copy(frame.pos);
    const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.forward.clone().negate());
    gantry.quaternion.setFromRotationMatrix(basis);

    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(side * halfSpan, 4.1, 0);
      gantry.add(p);
    }

    const beam = new THREE.Mesh(beamGeo, bannerMat);
    beam.position.set(0, 7.6, 0);
    gantry.add(beam);

    // Painted start/finish line strip on road surface
    const lineGeo = new THREE.PlaneGeometry(config.roadWidth, 2.4);
    lineGeo.rotateX(-Math.PI / 2);
    const lineMat = new THREE.MeshBasicMaterial({
      map: checkerTex,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    disposables.push(lineGeo, lineMat);
    const lineMesh = new THREE.Mesh(lineGeo, lineMat);
    lineMesh.position.y = 0.05;
    gantry.add(lineMesh);

    // 5 FIA Start Lights on Start Gantry
    if (isStart) {
      for (let l = 0; l < 5; l++) {
        const lampMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          emissive: 0xef4444,
          emissiveIntensity: 0,
          roughness: 0.2,
        });
        disposables.push(lampMat);
        startLights.push(lampMat);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set((l - 2) * 1.4, 6.2, 0.45);
        gantry.add(lamp);
      }
    }

    group.add(gantry);
  };

  placeGantry(14, true);
  placeGantry(config.lengthMeters, false);
}
