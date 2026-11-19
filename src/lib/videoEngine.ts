import type { StudioAudioMixer } from './audioEngine';
import {
  calculateTotalDuration,
  getActiveCaptionDisplay,
  getActiveSceneAtTime,
  getAnimeMotionState,
  getEffectivePlaybackDurationSec,
  getFormatSpec,
  getOutroCtaCopy,
  getSceneTransitionInfo,
  getTopicConfig,
  resolveSceneTransitionMode,
  splitSubtitleIntoLines,
} from './studioLogic';
import type { StoryProject, StoryScene, StoryTopic } from './types';

const imageCache = new Map<string, HTMLImageElement>();

export function getCachedSceneImage(src?: string): HTMLImageElement | null {
  if (!src) return null;
  const existing = imageCache.get(src);
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return existing;
  }
  return null;
}

export function loadSceneImage(
  src: string,
  fallbackUrl?: string
): Promise<HTMLImageElement | null> {
  if (!src) {
    return fallbackUrl ? loadSceneImage(fallbackUrl) : Promise.resolve(null);
  }
  const cached = getCachedSceneImage(src);
  if (cached) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch {
        // decode optional
      }
      if (img.naturalWidth > 0) {
        imageCache.set(src, img);
        resolve(img);
      } else if (fallbackUrl && fallbackUrl !== src) {
        resolve(await loadSceneImage(fallbackUrl));
      } else {
        resolve(null);
      }
    };
    img.onerror = () => {
      if (fallbackUrl && fallbackUrl !== src) {
        void loadSceneImage(fallbackUrl).then(resolve);
      } else {
        resolve(null);
      }
    };
    img.src = src;
  });
}

export async function loadStorySceneImages(
  scenes: StoryScene[],
  fallbackUrl: string
): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  const fallbackImg = await loadSceneImage(fallbackUrl);

  await Promise.all(
    scenes.map(async (scene) => {
      const targetUrl = scene.imageUrl || fallbackUrl;
      const img = await loadSceneImage(targetUrl, fallbackUrl);
      if (img && img.naturalWidth > 0) {
        map.set(scene.id, img);
      } else if (fallbackImg && fallbackImg.naturalWidth > 0) {
        map.set(scene.id, fallbackImg);
      }
    })
  );

  return map;
}

