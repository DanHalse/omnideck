import { useEffect, useMemo, useState } from 'react';
import {
  createInitialRuntimeState,
  getVisibleServices,
  type DesktopSnapshot,
} from '@omnideck/shared';
import { getOmniDeckApi } from './api';
import { NavBar } from './components/NavBar';
import { ControlStrip } from './components/ControlStrip';
import { SplitStage } from './components/SplitStage';
import { HomeHub } from './components/HomeHub';
import { MediaDock } from './components/MediaDock';
import { CommandPalette } from './components/CommandPalette';
import { AudioMixerModal } from './components/AudioMixerModal';
import { ServiceManagerModal } from './components/ServiceManagerModal';
import { SettingsModal } from './components/SettingsModal';
import {
  CloseIcon,
  MoreDotsIcon,
  SearchIcon,
  SlidersIcon,
  SplitIcon,
  StarIcon,
  WindowMaxIcon,
  WindowMinIcon,
  WindowRestoreIcon,
} from './components/Icons';

type ModalState = 'none' | 'settings' | 'manage' | 'palette' | 'mixer';

export function App() {
  const api = useMemo(() => getOmniDeckApi(), []);
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null);
  const [modal, setModal] = useState<ModalState>('none');
  const [tempBrowserBarOpen, setTempBrowserBarOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void api.getSnapshot().then((initial) => {
      if (active) setSnapshot(initial);
    });

    const unsubSnapshot = api.subscribe((next) => {
      setSnapshot(next);
    });

    const unsubCmd = api.onUiCommand((cmd) => {
      if (cmd.type === 'open-settings') setModal('settings');
      if (cmd.type === 'open-service-manager') setModal('manage');
      if (cmd.type === 'open-command-palette') setModal((cur) => (cur === 'palette' ? 'none' : 'palette'));
      if (cmd.type === 'open-audio-mixer') setModal((cur) => (cur === 'mixer' ? 'none' : 'mixer'));
      if (cmd.type === 'toggle-browser-bar') setTempBrowserBarOpen((v) => !v);
      if (cmd.type === 'close-overlays') setModal('none');
    });

    return () => {
      active = false;
      unsubSnapshot();
      unsubCmd();
    };
  }, [api]);

  useEffect(() => {
    const theme = snapshot?.config.settings.theme ?? 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, [snapshot?.config.settings.theme]);

  useEffect(() => {
    void api.setOverlayOpen(modal !== 'none');
  }, [api, modal]);

  const showBrowserBar = Boolean(
    snapshot &&
      !snapshot.homeActive &&
      (snapshot.config.settings.appChromeMode === 'classic' || tempBrowserBarOpen),
  );

  const showMediaDock = Boolean(
    snapshot && (snapshot.nowPlaying.serviceId || snapshot.sleepTimer.active),
  );

  // Sync exact frameless chrome insets (top, left, bottom MediaDock) to Electron ViewManager
  useEffect(() => {
    if (!snapshot) return;
    const isTop = snapshot.config.settings.navPosition === 'top';
    const topBarHeight = isTop ? 46 : 38;
    const browserStripHeight = showBrowserBar ? 38 : 0;
    const bottomDockHeight = showMediaDock ? 48 : 0;

    void api.setChromeInsets({
      top: topBarHeight + browserStripHeight,
      left: isTop ? 0 : 70,
      bottom: bottomDockHeight,
      splitDividerWidth: 8,
      splitHeaderHeight: 34,
    });
  }, [api, snapshot?.config.settings.navPosition, showBrowserBar, showMediaDock]);

  // Keyboard shortcuts when renderer has focus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal !== 'none') {
        setModal('none');
        return;
      }
      if (!snapshot) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const keyLower = e.key.toLowerCase();
      if (keyLower === 'k') {
        e.preventDefault();
        setModal((cur) => (cur === 'palette' ? 'none' : 'palette'));
      } else if (e.key === '0') {
        e.preventDefault();
        void api.openHome();
      } else if (keyLower === 'b') {
        e.preventDefault();
        setTempBrowserBarOpen((v) => !v);
      } else if (e.shiftKey && keyLower === 'v') {
        e.preventDefault();
        setModal((cur) => (cur === 'mixer' ? 'none' : 'mixer'));
      } else if (e.key >= '1' && e.key <= '9') {
        const visible = getVisibleServices(snapshot.config);
        const target = visible[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          void api.selectService(target.id);
        }
      } else if (e.key === '\\') {
        e.preventDefault();
        void api.toggleSplitView();
      } else if (e.key === ',') {
        e.preventDefault();
        setModal('settings');
      } else if (e.shiftKey && keyLower === 'l') {
        e.preventDefault();
        const nextNav = snapshot.config.settings.navPosition === 'top' ? 'left' : 'top';
        void api.updateSettings({ navPosition: nextNav });
      } else if (e.shiftKey && keyLower === 'p') {
        e.preventDefault();
        void api.triggerPip(snapshot.config.activeServiceId);
      } else if (e.shiftKey && keyLower === 't') {
        e.preventDefault();
        void api.toggleAlwaysOnTop();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [api, modal, snapshot]);

  if (!snapshot) {
    return (
      <div className="shell shell--top" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--ink-secondary)' }}>Starting OmniDeck…</span>
      </div>
    );
  }

  const {
    config,
    runtime,
    nowPlaying,
    sleepTimer,
    update,
    drm,
    homeActive,
    alwaysOnTop,
    isMaximized,
    totalBlockedRequests,
    toastMessage,
  } = snapshot;

  const visibleServices = getVisibleServices(config);
  const activeService =
    config.services.find((s) => s.id === config.activeServiceId) ?? visibleServices[0];
  const activeRuntime = runtime[activeService.id] ?? createInitialRuntimeState(activeService);

  const secondaryService =
    config.splitView.enabled && config.splitView.secondaryServiceId
      ? (config.services.find((s) => s.id === config.splitView.secondaryServiceId) ?? null)
      : null;
  const secondaryRuntime = secondaryService
    ? (runtime[secondaryService.id] ?? createInitialRuntimeState(secondaryService))
    : null;

  const isTop = config.settings.navPosition === 'top';

  const handleUpdateClick = () => {
    if (update.phase === 'downloaded') {
      void api.installUpdate();
    } else if (update.phase === 'available') {
      void api.openReleasePage();
    } else {
      setModal('settings');
    }
  };

  const handleToggleBrowserBar = () => {
    if (config.settings.appChromeMode === 'classic') {
      void api.updateSettings({ appChromeMode: 'zen' });
      setTempBrowserBarOpen(false);
    } else {
      setTempBrowserBarOpen((v) => !v);
    }
  };

  const navBar = (
    <NavBar
      position={config.settings.navPosition}
      services={visibleServices}
      runtime={runtime}
      workspaces={config.workspaces}
      activeWorkspaceId={config.activeWorkspaceId}
      activeServiceId={activeService.id}
      homeActive={homeActive}
      splitEnabled={config.splitView.enabled}
      secondaryServiceId={config.splitView.secondaryServiceId}
      doNotDisturb={config.settings.doNotDisturb}
      browserBarVisible={showBrowserBar}
      isMaximized={isMaximized}
      toastMessage={toastMessage}
      update={update}
      onOpenHome={() => void api.openHome()}
      onSelectService={(id) => void api.selectService(id)}
      onSelectWorkspace={(wsId) => void api.applyWorkspace(wsId)}
      onToggleMute={(id) => void api.toggleMute(id)}
      onToggleDnd={() =>
        void api.updateSettings({ doNotDisturb: !config.settings.doNotDisturb })
      }
      onToggleBrowserBar={handleToggleBrowserBar}
      onPinCurrentPage={() => void api.pinCurrentPage(activeService.id)}
      onOpenCommandPalette={() => setModal('palette')}
      onOpenMixer={() => setModal('mixer')}
      onInstallOrOpenUpdate={handleUpdateClick}
      onReorderById={(draggedId, targetId) => void api.moveServiceById(draggedId, targetId)}
      onToggleSplit={() => void api.toggleSplitView()}
      onToggleNavPosition={() =>
        void api.updateSettings({ navPosition: isTop ? 'left' : 'top' })
      }
      onOpenManageApps={() => setModal('manage')}
      onOpenSettings={() => setModal('settings')}
      onWindowMinimize={() => void api.windowMinimize()}
      onWindowToggleMaximize={() => void api.windowToggleMaximize()}
      onWindowClose={() => void api.windowClose()}
    />
  );

  return (
    <div className={`shell ${isTop ? 'shell--top' : 'shell--left'}`}>
      {!isTop && navBar}

      <div className="shell__main">
        {isTop ? (
          navBar
        ) : (
          /* Sleek 38px native frameless top strip in Left Rail mode */
          <header
            className="rail-titlebar"
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest('button, select')) return;
              void api.windowToggleMaximize();
            }}
          >
            <div className="rail-titlebar__left no-drag">
              <select
                aria-label="Switch workspace preset"
                className="workspace-select"
                value={config.activeWorkspaceId}
                onChange={(e) => void api.applyWorkspace(e.target.value)}
              >
                {config.workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
              <span className="rail-titlebar__title">
                {homeActive ? 'OmniDeck Home' : activeService.name}
              </span>
            </div>

            <div className="topbar__drag-spacer">
              {toastMessage && <span className="toast-pill">{toastMessage}</span>}
            </div>

            <div className="topbar__actions no-drag">
              <button
                type="button"
                className="pill-btn"
                title="Universal Search & Command Palette (Ctrl+K)"
                onClick={() => setModal('palette')}
              >
                <SearchIcon size={12} />
                <kbd className="kbd--subtle">Ctrl+K</kbd>
              </button>
              {!homeActive && (
                <button
                  type="button"
                  className="icon-btn"
                  title="Pin current page to Home Favorites"
                  onClick={() => void api.pinCurrentPage(activeService.id)}
                >
                  <StarIcon size={13} />
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                title="Audio Mixer & Sleep Timer (Ctrl+Shift+V)"
                onClick={() => setModal('mixer')}
              >
                <SlidersIcon size={14} />
              </button>
              <button
                type="button"
                className={`icon-btn ${showBrowserBar ? 'icon-btn--active' : ''}`}
                title="Show/Hide Browser Controls (Ctrl+B)"
                onClick={handleToggleBrowserBar}
              >
                <MoreDotsIcon size={14} />
              </button>
              <button
                type="button"
                className={`icon-btn ${config.splitView.enabled ? 'icon-btn--active' : ''}`}
                title="Toggle Split View (Ctrl+\)"
                onClick={() => void api.toggleSplitView()}
              >
                <SplitIcon size={14} />
              </button>
              <div className="win-controls">
                <button
                  type="button"
                  className="win-btn"
                  aria-label="Minimize"
                  onClick={() => void api.windowMinimize()}
                >
                  <WindowMinIcon />
                </button>
                <button
                  type="button"
                  className="win-btn"
                  aria-label={isMaximized ? 'Restore' : 'Maximize'}
                  onClick={() => void api.windowToggleMaximize()}
                >
                  {isMaximized ? <WindowRestoreIcon /> : <WindowMaxIcon />}
                </button>
                <button
                  type="button"
                  className="win-btn win-btn--close"
                  aria-label="Close"
                  onClick={() => void api.windowClose()}
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            </div>
          </header>
        )}

        {showBrowserBar && (
          <ControlStrip
            service={activeService}
            runtime={activeRuntime}
            drm={drm}
            shareGoogleSession={config.settings.shareGoogleSession}
            adBlockerGlobalEnabled={config.settings.adBlockerEnabled}
            alwaysOnTop={alwaysOnTop}
            onBack={() => void api.goBack(activeService.id)}
            onForward={() => void api.goForward(activeService.id)}
            onReload={(hard) => void api.reload(activeService.id, hard)}
            onHome={() => void api.goHome(activeService.id)}
            onPinFavorite={() => void api.pinCurrentPage(activeService.id)}
            onToggleMute={() => void api.toggleMute(activeService.id)}
            onSetZoom={(z) => void api.setZoom(activeService.id, z)}
            onHibernate={() => void api.hibernateService(activeService.id)}
            onWake={() => void api.wakeService(activeService.id)}
            onOpenExternal={() => void api.openExternal(activeService.id)}
            onTriggerPip={() => void api.triggerPip(activeService.id)}
            onToggleAlwaysOnTop={() => void api.toggleAlwaysOnTop()}
            onToggleServiceAdBlock={() => void api.toggleServiceAdBlock(activeService.id)}
          />
        )}

        {homeActive ? (
          <HomeHub
            services={visibleServices}
            allServices={config.services}
            runtime={runtime}
            workspaces={config.workspaces}
            activeWorkspaceId={config.activeWorkspaceId}
            pinnedFavorites={config.pinnedFavorites}
            recentActivity={config.recentActivity}
            sleepTimer={sleepTimer}
            onSelectService={(id) => void api.selectService(id)}
            onOpenInSplit={(id) => void api.toggleSplitView(true, id)}
            onOpenUrlInService={(id, url) => void api.openServiceUrl(id, url)}
            onSearchInService={(id, q) => void api.searchInService(id, q)}
            onRemoveFavorite={(favId) => void api.removeFavorite(favId)}
            onClearRecent={() => void api.clearRecentActivity()}
            onApplyWorkspace={(wsId) => void api.applyWorkspace(wsId)}
            onSetSleepTimer={(mins) => void api.setSleepTimer(mins)}
            onOpenMixer={() => setModal('mixer')}
            onOpenCommandPalette={() => setModal('palette')}
          />
        ) : (
          <SplitStage
            primaryService={activeService}
            primaryRuntime={activeRuntime}
            secondaryService={secondaryService}
            secondaryRuntime={secondaryRuntime}
            visibleServices={visibleServices}
            shareGoogleSession={config.settings.shareGoogleSession}
            splitEnabled={config.splitView.enabled}
            splitRatio={config.splitView.ratio}
            onSetSplitRatio={(ratio) => void api.setSplitRatio(ratio)}
            onSelectSecondary={(id) => void api.setSplitSecondary(id)}
            onSwapPanes={() => void api.swapSplitPanes()}
            onCloseSplit={() => void api.toggleSplitView(false)}
            onReload={(id) => void api.reload(id)}
            onToggleMute={(id) => void api.toggleMute(id)}
            onHibernate={(id) => void api.hibernateService(id)}
            onWake={(id) => void api.wakeService(id)}
            onOpenExternal={(id) => void api.openExternal(id)}
          />
        )}

        {showMediaDock && (
          <MediaDock
            nowPlaying={nowPlaying}
            sleepTimer={sleepTimer}
            services={config.services}
            alwaysOnTop={alwaysOnTop}
            onSelectService={(id) => void api.selectService(id)}
            onPlayPause={(id) => void api.mediaPlayPause(id)}
            onPrevious={(id) => void api.mediaPrevious(id)}
            onNext={(id) => void api.mediaNext(id)}
            onResumeAutoPaused={() => void api.resumeAutoPaused()}
            onToggleMute={(id) => void api.toggleMute(id)}
            onSetVolume={(id, vol) => void api.setVolume(id, vol)}
            onOpenMixer={() => setModal('mixer')}
            onTriggerPip={() => void api.triggerPip(activeService.id)}
            onToggleAlwaysOnTop={() => void api.toggleAlwaysOnTop()}
          />
        )}
      </div>

      {modal === 'palette' && (
        <CommandPalette
          services={visibleServices}
          allServices={config.services}
          activeServiceId={activeService.id}
          workspaces={config.workspaces}
          pinnedFavorites={config.pinnedFavorites}
          recentActivity={config.recentActivity}
          onClose={() => setModal('none')}
          onOpenHome={() => void api.openHome()}
          onSelectService={(id) => void api.selectService(id)}
          onSearchInService={(id, q) => void api.searchInService(id, q)}
          onOpenUrlInService={(id, url) => void api.openServiceUrl(id, url)}
          onApplyWorkspace={(wsId) => void api.applyWorkspace(wsId)}
          onPinCurrent={() => void api.pinCurrentPage(activeService.id)}
          onToggleSplit={() => void api.toggleSplitView()}
          onToggleChromeMode={handleToggleBrowserBar}
          onToggleNavPosition={() =>
            void api.updateSettings({ navPosition: isTop ? 'left' : 'top' })
          }
          onToggleAlwaysOnTop={() => void api.toggleAlwaysOnTop()}
          onTriggerPip={() => void api.triggerPip(activeService.id)}
          onOpenMixer={() => setModal('mixer')}
          onSetSleepTimer={(mins) => void api.setSleepTimer(mins)}
          onHibernateInactive={() => void api.hibernateInactive()}
          onOpenManageApps={() => setModal('manage')}
          onOpenSettings={() => setModal('settings')}
          onCheckUpdates={() => void api.checkForUpdates()}
        />
      )}

      {modal === 'mixer' && (
        <AudioMixerModal
          services={visibleServices}
          runtime={runtime}
          sleepTimer={sleepTimer}
          onClose={() => setModal('none')}
          onSetVolume={(id, vol) => void api.setVolume(id, vol)}
          onToggleMute={(id) => void api.toggleMute(id)}
          onMuteAll={() => void api.muteAll()}
          onPlayPause={(id) => void api.mediaPlayPause(id)}
          onSetSleepTimer={(mins) => void api.setSleepTimer(mins)}
        />
      )}

      {modal === 'manage' && (
        <ServiceManagerModal
          services={config.services}
          onClose={() => setModal('none')}
          onAddCustom={async (input) => {
            await api.addCustomService(input);
          }}
          onToggleVisibility={async (id) => {
            await api.toggleServiceVisibility(id);
          }}
          onReorder={async (from, to) => {
            await api.reorderServices(from, to);
          }}
          onRemoveCustom={async (id) => {
            await api.removeCustomService(id);
          }}
        />
      )}

      {modal === 'settings' && (
        <SettingsModal
          settings={config.settings}
          services={config.services}
          workspaces={config.workspaces}
          activeWorkspaceId={config.activeWorkspaceId}
          drm={drm}
          update={update}
          totalBlockedRequests={totalBlockedRequests}
          onClose={() => setModal('none')}
          onUpdateSettings={async (patch) => {
            await api.updateSettings(patch);
          }}
          onClearSession={async (id) => {
            await api.clearServiceSession(id);
          }}
          onResetDefaults={async () => {
            await api.resetDefaults();
          }}
          onApplyWorkspace={async (wsId) => {
            await api.applyWorkspace(wsId);
          }}
          onSaveWorkspace={async (name) => {
            await api.saveCustomWorkspace(name);
          }}
          onDeleteWorkspace={async (wsId) => {
            await api.deleteCustomWorkspace(wsId);
          }}
          onCheckForUpdates={async () => {
            await api.checkForUpdates();
          }}
          onInstallUpdate={async () => {
            await api.installUpdate();
          }}
          onOpenReleasePage={async () => {
            await api.openReleasePage();
          }}
          onExportConfigFile={() => api.exportConfigFile()}
          onImportConfigFile={() => api.importConfigFile()}
          onCopySyncJson={async () => {
            const json = await api.getExportJson();
            await navigator.clipboard.writeText(json);
          }}
          onImportSyncJson={async (rawJson) => {
            await api.importConfigJson(rawJson);
          }}
        />
      )}
    </div>
  );
}
