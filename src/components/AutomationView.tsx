import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Eye,
  Film,
  Infinity as InfinityIcon,
  Play,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import type {
  DailyAutomationConfig,
  PrebuiltVoiceName,
  StoryProject,
  StoryTopic,
  VideoFormat,
  VoiceTone,
  YouTubeAccount,
} from '../lib/types';

interface AutomationViewProps {
  automation: DailyAutomationConfig;
  youtubeAccount: YouTubeAccount;
  pendingApprovalStories: StoryProject[];
  onSaveAutomation: (config: DailyAutomationConfig) => Promise<void>;
  onRunDailyBatch: (topicOverride?: StoryTopic) => Promise<void>;
  onRunHorrorSeriesBatch: (params: {
    count: number;
    format: VideoFormat;
    customPremise: string;
  }) => Promise<StoryProject[]>;
  onCreateAndUploadHorror2Parts: (opts: {
    format?: VideoFormat;
    customPremise?: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
    onProgress?: (msg: string) => void;
  }) => Promise<StoryProject[]>;
  onApproveStory: (storyId: string) => Promise<void>;
  onDeclineStory: (storyId: string) => Promise<void>;
  onApproveAllPending: (storyIds: string[]) => Promise<void>;
  onOpenStory: (storyId: string) => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function AutomationView({
  automation,
  youtubeAccount,
  pendingApprovalStories,
  onSaveAutomation,
  onRunDailyBatch,
  onRunHorrorSeriesBatch,
  onCreateAndUploadHorror2Parts,
  onApproveStory,
  onDeclineStory,
  onApproveAllPending,
  onOpenStory,
}: AutomationViewProps) {
  const [config, setConfig] = useState<DailyAutomationConfig>({
    ...automation,
    requirePublishPermission: automation.requirePublishPermission ?? true,
    dailyLimitsDisabled: automation.dailyLimitsDisabled ?? true,
    horrorPartWiseEnabled: automation.horrorPartWiseEnabled ?? true,
    horrorSeriesDailyCount: automation.horrorSeriesDailyCount ?? 2,
  });
  const [horrorFormat, setHorrorFormat] = useState<VideoFormat>('youtube_short');
  const [horrorPremise, setHorrorPremise] = useState('');
  const [saving, setSaving] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [runningHorrorSeries, setRunningHorrorSeries] = useState(false);
  const [uploading2Parts, setUploading2Parts] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setConfig({
      ...automation,
      requirePublishPermission: automation.requirePublishPermission ?? true,
      dailyLimitsDisabled: automation.dailyLimitsDisabled ?? true,
      horrorPartWiseEnabled: automation.horrorPartWiseEnabled ?? true,
      horrorSeriesDailyCount: automation.horrorSeriesDailyCount ?? 2,
    });
  }, [automation]);

  const toggleFormat = (fmt: VideoFormat) => {
    const exists = config.formats.includes(fmt);
    const next = exists
      ? config.formats.filter((f) => f !== fmt)
      : [...config.formats, fmt];
    setConfig({ ...config, formats: next.length > 0 ? next : [fmt] });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onSaveAutomation(config);
      setFeedback('Automation schedule, unlimited mode, and permission rules saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save automation settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunBatch = async () => {
    setRunningBatch(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onRunDailyBatch();
      setFeedback(
        config.requirePublishPermission !== false
          ? 'Automated stories were generated and placed in your Permission Queue for review.'
          : 'Automated multi-format stories were generated and scheduled.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Batch generation failed.');
    } finally {
      setRunningBatch(false);
    }
  };

  const handleRunHorrorParts = async (overrideCount?: number) => {
    setRunningHorrorSeries(true);
    setFeedback(null);
    setErrorMsg(null);
    const maxAllowed = config.dailyLimitsDisabled !== false ? 20 : 5;
    const count = Math.max(1, Math.min(maxAllowed, overrideCount ?? config.horrorSeriesDailyCount ?? 2));
    try {
      await onRunHorrorSeriesBatch({
        count,
        format: horrorFormat,
        customPremise: horrorPremise,
      });
      setHorrorPremise('');
      setFeedback(
        config.requirePublishPermission !== false
          ? `${count} connected Horror Part-Wise videos (Part 1 to Part ${count}) created! Review below or upload to ${youtubeAccount.channelId || 'YouTube'}.`
          : `${count} Horror Part-Wise videos created.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Horror series batch failed.');
    } finally {
      setRunningHorrorSeries(false);
    }
  };

  const handleDirect2PartYouTubeUpload = async () => {
    setUploading2Parts(true);
    setFeedback('Authorizing Google YouTube & preparing 2 Horror Parts...');
    setErrorMsg(null);
    try {
      const uploaded = await onCreateAndUploadHorror2Parts({
        format: horrorFormat,
        customPremise: horrorPremise,
        privacyStatus: 'public',
        onProgress: (msg) => setFeedback(msg),
      });
      setHorrorPremise('');
      setFeedback(
        `Uploaded ${uploaded.length} Horror videos directly to YouTube (${youtubeAccount.channelId || 'Channel'})!`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Direct 2-part upload failed.');
    } finally {
      setUploading2Parts(false);
    }
  };

  const handleApproveOne = async (storyId: string) => {
    setApprovingId(storyId);
    setErrorMsg(null);
    try {
      await onApproveStory(storyId);
      setFeedback('Permission granted — video approved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not approve video.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeclineOne = async (storyId: string) => {
    setApprovingId(storyId);
    setErrorMsg(null);
    try {
      await onDeclineStory(storyId);
      setFeedback('Removed from permission queue.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not dismiss item.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveBatch = async () => {
    if (pendingApprovalStories.length === 0) return;
    setApprovingAll(true);
    setErrorMsg(null);
    try {
      await onApproveAllPending(pendingApprovalStories.map((s) => s.id));
      setFeedback(
        `Permission granted! All ${pendingApprovalStories.length} pending videos approved.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Batch approval failed.');
    } finally {
      setApprovingAll(false);
    }
  };

  const limitsOff = config.dailyLimitsDisabled !== false;

  return (
    <div className="space-y-6">
      {/* Horror Part-Wise Series + Direct YouTube Upload */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-orange-700" />
              <h2 className="text-base font-semibold text-slate-900">
                Part-Wise Horror Series &amp; Direct YouTube Upload
              </h2>
              <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                <InfinityIcon className="h-3 w-3" />
                <span>{limitsOff ? 'Daily Limits: OFF' : 'Daily Limit Active'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Create connected Hindi horror parts with unlimited daily runs and upload directly to YouTube channel {youtubeAccount.channelId || 'UCGEptT_IzEoW8BkrtE_bPRg'}.
            </p>
            {youtubeAccount.channelId && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600">
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-800">
                  Target YouTube ID: {youtubeAccount.channelId}
                </span>
                <a
                  href={`https://studio.youtube.com/channel/${youtubeAccount.channelId}/videos/upload`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-orange-700 hover:text-orange-800"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Open Channel Upload</span>
                </a>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDirect2PartYouTubeUpload()}
              disabled={uploading2Parts || runningHorrorSeries || runningBatch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-orange-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>{uploading2Parts ? 'Uploading 2 Parts...' : 'Create & Upload 2 Horror Parts to YouTube'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleRunHorrorParts()}
              disabled={uploading2Parts || runningHorrorSeries || runningBatch}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" />
              <span>
                {runningHorrorSeries
                  ? `Creating ${config.horrorSeriesDailyCount ?? 2} Parts...`
                  : `Create ${config.horrorSeriesDailyCount ?? 2} Horror Parts`}
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-3">
            <label htmlFor="horror-parts-count" className="block text-xs font-medium text-slate-700 mb-1">
              Horror Parts Per Run
            </label>
            <select
              id="horror-parts-count"
              value={config.horrorSeriesDailyCount ?? 2}
              onChange={(e) =>
                setConfig({
                  ...config,
                  horrorSeriesDailyCount: Math.max(1, Number(e.target.value) || 2),
                })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            >
              <option value={2}>2 Horror Parts (YouTube Series)</option>
              <option value={3}>3 Horror Parts</option>
              <option value={5}>5 Horror Parts</option>
              {limitsOff && <option value={10}>10 Horror Parts (Unlimited)</option>}
            </select>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="horror-parts-format" className="block text-xs font-medium text-slate-700 mb-1">
              Target Channel Format
            </label>
            <select
              id="horror-parts-format"
              value={horrorFormat}
              onChange={(e) => setHorrorFormat(e.target.value as VideoFormat)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            >
              <option value="youtube_short">YouTube Shorts (9:16)</option>
              <option value="instagram_reel">Instagram Reels (9:16)</option>
              <option value="youtube_long">YouTube Long-Form (16:9)</option>
            </select>
          </div>

          <div className="md:col-span-6">
            <label htmlFor="horror-premise" className="block text-xs font-medium text-slate-700 mb-1">
              Horror Story Premise (Optional)
            </label>
            <input
              id="horror-premise"
              type="text"
              value={horrorPremise}
              onChange={(e) => setHorrorPremise(e.target.value)}
              placeholder="e.g., Midnight haunted railway station curse in 2 suspenseful parts"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            />
          </div>
        </div>

        {/* Permission Queue */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-orange-700" />
              <span className="text-sm font-semibold text-slate-900">
                Permission Queue ({pendingApprovalStories.length} Awaiting Approval)
              </span>
            </div>
            {pendingApprovalStories.length > 0 && (
              <button
                type="button"
                disabled={approvingAll}
                onClick={() => void handleApproveBatch()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {approvingAll
                    ? 'Approving All...'
                    : `Grant Permission & Approve All (${pendingApprovalStories.length})`}
                </span>
              </button>
            )}
          </div>

          {pendingApprovalStories.length === 0 ? (
            <p className="text-xs text-slate-500">
              No stories waiting for permission. Generate horror parts above or click &ldquo;Create &amp; Upload 2 Horror Parts to YouTube&rdquo;.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {pendingApprovalStories.map((story) => (
                <div
                  key={story.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
                        {story.totalParts && story.totalParts > 1
                          ? `Part ${story.partNumber ?? 1}/${story.totalParts}`
                          : story.topic.toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {story.titleHindi}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {story.scenes.length} anime frames · {story.audioDurationSec}s Hindi audio ready
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenStory(story.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      disabled={approvingId === story.id}
                      onClick={() => void handleApproveOne(story.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={approvingId === story.id}
                      onClick={() => void handleDeclineOne(story.id)}
                      aria-label={`Decline ${story.titleHindi}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:text-red-700 hover:border-red-200"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Automation &amp; Daily Limit Controls
            </h2>
            <p className="text-xs text-slate-500">
              Daily video limits are turned OFF so you can generate and publish unlimited videos anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunBatch}
            disabled={runningBatch || runningHorrorSeries}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            <Play className="h-4 w-4" />
            <span>{runningBatch ? 'Generating Batch...' : 'Run Multi-Format Batch'}</span>
          </button>
        </div>

        {feedback && (
          <div role="status" className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-slate-900">Daily Limits OFF</div>
                <div className="text-xs text-emerald-700">Unlimited creation</div>
              </div>
              <input
                type="checkbox"
                checked={config.dailyLimitsDisabled !== false}
                onChange={(e) =>
                  setConfig({ ...config, dailyLimitsDisabled: e.target.checked })
                }
                className="h-4 w-4 accent-emerald-700"
              />
            </label>

            <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3.5 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-slate-900">Require Permission</div>
                <div className="text-xs text-slate-500">Approve before upload</div>
              </div>
              <input
                type="checkbox"
                checked={config.requirePublishPermission !== false}
                onChange={(e) =>
                  setConfig({ ...config, requirePublishPermission: e.target.checked })
                }
                className="h-4 w-4 accent-orange-700"
              />
            </label>

            <div>
              <label htmlFor="auto-time" className="block text-xs font-medium text-slate-700 mb-1.5">
                Preferred Publish Time
              </label>
              <input
                id="auto-time"
                type="time"
                value={config.publishTimeLocal}
                onChange={(e) => setConfig({ ...config, publishTimeLocal: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="auto-voice" className="block text-xs font-medium text-slate-700 mb-1.5">
                Default Hindi Voice &amp; Tone
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  id="auto-voice"
                  value={config.voiceName}
                  onChange={(e) =>
                    setConfig({ ...config, voiceName: e.target.value as PrebuiltVoiceName })
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 focus:border-orange-700 focus:outline-none"
                >
                  <option value="Charon">Charon</option>
                  <option value="Kore">Kore</option>
                  <option value="Zephyr">Zephyr</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Puck">Puck</option>
                </select>
                <select
                  aria-label="Default voice tone"
                  value={config.voiceTone}
                  onChange={(e) =>
                    setConfig({ ...config, voiceTone: e.target.value as VoiceTone })
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-900 focus:border-orange-700 focus:outline-none"
                >
                  <option value="horror_suspense">Horror</option>
                  <option value="devotional_warm">Devotional</option>
                  <option value="epic_dramatic">Epic</option>
                  <option value="calm_storyteller">Calm</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Multi-Format Output {limitsOff ? '(No Daily Cap)' : '& Daily Targets'}
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={config.formats.includes('youtube_short')}
                    onChange={() => toggleFormat('youtube_short')}
                    className="h-4 w-4 accent-orange-700"
                  />
                  <span>YouTube Shorts</span>
                </label>
                <input
                  type="number"
                  aria-label="YouTube Shorts batch count"
                  min={0}
                  value={config.dailyTargets.youtubeShorts}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      dailyTargets: {
                        ...config.dailyTargets,
                        youtubeShorts: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1 font-mono text-sm text-center tabular-nums"
                />
              </div>

              <div className="rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={config.formats.includes('instagram_reel')}
                    onChange={() => toggleFormat('instagram_reel')}
                    className="h-4 w-4 accent-orange-700"
                  />
                  <span>Instagram Reels</span>
                </label>
                <input
                  type="number"
                  aria-label="Instagram Reels batch count"
                  min={0}
                  value={config.dailyTargets.instagramReels}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      dailyTargets: {
                        ...config.dailyTargets,
                        instagramReels: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1 font-mono text-sm text-center tabular-nums"
                />
              </div>

              <div className="rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={config.formats.includes('youtube_long')}
                    onChange={() => toggleFormat('youtube_long')}
                    className="h-4 w-4 accent-orange-700"
                  />
                  <span>YouTube Long-Form</span>
                </label>
                <input
                  type="number"
                  aria-label="YouTube Long-Form batch count"
                  min={0}
                  value={config.dailyTargets.youtubeLong}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      dailyTargets: {
                        ...config.dailyTargets,
                        youtubeLong: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1 font-mono text-sm text-center tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Weekly Topic Rotation Calendar
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {DAYS.map((day) => (
                <div key={day} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-900 mb-2">{day}</div>
                  <select
                    aria-label={`${day} story topic`}
                    value={config.weeklyTopics[day] ?? 'horror'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        weeklyTopics: {
                          ...config.weeklyTopics,
                          [day]: e.target.value as StoryTopic,
                        },
                      })
                    }
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-orange-700 focus:outline-none"
                  >
                    <option value="horror">Horror</option>
                    <option value="krishna">Krishna</option>
                    <option value="ramayana">Ramayana</option>
                    <option value="mahabharata">Mahabharata</option>
                    <option value="hindu_gods">Hindu Gods</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <CalendarClock className="h-4 w-4" />
              <span>
                Last batch run: {config.lastBatchRunDate || 'Not run yet'}
              </span>
            </span>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Automation Settings'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
