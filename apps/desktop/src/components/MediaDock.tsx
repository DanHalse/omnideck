import type {
  NowPlayingState,
  ServiceDefinition,
  SleepTimerState,
} from '@omnideck/shared';
import { ServiceIcon } from './ServiceIcon';
import {
  PauseIcon,
  PinIcon,
  PipIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SlidersIcon,
  TimerIcon,
  VolumeIcon,
  VolumeOffIcon,
} from './Icons';

interface MediaDockProps {
  nowPlaying: NowPlayingState;
  sleepTimer: SleepTimerState;
  services: ServiceDefinition[];
  alwaysOnTop: boolean;
  onSelectService: (serviceId: string) => void;
  onPlayPause: (serviceId?: string) => void;
  onPrevious: (serviceId?: string) => void;
  onNext: (serviceId?: string) => void;
  onResumeAutoPaused: () => void;
  onToggleMute: (serviceId: string) => void;
  onSetVolume: (serviceId: string, volume: number) => void;
  onOpenMixer: () => void;
  onTriggerPip: () => void;
  onToggleAlwaysOnTop: () => void;
}

function formatRemaining(endsAt: number | null): string {
  if (!endsAt) return '';
  const totalSec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MediaDock({
  nowPlaying,
  sleepTimer,
  services,
  alwaysOnTop,
  onSelectService,
  onPlayPause,
  onPrevious,
  onNext,
  onResumeAutoPaused,
  onToggleMute,
  onSetVolume,
  onOpenMixer,
  onTriggerPip,
  onToggleAlwaysOnTop,
}: MediaDockProps) {
  const npService = nowPlaying.serviceId
    ? services.find((s) => s.id === nowPlaying.serviceId)
    : undefined;
  const autoPausedService = nowPlaying.autoPausedServiceId
    ? services.find((s) => s.id === nowPlaying.autoPausedServiceId)
    : undefined;

  return (
    <footer className="media-dock" aria-label="Now Playing Cockpit">
      <div className="media-dock__track">
        {npService ? (
          <button
            type="button"
            className="media-dock__track-btn"
            title={`Jump to ${npService.name}`}
            onClick={() => onSelectService(npService.id)}
          >
            <div className="media-dock__artwork">
              {nowPlaying.artworkUrl ? (
                <img src={nowPlaying.artworkUrl} alt="" className="media-dock__artwork-img" />
              ) : (
                <ServiceIcon icon={npService.icon} size={18} color={npService.accentColor} />
              )}
            </div>
            <div className="media-dock__meta">
              <div className="media-dock__title">{nowPlaying.title || npService.name}</div>
              <div className="media-dock__subtitle">
                <span style={{ color: npService.accentColor, fontWeight: 600 }}>
                  {npService.name}
                </span>
                {nowPlaying.artist && nowPlaying.artist !== npService.name
                  ? ` · ${nowPlaying.artist}`
                  : ''}
              </div>
            </div>
          </button>
        ) : (
          <div className="media-dock__meta">
            <div className="media-dock__title">Sleep Timer Active</div>
            <div className="media-dock__subtitle">Will pause playback automatically</div>
          </div>
        )}
      </div>

      <div className="media-dock__transport">
        {npService && (
          <>
            <button
              type="button"
              className="icon-btn"
              title="Previous track (MediaPreviousTrack)"
              onClick={() => onPrevious(npService.id)}
            >
              <SkipBackIcon size={13} />
            </button>
            <button
              type="button"
              className="media-dock__play-btn"
              title={nowPlaying.playing ? 'Pause (Ctrl+Shift+Space)' : 'Play (Ctrl+Shift+Space)'}
              onClick={() => onPlayPause(npService.id)}
            >
              {nowPlaying.playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Next track (MediaNextTrack)"
              onClick={() => onNext(npService.id)}
            >
              <SkipForwardIcon size={13} />
            </button>
          </>
        )}

        {autoPausedService && (
          <button
            type="button"
            className="pill-btn"
            title={`Smart Audio Switching paused ${autoPausedService.name} — click to resume`}
            onClick={onResumeAutoPaused}
          >
            <PlayIcon size={10} />
            <span>Resume {autoPausedService.shortName}</span>
          </button>
        )}
      </div>

      <div className="media-dock__controls">
        {npService && (
          <div className="media-dock__volume">
            <button
              type="button"
              className={`icon-btn icon-btn--sm ${nowPlaying.muted ? 'icon-btn--danger' : ''}`}
              title={nowPlaying.muted ? `Unmute ${npService.name}` : `Mute ${npService.name}`}
              onClick={() => onToggleMute(npService.id)}
            >
              {nowPlaying.muted ? <VolumeOffIcon size={13} /> : <VolumeIcon size={13} />}
            </button>
            <input
              type="range"
              aria-label={`${npService.name} volume`}
              className="volume-slider"
              min={0}
              max={100}
              value={nowPlaying.muted ? 0 : Math.round((nowPlaying.volume ?? 1) * 100)}
              onChange={(e) => onSetVolume(npService.id, Number(e.target.value) / 100)}
            />
          </div>
        )}

        <button
          type="button"
          className={`pill-btn ${sleepTimer.active ? 'pill-btn--active' : ''}`}
          title="Audio Mixer & Sleep Timer (Ctrl+Shift+V)"
          onClick={onOpenMixer}
        >
          {sleepTimer.active ? (
            <>
              <TimerIcon size={12} />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatRemaining(sleepTimer.endsAt)}
              </span>
            </>
          ) : (
            <>
              <SlidersIcon size={12} />
              <span>Mixer</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="icon-btn"
          title="Pop out video Picture-in-Picture (Ctrl+Shift+P)"
          onClick={onTriggerPip}
        >
          <PipIcon size={14} />
        </button>

        <button
          type="button"
          className={`icon-btn ${alwaysOnTop ? 'icon-btn--active' : ''}`}
          title={alwaysOnTop ? 'Unpin Always on Top' : 'Pin Always on Top (Ctrl+Shift+T)'}
          onClick={onToggleAlwaysOnTop}
        >
          <PinIcon size={13} />
        </button>
      </div>
    </footer>
  );
}
