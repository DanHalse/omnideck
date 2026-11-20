import { useState } from 'react';
import {
  EQ_FREQUENCIES,
  EQ_PRESETS,
  type AudioFocusMode,
  type EqPresetId,
  type EqualizerConfig,
  type ServiceDefinition,
  type ServiceRuntimeState,
  type SleepTimerState,
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

export type AudioMixerTab = 'mixer' | 'eq';

interface AudioMixerModalProps {
  initialTab?: AudioMixerTab;
  services: ServiceDefinition[];
  runtime: Record<string, ServiceRuntimeState>;
  sleepTimer: SleepTimerState;
  audioFocusMode: AudioFocusMode;
  audioDuckLevel: number;
  equalizer: EqualizerConfig;
  onClose: () => void;
  onSetVolume: (serviceId: string, volume: number) => void;
  onToggleMute: (serviceId: string) => void;
  onMuteAll: () => void;
  onPlayPause: (serviceId: string) => void;
  onSetSleepTimer: (minutes: number) => void;
  onChangeAudioFocusMode: (mode: AudioFocusMode) => void;
  onChangeAudioDuckLevel: (level: number) => void;
  onUpdateEqualizer: (patch: Partial<EqualizerConfig>) => void;
}

function formatFreq(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function AudioMixerModal({
  initialTab = 'mixer',
  services,
  runtime,
  sleepTimer,
  audioFocusMode,
  audioDuckLevel,
  equalizer,
  onClose,
  onSetVolume,
  onToggleMute,
  onMuteAll,
  onPlayPause,
  onSetSleepTimer,
  onChangeAudioFocusMode,
  onChangeAudioDuckLevel,
  onUpdateEqualizer,
}: AudioMixerModalProps) {
  const [tab, setTab] = useState<AudioMixerTab>(initialTab);

  const handleSelectPreset = (presetId: Exclude<EqPresetId, 'custom'>) => {
    const preset = EQ_PRESETS[presetId];
    onUpdateEqualizer({
      enabled: true,
      preset: presetId,
      preampDb: preset.preampDb,
      bands: [...preset.bands],
    });
  };

  const handleBandChange = (idx: number, db: number) => {
    const nextBands = [...equalizer.bands];
    nextBands[idx] = db;
    onUpdateEqualizer({
      enabled: true,
      preset: 'custom',
      bands: nextBands,
    });
  };

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
      <div className="modal" style={{ width: 'min(640px, 100%)' }}>
        <div className="modal__header">
          <div>
            <h2 id="mixer-title" className="modal__title">
              Audio Suite — Mixer, Smart Ducking &amp; 10-Band EQ
            </h2>
            <p className="modal__subtitle">
              Balance per-app volume, configure Smart Audio Ducking, or shape your sound with the 10-band EQ.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mixer'}
            className={`modal__tab ${tab === 'mixer' ? 'modal__tab--active' : ''}`}
            onClick={() => setTab('mixer')}
          >
            Volume, Focus &amp; Sleep
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'eq'}
            className={`modal__tab ${tab === 'eq' ? 'modal__tab--active' : ''}`}
            onClick={() => setTab('eq')}
          >
            10-Band Equalizer {equalizer.enabled ? '· On' : ''}
          </button>
        </div>

        <div className="modal__body">
          {tab === 'mixer' ? (
            <>
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
                  Smart Audio Focus
                </h3>
                <div className="setting-row" style={{ flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div className="setting-row__title">When another tab starts playing audio</div>
                    <div className="setting-row__desc">
                      Smart Duck smoothly dips music while YouTube or Twitch plays, then fades it back up when paused.
                    </div>
                  </div>
                  <div className="control-group" style={{ gap: 5 }}>
                    {(
                      [
                        ['off', 'Off'],
                        ['pause', 'Smart Pause'],
                        ['duck', 'Smart Duck'],
                      ] as Array<[AudioFocusMode, string]>
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        className={`pill-btn ${audioFocusMode === mode ? 'pill-btn--active' : ''}`}
                        onClick={() => onChangeAudioFocusMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {audioFocusMode === 'duck' && (
                  <div className="setting-row">
                    <div>
                      <div className="setting-row__title">
                        Ducking floor ({Math.round(audioDuckLevel * 100)}%)
                      </div>
                      <div className="setting-row__desc">
                        Background music smoothly drops to this level while videos or streams play.
                      </div>
                    </div>
                    <input
                      type="range"
                      aria-label="Audio ducking floor percentage"
                      className="volume-slider volume-slider--wide"
                      min={5}
                      max={45}
                      step={5}
                      value={Math.round(audioDuckLevel * 100)}
                      onChange={(e) => onChangeAudioDuckLevel(Number(e.target.value) / 100)}
                    />
                  </div>
                )}
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
                        Great for Audible audiobooks, YouTube Music playlists, or late-night streams.
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
            </>
          ) : (
            <section className="eq-panel">
              <div className="setting-row">
                <div>
                  <div className="setting-row__title">10-Band Web Audio Equalizer</div>
                  <div className="setting-row__desc">
                    Applies live with soft clipping limiter across YouTube Music, YouTube, Twitch &amp; custom tabs.
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={equalizer.enabled}
                    onChange={(e) => onUpdateEqualizer({ enabled: e.target.checked })}
                  />
                  <span className="switch__track" />
                </label>
              </div>

              <div className="eq-presets">
                {(Object.keys(EQ_PRESETS) as Array<Exclude<EqPresetId, 'custom'>>).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`pill-btn ${equalizer.preset === id ? 'pill-btn--active' : ''}`}
                    onClick={() => handleSelectPreset(id)}
                  >
                    {EQ_PRESETS[id].label}
                  </button>
                ))}
                {equalizer.preset === 'custom' && (
                  <span className="pill-btn pill-btn--active" style={{ cursor: 'default' }}>
                    Custom
                  </span>
                )}
              </div>

              <div className="setting-row">
                <div className="setting-row__title">
                  Preamp: {equalizer.preampDb > 0 ? `+${equalizer.preampDb}` : equalizer.preampDb} dB
                </div>
                <input
                  type="range"
                  aria-label="Equalizer preamp"
                  className="volume-slider volume-slider--wide"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={equalizer.preampDb}
                  onChange={(e) =>
                    onUpdateEqualizer({
                      enabled: true,
                      preset: 'custom',
                      preampDb: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className={`eq-grid ${!equalizer.enabled ? 'eq-grid--disabled' : ''}`}>
                {EQ_FREQUENCIES.map((freq, idx) => {
                  const val = equalizer.bands[idx] ?? 0;
                  return (
                    <div key={freq} className="eq-band">
                      <span className="eq-band__db">
                        {val > 0 ? `+${val}` : val}
                      </span>
                      <div className="eq-band__slider-wrap">
                        <input
                          type="range"
                          aria-label={`${freq} Hz gain`}
                          className="eq-slider"
                          min={-12}
                          max={12}
                          step={0.5}
                          value={val}
                          onChange={(e) => handleBandChange(idx, Number(e.target.value))}
                        />
                      </div>
                      <span className="eq-band__freq">{formatFreq(freq)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="eq-note">
                Widevine DRM tabs (Spotify &amp; Audible) bypass Web Audio capture automatically so protected streams always play cleanly.
              </div>
            </section>
          )}
        </div>

        <div className="modal__footer">
          <span className="setting-row__desc">
            Shortcut: <kbd>Ctrl+Shift+V</kbd> opens Audio Suite from any app.
          </span>
          <button type="button" className="pill-btn pill-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
