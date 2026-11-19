import * as THREE from 'three';
import type { ProceduralTexturePack } from './textures';

export type ScenePresetId =
  | 'krishna_ghat'
  | 'ramayana_temple'
  | 'mahabharata_chariot'
  | 'horror_haveli';

export type LightingMoodId = 'twilight' | 'midnight' | 'golden_dawn';

export interface SceneDiorama {
  root: THREE.Group;
  animatedParts: {
    waterShaderUniforms: { uTime: { value: number } } | null;
    flames: THREE.Mesh[];
    floatingLotusOrDiyas: THREE.Group[];
    pendulumGroup: THREE.Group | null;
    bannerGroup: THREE.Group | null;
  };
  dispose: () => void;
}

function addContactShadow(
  parent: THREE.Object3D,
  tex: THREE.Texture,
  radius: number,
  y = 0.018
): void {
  const geo = new THREE.CircleGeometry(radius, 24);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(geo, mat);
  disc.position.y = y;
  parent.add(disc);
}

/** Composite 5-part glowing earthen Diya lamp (base, bowl, oil, flame, rim) */
function createCompositeDiya(
  brassMat: THREE.Material,
  terracottaMat: THREE.Material,
  flameMat: THREE.Material,
  scale = 1
): { group: THREE.Group; flame: THREE.Mesh } {
  const group = new THREE.Group();

  const points = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.24, 0.0),
    new THREE.Vector2(0.28, 0.06),
    new THREE.Vector2(0.14, 0.14),
    new THREE.Vector2(0.32, 0.24),
    new THREE.Vector2(0.26, 0.27),
    new THREE.Vector2(0.08, 0.17),
    new THREE.Vector2(0.0, 0.17),
  ];
  const bowlGeo = new THREE.LatheGeometry(points, 20);
  const bowl = new THREE.Mesh(bowlGeo, terracottaMat);
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  group.add(bowl);

  const rimGeo = new THREE.TorusGeometry(0.28, 0.024, 10, 20);
  rimGeo.rotateX(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, brassMat);
  rim.position.y = 0.25;
  group.add(rim);

  const oilGeo = new THREE.CylinderGeometry(0.19, 0.18, 0.03, 16);
  const oil = new THREE.Mesh(oilGeo, brassMat);
  oil.position.y = 0.18;
  group.add(oil);

  const flameGeo = new THREE.ConeGeometry(0.065, 0.22, 12);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(0.18, 0.34, 0);
  group.add(flame);

  group.scale.setScalar(scale);
  return { group, flame };
}

/** Composite 6-part sculpted temple pillar (plinth, base collar, shaft, band, capital, abacus) */
function createCarvedPillar(
  stoneMat: THREE.Material,
  brassMat: THREE.Material,
  height = 4.4
): THREE.Group {
  const pillar = new THREE.Group();

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.45, 0.92), stoneMat);
  plinth.position.y = 0.225;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  pillar.add(plinth);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.28, 16), brassMat);
  collar.position.y = 0.59;
  collar.castShadow = true;
  pillar.add(collar);

  const shaftH = height - 1.3;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.32, shaftH, 16), stoneMat);
  shaft.position.y = 0.73 + shaftH / 2;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  pillar.add(shaft);

  const midRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 10, 20), brassMat);
  midRing.rotation.x = Math.PI / 2;
  midRing.position.y = 0.73 + shaftH * 0.58;
  pillar.add(midRing);

  const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.28, 0.35, 16), stoneMat);
  capital.position.y = height - 0.38;
  capital.castShadow = true;
  pillar.add(capital);

  const abacus = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.22, 0.96), stoneMat);
  abacus.position.y = height - 0.11;
  abacus.castShadow = true;
  pillar.add(abacus);

  return pillar;
}

/** Composite 6-part organic tree (flared root base, curved trunk tube, secondary limb, 3 canopy tiers) */
function createSacredTree(barkMat: THREE.Material, leafMat: THREE.Material): THREE.Group {
  const tree = new THREE.Group();

  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.25, 1.4, -0.1),
    new THREE.Vector3(-0.1, 2.9, 0.15),
    new THREE.Vector3(0.15, 4.3, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunkCurve, 14, 0.32, 10, false);
  const trunk = new THREE.Mesh(trunkGeo, barkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const rootBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.68, 0.65, 10), barkMat);
  rootBase.position.y = 0.32;
  rootBase.castShadow = true;
  tree.add(rootBase);

  const branchCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.05, 2.5, 0.08),
    new THREE.Vector3(1.1, 3.3, 0.6),
    new THREE.Vector3(1.9, 3.9, 0.9),
  ]);
  const branch = new THREE.Mesh(new THREE.TubeGeometry(branchCurve, 8, 0.14, 8, false), barkMat);
  branch.castShadow = true;
  tree.add(branch);

  const crowns: [number, number, number, number][] = [
    [0.1, 4.7, 0.0, 2.1],
    [-1.1, 4.1, 0.7, 1.45],
    [1.6, 4.1, 0.7, 1.5],
  ];
  for (const [cx, cy, cz, r] of crowns) {
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
    canopy.scale.set(1.15, 0.78, 1.15);
    canopy.position.set(cx, cy, cz);
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    tree.add(canopy);
  }

  return tree;
}

