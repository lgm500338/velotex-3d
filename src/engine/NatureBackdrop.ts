import * as THREE from 'three';

/**
 * Photo-real 360° backdrops for "nature" scenery mode.
 *
 * Each scene is an equirectangular photo (tonemapped from a CC0 Poly Haven HDRI,
 * see public/backgrounds/CREDITS.md). The backdrop is drawn on a large sphere that
 * follows the camera, so it always sits "at infinity" like a real horizon.
 * Two textures are blended in the shader so scenes cross-fade while driving.
 */

export interface NatureScene {
  id: string;
  file: string;
  /** Rotation of the panorama around the vertical axis (radians). */
  yaw: number;
  /** Average horizon colour, used for distance fog so the road melts into the photo. */
  fogHex: number;
  skyHex: number;
  groundHex: number;
  sunHex: number;
}

export const NATURE_SCENES: NatureScene[] = [
  { id: 'desert', file: 'desert.jpg', yaw: 0.0, fogHex: 0xb9a888, skyHex: 0xcfe3ff, groundHex: 0x9c8058, sunHex: 0xfff1d6 },
  { id: 'sea', file: 'sea.jpg', yaw: Math.PI, fogHex: 0x8f989c, skyHex: 0xd6e8ff, groundHex: 0x41505a, sunHex: 0xfff6e6 },
  { id: 'meadow', file: 'meadow.jpg', yaw: 0.0, fogHex: 0xb4b89a, skyHex: 0xd4e6ff, groundHex: 0x5f7a32, sunHex: 0xfff4dc },
  { id: 'hills', file: 'hills.jpg', yaw: 0.6, fogHex: 0xb3bcc4, skyHex: 0xd8e9ff, groundHex: 0x8a6a4a, sunHex: 0xfff3dd },
  { id: 'plateau', file: 'plateau.jpg', yaw: 0.0, fogHex: 0xc3cad4, skyHex: 0xd2e4ff, groundHex: 0x8a6a48, sunHex: 0xfff2da },
];

/** How far (metres of track) each scene lasts before the next one fades in. */
const SCENE_LENGTH_M = 700;
/** Length of the cross-fade between two scenes (metres of track). */
const FADE_M = 140;

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w; // pin to the far plane
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D mapA;
  uniform sampler2D mapB;
  uniform float yawA;
  uniform float yawB;
  uniform float blend;
  uniform vec3 nadirColor;
  varying vec3 vDir;
  #define PI 3.141592653589793

  vec2 equirectUv(vec3 d, float yaw) {
    float u = atan(d.z, d.x) / (2.0 * PI) + 0.5 + yaw / (2.0 * PI);
    float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
    return vec2(fract(u), v);
  }

  void main() {
    vec3 d = normalize(vDir);
    vec4 a = texture2D(mapA, equirectUv(d, yawA));
    vec4 col = a;
    if (blend > 0.001) {
      vec4 b = texture2D(mapB, equirectUv(d, yawB));
      col = mix(a, b, blend);
    }
    // Hide the photographer's tripod spot straight below the camera.
    col.rgb = mix(col.rgb, nadirColor, smoothstep(-0.6, -0.85, d.y));
    gl_FragColor = vec4(col.rgb, 1.0);
    #include <colorspace_fragment>
  }
