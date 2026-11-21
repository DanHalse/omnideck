import { useEffect, useState, type FormEvent } from 'react';
import {
  AI_PROVIDER_DEFAULT_MODELS,
  type AiCompanionConfig,
  type AiProviderId,
  type AppSettings,
  type AudioFocusMode,
  type DrmStatus,
  type IntegrationsConfig,
  type PowerUpsConfig,
  type ServiceDefinition,
  type ServiceRuntimeState,
  type UpdateState,
  type WorkspacePreset,
} from '@omnideck/shared';
import { CloseIcon, DownloadCloudIcon, TrashIcon } from './Icons';
import { ServiceIcon } from './ServiceIcon';

export type SettingsTab = 'general' | 'powerups' | 'ai' | 'performance' | 'workspaces';

interface SettingsModalProps {
  initialTab?: SettingsTab;
  settings: AppSettings;
  services: ServiceDefinition[];
  runtime: Record<string, ServiceRuntimeState>;
  workspaces: WorkspacePreset[];
  activeWorkspaceId: string;
  drm: DrmStatus;
  update: UpdateState;
  totalBlockedRequests: number;
  totalMemoryMb: number;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onUpdatePowerUps: (patch: Partial<PowerUpsConfig>) => Promise<void>;
  onUpdateIntegrations: (patch: Partial<IntegrationsConfig>) => Promise<void>;
  onUnblockMusic: (entryId: string) => Promise<void>;
  onTestAiConnection: (config: AiCompanionConfig) => Promise<{ ok: boolean; message: string }>;
  onRefreshMemory: () => Promise<void>;
  onHibernateService: (serviceId: string) => Promise<void>;
  onHibernateInactive: () => Promise<void>;
  onHibernateHeavyTabs: () => Promise<void>;
  onClearSession: (serviceId: string) => Promise<void>;
  onResetDefaults: () => Promise<void>;
  onApplyWorkspace: (workspaceId: string) => Promise<void>;
  onSaveWorkspace: (name: string) => Promise<void>;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  onOpenReleasePage: () => Promise<void>;
  onExportConfigFile: () => Promise<{ saved: boolean; path?: string }>;
  onImportConfigFile: () => Promise<{ imported: boolean; error?: string }>;
  onCopySyncJson: () => Promise<void>;
  onImportSyncJson: (rawJson: string) => Promise<void>;
}

const HIBERNATE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
];