function drawImageWithAnimeMotion(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  img: HTMLImageElement,
  scene: StoryScene,
  easedProgress: number,
  cutImpact: number,
  timeSec: number,
  alpha: number,
  isAnime: boolean,
  isHorror: boolean,
  translateOffsetX = 0,
  translateOffsetY = 0
): void {
  if (!img || img.naturalWidth <= 0 || alpha <= 0) return;

  const isHookShot = scene.shotType === 'character_hook' || scene.shotType === 'climax_closeup';
  const motion = scene.cameraMotion ?? 'zoom-in';

  let scale = isHookShot ? 1.11 : 1.045;
  let panX = 0;
  let panY = isHookShot ? -height * 0.016 : 0;
  let rotateRad = 0;

  if (motion === 'zoom-in') {
    scale = (isHookShot ? 1.07 : 1.02) + easedProgress * 0.15;
  } else if (motion === 'zoom-out') {
    scale = (isHookShot ? 1.22 : 1.16) - easedProgress * 0.13;
  } else if (motion === 'pan-left') {
    scale = 1.15;
    panX = (0.5 - easedProgress) * width * 0.075;
  } else if (motion === 'pan-right') {
    scale = 1.15;
    panX = (easedProgress - 0.5) * width * 0.075;
  }

  // Dramatic anime beat punch, subtle Dutch tilt on intense climax/horror beats & breathing camera float
  if (isAnime) {
    scale += cutImpact * 0.065;
    panY += Math.sin(timeSec * 1.45) * height * 0.0045;
    panX += Math.cos(timeSec * 0.95) * width * 0.003;
    if (scene.shotType === 'climax_closeup' || isHorror) {
      rotateRad = Math.sin(easedProgress * Math.PI) * (motion === 'pan-left' ? -0.014 : 0.014);
      scale += 0.025;
    }
    if (scene.sfxCue === 'thunder_rumble' && cutImpact > 0.08) {
      panX += Math.sin(timeSec * 44) * width * 0.011 * cutImpact;
      panY += Math.cos(timeSec * 38) * height * 0.009 * cutImpact;
    }
  }

  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = width / height;

  let drawW = width;
  let drawH = height;
  if (imgRatio > canvasRatio) {
    drawH = height;
    drawW = height * imgRatio;
  } else {
    drawW = width;
    drawH = width / imgRatio;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(width / 2 + panX + translateOffsetX, height / 2 + panY + translateOffsetY);
  if (rotateRad !== 0) {
    ctx.rotate(rotateRad);
  }
  ctx.scale(scale, scale);

  // Preview contrast/saturation punch (skip slow CPU filter pass on 1080p export for silky 30fps encoding)
  if (isAnime && 'filter' in ctx && width <= 800) {
    ctx.filter = 'contrast(1.08) saturate(1.18)';
  }
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawCinematicColorGrade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  topic: StoryTopic
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const grade = ctx.createLinearGradient(0, 0, width, height);
  if (topic === 'horror') {
    grade.addColorStop(0, 'rgba(14, 116, 144, 0.24)');
    grade.addColorStop(0.55, 'rgba(30, 27, 75, 0.14)');
    grade.addColorStop(1, 'rgba(127, 29, 29, 0.22)');
  } else if (topic === 'mahabharata') {
    grade.addColorStop(0, 'rgba(245, 158, 11, 0.2)');
    grade.addColorStop(0.6, 'rgba(153, 27, 27, 0.14)');
    grade.addColorStop(1, 'rgba(15, 23, 42, 0.22)');
  } else if (topic === 'hindu_gods') {
    grade.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
    grade.addColorStop(0.5, 'rgba(250, 204, 21, 0.14)');
    grade.addColorStop(1, 'rgba(15, 23, 42, 0.2)');
  } else {
    // Krishna & Ramayana golden warmth
    grade.addColorStop(0, 'rgba(251, 191, 36, 0.18)');
    grade.addColorStop(0.55, 'rgba(234, 88, 12, 0.1)');
    grade.addColorStop(1, 'rgba(30, 58, 138, 0.18)');
  }
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawAnamorphicTransitionStreak(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  crossfadeAlpha: number,
  topic: StoryTopic
): void {
  if (crossfadeAlpha <= 0.04) return;
  const intensity = Math.sin(crossfadeAlpha * Math.PI);
  const sweepX = width * crossfadeAlpha;
  const isHorror = topic === 'horror';

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Soft full-frame warm flash
  ctx.fillStyle = isHorror
    ? `rgba(14, 165, 233, ${intensity * 0.16})`
    : `rgba(254, 240, 138, ${intensity * 0.24})`;
  ctx.fillRect(0, 0, width, height);

  // Diagonal light-whip flare streak sweeping across cut boundary
  const streak = ctx.createLinearGradient(sweepX - width * 0.25, 0, sweepX + width * 0.25, height);
  streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
  streak.addColorStop(
    0.5,
    isHorror ? `rgba(125, 211, 252, ${intensity * 0.34})` : `rgba(253, 224, 71, ${intensity * 0.38})`
  );
  streak.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

function drawAnimeGodRays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  topic: StoryTopic,
  timeSec: number
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  if (topic === 'horror') {
    // Eerie cyan moonlight drift
    const moonX = width * (0.28 + 0.12 * Math.sin(timeSec * 0.25));
    const grad = ctx.createRadialGradient(moonX, height * 0.12, 0, moonX, height * 0.2, width * 0.8);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
    grad.addColorStop(0.5, 'rgba(14, 116, 144, 0.08)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return;
  }

  const rayOriginX = width * (topic === 'mahabharata' ? 0.82 : 0.72);
  const rayOriginY = -height * 0.08;
  const shimmer = 0.09 + 0.035 * Math.sin(timeSec * 1.15);

  for (let r = 0; r < 3; r++) {
    const angle = 0.42 + r * 0.21 + Math.sin(timeSec * 0.38 + r) * 0.035;
    ctx.save();
    ctx.translate(rayOriginX, rayOriginY);
    ctx.rotate(angle);
    const beamGrad = ctx.createLinearGradient(0, 0, 0, height * 1.25);
    beamGrad.addColorStop(
      0,
      topic === 'hindu_gods'
        ? `rgba(196, 181, 253, ${shimmer})`
        : `rgba(254, 240, 138, ${shimmer})`
    );
    beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(-width * 0.09, 0, width * 0.18, height * 1.3);
    ctx.restore();
  }
  ctx.restore();
}

function drawAnimeSpeedlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  timeSec: number,
  isHorror: boolean
): void {
  if (intensity <= 0.02) return;
  const cx = width * 0.5;
  const cy = height * 0.46;
  const maxR = Math.hypot(width, height) * 0.64;
  const innerR = Math.min(width, height) * 0.37;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const count = 32;
  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * Math.PI * 2;
    const jitter = Math.sin(timeSec * 13 + i * 3.1) * 0.02;
    const angle = baseAngle + jitter;
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(timeSec * 8 + i * 1.7));
    const startR = innerR + (i % 3) * (width * 0.05);

    ctx.strokeStyle = isHorror
      ? `rgba(186, 230, 253, ${0.16 * intensity * pulse})`
      : `rgba(254, 243, 199, ${0.2 * intensity * pulse})`;
    ctx.lineWidth = Math.max(1.2, width * (i % 4 === 0 ? 0.0042 : 0.0022));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR);
    ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAtmosphericBokehParticles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  particleType: 'embers' | 'fog' | 'fireflies' | 'starlight',
  timeSec: number
): void {
  ctx.save();
  if (particleType !== 'fog') {
    ctx.globalCompositeOperation = 'screen';
  }

  // Layer 1: distant soft bokeh orbs (adds cinematic depth behind main focal subject)
  const bgCount = particleType === 'fog' ? 10 : 8;
  for (let i = 0; i < bgCount; i++) {
    const seed = (i * 7919 + 31337) % 233280;
    const driftSpeed = particleType === 'fog' ? 0.015 : 0.018 + (i % 2) * 0.008;
    const sway = Math.sin(timeSec * 0.8 + i * 2.1) * 0.03;
    const normX = ((seed / 233280 + sway + (particleType === 'fog' ? timeSec * driftSpeed : 0)) % 1 + 1) % 1;
    const normY =
      particleType === 'fog'
        ? (((seed * 3) % 233280) / 233280) * 0.55 + 0.36
        : (1 - (((seed * 5) % 233280) / 233280 + timeSec * driftSpeed) % 1 + 1) % 1;

    const px = normX * width;
    const py = normY * height;
    const r = particleType === 'fog' ? width * (0.15 + (i % 4) * 0.04) : width * (0.045 + (i % 3) * 0.018);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r);

    if (particleType === 'fog') {
      grad.addColorStop(0, 'rgba(148, 163, 184, 0.11)');
      grad.addColorStop(1, 'rgba(148, 163, 184, 0)');
    } else {
      const tint =
        particleType === 'starlight'
          ? 'rgba(186, 230, 253, 0.12)'
          : particleType === 'embers'
            ? 'rgba(251, 146, 60, 0.14)'
            : 'rgba(253, 224, 71, 0.13)';
      grad.addColorStop(0, tint);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Layer 2: crisp foreground embers / fireflies / starlight sparkles
  if (particleType !== 'fog') {
    const fgCount = 18;
    for (let i = 0; i < fgCount; i++) {
      const seed = (i * 9301 + 49297) % 233280;
      const driftSpeed = 0.036 + (i % 3) * 0.014;
      const sway = Math.sin(timeSec * 1.2 + i * 1.9) * 0.025;
      const normX = ((seed / 233280 + sway) % 1 + 1) % 1;
      const normY = (1 - (((seed * 7) % 233280) / 233280 + timeSec * driftSpeed) % 1 + 1) % 1;
      const px = normX * width;
      const py = normY * height;
      const flicker = 0.55 + 0.45 * Math.sin(timeSec * 3.4 + i * 2.3);
      const r = width * (0.007 + (i % 4) * 0.0035);
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 2.4);
      const coreColor =
        particleType === 'starlight'
          ? `rgba(186, 230, 253, ${0.82 * flicker})`
          : particleType === 'embers'
            ? `rgba(251, 146, 60, ${0.9 * flicker})`
            : `rgba(253, 224, 71, ${0.85 * flicker})`;
      grad.addColorStop(0, coreColor);
      grad.addColorStop(0.4, coreColor.replace(/[\d.]+\)$/, `${0.35 * flicker})`));
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawEpisodePartWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  partNumber?: number,
  totalParts?: number
): void {
  if (!totalParts || totalParts <= 1) return;
  const part = partNumber ?? 1;
  const isVertical = height > width;
  const fontSize = Math.round(isVertical ? width * 0.03 : height * 0.034);

  ctx.save();
  ctx.font = `700 ${fontSize}px "Noto Sans Devanagari", "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  const label = `भाग ${part}/${totalParts}`;
  const x = width * 0.94;
  const y = height * 0.025;
  ctx.lineWidth = Math.max(2.5, Math.round(fontSize * 0.22));
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
  ctx.strokeText(label, x, y);
  ctx.fillStyle = '#FDE047';
  ctx.fillText(label, x, y);
  ctx.restore();
}

function drawAnimeHookBanner(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hookText: string,
  hookPop: number,
  isHorror: boolean
): void {
  if (hookPop <= 0.01 || !hookText.trim()) return;
  const isVertical = height > width;
  const lines = splitSubtitleIntoLines(hookText, isVertical ? 22 : 34).slice(0, 2);
  if (lines.length === 0) return;

  const fontSize = Math.round(isVertical ? width * 0.064 : height * 0.07);
  const lineH = Math.round(fontSize * 1.24);
  const centerY = isVertical ? height * 0.145 : height * 0.15;

  const scale = 0.88 + 0.12 * Math.sin((hookPop * Math.PI) / 2);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, hookPop));
  ctx.translate(width / 2, centerY);
  ctx.scale(scale, scale);

  ctx.font = `800 ${fontSize}px "Noto Sans Devanagari", "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const startY = -((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    ctx.shadowColor = isHorror ? 'rgba(220, 38, 38, 0.5)' : 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = Math.round(width * 0.028);
    ctx.shadowOffsetY = Math.round(height * 0.004);
    ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.24));
    ctx.strokeStyle = 'rgba(9, 9, 11, 0.95)';
    ctx.strokeText(line, 0, y);

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = isHorror ? '#FCA5A5' : i === 0 ? '#FDE047' : '#FFFFFF';
    ctx.fillText(line, 0, y);
  });

  // Glowing underline accent bar
  const barW = Math.min(width * 0.44, fontSize * 6.5) * hookPop;
  const barY = startY + lines.length * lineH - lineH * 0.35;
  ctx.fillStyle = isHorror ? '#EF4444' : '#F97316';
  ctx.beginPath();
  ctx.roundRect(-barW / 2, barY, barW, Math.max(3, Math.round(width * 0.006)), 4);
  ctx.fill();

  ctx.restore();
}

