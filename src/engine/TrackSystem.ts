import * as THREE from 'three';
import { RaceConfig, SceneryMode } from '../types/game';
import {
  createBoostPadTexture,
  createBuildingFacadeTextures,
  createCheckeredTexture,
  createHighwayRoadTexture,
  createMountainRockTexture,
  createRoadTexture,
  createTreeBarkTexture,
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

export function buildTrackWorld(
  config: RaceConfig,
  maxAnisotropy: number,
  scenery: SceneryMode = 'tunnel',
): BuiltTrack {
  // 'nature' = real-photo 360° backdrops (drawn by NatureBackdrop) with a plain
  // highway: no tunnels and no procedural scenery, so the photo stays visible.
  const nature = scenery === 'nature';
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
  const roadTex = nature
    ? createHighwayRoadTexture(maxAnisotropy, totalS / 24)
    : createRoadTexture(config.theme, maxAnisotropy, totalS / 15);
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
    const railH = nature ? 0.8 : config.theme === 'timber_valley' || config.theme === 'forest_canopy' ? 0.78 : 0.62;
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

  const isNeonRoad = !nature && (config.theme === 'neon_grid' || config.theme === 'cyber_tunnel');
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: isNeonRoad ? 0.38 : nature ? 0.88 : 0.72,
    metalness: isNeonRoad ? 0.25 : nature ? 0.0 : 0.08,
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

  const railColor = nature
    ? 0xc4ccd4
    : config.theme === 'forest_canopy' || config.theme === 'timber_valley'
      ? 0x92400e
      : config.theme === 'neon_grid'
        ? 0xd946ef
        : config.theme === 'cyber_tunnel'
          ? 0x0ea5e9
          : 0x334155;
  const railMat = new THREE.MeshStandardMaterial({
    color: railColor,
    roughness: isNeonRoad ? 0.3 : nature ? 0.42 : 0.75,
    metalness: isNeonRoad ? 0.5 : nature ? 0.65 : 0.15,
    emissive: isNeonRoad ? new THREE.Color(railColor) : new THREE.Color(0x000000),
    emissiveIntensity: isNeonRoad ? 0.45 : 0,
    side: THREE.DoubleSide,
  });
  disposables.push(railMat);
  group.add(new THREE.Mesh(railGeo, railMat));

  // 2. Curved Tunnel Sections (for Cyber Tunnel, Neon Grid, and Sunset GP underpasses)
  if (!nature && config.tunnelCoverage > 0) {
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

  // 3. Theme-specific Landscape & Instanced Environment Scenery
  // Keep glowing tunnel tracks (cyber_tunnel, neon_grid) in their original neon atmosphere!
  if (nature) {
    buildRoadsidePosts(group, spline, config, disposables);
  } else if (config.theme === 'forest_canopy' || config.theme === 'timber_valley') {
    buildNatureMountainsAndForest(group, spline, config, maxAnisotropy, disposables);
  } else if (config.theme === 'sunset_gp') {
    buildCitySkylineScenery(group, spline, config, maxAnisotropy, disposables);
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

/**
 * Roadside reflector posts every few metres (like real highway delineators).
 * They are the main thing that streams past the camera in photo mode, which is
 * what sells the sense of speed. Two InstancedMeshes = two draw calls.
 */
function buildRoadsidePosts(
  group: THREE.Group,
  spline: TrackSpline,
  config: RaceConfig,
  disposables: { dispose: () => void }[],
): void {
  const spacing = 16;
  const offset = config.roadWidth * 0.5 + 1.1;
  const count = Math.ceil((config.lengthMeters + 140) / spacing) * 2;

  const postGeo = new THREE.BoxGeometry(0.14, 1.1, 0.14);
  postGeo.translate(0, 0.55, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, metalness: 0.05 });
  const capGeo = new THREE.BoxGeometry(0.15, 0.16, 0.15);
  capGeo.translate(0, 0.92, 0);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: new THREE.Color(0xf59e0b),
    emissiveIntensity: 0.35,
    roughness: 0.35,
  });
  disposables.push(postGeo, postMat, capGeo, capMat);

  const posts = new THREE.InstancedMesh(postGeo, postMat, count);
  const caps = new THREE.InstancedMesh(capGeo, capMat, count);
  const frame: TrackFrame = {
    pos: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    bankAngle: 0,
  };
  const dummy = new THREE.Object3D();
  const basis = new THREE.Matrix4();
  let i = 0;
  for (let s = -30; s < config.lengthMeters + 130 && i < count - 1; s += spacing) {
    spline.getFrameAt(s, frame);
    basis.makeBasis(frame.right, frame.up, frame.forward.clone().negate());
    for (const side of [-1, 1]) {
      dummy.position.copy(frame.pos).addScaledVector(frame.right, side * offset);
      dummy.quaternion.setFromRotationMatrix(basis);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
      caps.setMatrixAt(i, dummy.matrix);
      i++;
    }
  }
  posts.count = i;
  caps.count = i;
  posts.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  group.add(posts, caps);
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

function buildNatureMountainsAndForest(
  group: THREE.Group,
  spline: TrackSpline,
  config: RaceConfig,
  maxAnisotropy: number,
  disposables: { dispose: () => void }[],
): void {
  // 1. Extended sweeping green valley terrain far below & beyond track (prevents floating void)
  const terrainGeo = new THREE.PlaneGeometry(680, config.lengthMeters + 760, 36, 96);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const sampleP = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i) - config.lengthMeters * 0.48;
    const s = Math.max(-40, Math.min(config.lengthMeters + 120, -z));
    spline.samplePosition(s, sampleP);
    const distFromTrack = Math.abs(x - sampleP.x);
    // Natural rolling valley floor rising steeply into alpine foothills further out
    const hillRise =
      Math.max(0, distFromTrack - 18) * 0.34 +
      Math.sin(x * 0.042) * Math.cos(z * 0.028) * 7.5;
    const y = sampleP.y - 4.2 + hillRise;
    posAttr.setXYZ(i, x + sampleP.x * 0.35, y, z);
  }
  terrainGeo.computeVertexNormals();
  disposables.push(terrainGeo);

  const terrainColor = config.theme === 'forest_canopy' ? 0x2d5a1e : 0x3f7a18;
  const terrainMat = new THREE.MeshStandardMaterial({
    color: terrainColor,
    roughness: 0.92,
    metalness: 0.02,
  });
  disposables.push(terrainMat);
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // 2. Dramatic Layered Mountain Range Backdrop (Instanced faceted peaks with rock & snow texture)
  const mountainTex = createMountainRockTexture(maxAnisotropy);
  disposables.push(mountainTex);

  // Sculpted asymmetric mountain peak geometry (bottom-center pivoted)
  const peakGeo = new THREE.ConeGeometry(46, 92, 7, 4);
  peakGeo.translate(0, 46, 0);
  const peakPos = peakGeo.attributes.position;
  for (let i = 0; i < peakPos.count; i++) {
    const px = peakPos.getX(i);
    const py = peakPos.getY(i);
    const pz = peakPos.getZ(i);
    // Keep summit sharp and base grounded while adding craggy ridge facets
    const ridgeNoise = py > 4 && py < 88 ? (Math.sin(px * 0.14 + py * 0.08) * 5.2 + Math.cos(pz * 0.13) * 4.5) : 0;
    peakPos.setXYZ(i, px + ridgeNoise * 0.55, py, pz + ridgeNoise * 0.45);
  }
  peakGeo.computeVertexNormals();

  const mountainMat = new THREE.MeshStandardMaterial({
    map: mountainTex,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });
  disposables.push(peakGeo, mountainMat);

  const mountainCount = 68;
  const mountains = new THREE.InstancedMesh(peakGeo, mountainMat, mountainCount);
  const dummy = new THREE.Object3D();
  const frame: TrackFrame = {
    pos: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    bankAngle: 0,
  };
  const tint = new THREE.Color();

  for (let i = 0; i < mountainCount; i++) {
    const isHorizonEnd = i >= mountainCount - 8;
    const s = isHorizonEnd
      ? config.lengthMeters + 160 + (i - (mountainCount - 8)) * 18
      : -20 + (i / (mountainCount - 8)) * (config.lengthMeters + 220);
    spline.getFrameAt(Math.min(config.lengthMeters + 120, Math.max(-35, s)), frame);

    const side = i % 2 === 0 ? -1 : 1;
    const lateralDist = isHorizonEnd
      ? ((i - (mountainCount - 8)) - 3.5) * 68
      : side * (95 + ((i * 29) % 120));

    const scaleXZ = 1.0 + ((i * 19) % 10) * 0.14;
    const scaleY = 0.78 + ((i * 31) % 10) * 0.15;

    dummy.position
      .copy(frame.pos)
      .addScaledVector(frame.right, lateralDist)
      .addScaledVector(frame.up, -14);
    dummy.rotation.set(0, (i * 1.37) % (Math.PI * 2), 0);
    dummy.scale.set(scaleXZ, scaleY, scaleXZ * 0.92);
    dummy.updateMatrix();
    mountains.setMatrixAt(i, dummy.matrix);

    // Subtle atmospheric blue-gray / warm-granite tint variation per peak
    tint.setHSL(0.56 + ((i * 7) % 10) * 0.008, 0.12, 0.82 + ((i * 11) % 6) * 0.03);
    mountains.setColorAt(i, tint);
  }
  mountains.instanceMatrix.needsUpdate = true;
  if (mountains.instanceColor) mountains.instanceColor.needsUpdate = true;
  mountains.computeBoundingSphere();
  group.add(mountains);

  // 3. Foreground Giant Overhanging Canopy Trees (bark-textured trunks + rich broadleaf crowns)
  const barkTex = createTreeBarkTexture(maxAnisotropy);
  disposables.push(barkTex);

  const canopyTreeCount = 156;
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.98, 18.5, 8);
  trunkGeo.translate(0, 9.25, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    map: barkTex,
    roughness: 0.92,
    metalness: 0.02,
  });

  const canopyGeo = new THREE.DodecahedronGeometry(6.8, 1);
  canopyGeo.scale(1.45, 0.75, 1.35);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x4d9e28,
    roughness: 0.84,
    metalness: 0.03,
  });
  disposables.push(trunkGeo, trunkMat, canopyGeo, canopyMat);

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, canopyTreeCount);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, canopyTreeCount);

  for (let i = 0; i < canopyTreeCount; i++) {
    const s = 18 + (i / canopyTreeCount) * (config.lengthMeters + 60);
    spline.getFrameAt(s, frame);
    const side = i % 2 === 0 ? -1 : 1;
    const dist = config.roadWidth * 0.5 + 3.8 + (i % 5) * 3.0;
    const scale = 0.85 + ((i * 37) % 100) * 0.0036;

    dummy.position
      .copy(frame.pos)
      .addScaledVector(frame.right, side * dist)
      .addScaledVector(frame.up, -1.8);
    dummy.rotation.set(
      (((i * 13) % 10) - 5) * 0.02,
      (i * 1.1) % (Math.PI * 2),
      side * 0.23,
    );
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    dummy.position
      .copy(frame.pos)
      .addScaledVector(frame.right, side * (dist - 3.7))
      .addScaledVector(frame.up, 15.8 * scale);
    dummy.rotation.set(0, i * 0.9, 0);
    dummy.scale.set(scale * 1.15, scale * 0.95, scale * 1.15);
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);

    tint.setHSL(0.24 + ((i * 19) % 15) * 0.004, 0.62, 0.36 + ((i * 7) % 10) * 0.015);
    canopies.setColorAt(i, tint);
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere();
  canopies.computeBoundingSphere();
  group.add(trunks, canopies);

  // 4. Midground Layered Pine/Conifer Forest along the valley slopes & mountain foothills
  const pineCount = 140;
  const pineTrunkGeo = new THREE.CylinderGeometry(0.32, 0.55, 6.0, 6);
  pineTrunkGeo.translate(0, 3.0, 0);
  const pineTier1Geo = new THREE.ConeGeometry(3.8, 9.5, 7);
  pineTier1Geo.translate(0, 8.2, 0);
  const pineTier2Geo = new THREE.ConeGeometry(2.7, 7.6, 7);
  pineTier2Geo.translate(0, 13.4, 0);
  const pineMat = new THREE.MeshStandardMaterial({
    color: 0x2f6e24,
    roughness: 0.88,
    metalness: 0.02,
  });
  disposables.push(pineTrunkGeo, pineTier1Geo, pineTier2Geo, pineMat);

  const pineTrunks = new THREE.InstancedMesh(pineTrunkGeo, trunkMat, pineCount);
  const pineLower = new THREE.InstancedMesh(pineTier1Geo, pineMat, pineCount);
  const pineUpper = new THREE.InstancedMesh(pineTier2Geo, pineMat, pineCount);

  for (let i = 0; i < pineCount; i++) {
    const s = 10 + (i / pineCount) * (config.lengthMeters + 80);
    spline.getFrameAt(s, frame);
    const side = i % 2 === 0 ? -1 : 1;
    const slopeDist = config.roadWidth * 0.5 + 22 + ((i * 23) % 44);
    const slopeY = Math.max(0, slopeDist - 18) * 0.32 - 3.8;
    const scale = 0.85 + ((i * 41) % 10) * 0.085;

    dummy.position
      .copy(frame.pos)
      .addScaledVector(frame.right, side * slopeDist)
      .addScaledVector(frame.up, slopeY);
    dummy.rotation.set(0, i * 0.77, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    pineTrunks.setMatrixAt(i, dummy.matrix);
    pineLower.setMatrixAt(i, dummy.matrix);
    pineUpper.setMatrixAt(i, dummy.matrix);

    tint.setHSL(0.28 + ((i * 13) % 12) * 0.004, 0.52, 0.25 + ((i * 5) % 9) * 0.014);
    pineLower.setColorAt(i, tint);
    pineUpper.setColorAt(i, tint);
  }
  pineTrunks.instanceMatrix.needsUpdate = true;
  pineLower.instanceMatrix.needsUpdate = true;
  pineUpper.instanceMatrix.needsUpdate = true;
  if (pineLower.instanceColor) pineLower.instanceColor.needsUpdate = true;
  if (pineUpper.instanceColor) pineUpper.instanceColor.needsUpdate = true;
  pineTrunks.computeBoundingSphere();
  pineLower.computeBoundingSphere();
  pineUpper.computeBoundingSphere();
  group.add(pineTrunks, pineLower, pineUpper);
}

