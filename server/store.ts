import fs from 'fs';
import path from 'path';
import {
  calculateTotalDuration,
  matchStoryScenesToArt,
  parseWavDurationSecondsFromBytes,
  scaleScenesToAudioDuration,
} from '../src/lib/studioLogic';
import type {
  ConnectedAccounts,
  DailyAutomationConfig,
  IncomeEntry,
  OAuthEnvStatus,
  StoryProject,
  StoryScene,
  StudioState,
} from '../src/lib/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUDIO_DIR = path.resolve(DATA_DIR, 'audio');
const FRAMES_DIR = path.resolve(DATA_DIR, 'frames');
const VIDEOS_DIR = path.resolve(DATA_DIR, 'videos');
const DB_FILE = path.resolve(DATA_DIR, 'studio-db.json');

function ensureDirs() {
  for (const dir of [DATA_DIR, AUDIO_DIR, FRAMES_DIR, VIDEOS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function getAudioDir(): string {
  ensureDirs();
  return AUDIO_DIR;
}

export function getFramesDir(): string {
  ensureDirs();
  return FRAMES_DIR;
}

export function getVideosDir(): string {
  ensureDirs();
  return VIDEOS_DIR;
}

export function getOAuthEnvStatus(): OAuthEnvStatus {
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return {
    youtubeOAuthReady: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
    instagramOAuthReady: Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
    appUrl,
  };
}

function createInitialSeed(): Omit<StudioState, 'oauthEnv'> {
  const stories: StoryProject[] = [];

  const accounts: ConnectedAccounts = {
    youtube: {
      connected: true,
      channelId: 'UCGEptT_IzEoW8BkrtE_bPRg',
      channelName: 'YouTube Channel (UCGEptT_IzEoW8BkrtE_bPRg)',
      handle: '@UCGEptT_IzEoW8BkrtE_bPRg',
      subscribers: 0,
      monetized: false,
      oauthMode: 'oauth',
      lastSyncedAt: null,
    },
    instagram: {
      connected: false,
      username: '',
      displayName: '',
      followers: 0,
      professionalAccount: false,
      oauthMode: 'oauth',
      lastSyncedAt: null,
    },
  };

  const automation: DailyAutomationConfig = {
    enabled: true,
    publishTimeLocal: '19:00',
    formats: ['youtube_short', 'instagram_reel', 'youtube_long'],
    voiceTone: 'horror_suspense',
    voiceName: 'Charon',
    weeklyTopics: {
      Mon: 'horror',
      Tue: 'horror',
      Wed: 'krishna',
      Thu: 'ramayana',
      Fri: 'horror',
      Sat: 'mahabharata',
      Sun: 'hindu_gods',
    },
    dailyTargets: {
      youtubeShorts: 0,
      instagramReels: 0,
      youtubeLong: 0,
    },
    requirePublishPermission: true,
    dailyLimitsDisabled: true,
    horrorPartWiseEnabled: true,
    horrorSeriesDailyCount: 2,
    lastBatchRunDate: null,
  };

  const incomeEntries: IncomeEntry[] = [];

  return { stories, accounts, automation, incomeEntries };
}

function normalizeStoryScenes(db: Omit<StudioState, 'oauthEnv'>): {
  db: Omit<StudioState, 'oauthEnv'>;
  changed: boolean;
} {
  let changed = false;
  db.stories = db.stories.map((story) => {
    if (!story.scenes || story.scenes.length === 0) return story;

    const needsArtMatch =
      story.artVersion !== 2 ||
      story.scenes.some(
        (s) =>
          !s.imageUrl ||
          s.imageUrl.startsWith('/src/assets/images/scene_') ||
          s.imageUrl.includes('-3d-sc')
      );

    const preparedScenes: StoryScene[] = story.scenes.map((sc, idx) => {
      const nextShot =
        sc.shotType ??
        (idx === 0
          ? 'character_hook'
          : idx === story.scenes.length - 1
            ? 'resolution_vista'
            : idx % 2 === 1
              ? 'climax_closeup'
              : 'wide_establishing');
      const hookCaption =
        idx === 0 ? sc.hookCaption || story.instagram?.hookLine || story.titleHindi : sc.hookCaption;
      return { ...sc, shotType: nextShot, hookCaption };
    });

    let syncedStoryAudioUrl = story.audioUrl;
    let syncedAudioDuration = story.audioDurationSec;
    let durationSyncedScenes: StoryScene[] = preparedScenes;

    if (syncedStoryAudioUrl && syncedStoryAudioUrl.startsWith('/api/audio/')) {
      const audioFilePath = path.join(AUDIO_DIR, path.basename(syncedStoryAudioUrl));
      if (!fs.existsSync(audioFilePath)) {
        syncedStoryAudioUrl = null;
        changed = true;
      } else {
        try {
          const wavBuf = fs.readFileSync(audioFilePath);
          const exactSec = parseWavDurationSecondsFromBytes(new Uint8Array(wavBuf));
          if (exactSec > 0) {
            const ceilSec = Math.max(5, Math.ceil(exactSec));
            if (syncedAudioDuration !== ceilSec) {
              syncedAudioDuration = ceilSec;
              changed = true;
            }
            if (calculateTotalDuration(durationSyncedScenes) > exactSec + 1.0) {
              durationSyncedScenes = scaleScenesToAudioDuration(durationSyncedScenes, ceilSec);
              changed = true;
            }
          }
        } catch {
          // ignore unreadable wav metadata
        }
      }
    }

    if (!needsArtMatch) {
      return {
        ...story,
        audioUrl: syncedStoryAudioUrl,
        audioDurationSec: syncedAudioDuration,
        visualStyle: story.visualStyle ?? 'anime',
        scenes: durationSyncedScenes,
      };
    }

    changed = true;
    const matchedScenes = matchStoryScenesToArt(
      {
        topic: story.topic,
        title: story.title,
        titleHindi: story.titleHindi,
        scenes: durationSyncedScenes,
      },
      { preserveCustomUploads: true }
    );

    return {
      ...story,
      audioUrl: syncedStoryAudioUrl,
      audioDurationSec: syncedAudioDuration,
      visualStyle: story.visualStyle ?? 'anime',
      artVersion: 2,
      scenes: matchedScenes,
    };
  });
  return { db, changed };
}

function readRawDb(): Omit<StudioState, 'oauthEnv'> {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Omit<StudioState, 'oauthEnv'>;
    const { db, changed: sceneChanged } = normalizeStoryScenes(parsed);
    let changed = sceneChanged;
    if (
      db.automation &&
      (db.automation.requirePublishPermission === undefined ||
        db.automation.dailyLimitsDisabled === undefined ||
        db.automation.horrorPartWiseEnabled === undefined ||
        db.automation.horrorSeriesDailyCount === undefined)
    ) {
      db.automation = {
        ...db.automation,
        requirePublishPermission: db.automation.requirePublishPermission ?? true,
        dailyLimitsDisabled: db.automation.dailyLimitsDisabled ?? true,
        horrorPartWiseEnabled: db.automation.horrorPartWiseEnabled ?? true,
        horrorSeriesDailyCount: db.automation.horrorSeriesDailyCount ?? 2,
      };
      changed = true;
    }
    if (db.accounts?.youtube && !db.accounts.youtube.channelId) {
      db.accounts = {
        ...db.accounts,
        youtube: {
          ...db.accounts.youtube,
          channelId: 'UCGEptT_IzEoW8BkrtE_bPRg',
        },
      };
      changed = true;
    }
    if (changed) {
      writeRawDb(db);
    }
    return db;
  } catch {
    const initial = createInitialSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

function writeRawDb(data: Omit<StudioState, 'oauthEnv'>): void {
  ensureDirs();
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempFile, DB_FILE);
}

export function getStudioState(): StudioState {
  const db = readRawDb();
  return {
    ...db,
    oauthEnv: getOAuthEnvStatus(),
  };
}

export function addStory(story: StoryProject): StoryProject {
  const db = readRawDb();
  db.stories = [story, ...db.stories];
  writeRawDb(db);
  return story;
}

export function getStoryById(id: string): StoryProject | undefined {
  const db = readRawDb();
  return db.stories.find((s) => s.id === id);
}

export function updateStory(
  id: string,
  updater: (existing: StoryProject) => StoryProject
): StoryProject | null {
  const db = readRawDb();
  const index = db.stories.findIndex((s) => s.id === id);
  if (index === -1) return null;
  const updated = updater(db.stories[index]);
  db.stories[index] = { ...updated, updatedAt: new Date().toISOString() };
  writeRawDb(db);
  return db.stories[index];
}

export function deleteStory(id: string): boolean {
  const db = readRawDb();
  const prevLen = db.stories.length;
  db.stories = db.stories.filter((s) => s.id !== id);
  if (db.stories.length === prevLen) return false;
  writeRawDb(db);
  return true;
}

export function updateAccounts(accounts: ConnectedAccounts): ConnectedAccounts {
  const db = readRawDb();
  db.accounts = accounts;
  writeRawDb(db);
  return db.accounts;
}

export function updateAutomation(automation: DailyAutomationConfig): DailyAutomationConfig {
  const db = readRawDb();
  db.automation = automation;
  writeRawDb(db);
  return db.automation;
}

export function addIncomeEntry(entry: IncomeEntry): IncomeEntry {
  const db = readRawDb();
  db.incomeEntries = [entry, ...db.incomeEntries];
  writeRawDb(db);
  return entry;
}
