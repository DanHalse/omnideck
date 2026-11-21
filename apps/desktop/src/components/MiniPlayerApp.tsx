import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { DesktopSnapshot } from '@omnideck/shared';
import { getOmniDeckApi } from '../api';
import { ServiceIcon } from './ServiceIcon';
import {
  BanIcon,
  CloseIcon,
  ExpandStageIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SwapIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  VolumeIcon,
  VolumeOffIcon,
} from './Icons';

export function MiniPlayerApp() {
  const api = useMemo(() => getOmniDeckApi(), []);
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null);
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const lastSentAtRef = useRef(0);
  const pendingVolRef = useRef<{ serviceId: string; volume: number } | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void api.getSnapshot().then((initial) => {
      if (active) setSnapshot(initial);
    });
    const unsub = api.subscribe((next) => {
      setSnapshot(next);
    });
    return () => {
      active = false;
      unsub();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, [api]);

  useEffect(() => {
    const theme = snapshot?.config.settings.theme ?? 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, [snapshot?.config.settings.theme]);

  const np = snapshot?.nowPlaying;
  const svc = np?.serviceId
    ? snapshot?.config.services.find((s) => s.id === np.serviceId)
    : undefined;
  const volumeServiceId =
    np?.serviceId ??
    (snapshot?.config.services.some((s) => s.id === 'youtube-music') ? 'youtube-music' : undefined);
  const volumeSvc = volumeServiceId
    ? snapshot?.config.services.find((s) => s.id === volumeServiceId)
    : undefined;
  const volumeRt = volumeServiceId ? snapshot?.runtime[volumeServiceId] : undefined;
  const isMuted = Boolean(volumeRt?.muted);
  const liveVolume =
    typeof volumeRt?.volume === 'number'
      ? volumeRt.volume
      : typeof volumeSvc?.volume === 'number'
        ? volumeSvc.volume
        : 1.0;
  const effectiveVolume = dragVolume !== null ? dragVolume : isMuted ? 0 : liveVolume;
  const volumePct = Math.round(Math.min(1, Math.max(0, effectiveVolume)) * 100);

  const sendVolumeThrottled = (serviceId: string, nextVol: number, immediate = false) => {
    const clamped = Math.min(1, Math.max(0, Math.round(nextVol * 100) / 100));
    const now = Date.now();
    if (immediate || now - lastSentAtRef.current >= 45) {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingVolRef.current = null;
      lastSentAtRef.current = now;
      void api.setVolume(serviceId, clamped);
      return;
    }
    pendingVolRef.current = { serviceId, volume: clamped };
    if (flushTimerRef.current === null) {
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        const pending = pendingVolRef.current;
        pendingVolRef.current = null;
        if (pending) {
          lastSentAtRef.current = Date.now();
          void api.setVolume(pending.serviceId, pending.volume);
        }
      }, 45);
    }
  };

  const showThumbs = np?.serviceId === 'youtube-music' || np?.serviceId === 'youtube';
  const isMusicService = np?.serviceId === 'youtube-music' || np?.serviceId === 'spotify';
  const bridgeTargetId = np?.serviceId === 'spotify' ? 'youtube-music' : 'spotify';
  const bridgeTargetLabel = bridgeTargetId === 'spotify' ? 'Spotify' : 'YouTube Music';
  const isLiked = np?.likeStatus === 'like';
  const isDisliked = np?.likeStatus === 'dislike';

  return (
    <div className="mini-hud" role="region" aria-label="OmniDeck Mini-Player HUD">
      <div className="mini-hud__inner">
        <div className="mini-hud__art">
          {np?.artworkUrl ? (
            <img src={np.artworkUrl} alt="" />
          ) : (
            <ServiceIcon
              icon={svc?.icon ?? 'youtube-music'}
              size={28}
              color={svc?.accentColor ?? '#E87A3E'}
            />
          )}
        </div>

        <div className="mini-hud__main">
          <div className="mini-hud__top">
            <div className="mini-hud__meta">
              <div className="mini-hud__title">{np?.title || 'OmniDeck Ready'}</div>
              <div className="mini-hud__artist">
                {np?.artist || svc?.name || 'Play music to control it here'}
              </div>
            </div>
            <div className="mini-hud__win-actions">
              {isMusicService && np?.title && (
                <>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    title={`Open this song in ${bridgeTargetLabel}`}
                    onClick={() => {
                      const q = np.artist ? `${np.artist} ${np.title}` : np.title;
                      void api.searchInService(bridgeTargetId, q);
                      void api.focusMainWindow();
                    }}
                  >
                    <SwapIcon size={11} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    title={
                      np.artist && np.artist !== svc?.name
                        ? `Block artist "${np.artist}" (auto-skip forever)`
                        : `Block song "${np.title}" (auto-skip forever)`
                    }
                    onClick={() => {
                      if (np.artist && np.artist !== svc?.name) {
                        void api.blockMusic({ kind: 'artist', value: np.artist });
                      } else {
                        void api.blockMusic({ kind: 'track', value: np.title, artist: np.artist });
                      }
                    }}
                  >
                    <BanIcon size={11} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                title="Return to OmniDeck"
                onClick={() => void api.focusMainWindow()}
              >
                <ExpandStageIcon size={12} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                title="Close Mini-Player"
                onClick={() => void api.toggleMiniPlayer(false)}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          </div>

          <div className="mini-hud__bottom">
            <div className="mini-hud__lyric" title={np?.currentLyricLine || ''}>
              {np?.currentLyricLine
                ? `♪ ${np.currentLyricLine}`
                : svc
                  ? `${svc.name}${np?.playing ? ' · Playing' : ' · Paused'}`
                  : 'Drag to move · Resize from any edge'}
            </div>

            <div className="mini-hud__controls">
              {showThumbs && (
                <>
                  <button
                    type="button"
                    className={`icon-btn icon-btn--sm ${isDisliked ? 'mini-hud__thumb--dislike' : ''}`}
                    aria-label="Thumbs Down"
                    aria-pressed={isDisliked}
                    title={isDisliked ? 'Remove Thumbs Down' : 'Thumbs Down'}
                    onClick={() => void api.mediaDislikeTrack(np?.serviceId ?? undefined)}
                  >
                    <ThumbDownIcon size={12} filled={isDisliked} />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn icon-btn--sm ${isLiked ? 'mini-hud__thumb--like' : ''}`}
                    aria-label="Thumbs Up"
                    aria-pressed={isLiked}
                    title={isLiked ? 'Remove Thumbs Up' : 'Thumbs Up'}
                    onClick={() => void api.mediaLikeTrack(np?.serviceId ?? undefined)}
                  >
                    <ThumbUpIcon size={12} filled={isLiked} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label="Previous"
                title="Previous song"
                onClick={() => void api.mediaPrevious(np?.serviceId ?? undefined)}
              >
                <SkipBackIcon size={12} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm media-dock__play"
                aria-label={np?.playing ? 'Pause' : 'Play'}
                title={np?.playing ? 'Pause' : 'Play'}
                onClick={() => void api.mediaPlayPause(np?.serviceId ?? undefined)}
              >
                {np?.playing ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label="Next"
                title="Next song"
                onClick={() => void api.mediaNext(np?.serviceId ?? undefined)}
              >
                <SkipForwardIcon size={12} />
              </button>
            </div>
          </div>

          {volumeServiceId && (
            <div
              className="mini-hud__volume"
              title={`${volumeSvc?.name ?? 'YouTube Music'} volume (${isMuted || volumePct === 0 ? 'Muted' : `${volumePct}%`}) — scroll or drag`}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.05 : -0.05;
                const base = isMuted ? 0 : liveVolume;
                const next = Math.min(1, Math.max(0, Math.round((base + delta) * 100) / 100));
                sendVolumeThrottled(volumeServiceId, next, true);
              }}
            >
              <button
                type="button"
                className={`icon-btn mini-hud__volume-btn ${isMuted || volumePct === 0 ? 'mini-hud__volume-btn--muted' : ''}`}
                aria-label={isMuted || volumePct === 0 ? 'Unmute' : 'Mute'}
                title={isMuted || volumePct === 0 ? `Unmute ${volumeSvc?.name ?? 'audio'}` : `Mute ${volumeSvc?.name ?? 'audio'}`}
                onClick={() => {
                  if (!isMuted && liveVolume <= 0.005) {
                    sendVolumeThrottled(volumeServiceId, 0.5, true);
                  } else {
                    void api.toggleMute(volumeServiceId);
                  }
                }}
              >
                {isMuted || volumePct === 0 ? <VolumeOffIcon size={12} /> : <VolumeIcon size={12} />}
              </button>
              <input
                type="range"
                className="mini-hud__volume-slider"
                min={0}
                max={100}
                step={1}
                value={volumePct}
                aria-label={`${volumeSvc?.name ?? 'YouTube Music'} volume`}
                style={{ '--vol-pct': `${volumePct}%` } as CSSProperties}
                onChange={(e) => {
                  const next = Number(e.target.value) / 100;
                  setDragVolume(next);
                  sendVolumeThrottled(volumeServiceId, next, false);
                }}
                onPointerUp={(e) => {
                  const next = Number(e.currentTarget.value) / 100;
                  sendVolumeThrottled(volumeServiceId, next, true);
                  setDragVolume(null);
                }}
                onBlur={() => setDragVolume(null)}
              />
              <span className="mini-hud__volume-pct">
                {isMuted ? 'Mute' : `${volumePct}%`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

