import 'dotenv/config';
import { Modality, type LiveServerMessage } from '@google/genai';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  addIncomeEntry,
  addStory,
  deleteStory,
  getAudioDir,
  getFramesDir,
  getOAuthEnvStatus,
  getStoryById,
  getStudioState,
  getVideosDir,
  updateAccounts,
  updateAutomation,
  updateStory,
} from './server/store';
import {
  attachBiometricCredentialToUser,
  createWebAuthnChallenge,
  findCreatorUserByCredentialId,
  findCreatorUserById,
  findCreatorUserByIdentifier,
  issueSessionToken,
  listAllBiometricCredentialIds,
  upsertCreatorUser,
  verifyClientDataChallenge,
  verifyCreatorLogin,
  verifySessionToken,
} from './server/authStore';
import {
  buildTopicAnimeSvgFallback,
  GeminiServiceError,
  generateActSyncedHindiVoiceover,
  generateCustomAnimeSceneSvgWithGemini,
  generateDistinctSceneFrames,
  generateStoryWithGemini,
  getClient,
  splitSceneWithGemini,
  transcribeAudioWithGemini,
} from './server/geminiService';
import {
  analyzeAndMatchStoryArt,
  calculateTotalDuration,
  formatInstagramHashtags,
  getTopicConfig,
  matchStoryScenesToArt,
  pickBestUnusedCatalogAsset,
  sanitizeYouTubeTags,
  scaleScenesToAudioDuration,
  validateStoryStructure,
} from './src/lib/studioLogic';
import type {
  PrebuiltVoiceName,
  StoryPacingMode,
  StoryProject,
  StoryScene,
  StoryTopic,
  VideoFormat,
  VoiceTone,
} from './src/lib/types';

async function synthesizeAndAttachVoiceover(story: StoryProject): Promise<StoryProject> {
  const hasNarration = story.scenes.some((s) => s.narrationHindi.trim().length > 0);
  if (!hasNarration) {
    return story;
  }

  const { wavBuffer, syncedScenes, totalDurationSec } = await generateActSyncedHindiVoiceover({
    scenes: story.scenes,
    tone: story.tone,
    voiceName: story.voiceName,
  });

  const fileName = `${story.id}-${Date.now()}.wav`;
  const outPath = path.join(getAudioDir(), fileName);
  fs.writeFileSync(outPath, wavBuffer);

  return {
    ...story,
    scenes: syncedScenes,
    audioUrl: `/api/audio/${fileName}`,
    audioDurationSec: totalDurationSec,
    status: story.status === 'draft' ? 'voice_ready' : story.status,
  };
}

async function resolveStoryVisualFrames(
  story: StoryProject,
  preferCustomAiWhenExhausted: boolean
): Promise<StoryProject['scenes']> {
  const analysis = analyzeAndMatchStoryArt(
    {
      topic: story.topic,
      title: story.title,
      titleHindi: story.titleHindi,
      scenes: story.scenes,
    },
    { preserveCustomUploads: true }
  );

  const usedUrls = new Set<string>();
  const resolved = story.scenes.map((sc, idx) => {
    const isManualUpload = sc.sceneArtId === 'custom_upload' && sc.imageUrl?.startsWith('/api/frames/');
    const candidateUrl = isManualUpload ? sc.imageUrl! : analysis.scenes[idx]?.imageUrl || sc.imageUrl || '';
    if (candidateUrl && !candidateUrl.endsWith('.svg') && !usedUrls.has(candidateUrl)) {
      usedUrls.add(candidateUrl);
      return {
        ...sc,
        sceneArtId: analysis.scenes[idx]?.sceneArtId || sc.sceneArtId,
        imageUrl: candidateUrl,
      };
    }
    return {
      ...sc,
      imageUrl: isManualUpload && candidateUrl ? candidateUrl : '',
    };
  });

  // Fill any duplicate or missing slots with the highest-scoring unused painted anime JPG in the topic universe first
  const duplicateOrMissingIndices: number[] = [];
  for (let idx = 0; idx < resolved.length; idx++) {
    if (resolved[idx].imageUrl) continue;
    const unusedJpg = pickBestUnusedCatalogAsset(
      story.topic,
      resolved[idx],
      usedUrls,
      `${story.title || ''} ${story.titleHindi || ''}`
    );
    if (unusedJpg) {
      usedUrls.add(unusedJpg.url);
      resolved[idx] = {
        ...resolved[idx],
        sceneArtId: unusedJpg.id,
        imageUrl: unusedJpg.url,
      };
    } else {
      duplicateOrMissingIndices.push(idx);
    }
  }

  if (!preferCustomAiWhenExhausted || duplicateOrMissingIndices.length === 0) {
    return resolved;
  }

  // Only synthesize bespoke vector SVG frames when every painted JPG artwork in the universe has been used
  for (const idx of duplicateOrMissingIndices.slice(0, 3)) {
    const scene = resolved[idx];
    let svg: string;
    try {
      svg = await generateCustomAnimeSceneSvgWithGemini({
        topic: story.topic,
        format: story.format,
        storyTitle: story.titleHindi || story.title,
        scene,
      });
    } catch {
      svg = buildTopicAnimeSvgFallback(story.topic, story.format, idx);
    }
    const fileName = `${story.id}-ai-sc${idx + 1}-${Date.now()}.svg`;
    fs.writeFileSync(path.join(getFramesDir(), fileName), svg, 'utf8');
    const url = `/api/frames/${fileName}`;
    usedUrls.add(url);
    resolved[idx] = {
      ...scene,
      sceneArtId: 'custom_ai_svg',
      imageUrl: url,
    };
  }

  return resolved;
}

