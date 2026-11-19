import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAndMatchStoryArt,
  buildAutoTransitionSequence,
  buildSceneTimeline,
  buildSplitSceneHalves,
  calculateTotalDuration,
  computeCreatorMetrics,
  computeDailyProgress,
  computeSplitSceneDurations,
  concatenateWavClipsWithActDurations,
  formatCompactNumber,
  formatDurationMMSS,
  formatInstagramHashtags,
  getActiveCaptionDisplay,
  getActiveSceneAtTime,
  getAnimeMotionState,
  getEffectivePlaybackDurationSec,
  getOutroCtaCopy,
  getRecommendedScenePlan,
  getSceneTransitionInfo,
  getTopicAnimeGallery,
  isCustomUploadedFrameUrl,
  matchStoryScenesToArt,
  parseWavDurationSecondsFromBytes,
  resolveSceneTransitionMode,
  resolveTopicAnimeSceneImage,
  sanitizeYouTubeTags,
  scaleScenesToAudioDuration,
  scaleScenesWithinActDurations,
  splitSubtitleIntoLines,
  validateStoryStructure,
} from './studioLogic';
import { float32ToPcm16Base64, pcm16Base64ToFloat32 } from './liveAudio';
import type { DailyAutomationConfig, IncomeEntry, StoryProject, StoryScene } from './types';

const sampleScenes: StoryScene[] = [
  {
    id: 's1',
    part: 'beginning',
    shotType: 'character_hook',
    hookCaption: 'वृंदावन का सबसे बड़ा रहस्य!',
    narrationHindi: 'वृंदावन की शांत रात में बांसुरी की मधुर ध्वनि गूंजी।',
    subtitleHindi: 'वृंदावन की शांत रात में बांसुरी की मधुर ध्वनि गूंजी।',
    visualPrompt: 'Krishna playing flute by Yamuna',
    sfxCue: 'bansuri_flute',
    cameraMotion: 'zoom-in',
    durationSec: 10,
  },
  {
    id: 's2',
    part: 'middle',
    shotType: 'climax_closeup',
    narrationHindi: 'यमुना के तट पर सभी गोपियां और ग्वाल मंत्रमुग्ध हो गए।',
    subtitleHindi: 'यमुना के तट पर सभी मंत्रमुग्ध हो गए।',
    visualPrompt: 'Moonlit Yamuna riverbanks',
    sfxCue: 'temple_bell',
    cameraMotion: 'pan-right',
    durationSec: 12,
  },
  {
    id: 's3',
    part: 'ending',
    shotType: 'resolution_vista',
    narrationHindi: 'प्रेम और भक्ति से हर हृदय प्रकाशित हो उठा।',
    subtitleHindi: 'प्रेम और भक्ति से हर हृदय प्रकाशित हो उठा।',
    visualPrompt: 'Golden diyas glowing on water',
    sfxCue: 'none',
    cameraMotion: 'zoom-out',
    durationSec: 8,
  },
];

test('calculateTotalDuration and buildSceneTimeline compute accurate spans', () => {
  assert.equal(calculateTotalDuration(sampleScenes), 30);
  const timeline = buildSceneTimeline(sampleScenes);
  assert.equal(timeline.length, 3);
  assert.deepEqual(
    timeline.map((t) => [t.startSec, t.endSec]),
    [
      [0, 10],
      [10, 22],
      [22, 30],
    ]
  );
});

test('getActiveSceneAtTime resolves scene and normalized progress', () => {
  const first = getActiveSceneAtTime(sampleScenes, 5);
  assert.ok(first);
  assert.equal(first.entry.scene.id, 's1');
  assert.equal(first.localProgress, 0.5);

  const second = getActiveSceneAtTime(sampleScenes, 16);
  assert.ok(second);
  assert.equal(second.entry.scene.id, 's2');
  assert.equal(second.localProgress, 0.5);

  const end = getActiveSceneAtTime(sampleScenes, 999);
  assert.ok(end);
  assert.equal(end.entry.scene.id, 's3');
});

test('getSceneTransitionInfo computes hook visibility and crossfade alpha across scenes', () => {
  const hookFrame = getSceneTransitionInfo(sampleScenes, 1.5, 0.6);
  assert.ok(hookFrame);
  assert.equal(hookFrame.current.scene.id, 's1');
  assert.equal(hookFrame.next?.scene.id, 's2');
  assert.equal(hookFrame.showHookOverlay, true);
  assert.equal(hookFrame.crossfadeAlpha, 0);

  const crossfadeFrame = getSceneTransitionInfo(sampleScenes, 9.7, 0.6);
  assert.ok(crossfadeFrame);
  assert.equal(crossfadeFrame.current.scene.id, 's1');
  assert.equal(crossfadeFrame.next?.scene.id, 's2');
  assert.ok(crossfadeFrame.crossfadeAlpha > 0.4 && crossfadeFrame.crossfadeAlpha < 0.6);

  const middleFrame = getSceneTransitionInfo(sampleScenes, 15, 0.6);
  assert.ok(middleFrame);
  assert.equal(middleFrame.current.scene.id, 's2');
  assert.equal(middleFrame.showHookOverlay, false);
});