`;

export class NatureBackdrop {
  public readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private loader = new THREE.TextureLoader();
  private textures = new Map<string, THREE.Texture>();
  private loading = new Map<string, Promise<THREE.Texture>>();
  private placeholder: THREE.DataTexture;
  private basePath: string;
  private startIndex = 0;
  private disposed = false;

  /** Current blended light/fog colours, updated every frame by `update`. */
  public readonly fogColor = new THREE.Color();
  public readonly skyColor = new THREE.Color();
  public readonly groundColor = new THREE.Color();
  public readonly sunColor = new THREE.Color();

  constructor(basePath: string) {
    this.basePath = basePath;
    this.placeholder = new THREE.DataTexture(new Uint8Array([150, 170, 190, 255]), 1, 1);
    this.placeholder.colorSpace = THREE.SRGBColorSpace;
    this.placeholder.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        mapA: { value: this.placeholder },
        mapB: { value: this.placeholder },
        yawA: { value: 0 },
        yawB: { value: 0 },
        blend: { value: 0 },
        nadirColor: { value: new THREE.Color(0x777777) },
      },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });

    const geo = new THREE.SphereGeometry(300, 48, 24);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Each race begins on a different photo so the five races don't all look alike. */
  public setRace(raceId: number): void {
    this.startIndex = (raceId - 1) % NATURE_SCENES.length;
    // Warm up the first two scenes of this race right away.
    this.ensure(this.sceneAt(0));
    this.ensure(this.sceneAt(1));
  }

  private sceneAt(slot: number): NatureScene {
    return NATURE_SCENES[(this.startIndex + Math.max(0, slot)) % NATURE_SCENES.length];
  }

  private ensure(scene: NatureScene): Promise<THREE.Texture> {
    const cached = this.textures.get(scene.id);
    if (cached) return Promise.resolve(cached);
    const pending = this.loading.get(scene.id);
    if (pending) return pending;
    const p = new Promise<THREE.Texture>((resolve, reject) => {
      this.loader.load(
        this.basePath + scene.file,
        (tex) => {
          if (this.disposed) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          // Panorama is magnified on screen; skipping mipmaps avoids a visible seam
          // at the wrap-around and saves memory on phones.
          tex.generateMipmaps = false;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.needsUpdate = true;
          this.textures.set(scene.id, tex);
          this.loading.delete(scene.id);
          resolve(tex);
        },
        undefined,
        (err) => {
          this.loading.delete(scene.id);
          reject(err);
        },
      );
    });
    p.catch(() => undefined);
    this.loading.set(scene.id, p);
    return p;
  }

  /** Resolves once the first photo of the current race is ready (or failed). */
  public ready(): Promise<void> {
    return this.ensure(this.sceneAt(0)).then(
      () => undefined,
      () => undefined,
    );
  }

  private texFor(scene: NatureScene): THREE.Texture {
    return this.textures.get(scene.id) ?? this.placeholder;
  }

  /**
   * @param cameraPos  camera world position (sphere is centred on it)
   * @param distanceM  player's distance along the track in metres
   */
  public update(cameraPos: THREE.Vector3, distanceM: number): void {
    this.mesh.position.copy(cameraPos);

    const d = Math.max(0, distanceM);
    const slot = Math.floor(d / SCENE_LENGTH_M);
    const into = d - slot * SCENE_LENGTH_M;
    const fadeStart = SCENE_LENGTH_M - FADE_M;
    let blend = 0;
    if (into > fadeStart) {
      const t = (into - fadeStart) / FADE_M;
      blend = t * t * (3 - 2 * t);
    }

    const cur = this.sceneAt(slot);
    const next = this.sceneAt(slot + 1);
    // Keep the upcoming photo loading well before it is needed.
    if (into > SCENE_LENGTH_M * 0.25) this.ensure(next);

    const texA = this.texFor(cur);
    const texB = this.texFor(next);
    // Don't fade into a grey placeholder if the next photo is still downloading.
    if (texB === this.placeholder) blend = 0;

    const u = this.material.uniforms;
    u.mapA.value = texA;
    u.mapB.value = texB;
    u.yawA.value = cur.yaw;
    u.yawB.value = next.yaw;
    u.blend.value = blend;

    this.fogColor.setHex(cur.fogHex).lerp(_tmpColor.setHex(next.fogHex), blend);
    this.skyColor.setHex(cur.skyHex).lerp(_tmpColor.setHex(next.skyHex), blend);
    this.groundColor.setHex(cur.groundHex).lerp(_tmpColor.setHex(next.groundHex), blend);
    this.sunColor.setHex(cur.sunHex).lerp(_tmpColor.setHex(next.sunHex), blend);
    (u.nadirColor.value as THREE.Color).copy(this.groundColor);
  }

  public dispose(): void {
    this.disposed = true;
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    this.placeholder.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

const _tmpColor = new THREE.Color();
