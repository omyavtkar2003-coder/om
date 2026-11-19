import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Menu, Sparkles, UserCheck } from 'lucide-react';
import { AuthModal, SESSION_STORAGE_KEY } from './components/AuthModal';
import { AutomationView } from './components/AutomationView';
import { ChannelsView } from './components/ChannelsView';
import { DashboardView } from './components/DashboardView';
import { LibraryView } from './components/LibraryView';
import { Sidebar, type StudioTab } from './components/Sidebar';
import { StudioView } from './components/StudioView';
import { ThreeSceneStudio } from './components/ThreeSceneStudio';
import {
  auth,
  connectYouTubeChannelWithGoogle,
  getCachedYouTubeAccessToken,
  onAuthStateChanged,
} from './firebase';
import { StudioAudioMixer } from './lib/audioEngine';
import { exportStoryVideo } from './lib/videoEngine';
import type {
  ConnectedAccounts,
  CreatorUser,
  DailyAutomationConfig,
  PrebuiltVoiceName,
  StoryPacingMode,
  StoryProject,
  StoryTopic,
  StudioState,
  VideoFormat,
  VoiceTone,
} from './lib/types';

const TAB_TITLES: Record<StudioTab, string> = {
  dashboard: 'Overview',
  studio: 'Story & Video Studio',
  scene3d: '3D Scene Studio',
  library: 'Content Library',
  automation: 'Daily Automation',
  channels: 'Channels & Income',
};

