import { useState, type FormEvent } from 'react';
import type {
  BookNoteEntry,
  ListeningStatsSummary,
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
  FlameIcon,
  MoonIcon,
  PlayIcon,
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
  listeningStats: ListeningStatsSummary | null;
  bookNotes: BookNoteEntry[];
  onSelectService: (serviceId: string) => void;
  onOpenInSplit: (serviceId: string) => void;
  onOpenUrlInService: (serviceId: string, url: string) => void;
  onSearchInService: (serviceId: string, query: string) => void;
  onRemoveFavorite: (favoriteId: string) => void;
  onClearRecent: () => void;
  onClearListeningStats: () => void;
  onAddBookNote: (input: { bookTitle: string; timestampLabel: string; note: string; url?: string }) => void;
  onRemoveBookNote: (noteId: string) => void;
  onApplyWorkspace: (workspaceId: string) => void;
  onSetSleepTimer: (minutes: number) => void;
  onOpenMixer: () => void;
  onOpenCommandPalette: () => void;
}

function formatHoursMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
  listeningStats,
  bookNotes,
  onSelectService,
  onOpenInSplit,
  onOpenUrlInService,
  onSearchInService,
  onRemoveFavorite,
  onClearRecent,
  onClearListeningStats,
  onAddBookNote,
  onRemoveBookNote,
  onApplyWorkspace,
  onSetSleepTimer,
  onOpenMixer,
  onOpenCommandPalette,
}: HomeHubProps) {
  const [query, setQuery] = useState('');
  const [searchTargetId, setSearchTargetId] = useState<string>(services[0]?.id ?? 'youtube');
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [noteBookTitle, setNoteBookTitle] = useState('');
  const [noteTimestamp, setNoteTimestamp] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [notesCopied, setNotesCopied] = useState(false);

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

        {/* Private Local Listening Stats ("OmniDeck Wrapped") */}
        <section className="home-section stats-card">
          <div className="home-section__header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FlameIcon size={14} />
              <h2 className="section-label" style={{ margin: 0 }}>
                Listening Stats &amp; History (Local &amp; Private)
              </h2>
            </div>
            <div className="control-group" style={{ gap: 6 }}>
              {listeningStats && listeningStats.totalPlays > 0 && (
                <>
                  <button
                    type="button"
                    className="pill-btn"
                    onClick={() => setStatsExpanded((v) => !v)}
                  >
                    {statsExpanded ? 'Compact View' : 'Full Stats & History'}
                  </button>
                  <button type="button" className="pill-btn" onClick={onClearListeningStats}>
                    Clear Stats
                  </button>
                </>
              )}
            </div>
          </div>

          {!listeningStats || listeningStats.totalPlays === 0 ? (
            <div className="home-empty">
              <FlameIcon size={16} />
              <span>
                Your private listening stats across YouTube Music, Spotify, Audible, and YouTube
                will build here automatically as you listen — stored 100% locally on your PC.
              </span>
            </div>
          ) : (
            <div className="stats-body">
              <div className="stats-kpis">
                <div className="stats-kpi">
                  <div className="stats-kpi__val">{listeningStats.totalPlays}</div>
                  <div className="stats-kpi__label">Tracks Played</div>
                </div>
                <div className="stats-kpi">
                  <div className="stats-kpi__val">
                    {formatHoursMinutes(listeningStats.totalMinutes)}
                  </div>
                  <div className="stats-kpi__label">Listening Time</div>
                </div>
                <div className="stats-kpi">
                  <div className="stats-kpi__val">
                    {listeningStats.streakDays}d
                  </div>
                  <div className="stats-kpi__label">Daily Streak</div>
                </div>
                <div className="stats-kpi">
                  <div className="stats-kpi__val">
                    {listeningStats.topArtists[0]?.name || '—'}
                  </div>
                  <div className="stats-kpi__label">Top Artist</div>
                </div>
              </div>

              {listeningStats.byService.length > 0 && (
                <div className="stats-bars">
                  {listeningStats.byService.map((row) => {
                    const svc = getService(row.serviceId);
                    const pct =
                      listeningStats.totalMinutes > 0
                        ? Math.max(6, Math.round((row.minutes / listeningStats.totalMinutes) * 100))
                        : Math.max(6, Math.round((row.plays / listeningStats.totalPlays) * 100));
                    return (
                      <div key={row.serviceId} className="stats-bar-row">
                        <div className="stats-bar-row__label">
                          <ServiceIcon
                            icon={svc?.icon ?? 'globe'}
                            size={13}
                            color={svc?.accentColor ?? '#E87A3E'}
                          />
                          <span>{svc?.name ?? row.serviceId}</span>
                        </div>
                        <div className="stats-bar-row__track">
                          <div
                            className="stats-bar-row__fill"
                            style={{
                              width: `${pct}%`,
                              background: svc?.accentColor ?? 'var(--accent-primary)',
                            }}
                          />
                        </div>
                        <span className="stats-bar-row__val">
                          {formatHoursMinutes(row.minutes)} · {row.plays}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="home-columns">
                <div>
                  <div className="np-card__eyebrow" style={{ marginBottom: 6 }}>
                    Top Artists
                  </div>
                  <div className="home-list">
                    {listeningStats.topArtists
                      .slice(0, statsExpanded ? 10 : 4)
                      .map((artist, idx) => (
                        <div key={`${artist.name}-${idx}`} className="home-list-item">
                          <button
                            type="button"
                            className="home-list-item__main"
                            title={`Open ${artist.name} in YouTube Music`}
                            onClick={() =>
                              onSearchInService(
                                artist.serviceId === 'spotify' ? 'spotify' : 'youtube-music',
                                artist.name,
                              )
                            }
                          >
                            <span className="stats-rank">#{idx + 1}</span>
                            <div className="home-list-item__text">
                              <div className="home-list-item__title">{artist.name}</div>
                              <div className="home-list-item__meta">
                                {artist.plays} plays · {formatHoursMinutes(artist.minutes)}
                              </div>
                            </div>
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <div className="np-card__eyebrow" style={{ marginBottom: 6 }}>
                    Top Tracks (1-Click Replay)
                  </div>
                  <div className="home-list">
                    {listeningStats.topTracks
                      .slice(0, statsExpanded ? 10 : 4)
                      .map((track, idx) => (
                        <div key={`${track.title}-${track.artist}-${idx}`} className="home-list-item">
                          <button
                            type="button"
                            className="home-list-item__main"
                            onClick={() => {
                              if (track.url) {
                                onOpenUrlInService(track.serviceId, track.url);
                              } else {
                                onSearchInService(
                                  track.serviceId === 'spotify' ? 'spotify' : 'youtube-music',
                                  `${track.artist} ${track.title}`,
                                );
                              }
                            }}
                          >
                            <PlayIcon size={11} />
                            <div className="home-list-item__text">
                              <div className="home-list-item__title">{track.title}</div>
                              <div className="home-list-item__meta">
                                {track.artist} · {track.plays} plays
                              </div>
                            </div>
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {statsExpanded && listeningStats.recentPlays.length > 0 && (
                <div>
                  <div className="np-card__eyebrow" style={{ marginBottom: 6 }}>
                    Recent Play History
                  </div>
                  <div className="home-list">
                    {listeningStats.recentPlays.slice(0, 15).map((entry) => {
                      const svc = getService(entry.serviceId);
                      return (
                        <div key={entry.id} className="home-list-item">
                          <button
                            type="button"
                            className="home-list-item__main"
                            onClick={() => {
                              if (entry.url) {
                                onOpenUrlInService(entry.serviceId, entry.url);
                              } else {
                                onSearchInService(entry.serviceId, `${entry.artist} ${entry.title}`);
                              }
                            }}
                          >
                            <ServiceIcon
                              icon={svc?.icon ?? 'globe'}
                              size={14}
                              color={svc?.accentColor ?? '#E87A3E'}
                            />
                            <div className="home-list-item__text">
                              <div className="home-list-item__title">{entry.title}</div>
                              <div className="home-list-item__meta">
                                {entry.artist} · {svc?.shortName ?? entry.serviceId}
                              </div>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Audible Timestamped Book Notes & Quotes */}
        <section className="home-section">
          <div className="home-section__header">
            <h2 className="section-label" style={{ margin: 0 }}>
              Audible Book Notes &amp; Timestamped Quotes ({bookNotes.length})
            </h2>
            {bookNotes.length > 0 && (
              <button
                type="button"
                className="pill-btn"
                onClick={() => {
                  const md = bookNotes
                    .map((n) => `- **${n.bookTitle}** (${n.timestampLabel}): ${n.note}`)
                    .join('\n');
                  void navigator.clipboard?.writeText(md).then(() => {
                    setNotesCopied(true);
                    setTimeout(() => setNotesCopied(false), 2000);
                  });
                }}
              >
                {notesCopied ? 'Copied Markdown!' : 'Copy Markdown'}
              </button>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const audibleRt = runtime.audible;
              const book =
                noteBookTitle.trim() ||
                (audibleRt?.pageTitle && audibleRt.pageTitle !== 'Audible'
                  ? audibleRt.pageTitle.replace(/\s*[-|]\s*Audible.*$/i, '').trim()
                  : 'Audiobook');
              if (!noteBody.trim()) return;
              onAddBookNote({
                bookTitle: book,
                timestampLabel: noteTimestamp.trim() || 'Bookmark',
                note: noteBody.trim(),
                url: audibleRt?.currentUrl,
              });
              setNoteBody('');
              setNoteTimestamp('');
            }}
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}
          >
            <input
              type="text"
              className="text-input"
              style={{ flex: '1 1 160px' }}
              placeholder={
                runtime.audible?.pageTitle && runtime.audible.pageTitle !== 'Audible'
                  ? `Book (default: ${runtime.audible.pageTitle.slice(0, 28)})`
                  : 'Book title'
              }
              value={noteBookTitle}
              onChange={(e) => setNoteBookTitle(e.target.value)}
            />
            <input
              type="text"
              className="text-input"
              style={{ width: 96 }}
              placeholder="Ch / 1:24:10"
              value={noteTimestamp}
              onChange={(e) => setNoteTimestamp(e.target.value)}
            />
            <input
              type="text"
              className="text-input"
              style={{ flex: '2 1 220px' }}
              placeholder="Save a quote, idea, or chapter takeaway…"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
            />
            <button
              type="submit"
              className="pill-btn pill-btn--primary"
              disabled={!noteBody.trim()}
            >
              Save Note
            </button>
          </form>

          {bookNotes.length > 0 && (
            <div className="home-list">
              {bookNotes.slice(0, 8).map((n) => (
                <div key={n.id} className="home-list-item">
                  <div className="home-list-item__main" style={{ cursor: n.url ? 'pointer' : 'default' }} onClick={() => n.url && onOpenUrlInService('audible', n.url)}>
                    <ServiceIcon icon="audible" size={16} color="#F7991C" />
                    <div className="home-list-item__text">
                      <div className="home-list-item__title">{n.note}</div>
                      <div className="home-list-item__meta">
                        {n.bookTitle} · {n.timestampLabel}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    title="Delete note"
                    onClick={() => onRemoveBookNote(n.id)}
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

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