export function SettingsModal({
  initialTab = 'general',
  settings,
  services,
  runtime,
  workspaces,
  activeWorkspaceId,
  drm,
  update,
  totalBlockedRequests,
  totalMemoryMb,
  onClose,
  onUpdateSettings,
  onUpdatePowerUps,
  onUpdateIntegrations,
  onUnblockMusic,
  onTestAiConnection,
  onRefreshMemory,
  onHibernateService,
  onHibernateInactive,
  onHibernateHeavyTabs,
  onClearSession,
  onResetDefaults,
  onApplyWorkspace,
  onSaveWorkspace,
  onDeleteWorkspace,
  onCheckForUpdates,
  onInstallUpdate,
  onOpenReleasePage,
  onExportConfigFile,
  onImportConfigFile,
  onCopySyncJson,
  onImportSyncJson,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [clearedId, setClearedId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pasteJsonOpen, setPasteJsonOpen] = useState(false);
  const [pasteJsonValue, setPasteJsonValue] = useState('');
  const [aiDraft, setAiDraft] = useState<AiCompanionConfig>(settings.aiCompanion);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [intDraft, setIntDraft] = useState<IntegrationsConfig>(settings.integrations);
  const [redditKwInput, setRedditKwInput] = useState('');

  const pu = settings.powerUps;

  useEffect(() => {
    setAiDraft(settings.aiCompanion);
  }, [settings.aiCompanion]);

  useEffect(() => {
    setIntDraft(settings.integrations);
  }, [settings.integrations]);

  // Refresh live per-service RAM metrics whenever Performance tab is open
  useEffect(() => {
    if (tab !== 'performance') return;
    void onRefreshMemory();
    const timer = setInterval(() => {
      void onRefreshMemory();
    }, 6000);
    return () => clearInterval(timer);
  }, [tab, onRefreshMemory]);

  const handleClear = async (id: string) => {
    await onClearSession(id);
    setClearedId(id);
    setTimeout(() => setClearedId((cur) => (cur === id ? null : cur)), 2000);
  };

  const handleCreateWorkspace = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) return;
    await onSaveWorkspace(workspaceName.trim());
    setWorkspaceName('');
  };

  const handleExportFile = async () => {
    const res = await onExportConfigFile();
    if (res.saved) {
      setSyncMessage('Exported configuration backup successfully.');
    }
  };

  const handleImportFile = async () => {
    const res = await onImportConfigFile();
    if (res.imported) {
      setSyncMessage('Imported configuration backup successfully.');
    } else if (res.error) {
      setSyncMessage(`Import failed: ${res.error}`);
    }
  };

  const handleCopyJson = async () => {
    await onCopySyncJson();
    setSyncMessage('Copied OmniDeck sync JSON to clipboard — paste it on Android or another PC.');
  };

  const handlePasteImport = async () => {
    try {
      await onImportSyncJson(pasteJsonValue);
      setPasteJsonValue('');
      setPasteJsonOpen(false);
      setSyncMessage('Configuration synced from pasted JSON.');
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Invalid JSON backup.');
    }
  };

  const renderToggleRow = (
    title: string,
    desc: string,
    checked: boolean,
    onToggle: () => void,
  ) => (
    <div className="setting-row">
      <div>
        <div className="setting-row__title">{title}</div>
        <div className="setting-row__desc">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'toggle--on' : ''}`}
        onClick={onToggle}
      />
    </div>
  );

  const mountedCount = services.filter((s) => runtime[s.id]?.mounted).length;
  const maxSvcMb = Math.max(
    250,
    ...services.map((s) => runtime[s.id]?.memoryMb ?? 0),
  );

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal__header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h2 id="settings-title" className="modal__title">
                OmniDeck Settings
              </h2>
              <p className="modal__subtitle">
                Version {update.currentVersion} • Power-Ups, RAM &amp; GPU performance, workspaces &amp; self-updates.
              </p>
            </div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>

          <div className="segmented" role="tablist" aria-label="Settings sections" style={{ width: '100%' }}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'general'}
              className={`segmented__btn ${tab === 'general' ? 'segmented__btn--active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setTab('general')}
            >
              General
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'powerups'}
              className={`segmented__btn ${tab === 'powerups' ? 'segmented__btn--active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setTab('powerups')}
            >
              Power-Ups
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'ai'}
              className={`segmented__btn ${tab === 'ai' ? 'segmented__btn--active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setTab('ai')}
            >
              AI &amp; Integrations
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'performance'}
              className={`segmented__btn ${tab === 'performance' ? 'segmented__btn--active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setTab('performance')}
            >
              Performance &amp; RAM
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'workspaces'}
              className={`segmented__btn ${tab === 'workspaces' ? 'segmented__btn--active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setTab('workspaces')}
            >
              Workspaces &amp; Sync
            </button>
          </div>
        </div>

        <div className="modal__body">
          {tab === 'general' && (
            <>
              {/* Self-Updater Section */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">Automatic Self-Updates</h3>
                <div
                  className={`drm-banner ${
                    update.phase === 'downloaded' || update.phase === 'up-to-date'
                      ? 'drm-banner--ready'
                      : update.phase === 'error'
                        ? 'drm-banner--warn'
                        : ''
                  }`}
                  style={{ justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span className="drm-banner__dot" />
                    <div>
                      <div className="setting-row__title">
                        OmniDeck v{update.currentVersion}
                        {update.canAutoInstall ? ' (In-Place Auto-Update)' : ' (GitHub Release Notifier)'}
                      </div>
                      <div className="setting-row__desc">{update.message}</div>
                    </div>
                  </div>

                  <div className="control-group" style={{ flexShrink: 0 }}>
                    {update.phase === 'downloaded' ? (
                      <button
                        type="button"
                        className="pill-btn pill-btn--primary"
                        onClick={() => void onInstallUpdate()}
                      >
                        <DownloadCloudIcon size={12} />
                        <span>Restart &amp; Install</span>
                      </button>
                    ) : update.phase === 'available' ? (
                      <button
                        type="button"
                        className="pill-btn pill-btn--primary"
                        onClick={() => void onOpenReleasePage()}
                      >
                        <DownloadCloudIcon size={12} />
                        <span>Download v{update.availableVersion}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="pill-btn"
                        disabled={update.phase === 'checking' || update.phase === 'downloading'}
                        onClick={() => void onCheckForUpdates()}
                      >
                        {update.phase === 'checking'
                          ? 'Checking…'
                          : update.phase === 'downloading'
                            ? `${update.progressPercent ?? 0}%`
                            : 'Check Now'}
                      </button>
                    )}
                  </div>
                </div>

                {renderToggleRow(
                  'Check & Download Updates Automatically',
                  'Downloads new releases from GitHub in the background without logging you out.',
                  settings.autoCheckUpdates,
                  () => void onUpdateSettings({ autoCheckUpdates: !settings.autoCheckUpdates }),
                )}
              </section>

              {/* Widevine DRM Engine */}
              <section>
                <h3 className="section-label">Widevine DRM Engine</h3>
                <div className={`drm-banner ${drm.widevineReady ? 'drm-banner--ready' : 'drm-banner--warn'}`}>
                  <span className="drm-banner__dot" />
                  <div>
                    <div className="setting-row__title">
                      {drm.widevineReady ? 'DRM Playback Ready' : 'DRM Requires Castlabs ECS'}
                      {drm.widevineVersion ? ` • ${drm.widevineVersion}` : ''}
                    </div>
                    <div className="setting-row__desc">{drm.message}</div>
                  </div>
                </div>
              </section>

              {/* Appearance & Navigation */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">Appearance &amp; Navigation</h3>

                <div className="setting-row">
                  <div>
                    <div className="setting-row__title">Navigation Bar Position</div>
                    <div className="setting-row__desc">
                      Choose a horizontal Top Menu Bar or a vertical Left Sidebar Rail.
                    </div>
                  </div>
                  <div className="segmented" role="group" aria-label="Navigation bar position">
                    <button
                      type="button"
                      id="opt-nav-top"
                      className={`segmented__btn ${settings.navPosition === 'top' ? 'segmented__btn--active' : ''}`}
                      onClick={() => void onUpdateSettings({ navPosition: 'top' })}
                    >
                      Top Bar
                    </button>
                    <button
                      type="button"
                      id="opt-nav-left"
                      className={`segmented__btn ${settings.navPosition === 'left' ? 'segmented__btn--active' : ''}`}
                      onClick={() => void onUpdateSettings({ navPosition: 'left' })}
                    >
                      Left Rail
                    </button>
                  </div>
                </div>

                <div className="setting-row">
                  <div>
                    <div className="setting-row__title">App Chrome Style</div>
                    <div className="setting-row__desc">
                      <strong>Zen App</strong> hides the browser URL/nav bar for a pure native feel (toggle anytime with <code>Ctrl+B</code>).
                    </div>
                  </div>
                  <div className="segmented" role="group" aria-label="App chrome style">
                    <button
                      type="button"
                      className={`segmented__btn ${settings.appChromeMode === 'zen' ? 'segmented__btn--active' : ''}`}
                      onClick={() => void onUpdateSettings({ appChromeMode: 'zen' })}
                    >
                      Zen App
                    </button>
                    <button
                      type="button"
                      className={`segmented__btn ${settings.appChromeMode === 'classic' ? 'segmented__btn--active' : ''}`}
                      onClick={() => void onUpdateSettings({ appChromeMode: 'classic' })}
                    >
                      Classic Bar
                    </button>
                  </div>
                </div>

                {renderToggleRow(
                  'Per-Service Native Polish',
                  'Unifies slim scrollbars and hides "Get Desktop App" / "Open in App" nag banners.',
                  settings.nativePolishCss,
                  () => void onUpdateSettings({ nativePolishCss: !settings.nativePolishCss }),
                )}

                {renderToggleRow(
                  'Smart Cross-App Link Routing',
                  'Clicking a YouTube, Spotify, or Twitch link inside Reddit opens it straight in its OmniDeck tab.',
                  settings.smartLinkRouting,
                  () => void onUpdateSettings({ smartLinkRouting: !settings.smartLinkRouting }),
                )}

                {renderToggleRow(
                  'Minimize to System Tray on Close',
                  `Keeps Spotify & Audible playing quietly in the tray (summon anytime with ${settings.globalSummonShortcut}).`,
                  settings.minimizeToTrayOnClose,
                  () => void onUpdateSettings({ minimizeToTrayOnClose: !settings.minimizeToTrayOnClose }),
                )}

                {renderToggleRow(
                  'Restore Last Visited Pages on Launch',
                  'Reopens each service right back to the video, stream, subreddit, or audiobook you left off on.',
                  settings.restoreLastPages,
                  () => void onUpdateSettings({ restoreLastPages: !settings.restoreLastPages }),
                )}

                {renderToggleRow(
                  'Launch OmniDeck at OS Login',
                  'Start OmniDeck automatically when you sign in to Windows or Linux.',
                  settings.launchAtLogin,
                  () => void onUpdateSettings({ launchAtLogin: !settings.launchAtLogin }),
                )}

                <div className="setting-row">
                  <div>
                    <div className="setting-row__title">Shell Theme</div>
                    <div className="setting-row__desc">Applies to OmniDeck chrome and modals.</div>
                  </div>
                  <div className="segmented" role="group" aria-label="Theme">
                    <button
                      type="button"
                      id="opt-theme-dark"
                      className={`segmented__btn ${settings.theme === 'dark' ? 'segmented__btn--active' : ''}`}
                      onClick={() => void onUpdateSettings({ theme: 'dark' })}
                    >
                      Dark
                    </button>
                    <button
                      type="button"
                      id="opt-theme-light"
                      className={`segmented__btn ${settings.theme === 'light' ? 'segmented__btn--active' : ''}`}
                      onClick={() => void onUpdateSettings({ theme: 'light' })}
                    >
                      Light
                    </button>
                  </div>
                </div>
              </section>

              {/* Media, Audio Intelligence & Shield */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">Media, Audio &amp; Privacy Shield</h3>

                <div className="setting-row">
                  <div>
                    <div className="setting-row__title">Smart Audio Focus</div>
                    <div className="setting-row__desc">
                      Choose whether playing a video/stream pauses background music or smoothly ducks it to {Math.round(settings.audioDuckLevel * 100)}%.
                    </div>
                  </div>
                  <div className="segmented" role="group" aria-label="Smart audio focus mode">
                    {(
                      [
                        ['off', 'Off'],
                        ['pause', 'Pause'],
                        ['duck', 'Duck'],
                      ] as Array<[AudioFocusMode, string]>
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        className={`segmented__btn ${settings.audioFocusMode === mode ? 'segmented__btn--active' : ''}`}
                        onClick={() => void onUpdateSettings({ audioFocusMode: mode })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {renderToggleRow(
                  'Auto-Show Floating Mini-Player on Minimize',
                  'Pops up the compact always-on-top Mini-Player HUD with synced lyrics when OmniDeck minimizes during playback.',
                  settings.miniPlayerAutoShowOnMinimize,
                  () =>
                    void onUpdateSettings({
                      miniPlayerAutoShowOnMinimize: !settings.miniPlayerAutoShowOnMinimize,
                    }),
                )}

                {renderToggleRow(
                  'Hardware Media Keys',
                  'Bind keyboard & headset Play/Pause, Next, Previous (±30s on Audible) to Now Playing.',
                  settings.hardwareMediaKeys,
                  () => void onUpdateSettings({ hardwareMediaKeys: !settings.hardwareMediaKeys }),
                )}

                {renderToggleRow(
                  `Built-in Ad & Tracker Shield (${totalBlockedRequests} blocked this session)`,
                  'O(1) network-level ad & telemetry blocker engineered to preserve OAuth logins, Widevine DRM & Power-Up APIs.',
                  settings.adBlockerEnabled,
                  () => void onUpdateSettings({ adBlockerEnabled: !settings.adBlockerEnabled }),
                )}

                {renderToggleRow(
                  'Do Not Disturb',
                  'Suppresses web push notifications and hides unread badge counts in the menu bar.',
                  settings.doNotDisturb,
                  () => void onUpdateSettings({ doNotDisturb: !settings.doNotDisturb }),
                )}

                {renderToggleRow(
                  'Share Google Login (YouTube & YT Music)',
                  'Uses one persistent persist:google session so signing into YouTube authenticates YouTube Music too.',
                  settings.shareGoogleSession,
                  () => void onUpdateSettings({ shareGoogleSession: !settings.shareGoogleSession }),
                )}
              </section>

              <section>
                <h3 className="section-label">Keyboard Shortcuts</h3>
                <div className="kbd-grid">
                  <div className="kbd-item">
                    <span>Command &amp; Power-Ups Palette</span>
                    <kbd>Ctrl + K</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>OmniDeck Home Hub</span>
                    <kbd>Ctrl + 0</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>AI Artist &amp; Discovery Hub</span>
                    <kbd>Ctrl + Shift + N</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>Audio Suite (Mixer &amp; 10-Band EQ)</span>
                    <kbd>Ctrl + Shift + V</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>Like / Heart Playing Track</span>
                    <kbd>{pu.spotifyLikeShortcut}</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>Summon / Hide Globally</span>
                    <kbd>{settings.globalSummonShortcut}</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>Toggle Browser Tools Bar</span>
                    <kbd>Ctrl + B</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>Switch to App 1–9</span>
                    <kbd>Ctrl + 1–9</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>Play / Pause Now Playing</span>
                    <kbd>Ctrl + Shift + Space</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>Toggle Split View</span>
                    <kbd>Ctrl + \</kbd>
                  </div>
                  <div className="kbd-item">
                    <span>Picture-in-Picture Video</span>
                    <kbd>Ctrl + Shift + P</kbd>
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === 'ai' && (
            <>
              <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h3 className="section-label">AI Music Discovery &amp; Now Playing Companion</h3>
                <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <div>
                    <div className="setting-row__title">AI Provider (Optional Enhancement)</div>
                    <div className="setting-row__desc">
                      Free open APIs (MusicBrainz, Wikipedia, Deezer &amp; LRCLIB synced lyrics) always work with zero keys.
                      Connect an AI provider to add song backstories, tailored &quot;why these bands match&quot; write-ups, and interactive Q&amp;A.
                    </div>
                  </div>
                  <div className="segmented" role="group" aria-label="AI provider" style={{ flexWrap: 'wrap' }}>
                    {(
                      [
                        ['none', 'Free Only'],
                        ['gemini', 'Gemini'],
                        ['openai', 'OpenAI'],
                        ['anthropic', 'Claude'],
                        ['ollama', 'Local Ollama'],
                      ] as Array<[AiProviderId, string]>
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`segmented__btn ${aiDraft.provider === id ? 'segmented__btn--active' : ''}`}
                        style={{ flex: 1 }}
                        onClick={() => {
                          const next: AiCompanionConfig = {
                            ...aiDraft,
                            provider: id,
                            model: AI_PROVIDER_DEFAULT_MODELS[id] || aiDraft.model,
                          };
                          setAiDraft(next);
                          setAiTestResult(null);
                          void onUpdateSettings({ aiCompanion: next });
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {aiDraft.provider !== 'none' && (
                  <>
                    {aiDraft.provider !== 'ollama' ? (
                      <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                        <label className="setting-row__title" htmlFor="ai-api-key">
                          {aiDraft.provider === 'gemini'
                            ? 'Google Gemini API Key'
                            : aiDraft.provider === 'openai'
                              ? 'OpenAI API Key'
                              : 'Anthropic Claude API Key'}
                        </label>
                        <input
                          id="ai-api-key"
                          type="password"
                          className="text-input"
                          placeholder="Paste your API key (stored locally only; excluded from config exports)"
                          value={aiDraft.apiKey}
                          onChange={(e) => setAiDraft({ ...aiDraft, apiKey: e.target.value })}
                          onBlur={() => void onUpdateSettings({ aiCompanion: aiDraft })}
                        />
                      </div>
                    ) : (
                      <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                        <label className="setting-row__title" htmlFor="ai-ollama-url">
                          Local Ollama Endpoint
                        </label>
                        <input
                          id="ai-ollama-url"
                          type="text"
                          className="text-input"
                          placeholder="http://localhost:11434"
                          value={aiDraft.ollamaBaseUrl}
                          onChange={(e) => setAiDraft({ ...aiDraft, ollamaBaseUrl: e.target.value })}
                          onBlur={() => void onUpdateSettings({ aiCompanion: aiDraft })}
                        />
                      </div>
                    )}

                    <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                      <label className="setting-row__title" htmlFor="ai-model">
                        Model ID
                      </label>
                      <input
                        id="ai-model"
                        type="text"
                        className="text-input"
                        placeholder={AI_PROVIDER_DEFAULT_MODELS[aiDraft.provider]}
                        value={aiDraft.model}
                        onChange={(e) => setAiDraft({ ...aiDraft, model: e.target.value })}
                        onBlur={() => void onUpdateSettings({ aiCompanion: aiDraft })}
                      />
                    </div>

                    {renderToggleRow(
                      'Auto-Enrich Every Playing Track',
                      'Automatically generates Track Context & "Why you\'ll like these bands" notes when a song starts (cached locally for 7 days).',
                      aiDraft.autoEnrich,
                      () => {
                        const next = { ...aiDraft, autoEnrich: !aiDraft.autoEnrich };
                        setAiDraft(next);
                        void onUpdateSettings({ aiCompanion: next });
                      },
                    )}

                    <div className="setting-row">
                      <div>
                        <div className="setting-row__title">Verify AI Connection</div>
                        <div className="setting-row__desc">
                          {aiTestResult
                            ? aiTestResult.message
                            : 'Save settings and test your provider endpoint.'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="pill-btn pill-btn--primary"
                        disabled={aiTesting}
                        onClick={async () => {
                          setAiTesting(true);
                          setAiTestResult(null);
                          await onUpdateSettings({ aiCompanion: aiDraft });
                          const res = await onTestAiConnection(aiDraft);
                          setAiTestResult(res);
                          setAiTesting(false);
                        }}
                      >
                        {aiTesting ? 'Testing…' : 'Save & Test'}
                      </button>
                    </div>
                  </>
                )}
              </section>

              <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h3 className="section-label">Discord Rich Presence &amp; Music Scrobbling</h3>
                {renderToggleRow(
                  'Discord Rich Presence',
                  'Shows your live YouTube Music, Spotify, YouTube, or Twitch activity with timestamps & album art in Discord.',
                  intDraft.discordRpcEnabled,
                  () => {
                    const next = { ...intDraft, discordRpcEnabled: !intDraft.discordRpcEnabled };
                    setIntDraft(next);
                    void onUpdateIntegrations({ discordRpcEnabled: next.discordRpcEnabled });
                  },
                )}

                <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <label className="setting-row__title" htmlFor="lb-token">
                    ListenBrainz User Token (Optional Scrobbler)
                  </label>
                  <div className="setting-row__desc">
                    Automatically submits &quot;Playing Now&quot; and full listens from YouTube Music &amp; Spotify to ListenBrainz.
                  </div>
                  <input
                    id="lb-token"
                    type="password"
                    className="text-input"
                    placeholder="Paste your ListenBrainz user token"
                    value={intDraft.listenBrainzToken}
                    onChange={(e) => setIntDraft({ ...intDraft, listenBrainzToken: e.target.value })}
                    onBlur={() => void onUpdateIntegrations({ listenBrainzToken: intDraft.listenBrainzToken })}
                  />
                </div>

                <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="setting-row__title">Last.fm Scrobbling (Optional)</div>
                  <div className="setting-row__desc">
                    Enter your Last.fm API Key, Shared Secret, and Session Key to scrobble tracks automatically.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <input
                      type="password"
                      className="text-input"
                      placeholder="API Key"
                      value={intDraft.lastFmApiKey}
                      onChange={(e) => setIntDraft({ ...intDraft, lastFmApiKey: e.target.value })}
                      onBlur={() => void onUpdateIntegrations({ lastFmApiKey: intDraft.lastFmApiKey })}
                    />
                    <input
                      type="password"
                      className="text-input"
                      placeholder="Shared Secret"
                      value={intDraft.lastFmApiSecret}
                      onChange={(e) => setIntDraft({ ...intDraft, lastFmApiSecret: e.target.value })}
                      onBlur={() => void onUpdateIntegrations({ lastFmApiSecret: intDraft.lastFmApiSecret })}
                    />
                    <input
                      type="password"
                      className="text-input"
                      placeholder="Session Key"
                      value={intDraft.lastFmSessionKey}
                      onChange={(e) => setIntDraft({ ...intDraft, lastFmSessionKey: e.target.value })}
                      onBlur={() => void onUpdateIntegrations({ lastFmSessionKey: intDraft.lastFmSessionKey })}
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === 'powerups' && (
            <>
              {/* YouTube & YouTube Music */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">YouTube &amp; YouTube Music</h3>
                {renderToggleRow(
                  'SponsorBlock Auto-Skipper',
                  'Skips sponsor reads, intros/outros & music-video non-music segments via k-anonymity API with an in-player Undo button.',
                  pu.youtubeSponsorBlock,
                  () => void onUpdatePowerUps({ youtubeSponsorBlock: !pu.youtubeSponsorBlock }),
                )}
                {renderToggleRow(
                  'Force Original Audio Track (Kill AI Auto-Dubbing)',
                  'Automatically switches back to the creator\'s original voice whenever YouTube forces robotic AI auto-dubbing.',
                  pu.youtubeForceOriginalAudio,
                  () => void onUpdatePowerUps({ youtubeForceOriginalAudio: !pu.youtubeForceOriginalAudio }),
                )}
                {renderToggleRow(
                  'Return YouTube Dislike Counter (Ad-Free)',
                  'Restores estimated dislike counts and a subtle like/dislike ratio bar underneath YouTube videos.',
                  pu.youtubeReturnDislikes,
                  () => void onUpdatePowerUps({ youtubeReturnDislikes: !pu.youtubeReturnDislikes }),
                )}
                {renderToggleRow(
                  'DeArrow Anti-Clickbait Titles',
                  'Replaces ALL-CAPS clickbait watch titles with crowdsourced factual titles (hover title to see original).',
                  pu.youtubeDeArrow,
                  () => void onUpdatePowerUps({ youtubeDeArrow: !pu.youtubeDeArrow }),
                )}
                {renderToggleRow(
                  'Hide YouTube Shorts & Convert /shorts/',
                  'Removes Shorts shelves from Home/Search and opens /shorts/ links in the full desktop video player.',
                  pu.youtubeHideShorts,
                  () => void onUpdatePowerUps({ youtubeHideShorts: !pu.youtubeHideShorts }),
                )}
                {renderToggleRow(
                  'Hide End-Screen Cards & Playables Spam',
                  'Clears floating end-screen cards blocking the last 15 seconds of videos and removes Playables shelves.',
                  pu.youtubeHideEndScreens,
                  () => void onUpdatePowerUps({ youtubeHideEndScreens: !pu.youtubeHideEndScreens }),
                )}
                {renderToggleRow(
                  'Disable Homepage Hover Auto-Play Previews',
                  'Stops video thumbnails from auto-playing when your mouse hovers over them.',
                  pu.youtubeDisableHoverPreview,
                  () => void onUpdatePowerUps({ youtubeDisableHoverPreview: !pu.youtubeDisableHoverPreview }),
                )}
                {renderToggleRow(
                  'Player Power Controls (A–B Loop, Frame Snap, Shift+Wheel Speed)',
                  'Adds A–B Loop and 1-click Clean Frame Screenshot buttons to YouTube\'s player bar plus Shift+Wheel 0.1x speed.',
                  pu.youtubePlayerControls,
                  () => void onUpdatePowerUps({ youtubePlayerControls: !pu.youtubePlayerControls }),
                )}
                {renderToggleRow(
                  'Auto-Dismiss "Are You Still Listening?"',
                  'Automatically dismisses idle confirmation popups so background playlists never silently stop.',
                  pu.youtubeAutoDismissStillListening,
                  () =>
                    void onUpdatePowerUps({
                      youtubeAutoDismissStillListening: !pu.youtubeAutoDismissStillListening,
                    }),
                )}
                {renderToggleRow(
                  'Remember Preferred Playback Speed',
                  'Remembers your YouTube playback speed (e.g. 1.25x / 1.5x) automatically across videos.',
                  pu.youtubeRememberSpeedQuality,
                  () =>
                    void onUpdatePowerUps({
                      youtubeRememberSpeedQuality: !pu.youtubeRememberSpeedQuality,
                    }),
                )}
                {renderToggleRow(
                  'YouTube Music: Playlist Quick-Filter & Queue Total Duration',
                  'Adds an instant track/artist filter box atop large playlists and shows total remaining queue time in Up Next.',
                  pu.ytmPlaylistQuickFilter,
                  () => void onUpdatePowerUps({ ytmPlaylistQuickFilter: !pu.ytmPlaylistQuickFilter }),
                )}
                {renderToggleRow(
                  'YouTube Music: Audio-Only Stage Mode',
                  'Hides the video canvas on YouTube Music\'s player page for a distraction-free audio focus.',
                  pu.ytmAudioOnlyMode,
                  () => void onUpdatePowerUps({ ytmAudioOnlyMode: !pu.ytmAudioOnlyMode }),
                )}
              </section>

              {/* Universal Music Trashbin (Auto-Skip Blocklist) */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">
                  Universal Music Trashbin — Blocked Artists &amp; Songs ({settings.blockedMusic.length})
                </h3>
                <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <div className="setting-row__desc">
                    Any artist or track blocked from the Mini-Player HUD or Artist Hub is automatically skipped across YouTube Music &amp; Spotify.
                  </div>
                  {settings.blockedMusic.length === 0 ? (
                    <div className="setting-row__desc" style={{ opacity: 0.7 }}>
                      No blocked artists or songs yet. Click the Block icon in the Mini-Player HUD or Artist Hub to banish AI-slop or unwanted artists.
                    </div>
                  ) : (
                    <div className="np-tag-row">
                      {settings.blockedMusic.map((item) => (
                        <span key={item.id} className="keyword-chip">
                          <span>
                            {item.kind === 'artist' ? 'Artist' : 'Song'}: {item.value}
                          </span>
                          <button
                            type="button"
                            className="keyword-chip__x"
                            title="Unblock"
                            onClick={() => void onUnblockMusic(item.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Twitch */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">Twitch</h3>
                {renderToggleRow(
                  'Built-in 7TV, BetterTTV & FrankerFaceZ Emotes + Tab-Autocomplete',
                  'Renders third-party static & animated emotes in chat and completes emote names with Tab while typing.',
                  pu.twitchThirdPartyEmotes,
                  () => void onUpdatePowerUps({ twitchThirdPartyEmotes: !pu.twitchThirdPartyEmotes }),
                )}
                {renderToggleRow(
                  'Auto-Recover Stalled Streams (Error #2000 / #3000 / #5000)',
                  'Automatically clicks Refresh Player whenever Twitch throws a network error overlay mid-stream.',
                  pu.twitchAutoRecover,
                  () => void onUpdatePowerUps({ twitchAutoRecover: !pu.twitchAutoRecover }),
                )}
                {renderToggleRow(
                  'Hide Hype Train, Gift Leaderboards & Recommended Clutter',
                  'Strips distracting chat overlays and sidebar recommendations to keep focus on stream & chat.',
                  pu.twitchHideClutter,
                  () => void onUpdatePowerUps({ twitchHideClutter: !pu.twitchHideClutter }),
                )}
                {renderToggleRow(
                  'Auto-Claim Channel Points Bonus Chest',
                  'Automatically clicks the +50 Channel Points bonus chest whenever it appears in chat.',
                  pu.twitchAutoClaimPoints,
                  () => void onUpdatePowerUps({ twitchAutoClaimPoints: !pu.twitchAutoClaimPoints }),
                )}
                {renderToggleRow(
                  'Pause Fast Chat on Hover',
                  'Freezes scrolling chat while your mouse hovers over messages so you can read effortlessly.',
                  pu.twitchPauseChatOnHover,
                  () => void onUpdatePowerUps({ twitchPauseChatOnHover: !pu.twitchPauseChatOnHover }),
                )}
                {renderToggleRow(
                  'Auto Theater Mode',
                  'Automatically expands Twitch channels to Theater Mode for maximum stream canvas.',
                  pu.twitchAutoTheater,
                  () => void onUpdatePowerUps({ twitchAutoTheater: !pu.twitchAutoTheater }),
                )}
              </section>

              {/* Audible */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">Audible Desktop Suite</h3>
                {renderToggleRow(
                  'Direct-to-Library Launch',
                  'Skips the Audible storefront and opens straight to your /library/titles collection.',
                  pu.audibleDirectToLibrary,
                  () => void onUpdatePowerUps({ audibleDirectToLibrary: !pu.audibleDirectToLibrary }),
                )}
                {renderToggleRow(
                  'Precision Speed Control (0.05× Steps) in Cloud Player',
                  'Adds a floating 0.75×–3.0× fine speed control pill remembered per audiobook.',
                  pu.audiblePrecisionSpeed,
                  () => void onUpdatePowerUps({ audiblePrecisionSpeed: !pu.audiblePrecisionSpeed }),
                )}
                {renderToggleRow(
                  'Strip Storefront & Upsell Clutter (Player-First Mode)',
                  'Hides promotional merchandising banners and Audible Plus upsells on Library & Wishlist pages.',
                  pu.audibleHideStoreClutter,
                  () => void onUpdatePowerUps({ audibleHideStoreClutter: !pu.audibleHideStoreClutter }),
                )}
                {renderToggleRow(
                  'Dock Cloud Player Inside OmniDeck',
                  'Opens Audible Listen Now side-by-side with your Library instead of spawning a stray popup window.',
                  pu.audibleDockCloudPlayer,
                  () => void onUpdatePowerUps({ audibleDockCloudPlayer: !pu.audibleDockCloudPlayer }),
                )}
                {renderToggleRow(
                  'Fade-Out Sleep Timer + 15s Auto-Rewind on Resume',
                  'Gently fades volume over the final 10 seconds of a sleep timer and rewinds 15s when you press Play again.',
                  pu.audibleFadeSleepAndRewind,
                  () =>
                    void onUpdatePowerUps({
                      audibleFadeSleepAndRewind: !pu.audibleFadeSleepAndRewind,
                    }),
                )}
                {renderToggleRow(
                  'Smart WhisperSync Flush on Close / Sleep',
                  'Pauses playback briefly before closing or sleeping Audible so Amazon saves your exact listening timestamp.',
                  pu.audibleWhisperSyncFlush,
                  () =>
                    void onUpdatePowerUps({
                      audibleWhisperSyncFlush: !pu.audibleWhisperSyncFlush,
                    }),
                )}
              </section>

              {/* Reddit */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">Reddit (Modern RES Suite)</h3>
                {renderToggleRow(
                  'Compact Desktop Density',
                  'Tightens card spacing and widens the desktop feed layout on Modern Reddit.',
                  pu.redditCompactDensity,
                  () => void onUpdatePowerUps({ redditCompactDensity: !pu.redditCompactDensity }),
                )}
                {renderToggleRow(
                  'Use Classic Old Reddit (old.reddit.com)',
                  '1-click switch to redirect Reddit browsing to classic high-density old.reddit.com.',
                  pu.redditUseOldReddit,
                  () => void onUpdatePowerUps({ redditUseOldReddit: !pu.redditUseOldReddit }),
                )}
                {renderToggleRow(
                  'Hide "Games on Reddit", Trending & Recommended Feed Injections',
                  'Strips "Because you visited", "Similar to r/", and Games bloat from Modern Reddit feeds.',
                  pu.redditHideRecommended,
                  () => void onUpdatePowerUps({ redditHideRecommended: !pu.redditHideRecommended }),
                )}
                {renderToggleRow(
                  'Floating "Next Top-Level Comment" Jump Button (↓)',
                  'Apollo / RIF-style floating button on comment threads to hop cleanly to the next parent comment.',
                  pu.redditNextCommentButton,
                  () => void onUpdatePowerUps({ redditNextCommentButton: !pu.redditNextCommentButton }),
                )}
                {renderToggleRow(
                  'Hover Image Zoom & Exact Timestamps',
                  'Hover over post thumbnails for instant full-size image previews and hover relative dates for exact timestamps.',
                  pu.redditHoverZoom,
                  () => void onUpdatePowerUps({ redditHoverZoom: !pu.redditHoverZoom }),
                )}
                {renderToggleRow(
                  'Local Color-Coded User Tagger',
                  'Click the subtle + pill next to any u/username to attach private color-coded tags across Reddit.',
                  pu.redditUserTagger,
                  () => void onUpdatePowerUps({ redditUserTagger: !pu.redditUserTagger }),
                )}
                {renderToggleRow(
                  'RES Keyboard Navigation (J / K / X / C)',
                  'Press J/K to jump between posts, X to expand media, and C to open comments (disabled while typing).',
                  pu.redditKeyboardNav,
                  () => void onUpdatePowerUps({ redditKeyboardNav: !pu.redditKeyboardNav }),
                )}
                {renderToggleRow(
                  'Auto-Collapse AutoModerator Comments',
                  'Automatically collapses pinned AutoModerator boilerplate at the top of threads.',
                  pu.redditCollapseAutoMod,
                  () => void onUpdatePowerUps({ redditCollapseAutoMod: !pu.redditCollapseAutoMod }),
                )}
                {renderToggleRow(
                  'Hide Promoted Posts',
                  'Removes sponsored/promoted cards from Reddit feeds.',
                  pu.redditHidePromoted,
                  () => void onUpdatePowerUps({ redditHidePromoted: !pu.redditHidePromoted }),
                )}

                <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <div>
                    <div className="setting-row__title">Keyword &amp; Subreddit Feed Filter (filteReddit)</div>
                    <div className="setting-row__desc">
                      Hide Reddit posts matching any word, spoiler, or <code>r/subreddit</code> across Home and r/all.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      className="text-input"
                      placeholder="Add keyword or r/subreddit (e.g. spoilers, r/politics)"
                      value={redditKwInput}
                      onChange={(e) => setRedditKwInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = redditKwInput.trim();
                          if (val && !pu.redditFilteredKeywords.includes(val)) {
                            void onUpdatePowerUps({
                              redditFilteredKeywords: [...pu.redditFilteredKeywords, val],
                            });
                            setRedditKwInput('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="pill-btn pill-btn--primary"
                      onClick={() => {
                        const val = redditKwInput.trim();
                        if (val && !pu.redditFilteredKeywords.includes(val)) {
                          void onUpdatePowerUps({
                            redditFilteredKeywords: [...pu.redditFilteredKeywords, val],
                          });
                          setRedditKwInput('');
                        }
                      }}
                    >
                      Filter
                    </button>
                  </div>
                  {pu.redditFilteredKeywords.length > 0 && (
                    <div className="np-tag-row">
                      {pu.redditFilteredKeywords.map((kw) => (
                        <span key={kw} className="keyword-chip">
                          <span>{kw}</span>
                          <button
                            type="button"
                            className="keyword-chip__x"
                            title={`Remove "${kw}"`}
                            onClick={() =>
                              void onUpdatePowerUps({
                                redditFilteredKeywords: pu.redditFilteredKeywords.filter((x) => x !== kw),
                              })
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Spotify */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">Spotify</h3>
                {renderToggleRow(
                  'Music-Only Mode (Hide Podcasts & Audiobooks + Queue Duration)',
                  'Hides Podcast/Episode/Audiobook shelves from Spotify Home and shows total queue duration in Queue.',
                  pu.spotifyHidePodcastsAudiobooks,
                  () =>
                    void onUpdatePowerUps({
                      spotifyHidePodcastsAudiobooks: !pu.spotifyHidePodcastsAudiobooks,
                    }),
                )}
                {renderToggleRow(
                  'Keep Spotify Connect Alive',
                  'Exempts Spotify from idle auto-hibernation so phone/speaker Spotify Connect stays connected.',
                  pu.spotifyKeepConnectAlive,
                  () => void onUpdatePowerUps({ spotifyKeepConnectAlive: !pu.spotifyKeepConnectAlive }),
                )}
                <div className="setting-row">
                  <div>
                    <div className="setting-row__title">Global "Like / Heart Track" Hotkey</div>
                    <div className="setting-row__desc">
                      Press <code>{pu.spotifyLikeShortcut}</code> from any app or game to save the playing Spotify or YT Music track.
                    </div>
                  </div>
                  <span className="meta-chip">{pu.spotifyLikeShortcut}</span>
                </div>
              </section>
            </>
          )}

          {tab === 'performance' && (
            <>
              <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h3 className="section-label" style={{ marginBottom: 2 }}>
                      Live Memory &amp; Process Monitor
                    </h3>
                    <div className="setting-row__desc">
                      Total OmniDeck footprint: <strong>{totalMemoryMb} MB</strong> across {mountedCount} active{' '}
                      {mountedCount === 1 ? 'tab' : 'tabs'} (includes Chromium GPU + shell).
                    </div>
                  </div>
                  <div className="control-group" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="pill-btn"
                      onClick={() => void onRefreshMemory()}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="pill-btn pill-btn--primary"
                      onClick={() => void onHibernateHeavyTabs()}
                    >
                      Sleep Heavy (&gt;350 MB)
                    </button>
                    <button
                      type="button"
                      className="pill-btn"
                      onClick={() => void onHibernateInactive()}
                    >
                      Sleep All Idle
                    </button>
                  </div>
                </div>

                <div className="service-list">
                  {services.map((svc) => {
                    const rt = runtime[svc.id];
                    const mb = rt?.memoryMb ?? 0;
                    const pct = Math.min(100, Math.round((mb / maxSvcMb) * 100));
                    const statusLabel = !rt?.mounted
                      ? rt?.hibernated
                        ? 'Sleeping (0 MB)'
                        : 'Not loaded'
                      : rt.audible
                        ? 'Playing Audio'
                        : rt.softThrottled
                          ? 'Throttled (Tier-1)'
                          : 'Active';

                    return (
                      <div key={svc.id} className="service-row" style={{ gap: 12 }}>
                        <div className="service-row__info" style={{ minWidth: 165 }}>
                          <ServiceIcon icon={svc.icon} size={16} color={svc.accentColor} />
                          <div>
                            <div className="service-row__name">{svc.name}</div>
                            <div className="setting-row__desc" style={{ fontSize: 11 }}>
                              {statusLabel}
                            </div>
                          </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              flex: 1,
                              height: 7,
                              borderRadius: 999,
                              background: 'rgba(148, 163, 184, 0.16)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                borderRadius: 999,
                                background: mb >= 350 ? '#EF4444' : svc.accentColor,
                                transition: 'width 200ms ease',
                              }}
                            />
                          </div>
                          <span
                            style={{
                              minWidth: 58,
                              textAlign: 'right',
                              fontSize: 12,
                              fontWeight: 600,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {mb > 0 ? `${mb} MB` : '—'}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="pill-btn"
                          disabled={!rt?.mounted || rt.audible}
                          onClick={() => void onHibernateService(svc.id)}
                        >
                          Sleep
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">2-Tier Smart Hibernation &amp; GPU Acceleration</h3>

                {renderToggleRow(
                  'Hardware Video Acceleration (GPU / Linux VA-API)',
                  'Offloads 4K YouTube & 1080p60 Twitch decoding to your GPU for lower CPU & cooler fans (restart required on change).',
                  settings.hardwareVideoAcceleration,
                  () =>
                    void onUpdateSettings({
                      hardwareVideoAcceleration: !settings.hardwareVideoAcceleration,
                    }),
                )}

                {renderToggleRow(
                  'Background Audio Playback',
                  'Keep Spotify, Audible, YouTube, YouTube Music, and Twitch unthrottled while playing audio in the background.',
                  settings.backgroundAudioEnabled,
                  () =>
                    void onUpdateSettings({
                      backgroundAudioEnabled: !settings.backgroundAudioEnabled,
                    }),
                )}

                <div className="setting-row">
                  <div>
                    <div className="setting-row__title">Auto-Sleep Idle Silent Tabs (Lossless)</div>
                    <div className="setting-row__desc">
                      Tier-1 soft-throttles at 5 min; Tier-2 snapshots scroll position &amp; video timestamp before freeing RAM. Never sleeps playing audio.
                    </div>
                  </div>
                  <div className="segmented" role="group" aria-label="Auto-sleep timeout">
                    {HIBERNATE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`segmented__btn ${settings.autoHibernateMinutes === opt.value ? 'segmented__btn--active' : ''}`}
                        onClick={() => void onUpdateSettings({ autoHibernateMinutes: opt.value })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === 'workspaces' && (
            <>
              {/* Workspaces */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">Workspaces &amp; Layout Presets</h3>
                <div className="service-list">
                  {workspaces.map((ws) => (
                    <div key={ws.id} className="service-row">
                      <div className="service-row__info">
                        <span className="service-row__name">
                          <span>{ws.name}</span>
                          {ws.id === activeWorkspaceId && <span className="meta-chip">Active</span>}
                          {ws.splitEnabled && <span className="meta-chip">Split</span>}
                        </span>
                      </div>
                      <div className="control-group">
                        <button
                          type="button"
                          className="pill-btn"
                          onClick={() => void onApplyWorkspace(ws.id)}
                        >
                          Switch
                        </button>
                        {!ws.builtIn && (
                          <button
                            type="button"
                            className="icon-btn icon-btn--sm icon-btn--danger"
                            title={`Delete ${ws.name}`}
                            onClick={() => void onDeleteWorkspace(ws.id)}
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleCreateWorkspace} style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="field__input"
                    style={{ flex: 1 }}
                    placeholder="Save current visible apps & split layout as workspace…"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                  />
                  <button type="submit" className="pill-btn pill-btn--primary">
                    Save Preset
                  </button>
                </form>
              </section>

              {/* Cross-Device Config Sync */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 className="section-label">Cross-Device Sync (Windows ↔ Linux ↔ Android)</h3>
                <div className="setting-row" style={{ flexWrap: 'wrap' }}>
                  <div>
                    <div className="setting-row__title">Portable Configuration Backup</div>
                    <div className="setting-row__desc">
                      Transfers custom apps, Power-Ups, tab order, workspaces, and settings without touching passwords or cookies.
                    </div>
                  </div>
                  <div className="control-group" style={{ gap: 6 }}>
                    <button type="button" className="pill-btn" onClick={() => void handleExportFile()}>
                      Export File
                    </button>
                    <button type="button" className="pill-btn" onClick={() => void handleImportFile()}>
                      Import File
                    </button>
                    <button type="button" className="pill-btn" onClick={() => void handleCopyJson()}>
                      Copy Sync JSON
                    </button>
                    <button
                      type="button"
                      className="pill-btn"
                      onClick={() => setPasteJsonOpen((v) => !v)}
                    >
                      Paste JSON
                    </button>
                  </div>
                </div>

                {pasteJsonOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                      className="field__textarea"
                      rows={4}
                      placeholder="Paste OmniDeck sync JSON copied from Android or another PC…"
                      value={pasteJsonValue}
                      onChange={(e) => setPasteJsonValue(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="pill-btn pill-btn--primary"
                        onClick={() => void handlePasteImport()}
                      >
                        Apply Sync JSON
                      </button>
                    </div>
                  </div>
                )}

                {syncMessage && <div className="setting-row__desc">{syncMessage}</div>}
              </section>

              {/* Clear Cookies */}
              <section>
                <h3 className="section-label">Clear Persistent Session / Sign Out</h3>
                <div className="service-list">
                  {services.map((svc) => (
                    <div key={svc.id} className="service-row">
                      <div className="service-row__info">
                        <ServiceIcon icon={svc.icon} size={16} color={svc.accentColor} />
                        <span className="service-row__name">{svc.name}</span>
                      </div>
                      <button
                        type="button"
                        className="pill-btn"
                        onClick={() => void handleClear(svc.id)}
                      >
                        {clearedId === svc.id ? 'Session Cleared' : 'Clear Cookies'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        <div className="modal__footer">
          <button
            type="button"
            className="pill-btn"
            onClick={() => void onResetDefaults()}
          >
            Reset Default Layout
          </button>
          <button type="button" className="pill-btn pill-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