export default function App() {
  const [state, setState] = useState<StudioState | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<StudioTab>('dashboard');
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentUser, setCurrentUser] = useState<CreatorUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const fetchState = useCallback(async (overrideToken?: string) => {
    const token =
      overrideToken ||
      (typeof window !== 'undefined' ? localStorage.getItem(SESSION_STORAGE_KEY) || '' : '');
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/bootstrap', {
        headers: { 'x-studio-session': token },
      });
      if (res.status === 401) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setCurrentUser(null);
        setState(null);
        return;
      }
      if (!res.ok) {
        throw new Error('Failed to load studio workspace');
      }
      const data = (await res.json()) as StudioState;
      setState(data);
      setSelectedStoryId((prev) => prev ?? data.stories[0]?.id ?? null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach studio server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const token = typeof window !== 'undefined' ? localStorage.getItem(SESSION_STORAGE_KEY) : null;

    const checkSession = async () => {
      try {
        if (token) {
          const r = await fetch('/api/auth/session', {
            headers: { 'x-studio-session': token },
          });
          const data = await r.json();
          if (active && data?.user) {
            setCurrentUser(data.user as CreatorUser);
            await fetchState(token);
            return;
          }
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch {
        // ignore and show login gate
      } finally {
        if (active) setAuthChecking(false);
      }
    };

    void checkSession();

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser || !active) return;
      const existingToken = localStorage.getItem(SESSION_STORAGE_KEY);
      if (existingToken) return;

      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Creator',
          email: fbUser.email || undefined,
          firebaseUid: fbUser.uid,
          authMethod: 'google',
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!active || !data?.user || !data?.sessionToken) return;
          localStorage.setItem(SESSION_STORAGE_KEY, data.sessionToken);
          setCurrentUser(data.user as CreatorUser);
          void fetchState(data.sessionToken);
        })
        .catch(() => {});
    });

    return () => {
      active = false;
      unsub();
    };
  }, [fetchState]);

  const handleGenerateStory = async (params: {
    topic: StoryTopic;
    format: VideoFormat;
    tone?: VoiceTone;
    voiceName?: PrebuiltVoiceName;
    customInstruction: string;
    pacingMode?: StoryPacingMode;
    totalParts?: number;
  }): Promise<StoryProject> => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/stories/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate story');
      }
      const created = data.story as StoryProject;
      setState((prev) =>
        prev ? { ...prev, stories: [created, ...prev.stories] } : prev
      );
      setSelectedStoryId(created.id);
      return created;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateNextPart = async (storyId: string): Promise<StoryProject> => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/stories/${storyId}/next-part`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate next part');
      }
      const created = data.story as StoryProject;
      setState((prev) => {
        if (!prev) return prev;
        const nextTotal = created.totalParts ?? 2;
        const updatedList = prev.stories.map((s) =>
          s.id === storyId
            ? {
                ...s,
                seriesId: s.seriesId || created.seriesId,
                partNumber: s.partNumber ?? 1,
                totalParts: Math.max(s.totalParts ?? 1, nextTotal),
              }
            : s
        );
        return { ...prev, stories: [created, ...updatedList] };
      });
      setSelectedStoryId(created.id);
      return created;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickGenerate = async (params: {
    topic: StoryTopic;
    format: VideoFormat;
    customInstruction: string;
    pacingMode?: StoryPacingMode;
    totalParts?: number;
  }) => {
    const created = await handleGenerateStory(params);
    setSelectedStoryId(created.id);
    setActiveTab('studio');
  };

  const handleGenerateVoiceover = async (
    storyId: string,
    tone: VoiceTone,
    voiceName: PrebuiltVoiceName
  ): Promise<StoryProject> => {
    const res = await fetch(`/api/stories/${storyId}/voiceover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tone, voiceName }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Hindi voice synthesis failed');
    }
    const updated = data.story as StoryProject;
    setState((prev) =>
      prev
        ? { ...prev, stories: prev.stories.map((s) => (s.id === updated.id ? updated : s)) }
        : prev
    );
    return updated;
  };

  const handleSaveStory = async (
    storyId: string,
    patch: Partial<StoryProject>
  ): Promise<StoryProject> => {
    const res = await fetch(`/api/stories/${storyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save story changes');
    }
    const updated = data.story as StoryProject;
    setState((prev) =>
      prev
        ? { ...prev, stories: prev.stories.map((s) => (s.id === updated.id ? updated : s)) }
        : prev
    );
    return updated;
  };

  const handleStoryUpdated = (updated: StoryProject) => {
    setState((prev) =>
      prev
        ? { ...prev, stories: prev.stories.map((s) => (s.id === updated.id ? updated : s)) }
        : prev
    );
  };

  const handleCapture3DToStory = async (
    storyId: string,
    sceneIndex: number,
    dataUrl: string
  ): Promise<StoryProject> => {
    const res = await fetch(`/api/stories/${storyId}/frames/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneIndex, dataUrl }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save 3D snapshot');
    }
    const updated = data.story as StoryProject;
    handleStoryUpdated(updated);
    return updated;
  };

  const handlePublishStory = async (
    storyId: string,
    channels: ('youtube' | 'instagram')[],
    scheduleFor?: string | null,
    options?: { confirmRepublish?: boolean }
  ): Promise<StoryProject> => {
    const res = await fetch(`/api/stories/${storyId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channels,
        scheduleFor,
        confirmRepublish: Boolean(options?.confirmRepublish),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Publish failed') as Error & {
        requiresRepublishPermission?: boolean;
      };
      if (data.requiresRepublishPermission) {
        err.requiresRepublishPermission = true;
      }
      throw err;
    }
    const updated = data.story as StoryProject;
    setState((prev) =>
      prev
        ? { ...prev, stories: prev.stories.map((s) => (s.id === updated.id ? updated : s)) }
        : prev
    );
    return updated;
  };

  const handleDeleteStory = async (storyId: string) => {
    const res = await fetch(`/api/stories/${storyId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Delete failed');
    }
    setState((prev) => {
      if (!prev) return prev;
      const nextStories = prev.stories.filter((s) => s.id !== storyId);
      if (selectedStoryId === storyId) {
        setSelectedStoryId(nextStories[0]?.id ?? null);
      }
      return { ...prev, stories: nextStories };
    });
  };

  const handleRunDailyBatch = async (topicOverride?: StoryTopic) => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/automation/run-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicOverride }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Daily batch generation failed');
      }
      const created = data.stories as StoryProject[];
      const automation = data.automation as DailyAutomationConfig;
      setState((prev) =>
        prev
          ? {
              ...prev,
              stories: [...created, ...prev.stories],
              automation,
            }
          : prev
      );
      if (created[0]) {
        setSelectedStoryId(created[0].id);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunHorrorSeriesBatch = async (params: {
    count: number;
    format: VideoFormat;
    customPremise: string;
    requirePermissionOverride?: boolean;
  }): Promise<StoryProject[]> => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/automation/run-horror-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Horror batch generation failed');
      }
      const created = data.stories as StoryProject[];
      const automation = data.automation as DailyAutomationConfig;
      setState((prev) =>
        prev
          ? {
              ...prev,
              stories: [...created, ...prev.stories],
              automation,
            }
          : prev
      );
      if (created[0]) {
        setSelectedStoryId(created[0].id);
      }
      return created;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSyncLiveYouTubeStats = async (explicitToken?: string) => {
    let token = explicitToken || getCachedYouTubeAccessToken();
    if (!token) {
      const authRes = await connectYouTubeChannelWithGoogle();
      token = authRes.accessToken;
    }
    const res = await fetch('/api/youtube/live-stats', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to sync live YouTube stats.');
    }
    const updatedMap = new Map(
      ((data.updatedStories as StoryProject[]) || []).map((s) => [s.id, s])
    );
    setState((prev) =>
      prev
        ? {
            ...prev,
            accounts: data.accounts || prev.accounts,
            stories: prev.stories.map((s) => updatedMap.get(s.id) ?? s),
          }
        : prev
    );
  };

  const handleCreateAndUploadHorror2PartsToYouTube = async (opts: {
    format?: VideoFormat;
    customPremise?: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
    onProgress?: (msg: string) => void;
  }): Promise<StoryProject[]> => {
    const progress = opts.onProgress || (() => {});
    progress('Step 1/4: Checking Google YouTube authorization for UCGEptT_IzEoW8BkrtE_bPRg...');
    let token = getCachedYouTubeAccessToken();
    if (!token) {
      const authRes = await connectYouTubeChannelWithGoogle();
      token = authRes.accessToken;
    }

    progress('Step 2/4: Creating Horror Part 1 & Part 2 with AI Hindi voiceover...');
    const createdParts = await handleRunHorrorSeriesBatch({
      count: 2,
      format: opts.format || 'youtube_short',
      customPremise:
        opts.customPremise ||
        'Spine-chilling Indian haunted night mystery told in 2 suspenseful connected parts',
      requirePermissionOverride: false,
    });

    const uploadedResults: StoryProject[] = [];
    const mixer = new StudioAudioMixer();

    try {
      for (let i = 0; i < createdParts.length; i++) {
        const part = createdParts[i];
        progress(`Step 3/4: Rendering video for Horror Part ${i + 1} of ${createdParts.length}...`);
        const exported = await exportStoryVideo({
          story: part,
          mixer,
          bgmEnabled: true,
          sfxEnabled: true,
          showSubtitles: true,
          onProgress: (pct) =>
            progress(`Rendering Horror Part ${i + 1}/${createdParts.length} (${pct}%)...`),
        });

        progress(`Step 4/4: Uploading Horror Part ${i + 1} directly to YouTube...`);
        const upRes = await fetch(`/api/youtube/upload/${part.id}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': exported.mimeType,
            'x-youtube-privacy': opts.privacyStatus || 'public',
            'x-confirm-republish': 'false',
            'x-allow-channel-mismatch': 'false',
          },
          body: exported.blob,
        });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok) {
          throw new Error(upData.error || `Failed uploading Horror Part ${i + 1} to YouTube.`);
        }
        if (upData.story) {
          handleStoryUpdated(upData.story as StoryProject);
          uploadedResults.push(upData.story as StoryProject);
        }
      }

      progress('Syncing live YouTube views & channel stats...');
      await handleSyncLiveYouTubeStats(token).catch(() => {});
      return uploadedResults;
    } finally {
      mixer.stopAll();
    }
  };

  const handleApprovePendingStory = async (storyId: string) => {
    const res = await fetch(`/api/stories/${storyId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Approval failed');
    handleStoryUpdated(data.story as StoryProject);
  };

  const handleDeclinePendingStory = async (storyId: string) => {
    const res = await fetch(`/api/stories/${storyId}/decline`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not decline pending item');
    handleStoryUpdated(data.story as StoryProject);
  };

  const handleApproveAllPending = async (storyIds: string[]) => {
    const res = await fetch('/api/automation/approve-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyIds }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Batch approval failed');
    const updatedMap = new Map(
      ((data.stories as StoryProject[]) || []).map((s) => [s.id, s])
    );
    setState((prev) =>
      prev
        ? {
            ...prev,
            stories: prev.stories.map((s) => updatedMap.get(s.id) ?? s),
          }
        : prev
    );
  };

  const handleUpdateAccounts = async (accounts: ConnectedAccounts) => {
    const res = await fetch('/api/accounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accounts),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update accounts');
    setState((prev) => (prev ? { ...prev, accounts: data.accounts } : prev));
  };

  const handleSaveAutomation = async (automation: DailyAutomationConfig) => {
    const res = await fetch('/api/automation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(automation),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save automation');
    setState((prev) => (prev ? { ...prev, automation: data.automation } : prev));
  };

  const handleAddIncome = async (entry: {
    source: 'youtube_adsense' | 'instagram_bonus' | 'sponsorship';
    description: string;
    amountInr: number;
  }) => {
    const res = await fetch('/api/income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add income entry');
    setState((prev) =>
      prev ? { ...prev, incomeEntries: [data.entry, ...prev.incomeEntries] } : prev
    );
  };

  if (authChecking || (currentUser && loading)) {
    return (
      <div className="min-h-screen bg-[#F8F9FB] p-6 lg:p-10">
        <div className="mx-auto max-w-6xl space-y-6 animate-pulse">
          <div className="h-10 w-64 rounded-lg bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-28 rounded-xl bg-slate-200" />
            ))}
          </div>
          <div className="h-72 rounded-xl bg-slate-200" />
        </div>
      </div>
    );
  }

  // Mandatory Login Access Gate before exposing any workspace or data
  if (!currentUser) {
    return (
      <AuthModal
        open={true}
        fullScreenGate={true}
        onClose={() => {}}
        currentUser={null}
        onAuthenticated={(user, sessionToken) => {
          setCurrentUser(user);
          void fetchState(sessionToken);
        }}
        onSignedOut={() => {
          setCurrentUser(null);
          setState(null);
        }}
      />
    );
  }

  if (loadError || !state) {
    return (
      <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold text-slate-900">Unable to load KathaStudio</h1>
          <p className="text-sm text-slate-600">{loadError || 'Server error'}</p>
          <button
            type="button"
            onClick={() => {
              void fetchState();
            }}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8F9FB] text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        accounts={state.accounts}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">KathaStudio</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
              <h1 className="font-semibold text-slate-900 truncate">
                {TAB_TITLES[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              data-testid="account-auth-button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              {currentUser ? (
                <>
                  <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
                  <span className="max-w-[110px] truncate">{currentUser.displayName}</span>
                </>
              ) : (
                <>
                  <Fingerprint className="h-3.5 w-3.5 text-orange-700" />
                  <span>Account / Biometric</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('studio')}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-700 px-4 py-2 text-xs font-medium text-white hover:bg-orange-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>New AI Story</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 p-5 lg:p-8">
          {activeTab === 'dashboard' && (
            <DashboardView
              state={state}
              onNavigate={setActiveTab}
              onOpenStory={(id) => {
                setSelectedStoryId(id);
                setActiveTab('studio');
              }}
              onQuickGenerate={handleQuickGenerate}
              onRunDailyBatch={() => handleRunDailyBatch()}
              onCreateAndUploadHorror2Parts={handleCreateAndUploadHorror2PartsToYouTube}
              onCreateHorror2PartsOnly={(premise) =>
                handleRunHorrorSeriesBatch({
                  count: 2,
                  format: 'youtube_short',
                  customPremise: premise,
                }).then((created) => {
                  if (created[0]) {
                    setSelectedStoryId(created[0].id);
                    setActiveTab('studio');
                  }
                })
              }
              onSyncLiveYouTubeStats={() => handleSyncLiveYouTubeStats()}
              isGenerating={isGenerating}
            />
          )}

          {activeTab === 'studio' && (
            <StudioView
              stories={state.stories}
              selectedStoryId={selectedStoryId}
              onSelectStory={setSelectedStoryId}
              accounts={state.accounts}
              onGenerateStory={(params) => handleGenerateStory(params)}
              onGenerateNextPart={handleGenerateNextPart}
              onGenerateVoiceover={handleGenerateVoiceover}
              onSaveStory={handleSaveStory}
              onStoryUpdated={handleStoryUpdated}
              onPublishStory={handlePublishStory}
            />
          )}

          {activeTab === 'scene3d' && (
            <ThreeSceneStudio
              stories={state.stories}
              selectedStoryId={selectedStoryId}
              onCaptureToStory={handleCapture3DToStory}
            />
          )}

          {activeTab === 'library' && (
            <LibraryView
              stories={state.stories}
              onOpenStory={(id) => {
                setSelectedStoryId(id);
                setActiveTab('studio');
              }}
              onDeleteStory={handleDeleteStory}
              onCreateNew={() => setActiveTab('studio')}
            />
          )}

          {activeTab === 'automation' && (
            <AutomationView
              automation={state.automation}
              youtubeAccount={state.accounts.youtube}
              pendingApprovalStories={state.stories.filter((s) => s.awaitingPermission)}
              onSaveAutomation={handleSaveAutomation}
              onRunDailyBatch={handleRunDailyBatch}
              onRunHorrorSeriesBatch={handleRunHorrorSeriesBatch}
              onCreateAndUploadHorror2Parts={handleCreateAndUploadHorror2PartsToYouTube}
              onApproveStory={handleApprovePendingStory}
              onDeclineStory={handleDeclinePendingStory}
              onApproveAllPending={handleApproveAllPending}
              onOpenStory={(id) => {
                setSelectedStoryId(id);
                setActiveTab('studio');
              }}
            />
          )}

          {activeTab === 'channels' && (
            <ChannelsView
              accounts={state.accounts}
              incomeEntries={state.incomeEntries}
              stories={state.stories}
              oauthEnv={state.oauthEnv}
              onUpdateAccounts={handleUpdateAccounts}
              onSyncLiveYouTubeStats={() => handleSyncLiveYouTubeStats()}
              onAddIncome={handleAddIncome}
            />
          )}
        </main>
      </div>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        currentUser={currentUser}
        onAuthenticated={(user) => setCurrentUser(user)}
        onSignedOut={() => {
          setCurrentUser(null);
          setState(null);
          setAuthModalOpen(false);
        }}
      />
    </div>
  );
}