test('float32ToPcm16Base64 and pcm16Base64ToFloat32 round-trip PCM audio accurately', () => {
  const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const b64 = float32ToPcm16Base64(input);
  assert.ok(b64.length > 0);
  const decoded = pcm16Base64ToFloat32(b64);
  assert.equal(decoded.length, input.length);
  assert.ok(Math.abs(decoded[1] - 0.5) < 0.001);
  assert.ok(Math.abs(decoded[2] + 0.5) < 0.001);
  assert.ok(Math.abs(decoded[3] - 1) < 0.001);
});

test('validateStoryStructure enforces beginning, middle, and ending', () => {
  const validResult = validateStoryStructure({
    title: 'Krishna Bansuri',
    beginning: 'Start',
    middle: 'Conflict',
    ending: 'Resolution',
    scenes: sampleScenes,
  });
  assert.equal(validResult.valid, true);
  assert.equal(validResult.errors.length, 0);

  const missingEnding = validateStoryStructure({
    title: 'Incomplete',
    beginning: 'Start',
    middle: 'Middle',
    ending: '',
    scenes: sampleScenes.slice(0, 2),
  });
  assert.equal(missingEnding.valid, false);
  assert.ok(missingEnding.errors.length >= 2);
});

test('splitSubtitleIntoLines wraps Hindi captions cleanly within maxCharsPerLine', () => {
  const lines = splitSubtitleIntoLines(
    'अयोध्या की पावन भूमि पर लाखों दीपों का प्रकाश फैल गया था',
    24
  );
  assert.ok(lines.length >= 2 && lines.length <= 3);
  for (const line of lines) {
    assert.ok(line.length <= 24 || !line.includes(' '));
  }
});

test('YouTube tag and Instagram hashtag sanitizers deduplicate and format', () => {
  const yt = sanitizeYouTubeTags(['#Krishna', 'krishna', 'Hindi Story', '  ', 'Ramayana']);
  assert.deepEqual(yt, ['Krishna', 'Hindi Story', 'Ramayana']);

  const ig = formatInstagramHashtags(['krishna', '#Krishna', 'hindi reels', 'bhakti']);
  assert.deepEqual(ig, ['#krishna', '#hindireels', '#bhakti']);
});

test('computeDailyProgress and computeCreatorMetrics calculate daily targets and income', () => {
  const automation: DailyAutomationConfig = {
    enabled: true,
    publishTimeLocal: '19:00',
    formats: ['youtube_short', 'instagram_reel', 'youtube_long'],
    voiceTone: 'devotional_warm',
    voiceName: 'Kore',
    weeklyTopics: { Mon: 'krishna' },
    dailyTargets: { youtubeShorts: 1, instagramReels: 1, youtubeLong: 1 },
    lastBatchRunDate: '2026-11-16',
  };

  const baseStory: StoryProject = {
    id: 'st-1',
    title: 'Test',
    titleHindi: 'परीक्षण',
    topic: 'krishna',
    format: 'youtube_short',
    tone: 'devotional_warm',
    voiceName: 'Kore',
    bgmMood: 'serene_flute',
    customInstruction: '',
    beginning: 'A',
    middle: 'B',
    ending: 'C',
    scenes: sampleScenes,
    audioUrl: null,
    audioDurationSec: 30,
    youtube: { title: 'T', description: 'D', tags: ['a'], thumbnailHeadline: 'H', category: 'Entertainment' },
    instagram: { caption: 'C', hashtags: ['#a'], hookLine: 'H' },
    status: 'published',
    scheduledFor: null,
    publishedChannels: ['youtube'],
    metrics: { views: 10000, likes: 800, comments: 100, shares: 100, estimatedIncomeInr: 1200 },
    createdAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T08:00:00.000Z',
  };

  const stories: StoryProject[] = [
    baseStory,
    { ...baseStory, id: 'st-2', format: 'instagram_reel', status: 'scheduled' },
  ];

  const progress = computeDailyProgress(stories, automation, '2026-11-16');
  assert.equal(progress.youtubeShortsDone, 1);
  assert.equal(progress.instagramReelsDone, 1);
  assert.equal(progress.youtubeLongDone, 0);
  assert.equal(progress.overallCompletionPct, 67);

  const income: IncomeEntry[] = [
    { id: 'i1', date: '2026-11-15', source: 'youtube_adsense', description: 'AdSense', amountInr: 3500 },
  ];
  const metrics = computeCreatorMetrics(stories, income);
  assert.equal(metrics.totalViews, 20000);
  assert.equal(metrics.engagementRatePct, 10);
  assert.equal(metrics.totalIncomeInr, 3500);
  assert.equal(metrics.publishedCount, 1);
  assert.equal(metrics.scheduledCount, 1);
});