export function buildSceneDiorama(
  preset: ScenePresetId,
  textures: ProceduralTexturePack,
  isSoftwareGl: boolean
): SceneDiorama {
  const root = new THREE.Group();
  const flames: THREE.Mesh[] = [];
  const floatingLotusOrDiyas: THREE.Group[] = [];
  let waterShaderUniforms: { uTime: { value: number } } | null = null;
  let pendulumGroup: THREE.Group | null = null;
  let bannerGroup: THREE.Group | null = null;

  // Shared materials calibrated for distinct roughness contrast (>= 0.25 delta between stone, brass, wood, cloth)
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stoneAlbedo,
    bumpMap: textures.stoneBump,
    bumpScale: 0.04,
    roughness: 0.86,
    metalness: 0.04,
  });

  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: preset === 'horror_haveli' ? 0x525b68 : 0x7a685b,
    map: textures.stoneAlbedo,
    bumpMap: textures.stoneBump,
    bumpScale: 0.05,
    roughness: 0.88,
    metalness: 0.05,
  });

  const mandalaFloorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.mandalaAlbedo,
    roughness: 0.74,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const polishedBrassMat = new THREE.MeshStandardMaterial({
    color: 0xe6ad38,
    roughness: 0.22,
    metalness: 0.92,
  });

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.woodAlbedo,
    roughness: 0.72,
    metalness: 0.04,
  });

  const crimsonClothMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const terracottaMat = new THREE.MeshStandardMaterial({
    color: 0xb4532a,
    roughness: 0.82,
    metalness: 0.05,
  });

  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffb703,
    emissive: 0xff7b00,
    emissiveIntensity: 2.2,
    roughness: 0.35,
    metalness: 0.0,
  });

  const foliageMat = new THREE.MeshStandardMaterial({
    color: preset === 'horror_haveli' ? 0x1e2c24 : 0x26593a,
    roughness: 0.84,
    metalness: 0.02,
  });

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x6b6763,
    roughness: 0.9,
    metalness: 0.04,
  });

  // Extended natural horizon ground disc (never a small floating square!)
  const terrainGeo = new THREE.CircleGeometry(75, 48);
  terrainGeo.rotateX(-Math.PI / 2);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: preset === 'horror_haveli' ? 0x1d232b : 0x4b4238,
    roughness: 0.94,
    metalness: 0.02,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.position.y = -0.02;
  terrain.receiveShadow = true;
  root.add(terrain);

  // Natural perimeter rocks instanced in outer ring (>24 instances with tint + scale variation)
  const rockGeo = new THREE.DodecahedronGeometry(0.85, 0);
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, 36);
  const dummy = new THREE.Object3D();
  const rockTint = new THREE.Color();
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2 + (i % 3) * 0.08;
    const dist = 16 + (i % 5) * 4.2;
    const s = 0.85 + (i % 4) * 0.22;
    dummy.position.set(Math.cos(angle) * dist, s * 0.25, Math.sin(angle) * dist);
    dummy.rotation.set(i * 0.4, i * 1.1, 0);
    dummy.scale.set(s * 1.3, s * 0.85, s * 1.1);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);
    rockTint.setHSL(0.08, 0.12, 0.34 + (i % 5) * 0.04);
    rockInst.setColorAt(i, rockTint);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  root.add(rockInst);

  if (preset === 'krishna_ghat') {
    // Stepped sacred ghat dais (disjoint Y offsets >= 0.02)
    const step1 = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.6, 0.36, 32), stoneMat);
    step1.position.y = 0.18;
    step1.receiveShadow = true;
    root.add(step1);

    const step2 = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.5, 0.34, 32), stoneMat);
    step2.position.y = 0.53;
    step2.receiveShadow = true;
    root.add(step2);

    const inlay = new THREE.Mesh(new THREE.CircleGeometry(4.4, 32), mandalaFloorMat);
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.y = 0.725;
    inlay.receiveShadow = true;
    root.add(inlay);

    // Composite hero pedestal & golden bansuri flute (6-part THREE.Group)
    const bansuriGroup = new THREE.Group();
    bansuriGroup.position.set(0, 0.72, 0);
    addContactShadow(bansuriGroup, textures.contactShadowTex, 1.8, 0.02);

    const lotusBase = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 0.45, 20), darkStoneMat);
    lotusBase.position.y = 0.225;
    lotusBase.castShadow = true;
    bansuriGroup.add(lotusBase);

    const cradleLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.32), woodMat);
    cradleLeft.position.set(-0.95, 0.78, 0);
    cradleLeft.castShadow = true;
    bansuriGroup.add(cradleLeft);

    const cradleRight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.32), woodMat);
    cradleRight.position.set(0.95, 0.78, 0);
    cradleRight.castShadow = true;
    bansuriGroup.add(cradleRight);

    const fluteBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.125, 3.3, 20), woodMat);
    fluteBody.rotation.z = Math.PI / 2 - 0.14;
    fluteBody.position.set(0, 1.2, 0);
    fluteBody.castShadow = true;
    bansuriGroup.add(fluteBody);

    for (let b = -2; b <= 2; b++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.022, 10, 20), polishedBrassMat);
      band.rotation.y = Math.PI / 2;
      band.rotation.x = -0.14;
      band.position.set(b * 0.55, 1.2 + b * 0.075, 0);
      bansuriGroup.add(band);
    }

    // Peacock feather crest (extruded bevel crest)
    const featherShape = new THREE.Shape();
    featherShape.moveTo(0, 0);
    featherShape.quadraticCurveTo(0.32, 0.45, 0, 0.95);
    featherShape.quadraticCurveTo(-0.32, 0.45, 0, 0);
    const featherGeo = new THREE.ExtrudeGeometry(featherShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    });
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.3,
      metalness: 0.35,
    });
    const feather = new THREE.Mesh(featherGeo, featherMat);
    feather.position.set(1.25, 1.35, 0.02);
    feather.rotation.z = -0.45;
    bansuriGroup.add(feather);
    root.add(bansuriGroup);

    // Sacred Kadamba tree flanking ghat
    const tree = createSacredTree(woodMat, foliageMat);
    tree.position.set(-4.1, 0.35, -3.2);
    addContactShadow(tree, textures.contactShadowTex, 2.2, 0.02);
    root.add(tree);

    // Twin carved pillars
    for (const px of [-3.4, 3.4]) {
      const p = createCarvedPillar(stoneMat, polishedBrassMat, 4.2);
      p.position.set(px, 0.72, -3.5);
      root.add(p);
    }

    // Floating glowing Yamuna water around outer rim using onBeforeCompile wave displacement
    const waterUniforms = { uTime: { value: 0 } };
    waterShaderUniforms = waterUniforms;
    const waterGeo = new THREE.RingGeometry(7.5, 28, 48, 8);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f3b5c,
      roughness: 0.14,
      metalness: 0.18,
      clearcoat: isSoftwareGl ? 0.2 : 0.9,
      clearcoatRoughness: 0.12,
    });
    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waterUniforms.uTime;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.y += sin(transformed.x * 0.45 + uTime * 1.4) * 0.08 + cos(transformed.z * 0.4 - uTime * 1.1) * 0.06;`
      );
    };
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = 0.06;
    water.receiveShadow = true;
    root.add(water);

    // Floating river diyas
    for (let d = 0; d < 5; d++) {
      const ang = -0.5 + d * 0.55;
      const rad = 9.2 + (d % 2) * 1.8;
      const { group, flame } = createCompositeDiya(polishedBrassMat, terracottaMat, flameMat, 1.15);
      group.position.set(Math.cos(ang) * rad, 0.08, Math.sin(ang) * rad);
      root.add(group);
      flames.push(flame);
      floatingLotusOrDiyas.push(group);
    }
  } else if (preset === 'ramayana_temple') {
    // Stepped courtyard platform
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.5, 10.4), stoneMat);
    plinth.position.y = 0.25;
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    root.add(plinth);

    const floorInlay = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), mandalaFloorMat);
    floorInlay.rotation.x = -Math.PI / 2;
    floorInlay.position.y = 0.525;
    floorInlay.receiveShadow = true;
    root.add(floorInlay);

    // 4 carved mandapam pillars + cornice beams + stepped shikhara canopy + brass kalash
    const corners: [number, number][] = [
      [-3.5, -3.5],
      [3.5, -3.5],
      [-3.5, 3.5],
      [3.5, 3.5],
    ];
    for (const [cx, cz] of corners) {
      const pillar = createCarvedPillar(stoneMat, polishedBrassMat, 4.6);
      pillar.position.set(cx, 0.5, cz);
      root.add(pillar);
    }

    const roofTier1 = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 8.6), darkStoneMat);
    roofTier1.position.y = 5.35;
    roofTier1.castShadow = true;
    root.add(roofTier1);

    const roofTier2 = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 4.2, 1.9, 4), stoneMat);
    roofTier2.rotation.y = Math.PI / 4;
    roofTier2.position.y = 6.55;
    roofTier2.castShadow = true;
    root.add(roofTier2);

    // Lathe kalash spire finial
    const kalashPts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.45, 0.1),
      new THREE.Vector2(0.55, 0.45),
      new THREE.Vector2(0.22, 0.85),
      new THREE.Vector2(0.32, 1.05),
      new THREE.Vector2(0.06, 1.55),
      new THREE.Vector2(0, 1.65),
    ];
    const kalash = new THREE.Mesh(new THREE.LatheGeometry(kalashPts, 20), polishedBrassMat);
    kalash.position.y = 7.48;
    kalash.castShadow = true;
    root.add(kalash);

    // Hanging temple ghanta bell in center
    const bellGroup = new THREE.Group();
    bellGroup.position.set(0, 5.1, 0);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), polishedBrassMat);
    chain.position.y = -0.6;
    bellGroup.add(chain);

    const bellPts = [
      new THREE.Vector2(0.02, 0),
      new THREE.Vector2(0.25, -0.15),
      new THREE.Vector2(0.34, -0.55),
      new THREE.Vector2(0.54, -0.75),
      new THREE.Vector2(0.46, -0.78),
      new THREE.Vector2(0.28, -0.55),
      new THREE.Vector2(0.02, -0.15),
    ];
    const bellBody = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 20), polishedBrassMat);
    bellBody.position.y = -1.2;
    bellBody.castShadow = true;
    bellGroup.add(bellBody);
    pendulumGroup = bellGroup;
    root.add(bellGroup);

    // Four ceremonial corner diyas
    for (const [dx, dz] of [
      [-1.8, 1.8],
      [1.8, 1.8],
      [-1.8, -1.8],
      [1.8, -1.8],
    ]) {
      const { group, flame } = createCompositeDiya(polishedBrassMat, terracottaMat, flameMat, 1.4);
      group.position.set(dx, 0.52, dz);
      addContactShadow(group, textures.contactShadowTex, 0.45, 0.015);
      root.add(group);
      flames.push(flame);
    }
  } else if (preset === 'mahabharata_chariot') {
    const stoneGround = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7.2, 0.35, 32), darkStoneMat);
    stoneGround.position.y = 0.175;
    stoneGround.receiveShadow = true;
    root.add(stoneGround);

    // Composite 10-part Dharma Rath War Chariot
    const chariot = new THREE.Group();
    chariot.position.set(0, 0.35, 0);
    addContactShadow(chariot, textures.contactShadowTex, 3.1, 0.02);

    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.4, 12), polishedBrassMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = 1.25;
    axle.castShadow = true;
    chariot.add(axle);

    // Twin 8-spoked golden chariot wheels
    for (const side of [-2.05, 2.05]) {
      const wheel = new THREE.Group();
      wheel.position.set(side, 1.25, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.12, 12, 28), polishedBrassMat);
      rim.rotation.y = Math.PI / 2;
      rim.castShadow = true;
      wheel.add(rim);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 14), woodMat);
      hub.rotation.z = Math.PI / 2;
      wheel.add(hub);

      const spokeGeo = new THREE.CylinderGeometry(0.045, 0.045, 2.25, 8);
      for (let s = 0; s < 4; s++) {
        const spoke = new THREE.Mesh(spokeGeo, woodMat);
        spoke.rotation.x = (s * Math.PI) / 4;
        wheel.add(spoke);
      }
      chariot.add(wheel);
    }

    // Carved deck & armored crescent prow
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.32, 3.8), woodMat);
    deck.position.set(0, 1.38, 0.2);
    deck.castShadow = true;
    chariot.add(deck);

    const prow = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.6, 1.35, 20, 1, false, -Math.PI / 2, Math.PI),
      polishedBrassMat
    );
    prow.position.set(0, 2.15, 1.45);
    prow.castShadow = true;
    chariot.add(prow);

    // Canopy pillars & dome
    for (const [px, pz] of [
      [-1.3, -1.2],
      [1.3, -1.2],
      [-1.3, 1.0],
      [1.3, 1.0],
    ]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.6, 12), polishedBrassMat);
      post.position.set(px, 2.8, pz);
      post.castShadow = true;
      chariot.add(post);
    }
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.15, 4), crimsonClothMat);
    canopy.rotation.y = Math.PI / 4;
    canopy.position.set(0, 4.65, -0.1);
    canopy.castShadow = true;
    chariot.add(canopy);

    // Tall Dharma Dhwaja mast & fluttering pennant
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.9, 10), polishedBrassMat);
    mast.position.set(0, 6.2, -0.1);
    chariot.add(mast);

    const bannerPivot = new THREE.Group();
    bannerPivot.position.set(0, 7.2, -0.1);
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0);
    flagShape.lineTo(2.4, -0.35);
    flagShape.lineTo(1.85, -0.58);
    flagShape.lineTo(2.3, -0.82);
    flagShape.lineTo(0, -1.1);
    flagShape.closePath();
    const flagGeo = new THREE.ExtrudeGeometry(flagShape, { depth: 0.03, bevelEnabled: false });
    const flag = new THREE.Mesh(flagGeo, crimsonClothMat);
    bannerPivot.add(flag);
    bannerGroup = bannerPivot;
    chariot.add(bannerPivot);

    root.add(chariot);
  } else {
    // Bhootiya Haveli Courtyard (solid side wall segments + jambs framing archway + hanging lantern)
    const courtyard = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.6, 0.3, 32), darkStoneMat);
    courtyard.position.y = 0.15;
    courtyard.receiveShadow = true;
    root.add(courtyard);

    // Left & right flanking courtyard walls + jamb pillars + lintel arch (never freestanding door in void!)
    const haveliWall = new THREE.Group();
    haveliWall.position.set(0, 0.3, -2.4);

    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.5, 0.8), darkStoneMat);
    wallLeft.position.set(-3.3, 2.25, 0);
    wallLeft.castShadow = true;
    wallLeft.receiveShadow = true;
    haveliWall.add(wallLeft);

    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.5, 0.8), darkStoneMat);
    wallRight.position.set(3.3, 2.25, 0);
    wallRight.castShadow = true;
    wallRight.receiveShadow = true;
    haveliWall.add(wallRight);

    const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.1, 1.02), stoneMat);
    jambL.position.set(-1.55, 2.05, 0);
    jambL.castShadow = true;
    haveliWall.add(jambL);

    const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.1, 1.02), stoneMat);
    jambR.position.set(1.55, 2.05, 0);
    jambR.castShadow = true;
    haveliWall.add(jambR);

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 1.12), darkStoneMat);
    lintel.position.set(0, 4.55, 0);
    lintel.castShadow = true;
    haveliWall.add(lintel);

    const crestDome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), stoneMat);
    crestDome.position.set(0, 5.0, 0);
    crestDome.castShadow = true;
    haveliWall.add(crestDome);

    root.add(haveliWall);

    // Hanging wrought-iron & glowing brass lantern inside archway
    const lanternRig = new THREE.Group();
    lanternRig.position.set(0, 4.1, 0.25);

    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 8), darkStoneMat);
    chain.position.y = -0.52;
    lanternRig.add(chain);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.28, 6), polishedBrassMat);
    cap.position.y = -1.12;
    lanternRig.add(cap);

    const glassCore = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.5, 6), flameMat);
    glassCore.position.y = -1.48;
    lanternRig.add(glassCore);
    flames.push(glassCore);

    const basePan = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.16, 0.14, 6), polishedBrassMat);
    basePan.position.y = -1.78;
    lanternRig.add(basePan);

    pendulumGroup = lanternRig;
    root.add(lanternRig);

    // Twisted deadwood tree flanking left-back courtyard edge (clear sightline to archway + lantern)
    const eerieTree = createSacredTree(woodMat, foliageMat);
    eerieTree.position.set(-5.1, 0.25, -1.2);
    addContactShadow(eerieTree, textures.contactShadowTex, 2.0, 0.02);
    root.add(eerieTree);
  }

  return {
    root,
    animatedParts: {
      waterShaderUniforms,
      flames,
      floatingLotusOrDiyas,
      pendulumGroup,
      bannerGroup,
    },
    dispose: () => {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    },
  };
}
