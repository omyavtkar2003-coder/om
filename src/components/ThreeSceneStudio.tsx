import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, ChevronUp, Download, CheckCircle2 } from 'lucide-react';
import {
  ThreeSceneEngine,
  type CameraAngleId,
} from '../three/sceneEngine';
import type { LightingMoodId, ScenePresetId } from '../three/proceduralModels';
import type { StoryProject } from '../lib/types';

interface ThreeSceneStudioProps {
  stories: StoryProject[];
  selectedStoryId: string | null;
  onCaptureToStory: (storyId: string, sceneIndex: number, dataUrl: string) => Promise<StoryProject>;
}

const PRESETS: { id: ScenePresetId; label: string }[] = [
  { id: 'krishna_ghat', label: 'Vrindavan Ghat' },
  { id: 'ramayana_temple', label: 'Ayodhya Shrine' },
  { id: 'mahabharata_chariot', label: 'Dharma Chariot' },
  { id: 'horror_haveli', label: 'Horror Haveli' },
];

const MOODS: { id: LightingMoodId; label: string }[] = [
  { id: 'twilight', label: 'Twilight' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'golden_dawn', label: 'Golden Dawn' },
];

const ANGLES: { id: CameraAngleId; label: string }[] = [
  { id: 'establishing', label: 'Wide' },
  { id: 'character_hook', label: 'Hook Close' },
  { id: 'low_dramatic', label: 'Low Angle' },
  { id: 'overhead', label: 'Overhead' },
];

export function ThreeSceneStudio({
  stories,
  selectedStoryId,
  onCaptureToStory,
}: ThreeSceneStudioProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ThreeSceneEngine | null>(null);

  const [preset, setPreset] = useState<ScenePresetId>('krishna_ghat');
  const [mood, setMood] = useState<LightingMoodId>('twilight');
  const [angle, setAngle] = useState<CameraAngleId>('establishing');
  const [dockOpen, setDockOpen] = useState(true);

  const [targetStoryId, setTargetStoryId] = useState<string>(
    selectedStoryId || stories[0]?.id || ''
  );
  const [targetSceneIdx, setTargetSceneIdx] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (selectedStoryId) {
      setTargetStoryId(selectedStoryId);
    }
  }, [selectedStoryId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new ThreeSceneEngine(container, 'krishna_ghat', 'twilight');
    engineRef.current = engine;

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'h' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
      ) {
        setDockOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handlePresetChange = (next: ScenePresetId) => {
    setPreset(next);
    engineRef.current?.setScenePreset(next);
  };

  const handleMoodChange = (next: LightingMoodId) => {
    setMood(next);
    engineRef.current?.setLightingMood(next);
  };

  const handleAngleChange = (next: CameraAngleId) => {
    setAngle(next);
    engineRef.current?.flyToCameraAngle(next);
  };

  const handleDownloadPng = () => {
    if (!engineRef.current) return;
    const dataUrl = engineRef.current.captureSnapshotDataUrl();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `kathastudio-3d-${preset}-${Date.now()}.png`;
    a.click();
  };

  const handleSaveToStory = async () => {
    if (!engineRef.current || !targetStoryId) return;
    setErrorMsg(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const dataUrl = engineRef.current.captureSnapshotDataUrl();
      await onCaptureToStory(targetStoryId, targetSceneIdx, dataUrl);
      setNotice(`Saved 3D frame to Scene ${targetSceneIdx + 1}. Open Studio Video tab to preview.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save 3D snapshot.');
    } finally {
      setIsSaving(false);
    }
  };

  const targetStory = stories.find((s) => s.id === targetStoryId) || stories[0];

  return (
    <div className="relative w-full h-[calc(100vh-148px)] min-h-[540px] overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
      {/* Dedicated isolated WebGL mount container */}
      <div
        ref={mountRef}
        data-testid="three-scene-mount"
        className="absolute inset-0 h-full w-full"
      />

      {/* Minimal Top-Left Title Badge (no backdrop-filter over WebGL, no pulsating dots) */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-slate-700 bg-slate-900/95 px-3.5 py-2 text-white">
        <div className="text-xs font-semibold tracking-tight">
          3D Mythological &amp; Horror Stage Builder
        </div>
        <div className="text-[11px] text-slate-300">
          Drag to orbit · Scroll to zoom · Press H to toggle dock
        </div>
      </div>

      {/* Feedback Banner Top-Center when needed */}
      {(notice || errorMsg) && (
        <div
          role={errorMsg ? 'alert' : 'status'}
          className={`absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border px-3.5 py-2 text-xs font-medium flex items-center gap-2 ${
            errorMsg
              ? 'border-red-500/50 bg-red-950/95 text-red-100'
              : 'border-emerald-500/50 bg-emerald-950/95 text-emerald-100'
          }`}
        >
          {notice && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
          <span>{errorMsg || notice}</span>
        </div>
      )}

      {/* Collapsible Bottom Control Dock (Zero Center Occlusion) */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex w-[min(940px,95%)] -translate-x-1/2 flex-col items-center">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/95 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 transition-colors"
        >
          {dockOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          <span>{dockOpen ? 'Hide Controls' : 'Show Controls'}</span>
        </button>

        {dockOpen && (
          <div className="pointer-events-auto w-full rounded-xl border border-slate-700 bg-slate-900/95 px-3.5 py-2.5 text-xs text-slate-100 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Stage Preset */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="three-preset" className="text-[11px] text-slate-400 whitespace-nowrap">
                  Stage:
                </label>
                <select
                  id="three-preset"
                  value={preset}
                  onChange={(e) => handlePresetChange(e.target.value as ScenePresetId)}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:border-orange-500 focus:outline-none"
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lighting Mood */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="three-mood" className="text-[11px] text-slate-400 whitespace-nowrap">
                  Light:
                </label>
                <select
                  id="three-mood"
                  value={mood}
                  onChange={(e) => handleMoodChange(e.target.value as LightingMoodId)}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:border-orange-500 focus:outline-none"
                >
                  {MOODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Camera Hook Angle */}
              <div className="flex items-center gap-1">
                {ANGLES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleAngleChange(a.id)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      angle === a.id
                        ? 'bg-orange-700 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {/* Capture Target Story Scene */}
              <div className="flex flex-wrap items-center gap-1.5">
                {targetStory && (
                  <>
                    <select
                      aria-label="Target story for 3D snapshot"
                      value={targetStory.id}
                      onChange={(e) => {
                        setTargetStoryId(e.target.value);
                        setTargetSceneIdx(0);
                      }}
                      className="max-w-[145px] rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-white focus:border-orange-500 focus:outline-none"
                    >
                      {stories.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.titleHindi}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Target scene index"
                      value={targetSceneIdx}
                      onChange={(e) => setTargetSceneIdx(Number(e.target.value))}
                      className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-white focus:border-orange-500 focus:outline-none"
                    >
                      {targetStory.scenes.map((sc, i) => (
                        <option key={sc.id} value={i}>
                          Scene {i + 1} ({sc.part})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleSaveToStory}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 rounded-md bg-orange-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-orange-600 disabled:opacity-60 transition-colors whitespace-nowrap"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>{isSaving ? 'Saving...' : 'Use as Scene Frame'}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  aria-label="Download 3D snapshot PNG"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>PNG</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
