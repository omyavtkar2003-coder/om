import type { BgmMood, SfxCue } from './types';

const BGM_LOOP_SEC = 16.0;
const BGM_TAIL_SEC = 2.0;

function wrapOfflineBufferToSeamlessLoop(
  rendered: AudioBuffer,
  loopDurationSec: number
): AudioBuffer {
  const sr = rendered.sampleRate;
  const loopSamples = Math.floor(loopDurationSec * sr);
  const channels = rendered.numberOfChannels;
  const result = new AudioBuffer({
    length: loopSamples,
    numberOfChannels: channels,
    sampleRate: sr,
  });

  for (let ch = 0; ch < channels; ch++) {
    const src = rendered.getChannelData(ch);
    const dst = result.getChannelData(ch);
    // Copy main loop body
    for (let i = 0; i < loopSamples; i++) {
      dst[i] = src[i];
    }
    // Fold trailing decay tail back onto the start with gentle fade-in at boundaries for click-free infinite loop
    const tailLen = Math.min(loopSamples, src.length - loopSamples);
    for (let i = 0; i < tailLen; i++) {
      const fadeOut = 1 - i / tailLen;
      dst[i] += src[loopSamples + i] * fadeOut;
    }
    // Soft normalization & peak safety limiter at 0.86
    let peak = 0;
    for (let i = 0; i < loopSamples; i++) {
      const abs = Math.abs(dst[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 0.84) {
      const scale = 0.84 / peak;
      for (let i = 0; i < loopSamples; i++) {
        dst[i] *= scale;
      }
    }
  }
  return result;
}

function createNoiseBuffer(ctx: BaseAudioContext, durationSec: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.045 * white) / 1.045;
    data[i] = Math.max(-1, Math.min(1, last * 2.8));
  }
  return buf;
}

function scheduleTanpuraPluck(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  startSec: number,
  freq: number,
  gainAmp: number,
  pan: number
): void {
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(pan, startSec);
  panner.connect(dest);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, startSec);
  filter.frequency.exponentialRampToValueAtTime(480, startSec + 1.8);
  filter.connect(panner);

  const partials = [
    { mult: 1, amp: 0.55, type: 'triangle' as OscillatorType, detune: 0 },
    { mult: 2, amp: 0.34, type: 'sawtooth' as OscillatorType, detune: -3 },
    { mult: 3, amp: 0.22, type: 'sine' as OscillatorType, detune: 4 },
    { mult: 4, amp: 0.14, type: 'sine' as OscillatorType, detune: -2 },
  ];

  partials.forEach((p) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = p.type;
    osc.frequency.setValueAtTime(freq * p.mult, startSec);
    osc.detune.setValueAtTime(p.detune, startSec);

    g.gain.setValueAtTime(0.0001, startSec);
    g.gain.linearRampToValueAtTime(gainAmp * p.amp, startSec + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, startSec + 2.25);

    osc.connect(g);
    g.connect(filter);
    osc.start(startSec);
    osc.stop(startSec + 2.35);
  });
}

function scheduleWarmPad(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  freqs: number[],
  durationSec: number,
  gainAmp: number,
  cutoffHz: number
): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoffHz, 0);
  filter.Q.setValueAtTime(0.9, 0);
  filter.connect(dest);

  freqs.forEach((f, idx) => {
    [-5, 5].forEach((detune, dIdx) => {
      const osc = ctx.createOscillator();
      const panner = ctx.createStereoPanner();
      const g = ctx.createGain();
      osc.type = idx === freqs.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, 0);
      osc.detune.setValueAtTime(detune, 0);
      panner.pan.setValueAtTime(dIdx === 0 ? -0.35 : 0.35, 0);

      // Gentle crossfade envelope over full loop duration
      g.gain.setValueAtTime(0.001, 0);
      g.gain.linearRampToValueAtTime(gainAmp / freqs.length, 0.85);
      g.gain.setValueAtTime(gainAmp / freqs.length, Math.max(1.0, durationSec - 0.85));
      g.gain.linearRampToValueAtTime(0.001, durationSec);

      osc.connect(g);
      g.connect(panner);
      panner.connect(filter);
      osc.start(0);
      osc.stop(durationSec + 0.05);
    });
  });
}

