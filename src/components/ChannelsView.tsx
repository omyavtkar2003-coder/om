import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  IndianRupee,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { connectYouTubeChannelWithGoogle, getCachedYouTubeAccessToken } from '../firebase';
import { formatCompactNumber, formatIndianCurrency } from '../lib/studioLogic';
import type {
  ConnectedAccounts,
  IncomeEntry,
  OAuthEnvStatus,
  StoryProject,
} from '../lib/types';

interface ChannelsViewProps {
  accounts: ConnectedAccounts;
  incomeEntries: IncomeEntry[];
  stories: StoryProject[];
  oauthEnv: OAuthEnvStatus;
  onUpdateAccounts: (accounts: ConnectedAccounts) => Promise<void>;
  onSyncLiveYouTubeStats: () => Promise<void>;
  onAddIncome: (entry: {
    source: 'youtube_adsense' | 'instagram_bonus' | 'sponsorship';
    description: string;
    amountInr: number;
  }) => Promise<void>;
}

export function ChannelsView({
  accounts,
  incomeEntries,
  stories,
  oauthEnv,
  onUpdateAccounts,
  onSyncLiveYouTubeStats,
  onAddIncome,
}: ChannelsViewProps) {
  const [ytForm, setYtForm] = useState(accounts.youtube);
  const [igForm, setIgForm] = useState(accounts.instagram);

  const [incSource, setIncSource] = useState<'youtube_adsense' | 'instagram_bonus' | 'sponsorship'>('youtube_adsense');
  const [incDesc, setIncDesc] = useState('');
  const [incAmount, setIncAmount] = useState('');

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connectingYtGoogle, setConnectingYtGoogle] = useState(false);
  const [syncingLive, setSyncingLive] = useState(false);
  const [ytGoogleAuthorized, setYtGoogleAuthorized] = useState(() => Boolean(getCachedYouTubeAccessToken()));
  const [oauthAuthorizeUrl, setOauthAuthorizeUrl] = useState<{ provider: string; url: string } | null>(null);

  useEffect(() => {
    setYtForm(accounts.youtube);
    setIgForm(accounts.instagram);
  }, [accounts]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'KATHA_OAUTH_SUCCESS') {
        setOauthAuthorizeUrl(null);
        setStatusMsg(`${ev.data.provider} OAuth authorization completed.`);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const normalizeChannelId = (raw: string): string => {
    const trimmed = raw.trim();
    const match = trimmed.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/i);
    if (match) return match[1];
    return trimmed;
  };

  const handleSaveYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const cleanedChannelId = normalizeChannelId(ytForm.channelId || '');
    if (!cleanedChannelId && (!ytForm.channelName.trim() || !ytForm.handle.trim())) {
      setErrorMsg('Enter your YouTube Channel ID (e.g. UC...) or channel name & handle.');
      return;
    }
    await onUpdateAccounts({
      ...accounts,
      youtube: {
        ...ytForm,
        channelId: cleanedChannelId || undefined,
        channelName: ytForm.channelName.trim() || `YouTube Channel (${cleanedChannelId.slice(0, 10)})`,
        handle: ytForm.handle.trim() || `@${cleanedChannelId}`,
        connected: true,
      },
    });
    setStatusMsg(
      cleanedChannelId
        ? `YouTube channel ${cleanedChannelId} saved as active upload target.`
        : 'YouTube channel profile saved.'
    );
  };

  const handleSaveInstagram = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    if (!igForm.username.trim() || !igForm.displayName.trim()) {
      setErrorMsg('Enter your Instagram username and display name.');
      return;
    }
    await onUpdateAccounts({
      ...accounts,
      instagram: { ...igForm, connected: true, lastSyncedAt: new Date().toISOString() },
    });
    setStatusMsg('Instagram account profile saved.');
  };

  const handleConnectYouTubeGoogle = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setConnectingYtGoogle(true);
    try {
      const res = await connectYouTubeChannelWithGoogle();
      setYtGoogleAuthorized(Boolean(res.accessToken));
      if (res.channel) {
        const nextYt = {
          ...ytForm,
          connected: true,
          channelId: res.channel.id,
          channelName: res.channel.title,
          handle: res.channel.handle,
          subscribers: res.channel.subscribers,
          oauthMode: 'oauth' as const,
          lastSyncedAt: new Date().toISOString(),
        };
        setYtForm(nextYt);
        await onUpdateAccounts({
          ...accounts,
          youtube: nextYt,
        });
        setStatusMsg(
          `YouTube channel "${res.channel.title}" (${res.channel.id}) connected! Live subscribers: ${res.channel.subscribers}.`
        );
      } else {
        setStatusMsg(
          'Google YouTube authorization granted! Make sure your Google account has an active YouTube channel.'
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Google YouTube authorization failed.'
      );
    } finally {
      setConnectingYtGoogle(false);
    }
  };

  const handleSyncLiveYouTube = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setSyncingLive(true);
    try {
      await onSyncLiveYouTubeStats();
      setYtGoogleAuthorized(true);
      setStatusMsg('Synced live subscriber count and video views directly from YouTube Data API v3.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sync live YouTube metrics.');
    } finally {
      setSyncingLive(false);
    }
  };

  const handlePrepareOAuthLink = async (provider: 'youtube' | 'instagram') => {
    setErrorMsg(null);
    const res = await fetch(`/api/auth/${provider}/url`);
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || `Configure ${provider} OAuth keys in Secrets first.`);
      return;
    }
    setOauthAuthorizeUrl({ provider, url: data.url });
  };

  const handleLogIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsedAmt = Number(incAmount);
    if (!incDesc.trim() || !Number.isFinite(parsedAmt) || parsedAmt <= 0) {
      setErrorMsg('Provide a description and positive INR amount.');
      return;
    }
    await onAddIncome({
      source: incSource,
      description: incDesc.trim(),
      amountInr: parsedAmt,
    });
    setIncDesc('');
    setIncAmount('');
    setStatusMsg('Income entry added to ledger.');
  };

  const totalIncome = incomeEntries.reduce((sum, item) => sum + item.amountInr, 0);
  const uploadedVideos = stories.filter((s) => Boolean(s.youtubeVideoId));

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Official New Channel Setup Guide */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Create &amp; Link YouTube / Instagram Channels
            </h2>
            <p className="text-xs text-slate-500">
              Target YouTube channel <span className="font-mono">{accounts.youtube.channelId || 'UCGEptT_IzEoW8BkrtE_bPRg'}</span> is pre-bound. Authorize Google OAuth to upload directly and fetch live YouTube analytics.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://accounts.google.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5 text-orange-700" />
              <span>1. Create Google ID</span>
            </a>
            <a
              href="https://www.youtube.com/create_channel"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5 text-orange-700" />
              <span>2. Create YouTube Channel</span>
            </a>
            <a
              href="https://www.instagram.com/accounts/emailsignup/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5 text-orange-700" />
              <span>3. Create Instagram ID</span>
            </a>
          </div>
        </div>
      </section>

      {oauthAuthorizeUrl && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-900">
          <span>Authorize your {oauthAuthorizeUrl.provider} channel to enable direct upload permissions:</span>
          <a
            href={oauthAuthorizeUrl.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-700 px-3 py-1.5 font-medium text-white hover:bg-orange-800"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Continue {oauthAuthorizeUrl.provider} Authorization</span>
          </a>
        </div>
      )}

      {/* Account Management Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* YouTube Account */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">YouTube Channel</h2>
              <p className="text-xs text-slate-500">
                {accounts.youtube.lastSyncedAt
                  ? `Live · ${accounts.youtube.channelId} · ${formatCompactNumber(accounts.youtube.subscribers)} subscribers`
                  : `Target ID: ${accounts.youtube.channelId || 'Not set'} · Live stats pending OAuth sync`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={syncingLive}
                onClick={() => void handleSyncLiveYouTube()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingLive ? 'animate-spin' : ''}`} />
                <span>Refresh Live</span>
              </button>
              <button
                type="button"
                disabled={connectingYtGoogle}
                onClick={() => void handleConnectYouTubeGoogle()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  {connectingYtGoogle
                    ? 'Connecting Google...'
                    : ytGoogleAuthorized
                      ? 'YouTube Upload Authorized'
                      : 'Authorize Google YouTube Upload'}
                </span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveYouTube} className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="yt-channel-id" className="block text-xs font-medium text-slate-700">
                  Target YouTube Channel ID
                </label>
                {ytForm.channelId && (
                  <a
                    href={`https://www.youtube.com/channel/${normalizeChannelId(ytForm.channelId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-700 hover:text-orange-800"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>Open Channel</span>
                  </a>
                )}
              </div>
              <input
                id="yt-channel-id"
                type="text"
                value={ytForm.channelId ?? ''}
                onChange={(e) => setYtForm({ ...ytForm, channelId: e.target.value })}
                placeholder="UCGEptT_IzEoW8BkrtE_bPRg"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="yt-channel-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Channel Name
                </label>
                <input
                  id="yt-channel-name"
                  type="text"
                  value={ytForm.channelName}
                  onChange={(e) => setYtForm({ ...ytForm, channelName: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="yt-handle" className="block text-xs font-medium text-slate-700 mb-1">
                  Channel Handle
                </label>
                <input
                  id="yt-handle"
                  type="text"
                  value={ytForm.handle}
                  onChange={(e) => setYtForm({ ...ytForm, handle: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                {accounts.youtube.lastSyncedAt
                  ? `Last synced: ${new Date(accounts.youtube.lastSyncedAt).toLocaleString()}`
                  : 'Subscribers & views sync live after YouTube OAuth'}
              </span>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
              >
                Save YouTube Channel
              </button>
            </div>
          </form>
        </section>

        {/* Instagram Account */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Instagram Creator Account</h2>
              <p className="text-xs text-slate-500">
                {accounts.instagram.connected && accounts.instagram.username
                  ? `Connected · @${accounts.instagram.username}`
                  : 'Not connected yet'}
              </p>
            </div>
            {oauthEnv.instagramOAuthReady && (
              <button
                type="button"
                onClick={() => void handlePrepareOAuthLink('instagram')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Connect Instagram OAuth</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSaveInstagram} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ig-username" className="block text-xs font-medium text-slate-700 mb-1">
                  Instagram Username
                </label>
                <input
                  id="ig-username"
                  type="text"
                  value={igForm.username}
                  onChange={(e) => setIgForm({ ...igForm, username: e.target.value })}
                  placeholder="your.instagram.handle"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="ig-display" className="block text-xs font-medium text-slate-700 mb-1">
                  Account Display Name
                </label>
                <input
                  id="ig-display"
                  type="text"
                  value={igForm.displayName}
                  onChange={(e) => setIgForm({ ...igForm, displayName: e.target.value })}
                  placeholder="Channel Display Name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {accounts.instagram.connected ? (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateAccounts({
                      ...accounts,
                      instagram: { ...igForm, connected: false },
                    })
                  }
                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Disconnect Account
                </button>
              ) : (
                <span className="text-xs text-slate-400">Enter handle to link profile</span>
              )}
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
              >
                Save Instagram Account
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Live Uploaded YouTube Videos */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Live Uploaded YouTube Videos</h2>
            <p className="text-xs text-slate-500">
              Shows only videos actually uploaded to YouTube and their live YouTube Data API v3 stats.
            </p>
          </div>
          <span className="font-mono text-xs font-semibold text-slate-700">
            {uploadedVideos.length} live video(s)
          </span>
        </div>

        {uploadedVideos.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No videos have been uploaded to YouTube yet. Once you upload your 2-part horror videos, live stats will appear here.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {uploadedVideos.map((vid) => (
              <div key={vid.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{vid.titleHindi}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    ID: {vid.youtubeVideoId} · Privacy: {vid.youtubePrivacyStatus || 'public'}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-slate-800">
                    {formatCompactNumber(vid.metrics.views)} views · {formatCompactNumber(vid.metrics.likes)} likes
                  </span>
                  {vid.youtubeUploadUrl && (
                    <a
                      href={vid.youtubeUploadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 underline"
                    >
                      <span>Watch</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Income & Revenue Ledger */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Creator Income &amp; Payout Ledger</h2>
            <p className="text-xs text-slate-500">
              Log real YouTube AdSense, Instagram Reels bonuses, and brand payouts.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            <IndianRupee className="h-4 w-4 text-orange-700" />
            <span>{incomeEntries.length > 0 ? formatIndianCurrency(totalIncome) : '—'}</span>
          </div>
        </div>

        <form onSubmit={handleLogIncome} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-3">
            <label htmlFor="inc-source" className="block text-xs font-medium text-slate-700 mb-1">
              Revenue Source
            </label>
            <select
              id="inc-source"
              value={incSource}
              onChange={(e) =>
                setIncSource(e.target.value as 'youtube_adsense' | 'instagram_bonus' | 'sponsorship')
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            >
              <option value="youtube_adsense">YouTube AdSense</option>
              <option value="instagram_bonus">Instagram Reels Bonus</option>
              <option value="sponsorship">Sponsorship</option>
            </select>
          </div>

          <div className="sm:col-span-5">
            <label htmlFor="inc-desc" className="block text-xs font-medium text-slate-700 mb-1">
              Description
            </label>
            <input
              id="inc-desc"
              type="text"
              value={incDesc}
              onChange={(e) => setIncDesc(e.target.value)}
              placeholder="e.g., YouTube Horror Series Payout"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="inc-amt" className="block text-xs font-medium text-slate-700 mb-1">
              Amount (INR)
            </label>
            <input
              id="inc-amt"
              type="number"
              min={1}
              value={incAmount}
              onChange={(e) => setIncAmount(e.target.value)}
              placeholder="1500"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-orange-700 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-700 px-3 py-2 text-sm font-medium text-white hover:bg-orange-800 transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Add Entry</span>
            </button>
          </div>
        </form>

        {incomeEntries.length === 0 ? (
          <p className="mt-6 text-center text-xs text-slate-400 py-4">
            No payout entries logged yet.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-2.5 pr-4">Date</th>
                  <th className="py-2.5 pr-4">Source</th>
                  <th className="py-2.5 pr-4">Description</th>
                  <th className="py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incomeEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-4 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {entry.date}
                    </td>
                    <td className="py-3 pr-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {entry.source === 'youtube_adsense'
                        ? 'YouTube AdSense'
                        : entry.source === 'instagram_bonus'
                          ? 'Instagram Reels'
                          : 'Sponsorship'}
                    </td>
                    <td className="py-3 pr-4 text-sm text-slate-800">{entry.description}</td>
                    <td className="py-3 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatIndianCurrency(entry.amountInr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