test('formatting helpers render compact counts and MM:SS', () => {
  assert.equal(formatCompactNumber(1250), '1.3K');
  assert.equal(formatCompactNumber(2500000), '2.5M');
  assert.equal(formatDurationMMSS(75), '01:15');
});

test('scaleScenesToAudioDuration matches scene sum to real WAV duration', () => {
  const scaled = scaleScenesToAudioDuration(sampleScenes, 45);
  assert.equal(calculateTotalDuration(scaled), 45);
});

test('topic anime scene galleries stay strictly within their universe and assign distinct frames across 8+ scenes', () => {
  const krishnaGallery = getTopicAnimeGallery('krishna');
  const horrorGallery = getTopicAnimeGallery('horror');
  assert.ok(krishnaGallery.length >= 8);
  assert.ok(horrorGallery.length >= 10);
  assert.ok(krishnaGallery.every((url) => url.includes('anime_krishna_')));
  assert.ok(horrorGallery.every((url) => url.includes('anime_horror_')));

  const eightKrishnaScenes = Array.from({ length: 8 }, (_, i) =>
    resolveTopicAnimeSceneImage('krishna', i, 8, 0)
  );
  assert.equal(new Set(eightKrishnaScenes).size, 8);
  assert.equal(resolveTopicAnimeSceneImage('krishna', 0, 8, 1), krishnaGallery[1]);
});

test('getActiveCaptionDisplay highlights karaoke words sequentially across progress', () => {
  const text = 'वृंदावन की शांत रात में बांसुरी की मधुर ध्वनि गूंजी';
  const start = getActiveCaptionDisplay(text, 0.05, 4);
  assert.ok(start);
  assert.equal(start.chunkIndex, 0);
  assert.equal(start.activeWordIndex, 0);
  assert.equal(start.words.length, 4);

  const mid = getActiveCaptionDisplay(text, 0.55, 4);
  assert.ok(mid);
  assert.equal(mid.chunkIndex, 1);

  const end = getActiveCaptionDisplay(text, 0.99, 4);
  assert.ok(end);
  assert.equal(end.chunkIndex, end.totalChunks - 1);
  assert.equal(end.activeWordIndex, end.words.length - 1);
});

test('getAnimeMotionState triggers hookPop early, cutImpact at cuts, and outroAlpha at end', () => {
  const early = getAnimeMotionState(sampleScenes, 1.0);
  assert.ok(early.hookPop > 0.9);
  assert.equal(early.outroAlpha, 0);

  const atCut = getAnimeMotionState(sampleScenes, 10.05);
  assert.ok(atCut.cutImpact > 0.7);
  assert.equal(atCut.hookPop, 0);

  const nearEnd = getAnimeMotionState(sampleScenes, 29.5);
  assert.ok(nearEnd.outroAlpha > 0.9);
});

