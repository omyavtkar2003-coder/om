import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Layers,
  Mic,
  Save,
  Scissors,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  UploadCloud,
  Volume2,
  Wand2,
} from 'lucide-react';
import {
  connectYouTubeChannelWithGoogle,
  getCachedYouTubeAccessToken,
} from '../firebase';
import { bytesToBase64 } from '../lib/liveAudio';
import {
  buildAutoTransitionSequence,
  formatDurationMMSS,
  getFormatSpec,
  getTopicConfig,
  resolveSceneTransitionMode,
  TRANSITION_EFFECT_OPTIONS,
} from '../lib/studioLogic';
import { StudioAudioMixer } from '../lib/audioEngine';
import {
  exportStoryVideo,
  loadSceneImage,
  renderThumbnailToCanvas,
} from '../lib/videoEngine';
import type {
  ConnectedAccounts,
  PrebuiltVoiceName,
  StoryPacingMode,
  StoryProject,
  StoryTopic,
  TransitionEffect,
  VideoFormat,
  VoiceTone,
} from '../lib/types';
import { VideoStudioPlayer } from './VideoStudioPlayer';
import { VoiceStudioPanel } from './VoiceStudioPanel';

interface StudioViewProps {
  stories: StoryProject[];
  selectedStoryId: string | null;
  onSelectStory: (id: string) => void;
  accounts: ConnectedAccounts;
  onGenerateStory: (params: {
    topic: StoryTopic;
    format: VideoFormat;
    tone: VoiceTone;
    voiceName: PrebuiltVoiceName;
    customInstruction: string;
    pacingMode?: StoryPacingMode;
    totalParts?: number;
  }) => Promise<StoryProject>;
  onGenerateNextPart: (storyId: string) => Promise<StoryProject>;
  onGenerateVoiceover: (
    storyId: string,
    tone: VoiceTone,
    voiceName: PrebuiltVoiceName
  ) => Promise<StoryProject>;
  onSaveStory: (storyId: string, patch: Partial<StoryProject>) => Promise<StoryProject>;
  onStoryUpdated: (updated: StoryProject) => void;
  onPublishStory: (
    storyId: string,
    channels: ('youtube' | 'instagram')[],
    scheduleFor?: string | null,
    options?: { confirmRepublish?: boolean }
  ) => Promise<StoryProject>;
}

const VOICES: { id: PrebuiltVoiceName; label: string }[] = [
  { id: 'Kore', label: 'Kore (Warm Expressive)' },
  { id: 'Charon', label: 'Charon (Deep Dramatic)' },
  { id: 'Zephyr', label: 'Zephyr (Calm Devotional)' },
  { id: 'Fenrir', label: 'Fenrir (Bold Heroic)' },
  { id: 'Puck', label: 'Puck (Crisp Narrator)' },
];

const TONES: { id: VoiceTone; label: string }[] = [
  { id: 'devotional_warm', label: 'Devotional & Emotional' },
  { id: 'epic_dramatic', label: 'Epic Mythological' },
  { id: 'horror_suspense', label: 'Horror & Suspense' },
  { id: 'calm_storyteller', label: 'Calm Storyteller' },
];

