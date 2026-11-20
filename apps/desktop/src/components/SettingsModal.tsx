import { useState, type FormEvent } from 'react';
import type {
  AppSettings,
  DrmStatus,
  ServiceDefinition,
  UpdateState,
  WorkspacePreset,
} from '@omnideck/shared';
import { CloseIcon, DownloadCloudIcon, TrashIcon } from './Icons';
import { ServiceIcon } from './ServiceIcon';

interface SettingsModalProps {
  settings: AppSettings;
  services: ServiceDefinition[];
  workspaces: WorkspacePreset[];
  activeWorkspaceId: string;
  drm: DrmStatus;
  update: UpdateState;
  totalBlockedRequests: number;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
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
  settings,
  services,
  workspaces,
  activeWorkspaceId,
  drm,
  update,
  totalBlockedRequests,
  onClose,
  onUpdateSettings,
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
  const [clearedId, setClearedId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pasteJsonOpen, setPasteJsonOpen] = useState(false);
  const [pasteJsonValue, setPasteJsonValue] = useState('');

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
        <div className="modal__header">
          <div>
            <h2 id="settings-title" className="modal__title">
              OmniDeck Settings
            </h2>
            <p className="modal__subtitle">
              Version {update.currentVersion} • Auto-updates, media switching, ad shield, workspaces &amp; sync.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
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

            <div className="setting-row">
              <div>
                <div className="setting-row__title">Check &amp; Download Updates Automatically</div>
                <div className="setting-row__desc">
                  Downloads new releases from GitHub in the background without logging you out.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoCheckUpdates}
                className={`toggle ${settings.autoCheckUpdates ? 'toggle--on' : ''}`}
                onClick={() =>
                  void onUpdateSettings({ autoCheckUpdates: !settings.autoCheckUpdates })
                }
              />
            </div>
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
                <div className="setting-row__title">Smart Audio Switching</div>
                <div className="setting-row__desc">
                  Automatically pauses Spotify, Audible, or YT Music when you play a YouTube video or Twitch stream.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.smartAudioSwitching}
                className={`toggle ${settings.smartAudioSwitching ? 'toggle--on' : ''}`}
                onClick={() =>
                  void onUpdateSettings({ smartAudioSwitching: !settings.smartAudioSwitching })
                }
              />
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-row__title">Hardware Media Keys</div>
                <div className="setting-row__desc">
                  Bind keyboard &amp; headset Play/Pause, Next, and Previous buttons to Now Playing.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.hardwareMediaKeys}
                className={`toggle ${settings.hardwareMediaKeys ? 'toggle--on' : ''}`}
                onClick={() =>
                  void onUpdateSettings({ hardwareMediaKeys: !settings.hardwareMediaKeys })
                }
              />
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-row__title">
                  Built-in Ad &amp; Tracker Shield ({totalBlockedRequests} blocked this session)
                </div>
                <div className="setting-row__desc">
                  Network-level ad &amp; telemetry blocker engineered to preserve OAuth logins and Widevine DRM.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.adBlockerEnabled}
                className={`toggle ${settings.adBlockerEnabled ? 'toggle--on' : ''}`}
                onClick={() =>
                  void onUpdateSettings({ adBlockerEnabled: !settings.adBlockerEnabled })
                }
              />
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-row__title">Do Not Disturb</div>
                <div className="setting-row__desc">
                  Suppresses web push notifications and hides unread badge counts in the menu bar.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.doNotDisturb}
                className={`toggle ${settings.doNotDisturb ? 'toggle--on' : ''}`}
                onClick={() => void onUpdateSettings({ doNotDisturb: !settings.doNotDisturb })}
              />
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-row__title">Share Google Login (YouTube &amp; YT Music)</div>
                <div className="setting-row__desc">
                  Uses one persistent <code>persist:google</code> session so signing into YouTube
                  automatically authenticates YouTube Music too.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.shareGoogleSession}
                className={`toggle ${settings.shareGoogleSession ? 'toggle--on' : ''}`}
                onClick={() =>
                  void onUpdateSettings({ shareGoogleSession: !settings.shareGoogleSession })
                }
              />
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-row__title">Background Audio Playback</div>
                <div className="setting-row__desc">
                  Keep Spotify, Audible, YouTube, YouTube Music, and Twitch playing when switched
                  to another app.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.backgroundAudioEnabled}
                className={`toggle ${settings.backgroundAudioEnabled ? 'toggle--on' : ''}`}
                onClick={() =>
                  void onUpdateSettings({
                    backgroundAudioEnabled: !settings.backgroundAudioEnabled,
                  })
                }
              />
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-row__title">Auto-Sleep Idle Silent Tabs</div>
                <div className="setting-row__desc">
                  Automatically frees RAM from unused background tabs. Never sleeps tabs playing audio.
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
                  Transfers custom apps, tab order, workspaces, and settings without touching passwords or cookies.
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

          <section>
            <h3 className="section-label">Keyboard Shortcuts</h3>
            <div className="kbd-grid">
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
              <div className="kbd-item">
                <span>Pin Always on Top</span>
                <kbd>Ctrl + Shift + T</kbd>
              </div>
              <div className="kbd-item">
                <span>Top Bar / Left Rail</span>
                <kbd>Ctrl + Shift + L</kbd>
              </div>
              <div className="kbd-item">
                <span>Mute / Unmute App</span>
                <kbd>Ctrl + M</kbd>
              </div>
              <div className="kbd-item">
                <span>Sleep Active Tab</span>
                <kbd>Ctrl + Shift + H</kbd>
              </div>
            </div>
          </section>
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