test('matchStoryScenesToArt accurately aligns scenes to Fruit Seller, Broken Flute, Broken Pot, and Banyan stories', () => {
  const fruitSellerMatched = matchStoryScenesToArt({
    topic: 'krishna',
    title: 'Krishna and the Fruit Seller',
    scenes: [
      {
        id: 'fs-1',
        part: 'beginning',
        shotType: 'character_hook',
        narrationHindi: 'एक गरीब फलवाली ने कृष्ण को क्या दिया था!',
        subtitleHindi: 'गरीब फलवाली की भेंट',
        visualPrompt: 'Humble elderly fruit seller woman holding basket of fresh mangoes',
        sfxCue: 'bansuri_flute',
        cameraMotion: 'zoom-in',
        durationSec: 6,
      },
      {
        id: 'fs-2',
        part: 'beginning',
        shotType: 'wide_establishing',
        narrationHindi: 'नन्हे कान्हा मुट्ठी में चावल लेकर दौड़े आए।',
        subtitleHindi: 'मुट्ठी में चावल',
        visualPrompt: 'Little Krishna running joyfully holding grains of rice in tiny hands',
        sfxCue: 'temple_bell',
        cameraMotion: 'pan-right',
        durationSec: 6,
      },
      {
        id: 'fs-3',
        part: 'middle',
        shotType: 'climax_closeup',
        narrationHindi: 'फलवाली की पूरी टोकरी हीरों से चमक उठी।',
        subtitleHindi: 'टोकरी हीरों से चमक उठी',
        visualPrompt: 'Basket magically overflowing with radiant diamonds and rubies',
        sfxCue: 'conch_shankh',
        cameraMotion: 'zoom-out',
        durationSec: 6,
      },
      {
        id: 'fs-4',
        part: 'ending',
        shotType: 'resolution_vista',
        narrationHindi: 'सच्ची भक्ति के सामने भगवान भी झुक जाते हैं।',
        subtitleHindi: 'भक्ति की जीत',
        visualPrompt: 'Fruit seller bowing with tears of joy as little Krishna smiles warmly',
        sfxCue: 'bansuri_flute',
        cameraMotion: 'zoom-in',
        durationSec: 4,
      },
    ],
  });

  assert.ok(fruitSellerMatched[0].imageUrl?.includes('fruit_seller_17948'));
  assert.ok(fruitSellerMatched[1].imageUrl?.includes('bal_krishna_rice'));
  assert.ok(fruitSellerMatched[2].imageUrl?.includes('diamonds_miracle'));
  assert.ok(fruitSellerMatched[3].imageUrl?.includes('fruit_seller_blessing'));
  assert.equal(new Set(fruitSellerMatched.map((s) => s.imageUrl)).size, 4);

  const banyanMatched = matchStoryScenesToArt({
    topic: 'horror',
    titleHindi: 'खूनी बरगद का साया',
    scenes: [
      {
        id: 'bh-1',
        part: 'beginning',
        shotType: 'character_hook',
        narrationHindi: 'सौ साल पुराना बरगद का पेड़ था।',
        subtitleHindi: 'खौफनाक बरगद',
        visualPrompt: 'Ancient banyan tree on deserted Indian village road at twilight',
        sfxCue: 'night_wind',
        cameraMotion: 'zoom-in',
        durationSec: 8,
      },
      {
        id: 'bh-2',
        part: 'middle',
        shotType: 'wide_establishing',
        narrationHindi: 'मुसाफिर सो गया और जटाओं से फुसफुसाहट आने लगी।',
        subtitleHindi: 'फुसफुसाहट',
        visualPrompt: 'Traveler sleeping at midnight in eerie fog and mist',
        sfxCue: 'thunder_rumble',
        cameraMotion: 'pan-right',
        durationSec: 8,
      },
      {
        id: 'bh-3',
        part: 'middle',
        shotType: 'climax_closeup',
        narrationHindi: 'एक काली परछाईं उल्टी लटकी लाल आँखों से घूर रही थी।',
        subtitleHindi: 'उल्टी लटकी परछाईं',
        visualPrompt: 'Shadowy figure hanging upside down in banyan branches with glowing red eyes',
        sfxCue: 'thunder_rumble',
        cameraMotion: 'zoom-in',
        durationSec: 8,
      },
      {
        id: 'bh-4',
        part: 'ending',
        shotType: 'resolution_vista',
        narrationHindi: 'सुबह बरगद के नीचे सिर्फ उसकी चप्पलें पड़ी थीं।',
        subtitleHindi: 'सिर्फ चप्पलें मिलीं',
        visualPrompt: 'Early morning foggy shot of abandoned leather sandals near thick roots',
        sfxCue: 'night_wind',
        cameraMotion: 'zoom-out',
        durationSec: 8,
      },
    ],
  });

  assert.ok(banyanMatched[0].imageUrl?.includes('banyan_tree'));
  assert.ok(banyanMatched[1].imageUrl?.includes('horror_setup'));
  assert.ok(banyanMatched[2].imageUrl?.includes('banyan_shadow'));
  assert.ok(banyanMatched[3].imageUrl?.includes('banyan_sandals'));

  const brokenFluteMatched = matchStoryScenesToArt({
    topic: 'krishna',
    title: 'The Broken Flute of Vrindavan',
    scenes: [
      {
        id: 'bf-1',
        part: 'beginning',
        shotType: 'character_hook',
        narrationHindi: 'श्री कृष्ण ने अपनी बांसुरी क्यों तोड़ी?',
        subtitleHindi: 'क्यों तोड़ी बांसुरी',
        visualPrompt: 'Tears glistening in Krishna eyes holding bamboo flute tightly',
        sfxCue: 'bansuri_flute',
        cameraMotion: 'zoom-in',
        durationSec: 7,
      },
      {
        id: 'bf-2',
        part: 'beginning',
        shotType: 'wide_establishing',
        narrationHindi: 'राधा रानी के विदा होने का समय था।',
        subtitleHindi: 'राधा की विदाई',
        visualPrompt: 'Yamuna riverbank sunset with Radha in simple saree looking back in sorrow',
        sfxCue: 'night_wind',
        cameraMotion: 'pan-right',
        durationSec: 7,
      },
      {
        id: 'bf-3',
        part: 'middle',
        shotType: 'climax_closeup',
        narrationHindi: 'उस बांसुरी को चट्टान पर तोड़ दिया।',
        subtitleHindi: 'टूट गई बांसुरी',
        visualPrompt: 'Striking bamboo flute against rough mossy stone with splinters flying',
        sfxCue: 'thunder_rumble',
        cameraMotion: 'zoom-out',
        durationSec: 7,
      },
    ],
  });

  assert.ok(brokenFluteMatched[0].imageUrl?.includes('tears_flute'));
  assert.ok(brokenFluteMatched[1].imageUrl?.includes('radha_farewell'));
  assert.ok(brokenFluteMatched[2].imageUrl?.includes('broken_flute'));

  // Custom uploads are preserved while legacy 3D snapshots are upgraded
  assert.equal(isCustomUploadedFrameUrl('/api/frames/story-1-upload-sc1-123.png'), true);
  assert.equal(isCustomUploadedFrameUrl('/api/frames/story-1-ai-sc1-123.svg'), true);
  assert.equal(isCustomUploadedFrameUrl('/api/frames/story-1-3d-sc1-123.png'), false);

  const customOutOfCatalog = analyzeAndMatchStoryArt({
    topic: 'horror',
    title: 'Haunted Abandoned Hospital Ward',
    scenes: [
      {
        id: 'm1',
        part: 'beginning',
        shotType: 'character_hook',
        narrationHindi: 'बंद अस्पताल की लिफ्ट अपने आप चौथी मंजिल पर रुक गई।',
        subtitleHindi: 'बंद अस्पताल की लिफ्ट',
        visualPrompt: 'Creaky rusty hospital elevator doors opening into bright neon surgical operating room at 3am',
        sfxCue: 'night_wind',
        cameraMotion: 'zoom-in',
        durationSec: 8,
      },
    ],
  });
  assert.deepEqual(customOutOfCatalog.lowConfidenceIndices, [0]);
});

