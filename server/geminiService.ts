import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  analyzeAndMatchStoryArt,
  buildSplitSceneHalves,
  concatenateWavClipsWithActDurations,
  findSceneArtById,
  formatInstagramHashtags,
  getFormatSpec,
  getRecommendedScenePlan,
  getSceneArtCatalog,
  getTopicConfig,
  isCustomUploadedFrameUrl,
  matchStoryScenesToArt,
  parseWavDurationSecondsFromBytes,
  resolveTopicAnimeSceneImage,
  sanitizeYouTubeTags,
  scaleScenesToAudioDuration,
  scaleScenesWithinActDurations,
  type SplitSceneSuggestion,
} from '../src/lib/studioLogic';
import type {
  PrebuiltVoiceName,
  SceneShotType,
  StoryPacingMode,
  StoryProject,
  StoryScene,
  StoryTopic,
  VideoFormat,
  VoiceTone,
} from '../src/lib/types';

export class GeminiServiceError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function getClient(apiVersion?: 'v1beta' | 'v1alpha'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiServiceError(
      400,
      'Gemini API key is not configured in environment secrets. Please set GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(apiVersion ? { apiVersion } : {}),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function mapGeminiError(err: unknown, fallbackMessage: string): GeminiServiceError {
  if (err instanceof GeminiServiceError) return err;
  const msg = err instanceof Error ? err.message : fallbackMessage;
  const status =
    msg.includes('403') || msg.includes('API_KEY_INVALID')
      ? 403
      : msg.includes('429')
        ? 429
        : msg.includes('503') || msg.includes('UNAVAILABLE')
          ? 503
          : msg.includes('404')
            ? 404
            : 500;
  return new GeminiServiceError(status, msg);
}

async function runWithTransientRetry<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  const delays = [1200, 2400, 4000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, label);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('timed out');
      if (!isTransient || attempt === delays.length) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

export interface GenerateStoryInput {
  topic: StoryTopic;
  format: VideoFormat;
  tone: VoiceTone;
  voiceName: PrebuiltVoiceName;
  customInstruction?: string;
  pacingMode?: StoryPacingMode;
  partNumber?: number;
  totalParts?: number;
  seriesId?: string;
  previousPartSummary?: string;
}

export async function generateStoryWithGemini(
  input: GenerateStoryInput
): Promise<StoryProject> {
  const ai = getClient('v1beta');
  const topicCfg = getTopicConfig(input.topic);
  const formatCfg = getFormatSpec(input.format);
  const pacingMode: StoryPacingMode =
    input.pacingMode ?? (input.format === 'youtube_long' ? 'standard' : 'fast_30s');
  const plan = getRecommendedScenePlan(input.format, pacingMode);
  const sceneCount = plan.sceneCount;
  const targetPerSceneSec = plan.targetPerSceneSec;
  const totalParts = Math.max(1, Math.min(5, Math.round(input.totalParts ?? 1)));
  const partNumber = Math.max(1, Math.min(totalParts, Math.round(input.partNumber ?? 1)));
  const isMultiPartSeries = totalParts > 1;
  const hasMorePartsAfter = isMultiPartSeries && partNumber < totalParts;

  const sameTopicCatalog = getSceneArtCatalog(input.topic).filter((a) => a.topic === input.topic);
  const extraCatalog =
    input.topic === 'horror'
      ? []
      : getSceneArtCatalog(input.topic)
          .filter((a) => a.topic === 'hindu_gods' && a.topic !== input.topic)
          .slice(0, 3);
  const topicArtOptions = [...sameTopicCatalog.slice(0, 18), ...extraCatalog]
    .map((a) => `- "${a.id}": ${a.description}`)
    .join('\n');

  const multiPartRules = isMultiPartSeries
    ? hasMorePartsAfter
      ? `MULTI-PART SERIES RULE (CRITICAL): This is PART ${partNumber} of a ${totalParts}-part episodic story! Build rising suspense across scenes 1..${sceneCount - 1} and end the final scene (${sceneCount}) on a gripping Hindi cliffhanger (e.g., "...आगे क्या हुआ जानने के लिए Part ${partNumber + 1} देखें!"). Populate \`cliffhangerHindi\` and write a detailed plot continuation instruction in \`nextPartPrompt\` so Part ${partNumber + 1} picks up seamlessly.`
      : `MULTI-PART FINALE RULE: This is the FINAL PART (Part ${partNumber} of ${totalParts}) continuing directly from the previous cliffhanger. Resolve all suspense and deliver an emotional/satisfying climax + ending.`
    : 'Single complete episode with a clear Beginning (आरंभ), Middle (मध्य / चरम), and Ending (समापन / संदेश).';

  const systemInstruction = [
    'You are a master Hindi anime storyteller and top viral YouTube Shorts / Instagram Reels scriptwriter.',
    'STORYLINE CRAFT (CRITICAL): Write gripping, emotional, high-retention spoken Hindi (Devanagari script) — conversational, vivid, full of dramatic tension, named characters, and sensory emotion (NOT dry textbook summaries).',
    'Narrative Arc: (1) Opening 3s hook question or shocking reveal immediately in Scene 1, (2) Escalating conflict with rising stakes in early scenes, (3) Unexpected miracle, twist, or intense confrontation in middle climax scenes, (4) Unforgettable emotional payoff or breathless cliffhanger at the end.',
    multiPartRules,
    `Target video format: ${formatCfg.label} (${formatCfg.aspect}, STRICTLY ~${plan.targetDurationSec}s total) styled as theatrical Indian mythological/horror anime.`,
    `Create EXACTLY ${sceneCount} fast-paced sequential anime frames (~${targetPerSceneSec}s per frame so visuals stay dynamic and never linger too long!).`,
    pacingMode === 'fast_30s'
      ? `30-SECOND ${sceneCount}-FRAME PACING: Write 6-9 vivid spoken Hindi words per frame (~68-82 spoken words total across all ${sceneCount} frames) using natural commas (,) and pauses (—) so Hindi TTS finishes cleanly in ~30-34 seconds while showing ${sceneCount} distinct story-matched anime pictures!`
      : `Keep each frame's narrationHindi crisp and expressive (9-14 spoken Hindi words per frame across ${sceneCount} frames) with natural commas and pauses for rhythmic voiceover delivery.`,
    'Scene 1 MUST be a high-impact character hook close-up (`shotType: "character_hook"`) with a 3-5 word Hindi `hookCaption` that freezes viewers in the first 3 seconds.',
    'STRICT 1:1 AUDIO-TO-IMAGE MATCHING (CRITICAL): Pick `sceneArtId` ONLY when its image ACTUALLY depicts the characters/action in your scene (`narrationHindi` & `visualPrompt`). NEVER assign Kansa/Kaliya/Radha-farewell/Kevat/Shiva-bow art to unrelated stories! Always assign distinct `sceneArtId` values without repeating the same ID twice, and use `"custom"` if you write a new visual moment not listed above.',
    'Also generate click-worthy YouTube SEO metadata (include Part number in title if multi-part) and Instagram Reel caption + hashtags.',
  ].join(' ');

  const userPrompt = [
    `Topic Genre: ${topicCfg.label} (${topicCfg.labelHindi})`,
    `Narration Tone: ${input.tone.replace('_', ' ')}`,
    isMultiPartSeries ? `Episode: Part ${partNumber} of ${totalParts}` : 'Episode: Complete Story',
    input.previousPartSummary?.trim()
      ? `Previous Part Cliffhanger & Story Context to Continue From:\n${input.previousPartSummary.trim()}`
      : '',
    input.customInstruction?.trim()
      ? `Creator Specific Instruction: ${input.customInstruction.trim()}`
      : 'Creator Instruction: Choose a fresh, unique, lesser-known or deeply emotional episode that hooks viewers in the first 3 seconds.',
    '',
    'Available Pre-Rendered Anime Scene Catalog (use distinct matching IDs or "custom" for bespoke scenes):',
    topicArtOptions,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await runWithTransientRetry(
      () =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: userPrompt,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'Short compelling English title' },
                titleHindi: { type: Type.STRING, description: 'Compelling Hindi Devanagari title' },
                beginning: { type: Type.STRING, description: 'Beginning paragraph in Hindi Devanagari' },
                middle: { type: Type.STRING, description: 'Middle climax paragraph in Hindi Devanagari' },
                ending: { type: Type.STRING, description: 'Ending resolution or cliffhanger paragraph in Hindi Devanagari' },
                cliffhangerHindi: {
                  type: Type.STRING,
                  description: 'Optional gripping Hindi cliffhanger teaser line if multi-part Part 1/2',
                },
                nextPartPrompt: {
                  type: Type.STRING,
                  description: 'Plot summary & continuation prompt for generating the next Part if multi-part',
                },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      part: { type: Type.STRING, description: 'One of: beginning, middle, ending' },
                      shotType: {
                        type: Type.STRING,
                        description: 'One of: character_hook, wide_establishing, climax_closeup, resolution_vista',
                      },
                      sceneArtId: {
                        type: Type.STRING,
                        description: 'Exact matching ID from the catalog or "custom"',
                      },
                      hookCaption: {
                        type: Type.STRING,
                        description: 'Punchy 3-5 word Hindi hook callout (required for Scene 1)',
                      },
                      narrationHindi: { type: Type.STRING, description: 'Hindi voiceover narration for this scene' },
                      subtitleHindi: { type: Type.STRING, description: 'Short Hindi caption line for video overlay' },
                      visualPrompt: {
                        type: Type.STRING,
                        description: 'Distinct character & environment visual frame description in English',
                      },
                      sfxCue: {
                        type: Type.STRING,
                        description: 'One of: temple_bell, bansuri_flute, conch_shankh, thunder_rumble, night_wind, none',
                      },
                      cameraMotion: {
                        type: Type.STRING,
                        description: 'One of: zoom-in, zoom-out, pan-left, pan-right',
                      },
                      durationSec: { type: Type.INTEGER, description: 'Scene duration in seconds (3 to 20)' },
                    },
                    required: [
                      'part',
                      'shotType',
                      'sceneArtId',
                      'narrationHindi',
                      'subtitleHindi',
                      'visualPrompt',
                      'sfxCue',
                      'cameraMotion',
                      'durationSec',
                    ],
                  },
                },
                youtube: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    thumbnailHeadline: { type: Type.STRING },
                  },
                  required: ['title', 'description', 'tags', 'thumbnailHeadline'],
                },
                instagram: {
                  type: Type.OBJECT,
                  properties: {
                    caption: { type: Type.STRING },
                    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    hookLine: { type: Type.STRING },
                  },
                  required: ['caption', 'hashtags', 'hookLine'],
                },
              },
              required: ['title', 'titleHindi', 'beginning', 'middle', 'ending', 'scenes', 'youtube', 'instagram'],
            },
          },
        }),
      50000,
      'generateStoryWithGemini'
    );

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new GeminiServiceError(502, 'Gemini returned an empty response while generating the story.');
    }

    const parsed = JSON.parse(rawText);
    const now = new Date().toISOString();
    const id = `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const validParts = new Set(['beginning', 'middle', 'ending']);
    const validShots = new Set<SceneShotType>([
      'character_hook',
      'wide_establishing',
      'climax_closeup',
      'resolution_vista',
    ]);
    const validSfx = new Set([
      'temple_bell',
      'bansuri_flute',
      'conch_shankh',
      'thunder_rumble',
      'night_wind',
      'none',
    ]);
    const validMotions = new Set(['zoom-in', 'zoom-out', 'pan-left', 'pan-right']);

    const usedArtIds = new Set<string>();
    const rawScenes: StoryScene[] = (Array.isArray(parsed.scenes) ? parsed.scenes : []).map(
      (s: Record<string, unknown>, idx: number) => {
        const defaultShot: SceneShotType =
          idx === 0
            ? 'character_hook'
            : idx === parsed.scenes.length - 1
              ? 'resolution_vista'
              : idx % 2 === 1
                ? 'climax_closeup'
                : 'wide_establishing';
        const parsedShot = String(s.shotType || '') as SceneShotType;
        const rawArtId = String(s.sceneArtId || '').trim();
        const catalogHit =
          rawArtId && rawArtId !== 'custom' && !usedArtIds.has(rawArtId)
            ? findSceneArtById(rawArtId)
            : undefined;
        if (catalogHit) usedArtIds.add(catalogHit.id);

        return {
          id: `${id}-sc-${idx + 1}`,
          part: (validParts.has(String(s.part))
            ? String(s.part)
            : idx === 0
              ? 'beginning'
              : idx === parsed.scenes.length - 1
                ? 'ending'
                : 'middle') as 'beginning' | 'middle' | 'ending',
          shotType: validShots.has(parsedShot) ? parsedShot : defaultShot,
          sceneArtId: rawArtId || undefined,
          hookCaption:
            idx === 0
              ? String(s.hookCaption || parsed.instagram?.hookLine || parsed.titleHindi || '')
              : s.hookCaption
                ? String(s.hookCaption)
                : undefined,
          narrationHindi: String(s.narrationHindi || ''),
          subtitleHindi: String(s.subtitleHindi || s.narrationHindi || ''),
          visualPrompt: String(s.visualPrompt || topicCfg.label),
          sfxCue: (validSfx.has(String(s.sfxCue)) ? String(s.sfxCue) : 'none') as StoryScene['sfxCue'],
          cameraMotion: (validMotions.has(String(s.cameraMotion))
            ? String(s.cameraMotion)
            : 'zoom-in') as StoryScene['cameraMotion'],
          durationSec: Math.max(3, Math.min(25, Number(s.durationSec) || targetPerSceneSec)),
          imageUrl: catalogHit?.url,
        };
      }
    );

    const titleStr = String(parsed.title || `${topicCfg.label} Story`);
    const titleHindiStr = String(parsed.titleHindi || topicCfg.labelHindi);

    // Run semantic story-to-art matcher on any scenes that didn't get an explicit unique catalog hit
    const semanticAnalysis = analyzeAndMatchStoryArt({
      topic: input.topic,
      title: titleStr,
      titleHindi: titleHindiStr,
      scenes: rawScenes,
    });

    const scenes: StoryScene[] = rawScenes.map((sc, idx) => ({
      ...sc,
      imageUrl: sc.imageUrl || semanticAnalysis.scenes[idx]?.imageUrl || resolveTopicAnimeSceneImage(input.topic, idx, rawScenes.length, 0),
    }));

    const totalSec = scenes.reduce((sum, s) => sum + s.durationSec, 0);
    const resolvedSeriesId = isMultiPartSeries
      ? input.seriesId || `series-${Date.now().toString(36)}`
      : undefined;

    return {
      id,
      title: titleStr,
      titleHindi: titleHindiStr,
      topic: input.topic,
      format: input.format,
      pacingMode,
      seriesId: resolvedSeriesId,
      partNumber,
      totalParts,
      cliffhangerHindi: parsed.cliffhangerHindi ? String(parsed.cliffhangerHindi) : undefined,
      nextPartPrompt: parsed.nextPartPrompt ? String(parsed.nextPartPrompt) : undefined,
      visualStyle: 'anime',
      artVersion: 2,
      tone: input.tone,
      voiceName: input.voiceName,
      bgmMood: topicCfg.defaultBgm,
      customInstruction: input.customInstruction?.trim() || '',
      beginning: String(parsed.beginning || ''),
      middle: String(parsed.middle || ''),
      ending: String(parsed.ending || ''),
      scenes,
      audioUrl: null,
      audioDurationSec: totalSec,
      youtube: {
        title: String(parsed.youtube?.title || parsed.titleHindi || parsed.title),
        description: String(parsed.youtube?.description || ''),
        tags: sanitizeYouTubeTags(Array.isArray(parsed.youtube?.tags) ? parsed.youtube.tags : []),
        thumbnailHeadline: String(parsed.youtube?.thumbnailHeadline || parsed.titleHindi || ''),
        category: input.topic === 'horror' ? 'Entertainment' : 'Education',
      },
      instagram: {
        caption: String(parsed.instagram?.caption || ''),
        hashtags: formatInstagramHashtags(
          Array.isArray(parsed.instagram?.hashtags) ? parsed.instagram.hashtags : []
        ),
        hookLine: String(parsed.instagram?.hookLine || parsed.titleHindi || ''),
      },
      status: 'draft',
      scheduledFor: null,
      publishedChannels: [],
      metrics: {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        estimatedIncomeInr: 0,
      },
      createdAt: now,
      updatedAt: now,
    };
  } catch (err: unknown) {
    throw mapGeminiError(err, 'Failed to generate story with Gemini');
  }
}

export async function splitSceneWithGemini(params: {
  storyTitle: string;
  topic: StoryTopic;
  scene: StoryScene;
  usedArtIds: string[];
}): Promise<[StoryScene, StoryScene]> {
  const { storyTitle, topic, scene, usedArtIds } = params;
  const topicPool = getSceneArtCatalog(topic).filter(
    (a) => a.topic === topic || (topic === 'hindu_gods' && a.topic !== 'horror')
  );
  const catalogOptions = topicPool
    .slice(0, 12)
    .map((a) => `- "${a.id}": ${a.description}${usedArtIds.includes(a.id) ? ' (already used elsewhere)' : ''}`)
    .join('\n');

  try {
    const ai = getClient('v1beta');
    const systemInstruction = [
      'You are a Hindi anime video pacing editor.',
      'Your task is to divide ONE story scene into TWO shorter, fast-paced visual segments (~10-15s each when long, or balanced halves).',
      'Divide the Hindi narration cleanly across `firstHalf` and `secondHalf` without losing story meaning.',
      'CRITICAL: Write TWO VERY GRANULAR, DISTINCT English `visualPrompt` image prompts — `firstHalf` should show the setup/moment-1 framing (e.g., character entering, hand reaching, close-up emotion) and `secondHalf` MUST show the distinct action/reaction/reveal beat (e.g., dramatic shift, glowing prop, zoomed-in consequence).',
      'Assign two DIFFERENT unused `sceneArtId` values ONLY from the provided same-topic catalog list, or `"custom"` so unique bespoke anime artwork can be rendered.',
    ].join(' ');

    const userPrompt = [
      `Story Title: ${storyTitle}`,
      `Genre: ${topic}`,
      `Scene Part: ${scene.part} (${scene.durationSec}s)`,
      `Original Hindi Narration: ${scene.narrationHindi}`,
      `Original Subtitle: ${scene.subtitleHindi}`,
      `Original Visual Prompt: ${scene.visualPrompt}`,
      '',
      'Catalog Art Options:',
      catalogOptions,
    ].join('\n');

    const halfSchema = {
      type: Type.OBJECT,
      properties: {
        narrationHindi: { type: Type.STRING },
        subtitleHindi: { type: Type.STRING },
        visualPrompt: { type: Type.STRING },
        shotType: {
          type: Type.STRING,
          description: 'One of: character_hook, wide_establishing, climax_closeup, resolution_vista',
        },
        cameraMotion: {
          type: Type.STRING,
          description: 'One of: zoom-in, zoom-out, pan-left, pan-right',
        },
        sceneArtId: { type: Type.STRING },
      },
      required: ['narrationHindi', 'subtitleHindi', 'visualPrompt', 'shotType', 'cameraMotion', 'sceneArtId'],
    };

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              firstHalf: halfSchema,
              secondHalf: halfSchema,
            },
            required: ['firstHalf', 'secondHalf'],
          },
        },
      }),
      12000,
      'splitSceneWithGemini'
    );

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      return buildSplitSceneHalves(scene);
    }

    const parsed = JSON.parse(rawText) as SplitSceneSuggestion;
    return buildSplitSceneHalves(scene, parsed);
  } catch {
    return buildSplitSceneHalves(scene);
  }
}

export async function generateDistinctSceneFrames(
  story: StoryProject,
  shuffleOffset = 0
): Promise<StoryScene[]> {
  if (shuffleOffset === 0) {
    return matchStoryScenesToArt(story, { preserveCustomUploads: true });
  }

  const catalog = getSceneArtCatalog(story.topic).filter((a) => a.topic === story.topic);
  const pool = catalog.length >= story.scenes.length ? catalog : getSceneArtCatalog(story.topic);

  return story.scenes.map((scene, idx) => {
    if (isCustomUploadedFrameUrl(scene.imageUrl) && scene.imageUrl) {
      return scene;
    }
    const asset = pool[(idx + shuffleOffset) % pool.length];
    return {
      ...scene,
      sceneArtId: asset.id,
      imageUrl: asset.url,
    };
  });
}

function sanitizeSvgMarkup(raw: string, width: number, height: number): string {
  let cleaned = raw
    .replace(/^```(?:svg|xml|html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const svgMatch = cleaned.match(/<svg[\s\S]*<\/svg>/i);
  if (!svgMatch) {
    throw new GeminiServiceError(502, 'Gemini did not return valid SVG anime artwork.');
  }
  cleaned = svgMatch[0];

  // Strip unsafe or external elements so HTML5 <img> draws cleanly without tainting <canvas>
  cleaned = cleaned
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<text[\s\S]*?<\/text>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '');

  // Ensure explicit xmlns, viewBox, width, height for crisp canvas rasterization
  cleaned = cleaned.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    let nextAttrs = attrs;
    if (!/xmlns=/i.test(nextAttrs)) {
      nextAttrs += ' xmlns="http://www.w3.org/2000/svg"';
    }
    if (!/viewBox=/i.test(nextAttrs)) {
      nextAttrs += ` viewBox="0 0 ${width} ${height}"`;
    }
    if (!/\bwidth=/i.test(nextAttrs)) {
      nextAttrs += ` width="${width}"`;
    }
    if (!/\bheight=/i.test(nextAttrs)) {
      nextAttrs += ` height="${height}"`;
    }
    return `<svg${nextAttrs}>`;
  });

  return cleaned;
}