function scheduleBansuriNote(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  noiseBuf: AudioBuffer,
  startSec: number,
  freq: number,
  durationSec: number,
  gainAmp: number,
  pan = 0.16,
  glideFromRatio = 0.94
): void {
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(pan, startSec);
  panner.connect(dest);

  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.setValueAtTime(2100, startSec);
  toneFilter.connect(panner);

  // Main flute voice + subtle 2nd harmonic warmth
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sine';
  osc2.type = 'sine';

  const glideDur = Math.min(0.11, durationSec * 0.25);
  osc1.frequency.setValueAtTime(freq * glideFromRatio, startSec);
  osc1.frequency.exponentialRampToValueAtTime(freq, startSec + glideDur);
  osc2.frequency.setValueAtTime(freq * 2 * glideFromRatio, startSec);
  osc2.frequency.exponentialRampToValueAtTime(freq * 2, startSec + glideDur);

  // Expressive vibrato
  const vib = ctx.createOscillator();
  const vibG = ctx.createGain();
  vib.frequency.setValueAtTime(5.1, startSec);
  vibG.gain.setValueAtTime(freq * 0.0075, startSec);
  vib.connect(vibG);
  vibG.connect(osc1.frequency);
  vib.start(startSec);
  vib.stop(startSec + durationSec + 0.06);

  const g1 = ctx.createGain();
  const g2 = ctx.createGain();
  const atk = Math.min(0.12, durationSec * 0.22);
  g1.gain.setValueAtTime(0.0001, startSec);
  g1.gain.linearRampToValueAtTime(gainAmp, startSec + atk);
  g1.gain.exponentialRampToValueAtTime(0.0001, startSec + durationSec);

  g2.gain.setValueAtTime(0.0001, startSec);
  g2.gain.linearRampToValueAtTime(gainAmp * 0.16, startSec + atk);
  g2.gain.exponentialRampToValueAtTime(0.0001, startSec + durationSec * 0.9);

  osc1.connect(g1);
  osc2.connect(g2);
  g1.connect(toneFilter);
  g2.connect(toneFilter);
  osc1.start(startSec);
  osc2.start(startSec);
  osc1.stop(startSec + durationSec + 0.06);
  osc2.stop(startSec + durationSec + 0.06);

  // Soft bamboo breath chiff at note onset
  const breath = ctx.createBufferSource();
  breath.buffer = noiseBuf;
  const breathBp = ctx.createBiquadFilter();
  breathBp.type = 'bandpass';
  breathBp.frequency.setValueAtTime(Math.min(2600, freq * 2.2), startSec);
  breathBp.Q.setValueAtTime(2.5, startSec);
  const breathG = ctx.createGain();
  breathG.gain.setValueAtTime(0.0001, startSec);
  breathG.gain.linearRampToValueAtTime(gainAmp * 0.11, startSec + 0.04);
  breathG.gain.exponentialRampToValueAtTime(0.0001, startSec + Math.min(0.35, durationSec * 0.6));
  breath.connect(breathBp);
  breathBp.connect(breathG);
  breathG.connect(panner);
  breath.start(startSec);
  breath.stop(startSec + Math.min(0.4, durationSec));
}

function scheduleTablaHit(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  noiseBuf: AudioBuffer,
  startSec: number,
  kind: 'ge' | 'na' | 'tin',
  gainAmp: number
): void {
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(kind === 'ge' ? -0.14 : 0.16, startSec);
  panner.connect(dest);

  if (kind === 'ge') {
    const sub = ctx.createOscillator();
    const g = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(124, startSec);
    sub.frequency.exponentialRampToValueAtTime(62, startSec + 0.24);
    g.gain.setValueAtTime(0.001, startSec);
    g.gain.linearRampToValueAtTime(gainAmp, startSec + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0005, startSec + 0.36);
    sub.connect(g);
    g.connect(panner);
    sub.start(startSec);
    sub.stop(startSec + 0.38);
    return;
  }

  const baseFreq = kind === 'na' ? 310 : 275;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseFreq * 1.12, startSec);
  osc.frequency.exponentialRampToValueAtTime(baseFreq, startSec + 0.045);
  g.gain.setValueAtTime(0.001, startSec);
  g.gain.linearRampToValueAtTime(gainAmp * 0.55, startSec + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0005, startSec + (kind === 'tin' ? 0.26 : 0.14));
  osc.connect(g);
  g.connect(panner);
  osc.start(startSec);
  osc.stop(startSec + 0.3);

  const slap = ctx.createBufferSource();
  slap.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.setValueAtTime(1400, startSec);
  const slapG = ctx.createGain();
  slapG.gain.setValueAtTime(gainAmp * 0.25, startSec);
  slapG.gain.exponentialRampToValueAtTime(0.0005, startSec + 0.055);
  slap.connect(hp);
  hp.connect(slapG);
  slapG.connect(panner);
  slap.start(startSec);
  slap.stop(startSec + 0.07);
}

function scheduleTaikoHit(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  noiseBuf: AudioBuffer,
  startSec: number,
  heavy: boolean,
  gainAmp: number
): void {
  const sub = ctx.createOscillator();
  const subG = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(heavy ? 116 : 96, startSec);
  sub.frequency.exponentialRampToValueAtTime(38, startSec + 0.34);
  subG.gain.setValueAtTime(0.001, startSec);
  subG.gain.linearRampToValueAtTime(gainAmp, startSec + 0.015);
  subG.gain.exponentialRampToValueAtTime(0.0005, startSec + (heavy ? 0.54 : 0.32));
  sub.connect(subG);
  subG.connect(dest);
  sub.start(startSec);
  sub.stop(startSec + 0.58);

  const impact = ctx.createBufferSource();
  impact.buffer = noiseBuf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(heavy ? 950 : 700, startSec);
  const impG = ctx.createGain();
  impG.gain.setValueAtTime(gainAmp * (heavy ? 0.45 : 0.28), startSec);
  impG.gain.exponentialRampToValueAtTime(0.0005, startSec + 0.14);
  impact.connect(lp);
  lp.connect(impG);
  impG.connect(dest);
  impact.start(startSec);
  impact.stop(startSec + 0.16);
}