export function StudioView({
  stories,
  selectedStoryId,
  onSelectStory,
  accounts,
  onGenerateStory,
  onGenerateNextPart,
  onGenerateVoiceover,
  onSaveStory,
  onStoryUpdated,
  onPublishStory,
}: StudioViewProps) {
  const activeStory =
    stories.find((s) => s.id === selectedStoryId) || stories[0] || null;

  // Generator controls
  const [genTopic, setGenTopic] = useState<StoryTopic>(activeStory?.topic ?? 'krishna');
  const [genFormat, setGenFormat] = useState<VideoFormat>(activeStory?.format ?? 'instagram_reel');
  const [genTone, setGenTone] = useState<VoiceTone>(activeStory?.tone ?? 'devotional_warm');
  const [genVoice, setGenVoice] = useState<PrebuiltVoiceName>(activeStory?.voiceName ?? 'Kore');
  const [genPacing, setGenPacing] = useState<StoryPacingMode>('fast_30s');
  const [genTotalParts, setGenTotalParts] = useState<number>(2);
  const [genInstruction, setGenInstruction] = useState('');

  // Quick mic dictation into story prompt
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribingPrompt, setIsTranscribingPrompt] = useState(false);
  const dictRecorderRef = useRef<MediaRecorder | null>(null);
  const dictChunksRef = useRef<BlobPart[]>([]);

  // Editable draft state synced to activeStory
  const [draft, setDraft] = useState<StoryProject | null>(activeStory);
  const [workspaceTab, setWorkspaceTab] = useState<'script' | 'video' | 'publish' | 'voice'>(
    activeStory?.audioUrl ? 'video' : 'script'
  );

  // Publish state
  const [pubYouTube, setPubYouTube] = useState(true);
  const [pubInstagram, setPubInstagram] = useState(true);
  const [scheduleTime, setScheduleTime] = useState('');

  // Action feedback states
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [isGeneratingNextPart, setIsGeneratingNextPart] = useState(false);
  const [splittingSceneIndex, setSplittingSceneIndex] = useState<number | null>(null);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingTransitions, setIsUpdatingTransitions] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [republishConfirm, setRepublishConfirm] = useState<{
    channels: ('youtube' | 'instagram')[];
    asSchedule: boolean;
    alreadyOn: ('youtube' | 'instagram')[];
  } | null>(null);
  const [ytPrivacy, setYtPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [ytUploadConfirm, setYtUploadConfirm] = useState<{
    isRepublish: boolean;
    allowMismatch?: boolean;
    mismatchChannel?: string;
  } | null>(null);
  const [ytUploadProgress, setYtUploadProgress] = useState<string | null>(null);
  const [ytAuthorized, setYtAuthorized] = useState(() => Boolean(getCachedYouTubeAccessToken()));
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setDraft(activeStory);
    setRepublishConfirm(null);
    setYtUploadConfirm(null);
    setYtUploadProgress(null);
    if (activeStory) {
      setGenTone(activeStory.tone);
      setGenVoice(activeStory.voiceName);
      setScheduleTime(activeStory.scheduledFor ?? '');
    }
  }, [activeStory]);

  // Render live Canvas Thumbnail whenever Publish tab or headline changes
  useEffect(() => {
    if (workspaceTab !== 'publish' || !draft || !thumbCanvasRef.current) return;
    const topicCfg = getTopicConfig(draft.topic);
    const imgSrc = draft.scenes[0]?.imageUrl || topicCfg.defaultImage;
    loadSceneImage(imgSrc).then((img) => {
      if (thumbCanvasRef.current) {
        renderThumbnailToCanvas(thumbCanvasRef.current, draft, img);
      }
    });
  }, [workspaceTab, draft?.id, draft?.youtube.thumbnailHeadline, draft?.format, draft?.topic]);

  const handleGenerateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessMessage(null);
    setIsGeneratingStory(true);
    try {
      const created = await onGenerateStory({
        topic: genTopic,
        format: genFormat,
        tone: genTone,
        voiceName: genVoice,
        customInstruction: genInstruction,
        pacingMode: genPacing,
        totalParts: genTotalParts,
      });
      onSelectStory(created.id);
      setGenInstruction('');
      setWorkspaceTab('video');
      setSuccessMessage(
        genTotalParts > 1
          ? `Part 1 of ${genTotalParts} generated with ${created.scenes.length} anime frames and Hindi AI audio. Use "Generate Part 2" whenever ready.`
          : `New 30s Hindi story (${created.scenes.length} anime frames) and Hindi AI voiceover ready.`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Story generation failed.');
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const handleGenerateNextPartClick = async () => {
    if (!draft) return;
    setErrorBanner(null);
    setSuccessMessage(null);
    setIsGeneratingNextPart(true);
    try {
      const nextStory = await onGenerateNextPart(draft.id);
      onSelectStory(nextStory.id);
      setWorkspaceTab('video');
      setSuccessMessage(
        `Part ${nextStory.partNumber ?? 2} of ${nextStory.totalParts ?? 2} generated seamlessly with ${nextStory.scenes.length} fresh anime frames and Hindi voiceover.`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Could not generate next part.');
    } finally {
      setIsGeneratingNextPart(false);
    }
  };

  const handleSplitScene = async (sceneIndex: number) => {
    if (!draft) return;
    setErrorBanner(null);
    setSuccessMessage(null);
    setSplittingSceneIndex(sceneIndex);
    try {
      const res = await fetch(`/api/stories/${draft.id}/scenes/${sceneIndex}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneOverride: draft.scenes[sceneIndex] }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not split scene.');
      }
      const updated = data.story as StoryProject;
      setDraft(updated);
      onStoryUpdated(updated);
      setSuccessMessage(
        `Scene ${sceneIndex + 1} split into 2 shorter segments (${updated.scenes[sceneIndex]?.durationSec}s + ${updated.scenes[sceneIndex + 1]?.durationSec}s) with new granular image prompts.`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Scene split failed.');
    } finally {
      setSplittingSceneIndex(null);
    }
  };

  const handleVoiceSynthesis = async () => {
    if (!draft) return;
    setErrorBanner(null);
    setSuccessMessage(null);
    setIsGeneratingVoice(true);
    try {
      await onSaveStory(draft.id, {
        title: draft.title,
        titleHindi: draft.titleHindi,
        beginning: draft.beginning,
        middle: draft.middle,
        ending: draft.ending,
        scenes: draft.scenes,
      });
      const updated = await onGenerateVoiceover(draft.id, genTone, genVoice);
      setDraft(updated);
      setSuccessMessage('Hindi AI voiceover generated and synced to your video.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Voiceover synthesis failed.');
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!draft) return;
    setErrorBanner(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const updated = await onSaveStory(draft.id, {
        title: draft.title,
        titleHindi: draft.titleHindi,
        beginning: draft.beginning,
        middle: draft.middle,
        ending: draft.ending,
        scenes: draft.scenes,
        youtube: draft.youtube,
        instagram: draft.instagram,
      });
      setDraft(updated);
      setSuccessMessage('Changes saved to studio library.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGlobalTransitionChange = async (nextEffect: TransitionEffect) => {
    if (!draft) return;
    setErrorBanner(null);
    setSuccessMessage(null);
    setIsUpdatingTransitions(true);
    try {
      const updated = await onSaveStory(draft.id, { transitionEffect: nextEffect });
      setDraft(updated);
      setSuccessMessage(
        nextEffect === 'auto'
          ? 'Automated transition manager active: transitions adapt coherently per scene beat.'
          : `Global transition set to ${nextEffect.replace('_', '-')}.`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update transition mode.');
    } finally {
      setIsUpdatingTransitions(false);
    }
  };

  const handleAutoOptimizeTransitions = async () => {
    if (!draft) return;
    setErrorBanner(null);
    setSuccessMessage(null);
    setIsUpdatingTransitions(true);
    try {
      const nextScenes = buildAutoTransitionSequence(draft.scenes, draft.topic);
      const updated = await onSaveStory(draft.id, {
        transitionEffect: 'auto',
        scenes: nextScenes,
      });
      setDraft(updated);
      setSuccessMessage('Automated transition sequence applied across all story frames.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Could not optimize transitions.');
    } finally {
      setIsUpdatingTransitions(false);
    }
  };

  const handleSceneTransitionChange = async (sceneIndex: number, mode: TransitionEffect) => {
    if (!draft) return;
    setErrorBanner(null);
    setIsUpdatingTransitions(true);
    try {
      const nextScenes = draft.scenes.map((sc, idx) =>
        idx === sceneIndex ? { ...sc, transitionIn: mode } : sc
      );
      const updated = await onSaveStory(draft.id, { scenes: nextScenes });
      setDraft(updated);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Could not update scene transition.');
    } finally {
      setIsUpdatingTransitions(false);
    }
  };

  const handlePublish = async (asSchedule: boolean, confirmRepublish = false) => {
    if (!draft) return;
    setErrorBanner(null);
    setSuccessMessage(null);
    const channels: ('youtube' | 'instagram')[] = [];
    if (pubYouTube) channels.push('youtube');
    if (pubInstagram) channels.push('instagram');

    if (channels.length === 0) {
      setErrorBanner('Select at least one platform to publish.');
      return;
    }

    if (asSchedule && !scheduleTime.trim()) {
      setErrorBanner('Choose a date and time before scheduling.');
      return;
    }

    const alreadyOnTarget = channels.filter((ch) => draft.publishedChannels.includes(ch));
    const isRepublish = draft.status === 'published' || alreadyOnTarget.length > 0;
    if (isRepublish && !confirmRepublish) {
      setRepublishConfirm({
        channels,
        asSchedule,
        alreadyOn: draft.publishedChannels,
      });
      return;
    }

    setRepublishConfirm(null);
    setIsPublishing(true);
    try {
      await onSaveStory(draft.id, {
        youtube: draft.youtube,
        instagram: draft.instagram,
      });
      const updated = await onPublishStory(
        draft.id,
        channels,
        asSchedule ? scheduleTime : null,
        { confirmRepublish }
      );
      setDraft(updated);
      setSuccessMessage(
        asSchedule
          ? `Scheduled for ${scheduleTime.replace('T', ' ')}`
          : confirmRepublish
            ? `Republished (with your permission) to ${channels.join(' & ')}`
            : `Published to ${channels.join(' & ')}`
      );
    } catch (err) {
      const e = err as Error & { requiresRepublishPermission?: boolean };
      if (e.requiresRepublishPermission) {
        setRepublishConfirm({
          channels,
          asSchedule,
          alreadyOn: draft.publishedChannels,
        });
      } else {
        setErrorBanner(e instanceof Error ? e.message : 'Publishing failed.');
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRequestDirectYouTubeUpload = () => {
    if (!draft) return;
    setErrorBanner(null);
    setSuccessMessage(null);
    const isRepublish =
      draft.status === 'published' ||
      draft.publishedChannels.includes('youtube') ||
      Boolean(draft.youtubeVideoId);
    setYtUploadConfirm({ isRepublish });
  };

  const handleConfirmDirectYouTubeUpload = async (allowChannelMismatch = false) => {
    if (!draft) return;
    setErrorBanner(null);
    setSuccessMessage(null);
    setIsPublishing(true);
    setYtUploadProgress('Checking Google YouTube permission...');

    const uploadMixer = new StudioAudioMixer();
    try {
      let token = getCachedYouTubeAccessToken();
      if (!token) {
        const authRes = await connectYouTubeChannelWithGoogle();
        token = authRes.accessToken;
        setYtAuthorized(true);
      }

      // Save latest title, description, tags first
      await onSaveStory(draft.id, {
        youtube: draft.youtube,
        instagram: draft.instagram,
      });

      setYtUploadProgress('Rendering Hindi video + audio (0%)...');
      const exported = await exportStoryVideo({
        story: draft,
        mixer: uploadMixer,
        bgmEnabled: true,
        sfxEnabled: true,
        showSubtitles: true,
        onProgress: (pct) => setYtUploadProgress(`Rendering Hindi video + audio (${pct}%)...`),
      });

      setYtUploadProgress('Uploading video directly to YouTube...');
      const isRepublish =
        draft.status === 'published' ||
        draft.publishedChannels.includes('youtube') ||
        Boolean(draft.youtubeVideoId);

      const uploadRes = await fetch(`/api/youtube/upload/${draft.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': exported.mimeType,
          'x-youtube-privacy': ytPrivacy,
          'x-confirm-republish': isRepublish ? 'true' : 'false',
          'x-allow-channel-mismatch': allowChannelMismatch ? 'true' : 'false',
        },
        body: exported.blob,
      });

      const uploadData = (await uploadRes.json().catch(() => ({}))) as {
        error?: string;
        channelMismatch?: boolean;
        authorizedChannelId?: string;
        authorizedChannelTitle?: string;
        story?: StoryProject;
        youtubeUrl?: string;
        channelId?: string;
      };

      if (!uploadRes.ok) {
        if (uploadData.channelMismatch && uploadData.authorizedChannelId) {
          setYtUploadConfirm({
            isRepublish,
            allowMismatch: true,
            mismatchChannel: `${uploadData.authorizedChannelTitle || 'Channel'} (${uploadData.authorizedChannelId})`,
          });
          setErrorBanner(uploadData.error || 'Authorized YouTube channel does not match target Channel ID.');
          return;
        }
        throw new Error(uploadData.error || 'Direct YouTube upload failed.');
      }

      if (uploadData.story) {
        setDraft(uploadData.story);
        onStoryUpdated(uploadData.story);
      }
      setYtUploadConfirm(null);
      setSuccessMessage(
        `Uploaded directly to YouTube! Watch live at ${uploadData.youtubeUrl || 'YouTube Studio'}`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Direct YouTube upload failed.');
    } finally {
      uploadMixer.stopAll();
      setYtUploadProgress(null);
      setIsPublishing(false);
    }
  };

  const handleToggleDictatePrompt = async () => {
    if (isDictating && dictRecorderRef.current) {
      dictRecorderRef.current.stop();
      setIsDictating(false);
      return;
    }
    setErrorBanner(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType });
      dictChunksRef.current = [];
      dictRecorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) dictChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsTranscribingPrompt(true);
        try {
          const blob = new Blob(dictChunksRef.current, { type: mimeType });
          const b64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
          const res = await fetch('/api/audio/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: b64, mimeType }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Voice transcription failed');
          setGenInstruction((prev) => (prev ? `${prev} ${data.text}` : data.text));
          setSuccessMessage('Spoken prompt transcribed into story instruction.');
        } catch (err) {
          setErrorBanner(err instanceof Error ? err.message : 'Transcription error');
        } finally {
          setIsTranscribingPrompt(false);
        }
      };
      rec.start();
      setIsDictating(true);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Microphone access is required to dictate prompts.'
      );
    }
  };

  const handleDownloadThumbnail = () => {
    if (!thumbCanvasRef.current || !draft) return;
    const url = thumbCanvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.id}-thumbnail.png`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* AI Story Generator Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">AI Story & Script Generator</h2>
            <p className="text-xs text-slate-500">
              Creates a unique story with Beginning, Middle, Ending, timed scenes, Hindi voiceover script, and social metadata.
            </p>
          </div>
          {stories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
              <label htmlFor="active-story-select" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Active Project:
              </label>
              <select
                id="active-story-select"
                value={draft?.id ?? ''}
                onChange={(e) => onSelectStory(e.target.value)}
                className="w-full sm:w-auto sm:max-w-[260px] min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-orange-700 focus:outline-none"
              >
                {stories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titleHindi} ({getFormatSpec(s.format).label})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <form onSubmit={handleGenerateNew} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-3">
            <label htmlFor="studio-topic" className="block text-xs font-medium text-slate-700 mb-1">
              Topic
            </label>
            <select
              id="studio-topic"
              value={genTopic}
              onChange={(e) => setGenTopic(e.target.value as StoryTopic)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            >
              <option value="krishna">Lord Krishna (श्री कृष्ण)</option>
              <option value="ramayana">Ramayana (रामायण)</option>
              <option value="mahabharata">Mahabharata (महाभारत)</option>
              <option value="horror">Horror (डरावनी कहानी)</option>
              <option value="hindu_gods">Hindu Gods & Puranas (पौराणिक)</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="studio-format" className="block text-xs font-medium text-slate-700 mb-1">
              Video Format
            </label>
            <select
              id="studio-format"
              value={genFormat}
              onChange={(e) => setGenFormat(e.target.value as VideoFormat)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            >
              <option value="instagram_reel">Instagram Reels (9:16 · 30s)</option>
              <option value="youtube_short">YouTube Shorts (9:16 · 30s)</option>
              <option value="youtube_long">YouTube Long-Form (16:9)</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="studio-tone" className="block text-xs font-medium text-slate-700 mb-1">
              Narration Style
            </label>
            <select
              id="studio-tone"
              value={genTone}
              onChange={(e) => setGenTone(e.target.value as VoiceTone)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            >
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="studio-voice" className="block text-xs font-medium text-slate-700 mb-1">
              Hindi AI Voice
            </label>
            <select
              id="studio-voice"
              value={genVoice}
              onChange={(e) => setGenVoice(e.target.value as PrebuiltVoiceName)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="studio-pacing" className="block text-xs font-medium text-slate-700 mb-1">
              Frames &amp; Pacing
            </label>
            <select
              id="studio-pacing"
              value={genPacing}
              onChange={(e) => setGenPacing(e.target.value as StoryPacingMode)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            >
              <option value="fast_30s">Fast 30s (10 Frames)</option>
              <option value="standard">Standard (8 Scenes)</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="studio-parts" className="block text-xs font-medium text-slate-700 mb-1">
              Episode Parts
            </label>
            <select
              id="studio-parts"
              value={genTotalParts}
              onChange={(e) => setGenTotalParts(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            >
              <option value={2}>Part 1 of 2 (Series)</option>
              <option value={3}>Part 1 of 3 (Series)</option>
              <option value={1}>Single Story (Complete)</option>
            </select>
          </div>

          <div className="md:col-span-6">
            <label htmlFor="studio-instruction" className="block text-xs font-medium text-slate-700 mb-1">
              Custom Story Prompt or Moral Angle (Type or Dictate via Mic)
            </label>
            <div className="flex gap-2">
              <input
                id="studio-instruction"
                type="text"
                value={genInstruction}
                onChange={(e) => setGenInstruction(e.target.value)}
                placeholder="e.g., Govardhan Parvat miracle in emotional storytelling style, or midnight railway station horror"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleToggleDictatePrompt}
                disabled={isTranscribingPrompt}
                aria-label={isDictating ? 'Stop voice dictation' : 'Dictate prompt via microphone'}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isDictating
                    ? 'border-red-300 bg-red-600 text-white hover:bg-red-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isDictating ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                <span>
                  {isTranscribingPrompt
                    ? 'Transcribing...'
                    : isDictating
                      ? 'Stop Mic'
                      : 'Dictate'}
                </span>
              </button>
            </div>
          </div>

          <div className="md:col-span-12 lg:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={isGeneratingStory}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              <span>{isGeneratingStory ? 'Generating...' : 'Generate Story'}</span>
            </button>
          </div>
        </form>
      </section>

      {errorBanner && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorBanner}
        </div>
      )}

      {successMessage && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {draft ? (
        <section className="rounded-xl border border-slate-200 bg-white">
          {/* Studio Segmented Workspace Tabs + Quick Voice Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Studio workspace sections">
              <button
                type="button"
                role="tab"
                aria-selected={workspaceTab === 'script'}
                onClick={() => setWorkspaceTab('script')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  workspaceTab === 'script'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Script &amp; Hindi Voice
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspaceTab === 'video'}
                onClick={() => setWorkspaceTab('video')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  workspaceTab === 'video'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Video Generator &amp; Export
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspaceTab === 'publish'}
                onClick={() => setWorkspaceTab('publish')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  workspaceTab === 'publish'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3. Thumbnail &amp; Publish
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspaceTab === 'voice'}
                onClick={() => setWorkspaceTab('voice')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  workspaceTab === 'voice'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                4. Live Voice &amp; Mic
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateNextPartClick}
                disabled={isGeneratingNextPart}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3.5 py-2 text-xs font-medium text-orange-800 hover:bg-orange-100 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>
                  {isGeneratingNextPart
                    ? `Creating Part ${(draft.partNumber ?? 1) + 1}...`
                    : `Generate Part ${(draft.partNumber ?? 1) + 1}`}
                </span>
              </button>
              <button
                type="button"
                onClick={handleVoiceSynthesis}
                disabled={isGeneratingVoice}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                <Mic className="h-3.5 w-3.5" />
                <span>{isGeneratingVoice ? 'Synthesizing Hindi...' : 'Generate Hindi Voiceover'}</span>
              </button>
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Script'}</span>
              </button>
            </div>
          </div>

          <div className="p-6">
            {workspaceTab === 'script' && (
              <div className="space-y-6">
                {/* Title & Voice Audio Player */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className="lg:col-span-6">
                    <label htmlFor="edit-title-hindi" className="block text-xs font-medium text-slate-700 mb-1">
                      Hindi Story Title
                    </label>
                    <input
                      id="edit-title-hindi"
                      type="text"
                      value={draft.titleHindi}
                      onChange={(e) => setDraft({ ...draft, titleHindi: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-orange-700 focus:outline-none"
                    />
                  </div>
                  <div className="lg:col-span-6">
                    <label htmlFor="edit-title-english" className="block text-xs font-medium text-slate-700 mb-1">
                      English Reference Title
                    </label>
                    <input
                      id="edit-title-english"
                      type="text"
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Hindi Audio Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-200 py-4">
                  <div className="flex items-center gap-3">
                    <Volume2 className="h-5 w-5 text-orange-700 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        Hindi AI Voiceover Track ({draft.voiceName})
                      </div>
                      <div className="text-xs text-slate-500">
                        {draft.audioUrl
                          ? `Studio WAV ready · ${formatDurationMMSS(draft.audioDurationSec)}`
                          : 'Click "Generate Hindi Voiceover" above to synthesize high-clarity Hindi narration.'}
                      </div>
                    </div>
                  </div>
                  {draft.audioUrl && (
                    <audio controls src={draft.audioUrl} className="h-9 max-w-full" />
                  )}
                </div>

                {/* Beginning, Middle, Ending 3-Act Structure */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div>
                    <label htmlFor="story-beginning" className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Beginning (आरंभ)
                    </label>
                    <textarea
                      id="story-beginning"
                      rows={4}
                      value={draft.beginning}
                      onChange={(e) => setDraft({ ...draft, beginning: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 p-3 text-sm leading-relaxed text-slate-800 focus:border-orange-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="story-middle" className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Middle / Climax (मध्य)
                    </label>
                    <textarea
                      id="story-middle"
                      rows={4}
                      value={draft.middle}
                      onChange={(e) => setDraft({ ...draft, middle: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 p-3 text-sm leading-relaxed text-slate-800 focus:border-orange-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="story-ending" className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Ending / Resolution (समापन)
                    </label>
                    <textarea
                      id="story-ending"
                      rows={4}
                      value={draft.ending}
                      onChange={(e) => setDraft({ ...draft, ending: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 p-3 text-sm leading-relaxed text-slate-800 focus:border-orange-700 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Scene-by-Scene Storyboard with Split Scene & Granular Visual Prompts */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Scene Storyboard &amp; Narration Timing ({draft.scenes.length} Scenes)
                    </h3>
                    <span className="text-xs text-slate-500">
                      Use &ldquo;Split Scene&rdquo; on any scene to divide it into 2 shorter segments with granular image prompts.
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
                    {draft.scenes.map((scene, idx) => {
                      const topicCfg = getTopicConfig(draft.topic);
                      const isSplitting = splittingSceneIndex === idx;
                      return (
                        <div key={scene.id} className="p-4 grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
                          <div className="lg:col-span-2 text-xs text-slate-500 space-y-2">
                            <div className="h-16 w-full overflow-hidden rounded-lg bg-slate-900 border border-slate-200">
                              <img
                                src={scene.imageUrl || topicCfg.defaultImage}
                                alt={`Scene ${idx + 1} visual`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="font-semibold text-slate-900">
                              Scene {idx + 1} · {scene.part}
                            </div>
                            <div>Motion: {scene.cameraMotion}</div>
                            <div>SFX: {scene.sfxCue.replace('_', ' ')}</div>
                            {idx > 0 && (
                              <div>
                                <label
                                  htmlFor={`storyboard-transition-${scene.id}`}
                                  className="block text-[11px] font-medium text-slate-600 mb-0.5"
                                >
                                  Entry Transition
                                </label>
                                <select
                                  id={`storyboard-transition-${scene.id}`}
                                  value={scene.transitionIn ?? 'auto'}
                                  disabled={isUpdatingTransitions}
                                  onChange={(e) =>
                                    void handleSceneTransitionChange(
                                      idx,
                                      e.target.value as TransitionEffect
                                    )
                                  }
                                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 focus:border-orange-700 focus:outline-none"
                                >
                                  <option value="auto">Auto ({resolveSceneTransitionMode(draft.transitionEffect, draft.scenes[idx - 1], scene, idx - 1, draft.topic).replace('_', ' ')})</option>
                                  <option value="cross_dissolve">Cross-Dissolve</option>
                                  <option value="fade">Smooth Fade</option>
                                  <option value="slide">Cinema Slide</option>
                                </select>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleSplitScene(idx)}
                              disabled={splittingSceneIndex !== null}
                              aria-label={`Split Scene ${idx + 1}`}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100 disabled:opacity-60 transition-colors whitespace-nowrap"
                            >
                              <Scissors className="h-3.5 w-3.5" />
                              <span>{isSplitting ? 'Splitting...' : 'Split Scene'}</span>
                            </button>
                          </div>

                          <div className="lg:col-span-4">
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Hindi Voiceover Line
                            </label>
                            <textarea
                              rows={3}
                              value={scene.narrationHindi}
                              onChange={(e) => {
                                const nextScenes = draft.scenes.map((sc) =>
                                  sc.id === scene.id ? { ...sc, narrationHindi: e.target.value } : sc
                                );
                                setDraft({ ...draft, scenes: nextScenes });
                              }}
                              className="w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                            />
                          </div>

                          <div className="lg:col-span-3">
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Granular Image Prompt (Visual)
                            </label>
                            <textarea
                              rows={3}
                              value={scene.visualPrompt}
                              onChange={(e) => {
                                const nextScenes = draft.scenes.map((sc) =>
                                  sc.id === scene.id ? { ...sc, visualPrompt: e.target.value } : sc
                                );
                                setDraft({ ...draft, scenes: nextScenes });
                              }}
                              className="w-full rounded-lg border border-slate-200 p-2 text-xs leading-relaxed text-slate-800 focus:border-orange-700 focus:outline-none"
                            />
                          </div>

                          <div className="lg:col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              On-Screen Subtitle
                            </label>
                            <textarea
                              rows={3}
                              value={scene.subtitleHindi}
                              onChange={(e) => {
                                const nextScenes = draft.scenes.map((sc) =>
                                  sc.id === scene.id ? { ...sc, subtitleHindi: e.target.value } : sc
                                );
                                setDraft({ ...draft, scenes: nextScenes });
                              }}
                              className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-orange-700 focus:outline-none"
                            />
                          </div>

                          <div className="lg:col-span-1">
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Sec
                            </label>
                            <input
                              type="number"
                              min={1.5}
                              max={45}
                              step={0.5}
                              value={scene.durationSec}
                              onChange={(e) => {
                                const nextScenes = draft.scenes.map((sc) =>
                                  sc.id === scene.id
                                    ? { ...sc, durationSec: Math.max(1.5, Number(e.target.value) || 4) }
                                    : sc
                                );
                                setDraft({ ...draft, scenes: nextScenes });
                              }}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-orange-700 focus:outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {workspaceTab === 'video' && (
              <div className="space-y-6">
                {/* Automated Transition Effect Manager */}
                <div
                  data-testid="transition-effect-manager"
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Automated Transition Effect Manager
                      </h4>
                      <p className="text-xs text-slate-500">
                        Choose an automated story-coherent flow or lock Smooth Fade, Cinema Slide, or Cross-Dissolve between frames.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Global transition effect mode"
                        value={draft.transitionEffect ?? 'auto'}
                        disabled={isUpdatingTransitions}
                        onChange={(e) =>
                          void handleGlobalTransitionChange(e.target.value as TransitionEffect)
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-orange-700 focus:outline-none"
                      >
                        {TRANSITION_EFFECT_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAutoOptimizeTransitions()}
                        disabled={isUpdatingTransitions}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-50 disabled:opacity-60 transition-colors whitespace-nowrap"
                      >
                        <Wand2 className="h-3.5 w-3.5 text-orange-700" />
                        <span>{isUpdatingTransitions ? 'Updating...' : 'Auto-Balance Cuts'}</span>
                      </button>
                    </div>
                  </div>

                  {draft.scenes.length > 1 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {draft.scenes.slice(1).map((nextScene, cutIdx) => {
                        const prevScene = draft.scenes[cutIdx];
                        const effectiveMode = resolveSceneTransitionMode(
                          draft.transitionEffect,
                          prevScene,
                          nextScene,
                          cutIdx,
                          draft.topic
                        );
                        return (
                          <div
                            key={`${prevScene.id}-${nextScene.id}`}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px] font-medium text-slate-700">
                              <span>
                                Sc {cutIdx + 1} → {cutIdx + 2}
                              </span>
                              <span className="font-mono text-[10px] uppercase text-orange-700">
                                {effectiveMode.replace('_', ' ')}
                              </span>
                            </div>
                            <select
                              aria-label={`Transition from Scene ${cutIdx + 1} to Scene ${cutIdx + 2}`}
                              value={nextScene.transitionIn ?? 'auto'}
                              disabled={isUpdatingTransitions}
                              onChange={(e) =>
                                void handleSceneTransitionChange(
                                  cutIdx + 1,
                                  e.target.value as TransitionEffect
                                )
                              }
                              className="w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-800 focus:border-orange-700 focus:outline-none"
                            >
                              <option value="auto">Auto</option>
                              <option value="cross_dissolve">Cross-Dissolve</option>
                              <option value="fade">Fade</option>
                              <option value="slide">Slide</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <VideoStudioPlayer
                  story={draft}
                  onGenerateVoiceover={() => onGenerateVoiceover(draft.id, genTone, genVoice)}
                  onStoryUpdated={(updated) => {
                    setDraft(updated);
                    onStoryUpdated(updated);
                  }}
                />
              </div>
            )}

            {workspaceTab === 'voice' && (
              <VoiceStudioPanel
                onApplyPromptToStory={(promptText) => {
                  setGenInstruction(promptText);
                  setSuccessMessage('Prompt updated from Voice Studio. Click "Generate Story" above.');
                }}
              />
            )}

            {workspaceTab === 'publish' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                {/* Left: YouTube + Instagram Metadata Editors */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-base font-semibold text-slate-900">YouTube Video Metadata</h3>
                    <div>
                      <label htmlFor="yt-title" className="block text-xs font-medium text-slate-700 mb-1">
                        YouTube Video Title
                      </label>
                      <input
                        id="yt-title"
                        type="text"
                        value={draft.youtube.title}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            youtube: { ...draft.youtube, title: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="yt-desc" className="block text-xs font-medium text-slate-700 mb-1">
                        YouTube Description
                      </label>
                      <textarea
                        id="yt-desc"
                        rows={3}
                        value={draft.youtube.description}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            youtube: { ...draft.youtube, description: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="yt-tags" className="block text-xs font-medium text-slate-700 mb-1">
                        YouTube Tags (comma-separated)
                      </label>
                      <input
                        id="yt-tags"
                        type="text"
                        value={draft.youtube.tags.join(', ')}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            youtube: {
                              ...draft.youtube,
                              tags: e.target.value.split(',').map((t) => t.trim()),
                            },
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-6 space-y-4">
                    <h3 className="text-base font-semibold text-slate-900">Instagram Reel Metadata</h3>
                    <div>
                      <label htmlFor="ig-caption" className="block text-xs font-medium text-slate-700 mb-1">
                        Reel Caption
                      </label>
                      <textarea
                        id="ig-caption"
                        rows={3}
                        value={draft.instagram.caption}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            instagram: { ...draft.instagram, caption: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="ig-hashtags" className="block text-xs font-medium text-slate-700 mb-1">
                        Hashtags
                      </label>
                      <input
                        id="ig-hashtags"
                        type="text"
                        value={draft.instagram.hashtags.join(' ')}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            instagram: {
                              ...draft.instagram,
                              hashtags: e.target.value.split(/\s+/).filter(Boolean),
                            },
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Right: Thumbnail Studio & Publish Review */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-slate-900">Thumbnail Studio</h3>
                      <button
                        type="button"
                        onClick={handleDownloadThumbnail}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 hover:text-orange-800 whitespace-nowrap"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download PNG</span>
                      </button>
                    </div>
                    <div>
                      <label htmlFor="thumb-headline" className="block text-xs font-medium text-slate-700 mb-1">
                        Thumbnail Hook Headline
                      </label>
                      <input
                        id="thumb-headline"
                        type="text"
                        value={draft.youtube.thumbnailHeadline}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            youtube: { ...draft.youtube, thumbnailHeadline: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-center rounded-xl bg-slate-950 p-3">
                      <canvas
                        ref={thumbCanvasRef}
                        className={`rounded-lg ${
                          draft.format === 'youtube_long'
                            ? 'w-full aspect-video'
                            : 'h-[260px] w-auto'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-5 space-y-4">
                    <h3 className="text-base font-semibold text-slate-900">Review & Publish</h3>
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 cursor-pointer">
                        <div className="min-w-0 pr-2">
                          <div className="font-medium text-slate-900">YouTube</div>
                          <div className="text-xs text-slate-500">
                            {accounts.youtube.connected
                              ? `${accounts.youtube.channelName} (${accounts.youtube.handle})`
                              : 'Not connected'}
                          </div>
                          {accounts.youtube.channelId && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600">
                              <span>ID: {accounts.youtube.channelId}</span>
                              <a
                                href={`https://studio.youtube.com/channel/${accounts.youtube.channelId}/videos/upload`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 font-sans font-medium text-orange-700 hover:text-orange-800"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>Upload Video to Channel</span>
                              </a>
                            </div>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={pubYouTube}
                          onChange={(e) => setPubYouTube(e.target.checked)}
                          className="h-4 w-4 accent-orange-700 shrink-0"
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 cursor-pointer">
                        <div>
                          <div className="font-medium text-slate-900">Instagram</div>
                          <div className="text-xs text-slate-500">
                            {accounts.instagram.connected
                              ? `@${accounts.instagram.username}`
                              : 'Not connected'}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={pubInstagram}
                          onChange={(e) => setPubInstagram(e.target.checked)}
                          className="h-4 w-4 accent-orange-700"
                        />
                      </label>
                    </div>

                    <div>
                      <label htmlFor="schedule-datetime" className="block text-xs font-medium text-slate-700 mb-1">
                        Schedule Date & Time (Optional)
                      </label>
                      <input
                        id="schedule-datetime"
                        type="datetime-local"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>

                    {republishConfirm && (
                      <div
                        data-testid="republish-permission-prompt"
                        role="alert"
                        className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 space-y-2.5 text-xs text-amber-950"
                      >
                        <div className="font-semibold">
                          Republish Permission Required
                        </div>
                        <p>
                          This video is already published
                          {republishConfirm.alreadyOn.length > 0
                            ? ` on ${republishConfirm.alreadyOn.join(' & ')}`
                            : ''}. Confirm if you want to republish it now.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isPublishing}
                            onClick={() => void handlePublish(republishConfirm.asSchedule, true)}
                            className="rounded-lg bg-amber-700 px-3 py-1.5 font-medium text-white hover:bg-amber-800 disabled:opacity-60"
                          >
                            Yes, Confirm Republish
                          </button>
                          <button
                            type="button"
                            onClick={() => setRepublishConfirm(null)}
                            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Real Direct YouTube Upload with Explicit Permission */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            Direct YouTube Upload (Target: {accounts.youtube.channelId || 'Connected Channel'})
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {ytAuthorized
                              ? 'Google YouTube OAuth active for this session'
                              : 'Connect your Google account once to upload directly to YouTube'}
                          </div>
                        </div>
                        <select
                          aria-label="YouTube upload privacy"
                          value={ytPrivacy}
                          onChange={(e) =>
                            setYtPrivacy(e.target.value as 'public' | 'unlisted' | 'private')
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-orange-700 focus:outline-none"
                        >
                          <option value="public">Public</option>
                          <option value="unlisted">Unlisted</option>
                          <option value="private">Private</option>
                        </select>
                      </div>

                      {draft.youtubeUploadUrl && (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                          <span className="font-medium">Live on YouTube:</span>
                          <a
                            href={draft.youtubeUploadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono font-semibold underline"
                          >
                            <span>{draft.youtubeUploadUrl}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}

                      {ytUploadProgress && (
                        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-900">
                          {ytUploadProgress}
                        </div>
                      )}

                      {ytUploadConfirm && (
                        <div
                          data-testid="youtube-upload-confirm-prompt"
                          role="alert"
                          className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-xs text-amber-950"
                        >
                          <div className="font-semibold">
                            {ytUploadConfirm.isRepublish
                              ? 'Republish Permission Required (Already Published)'
                              : ytUploadConfirm.allowMismatch
                                ? 'Channel ID Mismatch — Confirm Upload Target'
                                : 'Confirm Upload to Your YouTube Account'}
                          </div>
                          <p>
                            {ytUploadConfirm.allowMismatch
                              ? `You signed in with ${ytUploadConfirm.mismatchChannel}, while target ID is ${accounts.youtube.channelId}. Confirm uploading to ${ytUploadConfirm.mismatchChannel} or switch Google account.`
                              : `Upload "${draft.youtube.title || draft.titleHindi}" (${ytPrivacy}) to YouTube channel ${accounts.youtube.channelId || ''}?`}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={isPublishing}
                              onClick={() =>
                                void handleConfirmDirectYouTubeUpload(Boolean(ytUploadConfirm.allowMismatch))
                              }
                              className="rounded-lg bg-orange-700 px-3 py-1.5 font-medium text-white hover:bg-orange-800 disabled:opacity-60"
                            >
                              {ytUploadConfirm.isRepublish
                                ? 'Yes, Confirm Republish & Upload'
                                : 'Yes, Upload to YouTube Now'}
                            </button>
                            <button
                              type="button"
                              disabled={isPublishing}
                              onClick={() => setYtUploadConfirm(null)}
                              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {!ytAuthorized && (
                          <button
                            type="button"
                            disabled={isPublishing}
                            onClick={async () => {
                              setErrorBanner(null);
                              try {
                                await connectYouTubeChannelWithGoogle();
                                setYtAuthorized(true);
                                setSuccessMessage('Google YouTube Upload authorized!');
                              } catch (err) {
                                setErrorBanner(
                                  err instanceof Error ? err.message : 'Google sign-in failed.'
                                );
                              }
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
                          >
                            <ShieldCheck className="h-3.5 w-3.5 text-orange-700" />
                            <span>Sign in with Google (YouTube)</span>
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid="direct-youtube-upload-btn"
                          disabled={isPublishing}
                          onClick={handleRequestDirectYouTubeUpload}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
                        >
                          <UploadCloud className="h-4 w-4 text-orange-400" />
                          <span>
                            {draft.status === 'published' || draft.youtubeVideoId
                              ? 'Republish Video to YouTube (Ask Permission)'
                              : 'Upload Video Directly to YouTube'}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isPublishing}
                        onClick={() => void handlePublish(false)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-60 transition-colors whitespace-nowrap"
                      >
                        <Send className="h-4 w-4" />
                        <span>
                          {isPublishing
                            ? 'Publishing...'
                            : draft.status === 'published'
                              ? 'Republish Now (Ask Permission)'
                              : 'Publish Now'}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={isPublishing}
                        onClick={() => void handlePublish(true)}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap"
                      >
                        Schedule Slot
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">
          Select a topic above and generate your first Hindi story to begin.
        </div>
      )}
    </div>
  );
}
