import * as THREE from 'three';

export interface ProceduralTexturePack {
  stoneAlbedo: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  mandalaAlbedo: THREE.CanvasTexture;
  contactShadowTex: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureTexture(
  tex: THREE.CanvasTexture,
  maxAnisotropy: number,
  isColor: boolean,
  repeat = 1
): THREE.CanvasTexture {
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = Math.max(1, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTexturePack {
  // 1. Stone / temple courtyard masonry albedo + bump
  const [stoneCanvas, sCtx] = makeCanvas(512, 512);
  sCtx.fillStyle = '#a89582';
  sCtx.fillRect(0, 0, 512, 512);

  const [bumpCanvas, bCtx] = makeCanvas(512, 512);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 512, 512);

  const rows = 8;
  const cols = 4;
  const cellW = 512 / cols;
  const cellH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cellW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + offset;
      const y = r * cellH;
      const shade = 148 + ((r * 19 + c * 37) % 34);
      sCtx.fillStyle = `rgb(${shade + 14}, ${shade + 2}, ${shade - 12})`;
      sCtx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

      sCtx.strokeStyle = 'rgba(54, 42, 34, 0.45)';
      sCtx.lineWidth = 3;
      sCtx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);

      bCtx.fillStyle = `rgb(${shade + 12}, ${shade + 12}, ${shade + 12})`;
      bCtx.fillRect(x + 3, y + 3, cellW - 6, cellH - 6);
      bCtx.strokeStyle = '#2a2a2a';
      bCtx.lineWidth = 4;
      bCtx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
    }
  }

  for (let i = 0; i < 900; i++) {
    const gx = (i * 9301 + 49297) % 512;
    const gy = (i * 49297 + 233) % 512;
    const alpha = 0.06 + (i % 5) * 0.02;
    sCtx.fillStyle = i % 2 === 0 ? `rgba(255,244,230,${alpha})` : `rgba(40,30,20,${alpha})`;
    sCtx.fillRect(gx, gy, 3, 2);
    bCtx.fillStyle = i % 2 === 0 ? 'rgba(210,210,210,0.12)' : 'rgba(60,60,60,0.12)';
    bCtx.fillRect(gx, gy, 3, 2);
  }

  const stoneAlbedo = configureTexture(new THREE.CanvasTexture(stoneCanvas), maxAnisotropy, true, 4);
  const stoneBump = configureTexture(new THREE.CanvasTexture(bumpCanvas), maxAnisotropy, false, 4);

  // 2. Sacred rosewood / teak grain
  const [woodCanvas, wCtx] = makeCanvas(256, 256);
  wCtx.fillStyle = '#5c341d';
  wCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 3) {
    const tone = (Math.sin(y * 0.14) + 1) * 14;
    wCtx.fillStyle = `rgba(${38 + tone}, ${18 + tone * 0.5}, 10, 0.35)`;
    wCtx.fillRect(0, y, 256, 2);
  }
  const woodAlbedo = configureTexture(new THREE.CanvasTexture(woodCanvas), maxAnisotropy, true, 1);

  // 3. Temple courtyard lotus mandala inlay
  const [mandalaCanvas, mCtx] = makeCanvas(512, 512);
  mCtx.fillStyle = '#8b735d';
  mCtx.fillRect(0, 0, 512, 512);
  mCtx.translate(256, 256);
  for (let ring = 220; ring >= 60; ring -= 40) {
    mCtx.beginPath();
    mCtx.arc(0, 0, ring, 0, Math.PI * 2);
    mCtx.strokeStyle = ring === 180 ? '#d97706' : '#f3e5d0';
    mCtx.lineWidth = ring === 180 ? 8 : 4;
    mCtx.stroke();
  }
  const petals = 16;
  for (let p = 0; p < petals; p++) {
    mCtx.save();
    mCtx.rotate((p * Math.PI * 2) / petals);
    mCtx.beginPath();
    mCtx.moveTo(0, -68);
    mCtx.quadraticCurveTo(22, -125, 0, -165);
    mCtx.quadraticCurveTo(-22, -125, 0, -68);
    mCtx.fillStyle = p % 2 === 0 ? 'rgba(217, 119, 6, 0.55)' : 'rgba(255, 247, 237, 0.45)';
    mCtx.fill();
    mCtx.restore();
  }
  const mandalaAlbedo = configureTexture(
    new THREE.CanvasTexture(mandalaCanvas),
    maxAnisotropy,
    true,
    1
  );

  // 4. Radial contact shadow disc texture
  const [shadowCanvas, shCtx] = makeCanvas(256, 256);
  const grad = shCtx.createRadialGradient(128, 128, 14, 128, 128, 122);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 256, 256);
  const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
  contactShadowTex.needsUpdate = true;

  return {
    stoneAlbedo,
    stoneBump,
    woodAlbedo,
    mandalaAlbedo,
    contactShadowTex,
    dispose: () => {
      stoneAlbedo.dispose();
      stoneBump.dispose();
      woodAlbedo.dispose();
      mandalaAlbedo.dispose();
      contactShadowTex.dispose();
    },
  };
}