function resolveLocalImageAsBase64(imageUrl: string): { base64: string; mimeType: string } | null {
  try {
    let absPath: string | null = null;
    if (imageUrl.startsWith('/api/frames/')) {
      const name = path.basename(imageUrl.replace('/api/frames/', ''));
      absPath = path.join(getFramesDir(), name);
    } else if (imageUrl.startsWith('/src/assets/')) {
      absPath = path.resolve(process.cwd(), imageUrl.replace(/^\/+/, ''));
    }
    if (!absPath || !fs.existsSync(absPath)) return null;
    const ext = path.extname(absPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return {
      base64: fs.readFileSync(absPath).toString('base64'),
      mimeType,
    };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'publickey-credentials-create=(self), publickey-credentials-get=(self)'
    );
    next();
  });

  // Serve generated WAV/MP3 audio, scene frames, and Omni Flash videos (never fall through to SPA HTML on 404)
  app.use('/api/audio', express.static(getAudioDir()), (_req, res) => {
    res.status(404).json({ error: 'Audio file not found' });
  });
  app.use('/api/frames', express.static(getFramesDir()), (_req, res) => {
    res.status(404).json({ error: 'Frame image not found' });
  });
  app.use('/api/videos', express.static(getVideosDir()), (_req, res) => {
    res.status(404).json({ error: 'Video file not found' });
  });

  // Bootstrap full studio state (requires active creator session)
  app.get('/api/bootstrap', (req, res) => {
    try {
      const sessionHeader = String(req.headers['x-studio-session'] || '');
      const authHeader = String(req.headers.authorization || '');
      const token = sessionHeader.trim() || (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');
      const creator = verifySessionToken(token);
      if (!creator) {
        return res.status(401).json({ error: 'Login access required.' });
      }
      res.json(getStudioState());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load studio state' });
    }
  });

  // Generate AI story + distinct scene frames + Hindi AI voiceover WAV in one pipeline
  app.post('/api/stories/generate', async (req, res) => {
    try {
      const {
        topic,
        format,
        tone,
        voiceName,
        customInstruction,
        pacingMode,
        totalParts,
        partNumber,
        seriesId,
        previousPartSummary,
      } = req.body as {
        topic?: StoryTopic;
        format?: VideoFormat;
        tone?: VoiceTone;
        voiceName?: PrebuiltVoiceName;
        customInstruction?: string;
        pacingMode?: StoryPacingMode;
        totalParts?: number;
        partNumber?: number;
        seriesId?: string;
        previousPartSummary?: string;
      };

      const validTopics: StoryTopic[] = ['horror', 'ramayana', 'krishna', 'mahabharata', 'hindu_gods'];
      const validFormats: VideoFormat[] = ['youtube_short', 'instagram_reel', 'youtube_long'];

      if (!topic || !validTopics.includes(topic)) {
        return res.status(400).json({ error: 'Please select a valid story topic.' });
      }
      if (!format || !validFormats.includes(format)) {
        return res.status(400).json({ error: 'Please select a valid video format.' });
      }

      const topicCfg = getTopicConfig(topic);
      const effectivePacing: StoryPacingMode =
        pacingMode ?? (format === 'youtube_long' ? 'standard' : 'fast_30s');
      const baseStory = await generateStoryWithGemini({
        topic,
        format,
        tone: tone ?? topicCfg.defaultTone,
        voiceName: voiceName ?? 'Kore',
        customInstruction,
        pacingMode: effectivePacing,
        totalParts: totalParts ?? 1,
        partNumber: partNumber ?? 1,
        seriesId,
        previousPartSummary,
      });

      const validation = validateStoryStructure(baseStory);
      if (!validation.valid) {
        return res.status(422).json({ error: validation.errors.join(' ') });
      }

      // Match/synthesize distinct per-scene artwork first, then synthesize act-synced Hindi WAV cleanly without parallel API contention
      const matchedScenes = await resolveStoryVisualFrames(
        baseStory,
        Boolean(customInstruction?.trim()) || effectivePacing === 'fast_30s' || baseStory.scenes.length > 5
      );
      const storyWithArt: StoryProject = {
        ...baseStory,
        artVersion: 2,
        scenes: matchedScenes,
      };

      const finalStory = await synthesizeAndAttachVoiceover(storyWithArt);

      addStory(finalStory);
      res.status(201).json({ story: finalStory });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Story generation failed' });
    }
  });

  // Generate the next part of a multi-part episodic story
  app.post('/api/stories/:id/next-part', async (req, res) => {
    try {
      const existing = getStoryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Story not found' });
      }

      const currentPart = existing.partNumber ?? 1;
      const nextPart = currentPart + 1;
      const targetTotalParts = Math.min(3, Math.max(existing.totalParts ?? 2, nextPart));
      const seriesId = existing.seriesId || `series-${existing.id}`;

      if ((existing.totalParts ?? 1) < targetTotalParts || !existing.seriesId) {
        updateStory(existing.id, (curr) => ({
          ...curr,
          seriesId,
          partNumber: curr.partNumber ?? 1,
          totalParts: targetTotalParts,
        }));
      }

      const previousPartSummary = [
        `Previous Part (${currentPart} of ${targetTotalParts}) Title: ${existing.titleHindi} (${existing.title})`,
        `Beginning: ${existing.beginning}`,
        `Middle: ${existing.middle}`,
        `Ending / Cliffhanger: ${existing.cliffhangerHindi || existing.ending}`,
        existing.nextPartPrompt ? `Continuation Hook: ${existing.nextPartPrompt}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const baseNext = await generateStoryWithGemini({
        topic: existing.topic,
        format: existing.format,
        tone: existing.tone,
        voiceName: existing.voiceName,
        customInstruction: existing.customInstruction,
        pacingMode: existing.pacingMode ?? (existing.format === 'youtube_long' ? 'standard' : 'fast_30s'),
        partNumber: nextPart,
        totalParts: targetTotalParts,
        seriesId,
        previousPartSummary,
      });

      const matchedScenes = await resolveStoryVisualFrames(baseNext, true);
      const nextWithArt: StoryProject = {
        ...baseNext,
        artVersion: 2,
        scenes: matchedScenes,
      };
      const finalNextStory = await synthesizeAndAttachVoiceover(nextWithArt);

      addStory(finalNextStory);
      res.status(201).json({ story: finalNextStory });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Next part generation failed' });
    }
  });

  // Split a single scene into two shorter segments with granular image prompts & distinct artwork
  app.post('/api/stories/:id/scenes/:sceneIndex/split', async (req, res) => {
    try {
      const existing = getStoryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Story not found' });
      }
      const idx = Math.max(0, Math.min(existing.scenes.length - 1, Number(req.params.sceneIndex) || 0));
      const body = req.body as { sceneOverride?: StoryScene };
      const targetScene = body?.sceneOverride?.narrationHindi
        ? { ...existing.scenes[idx], ...body.sceneOverride }
        : existing.scenes[idx];

      const usedArtIds = existing.scenes
        .filter((_, i) => i !== idx)
        .map((s) => s.sceneArtId || '')
        .filter(Boolean);

      const [half1, half2] = await splitSceneWithGemini({
        storyTitle: existing.titleHindi || existing.title,
        topic: existing.topic,
        scene: targetScene,
        usedArtIds,
      });

      const nextScenesRaw = [
        ...existing.scenes.slice(0, idx),
        half1,
        half2,
        ...existing.scenes.slice(idx + 1),
      ];

      // Match distinct artwork across the updated storyboard while preserving existing scene frames
      const analysis = analyzeAndMatchStoryArt(
        {
          topic: existing.topic,
          title: existing.title,
          titleHindi: existing.titleHindi,
          scenes: nextScenesRaw,
        },
        { preserveCustomUploads: true }
      );

      const finalScenes = nextScenesRaw.map((sc, sIdx) => {
        if (sIdx !== idx && sIdx !== idx + 1 && existing.scenes.some((orig) => orig.id === sc.id && orig.imageUrl)) {
          return sc;
        }
        return {
          ...sc,
          imageUrl: analysis.scenes[sIdx]?.imageUrl || sc.imageUrl,
        };
      });

      const existingUrls = new Set(
        existing.scenes
          .filter((_, i) => i !== idx)
          .map((s) => s.imageUrl || '')
          .filter(Boolean)
      );

      // Ensure the two split halves get distinct, non-duplicate artwork (preferring painted JPGs first)
      if (finalScenes[idx]?.imageUrl) {
        existingUrls.add(finalScenes[idx].imageUrl!);
      }

      const secondUrl = finalScenes[idx + 1]?.imageUrl || '';
      const splitSecondNeedsNewArt =
        !secondUrl ||
        secondUrl.endsWith('.svg') ||
        secondUrl === finalScenes[idx]?.imageUrl ||
        existingUrls.has(secondUrl);

      if (splitSecondNeedsNewArt && finalScenes[idx + 1]) {
        const bestUnusedJpg = pickBestUnusedCatalogAsset(
          existing.topic,
          finalScenes[idx + 1],
          existingUrls,
          existing.titleHindi || existing.title
        );

        if (bestUnusedJpg) {
          finalScenes[idx + 1] = {
            ...finalScenes[idx + 1],
            sceneArtId: bestUnusedJpg.id,
            imageUrl: bestUnusedJpg.url,
          };
        } else {
          let svg: string;
          try {
            svg = await generateCustomAnimeSceneSvgWithGemini({
              topic: existing.topic,
              format: existing.format,
              storyTitle: existing.titleHindi || existing.title,
              scene: finalScenes[idx + 1],
            });
          } catch {
            svg = buildTopicAnimeSvgFallback(existing.topic, existing.format, idx + 1);
          }
          const fileName = `${existing.id}-split-${idx + 2}-${Date.now()}.svg`;
          fs.writeFileSync(path.join(getFramesDir(), fileName), svg, 'utf8');
          finalScenes[idx + 1] = {
            ...finalScenes[idx + 1],
            sceneArtId: 'custom_ai_svg',
            imageUrl: `/api/frames/${fileName}`,
          };
        }
      }

      const syncedFinalScenes =
        existing.audioUrl && existing.audioDurationSec > 0 && calculateTotalDuration(finalScenes) > existing.audioDurationSec
          ? scaleScenesToAudioDuration(finalScenes, existing.audioDurationSec)
          : finalScenes;

      const updated = updateStory(existing.id, (curr) => ({
        ...curr,
        artVersion: 2,
        scenes: syncedFinalScenes,
      }));

      res.json({ story: updated, splitAtIndex: idx });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Split scene failed' });
    }
  });

  // Auto-match all scenes semantically to story-accurate anime artwork
  app.post('/api/stories/:id/rematch', (req, res) => {
    const existing = getStoryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Story not found' });
    }
    const nextScenes = matchStoryScenesToArt(
      {
        topic: existing.topic,
        title: existing.title,
        titleHindi: existing.titleHindi,
        scenes: existing.scenes,
      },
      { preserveCustomUploads: false }
    );
    const updated = updateStory(existing.id, (curr) => ({
      ...curr,
      artVersion: 2,
      scenes: nextScenes,
    }));
    res.json({ story: updated });
  });

  // Generate bespoke AI vector-anime SVG scene visual for a specific scene (free tier)
  app.post('/api/stories/:id/scenes/:sceneIndex/ai-art', async (req, res) => {
    try {
      const existing = getStoryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Story not found' });
      }
      const idx = Math.max(0, Math.min(existing.scenes.length - 1, Number(req.params.sceneIndex) || 0));
      const scene = existing.scenes[idx];
      const svg = await generateCustomAnimeSceneSvgWithGemini({
        topic: existing.topic,
        format: existing.format,
        storyTitle: existing.titleHindi || existing.title,
        scene,
      });
      const fileName = `${existing.id}-ai-sc${idx + 1}-${Date.now()}.svg`;
      fs.writeFileSync(path.join(getFramesDir(), fileName), svg, 'utf8');
      const frameUrl = `/api/frames/${fileName}`;

      const updated = updateStory(existing.id, (curr) => ({
        ...curr,
        artVersion: 2,
        scenes: curr.scenes.map((sc, i) =>
          i === idx ? { ...sc, sceneArtId: 'custom_ai_svg', imageUrl: frameUrl } : sc
        ),
      }));
      res.json({ story: updated, frameUrl });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'AI scene artwork failed' });
    }
  });

  // Shuffle/rotate distinct visual frames across all scenes in a story
  app.post('/api/stories/:id/frames', async (req, res) => {
    try {
      const existing = getStoryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Story not found' });
      }
      const nextOffset = Math.floor(Math.random() * 5) + 1;
      const nextScenes = await generateDistinctSceneFrames(existing, nextOffset);
      const updated = updateStory(existing.id, (curr) => ({
        ...curr,
        artVersion: 2,
        scenes: nextScenes,
      }));
      res.json({ story: updated });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Scene frame rotation failed' });
    }
  });

  // Save a custom uploaded photo PNG onto a story scene
  app.post('/api/stories/:id/frames/custom', (req, res) => {
    try {
      const existing = getStoryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Story not found' });
      }
      const { dataUrl, sceneIndex } = req.body as { dataUrl?: string; sceneIndex?: number };
      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        return res.status(400).json({ error: 'A valid image data URL is required.' });
      }
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const idx = Math.max(0, Math.min(existing.scenes.length - 1, Number(sceneIndex) || 0));
      const fileName = `${existing.id}-upload-sc${idx + 1}-${Date.now()}.png`;
      fs.writeFileSync(path.join(getFramesDir(), fileName), Buffer.from(base64, 'base64'));
      const frameUrl = `/api/frames/${fileName}`;

      const updated = updateStory(existing.id, (curr) => ({
        ...curr,
        artVersion: 2,
        scenes: curr.scenes.map((sc, i) =>
          i === idx ? { ...sc, sceneArtId: 'custom_upload', imageUrl: frameUrl } : sc
        ),
      }));
      res.json({ story: updated, frameUrl });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save uploaded scene photo' });
    }
  });

  // Generate or regenerate Hindi AI voiceover WAV via Gemini TTS
  app.post('/api/stories/:id/voiceover', async (req, res) => {
    try {
      const existing = getStoryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Story not found' });
      }

      const { tone, voiceName } = req.body as {
        tone?: VoiceTone;
        voiceName?: PrebuiltVoiceName;
      };

      const chosenTone = tone ?? existing.tone;
      const chosenVoice = voiceName ?? existing.voiceName;
      const hasNarration = existing.scenes.some((s) => s.narrationHindi.trim().length > 0);

      if (!hasNarration) {
        return res.status(400).json({ error: 'Story has no Hindi narration text to synthesize.' });
      }

      const voiced = await synthesizeAndAttachVoiceover({
        ...existing,
        tone: chosenTone,
        voiceName: chosenVoice,
      });

      const updated = updateStory(existing.id, (curr) => ({
        ...curr,
        tone: chosenTone,
        voiceName: chosenVoice,
        scenes: voiced.scenes,
        audioUrl: voiced.audioUrl,
        audioDurationSec: voiced.audioDurationSec,
        status: curr.status === 'draft' ? 'voice_ready' : curr.status,
      }));

      res.json({ story: updated });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Voiceover generation failed' });
    }
  });

  // Transcribe spoken audio via gemini-3.5-transcribe
  app.post('/api/audio/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!audioBase64) {
        return res.status(400).json({ error: 'Recorded audio payload is required.' });
      }
      const text = await transcribeAudioWithGemini({
        audioBase64,
        mimeType: mimeType || 'audio/webm',
      });
      res.json({ text });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Transcription failed' });
    }
  });

  // Update story script, scenes, or YouTube/Instagram metadata
  app.patch('/api/stories/:id', (req, res) => {
    const existing = getStoryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const patch = req.body as Partial<StoryProject>;
    const updated = updateStory(existing.id, (curr) => {
      const next: StoryProject = {
        ...curr,
        ...patch,
        youtube: patch.youtube
          ? {
              ...curr.youtube,
              ...patch.youtube,
              tags: sanitizeYouTubeTags(patch.youtube.tags ?? curr.youtube.tags),
            }
          : curr.youtube,
        instagram: patch.instagram
          ? {
              ...curr.instagram,
              ...patch.instagram,
              hashtags: formatInstagramHashtags(patch.instagram.hashtags ?? curr.instagram.hashtags),
            }
          : curr.instagram,
      };
      return next;
    });

    res.json({ story: updated });
  });

  // Review & Publish / Schedule to YouTube and/or Instagram
  app.post('/api/stories/:id/publish', (req, res) => {
    const existing = getStoryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const { channels, scheduleFor, confirmRepublish } = req.body as {
      channels?: ('youtube' | 'instagram')[];
      scheduleFor?: string | null;
      confirmRepublish?: boolean;
    };

    if (!channels || channels.length === 0) {
      return res.status(400).json({ error: 'Select at least one platform (YouTube or Instagram).' });
    }

    const alreadyOnTarget = channels.filter((ch) => existing.publishedChannels.includes(ch));
    const isRepublish = existing.status === 'published' || alreadyOnTarget.length > 0;
    if (isRepublish && !confirmRepublish) {
      return res.status(409).json({
        requiresRepublishPermission: true,
        alreadyPublishedChannels: existing.publishedChannels,
        error: `This video was already published (${existing.publishedChannels.join(', ') || 'published'}). Tell/ask the creator and confirm permission before republishing.`,
      });
    }

    const state = getStudioState();
    if (channels.includes('youtube') && !state.accounts.youtube.connected) {
      return res.status(400).json({ error: 'Connect your YouTube channel before publishing to YouTube.' });
    }
    if (channels.includes('instagram') && !state.accounts.instagram.connected) {
      return res.status(400).json({ error: 'Connect your Instagram account before publishing to Instagram.' });
    }

    const isScheduled = Boolean(scheduleFor && scheduleFor.trim());
    const mergedChannels = Array.from(new Set([...existing.publishedChannels, ...channels]));

    const updated = updateStory(existing.id, (curr) => ({
      ...curr,
      awaitingPermission: false,
      status: isScheduled ? 'scheduled' : 'published',
      scheduledFor: isScheduled ? scheduleFor!.trim() : null,
      publishedChannels: isScheduled ? curr.publishedChannels : mergedChannels,
    }));

    res.json({ story: updated });
  });

  // Delete story
  app.delete('/api/stories/:id', (req, res) => {
    const deleted = deleteStory(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Story not found' });
    }
    res.json({ ok: true });
  });

  // Daily Content Automation batch run (stories + distinct scene frames + Hindi voiceovers + optional permission gate)
  app.post('/api/automation/run-daily', async (req, res) => {
    try {
      const state = getStudioState();
      const { topicOverride } = req.body as { topicOverride?: StoryTopic };
      const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const todayKey = weekdayNames[new Date().getDay()];
      const chosenTopic: StoryTopic =
        topicOverride || state.automation.weeklyTopics[todayKey] || 'krishna';
      const requirePermission = state.automation.requirePublishPermission !== false;

      const formatsToGenerate: VideoFormat[] =
        state.automation.formats.length > 0
          ? state.automation.formats
          : ['youtube_short', 'instagram_reel'];

      const created: StoryProject[] = [];
      for (const fmt of formatsToGenerate) {
        const base = await generateStoryWithGemini({
          topic: chosenTopic,
          format: fmt,
          tone: state.automation.voiceTone,
          voiceName: state.automation.voiceName,
          customInstruction: `Automated daily ${todayKey} episode optimized for ${fmt.replace('_', ' ')}`,
        });
        const distinctScenes = await resolveStoryVisualFrames(base, false);
        const voiced = await synthesizeAndAttachVoiceover({
          ...base,
          artVersion: 2,
          scenes: distinctScenes,
        });
        const story: StoryProject = {
          ...voiced,
          artVersion: 2,
          awaitingPermission: requirePermission,
          status: requirePermission ? 'voice_ready' : 'scheduled',
          scheduledFor: requirePermission
            ? null
            : `${new Date().toISOString().slice(0, 10)}T${state.automation.publishTimeLocal}`,
        };
        addStory(story);
        created.push(story);
      }

      const updatedAuto = updateAutomation({
        ...state.automation,
        lastBatchRunDate: new Date().toISOString().slice(0, 10),
      });

      res.status(201).json({ stories: created, automation: updatedAuto });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Daily batch run failed' });
    }
  });

  // Part-Wise Horror Series Generator (Part 1 -> Part N continuous Hindi horror parts)
  app.post('/api/automation/run-horror-series', async (req, res) => {
    try {
      const state = getStudioState();
      const {
        count,
        format,
        customPremise,
        requirePermissionOverride,
      } = req.body as {
        count?: number;
        format?: VideoFormat;
        customPremise?: string;
        requirePermissionOverride?: boolean;
      };

      const maxParts = state.automation.dailyLimitsDisabled ? 20 : 5;
      const totalParts = Math.max(
        1,
        Math.min(maxParts, Number(count) || state.automation.horrorSeriesDailyCount || 2)
      );
      const targetFormat: VideoFormat = format || 'youtube_short';
      const requirePermission =
        typeof requirePermissionOverride === 'boolean'
          ? requirePermissionOverride
          : state.automation.requirePublishPermission !== false;
      const seriesId = `series-horror-${Date.now().toString(36)}`;
      const batchId = `batch-${Date.now().toString(36)}`;

      const created: StoryProject[] = [];
      let previousPartSummary: string | undefined;

      for (let partNum = 1; partNum <= totalParts; partNum++) {
        const base = await generateStoryWithGemini({
          topic: 'horror',
          format: targetFormat,
          tone: 'horror_suspense',
          voiceName: state.automation.voiceName === 'Kore' ? 'Charon' : state.automation.voiceName,
          pacingMode: targetFormat === 'youtube_long' ? 'standard' : 'fast_30s',
          partNumber: partNum,
          totalParts,
          seriesId,
          previousPartSummary,
          customInstruction:
            customPremise?.trim() ||
            `Gripping Indian midnight horror series Part ${partNum} of ${totalParts} with haunting cliffhanger`,
        });

        const matchedScenes = await resolveStoryVisualFrames(base, true);
        const voiced = await synthesizeAndAttachVoiceover({
          ...base,
          artVersion: 2,
          scenes: matchedScenes,
        });

        const story: StoryProject = {
          ...voiced,
          artVersion: 2,
          seriesId,
          partNumber: partNum,
          totalParts,
          approvalBatchId: batchId,
          awaitingPermission: requirePermission,
          status: requirePermission ? 'voice_ready' : 'scheduled',
          scheduledFor: requirePermission
            ? null
            : `${new Date().toISOString().slice(0, 10)}T${state.automation.publishTimeLocal}`,
        };

        addStory(story);
        created.push(story);

        previousPartSummary = [
          `Part ${partNum} of ${totalParts}: ${story.titleHindi} (${story.title})`,
          `Beginning: ${story.beginning}`,
          `Middle: ${story.middle}`,
          `Cliffhanger: ${story.cliffhangerHindi || story.ending}`,
        ].join('\n');
      }

      const updatedAuto = updateAutomation({
        ...state.automation,
        lastBatchRunDate: new Date().toISOString().slice(0, 10),
      });

      res.status(201).json({ stories: created, automation: updatedAuto });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: err instanceof Error ? err.message : '5-part horror batch generation failed' });
    }
  });

  // Explicit User Permission Approval for a single pending automated story
  app.post('/api/stories/:id/approve', (req, res) => {
    const existing = getStoryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Story not found' });
    }
    const state = getStudioState();
    const { channels, scheduleFor, publishNow, confirmRepublish } = req.body as {
      channels?: ('youtube' | 'instagram')[];
      scheduleFor?: string | null;
      publishNow?: boolean;
      confirmRepublish?: boolean;
    };

    if (existing.status === 'published' && !confirmRepublish) {
      return res.status(409).json({
        requiresRepublishPermission: true,
        alreadyPublishedChannels: existing.publishedChannels,
        error: 'This story was already published. Please confirm permission before republishing.',
      });
    }

    const chosenChannels: ('youtube' | 'instagram')[] =
      channels && channels.length > 0
        ? channels
        : [
            ...(state.accounts.youtube.connected ? (['youtube'] as const) : []),
            ...(state.accounts.instagram.connected ? (['instagram'] as const) : []),
          ];

    const slot =
      scheduleFor?.trim() ||
      `${new Date().toISOString().slice(0, 10)}T${state.automation.publishTimeLocal}`;

    const updated = updateStory(existing.id, (curr) => ({
      ...curr,
      awaitingPermission: false,
      status: publishNow ? 'published' : 'scheduled',
      scheduledFor: publishNow ? null : slot,
      publishedChannels: publishNow
        ? Array.from(new Set([...curr.publishedChannels, ...chosenChannels]))
        : curr.publishedChannels,
    }));

    res.json({ story: updated });
  });

  // Decline / dismiss permission request (moves back to normal draft)
  app.post('/api/stories/:id/decline', (req, res) => {
    const existing = getStoryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Story not found' });
    }
    const updated = updateStory(existing.id, (curr) => ({
      ...curr,
      awaitingPermission: false,
      status: 'voice_ready',
      scheduledFor: null,
    }));
    res.json({ story: updated });
  });

  // Batch approve multiple awaiting-permission stories at once
  app.post('/api/automation/approve-batch', (req, res) => {
    const state = getStudioState();
    const { storyIds, channels, publishNow } = req.body as {
      storyIds?: string[];
      channels?: ('youtube' | 'instagram')[];
      publishNow?: boolean;
    };
    const ids = Array.isArray(storyIds) ? storyIds : [];
    const chosenChannels: ('youtube' | 'instagram')[] =
      channels && channels.length > 0
        ? channels
        : [
            ...(state.accounts.youtube.connected ? (['youtube'] as const) : []),
            ...(state.accounts.instagram.connected ? (['instagram'] as const) : []),
          ];

    const updatedStories: StoryProject[] = [];
    ids.forEach((id, idx) => {
      const baseHour = Number((state.automation.publishTimeLocal || '19:00').split(':')[0]) || 19;
      const baseMin = Number((state.automation.publishTimeLocal || '19:00').split(':')[1]) || 0;
      const offsetMin = baseMin + idx * 30;
      const hr = (baseHour + Math.floor(offsetMin / 60)) % 24;
      const min = offsetMin % 60;
      const slot = `${new Date().toISOString().slice(0, 10)}T${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

      const updated = updateStory(id, (curr) => ({
        ...curr,
        awaitingPermission: false,
        status: publishNow ? 'published' : 'scheduled',
        scheduledFor: publishNow ? null : slot,
        publishedChannels: publishNow
          ? Array.from(new Set([...curr.publishedChannels, ...chosenChannels]))
          : curr.publishedChannels,
      }));
      if (updated) updatedStories.push(updated);
    });

    res.json({ stories: updatedStories });
  });

  // Creator User Creation, Credential Login, Session & Mobile Biometric WebAuthn Endpoints
  app.get('/api/auth/session', (req, res) => {
    const sessionHeader = String(req.headers['x-studio-session'] || '');
    const authHeader = req.headers.authorization || '';
    const token = sessionHeader.trim() || (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');
    const user = verifySessionToken(token);
    res.json({ user: user || null });
  });

  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body as {
      identifier?: string;
      password?: string;
    };
    if (!identifier?.trim() || !password) {
      return res.status(400).json({ error: 'Login ID / email and password are required.' });
    }
    const user = verifyCreatorLogin(identifier.trim(), password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid Login ID or password. Please check and try again.' });
    }
    const sessionToken = issueSessionToken(user.id);
    res.json({ user, sessionToken });
  });

  app.post('/api/auth/register', (req, res) => {
    const { displayName, loginId, email, mobileNumber, password, firebaseUid, authMethod, isNewCreate } =
      req.body as {
        displayName?: string;
        loginId?: string;
        email?: string;
        mobileNumber?: string;
        password?: string;
        firebaseUid?: string;
        authMethod?: 'google' | 'email' | 'mobile_biometric' | 'credentials';
        isNewCreate?: boolean;
      };

    if (!displayName?.trim() && !loginId?.trim() && !email?.trim() && !mobileNumber?.trim()) {
      return res.status(400).json({ error: 'Creator name and Login ID, mobile number, or email are required.' });
    }
    if (mobileNumber && !/^[+0-9\s-]{8,20}$/.test(mobileNumber.trim())) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number (with optional country code).' });
    }
    if (isNewCreate && !firebaseUid && authMethod !== 'mobile_biometric' && (!password || password.length < 4)) {
      return res.status(400).json({ error: 'Please choose a password (at least 4 characters) for your new account.' });
    }

    const result = upsertCreatorUser({
      displayName:
        displayName?.trim() ||
        loginId?.trim() ||
        email?.split('@')[0] ||
        mobileNumber?.trim() ||
        'Creator',
      loginId,
      email,
      mobileNumber,
      password,
      firebaseUid,
      authMethod: authMethod || 'credentials',
      isNewCreate: Boolean(isNewCreate),
    });

    if (result.error || !result.user) {
      return res.status(result.statusCode || 400).json({ error: result.error || 'Account creation failed.' });
    }

    const sessionToken = issueSessionToken(result.user.id);
    res.status(201).json({ user: result.user, sessionToken });
  });

  app.post('/api/auth/webauthn/register-options', (req, res) => {
    const { userId } = req.body as { userId?: string };
    const authHeader = req.headers.authorization || '';
    const tokenUser = verifySessionToken(
      authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    );
    const targetUser = (userId ? findCreatorUserById(userId) : null) || tokenUser;
    if (!targetUser) {
      return res.status(401).json({ error: 'Create or sign into a creator account before linking mobile biometrics.' });
    }

    const { challengeId, challenge } = createWebAuthnChallenge('register', targetUser.id);
    const hostHeader = (req.headers.host || 'localhost').split(':')[0];
    res.json({
      challengeId,
      challenge,
      rpName: 'KathaStudio',
      rpId: hostHeader,
      user: {
        id: targetUser.id,
        name: targetUser.mobileNumber || targetUser.email || targetUser.displayName,
        displayName: targetUser.displayName,
      },
    });
  });

  app.post('/api/auth/webauthn/register-verify', (req, res) => {
    const { challengeId, credentialId, clientDataJSON, transports, deviceLabel } = req.body as {
      challengeId?: string;
      credentialId?: string;
      clientDataJSON?: string;
      transports?: string[];
      deviceLabel?: string;
    };

    if (!challengeId || !credentialId || !clientDataJSON) {
      return res.status(400).json({ error: 'Missing WebAuthn biometric registration payload.' });
    }
    const verified = verifyClientDataChallenge({
      challengeId,
      expectedPurpose: 'register',
      clientDataJSONB64Url: clientDataJSON,
    });
    if (!verified.ok || !verified.userId) {
      return res.status(400).json({ error: verified.error || 'Biometric registration verification failed.' });
    }

    const updated = attachBiometricCredentialToUser(verified.userId, {
      credentialId,
      deviceLabel: deviceLabel || 'Mobile Biometric Passkey',
      transports: Array.isArray(transports) ? transports.slice(0, 6) : ['internal'],
      createdAt: new Date().toISOString(),
    });
    if (!updated) {
      return res.status(404).json({ error: 'Creator account not found.' });
    }
    const sessionToken = issueSessionToken(updated.id);
    res.json({ user: updated, sessionToken });
  });

  app.post('/api/auth/webauthn/login-options', (req, res) => {
    const { identifier } = req.body as { identifier?: string };
    const matchedUser = identifier?.trim()
      ? findCreatorUserByIdentifier(identifier.trim())
      : undefined;
    if (identifier?.trim() && (!matchedUser || matchedUser.biometricCredentials.length === 0)) {
      return res.status(404).json({
        error: 'No mobile biometric passkey is registered for this mobile/email yet.',
      });
    }

    const allowCredentialIds = listAllBiometricCredentialIds(identifier);
    if (allowCredentialIds.length === 0) {
      return res.status(404).json({
        error: 'No mobile biometric passkey found on this workspace yet. Create an account and enable Biometric first.',
      });
    }

    const { challengeId, challenge } = createWebAuthnChallenge('login', matchedUser?.id);
    const hostHeader = (req.headers.host || 'localhost').split(':')[0];
    res.json({
      challengeId,
      challenge,
      rpId: hostHeader,
      allowCredentialIds,
    });
  });

  app.post('/api/auth/webauthn/login-verify', (req, res) => {
    const { challengeId, credentialId, clientDataJSON } = req.body as {
      challengeId?: string;
      credentialId?: string;
      clientDataJSON?: string;
    };

    if (!challengeId || !credentialId || !clientDataJSON) {
      return res.status(400).json({ error: 'Missing WebAuthn assertion payload.' });
    }

    const verified = verifyClientDataChallenge({
      challengeId,
      expectedPurpose: 'login',
      clientDataJSONB64Url: clientDataJSON,
    });
    if (!verified.ok) {
      return res.status(401).json({ error: verified.error || 'Biometric sign-in failed.' });
    }

    const user = findCreatorUserByCredentialId(credentialId);
    if (!user) {
      return res.status(401).json({ error: 'Unrecognized biometric credential. Please register this device again.' });
    }
    const sessionToken = issueSessionToken(user.id);
    res.json({ user, sessionToken });
  });

  // Update YouTube & Instagram account bindings
  app.put('/api/accounts', (req, res) => {
    const { youtube, instagram } = req.body;
    const current = getStudioState().accounts;
    const updated = updateAccounts({
      youtube: youtube ? { ...current.youtube, ...youtube, lastSyncedAt: new Date().toISOString() } : current.youtube,
      instagram: instagram
        ? { ...current.instagram, ...instagram, lastSyncedAt: new Date().toISOString() }
        : current.instagram,
    });
    res.json({ accounts: updated });
  });

  // Update daily automation config
  app.put('/api/automation', (req, res) => {
    const current = getStudioState().automation;
    const updated = updateAutomation({ ...current, ...req.body });
    res.json({ automation: updated });
  });

  // Log creator income entry
  app.post('/api/income', (req, res) => {
    const { source, description, amountInr, storyId } = req.body as {
      source?: 'youtube_adsense' | 'instagram_bonus' | 'sponsorship';
      description?: string;
      amountInr?: number;
      storyId?: string;
    };
    if (!description?.trim() || typeof amountInr !== 'number' || amountInr <= 0) {
      return res.status(400).json({ error: 'Valid description and positive amount (INR) are required.' });
    }
    const entry = addIncomeEntry({
      id: `inc-${Date.now().toString(36)}`,
      date: new Date().toISOString().slice(0, 10),
      source: source ?? 'youtube_adsense',
      description: description.trim(),
      amountInr: Math.round(amountInr),
      storyId,
    });
    res.status(201).json({ entry });
  });

  // Optional OAuth URL builders for YouTube & Instagram
  app.get('/api/auth/youtube/url', (_req, res) => {
    const env = getOAuthEnvStatus();
    if (!env.youtubeOAuthReady) {
      return res.status(400).json({
        error: 'YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are not set in Secrets yet.',
        callbackUrl: `${env.appUrl}/api/auth/youtube/callback`,
      });
    }
    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      redirect_uri: `${env.appUrl}/api/auth/youtube/callback`,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get(['/api/auth/youtube/callback', '/api/auth/youtube/callback/'], (_req, res) => {
    res.send(`
      <html><body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'KATHA_OAUTH_SUCCESS', provider: 'youtube' }, '*');
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
        <p>YouTube authorization completed. You may close this window.</p>
      </body></html>
    `);
  });

  app.get('/api/auth/instagram/url', (_req, res) => {
    const env = getOAuthEnvStatus();
    if (!env.instagramOAuthReady) {
      return res.status(400).json({
        error: 'INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET are not set in Secrets yet.',
        callbackUrl: `${env.appUrl}/api/auth/instagram/callback`,
      });
    }
    const params = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      redirect_uri: `${env.appUrl}/api/auth/instagram/callback`,
      response_type: 'code',
      scope: 'instagram_basic,instagram_content_publish',
    });
    res.json({ url: `https://api.instagram.com/oauth/authorize?${params}` });
  });

  app.get(['/api/auth/instagram/callback', '/api/auth/instagram/callback/'], (_req, res) => {
    res.send(`
      <html><body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'KATHA_OAUTH_SUCCESS', provider: 'instagram' }, '*');
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
        <p>Instagram authorization completed. You may close this window.</p>
      </body></html>
    `);
  });

  // Client-Side Google OAuth -> YouTube Data API v3 Channel Verification & Live Stats Sync
  app.get('/api/youtube/channel-info', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'YouTube OAuth Bearer token is required.' });
    }
    try {
      const ytRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const ytJson = (await ytRes.json()) as {
        items?: Array<{
          id?: string;
          snippet?: { title?: string; customUrl?: string };
          statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
        }>;
        error?: { message?: string };
      };
      if (!ytRes.ok) {
        return res.status(ytRes.status).json({
          error: ytJson.error?.message || 'Failed to read YouTube channel details.',
        });
      }
      const first = ytJson.items?.[0];
      if (!first?.id) {
        return res.json({ channel: null });
      }
      return res.json({
        channel: {
          id: first.id,
          title: first.snippet?.title || 'YouTube Channel',
          handle: first.snippet?.customUrl || `@${first.id}`,
          subscribers: Number(first.statistics?.subscriberCount || 0),
          totalViews: Number(first.statistics?.viewCount || 0),
          videoCount: Number(first.statistics?.videoCount || 0),
        },
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to verify YouTube channel.',
      });
    }
  });

  app.get('/api/youtube/live-stats', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Authorize Google YouTube OAuth first to sync live stats.' });
    }

    try {
      const state = getStudioState();
      const targetChannelId = state.accounts.youtube.channelId?.trim();
      const channelEndpoint = targetChannelId
        ? `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(targetChannelId)}`
        : 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true';

      const chanRes = await fetch(channelEndpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const chanJson = (await chanRes.json()) as {
        items?: Array<{
          id?: string;
          snippet?: { title?: string; customUrl?: string };
          statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
        }>;
        error?: { message?: string };
      };

      if (!chanRes.ok) {
        return res.status(chanRes.status).json({
          error: chanJson.error?.message || 'Could not fetch live YouTube channel statistics.',
        });
      }

      const channelItem = chanJson.items?.[0];
      const nowIso = new Date().toISOString();
      let updatedAccounts = state.accounts;

      if (channelItem?.id) {
        updatedAccounts = updateAccounts({
          ...state.accounts,
          youtube: {
            ...state.accounts.youtube,
            connected: true,
            channelId: channelItem.id,
            channelName: channelItem.snippet?.title || state.accounts.youtube.channelName,
            handle: channelItem.snippet?.customUrl || state.accounts.youtube.handle,
            subscribers: Number(channelItem.statistics?.subscriberCount || 0),
            oauthMode: 'oauth',
            lastSyncedAt: nowIso,
          },
        });
      }

      const uploadedStories = state.stories.filter((s) => Boolean(s.youtubeVideoId));
      const updatedStories: StoryProject[] = [];

      if (uploadedStories.length > 0) {
        const videoIds = uploadedStories.map((s) => s.youtubeVideoId!).slice(0, 50);
        const vidRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics,status&id=${encodeURIComponent(videoIds.join(','))}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const vidJson = (await vidRes.json()) as {
          items?: Array<{
            id?: string;
            statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
            status?: { privacyStatus?: 'public' | 'unlisted' | 'private' };
          }>;
        };

        if (vidRes.ok && Array.isArray(vidJson.items)) {
          const statsMap = new Map(vidJson.items.map((item) => [item.id, item]));
          for (const story of uploadedStories) {
            const live = statsMap.get(story.youtubeVideoId);
            if (!live) continue;
            const updated = updateStory(story.id, (curr) => ({
              ...curr,
              youtubePrivacyStatus: live.status?.privacyStatus ?? curr.youtubePrivacyStatus,
              liveMetricsSyncedAt: nowIso,
              metrics: {
                ...curr.metrics,
                views: Number(live.statistics?.viewCount || 0),
                likes: Number(live.statistics?.likeCount || 0),
                comments: Number(live.statistics?.commentCount || 0),
              },
            }));
            if (updated) updatedStories.push(updated);
          }
        }
      }

      return res.json({
        accounts: updatedAccounts,
        updatedStories,
        liveChannelStats: channelItem
          ? {
              channelId: channelItem.id,
              title: channelItem.snippet?.title || updatedAccounts.youtube.channelName,
              subscribers: Number(channelItem.statistics?.subscriberCount || 0),
              totalChannelViews: Number(channelItem.statistics?.viewCount || 0),
              videoCount: Number(channelItem.statistics?.videoCount || 0),
              syncedAt: nowIso,
            }
          : null,
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to sync live YouTube metrics.',
      });
    }
  });

  app.post(
    '/api/youtube/upload/:storyId',
    express.raw({
      type: ['video/mp4', 'video/webm', 'application/octet-stream'],
      limit: '150mb',
    }),
    async (req, res) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        return res.status(401).json({
          error: 'Connect your Google YouTube account first to authorize upload.',
        });
      }

      const existing = getStoryById(req.params.storyId);
      if (!existing) {
        return res.status(404).json({ error: 'Story not found.' });
      }

      const confirmRepublish = req.headers['x-confirm-republish'] === 'true';
      const isRepublish =
        existing.status === 'published' ||
        existing.publishedChannels.includes('youtube') ||
        Boolean(existing.youtubeVideoId);

      if (isRepublish && !confirmRepublish) {
        return res.status(409).json({
          requiresRepublishPermission: true,
          alreadyPublishedChannels: existing.publishedChannels,
          error:
            'This story was already published to YouTube. Please confirm permission before republishing.',
        });
      }

      const videoBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (videoBuffer.length === 0) {
        return res.status(400).json({ error: 'Rendered video binary payload is empty.' });
      }

      const rawPrivacy = String(req.headers['x-youtube-privacy'] || 'public').toLowerCase();
      const privacyStatus: 'public' | 'unlisted' | 'private' =
        rawPrivacy === 'private' || rawPrivacy === 'unlisted' ? rawPrivacy : 'public';
      const contentType = String(req.headers['content-type'] || 'video/webm').split(';')[0];

      try {
        // 1. Verify which YouTube channel this token owns
        const chanRes = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const chanData = (await chanRes.json()) as {
          items?: Array<{ id?: string; snippet?: { title?: string } }>;
          error?: { message?: string };
        };
        if (!chanRes.ok) {
          return res.status(chanRes.status).json({
            error: chanData.error?.message || 'Unable to read authorized YouTube channel.',
          });
        }
        const mineChannel = chanData.items?.[0];
        if (!mineChannel?.id) {
          return res.status(400).json({
            error:
              'The signed-in Google account does not have an active YouTube channel yet.',
          });
        }

        const expectedChannelId = getStudioState().accounts.youtube.channelId?.trim();
        const allowChannelMismatch = req.headers['x-allow-channel-mismatch'] === 'true';
        if (expectedChannelId && mineChannel.id !== expectedChannelId && !allowChannelMismatch) {
          return res.status(409).json({
            channelMismatch: true,
            authorizedChannelId: mineChannel.id,
            authorizedChannelTitle: mineChannel.snippet?.title || 'Authorized Channel',
            expectedChannelId,
            error: `Signed-in Google account owns channel ${mineChannel.id} (${mineChannel.snippet?.title || 'YouTube'}), not target ${expectedChannelId}. Switch Google account or confirm uploading to ${mineChannel.id}.`,
          });
        }

        // 2. Initiate YouTube Data API v3 Resumable Upload
        const snippetTitle = (existing.youtube.title || existing.titleHindi || existing.title).slice(0, 100);
        const snippetDesc = [
          existing.youtube.description || existing.beginning,
          existing.format === 'youtube_short' ? '#Shorts' : '',
        ]
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 5000);

        const initRes = await fetch(
          'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json; charset=UTF-8',
              'X-Upload-Content-Length': String(videoBuffer.length),
              'X-Upload-Content-Type': contentType,
            },
            body: JSON.stringify({
              snippet: {
                title: snippetTitle,
                description: snippetDesc,
                tags: sanitizeYouTubeTags(existing.youtube.tags).slice(0, 15),
                categoryId: existing.topic === 'horror' ? '24' : '22',
                defaultLanguage: 'hi',
              },
              status: {
                privacyStatus,
                selfDeclaredMadeForKids: false,
              },
            }),
          }
        );

        const uploadUrl = initRes.headers.get('location');
        if (!initRes.ok || !uploadUrl) {
          const errText = await initRes.text().catch(() => '');
          return res.status(initRes.status || 502).json({
            error: `YouTube upload initialization failed (${initRes.status}): ${errText.slice(0, 260)}`,
          });
        }

        // 3. Upload video binary to Google resumable endpoint
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': contentType,
            'Content-Length': String(videoBuffer.length),
          },
          body: new Uint8Array(videoBuffer),
        });

        const putData = (await putRes.json().catch(() => ({}))) as {
          id?: string;
          error?: { message?: string };
        };
        if (!putRes.ok || !putData.id) {
          return res.status(putRes.status || 502).json({
            error: putData.error?.message || 'YouTube binary upload failed.',
          });
        }

        const videoId = putData.id;
        const youtubeUploadUrl = `https://youtu.be/${videoId}`;
        const nowIso = new Date().toISOString();
        const updated = updateStory(existing.id, (curr) => ({
          ...curr,
          awaitingPermission: false,
          status: 'published',
          scheduledFor: null,
          youtubeVideoId: videoId,
          youtubeUploadUrl,
          youtubePrivacyStatus: privacyStatus,
          liveMetricsSyncedAt: nowIso,
          metrics: {
            views: curr.metrics?.views ?? 0,
            likes: curr.metrics?.likes ?? 0,
            comments: curr.metrics?.comments ?? 0,
            shares: curr.metrics?.shares ?? 0,
            estimatedIncomeInr: curr.metrics?.estimatedIncomeInr ?? 0,
          },
          publishedChannels: Array.from(new Set([...curr.publishedChannels, 'youtube'])),
        }));

        return res.json({
          story: updated,
          videoId,
          youtubeUrl: youtubeUploadUrl,
          channelId: mineChannel.id,
          channelTitle: mineChannel.snippet?.title || 'YouTube Channel',
          privacyStatus,
        });
      } catch (err) {
        return res.status(500).json({
          error: err instanceof Error ? err.message : 'Direct YouTube upload error.',
        });
      }
    }
  );

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);

  // Real-Time Bidirectional Voice Conversations via Gemini Live API (gemini-3.8-live)
  const wss = new WebSocketServer({ server: httpServer, path: '/api/live' });
  wss.on('connection', async (clientWs: WebSocket, req) => {
    let session: Awaited<ReturnType<ReturnType<typeof getClient>['live']['connect']>> | null = null;
    try {
      const urlObj = new URL(req.url || '/api/live', 'http://localhost');
      const voiceName = urlObj.searchParams.get('voice') || 'Zephyr';
      const ai = getClient();

      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            'You are KathaStudio Creative Producer, a warm bilingual Hindi & English voice collaborator helping the creator brainstorm gripping Horror, Ramayana, Krishna, Mahabharata, and Hindu mythological hooks, character angles, and Reels scripts. Keep replies concise, expressive, and practical.',
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({ error: err instanceof Error ? err.message : 'Live session error' })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ ready: true }));
      }

      clientWs.on('message', (rawData) => {
        if (!session) return;
        try {
          const parsed = JSON.parse(rawData.toString()) as { audio?: string; text?: string };
          if (parsed.audio) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (parsed.text) {
            session.sendRealtimeInput({ text: parsed.text });
          }
        } catch {
          // ignore malformed frames
        }
      });

      clientWs.on('close', () => {
        try {
          session?.close();
        } catch {
          // ignore
        }
      });
    } catch (err) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Could not connect to Gemini Live session.',
          })
        );
        clientWs.close();
      }
      try {
        session?.close();
      } catch {
        // ignore
      }
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`KathaStudio server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
