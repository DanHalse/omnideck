import { useState, type FormEvent } from 'react';
import { CloseIcon } from './Icons';

interface TwitchMultiStreamModalProps {
  channels: string[];
  onSaveChannels: (channels: string[]) => void;
  onOpenInMainTwitch: (channel: string) => void;
  onClose: () => void;
}

export function TwitchMultiStreamModal({
  channels,
  onSaveChannels,
  onOpenInMainTwitch,
  onClose,
}: TwitchMultiStreamModalProps) {
  const [input, setInput] = useState('');
  const [focusedAudio, setFocusedAudio] = useState<string>(channels[0] ?? '');
  const [chatChannel, setChatChannel] = useState<string>(channels[0] ?? '');
  const [showChat, setShowChat] = useState(true);

  const parentHost =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = input
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//i, '')
      .replace(/^@/, '')
      .split(/[/?#]/)[0];
    if (!cleaned || !/^[a-z0-9_]{2,25}$/.test(cleaned)) return;
    if (channels.includes(cleaned)) {
      setInput('');
      return;
    }
    const next = [...channels, cleaned].slice(0, 4);
    onSaveChannels(next);
    if (!focusedAudio) setFocusedAudio(cleaned);
    if (!chatChannel) setChatChannel(cleaned);
    setInput('');
  };

  const handleRemove = (ch: string) => {
    const next = channels.filter((c) => c !== ch);
    onSaveChannels(next);
    if (focusedAudio === ch) setFocusedAudio(next[0] ?? '');
    if (chatChannel === ch) setChatChannel(next[0] ?? '');
  };

  const gridCols = channels.length <= 1 ? '1fr' : '1fr 1fr';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="OmniDeck Twitch Multi-Stream Grid"
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{
          width: 'min(1320px, 96vw)',
          height: 'min(820px, 90vh)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg-canvas)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 14px',
            background: 'var(--bg-chrome)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: '#9146FF' }} />
            <strong>Twitch Multi-Stream Grid</strong>
            <span style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>
              Up to 4 streams · 1-click audio focus
            </span>
          </div>

          <form onSubmit={handleAdd} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add channel login or twitch.tv/..."
              disabled={channels.length >= 4}
              style={{
                width: 220,
                padding: '5px 10px',
                borderRadius: 8,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                fontSize: 12,
              }}
            />
            <button type="submit" className="pill-btn pill-btn--active" disabled={channels.length >= 4}>
              + Add ({channels.length}/4)
            </button>
            <button
              type="button"
              className={`pill-btn ${showChat ? 'pill-btn--active' : ''}`}
              onClick={() => setShowChat((v) => !v)}
            >
              Chat
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close Multi-Stream">
              <CloseIcon size={15} />
            </button>
          </form>
        </div>

        {/* Main Split: Streams Grid + Switchable Chat */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: gridCols,
              gap: 8,
              padding: 8,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {channels.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  color: 'var(--ink-secondary)',
                  textAlign: 'center',
                  padding: 32,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)' }}>
                  Watch multiple esports or co-streams side-by-side
                </div>
                <div style={{ fontSize: 12, maxWidth: 420 }}>
                  Enter 2–4 Twitch channel names above (e.g. <code>esl_cs</code>, <code>caedrel</code>) to build a custom synced grid with 1-click audio focus switching.
                </div>
              </div>
            ) : (
              channels.map((ch) => {
                const isAudio = focusedAudio === ch;
                const embedSrc = `https://player.twitch.tv/?channel=${encodeURIComponent(ch)}&parent=${encodeURIComponent(parentHost)}&parent=localhost&muted=${isAudio ? 'false' : 'true'}`;
                return (
                  <div
                    key={ch}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: isAudio ? '1.5px solid #9146FF' : '1px solid var(--border-subtle)',
                      background: '#000',
                      minHeight: 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 8px',
                        background: 'var(--bg-chrome)',
                        fontSize: 11,
                      }}
                    >
                      <strong style={{ color: 'var(--ink-primary)' }}>twitch.tv/{ch}</strong>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button
                          type="button"
                          className={`pill-btn ${isAudio ? 'pill-btn--active' : ''}`}
                          style={{ padding: '2px 7px', fontSize: 10 }}
                          onClick={() => setFocusedAudio(ch)}
                        >
                          {isAudio ? '🔊 Audio' : '🔇 Focus Audio'}
                        </button>
                        <button
                          type="button"
                          className="pill-btn"
                          style={{ padding: '2px 7px', fontSize: 10 }}
                          onClick={() => {
                            setChatChannel(ch);
                            setShowChat(true);
                          }}
                        >
                          Chat
                        </button>
                        <button
                          type="button"
                          className="pill-btn"
                          style={{ padding: '2px 7px', fontSize: 10 }}
                          onClick={() => onOpenInMainTwitch(ch)}
                        >
                          Full Tab
                        </button>
                        <button
                          type="button"
                          className="pill-btn"
                          style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() => handleRemove(ch)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <iframe
                      title={`Twitch Stream ${ch}`}
                      src={embedSrc}
                      allowFullScreen
                      style={{ flex: 1, width: '100%', border: 'none', background: '#000' }}
                    />
                  </div>
                );
              })
            )}
          </div>

          {showChat && channels.length > 0 && (
            <div
              style={{
                width: 320,
                borderLeft: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-chrome)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  padding: 6,
                  borderBottom: '1px solid var(--border-subtle)',
                  overflowX: 'auto',
                }}
              >
                {channels.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    className={`pill-btn ${(chatChannel || channels[0]) === ch ? 'pill-btn--active' : ''}`}
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => setChatChannel(ch)}
                  >
                    {ch}
                  </button>
                ))}
              </div>
              <iframe
                title={`Twitch Chat ${chatChannel || channels[0]}`}
                src={`https://www.twitch.tv/embed/${encodeURIComponent(chatChannel || channels[0])}/chat?darkpopout&parent=${encodeURIComponent(parentHost)}&parent=localhost`}
                style={{ flex: 1, width: '100%', border: 'none' }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
