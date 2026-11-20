import { useState, type FormEvent } from 'react';
import type {
  PinnedFavorite,
  RecentActivityItem,
  ServiceDefinition,
  ServiceRuntimeState,
  SleepTimerState,
  WorkspacePreset,
} from '@omnideck/shared';
import { ServiceIcon } from './ServiceIcon';
import {
  CloseIcon,
  EqualizerBars,
  MoonIcon,
  SearchIcon,
  SlidersIcon,
  SplitIcon,
  StarIcon,
  TimerIcon,
} from './Icons';

interface HomeHubProps {
  services: ServiceDefinition[];
  allServices: ServiceDefinition[];
  runtime: Record<string, ServiceRuntimeState>;
  workspaces: WorkspacePreset[];
  activeWorkspaceId: string;
  pinnedFavorites: PinnedFavorite[];
  recentActivity: RecentActivityItem[];
  sleepTimer: SleepTimerState;
  onSelectService: (serviceId: string) => void;
  onOpenInSplit: (serviceId: string) => void;
  onOpenUrlInService: (serviceId: string, url: string) => void;
  onSearchInService: (serviceId: string, query: string) => void;
  onRemoveFavorite: (favoriteId: string) => void;
  onClearRecent: () => void;
  onApplyWorkspace: (workspaceId: string) => void;
  onSetSleepTimer: (minutes: number) => void;
  onOpenMixer: () => void;
  onOpenCommandPalette: () => void;
}

