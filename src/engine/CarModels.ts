import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { SupercarRig } from './CarBuilder';

/**
 * Realistic glTF car bodies that replace the procedural box-built car once loaded.
 * Every file follows one convention (see CREDITS.md for sources and licences):
 * - front of the car faces +Z, Y up, metres, wheels touching y = 0
 * - wheel nodes are named wheel.front.L / wheel.front.R / wheel.rear.L / wheel.rear.R
 * - the recolourable body paint uses a material named "paint"
 */
export type CarModelId = 'goblin' | 'concept-050' | 'sport-coupe' | 'aurora-gt';

interface CarModelSpec {
  file: string;
  /**
   * Some models paint the body through a texture atlas that also holds lights, grilles and number plates.
   * Texels close to this sRGB colour are body paint and take the racer's livery colour; every other texel
   * keeps its own colour, so those details don't all turn into one flat colour.
   */
  paintKey?: { color: [number, number, number]; tolerance: number };
}

const MODELS: Record<CarModelId, CarModelSpec> = {
  goblin: { file: 'models/cars/goblin.glb', paintKey: { color: [0, 0, 0], tolerance: 0.07 } },
  'concept-050': { file: 'models/cars/concept-050.glb' },
  'sport-coupe': {
    file: 'models/cars/sport-coupe.glb',
    paintKey: { color: [136 / 255, 20 / 255, 20 / 255], tolerance: 0.16 },
  },
  'aurora-gt': { file: 'models/cars/aurora-gt.glb' },
};

/** Length the procedural car is built at, so collisions and camera still fit. */
const TARGET_LENGTH_M = 4.45;

// GLTFLoader strips dots from node names, so "wheel.front.L" arrives as "wheelfrontL"
const WHEEL_NAME = /^wheel\.?(front|rear)\.?(L|R)$/;

let loader: GLTFLoader | null = null;
const cache = new Map<CarModelId, Promise<THREE.Object3D>>();

function loadModel(id: CarModelId): Promise<THREE.Object3D> {
  let pending = cache.get(id);
  if (!pending) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    const url = `${import.meta.env.BASE_URL}${MODELS[id].file}`;
    pending = loader.loadAsync(url).then((gltf) => {
      gltf.scene.traverse((obj) => {
        obj.userData.sharedCarAsset = true;
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      return gltf.scene;
    });
    // Allow a retry next race if the download failed
    pending.catch(() => cache.delete(id));
    cache.set(id, pending);
  }
  return pending;
}

/** Start downloading models early so they are ready when the race grid is built. */
export function preloadCarModels(ids: CarModelId[]): void {
  for (const id of ids) {
    loadModel(id).catch(() => undefined);
  }
}

/**
 * Swaps the procedural body of a rig for a realistic glTF car.
 * The procedural car is hidden while the model loads and shown again only if loading fails.
 */
export async function applyCarModel(rig: SupercarRig, id: CarModelId): Promise<boolean> {
  // Hide the built-in box car straight away so it never flashes on screen while the model downloads
  for (const part of rig.proceduralParts) part.visible = false;
  let source: THREE.Object3D;
  try {
    source = await loadModel(id);
  } catch (err) {
    console.warn(`[VELOTEX] car model "${id}" failed to load, showing the built-in car instead`, err);
    if (!rig.disposed) for (const part of rig.proceduralParts) part.visible = true;
    return false;
  }
  if (rig.disposed) return false;

  const model = source.clone(true);

  // Per-car paint so each racer keeps its own colour (and the menu livery picker keeps working).
  // Wheels keep their own materials even where a model shares the paint material with its rims.
  const insideWheel = new Set<THREE.Object3D>();
  model.traverse((obj) => {
    if (WHEEL_NAME.test(obj.name)) obj.traverse((child) => insideWheel.add(child));
  });
  let paintSource: THREE.MeshStandardMaterial | null = null;
  model.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      !insideWheel.has(obj) &&
      !Array.isArray(obj.material) &&
      obj.material.name === 'paint'
    ) {
      paintSource = obj.material as THREE.MeshStandardMaterial;
      obj.material = rig.paintMaterial;
    }
  });
  if (paintSource) setupPaint(rig.paintMaterial, paintSource, MODELS[id]);

  // Scale to the game's car length and turn the front from +Z to the game's forward (-Z)
  const holder = new THREE.Group();
  holder.name = `carModel:${id}`;
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  holder.scale.setScalar(TARGET_LENGTH_M / Math.max(size.z, 0.01));
  holder.rotation.y = Math.PI;
  holder.add(model);

  rig.group.add(holder);
  rig.group.updateMatrixWorld(true);

  // Re-home each wheel under a pivot at its hub so it can spin and steer like the built-in wheels
  const wheelNodes: THREE.Object3D[] = [];
  model.traverse((obj) => {
    if (WHEEL_NAME.test(obj.name)) wheelNodes.push(obj);
  });

  if (wheelNodes.length === 4) {
    rig.wheels.length = 0;
    rig.frontSteerPivots.length = 0;
    const hubWorld = new THREE.Vector3();
    for (const node of wheelNodes) {
      new THREE.Box3().setFromObject(node).getCenter(hubWorld);
      const pivot = new THREE.Group();
      pivot.position.copy(rig.group.worldToLocal(hubWorld.clone()));
      const spin = new THREE.Group();
      pivot.add(spin);
      rig.group.add(pivot);
      pivot.updateMatrixWorld(true);
      spin.attach(node);
      rig.wheels.push(spin);
      if (/^wheel\.?front/.test(node.name)) rig.frontSteerPivots.push(pivot);
    }
  }

  return true;
}

/**
 * Gives the rig's paint the model's own surface detail: ambient occlusion and normal maps, and,
 * where the body is painted through a texture atlas, a mask so only the body takes the livery colour.
 */
function setupPaint(
  paint: THREE.MeshPhysicalMaterial,
  source: THREE.MeshStandardMaterial,
  spec: CarModelSpec,
): void {
  paint.side = THREE.DoubleSide;
  paint.aoMap = source.aoMap;
  paint.aoMapIntensity = source.aoMap ? 1 : paint.aoMapIntensity;
  paint.normalMap = source.normalMap;
  if (source.normalMap) paint.normalScale.copy(source.normalScale);

  const key = spec.paintKey;
  if (!key || !source.map) return;
  paint.map = source.map;
  const uniforms = {
    paintKey: { value: new THREE.Vector3(...key.color) },
    paintTolerance: { value: key.tolerance },
  };
  paint.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 paintKey;\nuniform float paintTolerance;\nfloat paintMask = 1.0;\nvoid main() {',
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 paintTexel = texture2D( map, vMapUv );
          vec3 paintTexelSrgb = pow( max( paintTexel.rgb, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) );
          paintMask = 1.0 - smoothstep( paintTolerance, paintTolerance * 1.8, distance( paintTexelSrgb, paintKey ) );
          diffuseColor.rgb = mix( paintTexel.rgb, diffuseColor.rgb, paintMask );
        #endif`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor *= paintMask;
        roughnessFactor = mix( 0.55, roughnessFactor, paintMask );`,
      );
  };
  paint.customProgramCacheKey = () => `velotex-paint-${key.color.join(',')}-${key.tolerance}`;
  paint.needsUpdate = true;
}