test('parseWavDurationSecondsFromBytes parses RIFF header accurately without under-rounding audio tail', () => {
  // Construct minimal valid 44-byte RIFF/WAVE header at 24kHz mono 16-bit (48000 byteRate) + 1539840 bytes (32.08s)
  const dataSize = 1_539_840;
  const wav = new Uint8Array(44 + dataSize);
  const view = new DataView(wav.buffer);
  wav.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 36 + dataSize, true);
  wav.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  wav.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt 
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  wav.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, dataSize, true);

  assert.equal(parseWavDurationSecondsFromBytes(wav), 32.08);
  const scaled = scaleScenesToAudioDuration(sampleScenes, 32.08);
  // Uses Math.ceil(32.08) = 33 so spoken tail never gets clipped by integer rounding
  assert.equal(calculateTotalDuration(scaled), 33);
  assert.ok(getEffectivePlaybackDurationSec(sampleScenes, 32.08) >= 32.43);
});

test('getRecommendedScenePlan creates 10 fast frames for 30s Shorts & Reels and splitScene divides segments cleanly', () => {
  const fastReel = getRecommendedScenePlan('instagram_reel', 'fast_30s');
  assert.equal(fastReel.sceneCount, 10);
  assert.equal(fastReel.targetDurationSec, 32);

  const stdReel = getRecommendedScenePlan('instagram_reel', 'standard');
  assert.equal(stdReel.sceneCount, 8);
  assert.equal(stdReel.targetDurationSec, 44);

  assert.deepEqual(computeSplitSceneDurations(24), [12, 12]);
  assert.deepEqual(computeSplitSceneDurations(27), [13, 14]);
  assert.deepEqual(computeSplitSceneDurations(12), [6, 6]);

  const longScene: StoryScene = {
    id: 'sc-long',
    part: 'middle',
    shotType: 'wide_establishing',
    narrationHindi: 'अर्जुन ने कुरुक्षेत्र में गांडीव उठाया। तभी श्री कृष्ण ने दिव्य शंखनाद किया।',
    subtitleHindi: 'अर्जुन ने गांडीव उठाया और शंखनाद गूंजा',
    visualPrompt: 'Arjuna lifting Gandiva bow on chariot beside Krishna',
    sfxCue: 'conch_shankh',
    cameraMotion: 'zoom-in',
    durationSec: 24,
  };

  const [half1, half2] = buildSplitSceneHalves(longScene, {
    firstHalf: {
      visualPrompt: 'Close-up of Arjuna trembling hands gripping Gandiva bow on golden chariot',
    },
    secondHalf: {
      visualPrompt: 'Lord Krishna lifting shining Panchajanya conch shell against stormy battle sky',
    },
  });

  assert.equal(half1.durationSec, 12);
  assert.equal(half2.durationSec, 12);
  assert.notEqual(half1.id, half2.id);
  assert.notEqual(half1.visualPrompt, half2.visualPrompt);
  assert.ok(half1.narrationHindi.includes('गांडीव'));
  assert.ok(half2.narrationHindi.includes('शंखनाद'));

  assert.equal(getOutroCtaCopy('krishna', 1, 2), 'आगे क्या हुआ? Part 2 जरूर देखें!');
  assert.equal(getOutroCtaCopy('horror', 2, 2), 'अगली डरावनी कहानी के लिए Follow करें');
});

