import * as THREE from 'three';

export interface SupercarRig {
  group: THREE.Group;
  exteriorCabinGroup: THREE.Group;
  wheels: THREE.Object3D[];
  frontSteerPivots: THREE.Group[];
  taillightMat: THREE.MeshStandardMaterial;
  nitroFlames: THREE.Mesh[];
  paintMaterial: THREE.MeshPhysicalMaterial;
  accentMaterial: THREE.MeshPhysicalMaterial;
}

/**
 * Builds a composite 12+ part sculpted supercar THREE.Group pivoted at bottom-center (y = 0 at ground).
 * Honors the sleek cobalt-blue & exotic supercar aesthetics in the reference screenshots.
 */
export function buildSupercarRig(
  primaryHex: number,
  accentHex: number,
  shadowTexture: THREE.Texture,
  options: {
    envMap?: THREE.Texture | null;
    isMobile?: boolean;
  },
): SupercarRig {
  const group = new THREE.Group();
  const envMap = options.envMap ?? null;

  // Glossy metallic automotive clearcoat paint (deep saturated basecoat + crisp clearcoat shine)
  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: primaryHex,
    metalness: 0.75,
    roughness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.52,
    envMap,
    envMapIntensity: 0.8,
  });

  const accentMaterial = new THREE.MeshPhysicalMaterial({
    color: accentHex,
    metalness: 0.75,
    roughness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    ior: 1.52,
    envMap,
    envMapIntensity: 0.8,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x111520,
    metalness: 0.3,
    roughness: 0.48,
    envMap,
    envMapIntensity: 0.85,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.98,
    roughness: 0.08,
    envMap,
    envMapIntensity: 2.0,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x07101f,
    metalness: 0.18,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 1.0,
    envMap,
    envMapIntensity: 2.2,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x16181e,
    metalness: 0.05,
    roughness: 0.88,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xdbe4ef,
    metalness: 0.94,
    roughness: 0.14,
    envMap,
    envMapIntensity: 1.9,
  });

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff1e2d,
    emissive: 0xff1122,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.1,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0xbae6fd,
    emissiveIntensity: 2.6,
    roughness: 0.15,
  });

  // Ground contact shadow plane (prevents floating appearance)
  const shadowGeo = new THREE.PlaneGeometry(2.55, 5.1);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.03;
  group.add(shadowMesh);

  // Car forward axis is -Z (Three.js convention: camera behind at +Z looking toward -Z)
  // 1. Sculpted Main Chassis Hull (ExtrudeGeometry side profile extruded across width)
  const bodyProfile = new THREE.Shape();
  // x = length along Z (rear +2.15 to front -2.25), y = height above ground
  bodyProfile.moveTo(-2.22, 0.26); // front nose tip
  bodyProfile.lineTo(-1.45, 0.62); // sloping sculpted hood
  bodyProfile.lineTo(-0.55, 0.72); // windshield cowl base
  bodyProfile.lineTo(1.25, 0.82);  // muscular rear haunch
  bodyProfile.lineTo(2.14, 0.76);  // rear deck tail
  bodyProfile.lineTo(2.18, 0.30);  // rear bumper
  bodyProfile.lineTo(-2.12, 0.22); // undertray
  bodyProfile.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyProfile, {
    depth: 1.76,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.085,
    bevelSegments: options.isMobile ? 2 : 4,
  });
  // Rotate so profile X maps to Z and extrusion depth maps to X, centered on X=0
  bodyGeo.translate(0, 0, -0.88);
  bodyGeo.rotateY(-Math.PI / 2);
  const mainBody = new THREE.Mesh(bodyGeo, paintMaterial);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  group.add(mainBody);

  // 2. Sculpted Front Racing Hood Stripe + Vent
  const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 1.48), accentMaterial);
  hoodStripe.position.set(0, 0.71, -1.32);
  hoodStripe.rotation.x = 0.12;
  group.add(hoodStripe);

  // Front aggressive carbon splitter & intake
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.12, 0.48), carbonMat);
  splitter.position.set(0, 0.22, -2.14);
  group.add(splitter);

  // Side aero skirts
  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 2.35), carbonMat);
    skirt.position.set(side * 1.0, 0.24, 0.02);
    group.add(skirt);

    // Sculpted rear wheel-arch haunch bulge
    const haunch = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 1.38), paintMaterial);
    haunch.position.set(side * 0.94, 0.58, 1.12);
    group.add(haunch);

    // Side air intake scoop
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.62), carbonMat);
    scoop.position.set(side * 0.99, 0.56, 0.56);
    group.add(scoop);

    // Wing mirrors
    const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.08), carbonMat);
    mirrorArm.position.set(side * 1.02, 0.84, -0.52);
    group.add(mirrorArm);

    const mirrorCap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.16), paintMaterial);
    mirrorCap.position.set(side * 1.12, 0.87, -0.50);
    group.add(mirrorCap);
  }

  // 3. Exterior Cabin Canopy 
  const exteriorCabinGroup = new THREE.Group();
  const cabinProfile = new THREE.Shape();
  cabinProfile.moveTo(-0.76, 0.70);
  cabinProfile.lineTo(-0.10, 1.18);
  cabinProfile.lineTo(0.84, 1.16);
  cabinProfile.lineTo(1.56, 0.78);
  cabinProfile.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinProfile, {
    depth: 1.24,
    bevelEnabled: true,
    bevelThickness: 0.13,
    bevelSize: 0.065,
    bevelSegments: options.isMobile ? 2 : 4,
  });
  cabinGeo.translate(0, 0, -0.62);
  cabinGeo.rotateY(-Math.PI / 2);
  const cabinMesh = new THREE.Mesh(cabinGeo, paintMaterial);
  cabinMesh.castShadow = true;
  exteriorCabinGroup.add(cabinMesh);

  // Tinted Windshield + Rear Fastback Glass
  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.04, 0.86), glassMat);
  frontGlass.position.set(0, 0.97, -0.44);
  frontGlass.rotation.x = 0.64;
  exteriorCabinGroup.add(frontGlass);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.04, 0.92), glassMat);
  rearGlass.position.set(0, 0.99, 1.16);
  rearGlass.rotation.x = -0.46;
  exteriorCabinGroup.add(rearGlass);

  const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.30, 1.12), glassMat);
  sideGlass.position.set(0, 0.95, 0.34);
  exteriorCabinGroup.add(sideGlass);

  group.add(exteriorCabinGroup);

  // 4. Elevated Carbon GT Rear Wing / Spoiler
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.06, 0.32), carbonMat);
  wingBlade.position.set(0, 1.08, 1.98);
  wingBlade.rotation.x = 0.14;
  wingBlade.castShadow = true;
  group.add(wingBlade);

  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.30, 0.20), carbonMat);
    strut.position.set(side * 0.64, 0.92, 1.96);
    group.add(strut);

    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.38), paintMaterial);
    endplate.position.set(side * 0.99, 1.08, 1.98);
    group.add(endplate);
  }

  // 5. Rear Diffuser + Quad Circular Glowing Taillights (iconic look from screenshots!)
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.26, 0.16), carbonMat);
  diffuser.position.set(0, 0.33, 2.22);
  group.add(diffuser);

  const tailPositions = [-0.78, -0.54, 0.54, 0.78];
  const tailGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.06, 16);
  tailGeo.rotateX(Math.PI / 2);
  for (const tx of tailPositions) {
    const lamp = new THREE.Mesh(tailGeo, taillightMat);
    lamp.position.set(tx, 0.58, 2.22);
    group.add(lamp);
  }

  // Dual sharp LED headlights
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.10, 0.12), headlightMat);
    head.position.set(side * 0.68, 0.46, -2.23);
    head.rotation.y = side * -0.18;
    group.add(head);
  }

  // 6. Twin Chrome Exhaust Pipes + Nitro Flame Cones
  const nitroFlames: THREE.Mesh[] = [];
  const exhaustGeo = new THREE.CylinderGeometry(0.075, 0.085, 0.26, 14);
  exhaustGeo.rotateX(Math.PI / 2);

  const flameGeo = new THREE.ConeGeometry(0.13, 1.25, 12);
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.62);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(side * 0.48, 0.30, 2.26);
    group.add(pipe);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(side * 0.48, 0.30, 2.34);
    flame.visible = false;
    group.add(flame);
    nitroFlames.push(flame);
  }

  // 7. Four Rotating 3D Wheels (Tire + 5-spoke metallic rim + red caliper)
  const wheels: THREE.Object3D[] = [];
  const frontSteerPivots: THREE.Group[] = [];
  const wheelCoords: [number, number, number, boolean][] = [
    [-0.96, 0.35, -1.32, true],
    [0.96, 0.35, -1.32, true],
    [-0.99, 0.37, 1.30, false],
    [0.99, 0.37, 1.30, false],
  ];

  const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.29, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const rimHubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.30, 14);
  rimHubGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.31, 0.38, 0.055);

  for (const [wx, wy, wz, isFront] of wheelCoords) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, wy, wz);

    const wheelSpinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    wheelSpinGroup.add(tire);

    const hub = new THREE.Mesh(rimHubGeo, rimMat);
    wheelSpinGroup.add(hub);

    // Cross spokes so wheel rotation is visibly crisp
    for (let s = 0; s < 3; s++) {
      const spoke = new THREE.Mesh(spokeGeo, carbonMat);
      spoke.rotation.x = (s * Math.PI) / 3;
      wheelSpinGroup.add(spoke);
    }

    pivot.add(wheelSpinGroup);
    group.add(pivot);
    wheels.push(wheelSpinGroup);
    if (isFront) {
      frontSteerPivots.push(pivot);
    }
  }

  return {
    group,
    exteriorCabinGroup,
    wheels,
    frontSteerPivots,
    taillightMat,
    nitroFlames,
    paintMaterial,
    accentMaterial,
  };
}