export function buildTopicAnimeSvgFallback(
  topic: StoryTopic,
  format: VideoFormat,
  sceneIndex: number
): string {
  const formatCfg = getFormatSpec(format);
  const w = formatCfg.aspect === '9:16' ? 1080 : 1920;
  const h = formatCfg.aspect === '9:16' ? 1920 : 1080;

  const palettes: Record<StoryTopic, { skyTop: string; skyMid: string; skyBot: string; glow: string; hill: string; ridge: string; accent: string }> = {
    krishna: { skyTop: '#081024', skyMid: '#172554', skyBot: '#1E40AF', glow: '#FDE047', hill: '#0F172A', ridge: '#1E293B', accent: '#60A5FA' },
    ramayana: { skyTop: '#1A0F0A', skyMid: '#7C2D12', skyBot: '#C2410C', glow: '#FDBA74', hill: '#1C1917', ridge: '#431407', accent: '#FDE047' },
    mahabharata: { skyTop: '#160B0F', skyMid: '#7F1D1D', skyBot: '#B91C1C', glow: '#F59E0B', hill: '#18181B', ridge: '#3F1D2B', accent: '#FCA5A5' },
    horror: { skyTop: '#020617', skyMid: '#0F172A', skyBot: '#1E1B4B', glow: '#38BDF8', hill: '#050811', ridge: '#0F172A', accent: '#F87171' },
    hindu_gods: { skyTop: '#140F2D', skyMid: '#4C1D95', skyBot: '#7E22CE', glow: '#FDE047', hill: '#110D24', ridge: '#2E1065', accent: '#FDBA74' },
  };
  const p = palettes[topic] || palettes.krishna;
  const cx = Math.round(w * (0.36 + ((sceneIndex % 3) * 0.14)));
  const cy = Math.round(h * 0.34);
  const r = Math.round(Math.min(w, h) * 0.16);
  const horizonY = Math.round(h * 0.68);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    '<defs>',
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.skyTop}"/><stop offset="55%" stop-color="${p.skyMid}"/><stop offset="100%" stop-color="${p.skyBot}"/></linearGradient>`,
    `<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${p.glow}" stop-opacity="0.92"/><stop offset="45%" stop-color="${p.glow}" stop-opacity="0.28"/><stop offset="100%" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.glow}" stop-opacity="0.18"/><stop offset="100%" stop-color="${p.hill}" stop-opacity="0.95"/></linearGradient>`,
    '</defs>',
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r * 2.6}" fill="url(#halo)"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${Math.round(r * 0.58)}" fill="${p.glow}" opacity="0.92"/>`,
    `<polygon points="${Math.round(w * 0.15)},${horizonY} ${Math.round(w * 0.5)},${Math.round(h * 0.44)} ${Math.round(w * 0.88)},${horizonY}" fill="${p.ridge}" opacity="0.72"/>`,
    `<path d="M0 ${horizonY + 40} Q ${Math.round(w * 0.28)} ${horizonY - 50} ${Math.round(w * 0.58)} ${horizonY + 25} T ${w} ${horizonY - 15} L ${w} ${h} L 0 ${h} Z" fill="${p.hill}"/>`,
    `<rect x="0" y="${horizonY - 20}" width="${w}" height="${h - horizonY + 20}" fill="url(#mist)" opacity="0.45"/>`,
    `<path d="M${cx - Math.round(r * 0.35)} ${Math.round(h * 0.76)} C ${cx - Math.round(r * 0.25)} ${Math.round(h * 0.50)}, ${cx + Math.round(r * 0.25)} ${Math.round(h * 0.50)}, ${cx + Math.round(r * 0.35)} ${Math.round(h * 0.76)} Z" fill="#060913" opacity="0.9"/>`,
    `<circle cx="${cx}" cy="${Math.round(h * 0.50)}" r="${Math.round(r * 0.17)}" fill="#060913" opacity="0.92"/>`,
    `<circle cx="${Math.round(w * 0.22)}" cy="${Math.round(h * 0.22)}" r="5" fill="${p.accent}" opacity="0.8"/>`,
    `<circle cx="${Math.round(w * 0.78)}" cy="${Math.round(h * 0.28)}" r="6" fill="${p.accent}" opacity="0.8"/>`,
    `<circle cx="${Math.round(w * 0.62)}" cy="${Math.round(h * 0.16)}" r="4" fill="${p.glow}" opacity="0.85"/>`,
    '</svg>',
  ].join('');
}

