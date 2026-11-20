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
import { ServiceManagerModal } from './components/ServiceManagerModal';
import { SettingsModal } from './components/SettingsModal';

export function App() {
  const api = useMemo(() => getOmniDeckApi(), []);
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null);
  const [modal, setModal] = useState<'none' | 'settings' | 'manage'>('none');

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

  useEffect(() => {
    if (!snapshot) return;
    const isTop = snapshot.config.settings.navPosition === 'top';
    void api.setChromeInsets({
      top: isTop ? 88 : 44,
      left: isTop ? 0 : 72,
      splitDividerWidth: 8,
      splitHeaderHeight: 36,
    });
  }, [api, snapshot?.config.settings.navPosition]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal !== 'none') {
        setModal('none');
        return;
      }
      if (!snapshot) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key >= '1' && e.key <= '9') {
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
      } else if (e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const nextNav = snapshot.config.settings.navPosition === 'top' ? 'left' : 'top';
        void api.updateSettings({ navPosition: nextNav });
      } else if (e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        void api.triggerPip(snapshot.config.activeServiceId);
      } else if (e.shiftKey && e.key.toLowerCase() === 't') {
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

  const { config, runtime, nowPlaying, update, drm, alwaysOnTop, totalBlockedRequests } = snapshot;
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

  const navBar = (
    <NavBar
      position={config.settings.navPosition}
      services={visibleServices}
      runtime={runtime}
      workspaces={config.workspaces}
      activeWorkspaceId={config.activeWorkspaceId}
      activeServiceId={activeService.id}
      splitEnabled={config.splitView.enabled}
      secondaryServiceId={config.splitView.secondaryServiceId}
      doNotDisturb={config.settings.doNotDisturb}
      update={update}
      onSelectService={(id) => void api.selectService(id)}
      onSelectWorkspace={(wsId) => void api.applyWorkspace(wsId)}
      onToggleMute={(id) => void api.toggleMute(id)}
      onToggleDnd={() =>
        void api.updateSettings({ doNotDisturb: !config.settings.doNotDisturb })
      }
      onInstallOrOpenUpdate={handleUpdateClick}
      onReorderById={(draggedId, targetId) => void api.moveServiceById(draggedId, targetId)}
      onToggleSplit={() => void api.toggleSplitView()}
      onToggleNavPosition={() =>
        void api.updateSettings({ navPosition: isTop ? 'left' : 'top' })
      }
      onOpenManageApps={() => setModal('manage')}
      onOpenSettings={() => setModal('settings')}
    />
  );

  return (
    <div className={`shell ${isTop ? 'shell--top' : 'shell--left'}`}>
      {!isTop && navBar}

      <div className="shell__main">
        {isTop && navBar}

        <ControlStrip
          navPosition={config.settings.navPosition}
          service={activeService}
          allServices={config.services}
          runtime={activeRuntime}
          nowPlaying={nowPlaying}
          drm={drm}
          shareGoogleSession={config.settings.shareGoogleSession}
          adBlockerGlobalEnabled={config.settings.adBlockerEnabled}
          alwaysOnTop={alwaysOnTop}
          splitEnabled={config.splitView.enabled}
          onBack={() => void api.goBack(activeService.id)}
          onForward={() => void api.goForward(activeService.id)}
          onReload={(hard) => void api.reload(activeService.id, hard)}
          onHome={() => void api.goHome(activeService.id)}
          onToggleMute={() => void api.toggleMute(activeService.id)}
          onSetZoom={(z) => void api.setZoom(activeService.id, z)}
          onHibernate={() => void api.hibernateService(activeService.id)}
          onWake={() => void api.wakeService(activeService.id)}
          onToggleSplit={() => void api.toggleSplitView()}
          onOpenExternal={() => void api.openExternal(activeService.id)}
          onSelectService={(id) => void api.selectService(id)}
          onMediaPlayPause={(id) => void api.mediaPlayPause(id)}
          onMediaNext={(id) => void api.mediaNext(id)}
          onMediaPrevious={(id) => void api.mediaPrevious(id)}
          onResumeAutoPaused={() => void api.resumeAutoPaused()}
          onTriggerPip={() => void api.triggerPip(activeService.id)}
          onToggleAlwaysOnTop={() => void api.toggleAlwaysOnTop()}
          onToggleServiceAdBlock={() => void api.toggleServiceAdBlock(activeService.id)}
        />

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
      </div>

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