function scheduleChimeOrHarp(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  startSec: number,
  freq: number,
  durationSec: number,
  gainAmp: number,
  pan: number,
  metallic = false
): void {
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(pan, startSec);
  panner.connect(dest);

  const ratios = metallic ? [1, 2.756, 4.1] : [1, 2, 3];
  ratios.forEach((ratio, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = idx === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq * ratio, startSec);
    const amp = gainAmp / (idx === 0 ? 1 : idx * 2.4);
    g.gain.setValueAtTime(0.0001, startSec);
    g.gain.linearRampToValueAtTime(amp, startSec + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, startSec + durationSec / (idx + 1));
    osc.connect(g);
    g.connect(panner);
    osc.start(startSec);
    osc.stop(startSec + durationSec + 0.05);
  });
}

async function renderMoodBgmBuffer(mood: BgmMood, sampleRate = 44100): Promise<AudioBuffer> {
  const totalSec = BGM_LOOP_SEC + BGM_TAIL_SEC;
  const off = new OfflineAudioContext(2, Math.round(sampleRate * totalSec), sampleRate);
  const noiseBuf = createNoiseBuffer(off, 2.5);

  const mixBus = off.createGain();
  mixBus.gain.setValueAtTime(0.9, 0);

  // Subtle built-in stereo slap/hall warmth inside the pre-rendered soundtrack
  const delayL = off.createDelay(1.0);
  const delayR = off.createDelay(1.0);
  delayL.delayTime.setValueAtTime(0.19, 0);
  delayR.delayTime.setValueAtTime(0.27, 0);
  const wetLp = off.createBiquadFilter();
  wetLp.type = 'lowpass';
  wetLp.frequency.setValueAtTime(1650, 0);
  const panL = off.createStereoPanner();
  const panR = off.createStereoPanner();
  panL.pan.setValueAtTime(-0.45, 0);
  panR.pan.setValueAtTime(0.45, 0);
  const wetGain = off.createGain();
  wetGain.gain.setValueAtTime(0.28, 0);

  mixBus.connect(off.destination);
  mixBus.connect(delayL);
  mixBus.connect(delayR);
  delayL.connect(panL);
  delayR.connect(panR);
  panL.connect(wetLp);
  panR.connect(wetLp);
  wetLp.connect(wetGain);
  wetGain.connect(off.destination);

  if (mood === 'serene_flute') {
    // Raag Bhupali (C Major Pentatonic: C D E G A) lush Vrindavan Krishna theme
    scheduleWarmPad(off, mixBus, [130.81, 196.0, 261.63, 329.63], BGM_LOOP_SEC, 0.24, 920);
    // Warm Tanpura cycle (Pa-Sa-Sa-Sa_low)
    const tanpura = [196.0, 261.63, 261.63, 130.81];
    for (let t = 0; t < BGM_LOOP_SEC - 0.1; t += 0.5) {
      const idx = Math.round(t / 0.5) % tanpura.length;
      scheduleTanpuraPluck(off, mixBus, t, tanpura[idx], 0.12, idx % 2 === 0 ? -0.18 : 0.14);
    }
    // Gentle 8-beat Kaharwa wooden tabla pulse
    for (let beat = 0; beat < 32; beat++) {
      const t = beat * 0.5;
      const step = beat % 8;
      if (step === 0 || step === 4) {
        scheduleTablaHit(off, mixBus, noiseBuf, t, 'ge', 0.18);
        scheduleTablaHit(off, mixBus, noiseBuf, t, 'tin', 0.12);
      } else if (step === 2 || step === 6) {
        scheduleTablaHit(off, mixBus, noiseBuf, t, 'na', 0.13);
      } else if (step === 7) {
        scheduleTablaHit(off, mixBus, noiseBuf, t, 'ge', 0.1);
      }
    }
    // Lyrical expressive bamboo Bansuri melody
    const melody: Array<[number, number, number]> = [
      [0.2, 523.25, 1.3],
      [1.6, 587.33, 1.1],
      [2.8, 659.25, 1.8],
      [5.0, 783.99, 1.2],
      [6.3, 659.25, 1.4],
      [8.2, 880.0, 1.5],
      [9.9, 783.99, 1.3],
      [11.4, 659.25, 1.2],
      [12.8, 587.33, 1.3],
      [14.2, 523.25, 1.6],
    ];
    melody.forEach(([start, freq, dur]) => {
      scheduleBansuriNote(off, mixBus, noiseBuf, start, freq, dur, 0.26, 0.18);
    });
    // Sparkling ghungroo / manjira accents
    [0, 4, 8, 12].forEach((bar) => {
      scheduleChimeOrHarp(off, mixBus, bar, 1046.5, 1.1, 0.07, -0.32, true);
    });
  } else if (mood === 'devotional_tanpura') {
    // Sacred Temple C# / Db devotional theme with Swarmandal harp & bronze bell
    scheduleWarmPad(off, mixBus, [138.59, 207.65, 277.18, 349.23], BGM_LOOP_SEC, 0.25, 980);
    const tanpura = [207.65, 277.18, 277.18, 138.59];
    for (let t = 0; t < BGM_LOOP_SEC - 0.1; t += 0.5) {
      const idx = Math.round(t / 0.5) % tanpura.length;
      scheduleTanpuraPluck(off, mixBus, t, tanpura[idx], 0.145, idx % 2 === 0 ? -0.2 : 0.2);
    }
    // Steady devotional tabla pulse
    for (let beat = 0; beat < 32; beat++) {
      const t = beat * 0.5;
      const step = beat % 4;
      if (step === 0) scheduleTablaHit(off, mixBus, noiseBuf, t, 'ge', 0.16);
      if (step === 2) scheduleTablaHit(off, mixBus, noiseBuf, t, 'na', 0.12);
    }
    // Cascading Swarmandal harp arpeggios every 4 seconds
    const harpScale = [277.18, 349.23, 415.3, 466.16, 554.37, 698.46, 830.61];
    [0.15, 4.15, 8.15, 12.15].forEach((barStart) => {
      harpScale.forEach((f, i) => {
        scheduleChimeOrHarp(
          off,
          mixBus,
          barStart + i * 0.14,
          f,
          1.4,
          0.11,
          -0.25 + i * 0.08,
          false
        );
      });
    });
    // Temple bell shimmer + flute response
    [0, 8].forEach((t) => {
      scheduleChimeOrHarp(off, mixBus, t, 554.37, 2.2, 0.11, 0.25, true);
    });
    scheduleBansuriNote(off, mixBus, noiseBuf, 1.8, 554.37, 2.0, 0.22, -0.18);
    scheduleBansuriNote(off, mixBus, noiseBuf, 5.8, 698.46, 1.9, 0.21, -0.18);
    scheduleBansuriNote(off, mixBus, noiseBuf, 9.8, 830.61, 1.8, 0.21, -0.18);
    scheduleBansuriNote(off, mixBus, noiseBuf, 13.5, 554.37, 2.1, 0.22, -0.18);
  } else if (mood === 'epic_drums') {
    // Heroic Mahabharata / Battle theme at 120 BPM (D minor heroic)
    scheduleWarmPad(off, mixBus, [73.42, 110.0, 146.83, 220.0], BGM_LOOP_SEC, 0.29, 1080);
    // Driving Taiko + Dholak rhythm
    for (let beat = 0; beat < 32; beat++) {
      const t = beat * 0.5;
      const step = beat % 4;
      if (step === 0) {
        scheduleTaikoHit(off, mixBus, noiseBuf, t, true, 0.34);
      } else if (step === 2) {
        scheduleTaikoHit(off, mixBus, noiseBuf, t, false, 0.25);
      } else if (step === 3) {
        scheduleTablaHit(off, mixBus, noiseBuf, t, 'na', 0.16);
      }
      // Heroic syncopated war dhol hits
      if (beat % 8 === 3 || beat % 8 === 6) {
        scheduleTaikoHit(off, mixBus, noiseBuf, t + 0.25, false, 0.2);
      }
      // Double-time battle fill before loop turnaround & midpoint
      if (beat === 15 || beat === 31) {
        scheduleTaikoHit(off, mixBus, noiseBuf, t + 0.16, false, 0.22);
        scheduleTaikoHit(off, mixBus, noiseBuf, t + 0.32, true, 0.28);
      }
    }
    // Epic string/horn fifths melody
    const epicNotes: Array<[number, number, number]> = [
      [0, 293.66, 1.8],
      [2, 349.23, 1.8],
      [4, 440.0, 1.9],
      [6, 392.0, 1.8],
      [8, 293.66, 1.8],
      [10, 440.0, 1.8],
      [12, 523.25, 1.8],
      [14, 440.0, 1.8],
    ];
    epicNotes.forEach(([start, freq, dur]) => {
      scheduleBansuriNote(off, mixBus, noiseBuf, start, freq, dur, 0.21, 0, 0.98);
      scheduleChimeOrHarp(off, mixBus, start, freq * 0.5, dur, 0.12, -0.22, false);
    });
    // Bronze war gong bloom
    [0, 8].forEach((t) => {
      scheduleChimeOrHarp(off, mixBus, t, 146.83, 2.2, 0.18, 0.2, true);
    });
  } else {
    // 'eerie_horror': Sub-bass dread + tense heartbeat + spooky chimes + cold wind
    scheduleWarmPad(off, mixBus, [65.41, 98.0, 138.59], BGM_LOOP_SEC, 0.23, 380);
    // Slow anxious heartbeat lub-dub every 2.0s
    for (let t = 0; t < BGM_LOOP_SEC - 0.4; t += 2.0) {
      scheduleTaikoHit(off, mixBus, noiseBuf, t, false, 0.23);
      scheduleTaikoHit(off, mixBus, noiseBuf, t + 0.24, false, 0.15);
    }
    // Creepy tritone music-box / ghostly chimes
    const horrorNotes: Array<[number, number, number]> = [
      [0.6, 587.33, 2.1],
      [2.8, 622.25, 2.0],
      [5.2, 415.3, 2.2],
      [8.6, 587.33, 2.0],
      [11.0, 466.16, 2.2],
      [13.4, 311.13, 2.3],
    ];
    horrorNotes.forEach(([start, freq, dur], idx) => {
      scheduleChimeOrHarp(off, mixBus, start, freq, dur, 0.14, idx % 2 === 0 ? -0.32 : 0.32, true);
    });
    // Swirling cold night wind gusts
    [1.0, 9.0].forEach((t) => {
      const wind = off.createBufferSource();
      wind.buffer = noiseBuf;
      const bp = off.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(240, t);
      bp.frequency.linearRampToValueAtTime(520, t + 1.2);
      bp.frequency.linearRampToValueAtTime(210, t + 2.4);
      bp.Q.setValueAtTime(1.8, t);
      const wg = off.createGain();
      wg.gain.setValueAtTime(0.001, t);
      wg.gain.linearRampToValueAtTime(0.16, t + 1.1);
      wg.gain.exponentialRampToValueAtTime(0.001, t + 2.45);
      wind.connect(bp);
      bp.connect(wg);
      wg.connect(mixBus);
      wind.start(t);
      wind.stop(t + 2.5);
    });
  }

  const rendered = await off.startRendering();
  return wrapOfflineBufferToSeamlessLoop(rendered, BGM_LOOP_SEC);
}