export async function generateCustomAnimeSceneSvgWithGemini(params: {
  topic: StoryTopic;
  format: VideoFormat;
  storyTitle: string;
  scene: StoryScene;
}): Promise<string> {
  const ai = getClient('v1beta');
  const formatCfg = getFormatSpec(params.format);
  const w = formatCfg.aspect === '9:16' ? 1080 : 1920;
  const h = formatCfg.aspect === '9:16' ? 1920 : 1080;

  const systemInstruction = [
    'You are an anime background & keyframe vector illustrator for theatrical Indian mythology and dark folk-horror anime.',
    `Output ONLY raw, self-contained SVG markup starting with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"> and ending with </svg>.`,
    'Craft rich, atmospheric cel-shaded vector anime scenes using layered <defs> linearGradient/radialGradient skies, mist overlays, glowing rim-light halos, expressive foreground silhouettes/characters, architecture/trees/props matching the EXACT scene prompt, and floating particles.',
    'STRICT PROHIBITIONS: NO markdown fences, NO <text> or letters anywhere in the SVG, NO <script>, NO <foreignObject>, NO external URLs.',
  ].join(' ');

  const userPrompt = [
    `Story Title: ${params.storyTitle}`,
    `Genre: ${params.topic}`,
    `Canvas Aspect: ${w}x${h}`,
    `Scene Hindi Narration (must match visuals!): ${params.scene.narrationHindi}`,
    `Visual Description: ${params.scene.visualPrompt}`,
    'Compose the exact characters, props, and mood described above so the viewer immediately sees what the narrator is speaking about.',
  ].join('\n');

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      15000,
      'generateCustomAnimeSceneSvgWithGemini'
    );
    const raw = (response.text ?? '').trim();
    return sanitizeSvgMarkup(raw, w, h);
  } catch (err: unknown) {
    throw mapGeminiError(err, 'Failed to generate bespoke AI scene visual');
  }
}

