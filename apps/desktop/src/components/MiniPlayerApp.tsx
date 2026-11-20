import { useEffect, useMemo, useState } from 'react';
import type { DesktopSnapshot } from '@omnideck/shared';
import { getOmniDeckApi } from '../api';
import { ServiceIcon } from './ServiceIcon';
import {
  CloseIcon,
  ExpandStageIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
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

  return (
    <div className="mini-hud" role="region" aria-label="OmniDeck Mini-Player HUD">
      <div className="mini-hud__art">
        {np?.artworkUrl ? (
          <img src={np.artworkUrl} alt="" />
        ) : (
          <ServiceIcon
            icon={svc?.icon ?? 'youtube-music'}
            size={26}
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
                : 'Drag anywhere to move'}
          </div>

          <div className="mini-hud__controls">
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-label="Previous"
              onClick={() => void api.mediaPrevious(np?.serviceId ?? undefined)}
            >
              <SkipBackIcon size={12} />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--sm media-dock__play"
              aria-label={np?.playing ? 'Pause' : 'Play'}
              onClick={() => void api.mediaPlayPause(np?.serviceId ?? undefined)}
            >
              {np?.playing ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-label="Next"
              onClick={() => void api.mediaNext(np?.serviceId ?? undefined)}
            >
              <SkipForwardIcon size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