export class StudioAudioMixer {
  private ctx: AudioContext | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmVocalCarve: BiquadFilterNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private ambienceSend: GainNode | null = null;
  private mediaDest: MediaStreamAudioDestinationNode | null = null;
  private bgmNodes: AudioNode[] = [];
  private bgmLoopTimer: ReturnType<typeof setInterval> | null = null;
  private bgmStep = 0;
  private bgmEnabledFlag = true;
  private bgmSessionSeq = 0;
  private voiceActiveFlag = false;
  private voiceSource: AudioBufferSourceNode | null = null;
  private voiceEndCtxTime = 0;
  private cachedAudioUrl: string | null = null;
  private cachedBuffer: AudioBuffer | null = null;
  private inFlightVoicePreloads = new Map<string, Promise<AudioBuffer | null>>();
  private cachedBgmUrl: string | null = null;
  private cachedBgmBuffer: AudioBuffer | null = null;
  private moodBgmCache = new Map<BgmMood, AudioBuffer>();
  private inFlightMoodRenders = new Map<BgmMood, Promise<AudioBuffer | null>>();
  private stopAfterFadeTimer: ReturnType<typeof setTimeout> | null = null;

  private clearStopAfterFadeTimer(): void {
    if (this.stopAfterFadeTimer) {
      clearTimeout(this.stopAfterFadeTimer);
      this.stopAfterFadeTimer = null;
    }
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master dynamics compressor & limiter keeps Hindi dialogue broadcast-clear without digital clipping
      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.value = -13;
      this.masterCompressor.knee.value = 16;
      this.masterCompressor.ratio.value = 3.0;
      this.masterCompressor.attack.value = 0.004;
      this.masterCompressor.release.value = 0.16;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.95;
      this.masterCompressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.mediaDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.mediaDest);