/**
 * Builds an urban sunset grand prix skyline for Race 5 (sunset_gp) with realistic
 * concrete & glass-windowed high-rise buildings, rooftop structures, and avenue lighting.
 */
function buildCitySkylineScenery(
  group: THREE.Group,
  spline: TrackSpline,
  config: RaceConfig,
  maxAnisotropy: number,
  disposables: { dispose: () => void }[],
): void {
  // 1. Extended urban concrete/plaza ground deck beneath and flanking the highway
  const groundGeo = new THREE.PlaneGeometry(580, config.lengthMeters + 680, 24, 72);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.attributes.position;
  const sampleP = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i) - config.lengthMeters * 0.48;
    const s = Math.max(-40, Math.min(config.lengthMeters + 100, -z));
    spline.samplePosition(s, sampleP);
    posAttr.setXYZ(i, x + sampleP.x * 0.35, sampleP.y - 4.4, z);
  }
  groundGeo.computeVertexNormals();
  disposables.push(groundGeo);

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1c1e26,
    roughness: 0.9,
    metalness: 0.08,
  });
  disposables.push(groundMat);
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // 2. Two Realistic Procedural Concrete + Window Facade Materials (with warm lit windows!)
  const officeTex = createBuildingFacadeTextures('concrete_office', maxAnisotropy);
  const towerTex = createBuildingFacadeTextures('glass_tower', maxAnisotropy);
  officeTex.albedo.repeat.set(1, 1);
  officeTex.emissive.repeat.set(1, 1);
  towerTex.albedo.repeat.set(1, 1);
  towerTex.emissive.repeat.set(1, 1);
  disposables.push(officeTex.albedo, officeTex.emissive, towerTex.albedo, towerTex.emissive);

  const applyWorldFacadeUvScale = (
    mat: THREE.MeshStandardMaterial,
    cacheKey: string,
    bayWidthM: number,
    colsPerTile: number,
    floorHeightM: number,
    floorsPerTile: number,
  ) => {
    mat.customProgramCacheKey = () => cacheKey;
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_INSTANCING
          float instW = length( instanceMatrix[0].xyz );
          float instH = length( instanceMatrix[1].xyz );
          float instD = length( instanceMatrix[2].xyz );
          float faceSpan = abs( normal.x ) > 0.5 ? instD : instW;
          float uTiles = max( 2.0, floor( faceSpan / ${bayWidthM.toFixed(2)} + 0.5 ) ) / ${colsPerTile.toFixed(1)};
          float vTiles = max( 3.0, floor( instH / ${floorHeightM.toFixed(2)} + 0.5 ) ) / ${floorsPerTile.toFixed(1)};
          vec2 facadeScale = vec2( uTiles, vTiles );
          #ifdef USE_MAP
            vMapUv *= facadeScale;
          #endif
          #ifdef USE_EMISSIVEMAP
            vEmissiveMapUv *= facadeScale;
          #endif
        #endif`,
      );
    };
  };

  const concreteRoofMat = new THREE.MeshStandardMaterial({
    color: 0x3b4252,
    roughness: 0.86,
    metalness: 0.12,
  });

  const officeWallMat = new THREE.MeshStandardMaterial({
    map: officeTex.albedo,
    emissiveMap: officeTex.emissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.95,
    roughness: 0.68,
    metalness: 0.22,
  });
  applyWorldFacadeUvScale(officeWallMat, 'city-facade-office', 3.2, 6, 3.5, 8);

  const towerWallMat = new THREE.MeshStandardMaterial({
    map: towerTex.albedo,
    emissiveMap: towerTex.emissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.05,
    roughness: 0.42,
    metalness: 0.45,
  });
  applyWorldFacadeUvScale(towerWallMat, 'city-facade-tower', 2.6, 8, 3.5, 8);
  disposables.push(concreteRoofMat, officeWallMat, towerWallMat);

  // Unit cube shifted so y = 0 sits flush at ground level
  const bldgGeo = new THREE.BoxGeometry(1, 1, 1);
  bldgGeo.translate(0, 0.5, 0);
  const roofUnitGeo = new THREE.BoxGeometry(0.58, 0.09, 0.58);
  roofUnitGeo.translate(0, 1.045, 0);
  disposables.push(bldgGeo, roofUnitGeo);

  // Multi-material per cube: textured windows on 4 sides, matte concrete on roof/base
  const officeMats = [officeWallMat, officeWallMat, concreteRoofMat, concreteRoofMat, officeWallMat, officeWallMat];
  const towerMats = [towerWallMat, towerWallMat, concreteRoofMat, concreteRoofMat, towerWallMat, towerWallMat];

  // Collect building placements skipping the two highway tunnel zones ([420..860], [1580..2060]) for streetfront row
  const inTunnelZone = (s: number) => (s > 405 && s < 875) || (s > 1565 && s < 2075);

  const officeMatrices: { mat: THREE.Matrix4; tint: THREE.Color }[] = [];
  const towerMatrices: { mat: THREE.Matrix4; tint: THREE.Color }[] = [];
  const roofMatrices: THREE.Matrix4[] = [];

  const dummy = new THREE.Object3D();
  const frame: TrackFrame = {
    pos: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    bankAngle: 0,
  };
  const basis = new THREE.Matrix4();

  // Front avenue buildings + second-row towering skyline
  let idx = 0;
  for (let s = -10; s < config.lengthMeters + 110; s += 26) {
    spline.getFrameAt(s, frame);
    basis.makeBasis(frame.right, _worldUp, frame.forward.clone().setY(0).normalize().negate());

    for (const side of [-1, 1]) {
      // Front street-side concrete & glass building (kept outside tunnel shell)
      const isTunnel = inTunnelZone(s);
      const width = 12 + ((idx * 7) % 10);
      const depth = 13 + ((idx * 11) % 9);
      const height = 24 + ((idx * 17) % 42);
      const dist = config.roadWidth * 0.5 + (isTunnel ? 24 : 11.5) + width * 0.5 + ((idx * 5) % 6);

      dummy.position
        .copy(frame.pos)
        .addScaledVector(frame.right, side * dist);
      dummy.position.y = frame.pos.y - 4.4;
      dummy.quaternion.setFromRotationMatrix(basis);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();

      const tint = new THREE.Color().setHSL(
        0.07 + ((idx * 13) % 8) * 0.015,
        0.08,
        0.82 + ((idx * 19) % 7) * 0.03,
      );

      if (idx % 2 === 0) {
        officeMatrices.push({ mat: dummy.matrix.clone(), tint });
      } else {
        towerMatrices.push({ mat: dummy.matrix.clone(), tint });
      }
      roofMatrices.push(dummy.matrix.clone());

      // Second-row tall skyline skyscraper behind front buildings for rich urban depth
      if (idx % 2 === 0) {
        const bgW = 18 + ((idx * 13) % 14);
        const bgD = 18 + ((idx * 9) % 12);
        const bgH = 48 + ((idx * 23) % 58);
        const bgDist = dist + 28 + ((idx * 17) % 24);

        dummy.position
          .copy(frame.pos)
          .addScaledVector(frame.right, side * bgDist);
        dummy.position.y = frame.pos.y - 4.4;
        dummy.quaternion.setFromRotationMatrix(basis);
        dummy.scale.set(bgW, bgH, bgD);
        dummy.updateMatrix();

        const bgTint = new THREE.Color().setHSL(0.62, 0.14, 0.72 + ((idx * 5) % 6) * 0.04);
        towerMatrices.push({ mat: dummy.matrix.clone(), tint: bgTint });
        roofMatrices.push(dummy.matrix.clone());
      }

      idx++;
    }
  }

  const officeInst = new THREE.InstancedMesh(bldgGeo, officeMats, Math.max(1, officeMatrices.length));
  officeMatrices.forEach((entry, i) => {
    officeInst.setMatrixAt(i, entry.mat);
    officeInst.setColorAt(i, entry.tint);
  });
  officeInst.instanceMatrix.needsUpdate = true;
  if (officeInst.instanceColor) officeInst.instanceColor.needsUpdate = true;
  officeInst.computeBoundingSphere();

  const towerInst = new THREE.InstancedMesh(bldgGeo, towerMats, Math.max(1, towerMatrices.length));
  towerMatrices.forEach((entry, i) => {
    towerInst.setMatrixAt(i, entry.mat);
    towerInst.setColorAt(i, entry.tint);
  });
  towerInst.instanceMatrix.needsUpdate = true;
  if (towerInst.instanceColor) towerInst.instanceColor.needsUpdate = true;
  towerInst.computeBoundingSphere();

  const roofInst = new THREE.InstancedMesh(roofUnitGeo, concreteRoofMat, Math.max(1, roofMatrices.length));
  roofMatrices.forEach((m, i) => roofInst.setMatrixAt(i, m));
  roofInst.instanceMatrix.needsUpdate = true;
  roofInst.computeBoundingSphere();

  group.add(officeInst, towerInst, roofInst);

  // 3. Urban Highway Streetlight Poles & Warm Sodium/LED Lamps along open sections
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 8.6, 6);
  poleGeo.translate(0, 4.3, 0);
  const lampGeo = new THREE.BoxGeometry(1.5, 0.24, 0.45);
  lampGeo.translate(0, 8.6, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfde68a });
  disposables.push(poleGeo, lampGeo, poleMat, lampMat);

  const lampPlacements: THREE.Matrix4[] = [];
  for (let s = 20; s < config.lengthMeters + 60; s += 38) {
    if (inTunnelZone(s)) continue;
    spline.getFrameAt(s, frame);
    basis.makeBasis(frame.right, frame.up, frame.forward.clone().negate());
    for (const side of [-1, 1]) {
      dummy.position
        .copy(frame.pos)
        .addScaledVector(frame.right, side * (config.roadWidth * 0.5 + 1.35))
        .addScaledVector(frame.up, -0.2);
      dummy.quaternion.setFromRotationMatrix(basis);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lampPlacements.push(dummy.matrix.clone());
    }
  }

  if (lampPlacements.length > 0) {
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPlacements.length);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampPlacements.length);
    lampPlacements.forEach((m, i) => {
      poles.setMatrixAt(i, m);
      lamps.setMatrixAt(i, m);
    });
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    poles.computeBoundingSphere();
    lamps.computeBoundingSphere();
    group.add(poles, lamps);
  }
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