const TTS_STYLE_DIRECTIONS: Record<VoiceTone, string> = {
  devotional_warm:
    'Warm, deeply emotional, soulful Indian Hindi storyteller voice (Katha Vachak style), crisp Devanagari pronunciation, reverent expressive pauses on dramatic beats, heartfelt cadence',
  epic_dramatic:
    'Powerful, commanding, theatrical Hindi epic narrator voice, intense dramatic emphasis, clear crisp articulation, heroic cinematic energy',
  horror_suspense:
    'Low, eerie, spine-chilling Hindi horror storyteller voice, slow suspenseful pacing, tense hushed delivery before sudden reveals, crisp Hindi clarity',
  calm_storyteller:
    'Smooth, engaging, crystal-clear modern Hindi narrator voice, natural conversational warmth, expressive rhythmic pacing',
};

export async function generateHindiVoiceoverWithGemini(params: {
  textHindi: string;
  tone: VoiceTone;
  voiceName: PrebuiltVoiceName;
}): Promise<Buffer> {
  // v1beta is required for Gemini 3.8 TTS audio generation & speechMetadata
  const ai = getClient('v1beta');
  const trimmedText = params.textHindi.trim().replace(/\s+/g, ' ');
  const normalizedHindiText = /[।.!?]$/.test(trimmedText) ? trimmedText : `${trimmedText}।`;
  const styleDirection = TTS_STYLE_DIRECTIONS[params.tone] || TTS_STYLE_DIRECTIONS.devotional_warm;

  const callTtsModel = async (model: 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts') => {
    const partPayload = {
      text: normalizedHindiText,
      speechMetadata: {
        style: styleDirection,
      },
    };

    const response = await runWithTransientRetry(
      () =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [partPayload as Record<string, unknown>],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: params.voiceName,
                },
              },
            },
          },
        }),
      45000,
      `generateHindiVoiceoverWithGemini(${model})`
    );

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
    throw new GeminiServiceError(502, 'Gemini TTS returned no audio data.');
  };

  try {
    return await callTtsModel('gemini-3.8-flash-tts');
  } catch (primaryErr: unknown) {
    const status = primaryErr instanceof GeminiServiceError ? primaryErr.statusCode : 500;
    if (status === 400 || status === 403) {
      throw mapGeminiError(primaryErr, 'Failed to generate Hindi voiceover');
    }
    try {
      return await callTtsModel('gemini-3.8-flash-lite-tts');
    } catch (fallbackErr: unknown) {
      throw mapGeminiError(fallbackErr, 'Failed to generate Hindi voiceover');
    }
  }
}