test('analyzeAndMatchStoryArt strictly keeps topic universe even with 8+ split scenes', () => {
  const manyKrishnaScenes: StoryScene[] = Array.from({ length: 8 }, (_, idx) => ({
    id: `k-${idx}`,
    part: idx < 3 ? 'beginning' : idx < 6 ? 'middle' : 'ending',
    shotType: 'wide_establishing',
    narrationHindi: `श्री कृष्ण वृंदावन वन में लीला दृश्य ${idx + 1}`,
    subtitleHindi: `दृश्य ${idx + 1}`,
    visualPrompt: 'Lord Krishna in misty glowing forest at golden twilight with emotional bow',
    sfxCue: 'bansuri_flute',
    cameraMotion: 'zoom-in',
    durationSec: 4,
  }));

  const analysis = analyzeAndMatchStoryArt({
    topic: 'krishna',
    title: 'Krishna Forest Leela',
    scenes: manyKrishnaScenes,
  });

  for (const sc of analysis.scenes) {
    assert.ok(
      !sc.imageUrl?.includes('ramayana') && !sc.imageUrl?.includes('horror') && !sc.imageUrl?.includes('mahabharata'),
      `Unexpected cross-topic image: ${sc.imageUrl}`
    );
  }
  assert.ok(analysis.lowConfidenceIndices.length >= 1);
});

test('scaleScenesToAudioDuration distributes proportionally across 8 scenes and split preserves 3s/4s totals', () => {
  assert.deepEqual(computeSplitSceneDurations(3), [1.5, 1.5]);
  assert.deepEqual(computeSplitSceneDurations(4), [2, 2]);

  const eightScenes: StoryScene[] = Array.from({ length: 8 }, (_, idx) => ({
    id: `fast-${idx}`,
    part: idx < 2 ? 'beginning' : idx < 6 ? 'middle' : 'ending',
    shotType: 'wide_establishing',
    narrationHindi: 'श्री कृष्ण ने वृंदावन में अद्भुत लीला दिखाई।',
    subtitleHindi: `दृश्य ${idx + 1}`,
    visualPrompt: 'Krishna in Vrindavan',
    sfxCue: 'bansuri_flute',
    cameraMotion: 'zoom-in',
    durationSec: idx === 7 ? 7 : 3,
  }));

  const scaled = scaleScenesToAudioDuration(eightScenes, 24.32);
  const total = calculateTotalDuration(scaled);
  assert.equal(total, 25);
  // Final scene must not bloat to 7s and create a silent audio tail
  assert.ok(scaled[7].durationSec <= 4.5, `Expected balanced final scene, got ${scaled[7].durationSec}`);
});

test('expanded Ramayana, Mahabharata, Hindu Gods, and Horror catalog art matches accurately with crying guard', () => {
  const ramayanaMatched = matchStoryScenesToArt({
    topic: 'ramayana',
    title: 'Swarna Mriga & Lanka Battle',
    scenes: [
      {
        id: 'r-1',
        part: 'beginning',
        shotType: 'character_hook',
        narrationHindi: 'पंचवटी में एक दिव्य स्वर्ण मृग दिखाई दिया!',
        subtitleHindi: 'स्वर्ण मृग की माया',
        visualPrompt: 'Golden glowing spotted deer Mareecha in Panchavati forest sunlit clearing',
        sfxCue: 'bansuri_flute',
        cameraMotion: 'zoom-in',
        durationSec: 4,
      },
      {
        id: 'r-2',
        part: 'middle',
        shotType: 'climax_closeup',
        narrationHindi: 'वानर सेना ने समुद्र पर राम सेतु का निर्माण शुरू किया।',
        subtitleHindi: 'राम सेतु निर्माण',
        visualPrompt: 'Floating inscribed stones forming Ram Setu bridge over turquoise ocean',
        sfxCue: 'conch_shankh',
        cameraMotion: 'pan-right',
        durationSec: 4,
      },
      {
        id: 'r-3',
        part: 'ending',
        shotType: 'climax_closeup',
        narrationHindi: 'श्री राम और रावण के बीच अंतिम महासंग्राम हुआ।',
        subtitleHindi: 'राम-रावण युद्ध',
        visualPrompt: 'Fierce aerial battle between Lord Rama golden chariot and ten-headed Ravana',
        sfxCue: 'thunder_rumble',
        cameraMotion: 'zoom-out',
        durationSec: 4,
      },
    ],
  });
  assert.ok(ramayanaMatched[0].imageUrl?.includes('golden_deer'));
  assert.ok(ramayanaMatched[1].imageUrl?.includes('setu_bridge'));
  assert.ok(ramayanaMatched[2].imageUrl?.includes('ravana_battle'));

  const karnaMatched = matchStoryScenesToArt({
    topic: 'mahabharata',
    title: 'Karna Last Stand',
    scenes: [
      {
        id: 'm-1',
        part: 'middle',
        shotType: 'climax_closeup',
        narrationHindi: 'दानवीर कर्ण का रथ का पहिया कीचड़ में धंस गया।',
        subtitleHindi: 'रथ का पहिया धंस गया',
        visualPrompt: 'Heroic warrior Karna lifting sunken golden chariot wheel stuck in mud',
        sfxCue: 'thunder_rumble',
        cameraMotion: 'zoom-in',
        durationSec: 5,
      },
    ],
  });
  assert.ok(karnaMatched[0].imageUrl?.includes('karna_wheel'));

  const tandavMatched = matchStoryScenesToArt({
    topic: 'hindu_gods',
    title: 'Shiva Tandav & Maa Durga',
    scenes: [
      {
        id: 'g-1',
        part: 'middle',
        shotType: 'climax_closeup',
        narrationHindi: 'महादेव ने रौद्र तांडव नृत्य प्रारंभ किया।',
        subtitleHindi: 'महादेव का तांडव',
        visualPrompt: 'Cosmic Lord Shiva performing fierce Tandav dance amidst fire ring',
        sfxCue: 'thunder_rumble',
        cameraMotion: 'zoom-in',
        durationSec: 5,
      },
      {
        id: 'g-2',
        part: 'ending',
        shotType: 'character_hook',
        narrationHindi: 'माँ दुर्गा सिंह पर सवार होकर प्रकट हुईं।',
        subtitleHindi: 'माँ दुर्गा का अवतार',
        visualPrompt: 'Maa Durga riding roaring lion wielding shining trident',
        sfxCue: 'temple_bell',
        cameraMotion: 'zoom-out',
        durationSec: 5,
      },
    ],
  });
  assert.ok(tandavMatched[0].imageUrl?.includes('shiva_tandav'));
  assert.ok(tandavMatched[1].imageUrl?.includes('maa_durga'));

  // Crying flute art must not hijack joyful flute blessing scenes
  const joyfulMatched = matchStoryScenesToArt({
    topic: 'krishna',
    title: 'Joyful Vrindavan Morning',
    scenes: [
      {
        id: 'k-joy',
        part: 'beginning',
        shotType: 'character_hook',
        narrationHindi: 'कन्हैया की मधुर बांसुरी सुनकर पूरा वृंदावन झूम उठा।',
        subtitleHindi: 'मधुर बांसुरी की तान',
        visualPrompt: 'Happy Lord Krishna smiling while playing golden bansuri by Yamuna',
        sfxCue: 'bansuri_flute',
        cameraMotion: 'zoom-in',
        durationSec: 5,
      },
    ],
  });
  assert.ok(!joyfulMatched[0].imageUrl?.includes('tears_flute'));
});

