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

const MODEL_FILES: Record<CarModelId, string> = {
  goblin: 'models/cars/goblin.glb',
  'concept-050': 'models/cars/concept-050.glb',
  'sport-coupe': 'models/cars/sport-coupe.glb',
  'aurora-gt': 'models/cars/aurora-gt.glb',
};

/** Length the procedural car is built at, so collisions and camera still fit. */
const TARGET_LENGTH_M = 4.45;

const WHEEL_NAME = /^wheel\.(front|rear)\.(L|R)$/;

let loader: GLTFLoader | null = null;
const cache = new Map<CarModelId, Promise<THREE.Object3D>>();

function loadModel(id: CarModelId): Promise<THREE.Object3D> {
  let pending = cache.get(id);
  if (!pending) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    const url = `${import.meta.env.BASE_URL}${MODEL_FILES[id]}`;
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
 * The procedural car stays visible if the model can't be loaded.
 */
export async function applyCarModel(rig: SupercarRig, id: CarModelId): Promise<boolean> {
  let source: THREE.Object3D;
  try {
    source = await loadModel(id);
  } catch (err) {
    console.warn(`[VELOTEX] car model "${id}" failed to load, keeping the built-in car`, err);
    return false;
  }
  if (rig.disposed) return false;

  const model = source.clone(true);

  // Per-car paint so each racer keeps its own colour (and the menu livery picker keeps working)
  rig.paintMaterial.side = THREE.DoubleSide;
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !Array.isArray(obj.material) && obj.material.name === 'paint') {
      obj.material = rig.paintMaterial;
    }
  });

  // Scale to the game's car length and turn the front from +Z to the game's forward (-Z)
  const holder = new THREE.Group();
  holder.name = `carModel:${id}`;
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  holder.scale.setScalar(TARGET_LENGTH_M / Math.max(size.z, 0.01));
  holder.rotation.y = Math.PI;
  holder.add(model);

  for (const part of rig.proceduralParts) part.visible = false;
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
      if (node.name.startsWith('wheel.front')) rig.frontSteerPivots.push(pivot);
    }
  }

  return true;
}
