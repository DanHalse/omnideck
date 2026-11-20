import type {
  ServiceDefinition,
  ServiceRuntimeState,
  SleepTimerState,
} from '@omnideck/shared';
import { ServiceIcon } from './ServiceIcon';
import {
  CloseIcon,
  EqualizerBars,
  PauseIcon,
  PlayIcon,
  TimerIcon,
  VolumeIcon,
  VolumeOffIcon,
} from './Icons';

interface AudioMixerModalProps {
  services: ServiceDefinition[];
  runtime: Record<string, ServiceRuntimeState>;
  sleepTimer: SleepTimerState;
  onClose: () => void;
  onSetVolume: (serviceId: string, volume: number) => void;
  onToggleMute: (serviceId: string) => void;
  onMuteAll: () => void;
  onPlayPause: (serviceId: string) => void;
  onSetSleepTimer: (minutes: number) => void;
}

export function AudioMixerModal({
  services,
  runtime,
  sleepTimer,
  onClose,
  onSetVolume,
  onToggleMute,
  onMuteAll,
  onPlayPause,
  onSetSleepTimer,
}: AudioMixerModalProps) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mixer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ width: 'min(560px, 100%)' }}>
        <div className="modal__header">
          <div>
            <h2 id="mixer-title" className="modal__title">
              Audio Mixer &amp; Sleep Timer
            </h2>
            <p className="modal__subtitle">
              Balance volume independently per app (e.g. Twitch at 80% + Spotify lo-fi at 25%).
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className="section-label" style={{ margin: 0 }}>
                Per-App Volume Levels
              </h3>
              <button type="button" className="pill-btn" onClick={onMuteAll}>
                Mute All
              </button>
            </div>

            <div className="service-list">
              {services.map((svc) => {
                const rt = runtime[svc.id];
                const volPct = Math.round((rt?.volume ?? svc.volume ?? 1) * 100);
                const muted = Boolean(rt?.muted);
                const playing = Boolean(rt?.audible && !muted);

                return (
                  <div key={svc.id} className="mixer-row">
                    <div className="mixer-row__app">
                      <ServiceIcon icon={svc.icon} size={18} color={svc.accentColor} />
                      <div className="mixer-row__name">
                        <span>{svc.name}</span>
                        {playing && <EqualizerBars />}
                      </div>
                    </div>

                    <div className="mixer-row__controls">
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        disabled={!rt?.mounted}
                        title={playing ? `Pause ${svc.name}` : `Play ${svc.name}`}
                        onClick={() => onPlayPause(svc.id)}
                      >
                        {playing ? <PauseIcon size={11} /> : <PlayIcon size={11} />}
                      </button>

                      <button
                        type="button"
                        className={`icon-btn icon-btn--sm ${muted ? 'icon-btn--danger' : ''}`}
                        title={muted ? `Unmute ${svc.name}` : `Mute ${svc.name}`}
                        onClick={() => onToggleMute(svc.id)}
                      >
                        {muted ? <VolumeOffIcon size={13} /> : <VolumeIcon size={13} />}
                      </button>

                      <input
                        type="range"
                        aria-label={`${svc.name} volume`}
                        className="volume-slider volume-slider--wide"
                        min={0}
                        max={100}
                        value={muted ? 0 : volPct}
                        onChange={(e) => onSetVolume(svc.id, Number(e.target.value) / 100)}
                      />

                      <span className="mixer-row__pct">{muted ? '0%' : `${volPct}%`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 className="section-label" style={{ margin: 0 }}>
              Sleep Timer (Smooth 10s Fade-Out)
            </h3>
            <div className="setting-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TimerIcon size={15} />
                <div>
                  <div className="setting-row__title">
                    {sleepTimer.active
                      ? `Pausing playback in ${sleepTimer.durationMinutes} min`
                      : 'No timer active'}
                  </div>
                  <div className="setting-row__desc">
                    Great for Audible audiobooks, Spotify playlists, or late-night streams.
                  </div>
                </div>
              </div>
              <div className="control-group" style={{ gap: 5 }}>
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`pill-btn ${sleepTimer.active && sleepTimer.durationMinutes === m ? 'pill-btn--active' : ''}`}
                    onClick={() => onSetSleepTimer(m)}
                  >
                    {m}m
                  </button>
                ))}
                {sleepTimer.active && (
                  <button type="button" className="pill-btn" onClick={() => onSetSleepTimer(0)}>
                    Off
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="modal__footer">
          <span className="setting-row__desc">
            Shortcut: <kbd>Ctrl+Shift+V</kbd> opens the mixer from any app.
          </span>
          <button type="button" className="pill-btn pill-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