test('concatenateWavClipsWithActDurations merges 3 act WAVs and aligns scene spans to exact act boundaries', () => {
  const makeTestWav = (durationSec: number): Uint8Array => {
    const byteRate = 48000;
    const dataSize = Math.round(durationSec * byteRate);
    const buf = new Uint8Array(44 + dataSize);
    const view = new DataView(buf.buffer);
    buf.set([0x52, 0x49, 0x46, 0x46], 0);
    view.setUint32(4, 36 + dataSize, true);
    buf.set([0x57, 0x41, 0x56, 0x45], 8);
    buf.set([0x66, 0x6d, 0x74, 0x20], 12);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 24000, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    buf.set([0x64, 0x61, 0x74, 0x61], 36);
    view.setUint32(40, dataSize, true);
    return buf;
  };

  const clip1 = makeTestWav(4.0);
  const clip2 = makeTestWav(6.0);
  const clip3 = makeTestWav(3.5);
  const merged = concatenateWavClipsWithActDurations([clip1, clip2, clip3], 0.14);

  assert.equal(merged.actDurationsSec.length, 3);
  assert.ok(Math.abs(merged.totalDurationSec - (4.0 + 6.0 + 3.5 + 0.28)) < 0.03);
  assert.ok(Math.abs(parseWavDurationSecondsFromBytes(merged.wavBytes) - merged.totalDurationSec) < 0.03);

  const actGroups: StoryScene[][] = [
    [sampleScenes[0]],
    [sampleScenes[1]],
    [sampleScenes[2]],
  ];
  const synced = scaleScenesWithinActDurations(actGroups, merged.actDurationsSec);
  assert.equal(synced.length, 3);
  assert.ok(Math.abs(synced[0].durationSec - merged.actDurationsSec[0]) < 0.02);
  assert.ok(Math.abs(synced[1].durationSec - merged.actDurationsSec[1]) < 0.02);
  assert.ok(Math.abs(synced[2].durationSec - merged.actDurationsSec[2]) < 0.02);
});

