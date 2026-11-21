import { useEffect, useMemo, useState } from 'react';
import {
  createInitialRuntimeState,
  getVisibleServices,
  type DesktopSnapshot,
  type ListeningStatsSummary,
} from '@omnideck/shared';
import { getOmniDeckApi } from './api';
import { NavBar } from './components/NavBar';
import { ControlStrip } from './components/ControlStrip';
import { SplitStage } from './components/SplitStage';
import { HomeHub } from './components/HomeHub';
import { MediaDock } from './components/MediaDock';
import { CommandPalette } from './components/CommandPalette';
import { AudioMixerModal, type AudioMixerTab } from './components/AudioMixerModal';
import { ServiceManagerModal } from './components/ServiceManagerModal';
import { SettingsModal, type SettingsTab } from './components/SettingsModal';
import { NowPlayingHub, type NowPlayingMode } from './components/NowPlayingHub';
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

const DRAWER_WIDTH = 380;

export function App() {
  const api = useMemo(() => getOmniDeckApi(), []);
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null);
  const [modal, setModal] = useState<ModalState>('none');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [mixerTab, setMixerTab] = useState<AudioMixerTab>('mixer');
  const [nowPlayingMode, setNowPlayingMode] = useState<NowPlayingMode>('closed');
  const [listeningStats, setListeningStats] = useState<ListeningStatsSummary | null>(null);
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
      if (cmd.type === 'open-settings') {
        setSettingsTab(cmd.tab ?? 'general');
        setModal('settings');
      }
      if (cmd.type === 'open-service-manager') setModal('manage');
      if (cmd.type === 'open-command-palette') setModal((cur) => (cur === 'palette' ? 'none' : 'palette'));
      if (cmd.type === 'open-audio-mixer') {
        setMixerTab(cmd.tab ?? 'mixer');
        setModal((cur) => (cur === 'mixer' ? 'none' : 'mixer'));
      }
      if (cmd.type === 'toggle-now-playing') {
        if (cmd.mode) {
          setNowPlayingMode((cur) => (cur === cmd.mode ? 'closed' : cmd.mode!));
        } else {
          setNowPlayingMode((cur) => (cur === 'closed' ? 'drawer' : 'closed'));
        }
      }
      if (cmd.type === 'toggle-browser-bar') setTempBrowserBarOpen((v) => !v);
      if (cmd.type === 'close-overlays') {
        setModal('none');
        setNowPlayingMode((cur) => (cur === 'stage' ? 'closed' : cur));
      }
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
    void api.setOverlayOpen(modal !== 'none' || nowPlayingMode === 'stage');
  }, [api, modal, nowPlayingMode]);

  useEffect(() => {
    void api.setNowPlayingHubActive(nowPlayingMode !== 'closed');
  }, [api, nowPlayingMode]);

  // Refresh local listening stats whenever the Home Hub opens
  useEffect(() => {
    if (!snapshot?.homeActive) return;
    let active = true;
    void api.getListeningStats().then((stats) => {
      if (active) setListeningStats(stats);
    });
    return () => {
      active = false;
    };
  }, [api, snapshot?.homeActive]);

  const showBrowserBar = Boolean(
    snapshot &&
      !snapshot.homeActive &&
      (snapshot.config.settings.appChromeMode === 'classic' || tempBrowserBarOpen),
  );

  const showMediaDock = Boolean(
    snapshot &&
      (snapshot.nowPlaying.serviceId ||
        snapshot.sleepTimer.active ||
        nowPlayingMode !== 'closed'),
  );

  const isTopBar = (snapshot?.config.settings.navPosition ?? 'top') === 'top';
  const topBarHeight = isTopBar ? 46 : 38;
  const browserStripHeight = showBrowserBar ? 38 : 0;
  const bottomDockHeight = showMediaDock ? 48 : 0;
  const drawerRightInset =
    nowPlayingMode === 'drawer' && !snapshot?.homeActive ? DRAWER_WIDTH : 0;

  // Sync exact frameless chrome insets (top, left, right drawer, bottom MediaDock) to Electron ViewManager
  useEffect(() => {
    if (!snapshot) return;

    void api.setChromeInsets({
      top: topBarHeight + browserStripHeight,
      left: isTopBar ? 0 : 70,
      right: drawerRightInset,
      bottom: bottomDockHeight,
      splitDividerWidth: 8,
      splitHeaderHeight: 34,
    });
  }, [api, snapshot, isTopBar, topBarHeight, browserStripHeight, bottomDockHeight, drawerRightInset]);

  // Keyboard shortcuts when renderer has focus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modal !== 'none') {
          setModal('none');
          return;
        }
        if (nowPlayingMode === 'stage') {
          setNowPlayingMode('closed');
          return;
        }
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
      } else if (e.shiftKey && keyLower === 'n') {
        e.preventDefault();
        setNowPlayingMode((cur) => (cur === 'closed' ? 'drawer' : 'closed'));
      } else if (e.shiftKey && keyLower === 'v') {
        e.preventDefault();
        setMixerTab('mixer');
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
        setSettingsTab('general');
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
  }, [api, modal, nowPlayingMode, snapshot]);

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
    totalMemoryMb,
    audibleDockOpen,
    miniPlayerOpen,
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
      audibleDockOpen={audibleDockOpen}
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
      onCloseAudibleDock={() => void api.closeAudibleDock()}
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
            <div className="rail-titlebar__left">
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

            <div className="topbar__actions">
              {audibleDockOpen && activeService.id === 'audible' && !homeActive && (
                <button
                  type="button"
                  className="pill-btn"
                  title="Close docked Audible Cloud Player & flush WhisperSync"
                  onClick={() => void api.closeAudibleDock()}
                >
                  <span>Close Player</span>
                </button>
              )}
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
            listeningStats={listeningStats}
            bookNotes={config.settings.bookNotes}
            onSelectService={(id) => void api.selectService(id)}
            onOpenInSplit={(id) => void api.toggleSplitView(true, id)}
            onOpenUrlInService={(id, url) => void api.openServiceUrl(id, url)}
            onSearchInService={(id, q) => void api.searchInService(id, q)}
            onRemoveFavorite={(favId) => void api.removeFavorite(favId)}
            onClearRecent={() => void api.clearRecentActivity()}
            onClearListeningStats={() => {
              void api.clearListeningStats().then((empty) => setListeningStats(empty));
            }}
            onAddBookNote={(input) => void api.addBookNote(input)}
            onRemoveBookNote={(noteId) => void api.removeBookNote(noteId)}
            onApplyWorkspace={(wsId) => void api.applyWorkspace(wsId)}
            onSetSleepTimer={(mins) => void api.setSleepTimer(mins)}
            onOpenMixer={() => {
              setMixerTab('mixer');
              setModal('mixer');
            }}
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

        {nowPlayingMode !== 'closed' && (!homeActive || nowPlayingMode === 'stage') && (
          <NowPlayingHub
            mode={nowPlayingMode}
            nowPlaying={nowPlaying}
            services={config.services}
            aiConfig={config.settings.aiCompanion}
            topOffset={topBarHeight + browserStripHeight}
            bottomOffset={bottomDockHeight}
            onClose={() => setNowPlayingMode('closed')}
            onToggleStageMode={() =>
              setNowPlayingMode((cur) => (cur === 'stage' ? 'drawer' : 'stage'))
            }
            onPlayPause={(id) => void api.mediaPlayPause(id)}
            onPrevious={(id) => void api.mediaPrevious(id)}
            onNext={(id) => void api.mediaNext(id)}
            onSearchInService={(svcId, q) => {
              if (nowPlayingMode === 'stage') setNowPlayingMode('drawer');
              void api.searchInService(svcId, q);
            }}
            onOpenAiSettings={() => {
              setSettingsTab('ai');
              setModal('settings');
            }}
            onLoadDossier={(input) => api.getArtistDossier(input)}
            onLoadBandDetails={(bandName) => api.getBandDetails(bandName)}
            onAskAi={(dossier, q) => api.askMusicAi(dossier, q)}
            onBlockMusic={(input) => void api.blockMusic(input)}
          />
        )}

        {showMediaDock && (
          <MediaDock
            nowPlaying={nowPlaying}
            sleepTimer={sleepTimer}
            services={config.services}
            alwaysOnTop={alwaysOnTop}
            nowPlayingOpen={nowPlayingMode !== 'closed'}
            miniPlayerOpen={miniPlayerOpen}
            onSelectService={(id) => void api.selectService(id)}
            onPlayPause={(id) => void api.mediaPlayPause(id)}
            onPrevious={(id) => void api.mediaPrevious(id)}
            onNext={(id) => void api.mediaNext(id)}
            onResumeAutoPaused={() => void api.resumeAutoPaused()}
            onToggleMute={(id) => void api.toggleMute(id)}
            onSetVolume={(id, vol) => void api.setVolume(id, vol)}
            onOpenMixer={() => {
              setMixerTab('mixer');
              setModal('mixer');
            }}
            onToggleNowPlayingHub={() =>
              setNowPlayingMode((cur) => (cur === 'closed' ? 'drawer' : 'closed'))
            }
            onToggleMiniPlayer={() => void api.toggleMiniPlayer()}
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
          powerUps={config.settings.powerUps}
          audibleDockOpen={audibleDockOpen}
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
          onLikeCurrentTrack={() => void api.mediaLikeTrack()}
          onCloseAudibleDock={() => void api.closeAudibleDock()}
          onOpenMixer={() => {
            setMixerTab('mixer');
            setModal('mixer');
          }}
          onOpenEqualizer={() => {
            setMixerTab('eq');
            setModal('mixer');
          }}
          onToggleNowPlayingDrawer={() =>
            setNowPlayingMode((cur) => (cur === 'drawer' ? 'closed' : 'drawer'))
          }
          onOpenNowPlayingStage={() => setNowPlayingMode('stage')}
          onToggleMiniPlayer={() => void api.toggleMiniPlayer()}
          onSetSleepTimer={(mins) => void api.setSleepTimer(mins)}
          onHibernateInactive={() => void api.hibernateInactive()}
          onHibernateHeavyTabs={() => void api.hibernateHeavyTabs(350)}
          onTogglePowerUp={(key) => {
            const cur = config.settings.powerUps[key];
            if (typeof cur === 'boolean') {
              void api.updatePowerUps({ [key]: !cur });
            }
          }}
          onOpenManageApps={() => setModal('manage')}
          onOpenSettings={() => {
            setSettingsTab('general');
            setModal('settings');
          }}
          onCheckUpdates={() => void api.checkForUpdates()}
        />
      )}

      {modal === 'mixer' && (
        <AudioMixerModal
          initialTab={mixerTab}
          services={visibleServices}
          runtime={runtime}
          sleepTimer={sleepTimer}
          audioFocusMode={config.settings.audioFocusMode}
          audioDuckLevel={config.settings.audioDuckLevel}
          equalizer={config.settings.equalizer}
          onClose={() => setModal('none')}
          onSetVolume={(id, vol) => void api.setVolume(id, vol)}
          onToggleMute={(id) => void api.toggleMute(id)}
          onMuteAll={() => void api.muteAll()}
          onPlayPause={(id) => void api.mediaPlayPause(id)}
          onSetSleepTimer={(mins) => void api.setSleepTimer(mins)}
          onChangeAudioFocusMode={(mode) => void api.updateSettings({ audioFocusMode: mode })}
          onChangeAudioDuckLevel={(level) => void api.updateSettings({ audioDuckLevel: level })}
          onUpdateEqualizer={(patch) => void api.updateEqualizer(patch)}
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
          initialTab={settingsTab}
          settings={config.settings}
          services={config.services}
          runtime={runtime}
          workspaces={config.workspaces}
          activeWorkspaceId={config.activeWorkspaceId}
          drm={drm}
          update={update}
          totalBlockedRequests={totalBlockedRequests}
          totalMemoryMb={totalMemoryMb}
          onClose={() => setModal('none')}
          onUpdateSettings={async (patch) => {
            await api.updateSettings(patch);
          }}
          onUpdatePowerUps={async (patch) => {
            await api.updatePowerUps(patch);
          }}
          onUpdateIntegrations={async (patch) => {
            await api.updateIntegrations(patch);
          }}
          onUnblockMusic={async (entryId) => {
            await api.unblockMusic(entryId);
          }}
          onTestAiConnection={(cfg) => api.testAiConnection(cfg)}
          onRefreshMemory={async () => {
            await api.refreshMemoryMetrics();
          }}
          onHibernateService={async (id) => {
            await api.hibernateService(id);
          }}
          onHibernateInactive={async () => {
            await api.hibernateInactive();
          }}
          onHibernateHeavyTabs={async () => {
            await api.hibernateHeavyTabs(350);
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
