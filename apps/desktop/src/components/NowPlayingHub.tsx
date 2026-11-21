import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  findActiveLyricIndex,
  type AiCompanionConfig,
  type ArtistDossier,
  type NowPlayingState,
  type ServiceDefinition,
  type SuggestedBand,
} from '@omnideck/shared';
import { ServiceIcon } from './ServiceIcon';
import {
  CloseIcon,
  CollapseStageIcon,
  ExpandStageIcon,
  PauseIcon,
  PlayIcon,
  ReloadIcon,
  SettingsIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SparklesIcon,
} from './Icons';

export type NowPlayingMode = 'closed' | 'drawer' | 'stage';
type HubTab = 'overview' | 'similar' | 'lyrics' | 'ai';

interface NowPlayingHubProps {
  mode: 'drawer' | 'stage';
  nowPlaying: NowPlayingState;
  services: ServiceDefinition[];
  aiConfig: AiCompanionConfig;
  topOffset: number;
  bottomOffset: number;
  onClose: () => void;
  onToggleStageMode: () => void;
  onPlayPause: (serviceId?: string) => void;
  onPrevious: (serviceId?: string) => void;
  onNext: (serviceId?: string) => void;
  onSearchInService: (serviceId: string, query: string) => void;
  onOpenAiSettings: () => void;
  onLoadDossier: (input: {
    serviceId: string;
    title: string;
    artist?: string;
    album?: string;
    artworkUrl?: string;
    durationSec?: number;
    forceRefresh?: boolean;
  }) => Promise<ArtistDossier>;
  onLoadBandDetails: (bandName: string) => Promise<SuggestedBand>;
  onAskAi: (dossier: ArtistDossier, question: string) => Promise<{ answer: string; error?: string }>;
  onBlockMusic: (input: { kind: 'artist' | 'track'; value: string; artist?: string }) => void;
}

const QUICK_AI_PROMPTS = [
  'Best album to start with?',
  'Give me 5 deeper-cut bands like this',
  'Explain the vibe & lyrics of this track',
  'Samples, production & musical influences?',
];