function drawKaraokeReelsCaptions(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  localProgress: number,
  topic: StoryTopic,
  outroAlpha: number
): void {
  if (outroAlpha > 0.72) return;
  const display = getActiveCaptionDisplay(text, localProgress, height > width ? 4 : 6);
  if (!display) return;

  const isVertical = height > width;
  const fontSize = Math.round(isVertical ? width * 0.056 : height * 0.062);
  const spaceW = fontSize * 0.34;
  const captionY = isVertical ? height * 0.79 : height * 0.83;
  const maxWidth = width * 0.88;

  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - outroAlpha * 1.35);
  ctx.font = `800 ${fontSize}px "Noto Sans Devanagari", "Plus Jakarta Sans", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const widths = display.words.map((w) => ctx.measureText(w).width);
  const rows: { words: { text: string; isActive: boolean; w: number }[]; totalW: number }[] = [];
  let currRow: { text: string; isActive: boolean; w: number }[] = [];
  let currW = 0;

  display.words.forEach((word, idx) => {
    const w = widths[idx];
    const nextW = currRow.length === 0 ? w : currW + spaceW + w;
    if (currRow.length > 0 && nextW > maxWidth) {
      rows.push({ words: currRow, totalW: currW });
      currRow = [{ text: word, isActive: idx === display.activeWordIndex, w }];
      currW = w;
    } else {
      currRow.push({ text: word, isActive: idx === display.activeWordIndex, w });
      currW = nextW;
    }
  });
  if (currRow.length > 0) {
    rows.push({ words: currRow, totalW: currW });
  }

  const lineH = Math.round(fontSize * 1.32);
  const startY = captionY - ((rows.length - 1) * lineH) / 2;
  const activeFill =
    topic === 'horror' ? '#38BDF8' : topic === 'mahabharata' ? '#FB923C' : '#FACC15';

  // Soft radial shadow glow behind captions so Hindi text pops crisply over sunlit scenes (without hard box/pills)
  const glowR = Math.max(width * 0.45, lineH * rows.length);
  const backdropGlow = ctx.createRadialGradient(
    width / 2,
    captionY,
    fontSize * 0.5,
    width / 2,
    captionY,
    glowR
  );
  backdropGlow.addColorStop(0, 'rgba(2, 6, 23, 0.56)');
  backdropGlow.addColorStop(0.65, 'rgba(2, 6, 23, 0.22)');
  backdropGlow.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = backdropGlow;
  ctx.fillRect(0, captionY - lineH * 1.8, width, lineH * 3.6);

  rows.forEach((row, rIdx) => {
    const y = startY + rIdx * lineH;
    let cursorX = width / 2 - row.totalW / 2;
    ctx.textAlign = 'left';

    row.words.forEach((item) => {
      ctx.save();
      const wordCenterX = cursorX + item.w / 2;
      if (item.isActive) {
        ctx.translate(wordCenterX, y);
        ctx.scale(1.09, 1.09);
        ctx.translate(-wordCenterX, -y);
      }

      if (width <= 800) {
        ctx.shadowColor = item.isActive ? 'rgba(0, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = Math.round(width * 0.022);
        ctx.shadowOffsetY = Math.round(height * 0.003);
      }
      ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.24));
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.97)';
      ctx.strokeText(item.text, cursorX, y);

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = item.isActive ? activeFill : '#FFFFFF';
      ctx.fillText(item.text, cursorX, y);
      ctx.restore();

      cursorX += item.w + spaceW;
    });
  });

  ctx.restore();
}

function drawCreatorOutroOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  outroAlpha: number,
  topicLabelHindi: string,
  topic: StoryTopic,
  partNumber?: number,
  totalParts?: number
): void {
  if (outroAlpha <= 0.02) return;
  const isVertical = height > width;
  const isHorror = topic === 'horror';
  const y = isVertical ? height * 0.8 : height * 0.82;
  const titleSize = Math.round(isVertical ? width * 0.044 : height * 0.05);
  const subSize = Math.round(isVertical ? width * 0.032 : height * 0.036);

  ctx.save();
  ctx.globalAlpha = outroAlpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const ctaLine = getOutroCtaCopy(topic, partNumber, totalParts);

  ctx.font = `700 ${titleSize}px "Noto Sans Devanagari", "Plus Jakarta Sans", sans-serif`;
  ctx.lineWidth = Math.max(3, Math.round(titleSize * 0.22));
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.94)';
  ctx.strokeText(ctaLine, width / 2, y);
  ctx.fillStyle = isHorror ? '#FCA5A5' : '#FDE047';
  ctx.fillText(ctaLine, width / 2, y);

  ctx.font = `600 ${subSize}px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif`;
  ctx.strokeText(topicLabelHindi, width / 2, y + titleSize * 1.28);
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(topicLabelHindi, width / 2, y + titleSize * 1.28);

  ctx.restore();
}

export function renderStoryFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  story: StoryProject,
  currentTimeSec: number,
  sceneImagesOrSingle: Map<string, HTMLImageElement> | HTMLImageElement | null,
  showSubtitles = true
): void {
  const topicCfg = getTopicConfig(story.topic);
  const isAnime = (story.visualStyle ?? 'anime') === 'anime';
  const isHorror = story.topic === 'horror';
  const totalSec = Math.max(1, calculateTotalDuration(story.scenes));
  const transition = getSceneTransitionInfo(story.scenes, currentTimeSec, 0.55);
  const motionState = getAnimeMotionState(story.scenes, currentTimeSec);

  ctx.clearRect(0, 0, width, height);
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  if (isHorror) {
    bgGrad.addColorStop(0, '#040814');
    bgGrad.addColorStop(1, '#0F172A');
  } else if (story.topic === 'mahabharata') {
    bgGrad.addColorStop(0, '#1B0D10');
    bgGrad.addColorStop(1, '#2D161A');
  } else {
    bgGrad.addColorStop(0, '#111827');
    bgGrad.addColorStop(1, '#1E293B');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const resolveImg = (scene?: StoryScene): HTMLImageElement | null => {
    if (sceneImagesOrSingle instanceof Map) {
      if (scene?.id) {
        const mapped = sceneImagesOrSingle.get(scene.id);
        if (mapped && mapped.naturalWidth > 0) return mapped;
      }
      const urlCached = getCachedSceneImage(scene?.imageUrl);
      if (urlCached) return urlCached;
      const topicCached = getCachedSceneImage(topicCfg.defaultImage);
      if (topicCached) return topicCached;
      for (const candidate of sceneImagesOrSingle.values()) {
        if (candidate && candidate.naturalWidth > 0) return candidate;
      }
      return null;
    }
    if (sceneImagesOrSingle && sceneImagesOrSingle.naturalWidth > 0) {
      return sceneImagesOrSingle;
    }
    return getCachedSceneImage(scene?.imageUrl) ?? getCachedSceneImage(topicCfg.defaultImage);
  };

  let activeTransitionMode: 'cross_dissolve' | 'fade' | 'slide' = 'cross_dissolve';

  if (transition) {
    const currImg = resolveImg(transition.current.scene);
    const nextImg =
      transition.next && transition.crossfadeAlpha > 0
        ? resolveImg(transition.next.scene)
        : null;

    if (nextImg && transition.next && transition.crossfadeAlpha > 0) {
      activeTransitionMode = resolveSceneTransitionMode(
        story.transitionEffect,
        transition.current.scene,
        transition.next.scene,
        transition.current.index,
        story.topic
      );
      const t = transition.crossfadeAlpha;
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);

      if (activeTransitionMode === 'slide') {
        const seamX = (1 - eased) * width;
        if (currImg) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, Math.max(0, seamX + 2), height);
          ctx.clip();
          drawImageWithAnimeMotion(
            ctx,
            width,
            height,
            currImg,
            transition.current.scene,
            motionState.easedProgress,
            motionState.cutImpact,
            currentTimeSec,
            1,
            isAnime,
            isHorror,
            -eased * width * 0.35,
            0
          );
          ctx.restore();
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.max(0, seamX - 1), 0, width - seamX + 1, height);
        ctx.clip();
        drawImageWithAnimeMotion(
          ctx,
          width,
          height,
          nextImg,
          transition.next.scene,
          0,
          eased * 0.45,
          currentTimeSec,
          1,
          isAnime,
          isHorror,
          (1 - eased) * width * 0.45,
          0
        );
        ctx.restore();

        // Crisp luminous motion sheen along the slide seam
        ctx.save();
        const seamGrad = ctx.createLinearGradient(seamX - width * 0.05, 0, seamX + width * 0.05, 0);
        seamGrad.addColorStop(0, 'rgba(255,255,255,0)');
        seamGrad.addColorStop(0.5, isHorror ? 'rgba(56,189,248,0.34)' : 'rgba(253,224,71,0.38)');
        seamGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = seamGrad;
        ctx.fillRect(seamX - width * 0.05, 0, width * 0.1, height);
        ctx.restore();
      } else if (activeTransitionMode === 'fade') {
        if (currImg) {
          drawImageWithAnimeMotion(
            ctx,
            width,
            height,
            currImg,
            transition.current.scene,
            motionState.easedProgress,
            motionState.cutImpact,
            currentTimeSec,
            Math.max(0.28, 1 - eased * 0.72),
            isAnime,
            isHorror
          );
        }
        const dipAlpha = Math.sin(eased * Math.PI) * 0.56;
        if (dipAlpha > 0.01) {
          ctx.save();
          ctx.fillStyle = isHorror
            ? `rgba(4, 8, 22, ${dipAlpha})`
            : `rgba(12, 10, 24, ${dipAlpha})`;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
        const inAlpha = eased <= 0.2 ? 0 : Math.min(1, (eased - 0.2) / 0.8);
        if (inAlpha > 0.01) {
          drawImageWithAnimeMotion(
            ctx,
            width,
            height,
            nextImg,
            transition.next.scene,
            0,
            inAlpha * 0.4,
            currentTimeSec,
            inAlpha,
            isAnime,
            isHorror
          );
        }
      } else {
        // cross_dissolve: outgoing frame opaque underneath so crossfades never dip black
        if (currImg) {
          drawImageWithAnimeMotion(
            ctx,
            width,
            height,
            currImg,
            transition.current.scene,
            motionState.easedProgress,
            motionState.cutImpact,
            currentTimeSec,
            1,
            isAnime,
            isHorror
          );
        }
        drawImageWithAnimeMotion(
          ctx,
          width,
          height,
          nextImg,
          transition.next.scene,
          0,
          eased * 0.5,
          currentTimeSec,
          eased,
          isAnime,
          isHorror
        );
      }
    } else if (currImg) {
      drawImageWithAnimeMotion(
        ctx,
        width,
        height,
        currImg,
        transition.current.scene,
        motionState.easedProgress,
        motionState.cutImpact,
        currentTimeSec,
        1,
        isAnime,
        isHorror
      );
    }
  }

  // Cinematic genre color grading pass (fast composite gradient, 0ms export overhead)
  drawCinematicColorGrade(ctx, width, height, story.topic);

  // Anamorphic light-whip sweep during cross-dissolve scene transitions
  if (isAnime && transition && transition.crossfadeAlpha > 0.04 && activeTransitionMode === 'cross_dissolve') {
    drawAnamorphicTransitionStreak(ctx, width, height, transition.crossfadeAlpha, story.topic);
  }

  // Anime lighting, speedlines & atmospheric depth particles
  if (isAnime) {
    drawAnimeGodRays(ctx, width, height, story.topic, currentTimeSec);
    const activeShot = transition?.current.scene.shotType;
    const speedlineIntensity =
      transition?.showHookOverlay || activeShot === 'climax_closeup'
        ? 0.55 + motionState.cutImpact * 0.45
        : motionState.cutImpact * 0.65;
    drawAnimeSpeedlines(ctx, width, height, speedlineIntensity, currentTimeSec, isHorror);
  }

  // Cinema top & bottom safe-zone gradient scrim
  const scrim = ctx.createLinearGradient(0, 0, 0, height);
  scrim.addColorStop(0, 'rgba(2, 6, 23, 0.52)');
  scrim.addColorStop(0.22, 'rgba(2, 6, 23, 0)');
  scrim.addColorStop(0.64, 'rgba(2, 6, 23, 0.04)');
  scrim.addColorStop(1, 'rgba(2, 6, 23, 0.84)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  // Subtle corner film vignette
  const vig = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    Math.min(width, height) * 0.34,
    width * 0.5,
    height * 0.45,
    Math.max(width, height) * 0.78
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(2, 6, 23, 0.46)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // 2-layer bokeh + floating embers / starlight / fog
  drawAtmosphericBokehParticles(ctx, width, height, topicCfg.particleType, currentTimeSec);

  // Ultra-clean top hairline progress indicator & discrete part indicator
  const progressRatio = Math.max(0, Math.min(1, currentTimeSec / totalSec));
  const barH = Math.max(3, Math.round(height * 0.0032));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(0, 0, width, barH);
  ctx.fillStyle = isHorror ? '#EF4444' : '#F59E0B';
  ctx.fillRect(0, 0, width * progressRatio, barH);

  drawEpisodePartWatermark(ctx, width, height, story.partNumber, story.totalParts);

  // Opening 3.6s kinetic anime Hook headline
  if (transition?.showHookOverlay) {
    const hookText =
      transition.current.scene.hookCaption ||
      story.instagram?.hookLine ||
      story.titleHindi;
    drawAnimeHookBanner(
      ctx,
      width,
      height,
      hookText,
      motionState.hookPop,
      isHorror
    );
  }

  // Karaoke word-by-word highlighted Hindi captions synced to narration
  if (showSubtitles && transition) {
    const activeScene = transition.current.scene;
    const spokenOrCaption = activeScene.narrationHindi?.trim() || activeScene.subtitleHindi || '';
    drawKaraokeReelsCaptions(
      ctx,
      width,
      height,
      spokenOrCaption,
      transition.localProgress,
      story.topic,
      motionState.outroAlpha
    );
  }

  // Clean creator CTA outro fade-in on last 2.3s
  drawCreatorOutroOverlay(
    ctx,
    width,
    height,
    motionState.outroAlpha,
    topicCfg.labelHindi,
    story.topic,
    story.partNumber,
    story.totalParts
  );
}

export function renderThumbnailToCanvas(
  canvas: HTMLCanvasElement,
  story: StoryProject,
  loadedImage: HTMLImageElement | null
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isVertical = story.format !== 'youtube_long';
  canvas.width = isVertical ? 720 : 1280;
  canvas.height = isVertical ? 1280 : 720;

  const { width, height } = canvas;
  ctx.fillStyle = '#0B1120';
  ctx.fillRect(0, 0, width, height);

  if (loadedImage && loadedImage.naturalWidth > 0) {
    const imgRatio = loadedImage.naturalWidth / loadedImage.naturalHeight;
    const canvasRatio = width / height;
    let drawW = width;
    let drawH = height;
    if (imgRatio > canvasRatio) {
      drawH = height;
      drawW = height * imgRatio;
    } else {
      drawW = width;
      drawH = width / imgRatio;
    }
    ctx.save();
    if ('filter' in ctx) {
      ctx.filter = 'contrast(1.08) saturate(1.16)';
    }
    ctx.drawImage(loadedImage, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    ctx.restore();
  }

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.22)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.28)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0.9)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const headline = story.youtube.thumbnailHeadline || story.titleHindi;
  const lines = splitSubtitleIntoLines(headline, isVertical ? 16 : 22);
  const fontSize = Math.round(isVertical ? width * 0.095 : height * 0.12);
  const lineHeight = Math.round(fontSize * 1.24);

  ctx.font = `800 ${fontSize}px "Noto Sans Devanagari", "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const startY =
    height - (isVertical ? height * 0.22 : height * 0.22) - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, idx) => {
    const y = startY + idx * lineHeight;
    ctx.lineWidth = Math.max(5, Math.round(fontSize * 0.2));
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.94)';
    ctx.strokeText(line, width / 2, y);
    ctx.fillStyle = idx === 0 ? '#FDE047' : '#FFFFFF';
    ctx.fillText(line, width / 2, y);
  });
}