test('pickBestUnusedCatalogAsset and negative guards prevent Radha farewell, Kansa, or Kevat from hijacking unrelated scenes', () => {
  const fruitOutroMatched = matchStoryScenesToArt({
    topic: 'krishna',
    title: 'Bal Krishna & Fruit Seller',
    scenes: [
      {
        id: 'fo-1',
        part: 'beginning',
        shotType: 'character_hook',
        sceneArtId: 'krishna_toddler_rice',
        narrationHindi: 'नन्हे कान्हा मुट्ठी में चावल लेकर भागे।',
        subtitleHindi: 'मुट्ठी में चावल',
        visualPrompt: 'Bal Krishna running holding rice grains in cupped palms',
        sfxCue: 'bansuri_flute',
        cameraMotion: 'zoom-in',
        durationSec: 4,
      },
      {
        id: 'fo-2',
        part: 'middle',
        shotType: 'climax_closeup',
        sceneArtId: 'krishna_fruit_seller',
        narrationHindi: 'फलवाली के पास मीठे आम की टोकरी थी।',
        subtitleHindi: 'फलवाली की टोकरी',
        visualPrompt: 'Fruit seller woman with basket of mangoes in Vrindavan',
        sfxCue: 'temple_bell',
        cameraMotion: 'zoom-in',
        durationSec: 4,
      },
      {
        id: 'fo-3',
        part: 'ending',
        shotType: 'resolution_vista',
        sceneArtId: 'custom',
        narrationHindi: 'पर आगे क्या चमत्कार हुआ जानने को Part 2 देखें!',
        subtitleHindi: 'आगे क्या हुआ? Part 2 देखें!',
        visualPrompt: 'Emotional cliffhanger sunset over Vrindavan village lane',
        sfxCue: 'temple_bell',
        cameraMotion: 'zoom-out',
        durationSec: 4,
      },
    ],
  });

  // Scene 3 should pick versatile serene Vrindavan/lotus art — never Radha farewell, Kansa, or Kaliya
  assert.ok(!fruitOutroMatched[2].imageUrl?.includes('radha_farewell'));
  assert.ok(!fruitOutroMatched[2].imageUrl?.includes('kansa_sabha'));
  assert.ok(!fruitOutroMatched[2].imageUrl?.includes('kaliya_naag'));

  // Explicit Ramayana exile hint should not get displaced by Kevat boat on golden deer story
  const deerMatched = matchStoryScenesToArt({
    topic: 'ramayana',
    title: 'Golden Deer & Sita Haran',
    scenes: [
      {
        id: 'gd-1',
        part: 'beginning',
        shotType: 'character_hook',
        sceneArtId: 'ramayana_golden_deer',
        narrationHindi: 'पंचवटी वन में सोने का हिरण दिखा!',
        subtitleHindi: 'सोने का हिरण',
        visualPrompt: 'Golden deer in forest',
        sfxCue: 'bansuri_flute',
        cameraMotion: 'zoom-in',
        durationSec: 4,
      },
      {
        id: 'gd-2',
        part: 'beginning',
        shotType: 'wide_establishing',
        sceneArtId: 'ramayana_exile_forest',
        narrationHindi: 'दंडकारण्य वन में राम, सीता और लक्ष्मण थे।',
        subtitleHindi: 'दंडकारण्य वन',
        visualPrompt: 'Rama Sita Lakshmana walking tranquil forest trail',
        sfxCue: 'night_wind',
        cameraMotion: 'pan-right',
        durationSec: 4,
      },
    ],
  });

  assert.ok(deerMatched[0].imageUrl?.includes('golden_deer'));
  assert.ok(deerMatched[1].imageUrl?.includes('ramayana_setup'));
});

test('resolveSceneTransitionMode and buildAutoTransitionSequence enforce coherent transitions and per-scene overrides', () => {
  // Explicit global override applies when scene transitionIn is unset or 'auto'
  assert.equal(
    resolveSceneTransitionMode('fade', sampleScenes[0], sampleScenes[1], 0, 'krishna'),
    'fade'
  );
  assert.equal(
    resolveSceneTransitionMode('slide', sampleScenes[0], sampleScenes[1], 0, 'krishna'),
    'slide'
  );

  // Per-scene explicit override wins over global setting
  const sceneWithExplicitFade: StoryScene = { ...sampleScenes[1], transitionIn: 'fade' };
  assert.equal(
    resolveSceneTransitionMode('slide', sampleScenes[0], sceneWithExplicitFade, 0, 'krishna'),
    'fade'
  );

  // Automated story-coherent planning varies smoothly across beats without locking a single flat cut
  const planned = buildAutoTransitionSequence(
    [
      { ...sampleScenes[0], cameraMotion: 'zoom-in' },
      { ...sampleScenes[1], cameraMotion: 'pan-right', sfxCue: 'temple_bell' },
      { ...sampleScenes[1], id: 's2b', cameraMotion: 'zoom-in', sfxCue: 'thunder_rumble' },
      { ...sampleScenes[2], part: 'ending', shotType: 'resolution_vista' },
    ],
    'krishna'
  );

  assert.equal(planned[0].transitionIn, 'auto');
  assert.equal(planned[1].transitionIn, 'slide');
  assert.equal(planned[2].transitionIn, 'fade');
  assert.equal(planned[3].transitionIn, 'cross_dissolve');
});
