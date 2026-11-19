import { useEffect, useRef, useState } from 'react';
import {
  Download,
  ImagePlus,
  Mic,
  Music,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Sparkles,
  Subtitles,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import { StudioAudioMixer } from '../lib/audioEngine';
import {
  buildSceneTimeline,
  formatDurationMMSS,
  getActiveSceneAtTime,
  getEffectivePlaybackDurationSec,
  getFormatSpec,
  getSceneArtCatalog,
  getTopicConfig,
} from '../lib/studioLogic';
import {
  exportStoryVideo,
  getCachedSceneImage,
  loadStorySceneImages,
  renderStoryFrameToCanvas,
} from '../lib/videoEngine';
import type { StoryProject, VideoVisualStyle } from '../lib/types';

interface VideoStudioPlayerProps {
  story: StoryProject;
  onGenerateVoiceover?: () => Promise<StoryProject>;
  onStoryUpdated?: (updated: StoryProject) => void;
}

export function VideoStudioPlayer({
  story,
  onGenerateVoiceover,
  onStoryUpdated,
}: VideoStudioPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mixerRef = useRef<StudioAudioMixer | null>(null);
  const sceneImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastSceneIdRef = useRef<string>('');

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const bgmEnabledRef = useRef(bgmEnabled);
  const sfxEnabledRef = useRef(sfxEnabled);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [exportedExt, setExportedExt] = useState<'mp4' | 'webm'>('webm');

  // Distinct scene frame matching, shuffle, bespoke AI draw, picker & custom scene photo upload
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [isRematchingArt, setIsRematchingArt] = useState(false);
  const [isDrawingAiScene, setIsDrawingAiScene] = useState(false);
  const [showArtPicker, setShowArtPicker] = useState(false);
  const [uploadSceneIndex, setUploadSceneIndex] = useState(0);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isUpdatingMood, setIsUpdatingMood] = useState(false);
  const [isUpdatingStyle, setIsUpdatingStyle] = useState(false);
  const [decodedVoiceSec, setDecodedVoiceSec] = useState<number>(0);

  const spec = getFormatSpec(story.format);
  const totalSec = getEffectivePlaybackDurationSec(story.scenes, decodedVoiceSec);
  const topicCfg = getTopicConfig(story.topic);
  const timeline = buildSceneTimeline(story.scenes);
  const sceneUrlsKey = story.scenes.map((s) => `${s.id}:${s.imageUrl ?? ''}`).join('|');

  if (!mixerRef.current && typeof window !== 'undefined') {
    mixerRef.current = new StudioAudioMixer();
  }

  useEffect(() => {
    setUploadSceneIndex(0);
  }, [story.id]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    lastSceneIdRef.current = '';
    setExportedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    mixerRef.current?.stopAll();

    let cancelled = false;
    // Synchronously seed any cached images so preview canvas never flashes blank while async preloads finish
    const seededMap = new Map<string, HTMLImageElement>(sceneImagesRef.current);
    const defaultCached = getCachedSceneImage(topicCfg.defaultImage);
    for (const sc of story.scenes) {
      const hit = getCachedSceneImage(sc.imageUrl) ?? defaultCached;
      if (hit) {
        seededMap.set(sc.id, hit);
      }
    }
    sceneImagesRef.current = seededMap;

    const drawInitialFrame = (imgMap: Map<string, HTMLImageElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderStoryFrameToCanvas(ctx, canvas.width, canvas.height, story, 0, imgMap, showSubtitles);
    };
    drawInitialFrame(seededMap);

    loadStorySceneImages(story.scenes, topicCfg.defaultImage).then((map) => {
      if (cancelled) return;
      sceneImagesRef.current = map;
      drawInitialFrame(map);
    });

    setDecodedVoiceSec(0);
    if (story.audioUrl) {
      void mixerRef.current?.preloadVoiceover(story.audioUrl).then((buf) => {
        if (!cancelled && buf) {
          setDecodedVoiceSec(buf.duration);
        }
      });
    }
    void mixerRef.current?.preloadCustomBgm(story.bgmAudioUrl);
    void mixerRef.current?.preloadMoodBgm(story.bgmMood);

    return () => {
      cancelled = true;
      mixerRef.current?.stopAll();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [story.id, story.audioUrl, story.bgmAudioUrl, story.bgmMood, story.topic, story.format, sceneUrlsKey, topicCfg.defaultImage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderStoryFrameToCanvas(
      ctx,
      canvas.width,
      canvas.height,
      story,
      currentTime,
      sceneImagesRef.current,
      showSubtitles
    );
  }, [currentTime, showSubtitles, story]);

  useEffect(() => {
    bgmEnabledRef.current = bgmEnabled;
    mixerRef.current?.setBgmEnabled(bgmEnabled);
  }, [bgmEnabled]);

  useEffect(() => {
    sfxEnabledRef.current = sfxEnabled;
    mixerRef.current?.setSfxEnabled(sfxEnabled);
  }, [sfxEnabled]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    let cancelled = false;
    let completedNaturally = false;
    const mixer = mixerRef.current;
    const resumeOffset = currentTime;

    const speakSceneFallback = (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const cleaned = text.trim();
      if (!cleaned) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(cleaned);
      utter.lang = 'hi-IN';
      utter.rate = 0.96;
      window.speechSynthesis.speak(utter);
    };

    const startPlayback = async () => {
      let effectiveTotal = totalSec;
      let hasVoice = false;
      if (mixer) {
        await mixer.ensureReady();
        if (story.audioUrl) {
          const buf = await mixer.preloadVoiceover(story.audioUrl);
          if (buf) {
            setDecodedVoiceSec(buf.duration);
            effectiveTotal = getEffectivePlaybackDurationSec(story.scenes, buf.duration);
          }
        }
        if (cancelled) return;
        hasVoice = Boolean(story.audioUrl && mixer.getVoiceDurationSec() > 0);
        mixer.startBgm(story.bgmMood, bgmEnabledRef.current, hasVoice);
        mixer.setSfxEnabled(sfxEnabledRef.current);
        if (hasVoice) {
          mixer.startVoiceFromOffset(resumeOffset);
        } else {
          const initialActive = getActiveSceneAtTime(story.scenes, resumeOffset);
          if (initialActive) {
            lastSceneIdRef.current = initialActive.entry.scene.id;
            speakSceneFallback(initialActive.entry.scene.narrationHindi);
          }
        }
      }

      if (cancelled) return;
      const startWall = performance.now() - resumeOffset * 1000;
      const startAudioCtx = (mixer?.getCurrentTime() ?? 0) - resumeOffset;

      const tick = (now: number) => {
        if (cancelled) return;
        const audioDelta = mixer ? mixer.getCurrentTime() - startAudioCtx : 0;
        const nextTime =
          mixer && audioDelta > resumeOffset + 0.02
            ? audioDelta
            : (now - startWall) / 1000;

        const voiceStillActive = hasVoice && Boolean(mixer?.isVoicePlaying());
        if (nextTime >= effectiveTotal && (!voiceStillActive || nextTime >= effectiveTotal + 1.5)) {
          completedNaturally = true;
          setCurrentTime(effectiveTotal);
          mixer?.fadeOutAndStop(0.18);
          setIsPlaying(false);
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
          return;
        }

        const clampedTime = Math.min(nextTime, effectiveTotal);
        const active = getActiveSceneAtTime(story.scenes, clampedTime);
        if (active && active.entry.scene.id !== lastSceneIdRef.current) {
          lastSceneIdRef.current = active.entry.scene.id;
          if (sfxEnabledRef.current) {
            mixer?.triggerSfx(active.entry.scene.sfxCue);
          }
          if (!hasVoice) {
            speakSceneFallback(active.entry.scene.narrationHindi);
          }
        }

        setCurrentTime(clampedTime);
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    void startPlayback();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (!completedNaturally) {
        mixer?.stopAll();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying]);

  const handleTogglePlay = () => {
    if (currentTime >= totalSec - 0.15) {
      setCurrentTime(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleRestart = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    lastSceneIdRef.current = '';
    mixerRef.current?.stopAll();
  };

  const handleQuickVoiceover = async () => {
    if (!onGenerateVoiceover) return;
    setExportError(null);
    setIsSynthesizing(true);
    try {
      await onGenerateVoiceover();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Hindi voiceover failed.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleRegenerateDistinctFrames = async () => {
    setExportError(null);
    setIsGeneratingFrames(true);
    try {
      const res = await fetch(`/api/stories/${story.id}/frames`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not update scene frames.');
      }
      if (data.story && onStoryUpdated) {
        onStoryUpdated(data.story as StoryProject);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Scene frame update failed.');
    } finally {
      setIsGeneratingFrames(false);
    }
  };

  const handleRematchStoryArt = async () => {
    setExportError(null);
    setIsRematchingArt(true);
    try {
      const res = await fetch(`/api/stories/${story.id}/rematch`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not match story artwork.');
      }
      if (data.story && onStoryUpdated) {
        onStoryUpdated(data.story as StoryProject);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Story art match failed.');
    } finally {
      setIsRematchingArt(false);
    }
  };

  const handleAssignCatalogArt = async (sceneIndex: number, artId: string, url: string) => {
    setExportError(null);
    try {
      const nextScenes = story.scenes.map((sc, idx) =>
        idx === sceneIndex ? { ...sc, sceneArtId: artId, imageUrl: url } : sc
      );
      const res = await fetch(`/api/stories/${story.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artVersion: 2, scenes: nextScenes }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not assign selected scene visual.');
      }
      if (data.story && onStoryUpdated) {
        onStoryUpdated(data.story as StoryProject);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Scene art update failed.');
    }
  };

  const handleAiDrawScene = async (sceneIndex: number) => {
    setExportError(null);
    setIsDrawingAiScene(true);
    try {
      const res = await fetch(`/api/stories/${story.id}/scenes/${sceneIndex}/ai-art`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not generate AI scene visual.');
      }
      if (data.story && onStoryUpdated) {
        onStoryUpdated(data.story as StoryProject);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'AI scene art failed.');
    } finally {
      setIsDrawingAiScene(false);
    }
  };

  const handleUploadScenePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExportError(null);
    setIsUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || '');
        const res = await fetch(`/api/stories/${story.id}/frames/custom`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sceneIndex: uploadSceneIndex,
            dataUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Could not apply uploaded scene photo.');
        }
        if (data.story && onStoryUpdated) {
          onStoryUpdated(data.story as StoryProject);
        }
      } catch (err) {
        setExportError(err instanceof Error ? err.message : 'Photo upload failed.');
      } finally {
        setIsUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleChangeBgmMood = async (nextMood: StoryProject['bgmMood']) => {
    setExportError(null);
    setIsUpdatingMood(true);
    try {
      const res = await fetch(`/api/stories/${story.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bgmMood: nextMood }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not update background music mood.');
      }
      if (data.story && onStoryUpdated) {
        onStoryUpdated(data.story as StoryProject);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Music mood update failed.');
    } finally {
      setIsUpdatingMood(false);
    }
  };

  const handleChangeVisualStyle = async (nextStyle: VideoVisualStyle) => {
    setExportError(null);
    setIsUpdatingStyle(true);
    try {
      const res = await fetch(`/api/stories/${story.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visualStyle: nextStyle }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not update visual style.');
      }
      if (data.story && onStoryUpdated) {
        onStoryUpdated(data.story as StoryProject);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Visual style update failed.');
    } finally {
      setIsUpdatingStyle(false);
    }
  };

  const handleExportVideo = async () => {
    if (!mixerRef.current) return;
    setIsPlaying(false);
    setExportError(null);
    setIsExporting(true);
    setExportProgress(0);

    try {
      let targetStory = story;
      let decodedBuf = targetStory.audioUrl
        ? await mixerRef.current.preloadVoiceover(targetStory.audioUrl)
        : null;

      if ((!targetStory.audioUrl || !decodedBuf) && onGenerateVoiceover) {
        setIsSynthesizing(true);
        targetStory = await onGenerateVoiceover();
        setIsSynthesizing(false);
        if (targetStory.audioUrl) {
          decodedBuf = await mixerRef.current.preloadVoiceover(targetStory.audioUrl);
        }
      }

      if (decodedBuf) {
        setDecodedVoiceSec(decodedBuf.duration);
      }

      const result = await exportStoryVideo({
        story: targetStory,
        mixer: mixerRef.current,
        bgmEnabled,
        sfxEnabled,
        showSubtitles,
        onProgress: setExportProgress,
      });
      const url = URL.createObjectURL(result.blob);
      setExportedExt(result.extension);
      setExportedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Video export failed in this browser.');
    } finally {
      setIsSynthesizing(false);
      setIsExporting(false);
    }
  };

  const isVertical = spec.aspect === '9:16';
  const activeEntry = getActiveSceneAtTime(story.scenes, currentTime);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Anime Story Video Studio &amp; Exporter
          </h3>
          <p className="text-xs text-slate-500">
            {spec.label}
            {(story.totalParts ?? 1) > 1
              ? ` · Part ${story.partNumber ?? 1} of ${story.totalParts}`
              : ''}{' '}
            · {spec.exportWidth}×{spec.exportHeight} · {story.scenes.length} Anime Frames ·{' '}
            {formatDurationMMSS(totalSec)} ·{' '}
            {story.audioUrl ? 'Hindi AI Audio Ready' : 'No Hindi WAV Yet'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRematchStoryArt}
            disabled={isRematchingArt}
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            <Wand2 className="h-3.5 w-3.5 text-orange-700" />
            <span>{isRematchingArt ? 'Matching...' : 'Match Story Art'}</span>
          </button>

          <button
            type="button"
            onClick={handleRegenerateDistinctFrames}
            disabled={isGeneratingFrames}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            <Shuffle className="h-3.5 w-3.5 text-orange-700" />
            <span>{isGeneratingFrames ? 'Rotating...' : 'Cycle Anime Scenes'}</span>
          </button>

          {!story.audioUrl && onGenerateVoiceover && (
            <button
              type="button"
              onClick={handleQuickVoiceover}
              disabled={isSynthesizing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <Mic className="h-3.5 w-3.5" />
              <span>{isSynthesizing ? 'Creating Hindi Audio...' : 'Create Hindi Audio'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setBgmEnabled((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              bgmEnabled
                ? 'border-orange-200 bg-orange-50 text-orange-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Music className="h-3.5 w-3.5" />
            <span>BGM {bgmEnabled ? 'On' : 'Off'}</span>
          </button>
          <button
            type="button"
            onClick={() => setSfxEnabled((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              sfxEnabled
                ? 'border-orange-200 bg-orange-50 text-orange-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Volume2 className="h-3.5 w-3.5" />
            <span>SFX {sfxEnabled ? 'On' : 'Off'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSubtitles((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              showSubtitles
                ? 'border-orange-200 bg-orange-50 text-orange-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Subtitles className="h-3.5 w-3.5" />
            <span>Subtitles</span>
          </button>
        </div>
      </div>

      {/* Preview Canvas */}
      <div className="flex justify-center rounded-xl bg-slate-950 p-3">
        <canvas
          ref={canvasRef}
          data-testid="video-preview-canvas"
          width={spec.previewWidth}
          height={spec.previewHeight}
          className={`rounded-lg shadow-sm ${
            isVertical ? 'h-[340px] w-auto max-w-full' : 'w-full max-w-[560px] aspect-video'
          }`}
        />
      </div>

      {/* Visual Multi-Frame Scene Strip (Click to jump to each scene frame & align art) */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-700">
            Storyboard Frame Sequence ({story.scenes.length} Scenes · Hook to Ending)
          </span>
          <button
            type="button"
            onClick={() => setShowArtPicker((v) => !v)}
            className="text-xs font-medium text-orange-700 hover:text-orange-800 underline underline-offset-2"
          >
            {showArtPicker ? 'Hide Anime Art Library' : `Swap Scene ${uploadSceneIndex + 1} Visual`}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {timeline.map((entry) => {
            const isCurrent = activeEntry?.entry.scene.id === entry.scene.id;
            const thumbUrl = entry.scene.imageUrl || topicCfg.defaultImage;
            return (
              <button
                key={entry.scene.id}
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentTime(entry.startSec + 0.05);
                  setUploadSceneIndex(entry.index);
                }}
                className={`group text-left rounded-lg border overflow-hidden transition-colors ${
                  isCurrent
                    ? 'border-orange-700 bg-orange-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="relative h-20 w-full bg-slate-900 overflow-hidden">
                  <img
                    src={thumbUrl}
                    alt={`Scene ${entry.index + 1} ${entry.scene.part}`}
                    onError={(e) => {
                      if (e.currentTarget.src !== topicCfg.defaultImage) {
                        e.currentTarget.src = topicCfg.defaultImage;
                      }
                    }}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {entry.index === 0 ? 'Hook' : `Sc ${entry.index + 1}`}
                  </span>
                </div>
                <div className="p-2 space-y-0.5">
                  <div className="text-[11px] font-semibold text-slate-900 truncate">
                    {entry.index === 0 || entry.scene.shotType === 'character_hook'
                      ? 'आरंभ (Hook)'
                      : entry.scene.part === 'beginning'
                        ? 'आरंभ (Setup)'
                        : entry.scene.part === 'middle'
                          ? 'मध्य (Climax)'
                          : 'समापन'}
                  </div>
                  <div className="text-[10px] text-slate-600 truncate">
                    {entry.scene.subtitleHindi || entry.scene.narrationHindi}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                    {formatDurationMMSS(entry.startSec)} – {formatDurationMMSS(entry.endSec)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {showArtPicker && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-700">
                <span className="font-semibold text-slate-900">
                  Scene {uploadSceneIndex + 1} Narration:
                </span>{' '}
                {story.scenes[uploadSceneIndex]?.narrationHindi}
              </div>
              <button
                type="button"
                onClick={() => void handleAiDrawScene(uploadSceneIndex)}
                disabled={isDrawingAiScene}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isDrawingAiScene ? 'Drawing AI Scene...' : 'AI Draw Custom Scene'}</span>
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {getSceneArtCatalog(story.topic)
                .slice(0, 26)
                .map((asset) => {
                  const isActive = story.scenes[uploadSceneIndex]?.imageUrl === asset.url;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => void handleAssignCatalogArt(uploadSceneIndex, asset.id, asset.url)}
                      title={asset.description}
                      className={`shrink-0 w-24 rounded-lg border overflow-hidden text-left transition-colors ${
                        isActive
                          ? 'border-orange-700 ring-1 ring-orange-700 bg-orange-50'
                          : 'border-slate-200 bg-white hover:border-slate-400'
                      }`}
                    >
                      <img src={asset.url} alt={asset.label} className="h-16 w-full object-cover" />
                      <div className="px-1.5 py-1 text-[10px] font-medium text-slate-800 truncate">
                        {asset.label}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Transport & Scrubber */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? 'Pause video preview' : 'Play video preview'}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Play Video'}</span>
          </button>
          <button
            type="button"
            onClick={handleRestart}
            aria-label="Restart video preview"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restart</span>
          </button>
          <div className="flex w-full items-center gap-2.5 sm:w-auto sm:flex-1 min-w-0">
            <input
              type="range"
              aria-label="Video timeline scrubber"
              min={0}
              max={totalSec}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentTime(Number(e.target.value));
              }}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-orange-700"
            />
            <span className="font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap shrink-0">
              {formatDurationMMSS(currentTime)} / {formatDurationMMSS(totalSec)}
            </span>
          </div>
        </div>

        {/* Audio Track Ready */}
        {story.audioUrl && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <span className="text-xs font-medium text-slate-700">
              Hindi AI Voiceover ({story.voiceName})
            </span>
            <audio controls src={story.audioUrl} className="h-8 max-w-full" />
          </div>
        )}

        {/* Visual Style, Custom Scene Photo & Built-in BGM Controls */}
        <div className="border-t border-slate-200 pt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="studio-visual-style" className="text-xs font-medium text-slate-800">
              Video Visual Style:
            </label>
            <select
              id="studio-visual-style"
              value={story.visualStyle ?? 'anime'}
              disabled={isUpdatingStyle}
              onChange={(e) =>
                void handleChangeVisualStyle(e.target.value as VideoVisualStyle)
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            >
              <option value="anime">Anime Reels (Cel + Speedlines)</option>
              <option value="cinematic">Cinematic Classic</option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ImagePlus className="h-4 w-4 text-orange-700 shrink-0" />
              <span className="text-xs font-medium text-slate-800">Scene Art:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Target scene for custom photo"
                value={uploadSceneIndex}
                onChange={(e) => setUploadSceneIndex(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
              >
                {story.scenes.map((sc, idx) => (
                  <option key={sc.id} value={idx}>
                    {idx === 0 ? 'Scene 1 (Hook)' : `Scene ${idx + 1} (${sc.part})`}
                  </option>
                ))}
              </select>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap">
                <Upload className="h-3.5 w-3.5" />
                <span>{isUploadingPhoto ? 'Uploading...' : 'Upload'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadScenePhoto}
                  disabled={isUploadingPhoto}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 text-orange-700 shrink-0" />
              <label htmlFor="studio-bgm-mood" className="text-xs font-medium text-slate-800">
                BGM Mood:
              </label>
            </div>
            <select
              id="studio-bgm-mood"
              value={story.bgmMood}
              disabled={isUpdatingMood}
              onChange={(e) =>
                void handleChangeBgmMood(e.target.value as StoryProject['bgmMood'])
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            >
              <option value="serene_flute">Serene Bansuri Flute</option>
              <option value="devotional_tanpura">Devotional Tanpura Drone</option>
              <option value="epic_drums">Epic Battlefield Drums</option>
              <option value="eerie_horror">Eerie Midnight Suspense</option>
            </select>
          </div>
        </div>

        {/* Full Story Video Render Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-500">
            {story.audioUrl
              ? 'Full HD Anime Reels motion, karaoke Hindi captions, ducked BGM & voiceover ready.'
              : 'Click "Render & Export Full Video" to auto-generate Hindi audio and render all anime scenes.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportVideo}
              disabled={isExporting || isSynthesizing}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-700 px-4 py-2 text-xs font-medium text-white hover:bg-orange-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>
                {isSynthesizing
                  ? 'Synthesizing Hindi Audio...'
                  : isExporting
                    ? `Rendering Video ${exportProgress}%`
                    : 'Render & Export Full Video'}
              </span>
            </button>
          </div>
        </div>

        {exportedUrl && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-emerald-900">
                Anime Story Video Rendered (.{exportedExt})
              </div>
              <a
                href={exportedUrl}
                download={`${story.id}.${exportedExt}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Video (.{exportedExt})</span>
              </a>
            </div>
            <video
              controls
              src={exportedUrl}
              className={`rounded-lg bg-black ${isVertical ? 'max-h-[280px] mx-auto' : 'w-full max-h-[300px]'}`}
            />
          </div>
        )}

        {exportError && (
          <p className="text-xs text-red-700" role="alert">
            {exportError}
          </p>
        )}
      </div>
    </div>
  );
}