function formatSec(sec?: number): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export function NowPlayingHub({
  mode,
  nowPlaying,
  services,
  aiConfig,
  topOffset,
  bottomOffset,
  onClose,
  onToggleStageMode,
  onPlayPause,
  onPrevious,
  onNext,
  onSearchInService,
  onOpenAiSettings,
  onLoadDossier,
  onLoadBandDetails,
  onAskAi,
  onBlockMusic,
}: NowPlayingHubProps) {
  const [tab, setTab] = useState<HubTab>('overview');
  const [dossier, setDossier] = useState<ArtistDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedBandId, setExpandedBandId] = useState<string | null>(null);
  const [loadingBandId, setLoadingBandId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<
    Array<{ id: string; q: string; a: string; error?: string }>
  >([]);
  const [lyricOffsetSec, setLyricOffsetSec] = useState(0);
  const [clockTick, setClockTick] = useState(0);

  const activeLyricRef = useRef<HTMLDivElement | null>(null);
  const prevTrackIdentityRef = useRef<string>('');

  const musicServiceId =
    nowPlaying.serviceId === 'spotify' || nowPlaying.serviceId === 'youtube-music'
      ? nowPlaying.serviceId
      : 'youtube-music';

  const currentService = services.find((s) => s.id === (nowPlaying.serviceId ?? 'youtube-music'));
  const hasTrack = Boolean(nowPlaying.serviceId && nowPlaying.title);
  const trackIdentity = `${nowPlaying.serviceId ?? ''}::${nowPlaying.title ?? ''}::${nowPlaying.artist ?? ''}::${aiConfig.provider}::${aiConfig.autoEnrich}`;
  const durationBucket =
    typeof nowPlaying.durationSec === 'number' && nowPlaying.durationSec > 10
      ? Math.round(nowPlaying.durationSec / 6) * 6
      : 0;

  // Smooth 200ms local clock tick while playing so lyrics & progress stay fluid between IPC polls
  useEffect(() => {
    if (!nowPlaying.playing || typeof nowPlaying.currentTimeSec !== 'number') return;
    const timer = setInterval(() => setClockTick((t) => (t + 1) % 10000), 200);
    return () => clearInterval(timer);
  }, [nowPlaying.playing, nowPlaying.currentTimeSec, nowPlaying.playbackSyncedAt]);

  const liveTimeSec = useMemo(() => {
    if (typeof nowPlaying.currentTimeSec !== 'number') return undefined;
    if (!nowPlaying.playing || typeof nowPlaying.playbackSyncedAt !== 'number') {
      return nowPlaying.currentTimeSec;
    }
    const elapsed = Math.min(1.2, Math.max(0, (Date.now() - nowPlaying.playbackSyncedAt) / 1000));
    const est = nowPlaying.currentTimeSec + elapsed;
    return typeof nowPlaying.durationSec === 'number' && nowPlaying.durationSec > 0
      ? Math.min(nowPlaying.durationSec, est)
      : est;
  }, [
    nowPlaying.currentTimeSec,
    nowPlaying.durationSec,
    nowPlaying.playing,
    nowPlaying.playbackSyncedAt,
    clockTick,
  ]);

  // Stop any inline 30s preview audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  // Auto-load dossier whenever the playing track/artist changes (or duration resolves for exact lyric matching)
  useEffect(() => {
    if (!hasTrack) {
      prevTrackIdentityRef.current = '';
      setDossier(null);
      setLyricOffsetSec(0);
      return;
    }
    const isSameTrackRefinement = prevTrackIdentityRef.current === trackIdentity;
    prevTrackIdentityRef.current = trackIdentity;

    let cancelled = false;
    if (!isSameTrackRefinement) {
      setLoading(true);
      setExpandedBandId(null);
      setAiMessages([]);
      setLyricOffsetSec(0);
    }

    void onLoadDossier({
      serviceId: nowPlaying.serviceId!,
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      album: nowPlaying.album,
      artworkUrl: nowPlaying.artworkUrl,
      durationSec: nowPlaying.durationSec,
    })
      .then((result) => {
        if (!cancelled) setDossier(result);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && !isSameTrackRefinement) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trackIdentity, durationBucket]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeLyricIdx = useMemo(() => {
    if (!dossier?.lyrics?.synced || !dossier.lyrics.lines.length) return -1;
    if (typeof liveTimeSec !== 'number') return -1;
    return findActiveLyricIndex(dossier.lyrics.lines, Math.max(0, liveTimeSec + lyricOffsetSec));
  }, [dossier?.lyrics, liveTimeSec, lyricOffsetSec]);

  useEffect(() => {
    if (activeLyricRef.current && (tab === 'lyrics' || mode === 'stage')) {
      activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLyricIdx, tab, mode]);

  const handleRefresh = async () => {
    if (!hasTrack) return;
    setLoading(true);
    try {
      const fresh = await onLoadDossier({
        serviceId: nowPlaying.serviceId!,
        title: nowPlaying.title,
        artist: nowPlaying.artist,
        album: nowPlaying.album,
        artworkUrl: nowPlaying.artworkUrl,
        durationSec: nowPlaying.durationSec,
        forceRefresh: true,
      });
      setDossier(fresh);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBand = async (band: SuggestedBand) => {
    if (expandedBandId === band.id) {
      setExpandedBandId(null);
      return;
    }
    setExpandedBandId(band.id);
    if (band.detailsLoaded) return;

    setLoadingBandId(band.id);
    try {
      const enriched = await onLoadBandDetails(band.name);
      setDossier((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          suggestedBands: prev.suggestedBands.map((b) =>
            b.id === band.id
              ? {
                  ...b,
                  ...enriched,
                  id: band.id,
                  reason: b.reason || enriched.reason,
                  detailsLoaded: true,
                }
              : b,
          ),
        };
      });
    } finally {
      setLoadingBandId((cur) => (cur === band.id ? null : cur));
    }
  };

  const handleTogglePreview = (url?: string) => {
    if (!url) return;
    if (previewUrl === url && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPreviewUrl(null);
      return;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.onended = () => {
      setPreviewUrl(null);
      previewAudioRef.current = null;
    };
    previewAudioRef.current = audio;
    setPreviewUrl(url);
    void audio.play().catch(() => {
      setPreviewUrl(null);
    });
  };

  const handleAsk = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || !dossier || aiLoading) return;
    setAiQuestion('');
    setAiLoading(true);
    try {
      const res = await onAskAi(dossier, q);
      setAiMessages((prev) => [
        ...prev,
        { id: `msg-${Date.now()}`, q, a: res.answer, error: res.error },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAskSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleAsk(aiQuestion);
  };

  const progressPct =
    typeof liveTimeSec === 'number' &&
    typeof nowPlaying.durationSec === 'number' &&
    nowPlaying.durationSec > 0
      ? Math.min(100, Math.max(0, (liveTimeSec / nowPlaying.durationSec) * 100))
      : 0;

  const artwork = dossier?.artworkUrl || nowPlaying.artworkUrl;
  const playTargetLabel = musicServiceId === 'spotify' ? 'Spotify' : 'YouTube Music';

  const renderOverviewSection = () => (
    <div className="np-section-stack">
      {dossier?.trackContext && (
        <div className="np-card np-card--ai">
          <div className="np-card__eyebrow">
            <SparklesIcon size={12} />
            <span>AI Track Context ({dossier.aiProvider})</span>
          </div>
          <p className="np-card__body">{dossier.trackContext}</p>
        </div>
      )}

      <div className="np-card">
        <div className="np-card__eyebrow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span>About {dossier?.artistName || nowPlaying.artist || 'Artist'}</span>
          {dossier?.verificationStatus === 'verified' && (
            <span className="np-verify-pill np-verify-pill--ok" title="Verified via Wikipedia, MusicBrainz, or Deezer artist catalog">
              Verified Artist
            </span>
          )}
          {dossier?.verificationStatus === 'unverified' && (
            <span className="np-verify-pill np-verify-pill--warn" title={dossier.verificationHint}>
              Unverified / Possible AI
            </span>
          )}
        </div>
        {(dossier?.origin || dossier?.activeYears) && (
          <div className="np-facts-row">
            {dossier.origin && <span className="np-fact-pill">{dossier.origin}</span>}
            {dossier.activeYears && <span className="np-fact-pill">{dossier.activeYears}</span>}
          </div>
        )}
        {dossier?.verificationStatus === 'unverified' && dossier.verificationHint && (
          <div className="np-verify-note">{dossier.verificationHint}</div>
        )}
        <p className="np-card__body">
          {loading && !dossier ? 'Loading artist dossier…' : dossier?.bio || 'Start playing a track on YouTube Music or Spotify.'}
        </p>
        {dossier && dossier.genres.length > 0 && (
          <div className="np-tag-row">
            {dossier.genres.map((g) => (
              <span key={g} className="np-tag">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {dossier && dossier.members.length > 0 && (
        <div className="np-card">
          <div className="np-card__eyebrow">Band Members</div>
          <div className="np-tag-row">
            {dossier.members.map((m) => (
              <span key={m} className="np-member-pill">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {dossier && dossier.essentialAlbums.length > 0 && (
        <div className="np-card">
          <div className="np-card__eyebrow">Essential Albums</div>
          <div className="np-album-list">
            {dossier.essentialAlbums.map((alb) => (
              <button
                key={alb}
                type="button"
                className="np-album-btn"
                title={`Search "${alb}" in ${playTargetLabel}`}
                onClick={() => onSearchInService(musicServiceId, `${dossier.artistName} ${alb.replace(/\s*\(\d{4}\)$/, '')}`)}
              >
                <span>{alb}</span>
                <PlayIcon size={10} />
              </button>
            ))}
          </div>
        </div>
      )}

      {dossier && dossier.artistName && (
        <div className="np-cross-actions">
          <button
            type="button"
            className="pill-btn"
            onClick={() => {
              const otherSvc = musicServiceId === 'spotify' ? 'youtube-music' : 'spotify';
              onSearchInService(otherSvc, `${dossier.artistName} ${dossier.trackTitle}`);
            }}
          >
            Open in {musicServiceId === 'spotify' ? 'YouTube Music' : 'Spotify'}
          </button>
          <button
            type="button"
            className="pill-btn"
            onClick={() => onSearchInService('youtube', `${dossier.artistName} live performance`)}
          >
            Watch Live on YouTube
          </button>
          <button
            type="button"
            className="pill-btn"
            onClick={() => onSearchInService('reddit', dossier.artistName)}
          >
            Discuss on Reddit
          </button>
          <button
            type="button"
            className="pill-btn pill-btn--danger"
            title="Add this artist to OmniDeck Trashbin — auto-skips whenever they play"
            onClick={() => onBlockMusic({ kind: 'artist', value: dossier.artistName })}
          >
            Block Artist
          </button>
          {dossier.trackTitle && (
            <button
              type="button"
              className="pill-btn"
              title="Add this specific track to OmniDeck Trashbin — auto-skips whenever it plays"
              onClick={() =>
                onBlockMusic({
                  kind: 'track',
                  value: dossier.trackTitle,
                  artist: dossier.artistName,
                })
              }
            >
              Block Song
            </button>
          )}
        </div>
      )}

      {dossier && dossier.sources.length > 0 && (
        <div className="np-sources">Sources: {dossier.sources.join(' · ')}</div>
      )}
    </div>
  );

  const renderSimilarSection = () => (
    <div className="np-section-stack">
      {loading && !dossier ? (
        <div className="np-empty">Finding similar bands…</div>
      ) : !dossier || dossier.suggestedBands.length === 0 ? (
        <div className="np-empty">
          No related bands found yet for this track. Try enabling AI Companion in Settings for
          deeper-cut recommendations.
        </div>
      ) : (
        <div className="np-band-list">
          {dossier.suggestedBands.map((band) => {
            const isExpanded = expandedBandId === band.id;
            const isBandLoading = loadingBandId === band.id;
            return (
              <div key={band.id} className={`np-band-card ${isExpanded ? 'np-band-card--open' : ''}`}>
                <button
                  type="button"
                  className="np-band-card__header"
                  onClick={() => void handleToggleBand(band)}
                >
                  <div className="np-band-card__avatar">
                    {band.pictureUrl ? (
                      <img src={band.pictureUrl} alt="" />
                    ) : (
                      <span>{band.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="np-band-card__info">
                    <div className="np-band-card__name">{band.name}</div>
                    {band.reason ? (
                      <div className="np-band-card__reason">{band.reason}</div>
                    ) : band.fans ? (
                      <div className="np-band-card__meta">
                        {band.fans.toLocaleString()} listeners · Click to explore
                      </div>
                    ) : (
                      <div className="np-band-card__meta">Click to view bio &amp; top tracks</div>
                    )}
                  </div>
                  <span className="np-band-card__chevron">{isExpanded ? '▾' : '▸'}</span>
                </button>

                {isExpanded && (
                  <div className="np-band-card__drawer">
                    {isBandLoading ? (
                      <div className="np-band-card__loading">Loading bio &amp; top tracks…</div>
                    ) : (
                      <>
                        {band.tags && band.tags.length > 0 && (
                          <div className="np-tag-row" style={{ marginBottom: 6 }}>
                            {band.tags.map((t) => (
                              <span key={t} className="np-tag">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        {band.bio && <p className="np-band-card__bio">{band.bio}</p>}

                        {band.topTracks.length > 0 && (
                          <div className="np-top-tracks">
                            <div className="np-card__eyebrow">Top Tracks</div>
                            {band.topTracks.map((tr) => {
                              const isPreviewing = Boolean(tr.previewUrl && previewUrl === tr.previewUrl);
                              return (
                                <div key={tr.title} className="np-track-row">
                                  <button
                                    type="button"
                                    className="np-track-row__play"
                                    title={`Play "${tr.title}" in ${playTargetLabel}`}
                                    onClick={() =>
                                      onSearchInService(musicServiceId, `${band.name} ${tr.title}`)
                                    }
                                  >
                                    <PlayIcon size={10} />
                                    <span className="np-track-row__title">{tr.title}</span>
                                  </button>
                                  {tr.previewUrl && (
                                    <button
                                      type="button"
                                      className={`pill-btn np-preview-btn ${isPreviewing ? 'pill-btn--active' : ''}`}
                                      title="30-second quick preview"
                                      onClick={() => handleTogglePreview(tr.previewUrl)}
                                    >
                                      {isPreviewing ? 'Stop' : '30s'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="np-band-card__actions">
                          <button
                            type="button"
                            className="pill-btn pill-btn--primary"
                            onClick={() => onSearchInService(musicServiceId, band.name)}
                          >
                            Play in {playTargetLabel}
                          </button>
                          <button
                            type="button"
                            className="pill-btn"
                            onClick={() => onSearchInService('youtube', `${band.name} live`)}
                          >
                            Live on YouTube
                          </button>
                          <button
                            type="button"
                            className="pill-btn"
                            onClick={() => onSearchInService('reddit', band.name)}
                          >
                            Reddit
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderLyricsSection = () => (
    <div className="np-lyrics-container">
      {loading && !dossier ? (
        <div className="np-empty">Fetching synced lyrics…</div>
      ) : dossier?.lyrics?.synced && dossier.lyrics.lines.length > 0 ? (
        <>
          <div className="np-lyrics-toolbar" role="group" aria-label="Lyric sync offset">
            <span className="np-lyrics-toolbar__label">Sync</span>
            <button
              type="button"
              className="pill-btn np-lyrics-toolbar__btn"
              title="Delay lyrics by 0.5s"
              onClick={() => setLyricOffsetSec((v) => Math.round((v - 0.5) * 10) / 10)}
            >
              −0.5s
            </button>
            <button
              type="button"
              className={`pill-btn np-lyrics-toolbar__btn ${lyricOffsetSec !== 0 ? 'pill-btn--active' : ''}`}
              title="Reset lyric sync offset to 0.0s"
              onClick={() => setLyricOffsetSec(0)}
            >
              {lyricOffsetSec > 0 ? `+${lyricOffsetSec.toFixed(1)}s` : `${lyricOffsetSec.toFixed(1)}s`}
            </button>
            <button
              type="button"
              className="pill-btn np-lyrics-toolbar__btn"
              title="Advance lyrics by 0.5s"
              onClick={() => setLyricOffsetSec((v) => Math.round((v + 0.5) * 10) / 10)}
            >
              +0.5s
            </button>
          </div>
          <div className="np-lyrics-list">
            {dossier.lyrics.lines.map((line, idx) => {
              const isActive = idx === activeLyricIdx;
              const isPast = activeLyricIdx >= 0 && idx < activeLyricIdx;
              return (
                <div
                  key={`${line.timeSec}-${idx}`}
                  ref={isActive ? activeLyricRef : undefined}
                  className={`np-lyric-line ${isActive ? 'np-lyric-line--active' : ''} ${isPast ? 'np-lyric-line--past' : ''}`}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        </>
      ) : dossier?.lyrics?.plainText ? (
        <pre className="np-lyrics-plain">{dossier.lyrics.plainText}</pre>
      ) : (
        <div className="np-empty">No synced lyrics found on LRCLIB for this track.</div>
      )}
    </div>
  );

  const renderAiSection = () => (
    <div className="np-section-stack">
      {aiConfig.provider === 'none' ? (
        <div className="np-card np-card--ai">
          <div className="np-card__eyebrow">
            <SparklesIcon size={12} />
            <span>Supercharge with AI Companion</span>
          </div>
          <p className="np-card__body">
            You&apos;re currently using Free Open APIs (MusicBrainz, Wikipedia, Deezer &amp; LRCLIB).
            Add a <strong>Gemini</strong>, <strong>OpenAI</strong>, <strong>Claude</strong>, or local{' '}
            <strong>Ollama</strong> model in Settings to unlock track backstories, tailored band
            match explanations, and interactive Q&amp;A.
          </p>
          <button type="button" className="pill-btn pill-btn--primary" onClick={onOpenAiSettings}>
            <SettingsIcon size={12} />
            <span>Configure AI Companion</span>
          </button>
        </div>
      ) : (
        <>
          <div className="np-ai-chips">
            {QUICK_AI_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="pill-btn"
                disabled={aiLoading || !dossier}
                onClick={() => void handleAsk(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="np-ai-thread">
            {aiMessages.length === 0 && !aiLoading && (
              <div className="np-empty">
                Ask anything about <strong>{dossier?.trackTitle || 'this track'}</strong> or{' '}
                <strong>{dossier?.artistName || 'this artist'}</strong>.
              </div>
            )}
            {aiMessages.map((msg) => (
              <div key={msg.id} className="np-ai-exchange">
                <div className="np-ai-q">{msg.q}</div>
                {msg.error ? (
                  <div className="np-ai-err">{msg.error}</div>
                ) : (
                  <div className="np-ai-a">{msg.a}</div>
                )}
              </div>
            ))}
            {aiLoading && <div className="np-ai-loading">Thinking with {aiConfig.provider}…</div>}
          </div>

          <form onSubmit={handleAskSubmit} className="np-ai-form">
            <input
              type="text"
              className="text-input"
              placeholder="Ask about samples, albums, similar bands…"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              disabled={aiLoading || !dossier}
            />
            <button
              type="submit"
              className="pill-btn pill-btn--primary"
              disabled={aiLoading || !aiQuestion.trim() || !dossier}
            >
              Ask
            </button>
          </form>
        </>
      )}
    </div>
  );

  // Full-Screen Ambient Stage Layout
  if (mode === 'stage') {
    return (
      <div
        className="np-stage"
        style={{ top: topOffset, bottom: bottomOffset }}
        role="region"
        aria-label="Full-Screen Now Playing Stage"
      >
        {artwork && (
          <div
            className="np-stage__backdrop"
            style={{ backgroundImage: `url(${artwork})` }}
            aria-hidden="true"
          />
        )}
        <div className="np-stage__scrim" aria-hidden="true" />

        <div className="np-stage__topbar">
          <div className="np-stage__badge">
            <ServiceIcon
              icon={currentService?.icon ?? 'youtube-music'}
              size={14}
              color={currentService?.accentColor ?? '#FF2D43'}
            />
            <span>Now Playing Stage</span>
            {dossier?.aiEnriched && (
              <span className="np-ai-pill">
                <SparklesIcon size={11} /> AI Enhanced
              </span>
            )}
          </div>
          <div className="control-group" style={{ gap: 6 }}>
            <button
              type="button"
              className="pill-btn"
              onClick={() => void handleRefresh()}
              disabled={loading || !hasTrack}
            >
              <ReloadIcon size={12} />
              <span>Refresh</span>
            </button>
            <button type="button" className="pill-btn" onClick={onToggleStageMode}>
              <CollapseStageIcon size={13} />
              <span>Dock as Drawer</span>
            </button>
            <button type="button" className="icon-btn" aria-label="Close Stage" onClick={onClose}>
              <CloseIcon size={14} />
            </button>
          </div>
        </div>

        <div className="np-stage__grid">
          {/* Left Hero Column */}
          <div className="np-stage__hero">
            <div className="np-stage__art-wrap">
              {artwork ? (
                <img src={artwork} alt="" className="np-stage__art" />
              ) : (
                <div className="np-stage__art-placeholder">
                  <ServiceIcon icon="youtube-music" size={56} color="#FF2D43" />
                </div>
              )}
            </div>

            <div className="np-stage__meta">
              <h1 className="np-stage__title">{dossier?.trackTitle || nowPlaying.title || 'Nothing Playing'}</h1>
              <div className="np-stage__artist">
                {dossier?.artistName || nowPlaying.artist || 'Start a song in YouTube Music or Spotify'}
              </div>
              {dossier?.albumName && <div className="np-stage__album">{dossier.albumName}</div>}
            </div>

            {typeof nowPlaying.durationSec === 'number' && nowPlaying.durationSec > 0 && (
              <div className="np-progress">
                <div className="np-progress__bar">
                  <div className="np-progress__fill" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="np-progress__times">
                  <span>{formatSec(liveTimeSec)}</span>
                  <span>{formatSec(nowPlaying.durationSec)}</span>
                </div>
              </div>
            )}

            <div className="np-stage__controls">
              <button
                type="button"
                className="icon-btn"
                aria-label="Previous track"
                onClick={() => onPrevious(nowPlaying.serviceId ?? undefined)}
              >
                <SkipBackIcon size={18} />
              </button>
              <button
                type="button"
                className="np-stage__play-btn"
                aria-label={nowPlaying.playing ? 'Pause' : 'Play'}
                onClick={() => onPlayPause(nowPlaying.serviceId ?? undefined)}
              >
                {nowPlaying.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Next track"
                onClick={() => onNext(nowPlaying.serviceId ?? undefined)}
              >
                <SkipForwardIcon size={18} />
              </button>
            </div>
          </div>

          {/* Right Intelligence Column */}
          <div className="np-stage__panel">
            <div className="np-tabs">
              {(
                [
                  ['overview', 'Artist Info'],
                  ['similar', `Similar Bands${dossier?.suggestedBands.length ? ` (${dossier.suggestedBands.length})` : ''}`],
                  ['lyrics', 'Synced Lyrics'],
                  ['ai', 'Ask AI'],
                ] as Array<[HubTab, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`np-tab ${tab === id ? 'np-tab--active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="np-stage__scroll">
              {tab === 'overview' && renderOverviewSection()}
              {tab === 'similar' && renderSimilarSection()}
              {tab === 'lyrics' && renderLyricsSection()}
              {tab === 'ai' && renderAiSection()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Docked Right-Side Companion Drawer
  return (
    <aside
      className="np-drawer"
      style={{ top: topOffset, bottom: bottomOffset }}
      aria-label="Artist & Discovery Companion Drawer"
    >
      <div className="np-drawer__header">
        <div className="np-drawer__heading">
          <SparklesIcon size={14} />
          <span>Artist &amp; Discovery Hub</span>
        </div>
        <div className="control-group" style={{ gap: 4 }}>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            title="Refresh artist info"
            disabled={loading || !hasTrack}
            onClick={() => void handleRefresh()}
          >
            <ReloadIcon size={12} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            title="Expand to Full-Screen Ambient Stage"
            onClick={onToggleStageMode}
          >
            <ExpandStageIcon size={13} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            title="Close Artist Hub"
            onClick={onClose}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      </div>

      {/* Compact Now Playing Header Card */}
      <div className="np-drawer__hero">
        <div className="np-drawer__art">
          {artwork ? (
            <img src={artwork} alt="" />
          ) : (
            <ServiceIcon
              icon={currentService?.icon ?? 'youtube-music'}
              size={22}
              color={currentService?.accentColor ?? '#FF2D43'}
            />
          )}
        </div>
        <div className="np-drawer__track">
          <div className="np-drawer__title">{dossier?.trackTitle || nowPlaying.title || 'No track playing'}</div>
          <div className="np-drawer__artist">
            {dossier?.artistName || nowPlaying.artist || 'Play music in YouTube Music or Spotify'}
          </div>
          {dossier?.aiEnriched && (
            <span className="np-ai-pill" style={{ marginTop: 4 }}>
              <SparklesIcon size={10} /> AI Enhanced
            </span>
          )}
        </div>
      </div>

      <div className="np-tabs">
        {(
          [
            ['overview', 'Artist'],
            ['similar', `Bands${dossier?.suggestedBands.length ? ` (${dossier.suggestedBands.length})` : ''}`],
            ['lyrics', 'Lyrics'],
            ['ai', 'Ask AI'],
          ] as Array<[HubTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`np-tab ${tab === id ? 'np-tab--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="np-drawer__body">
        {!hasTrack ? (
          <div className="np-empty">
            Start playing a song on <strong>YouTube Music</strong> or <strong>Spotify</strong> to
            see live artist bios, band members, suggested bands, synced lyrics, and AI Q&amp;A here.
          </div>
        ) : (
          <>
            {tab === 'overview' && renderOverviewSection()}
            {tab === 'similar' && renderSimilarSection()}
            {tab === 'lyrics' && renderLyricsSection()}
            {tab === 'ai' && renderAiSection()}
          </>
        )}
      </div>
    </aside>
  );
}