export interface ExportedVideoResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
}

function pickSupportedRecorderMime(): { mimeType: string; extension: 'mp4' | 'webm' } {
  const candidates: { mimeType: string; extension: 'mp4' | 'webm' }[] = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1.4d401f,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];
  for (const item of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(item.mimeType)) {
      return item;
    }
  }
  return { mimeType: 'video/webm', extension: 'webm' };
}

export async function exportStoryVideo(params: {
  story: StoryProject;
  mixer: StudioAudioMixer;
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  showSubtitles: boolean;
  onProgress: (pct: number) => void;
}): Promise<ExportedVideoResult> {
  const { story, mixer, bgmEnabled, sfxEnabled, showSubtitles, onProgress } = params;
  const spec = getFormatSpec(story.format);
  const canvas = document.createElement('canvas');
  canvas.width = spec.exportWidth;
  canvas.height = spec.exportHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not initialize video export canvas.');

  const topicCfg = getTopicConfig(story.topic);
  await mixer.ensureReady();
  const sceneImages = await loadStorySceneImages(story.scenes, topicCfg.defaultImage);
  if (story.audioUrl) {
    await mixer.preloadVoiceover(story.audioUrl);
  }
  await mixer.preloadCustomBgm(story.bgmAudioUrl);
  await mixer.preloadMoodBgm(story.bgmMood);

  const totalSec = getEffectivePlaybackDurationSec(story.scenes, mixer.getVoiceDurationSec());
  const canvasStream = canvas.captureStream(30);
  const audioTrack = mixer.getMediaStreamTrack();
  if (audioTrack) {
    canvasStream.addTrack(audioTrack);
  }

  const picked = pickSupportedRecorderMime();
  const recorder = new MediaRecorder(canvasStream, {
    mimeType: picked.mimeType,
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 192_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data);
  };

  return new Promise<ExportedVideoResult>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Video recording failed during export.'));
    recorder.onstop = () => {
      mixer.stopAll();
      const baseType = picked.extension === 'mp4' ? 'video/mp4' : 'video/webm';
      resolve({
        blob: new Blob(chunks, { type: baseType }),
        mimeType: baseType,
        extension: picked.extension,
      });
    };

    const hasVoice = Boolean(story.audioUrl && mixer.getVoiceDurationSec() > 0);
    // Render frame 0 before starting capture so video and audio start aligned at 0.000s
    renderStoryFrameToCanvas(
      ctx,
      canvas.width,
      canvas.height,
      story,
      0,
      sceneImages,
      showSubtitles
    );

    recorder.start(200);
    mixer.startBgm(story.bgmMood, bgmEnabled, hasVoice);
    mixer.setSfxEnabled(sfxEnabled);
    if (hasVoice) {
      mixer.startVoiceFromOffset(0);
    }

    const startWallTime = performance.now();
    const startAudioCtxTime = mixer.getCurrentTime();
    let lastSceneId = '';
    let finishing = false;
    let rafHandle: number | null = null;
    let timerHandle: ReturnType<typeof setTimeout> | null = null;

    const getElapsedSec = () => {
      const audioDelta = mixer.getCurrentTime() - startAudioCtxTime;
      if (audioDelta > 0.02) {
        return audioDelta;
      }
      return (performance.now() - startWallTime) / 1000;
    };

    const scheduleNext = () => {
      if (finishing) return;
      rafHandle = requestAnimationFrame(step);
      timerHandle = setTimeout(step, 50);
    };

    const step = () => {
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      if (timerHandle !== null) {
        clearTimeout(timerHandle);
        timerHandle = null;
      }
      if (finishing) return;

      const elapsedSec = getElapsedSec();
      const voiceStillActive = hasVoice && mixer.isVoicePlaying();
      if (elapsedSec >= totalSec && (!voiceStillActive || elapsedSec >= totalSec + 1.5)) {
        finishing = true;
        renderStoryFrameToCanvas(
          ctx,
          canvas.width,
          canvas.height,
          story,
          totalSec,
          sceneImages,
          showSubtitles
        );
        onProgress(100);
        mixer.fadeMasterOut(0.24);
        // Allow trailing WebAudio samples & fade tail to flush cleanly into MediaRecorder before stop()
        setTimeout(() => {
          try {
            if (recorder.state === 'recording') {
              recorder.requestData();
              recorder.stop();
            }
          } catch {
            // ignore
          }
        }, 420);
        return;
      }

      const active = getActiveSceneAtTime(story.scenes, Math.min(elapsedSec, totalSec));
      if (active && active.entry.scene.id !== lastSceneId) {
        lastSceneId = active.entry.scene.id;
        if (sfxEnabled) {
          mixer.triggerSfx(active.entry.scene.sfxCue);
        }
      }

      renderStoryFrameToCanvas(
        ctx,
        canvas.width,
        canvas.height,
        story,
        Math.min(elapsedSec, totalSec),
        sceneImages,
        showSubtitles
      );

      onProgress(Math.min(99, Math.round((Math.min(elapsedSec, totalSec) / totalSec) * 100)));
      scheduleNext();
    };

    scheduleNext();
  });
}

export async function exportStoryVideoWebm(params: {
  story: StoryProject;
  mixer: StudioAudioMixer;
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  showSubtitles: boolean;
  onProgress: (pct: number) => void;
}): Promise<Blob> {
  const result = await exportStoryVideo(params);
  return result.blob;
}
