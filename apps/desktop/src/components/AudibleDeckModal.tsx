import { useEffect, useState, type FormEvent } from 'react';
import type { BookNoteEntry, EqualizerConfig, SleepTimerState } from '@omnideck/shared';
import type { AudibleDeckState } from '../../electron/ipcTypes';
import { CloseIcon, MoonIcon, PauseIcon, PlayIcon, TimerIcon } from './Icons';

interface AudibleDeckModalProps {
  volume: number;
  customSkipSec: number;
  sleepTimer: SleepTimerState;
  equalizer: EqualizerConfig;
  bookNotes: BookNoteEntry[];
  onClose: () => void;
  onControl: (
    action: 'state' | 'playPause' | 'skip' | 'seek' | 'rate' | 'selectChapter' | 'toggleEndOfChapterSleep',
    value?: number,
  ) => Promise<AudibleDeckState | null>;
  onSetVolume: (volume: number) => void;
  onSetCustomSkipSec: (sec: number) => void;
  onSetSleepTimer: (minutes: number) => void;
  onToggleVoiceClarity: () => void;
  onAddNote: (input: { bookTitle: string; timestampLabel: string; note: string; url?: string }) => void;
  onRemoveNote: (noteId: string) => void;
  onOpenAudibleTab: () => void;
}

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const rem = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export function AudibleDeckModal({
  volume,
  customSkipSec,
  sleepTimer,
  equalizer,
  bookNotes,
  onClose,
  onControl,
  onSetVolume,
  onSetCustomSkipSec,
  onSetSleepTimer,
  onToggleVoiceClarity,
  onAddNote,
  onRemoveNote,
  onOpenAudibleTab,
}: AudibleDeckModalProps) {
  const [deck, setDeck] = useState<AudibleDeckState | null>(null);
  const [sideTab, setSideTab] = useState<'chapters' | 'notes'>('chapters');
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    let active = true;
    const poll = () => {
      void onControl('state').then((st) => {
        if (active && st) setDeck(st);
      });
    };
    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [onControl]);

  const rate = deck?.playbackRate && deck.playbackRate > 0 ? deck.playbackRate : 1;
  const currentSec = deck?.currentTimeSec ?? 0;
  const durationSec = deck?.durationSec ?? 0;
  const rawRemainingSec = Math.max(0, durationSec - currentSec);
  const trueSpeedRemainingSec = rawRemainingSec / rate;
  const progressPct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const isVoiceClarityOn = equalizer.enabled && equalizer.preset === 'vocal';

  const run = async (
    action: 'playPause' | 'skip' | 'seek' | 'rate' | 'selectChapter' | 'toggleEndOfChapterSleep',
    value?: number,
  ) => {
    const next = await onControl(action, value);
    if (next) setDeck(next);
  };

  const handleSaveNote = (e: FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    onAddNote({
      bookTitle: deck?.title || 'Audible Audiobook',
      timestampLabel: deck?.chapter ? `${deck.chapter} · ${fmtDuration(currentSec)}` : fmtDuration(currentSec),
      note: noteText.trim(),
    });
    setNoteText('');
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="OmniDeck Custom Audible Player Deck"
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{
          width: 'min(940px, 94vw)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg-chrome)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header"
          style={{
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: '#F7991C',
                boxShadow: '0 0 10px rgba(247, 153, 28, 0.7)',
              }}
            />
            <strong>OmniDeck Audible Player Deck</strong>
            <span
              style={{
                fontSize: 11,
                color: 'var(--ink-secondary)',
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--bg-surface)',
              }}
            >
              Custom Dark UI · Widevine Engine
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="pill-btn" onClick={onOpenAudibleTab}>
              Open Library
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close Audible Deck">
              <CloseIcon size={15} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(260px, 0.9fr)',
            gap: 18,
            padding: 20,
            overflowY: 'auto',
          }}
        >
          {/* Left: Custom Audiobook Player Stage */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div
                style={{
                  width: 116,
                  height: 116,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #2a1d12, #14171d)',
                  border: '1px solid var(--border-default)',
                  overflow: 'hidden',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 14px 32px rgba(0, 0, 0, 0.45)',
                }}
              >
                {deck?.cover ? (
                  <img
                    src={deck.cover}
                    alt={deck.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: 34, color: '#F7991C' }}>🎧</span>
                )}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: 'var(--ink-primary)',
                    lineHeight: 1.25,
                    marginBottom: 4,
                  }}
                >
                  {deck?.title || 'No Audible Cloud Player Active Yet'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginBottom: 8 }}>
                  {deck?.chapter || 'Click Listen on any title in Audible Library to drive it here.'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11 }}>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: 'rgba(247, 153, 28, 0.16)',
                      color: '#F7991C',
                      fontWeight: 600,
                    }}
                  >
                    Speed: {rate.toFixed(2)}×
                  </span>
                  {durationSec > 0 && (
                    <span
                      style={{
                        padding: '3px 9px',
                        borderRadius: 999,
                        background: 'var(--bg-surface)',
                        color: 'var(--ink-secondary)',
                        fontWeight: 600,
                      }}
                    >
                      True-Speed Left: {fmtDuration(trueSpeedRemainingSec)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Scrubber */}
            <div
              style={{
                background: 'var(--bg-chrome-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(durationSec))}
                value={Math.floor(currentSec)}
                disabled={durationSec <= 0}
                onChange={(e) => void run('seek', Number(e.target.value))}
                style={{ width: '100%', accentColor: '#F7991C', cursor: 'pointer' }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: 'var(--ink-secondary)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: 4,
                }}
              >
                <span>{fmtDuration(currentSec)}</span>
                <span>{Math.round(progressPct)}%</span>
                <span>-{fmtDuration(trueSpeedRemainingSec)} (at {rate.toFixed(2)}×)</span>
              </div>
            </div>

            {/* Transport + Configurable Skip Interval */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
              }}
            >
              <button
                type="button"
                className="pill-btn"
                style={{ padding: '8px 14px', fontWeight: 700 }}
                onClick={() => void run('skip', -customSkipSec)}
              >
                ↺ -{customSkipSec}s
              </button>
              <button
                type="button"
                onClick={() => void run('playPause')}
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 999,
                  background: '#F7991C',
                  color: '#111317',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(247, 153, 28, 0.35)',
                }}
                aria-label={deck?.playing ? 'Pause' : 'Play'}
              >
                {deck?.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
              </button>
              <button
                type="button"
                className="pill-btn"
                style={{ padding: '8px 14px', fontWeight: 700 }}
                onClick={() => void run('skip', customSkipSec)}
              >
                +{customSkipSec}s ↻
              </button>
            </div>

            {/* Controls Grid: Skip Step, Speed, Volume, Speech Clarity & Sleep */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <div
                style={{
                  background: 'var(--bg-chrome-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--ink-secondary)', marginBottom: 6, fontWeight: 600 }}>
                  Volume ({Math.round(volume * 100)}%)
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(volume * 100)}
                  onChange={(e) => onSetVolume(Number(e.target.value) / 100)}
                  style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button
                    type="button"
                    className={`pill-btn ${isVoiceClarityOn ? 'pill-btn--active' : ''}`}
                    onClick={onToggleVoiceClarity}
                    style={{ fontSize: 11, flex: 1, justifyContent: 'center' }}
                  >
                    🎙 Voice Clarity EQ
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg-chrome-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--ink-secondary)', marginBottom: 6, fontWeight: 600 }}>
                  Precision Speed ({rate.toFixed(2)}×)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <button type="button" className="pill-btn" onClick={() => void run('rate', rate - 0.05)}>
                    -0.05
                  </button>
                  <button type="button" className="pill-btn" onClick={() => void run('rate', 1.0)}>
                    1.0×
                  </button>
                  <button type="button" className="pill-btn" onClick={() => void run('rate', 1.25)}>
                    1.25×
                  </button>
                  <button type="button" className="pill-btn" onClick={() => void run('rate', 1.5)}>
                    1.5×
                  </button>
                  <button type="button" className="pill-btn" onClick={() => void run('rate', rate + 0.05)}>
                    +0.05
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-secondary)' }}>
                  <span>Skip:</span>
                  {[10, 15, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      className={`pill-btn ${customSkipSec === sec ? 'pill-btn--active' : ''}`}
                      style={{ padding: '2px 7px', fontSize: 10 }}
                      onClick={() => onSetCustomSkipSec(sec)}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sleep Timer Bar including End of Chapter */}
            <div
              style={{
                background: 'var(--bg-chrome-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <TimerIcon size={13} />
              <span style={{ fontSize: 12, fontWeight: 600, marginRight: 4 }}>Sleep Timer:</span>
              <button
                type="button"
                className={`pill-btn ${deck?.endOfChapterArmed || sleepTimer.endOfChapter ? 'pill-btn--active' : ''}`}
                onClick={() => void run('toggleEndOfChapterSleep')}
              >
                <MoonIcon size={11} />
                <span>End of Chapter</span>
              </button>
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
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Right: Chapters & Timestamped Book Notes */}
          <div
            style={{
              background: 'var(--bg-chrome-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              maxHeight: 460,
            }}
          >
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-subtle)',
                padding: 6,
                gap: 6,
              }}
            >
              <button
                type="button"
                className={`pill-btn ${sideTab === 'chapters' ? 'pill-btn--active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setSideTab('chapters')}
              >
                Chapters ({deck?.chapters?.length ?? 0})
              </button>
              <button
                type="button"
                className={`pill-btn ${sideTab === 'notes' ? 'pill-btn--active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setSideTab('notes')}
              >
                Notes ({bookNotes.length})
              </button>
            </div>

            {sideTab === 'chapters' ? (
              <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {deck?.chapters && deck.chapters.length > 0 ? (
                  deck.chapters.map((ch) => (
                    <button
                      key={ch.index}
                      type="button"
                      onClick={() => void run('selectChapter', ch.index)}
                      style={{
                        textAlign: 'left',
                        padding: '7px 10px',
                        borderRadius: 8,
                        background: ch.active ? 'var(--accent-primary-soft)' : 'transparent',
                        color: ch.active ? 'var(--accent-primary)' : 'var(--ink-primary)',
                        fontSize: 12,
                        fontWeight: ch.active ? 700 : 500,
                      }}
                    >
                      {ch.title}
                    </button>
                  ))
                ) : (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-secondary)', textAlign: 'center' }}>
                    Start playing a book in Audible Cloud Player to load its chapter list here.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <form
                  onSubmit={handleSaveNote}
                  style={{ display: 'flex', gap: 6, padding: 8, borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder={`Bookmark at ${fmtDuration(currentSec)}…`}
                    style={{
                      flex: 1,
                      padding: '6px 9px',
                      borderRadius: 8,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-default)',
                      fontSize: 12,
                    }}
                  />
                  <button type="submit" className="pill-btn pill-btn--active">
                    Save
                  </button>
                </form>
                <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {bookNotes.length === 0 ? (
                    <div style={{ padding: 14, fontSize: 12, color: 'var(--ink-secondary)', textAlign: 'center' }}>
                      No saved notes yet. Capture quotes & moments above!
                    </div>
                  ) : (
                    bookNotes.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'var(--bg-surface)',
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <strong style={{ color: 'var(--accent-primary)', fontSize: 11 }}>{n.timestampLabel}</strong>
                          <button
                            type="button"
                            onClick={() => onRemoveNote(n.id)}
                            style={{ color: 'var(--ink-muted)', fontSize: 11 }}
                          >
                            ✕
                          </button>
                        </div>
                        <div style={{ color: 'var(--ink-primary)' }}>{n.note}</div>
                        <div style={{ color: 'var(--ink-muted)', fontSize: 10, marginTop: 2 }}>{n.bookTitle}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