function buildActScriptText(scenes: StoryScene[]): string {
  return scenes
    .map((s) => {
      const t = s.narrationHindi.trim().replace(/\s+/g, ' ');
      if (!t) return '';
      return /[।.!?]$/.test(t) ? t : `${t}।`;
    })
    .filter(Boolean)
    .join(' ');
}

export async function generateActSyncedHindiVoiceover(params: {
  scenes: StoryScene[];
  tone: VoiceTone;
  voiceName: PrebuiltVoiceName;
}): Promise<{ wavBuffer: Buffer; syncedScenes: StoryScene[]; totalDurationSec: number }> {
  const { scenes, tone, voiceName } = params;

  // Group contiguous scenes into Beginning / Middle / Ending acts for sample-accurate boundary sync
  const actGroups: StoryScene[][] = [];
  for (const sc of scenes) {
    const lastGroup = actGroups[actGroups.length - 1];
    if (!lastGroup || lastGroup[0].part !== sc.part) {
      actGroups.push([sc]);
    } else {
      lastGroup.push(sc);
    }
  }

  // Synthesize acts if we have 2-4 clean narrative groups; otherwise fallback to single clip
  if (actGroups.length >= 2 && actGroups.length <= 4) {
    try {
      const actClips: Buffer[] = [];
      for (const group of actGroups) {
        const script = buildActScriptText(group);
        if (!script) continue;
        const clip = await generateHindiVoiceoverWithGemini({
          textHindi: script,
          tone,
          voiceName,
        });
        actClips.push(clip);
      }

      if (actClips.length === actGroups.length) {
        const merged = concatenateWavClipsWithActDurations(
          actClips.map((b) => new Uint8Array(b)),
          0.14
        );
        const syncedScenes = scaleScenesWithinActDurations(actGroups, merged.actDurationsSec);
        return {
          wavBuffer: Buffer.from(merged.wavBytes),
          syncedScenes,
          totalDurationSec: Math.max(5, Math.ceil(merged.totalDurationSec)),
        };
      }
    } catch {
      // Fall back cleanly to single full-story clip below
    }
  }

  const fullScript = buildActScriptText(scenes);
  const wavBuffer = await generateHindiVoiceoverWithGemini({
    textHindi: fullScript,
    tone,
    voiceName,
  });
  const exactSec = parseWavDurationSecondsFromBytes(new Uint8Array(wavBuffer));
  const durationSec = Math.max(5, Math.ceil(exactSec));
  const syncedScenes = scaleScenesToAudioDuration(scenes, durationSec);
  return {
    wavBuffer,
    syncedScenes,
    totalDurationSec: durationSec,
  };
}

export async function transcribeAudioWithGemini(params: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType || 'audio/webm',
              data: params.audioBase64,
            },
          },
          {
            text: 'Transcribe this spoken audio accurately. If Hindi is spoken, transcribe naturally in Devanagari or Hinglish as clear story instructions.',
          },
        ],
      },
    });
    const text = (response.text ?? '').trim();
    if (!text) {
      throw new GeminiServiceError(502, 'No speech transcript was detected in the audio.');
    }
    return text;
  } catch (err: unknown) {
    throw mapGeminiError(err, 'Audio transcription failed');
  }
}
