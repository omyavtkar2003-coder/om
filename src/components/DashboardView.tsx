import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Film,
  IndianRupee,
  Infinity as InfinityIcon,
  Play,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Users,
} from 'lucide-react';
import { getCachedYouTubeAccessToken } from '../firebase';
import {
  computeCreatorMetrics,
  formatCompactNumber,
  formatDurationMMSS,
  formatIndianCurrency,
  getFormatSpec,
  getTopicConfig,
} from '../lib/studioLogic';
import type {
  StoryPacingMode,
  StoryProject,
  StoryTopic,
  StudioState,
  VideoFormat,
} from '../lib/types';
import type { StudioTab } from './Sidebar';

interface DashboardViewProps {
  state: StudioState;
  onNavigate: (tab: StudioTab) => void;
  onOpenStory: (storyId: string) => void;
  onQuickGenerate: (params: {
    topic: StoryTopic;
    format: VideoFormat;
    customInstruction: string;
    pacingMode?: StoryPacingMode;
    totalParts?: number;
  }) => Promise<void>;
  onRunDailyBatch: () => Promise<void>;
  onCreateAndUploadHorror2Parts: (opts: {
    format?: VideoFormat;
    customPremise?: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
    onProgress?: (msg: string) => void;
  }) => Promise<StoryProject[]>;
  onCreateHorror2PartsOnly: (premise: string) => Promise<void>;
  onSyncLiveYouTubeStats: () => Promise<void>;
  isGenerating: boolean;
}

const TOPICS: { id: StoryTopic; label: string }[] = [
  { id: 'horror', label: 'Horror' },
  { id: 'krishna', label: 'Lord Krishna' },
  { id: 'ramayana', label: 'Ramayana' },
  { id: 'mahabharata', label: 'Mahabharata' },
  { id: 'hindu_gods', label: 'Hindu Gods' },
];

