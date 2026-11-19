import {
  BarChart3,
  Box,
  CalendarClock,
  Film,
  FolderKanban,
  LayoutDashboard,
  X,
} from 'lucide-react';
import type { ConnectedAccounts } from '../lib/types';

export type StudioTab =
  | 'dashboard'
  | 'studio'
  | 'scene3d'
  | 'library'
  | 'automation'
  | 'channels';

interface SidebarProps {
  activeTab: StudioTab;
  onSelectTab: (tab: StudioTab) => void;
  accounts: ConnectedAccounts;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: StudioTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'studio', label: 'Story & Video Studio', icon: Film },
  { id: 'scene3d', label: '3D Scene Studio', icon: Box },
  { id: 'library', label: 'Content Library', icon: FolderKanban },
  { id: 'automation', label: 'Daily Automation', icon: CalendarClock },
  { id: 'channels', label: 'Channels & Income', icon: BarChart3 },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  accounts,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col justify-between border-r border-slate-200 bg-white px-4 py-5">
      <div>
        <div className="flex items-center justify-between px-2 pb-6">
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('dashboard');
              onCloseMobile();
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            KathaStudio
          </a>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Studio navigation" className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-orange-50 text-orange-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-orange-700' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 pt-4 text-xs text-slate-600 space-y-2 px-2">
        <div className="font-medium text-slate-900">Connected Destinations</div>
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0">YouTube</span>
          <span
            title={accounts.youtube.connected ? accounts.youtube.handle : 'Disconnected'}
            className={`truncate max-w-[125px] font-mono text-[11px] ${accounts.youtube.connected ? 'font-medium text-emerald-700' : 'text-slate-400'}`}
          >
            {accounts.youtube.connected ? accounts.youtube.handle : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0">Instagram</span>
          <span
            title={accounts.instagram.connected ? `@${accounts.instagram.username}` : 'Disconnected'}
            className={`truncate max-w-[125px] text-[11px] ${accounts.instagram.connected ? 'font-medium text-emerald-700' : 'text-slate-400'}`}
          >
            {accounts.instagram.connected ? `@${accounts.instagram.username}` : 'Disconnected'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 lg:block">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-64 max-w-[80vw]">{navContent}</div>
        </div>
      )}
    </>
  );
}