export function HomeHub({
  services,
  allServices,
  runtime,
  workspaces,
  activeWorkspaceId,
  pinnedFavorites,
  recentActivity,
  sleepTimer,
  onSelectService,
  onOpenInSplit,
  onOpenUrlInService,
  onSearchInService,
  onRemoveFavorite,
  onClearRecent,
  onApplyWorkspace,
  onSetSleepTimer,
  onOpenMixer,
  onOpenCommandPalette,
}: HomeHubProps) {
  const [query, setQuery] = useState('');
  const [searchTargetId, setSearchTargetId] = useState<string>(services[0]?.id ?? 'youtube');

  const getService = (id: string) => allServices.find((s) => s.id === id);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const trimmed = query.trim();
    const target = trimmed.startsWith('r/') ? 'reddit' : searchTargetId;
    onSearchInService(target, trimmed);
    setQuery('');
  };

  return (
    <main className="home-hub" aria-label="OmniDeck Home Hub">
      <div className="home-hub__inner">
        {/* Native Unified Cross-Service Search */}
        <section className="home-hero">
          <div className="home-hero__top">
            <div>
              <h1 className="home-hero__title">OmniDeck Hub</h1>
              <p className="home-hero__subtitle">
                Search across all your platforms, resume listening, or jump into a workspace.
              </p>
            </div>
            <div className="control-group" style={{ gap: 6 }}>
              <button type="button" className="pill-btn" onClick={onOpenCommandPalette}>
                <SearchIcon size={12} />
                <span>Command Palette</span>
                <kbd>Ctrl+K</kbd>
              </button>
              <button type="button" className="pill-btn" onClick={onOpenMixer}>
                <SlidersIcon size={12} />
                <span>Audio Mixer</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSearchSubmit} className="home-search">
            <SearchIcon size={15} />
            <input
              type="text"
              className="home-search__input"
              placeholder="Search videos, songs, streams, audiobooks, or type r/subreddit…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="home-search__targets">
              {services.slice(0, 6).map((svc) => (
                <button
                  key={svc.id}
                  type="button"
                  className={`home-search__chip ${searchTargetId === svc.id ? 'home-search__chip--active' : ''}`}
                  title={`Search in ${svc.name}`}
                  onClick={() => {
                    setSearchTargetId(svc.id);
                    if (query.trim()) {
                      onSearchInService(svc.id, query.trim());
                      setQuery('');
                    }
                  }}
                >
                  <ServiceIcon icon={svc.icon} size={13} color={svc.accentColor} />
                  <span>{svc.shortName}</span>
                </button>
              ))}
            </div>
          </form>
        </section>

        {/* Your Media Apps */}
        <section className="home-section">
          <div className="home-section__header">
            <h2 className="section-label" style={{ margin: 0 }}>
              Your Media Apps
            </h2>
            <div className="home-ws-pills">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  className={`pill-btn ${ws.id === activeWorkspaceId ? 'pill-btn--active' : ''}`}
                  onClick={() => onApplyWorkspace(ws.id)}
                >
                  {ws.name}
                </button>
              ))}
            </div>
          </div>

          <div className="home-app-grid">
            {services.map((svc) => {
              const rt = runtime[svc.id];
              const isPlaying = Boolean(rt?.audible && !rt?.muted);
              const isHibernated = Boolean(rt?.hibernated);
              const isMounted = Boolean(rt?.mounted);

              return (
                <div
                  key={svc.id}
                  className="home-app-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectService(svc.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectService(svc.id);
                    }
                  }}
                >
                  <div className="home-app-card__top">
                    <div className="home-app-card__icon">
                      <ServiceIcon icon={svc.icon} size={22} color={svc.accentColor} />
                    </div>
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      title={`Open ${svc.name} in Split View`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenInSplit(svc.id);
                      }}
                    >
                      <SplitIcon size={12} />
                    </button>
                  </div>
                  <div className="home-app-card__name">{svc.name}</div>
                  <div className="home-app-card__status">
                    {isPlaying ? (
                      <span className="home-status--live">
                        <EqualizerBars /> Playing
                      </span>
                    ) : isHibernated ? (
                      <span className="home-status--muted">
                        <MoonIcon size={11} /> Sleeping
                      </span>
                    ) : isMounted ? (
                      <span className="home-status--ready">Signed in · Active</span>
                    ) : (
                      <span className="home-status--muted">Ready to launch</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pinned Favorites + Continue Watching/Listening */}
        <div className="home-columns">
          <section className="home-section">
            <div className="home-section__header">
              <h2 className="section-label" style={{ margin: 0 }}>
                Pinned Favorites
              </h2>
              <span className="setting-row__desc">Pin any stream, subreddit, or book via the star icon</span>
            </div>

            {pinnedFavorites.length === 0 ? (
              <div className="home-empty">
                <StarIcon size={16} />
                <span>
                  No pinned favorites yet. Open any YouTube channel, Twitch streamer, subreddit,
                  Spotify playlist, or Audible book and click the <strong>Pin</strong> star.
                </span>
              </div>
            ) : (
              <div className="home-list">
                {pinnedFavorites.map((fav) => {
                  const svc = getService(fav.serviceId);
                  return (
                    <div key={fav.id} className="home-list-item">
                      <button
                        type="button"
                        className="home-list-item__main"
                        onClick={() => onOpenUrlInService(fav.serviceId, fav.url)}
                      >
                        <ServiceIcon
                          icon={svc?.icon ?? 'globe'}
                          size={16}
                          color={svc?.accentColor ?? '#E47E3C'}
                        />
                        <div className="home-list-item__text">
                          <div className="home-list-item__title">{fav.title}</div>
                          <div className="home-list-item__meta">
                            {svc?.name ?? fav.serviceId} · {fav.url}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        title="Unpin favorite"
                        onClick={() => onRemoveFavorite(fav.id)}
                      >
                        <CloseIcon size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="home-section">
            <div className="home-section__header">
              <h2 className="section-label" style={{ margin: 0 }}>
                Continue Watching &amp; Listening
              </h2>
              {recentActivity.length > 0 && (
                <button type="button" className="pill-btn" onClick={onClearRecent}>
                  Clear
                </button>
              )}
            </div>

            {recentActivity.length === 0 ? (
              <div className="home-empty">
                <TimerIcon size={16} />
                <span>
                  Videos, streams, albums, subreddits, and audiobooks you open appear here for
                  1-click resume.
                </span>
              </div>
            ) : (
              <div className="home-list">
                {recentActivity.slice(0, 8).map((item) => {
                  const svc = getService(item.serviceId);
                  return (
                    <div key={item.id} className="home-list-item">
                      <button
                        type="button"
                        className="home-list-item__main"
                        onClick={() => onOpenUrlInService(item.serviceId, item.url)}
                      >
                        <ServiceIcon
                          icon={svc?.icon ?? 'globe'}
                          size={16}
                          color={svc?.accentColor ?? '#E47E3C'}
                        />
                        <div className="home-list-item__text">
                          <div className="home-list-item__title">{item.title}</div>
                          <div className="home-list-item__meta">{svc?.name ?? item.serviceId}</div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Quick Sleep Timer Strip */}
        <section className="home-sleep-strip">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TimerIcon size={15} />
            <span className="setting-row__title">Sleep Timer</span>
            <span className="setting-row__desc">
              {sleepTimer.active
                ? `Active (${sleepTimer.durationMinutes} min) — gently fades out & pauses audio`
                : 'Auto-fade and pause Audible, Spotify, or YouTube Music'}
            </span>
          </div>
          <div className="control-group" style={{ gap: 6 }}>
            {[15, 30, 45, 60].map((mins) => (
              <button
                key={mins}
                type="button"
                className={`pill-btn ${sleepTimer.active && sleepTimer.durationMinutes === mins ? 'pill-btn--active' : ''}`}
                onClick={() => onSetSleepTimer(mins)}
              >
                {mins}m
              </button>
            ))}
            {sleepTimer.active && (
              <button type="button" className="pill-btn" onClick={() => onSetSleepTimer(0)}>
                Cancel
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