export function DashboardView({
  state,
  onNavigate,
  onOpenStory,
  onQuickGenerate,
  onCreateAndUploadHorror2Parts,
  onCreateHorror2PartsOnly,
  onSyncLiveYouTubeStats,
  isGenerating,
}: DashboardViewProps) {
  const [quickTopic, setQuickTopic] = useState<StoryTopic>('horror');
  const [quickFormat, setQuickFormat] = useState<VideoFormat>('youtube_short');
  const [quickParts, setQuickParts] = useState<number>(2);
  const [quickInstruction, setQuickInstruction] = useState('');
  const [horrorPremise, setHorrorPremise] = useState('');
  const [horrorPrivacy, setHorrorPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [horrorFormat, setHorrorFormat] = useState<VideoFormat>('youtube_short');
  const [uploadingHorror, setUploadingHorror] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string | null>(null);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [syncingStats, setSyncingStats] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const metrics = computeCreatorMetrics(state.stories, state.incomeEntries);
  const liveStories = state.stories.filter(
    (s) => s.status === 'published' || Boolean(s.youtubeVideoId)
  );
  const hasLiveData =
    liveStories.length > 0 ||
    Boolean(state.accounts.youtube.lastSyncedAt) ||
    state.incomeEntries.length > 0;

  const combinedFollowers =
    (state.accounts.youtube.lastSyncedAt ? state.accounts.youtube.subscribers : 0) +
    (state.accounts.instagram.connected && state.accounts.instagram.lastSyncedAt
      ? state.accounts.instagram.followers
      : 0);

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchError(null);
    try {
      await onQuickGenerate({
        topic: quickTopic,
        format: quickFormat,
        customInstruction: quickInstruction,
        pacingMode: quickFormat === 'youtube_long' ? 'standard' : 'fast_30s',
        totalParts: quickParts,
      });
      setQuickInstruction('');
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Generation failed.');
    }
  };

  const handleDirectUploadHorror2Parts = async () => {
    setBatchError(null);
    setUploadedUrls([]);
    setUploadingHorror(true);
    setUploadProgressMsg('Preparing 2-Part Horror series for YouTube...');
    try {
      const uploaded = await onCreateAndUploadHorror2Parts({
        format: horrorFormat,
        customPremise: horrorPremise.trim(),
        privacyStatus: horrorPrivacy,
        onProgress: (msg) => setUploadProgressMsg(msg),
      });
      setUploadedUrls(uploaded.map((s) => s.youtubeUploadUrl).filter(Boolean) as string[]);
      setHorrorPremise('');
      setUploadProgressMsg(
        `Uploaded ${uploaded.length} Horror video parts directly to YouTube (${state.accounts.youtube.channelId || 'Connected Channel'})!`
      );
    } catch (err) {
      setBatchError(
        err instanceof Error ? err.message : 'Direct 2-part YouTube upload failed.'
      );
      setUploadProgressMsg(null);
    } finally {
      setUploadingHorror(false);
    }
  };

  const handleCreateHorrorDraftOnly = async () => {
    setBatchError(null);
    setUploadProgressMsg(null);
    try {
      await onCreateHorror2PartsOnly(horrorPremise.trim());
      setHorrorPremise('');
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Could not create 2-part horror videos.');
    }
  };

  const handleSyncLive = async () => {
    setBatchError(null);
    setSyncingStats(true);
    try {
      await onSyncLiveYouTubeStats();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Could not sync live YouTube metrics.');
    } finally {
      setSyncingStats(false);
    }
  };

  const recentStories: StoryProject[] = state.stories.slice(0, 6);
  const ytAuthorized = Boolean(getCachedYouTubeAccessToken());

  return (
    <div className="space-y-8">
      {/* Live-Only Telemetry Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
            <span
              className={`h-2 w-2 rounded-full ${hasLiveData ? 'bg-emerald-600' : 'bg-slate-300'}`}
              aria-hidden="true"
            />
            <span>{hasLiveData ? 'Live YouTube Data Active' : 'No Live Video Data Yet'}</span>
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="text-slate-600">
            {hasLiveData
              ? `Showing live metrics from ${liveStories.length} uploaded video(s)`
              : 'Metrics remain blank until you upload your first video to YouTube.'}
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
            <InfinityIcon className="h-3.5 w-3.5" />
            <span>
              {state.automation.dailyLimitsDisabled !== false
                ? 'Daily Limits: OFF (Unlimited)'
                : 'Daily Schedule Active'}
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleSyncLive()}
          disabled={syncingStats}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60 whitespace-nowrap"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncingStats ? 'animate-spin' : ''}`} />
          <span>{syncingStats ? 'Syncing Live Data...' : 'Sync Live YouTube Data'}</span>
        </button>
      </div>

      {/* 4-Column Live Creator KPI Strip (Hidden/Blank until videos go live) */}
      <section aria-label="Live creator performance metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Live Video Views</span>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {liveStories.length > 0 ? formatCompactNumber(metrics.totalViews) : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {liveStories.length > 0
              ? `${metrics.publishedCount} live on YouTube`
              : 'Waiting for first uploaded video'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Live Channel Subscribers</span>
            <Users className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {state.accounts.youtube.lastSyncedAt ? formatCompactNumber(combinedFollowers) : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 truncate">
            {state.accounts.youtube.channelId
              ? `ID: ${state.accounts.youtube.channelId}`
              : 'Target YouTube channel'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Live Engagement</span>
            <Film className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {liveStories.length > 0 ? `${metrics.engagementRatePct}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {liveStories.length > 0
              ? `${formatCompactNumber(metrics.totalLikes)} likes`
              : 'Shows after YouTube upload'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Verified Creator Income</span>
            <IndianRupee className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {state.incomeEntries.length > 0 || metrics.totalIncomeInr > 0
              ? formatIndianCurrency(metrics.totalIncomeInr)
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {state.incomeEntries.length > 0
              ? `${state.incomeEntries.length} logged entries`
              : 'No payout entries logged yet'}
          </div>
        </div>
      </section>

      {/* Main 2-Column Workspace: Direct 2-Part Horror YouTube Uploader + Quick Story Generator */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Direct 2-Part Horror Series YouTube Uploader */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Direct 2-Part Horror YouTube Upload
              </h2>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                {state.accounts.youtube.channelId || 'UCGEptT_IzEoW8BkrtE_bPRg'}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Generate a 2-part Hindi horror series with AI anime visuals &amp; voiceover, render both videos, and upload them directly to your YouTube channel. Daily limits are OFF.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="horror-direct-format" className="block text-xs font-medium text-slate-700 mb-1">
                  YouTube Format
                </label>
                <select
                  id="horror-direct-format"
                  value={horrorFormat}
                  onChange={(e) => setHorrorFormat(e.target.value as VideoFormat)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                >
                  <option value="youtube_short">YouTube Shorts (9:16)</option>
                  <option value="youtube_long">YouTube Long-Form (16:9)</option>
                </select>
              </div>
              <div>
                <label htmlFor="horror-direct-privacy" className="block text-xs font-medium text-slate-700 mb-1">
                  YouTube Privacy
                </label>
                <select
                  id="horror-direct-privacy"
                  value={horrorPrivacy}
                  onChange={(e) =>
                    setHorrorPrivacy(e.target.value as 'public' | 'unlisted' | 'private')
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                >
                  <option value="public">Public (Live on Channel)</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="horror-direct-premise" className="block text-xs font-medium text-slate-700 mb-1">
                Horror Story Topic / Angle (Optional)
              </label>
              <input
                id="horror-direct-premise"
                type="text"
                value={horrorPremise}
                onChange={(e) => setHorrorPremise(e.target.value)}
                placeholder="e.g., Amavasya night haunted well in 2 chilling parts"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-700 focus:outline-none"
              />
            </div>

            {uploadProgressMsg && (
              <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 space-y-1.5">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span>{uploadProgressMsg}</span>
                </div>
                {uploadedUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {uploadedUrls.map((url, idx) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-900 underline"
                      >
                        <span>Watch Part {idx + 1}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {batchError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {batchError}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={uploadingHorror || isGenerating}
              onClick={() => void handleDirectUploadHorror2Parts()}
              data-testid="direct-horror-2part-upload-btn"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <UploadCloud className="h-4 w-4" />
              <span>
                {uploadingHorror
                  ? 'Creating & Uploading 2 Parts...'
                  : ytAuthorized
                    ? 'Create & Upload 2 Horror Parts Now'
                    : 'Authorize & Upload 2 Horror Parts'}
              </span>
            </button>
            <button
              type="button"
              disabled={uploadingHorror || isGenerating}
              onClick={() => void handleCreateHorrorDraftOnly()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Create 2 Parts First</span>
            </button>
          </div>
        </section>

        {/* Custom AI Story & Video Generator */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              AI Story &amp; Video Creator (Unlimited)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Create unlimited stories with Hindi AI narration, timed anime scenes, and YouTube / Instagram metadata.
            </p>

            <form onSubmit={handleQuickSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Select Story Topic
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                  {TOPICS.map((t) => {
                    const active = quickTopic === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setQuickTopic(t.id)}
                        className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap truncate ${
                          active
                            ? 'border-orange-700 bg-orange-700 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="quick-format" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Target Video Format
                  </label>
                  <select
                    id="quick-format"
                    value={quickFormat}
                    onChange={(e) => setQuickFormat(e.target.value as VideoFormat)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                  >
                    <option value="youtube_short">YouTube Shorts (9:16 · 30s)</option>
                    <option value="instagram_reel">Instagram Reels (9:16 · 30s)</option>
                    <option value="youtube_long">YouTube Long-Form (16:9)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="quick-parts" className="block text-xs font-medium text-slate-700 mb-1.5">
                    30s Multi-Frame &amp; Parts Mode
                  </label>
                  <select
                    id="quick-parts"
                    value={quickParts}
                    onChange={(e) => setQuickParts(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                  >
                    <option value={2}>Part 1 of 2 (10 Frames · Series)</option>
                    <option value={3}>Part 1 of 3 (10 Frames · Series)</option>
                    <option value={1}>Single Story (30s · 10 Frames)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="quick-instruction" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Optional Story Angle or Prompt
                </label>
                <input
                  id="quick-instruction"
                  type="text"
                  value={quickInstruction}
                  onChange={(e) => setQuickInstruction(e.target.value)}
                  placeholder="e.g., Haunted haveli corridor or Krishna leela"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-700 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isGenerating || uploadingHorror}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{isGenerating ? 'Generating Story...' : 'Create Video & Open Studio'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('studio')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <span>Full Studio Controls</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      {/* Live Uploaded Videos & Created Queue */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Videos &amp; Live Upload Status
            </h2>
            <p className="text-xs text-slate-500">
              Live views &amp; engagement appear here automatically after each video is uploaded to YouTube.
            </p>
          </div>
          {state.stories.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="text-xs font-medium text-orange-700 hover:text-orange-800 whitespace-nowrap"
            >
              View All ({state.stories.length})
            </button>
          )}
        </div>

        {recentStories.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
            <Film className="mx-auto h-7 w-7 text-slate-300" />
            <div className="text-sm font-medium text-slate-700">No videos created or uploaded yet</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              All sample/mock data has been removed. Create and upload your 2-part horror video above to see real live data here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {recentStories.map((story) => {
              const topicCfg = getTopicConfig(story.topic);
              const formatSpec = getFormatSpec(story.format);
              const thumb = story.scenes[0]?.imageUrl || topicCfg.defaultImage;
              const isLiveOnYouTube = story.status === 'published' || Boolean(story.youtubeVideoId);

              return (
                <div
                  key={story.id}
                  className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                      <img
                        src={thumb}
                        alt={story.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-900">
                        {story.titleHindi}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{topicCfg.label}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatSpec.label}</span>
                        {(story.totalParts ?? 1) > 1 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-orange-700">
                              Part {story.partNumber ?? 1}/{story.totalParts}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{story.scenes.length} frames</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatDurationMMSS(story.audioDurationSec)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            isLiveOnYouTube
                              ? 'font-medium text-emerald-700'
                              : story.status === 'scheduled'
                                ? 'font-medium text-amber-700'
                                : 'font-medium text-slate-700'
                          }
                        >
                          {isLiveOnYouTube
                            ? 'Live on YouTube'
                            : story.status === 'scheduled'
                              ? 'Scheduled'
                              : story.status === 'voice_ready'
                                ? 'Ready to Upload'
                                : 'Draft'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {isLiveOnYouTube ? (
                      <div className="text-right hidden md:block">
                        <div className="font-mono text-xs font-medium text-slate-900 tabular-nums">
                          {formatCompactNumber(story.metrics.views)} live views
                        </div>
                        <div className="font-mono text-xs text-slate-500 tabular-nums">
                          {formatCompactNumber(story.metrics.likes)} likes
                        </div>
                      </div>
                    ) : (
                      <span className="hidden md:inline text-xs text-slate-400">
                        Not uploaded yet
                      </span>
                    )}

                    {story.youtubeUploadUrl && (
                      <a
                        href={story.youtubeUploadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                      >
                        <span>Watch</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenStory(story.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Open Studio</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