      // Subtle warm ambience bus for BGM & SFX
      this.ambienceSend = this.ctx.createGain();
      this.ambienceSend.gain.value = 0.2;
      const delay = this.ctx.createDelay(1.0);
      delay.delayTime.value = 0.21;
      const damp = this.ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 1600;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.22;
      const ambienceOut = this.ctx.createGain();
      ambienceOut.gain.value = 0.24;

      this.ambienceSend.connect(delay);
      delay.connect(damp);
      damp.connect(feedback);
      feedback.connect(delay);
      damp.connect(ambienceOut);
      ambienceOut.connect(this.masterCompressor);

      // BGM chain: bgmGain -> vocal-pocket carve EQ (~1750Hz dip during Hindi speech) -> masterCompressor
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.2;

      this.bgmVocalCarve = this.ctx.createBiquadFilter();
      this.bgmVocalCarve.type = 'peaking';
      this.bgmVocalCarve.frequency.value = 1750;
      this.bgmVocalCarve.Q.value = 0.85;
      this.bgmVocalCarve.gain.value = 0;

      this.bgmGain.connect(this.bgmVocalCarve);
      this.bgmVocalCarve.connect(this.masterCompressor);
      this.bgmVocalCarve.connect(this.ambienceSend);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.34;
      this.sfxGain.connect(this.masterCompressor);
      this.sfxGain.connect(this.ambienceSend);

      // Voice EQ chain: rumble cut (85Hz) + chest warmth (220Hz) + Hindi vocal intelligibility (2.65kHz)
      const voiceHp = this.ctx.createBiquadFilter();
      voiceHp.type = 'highpass';
      voiceHp.frequency.value = 85;
      voiceHp.Q.value = 0.7;

      const voiceWarmth = this.ctx.createBiquadFilter();
      voiceWarmth.type = 'peaking';
      voiceWarmth.frequency.value = 220;
      voiceWarmth.Q.value = 0.8;
      voiceWarmth.gain.value = 1.6;

      const voicePresence = this.ctx.createBiquadFilter();
      voicePresence.type = 'peaking';
      voicePresence.frequency.value = 2650;
      voicePresence.Q.value = 1.0;
      voicePresence.gain.value = 2.8;

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 1.18;

