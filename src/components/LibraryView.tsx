import { useState } from 'react';
import { ExternalLink, Film, Play, Search, Trash2 } from 'lucide-react';
import {
  formatCompactNumber,
  formatDurationMMSS,
  getFormatSpec,
  getTopicConfig,
} from '../lib/studioLogic';
import type { StoryProject, StoryStatus, StoryTopic } from '../lib/types';

interface LibraryViewProps {
  stories: StoryProject[];
  onOpenStory: (id: string) => void;
  onDeleteStory: (id: string) => Promise<void>;
  onCreateNew: () => void;
}

export function LibraryView({
  stories,
  onOpenStory,
  onDeleteStory,
  onCreateNew,
}: LibraryViewProps) {
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState<'all' | StoryTopic>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StoryStatus>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = stories.filter((s) => {
    if (topicFilter !== 'all' && s.topic !== topicFilter) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.titleHindi.toLowerCase().includes(q) ||
        s.beginning.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Filter Toolbar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Search stories and videos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Hindi or English titles..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-700 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'published', label: 'Published' },
                  { id: 'scheduled', label: 'Scheduled' },
                  { id: 'draft', label: 'Drafts' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter by story topic"
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value as 'all' | StoryTopic)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-orange-700 focus:outline-none"
            >
              <option value="all">All Topics</option>
              <option value="horror">Horror</option>
              <option value="krishna">Lord Krishna</option>
              <option value="ramayana">Ramayana</option>
              <option value="mahabharata">Mahabharata</option>
              <option value="hindu_gods">Hindu Gods</option>
            </select>
          </div>
        </div>
      </section>

      {/* Stories Grid */}
      {filtered.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <Film className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">
            {stories.length === 0 ? 'No videos created yet' : 'No stories match these filters'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {stories.length === 0
              ? 'Create your first horror 2-part series or AI story in the Studio. Live metrics will appear once uploaded.'
              : 'Clear your search filters or generate a brand-new Hindi story in the Studio.'}
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 transition-colors"
          >
            Create New AI Story
          </button>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((story) => {
            const topicCfg = getTopicConfig(story.topic);
            const formatSpec = getFormatSpec(story.format);
            const thumb = story.scenes[0]?.imageUrl || topicCfg.defaultImage;
            const isLive = story.status === 'published' || Boolean(story.youtubeVideoId);

            return (
              <article
                key={story.id}
                className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div>
                  <div className="aspect-video w-full overflow-hidden bg-slate-900">
                    <img
                      src={thumb}
                      alt={story.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
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
                          isLive
                            ? 'font-medium text-emerald-700'
                            : story.status === 'scheduled'
                              ? 'font-medium text-amber-700'
                              : 'font-medium text-slate-700'
                        }
                      >
                        {isLive
                          ? 'Live on YouTube'
                          : story.status === 'scheduled'
                            ? 'Scheduled'
                            : story.status === 'voice_ready'
                              ? 'Ready to Upload'
                              : 'Draft'}
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-semibold text-slate-900 line-clamp-2">
                      {story.titleHindi}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">{story.title}</p>
                    <p className="mt-2.5 text-xs leading-relaxed text-slate-600 line-clamp-2">
                      {story.beginning}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 bg-slate-50/50">
                  <div className="font-mono text-xs text-slate-600 tabular-nums">
                    {isLive ? (
                      <span className="inline-flex items-center gap-2">
                        <span>{formatCompactNumber(story.metrics.views)} views</span>
                        {story.youtubeUploadUrl && (
                          <a
                            href={story.youtubeUploadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-emerald-700 underline"
                          >
                            <span>YouTube</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </span>
                    ) : (
                      <span className="font-sans text-slate-400">Not uploaded yet</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {confirmDeleteId === story.id ? (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteStory(story.id);
                            setConfirmDeleteId(null);
                          }}
                          className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 whitespace-nowrap"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(story.id)}
                          aria-label={`Delete ${story.title}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-700 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenStory(story.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>Open</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
