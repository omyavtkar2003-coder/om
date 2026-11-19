export type StoryTopic =
  | 'horror'
  | 'ramayana'
  | 'krishna'
  | 'mahabharata'
  | 'hindu_gods';

export type VideoFormat =
  | 'youtube_short'
  | 'instagram_reel'
  | 'youtube_long';

export type VoiceTone =
  | 'devotional_warm'
  | 'epic_dramatic'
  | 'horror_suspense'
  | 'calm_storyteller';

export type PrebuiltVoiceName = 'Kore' | 'Charon' | 'Puck' | 'Fenrir' | 'Zephyr';

export type StoryStatus = 'draft' | 'voice_ready' | 'scheduled' | 'published';

export type ScenePart = 'beginning' | 'middle' | 'ending';

export type CameraMotion = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';

export type SfxCue =
  | 'temple_bell'
  | 'bansuri_flute'
  | 'conch_shankh'
  | 'thunder_rumble'
  | 'night_wind'
  | 'none';

export type BgmMood = 'devotional_tanpura' | 'epic_drums' | 'eerie_horror' | 'serene_flute';

export type VideoVisualStyle = 'anime' | 'cinematic';

export type TransitionEffect = 'auto' | 'cross_dissolve' | 'fade' | 'slide';

export type SceneShotType =
  | 'character_hook'
  | 'wide_establishing'
  | 'climax_closeup'
  | 'resolution_vista';

export interface StoryScene {
  id: string;
  part: ScenePart;
  shotType?: SceneShotType;
  hookCaption?: string;
  narrationHindi: string;
  subtitleHindi: string;
  visualPrompt: string;
  sfxCue: SfxCue;
  cameraMotion: CameraMotion;
  transitionIn?: TransitionEffect;
  durationSec: number;
  sceneArtId?: string;
  imageUrl?: string;
  videoUrl?: string;
}

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  thumbnailHeadline: string;
  category: string;
}

export interface InstagramMetadata {
  caption: string;
  hashtags: string[];
  hookLine: string;
}

export interface StoryMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  estimatedIncomeInr: number;
}

export type StoryPacingMode = 'fast_30s' | 'standard';

export interface StoryProject {
  id: string;
  title: string;
  titleHindi: string;
  topic: StoryTopic;
  format: VideoFormat;
  pacingMode?: StoryPacingMode;
  seriesId?: string;
  partNumber?: number;
  totalParts?: number;
  cliffhangerHindi?: string;
  nextPartPrompt?: string;
  visualStyle?: VideoVisualStyle;
  transitionEffect?: TransitionEffect;
  artVersion?: number;
  tone: VoiceTone;
  voiceName: PrebuiltVoiceName;
  bgmMood: BgmMood;
  bgmAudioUrl?: string | null;
  bgmLyrics?: string | null;
  omniVideoUrl?: string | null;
  customInstruction: string;
  beginning: string;
  middle: string;
  ending: string;
  scenes: StoryScene[];
  audioUrl: string | null;
  audioDurationSec: number;
  youtube: YouTubeMetadata;
  instagram: InstagramMetadata;
  status: StoryStatus;
  awaitingPermission?: boolean;
  approvalBatchId?: string;
  youtubeVideoId?: string;
  youtubeUploadUrl?: string;
  youtubePrivacyStatus?: 'public' | 'unlisted' | 'private';
  liveMetricsSyncedAt?: string;
  scheduledFor: string | null;
  publishedChannels: ('youtube' | 'instagram')[];
  metrics: StoryMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface YouTubeAccount {
  connected: boolean;
  channelId?: string;
  channelName: string;
  handle: string;
  subscribers: number;
  monetized: boolean;
  oauthMode: 'oauth' | 'studio_profile';
  lastSyncedAt: string | null;
}

export interface InstagramAccount {
  connected: boolean;
  username: string;
  displayName: string;
  followers: number;
  professionalAccount: boolean;
  oauthMode: 'oauth' | 'studio_profile';
  lastSyncedAt: string | null;
}

export interface ConnectedAccounts {
  youtube: YouTubeAccount;
  instagram: InstagramAccount;
}

export interface DailyAutomationConfig {
  enabled: boolean;
  publishTimeLocal: string;
  formats: VideoFormat[];
  voiceTone: VoiceTone;
  voiceName: PrebuiltVoiceName;
  weeklyTopics: Record<string, StoryTopic>;
  dailyTargets: {
    youtubeShorts: number;
    instagramReels: number;
    youtubeLong: number;
  };
  requirePublishPermission?: boolean;
  dailyLimitsDisabled?: boolean;
  horrorPartWiseEnabled?: boolean;
  horrorSeriesDailyCount?: number;
  lastBatchRunDate: string | null;
}

export interface BiometricCredentialRecord {
  credentialId: string;
  deviceLabel: string;
  transports: string[];
  createdAt: string;
}

export interface CreatorUser {
  id: string;
  loginId?: string;
  displayName: string;
  email?: string;
  mobileNumber?: string;
  firebaseUid?: string;
  authMethod: 'google' | 'email' | 'mobile_biometric' | 'credentials';
  biometricEnabled: boolean;
  biometricCredentials: BiometricCredentialRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface IncomeEntry {
  id: string;
  date: string;
  source: 'youtube_adsense' | 'instagram_bonus' | 'sponsorship';
  storyId?: string;
  description: string;
  amountInr: number;
}

export interface OAuthEnvStatus {
  youtubeOAuthReady: boolean;
  instagramOAuthReady: boolean;
  appUrl: string;
}

export interface StudioState {
  stories: StoryProject[];
  accounts: ConnectedAccounts;
  automation: DailyAutomationConfig;
  incomeEntries: IncomeEntry[];
  oauthEnv: OAuthEnvStatus;
}
