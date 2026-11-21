import { useEffect, useMemo, useState } from 'react';
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
} from './Icons';

export function MiniPlayerApp() {
  const api = useMemo(() => getOmniDeckApi(), []);
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null);

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
        </div>
      </div>
    </div>
  );
}