      this.voiceGain.connect(voiceHp);
      voiceHp.connect(voiceWarmth);
      voiceWarmth.connect(voicePresence);
      voicePresence.connect(this.masterCompressor);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public async ensureReady(): Promise<AudioContext> {
    this.clearStopAfterFadeTimer();
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ignore autoplay errors when called outside gesture
      }
    }
    if (this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
      this.masterGain.gain.setValueAtTime(0.95, ctx.currentTime);
    }
    if (this.voiceGain) {
      this.voiceGain.gain.cancelScheduledValues(ctx.currentTime);
      this.voiceGain.gain.setValueAtTime(1.18, ctx.currentTime);
    }
    return ctx;
  }

  public getCurrentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  public isVoicePlaying(): boolean {
    if (!this.voiceSource || !this.ctx) return false;
    return this.ctx.currentTime < this.voiceEndCtxTime - 0.02;
  }

  public getVoiceDurationSec(): number {
    return this.cachedBuffer?.duration ?? 0;
  }

  private getTargetBgmLevel(): number {
    if (!this.bgmEnabledFlag) return 0;
    // Rich audible Indian soundtrack under Hindi speech with warm swell in pauses/outro
    return this.voiceActiveFlag ? 0.185 : 0.32;
  }

  private updateBgmGain(): void {
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(this.getTargetBgmLevel(), this.ctx.currentTime, 0.14);
    }
    if (this.bgmVocalCarve && this.ctx) {
      // Gently carve 1.75kHz mid-range pocket during voiceover so music stays rich yet crisp under Hindi dialogue
      this.bgmVocalCarve.gain.setTargetAtTime(this.voiceActiveFlag ? -4.5 : 0, this.ctx.currentTime, 0.14);
    }
  }

  public getMediaStreamTrack(): MediaStreamTrack | null {
    this.ensureContext();
    return this.mediaDest?.stream.getAudioTracks()[0] ?? null;
  }

  public setBgmEnabled(enabled: boolean): void {
    this.bgmEnabledFlag = enabled;
    this.updateBgmGain();
  }

  public setSfxEnabled(enabled: boolean): void {
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(enabled ? 0.34 : 0, this.ctx.currentTime, 0.08);
    }
  }

  public async preloadVoiceover(url: string | null): Promise<AudioBuffer | null> {
    if (!url) {
      this.cachedAudioUrl = null;
      this.cachedBuffer = null;
      return null;
    }
    if (this.cachedAudioUrl === url && this.cachedBuffer) {
      return this.cachedBuffer;
    }
    const pending = this.inFlightVoicePreloads.get(url);
    if (pending) {
      return pending;
    }
    const task = (async () => {
      try {
        const ctx = this.ensureContext();
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        this.cachedAudioUrl = url;
        this.cachedBuffer = decoded;
        return decoded;
      } catch {
        return null;
      } finally {
        this.inFlightVoicePreloads.delete(url);
      }
    })();
    this.inFlightVoicePreloads.set(url, task);
    return task;
  }

  public async preloadCustomBgm(url: string | null | undefined): Promise<AudioBuffer | null> {
    if (!url) {
      this.cachedBgmUrl = null;
      this.cachedBgmBuffer = null;
      return null;
    }
    if (this.cachedBgmUrl === url && this.cachedBgmBuffer) {
      return this.cachedBgmBuffer;
    }
    try {
      const ctx = this.ensureContext();
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      this.cachedBgmUrl = url;
      this.cachedBgmBuffer = decoded;
      return decoded;
    } catch {
      return null;
    }
  }

  public async preloadMoodBgm(mood: BgmMood): Promise<AudioBuffer | null> {
    const cached = this.moodBgmCache.get(mood);
    if (cached) return cached;
    if (typeof OfflineAudioContext === 'undefined') return null;

    const pending = this.inFlightMoodRenders.get(mood);
    if (pending) return pending;

    const task = (async () => {
      try {
        const sampleRate = this.ctx?.sampleRate || 44100;
        const buf = await renderMoodBgmBuffer(mood, sampleRate);
        this.moodBgmCache.set(mood, buf);
        return buf;
      } catch {
        return null;
      } finally {
        this.inFlightMoodRenders.delete(mood);
      }
    })();

    this.inFlightMoodRenders.set(mood, task);
    return task;
  }

  private playExpressiveNote(
    freq: number,
    durationSec: number,
    peakGain: number,
    wave: OscillatorType = 'sine',
    attackSec = 0.09,
    withVibrato = false
  ): void {
    if (!this.ctx || !this.bgmGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = wave;
    osc.frequency.setValueAtTime(withVibrato ? freq * 0.96 : freq, now);
    if (withVibrato) {
      osc.frequency.exponentialRampToValueAtTime(freq, now + Math.min(0.14, attackSec + 0.04));
      const vib = this.ctx.createOscillator();
      const vibG = this.ctx.createGain();
      vib.frequency.value = 5.1;
      vibG.gain.value = freq * 0.008;
      vib.connect(vibG);
      vibG.connect(osc.frequency);
      vib.start(now);
      vib.stop(now + durationSec + 0.06);
    }

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(wave === 'triangle' ? 1350 : 1150, now);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peakGain, now + attackSec);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.bgmGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.06);
  }

  private playTaikoPulse(heavy = true): void {
    if (!this.ctx || !this.bgmGain) return;
    const now = this.ctx.currentTime;

    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(heavy ? 112 : 94, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.34);

    subG.gain.setValueAtTime(0.001, now);
    subG.gain.linearRampToValueAtTime(heavy ? 0.52 : 0.34, now + 0.015);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    sub.connect(subG);
    subG.connect(this.bgmGain);
    sub.start(now);
    sub.stop(now + 0.5);

    const body = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const bodyG = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(180, now);
    body.frequency.exponentialRampToValueAtTime(64, now + 0.12);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, now);

    bodyG.gain.setValueAtTime(0.001, now);
    bodyG.gain.linearRampToValueAtTime(heavy ? 0.24 : 0.15, now + 0.008);
    bodyG.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    body.connect(filter);
    filter.connect(bodyG);
    bodyG.connect(this.bgmGain);
    body.start(now);
    body.stop(now + 0.2);
  }

  private startRenderedBgmBuffer(buf: AudioBuffer): void {
    if (!this.ctx || !this.bgmGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.bgmGain);
    src.start(0);
    this.bgmNodes.push(src);
  }

  private startLiveFallbackOscBgm(mood: BgmMood): void {
    if (!this.ctx || !this.bgmGain) return;
    const ctx = this.ctx;

    const baseFreqs =
      mood === 'eerie_horror'
        ? [65.41, 98.0]
        : mood === 'epic_drums'
          ? [73.42, 110.0, 146.83]
          : mood === 'serene_flute'
            ? [130.81, 196.0, 261.63]
            : [138.59, 207.65, 277.18];

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = mood === 'eerie_horror' ? 240 : 460;
    filter.Q.value = 1.2;
    filter.connect(this.bgmGain);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.16;
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.bgmNodes.push(filter, lfo, lfoGain);

    for (let i = 0; i < baseFreqs.length; i++) {
      const detunes = i === 0 ? [-3, 3] : [0];
      for (const detune of detunes) {
        const osc = ctx.createOscillator();
        osc.type = i === baseFreqs.length - 1 ? 'triangle' : 'sine';
        osc.frequency.value = baseFreqs[i];
        osc.detune.value = detune;
        const oscGain = ctx.createGain();
        oscGain.gain.value = i === 0 ? 0.14 : 0.095;
        osc.connect(oscGain);
        oscGain.connect(filter);
        osc.start();
        this.bgmNodes.push(osc, oscGain);
      }
    }

    this.bgmStep = 0;
    const scaleNotes =
      mood === 'eerie_horror'
        ? [293.66, 311.13, 277.18, 220.0, 246.94]
        : mood === 'epic_drums'
          ? [293.66, 329.63, 392.0, 440.0, 587.33, 440.0]
          : mood === 'serene_flute'
            ? [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25]
            : [415.3, 466.16, 554.37, 622.25, 554.37, 466.16];

    const intervalMs = mood === 'epic_drums' ? 620 : mood === 'eerie_horror' ? 1350 : 900;
    this.bgmLoopTimer = setInterval(() => {
      if (!this.bgmEnabledFlag) return;
      const step = this.bgmStep++;
      if (mood === 'epic_drums') {
        if (step % 4 === 0) this.playTaikoPulse(true);
        else if (step % 2 === 1) this.playTaikoPulse(false);
      }
      if (mood === 'eerie_horror') {
        if (step % 2 === 0) {
          this.playExpressiveNote(scaleNotes[step % scaleNotes.length], 2.4, 0.15, 'sine', 0.25, true);
        }
      } else if (step % 3 !== 2) {
        const freq = scaleNotes[step % scaleNotes.length];
        this.playExpressiveNote(
          freq,
          mood === 'serene_flute' ? 1.65 : 1.25,
          mood === 'epic_drums' ? 0.13 : 0.15,
          mood === 'serene_flute' ? 'sine' : 'triangle',
          0.11,
          mood === 'serene_flute' || mood === 'devotional_tanpura'
        );
      }
    }, intervalMs);
  }

  public startBgm(mood: BgmMood, enabled: boolean, voicePlaying = false): void {
    this.clearStopAfterFadeTimer();
    this.stopBgm();
    const sessionSeq = ++this.bgmSessionSeq;
    const ctx = this.ensureContext();
    if (!this.bgmGain) return;
    this.bgmEnabledFlag = enabled;
    this.voiceActiveFlag = voicePlaying;
    this.bgmGain.gain.setValueAtTime(this.getTargetBgmLevel(), ctx.currentTime);
    if (this.bgmVocalCarve) {
      this.bgmVocalCarve.gain.setValueAtTime(voicePlaying ? -4.5 : 0, ctx.currentTime);
    }

    if (this.cachedBgmBuffer) {
      this.startRenderedBgmBuffer(this.cachedBgmBuffer);
      return;
    }

    const renderedMood = this.moodBgmCache.get(mood);
    if (renderedMood) {
      this.startRenderedBgmBuffer(renderedMood);
      return;
    }

    // Start immediate live backing while rich stereo OfflineAudioContext loop renders (~40ms), then cross-swap cleanly
    this.startLiveFallbackOscBgm(mood);
    void this.preloadMoodBgm(mood).then((buf) => {
      if (!buf || sessionSeq !== this.bgmSessionSeq || !this.ctx || !this.bgmGain) return;
      this.stopBgmNodesOnly();
      this.startRenderedBgmBuffer(buf);
    });
  }

  private stopBgmNodesOnly(): void {
    if (this.bgmLoopTimer) {
      clearInterval(this.bgmLoopTimer);
      this.bgmLoopTimer = null;
    }
    for (const node of this.bgmNodes) {
      if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
        try {
          (node as OscillatorNode).stop();
        } catch {
          // ignore
        }
      }
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.bgmNodes = [];
  }

  public stopBgm(): void {
    this.bgmSessionSeq++;
    this.stopBgmNodesOnly();
  }

  public startVoiceFromOffset(offsetSec: number): void {
    this.clearStopAfterFadeTimer();
    this.stopVoice();
    if (!this.cachedBuffer || !this.voiceGain) return;
    const ctx = this.ensureContext();
    if (this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
      this.masterGain.gain.setValueAtTime(0.95, ctx.currentTime);
    }
    const safeOffset = Math.max(0, offsetSec);
    if (safeOffset >= this.cachedBuffer.duration) return;

    this.voiceActiveFlag = true;
    this.updateBgmGain();

    const src = ctx.createBufferSource();
    src.buffer = this.cachedBuffer;
    src.connect(this.voiceGain);
    this.voiceEndCtxTime = ctx.currentTime + Math.max(0, this.cachedBuffer.duration - safeOffset);
    src.onended = () => {
      if (this.voiceSource === src) {
        this.voiceSource = null;
        this.voiceActiveFlag = false;
        this.voiceEndCtxTime = 0;
        this.updateBgmGain();
      }
    };
    src.start(0, safeOffset);
    this.voiceSource = src;
  }

  public fadeMasterOut(fadeDurationSec = 0.22): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, now + fadeDurationSec);
  }

  public fadeOutAndStop(fadeDurationSec = 0.2): void {
    this.clearStopAfterFadeTimer();
    this.fadeMasterOut(fadeDurationSec);
    this.stopAfterFadeTimer = setTimeout(() => {
      this.stopAfterFadeTimer = null;
      this.stopAll();
    }, Math.round((fadeDurationSec + 0.04) * 1000));
  }

  public stopVoice(): void {
    this.voiceActiveFlag = false;
    this.voiceEndCtxTime = 0;
    this.updateBgmGain();
    if (this.voiceSource) {
      const stale = this.voiceSource;
      this.voiceSource = null;
      stale.onended = null;
      try {
        stale.stop();
      } catch {
        // ignore
      }
      try {
        stale.disconnect();
      } catch {
        // ignore
      }
    }
  }

  public triggerSfx(cue: SfxCue): void {
    if (cue === 'none') return;
    const ctx = this.ensureContext();
    if (!this.sfxGain) return;
    const now = ctx.currentTime;

    if (cue === 'temple_bell') {
      const partials = [
        { freq: 432, amp: 0.22, dur: 2.6 },
        { freq: 864, amp: 0.14, dur: 2.1 },
        { freq: 1188, amp: 0.09, dur: 1.6 },
        { freq: 1742, amp: 0.05, dur: 1.1 },
      ];
      partials.forEach((p) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.freq, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(p.amp, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0008, now + p.dur);
        osc.connect(g);
        g.connect(this.sfxGain!);
        osc.start(now);
        osc.stop(now + p.dur + 0.05);
      });
    } else if (cue === 'bansuri_flute') {
      const notes = [392, 440, 523.25, 587.33];
      notes.forEach((freq, i) => {
        const startAt = now + i * 0.22;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 0.94, startAt);
        osc.frequency.exponentialRampToValueAtTime(freq, startAt + 0.08);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, startAt);

        g.gain.setValueAtTime(0.001, startAt);
        g.gain.linearRampToValueAtTime(0.14, startAt + 0.07);
        g.gain.exponentialRampToValueAtTime(0.001, startAt + 0.48);
        osc.connect(filter);
        filter.connect(g);
        g.connect(this.sfxGain!);
        osc.start(startAt);
        osc.stop(startAt + 0.52);
      });
    } else if (cue === 'conch_shankh') {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(174, now);
      osc.frequency.linearRampToValueAtTime(198, now + 0.35);
      osc.frequency.linearRampToValueAtTime(192, now + 1.5);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(520, now);
      filter.Q.value = 2.4;

      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.24, now + 0.28);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.9);
      osc.connect(filter);
      filter.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 1.95);
    } else if (cue === 'thunder_rumble' || cue === 'night_wind') {
      const bufferSize = Math.floor(ctx.sampleRate * 2.2);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.045 * white) / 1.045;
        output[i] = Math.max(-1, Math.min(1, lastOut * 3.2));
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      if (cue === 'thunder_rumble') {
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(190, now);
        filter.frequency.exponentialRampToValueAtTime(58, now + 1.9);
      } else {
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(280, now);
        filter.frequency.linearRampToValueAtTime(560, now + 0.9);
        filter.frequency.linearRampToValueAtTime(260, now + 2.0);
        filter.Q.value = 1.6;
      }

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(cue === 'thunder_rumble' ? 0.55 : 0.26, now + 0.22);
      g.gain.exponentialRampToValueAtTime(0.001, now + 2.05);

      noiseSrc.connect(filter);
      filter.connect(g);
      g.connect(this.sfxGain);
      noiseSrc.start(now);
      noiseSrc.stop(now + 2.1);
    }
  }

  public stopAll(): void {
    this.clearStopAfterFadeTimer();
    this.stopVoice();
    this.stopBgm();
  }
}
