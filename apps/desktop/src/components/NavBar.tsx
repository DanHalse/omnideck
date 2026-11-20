import { useState, type DragEvent } from 'react';
import type {
  NavPosition,
  ServiceDefinition,
  ServiceRuntimeState,
  UpdateState,
  WorkspacePreset,
} from '@omnideck/shared';
import { ServiceIcon } from './ServiceIcon';
import {
  BellOffIcon,
  CloseIcon,
  DownloadCloudIcon,
  EqualizerBars,
  LayoutSidebarIcon,
  LayoutTopbarIcon,
  MoonIcon,
  MoreDotsIcon,
  OmniDeckMark,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SlidersIcon,
  SplitIcon,
  StarIcon,
  VolumeOffIcon,
  WindowMaxIcon,
  WindowMinIcon,
  WindowRestoreIcon,
} from './Icons';

interface NavBarProps {
  position: NavPosition;
  services: ServiceDefinition[];
  runtime: Record<string, ServiceRuntimeState>;
  workspaces: WorkspacePreset[];
  activeWorkspaceId: string;
  activeServiceId: string;
  homeActive: boolean;
  splitEnabled: boolean;
  secondaryServiceId: string | null;
  doNotDisturb: boolean;
  browserBarVisible: boolean;
  audibleDockOpen: boolean;
  isMaximized: boolean;
  toastMessage: string | null;
  update: UpdateState;
  onOpenHome: () => void;
  onSelectService: (id: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onToggleMute: (id: string) => void;
  onToggleDnd: () => void;
  onToggleBrowserBar: () => void;
  onCloseAudibleDock: () => void;
  onPinCurrentPage: () => void;
  onOpenCommandPalette: () => void;
  onOpenMixer: () => void;
  onInstallOrOpenUpdate: () => void;
  onReorderById: (draggedId: string, targetId: string) => void;
  onToggleSplit: () => void;
  onToggleNavPosition: () => void;
  onOpenManageApps: () => void;
  onOpenSettings: () => void;
  onWindowMinimize: () => void;
  onWindowToggleMaximize: () => void;
  onWindowClose: () => void;
}

export function NavBar({
  position,
  services,
  runtime,
  workspaces,
  activeWorkspaceId,
  activeServiceId,
  homeActive,
  splitEnabled,
  secondaryServiceId,
  doNotDisturb,
  browserBarVisible,
  audibleDockOpen,
  isMaximized,
  toastMessage,
  update,
  onOpenHome,
  onSelectService,
  onSelectWorkspace,
  onToggleMute,
  onToggleDnd,
  onToggleBrowserBar,
  onCloseAudibleDock,
  onPinCurrentPage,
  onOpenCommandPalette,
  onOpenMixer,
  onInstallOrOpenUpdate,
  onReorderById,
  onToggleSplit,
  onToggleNavPosition,
  onOpenManageApps,
  onOpenSettings,
  onWindowMinimize,
  onWindowToggleMaximize,
  onWindowClose,
}: NavBarProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (id: string) => (e: DragEvent) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (id: string) => (e: DragEvent) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = (targetId: string) => (e: DragEvent) => {
    e.preventDefault();
    const sourceId = draggedId || e.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== targetId) {
      onReorderById(sourceId, targetId);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const showUpdatePill =
    update.phase === 'downloading' ||
    update.phase === 'downloaded' ||
    update.phase === 'available';

  if (position === 'left') {
    return (
      <aside className="sidebar" aria-label="Application Switcher">
        <div className="sidebar__brand">
          <button
            type="button"
            className={`brand-mark__badge ${homeActive ? 'brand-mark__badge--active' : ''}`}
            title="OmniDeck Home Hub (Ctrl+0)"
            onClick={onOpenHome}
          >
            <OmniDeckMark size={16} />
          </button>
        </div>

        <nav className="sidebar__list" role="tablist" aria-orientation="vertical">
          {services.map((svc, idx) => {
            const rt = runtime[svc.id];
            const isActive = !homeActive && svc.id === activeServiceId;
            const isSecondary = !homeActive && splitEnabled && svc.id === secondaryServiceId;
            const isPlaying = Boolean(rt?.audible && !rt?.muted);
            const isMuted = Boolean(rt?.muted);
            const isHibernated = Boolean(rt?.hibernated);
            const badgeCount = !doNotDisturb ? (rt?.badgeCount ?? 0) : 0;
            const shortcut = idx < 9 ? `Ctrl+${idx + 1}` : '';

            return (
              <div
                key={svc.id}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                draggable
                onDragStart={handleDragStart(svc.id)}
                onDragOver={handleDragOver(svc.id)}
                onDrop={handleDrop(svc.id)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectService(svc.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectService(svc.id);
                  }
                }}
                title={`${svc.name}${shortcut ? ` (${shortcut})` : ''}${isPlaying ? ' • Playing audio' : ''}${isHibernated ? ' • Sleeping' : ''}`}
                className={[
                  'rail-item',
                  isActive ? 'rail-item--active' : '',
                  isSecondary ? 'rail-item--secondary' : '',
                  isHibernated ? 'rail-item--hibernated' : '',
                  dragOverId === svc.id ? 'rail-item--drag-over' : '',
                ].join(' ')}
              >
                {(isActive || isSecondary) && (
                  <span
                    className="rail-item__pill"
                    style={{
                      background: svc.accentColor,
                      opacity: isActive ? 1 : 0.45,
                    }}
                  />
                )}
                <ServiceIcon
                  icon={svc.icon}
                  size={18}
                  color={isActive || isSecondary ? svc.accentColor : 'currentColor'}
                />
                <span className="rail-item__short">{svc.shortName}</span>

                {badgeCount > 0 && (
                  <span className="notif-badge notif-badge--rail" title={`${badgeCount} unread`}>
                    {badgeCount}
                  </span>
                )}

                {isPlaying && (
                  <button
                    type="button"
                    className="rail-item__badge"
                    title={`Mute ${svc.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMute(svc.id);
                    }}
                  >
                    <EqualizerBars />
                  </button>
                )}

                {!isPlaying && isMuted && rt?.mounted && (
                  <button
                    type="button"
                    className="rail-item__badge"
                    title={`Unmute ${svc.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMute(svc.id);
                    }}
                  >
                    <VolumeOffIcon size={10} />
                  </button>
                )}

                {isHibernated && (
                  <span className="rail-item__badge" title="Tab sleeping (click to wake)">
                    <MoonIcon size={10} />
                  </span>
                )}
              </div>
            );
          })}

          <button
            type="button"
            id="btn-manage-apps-rail"
            className="rail-item"
            title="Add or manage apps"
            onClick={onOpenManageApps}
          >
            <PlusIcon size={17} />
            <span className="rail-item__short">Apps</span>
          </button>
        </nav>

        <div className="sidebar__footer">
          {showUpdatePill && (
            <button
              type="button"
              className="icon-btn icon-btn--update"
              title={update.message}
              onClick={onInstallOrOpenUpdate}
            >
              <DownloadCloudIcon size={15} />
            </button>
          )}
          <button
            type="button"
            className={`icon-btn ${doNotDisturb ? 'icon-btn--active' : ''}`}
            title={doNotDisturb ? 'Do Not Disturb ON' : 'Enable Do Not Disturb'}
            onClick={onToggleDnd}
          >
            <BellOffIcon size={14} />
          </button>
          <button
            type="button"
            id="btn-switch-layout-rail"
            className="icon-btn"
            title="Switch to Top Menu Bar (Ctrl+Shift+L)"
            onClick={onToggleNavPosition}
          >
            <LayoutTopbarIcon size={15} />
          </button>
          <button
            type="button"
            id="btn-settings-rail"
            className="icon-btn"
            title="Settings (Ctrl+,)"
            onClick={onOpenSettings}
          >
            <SettingsIcon size={15} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <header
      className="topbar topbar--frameless"
      aria-label="Application Switcher"
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button, select, [role="tab"]')) return;
        onWindowToggleMaximize();
      }}
    >
      <div className="brand-mark">
        <button
          type="button"
          id="btn-home-hub"
          className={`brand-mark__badge ${homeActive ? 'brand-mark__badge--active' : ''}`}
          title="OmniDeck Home Hub — Favorites, Continue Listening & Search (Ctrl+0)"
          onClick={onOpenHome}
        >
          <OmniDeckMark size={15} />
        </button>
        <select
          aria-label="Switch workspace preset"
          className="workspace-select"
          value={activeWorkspaceId}
          onChange={(e) => onSelectWorkspace(e.target.value)}
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
      </div>

      <nav className="topbar__tabs" role="tablist" aria-orientation="horizontal">
        {services.map((svc, idx) => {
          const rt = runtime[svc.id];
          const isActive = !homeActive && svc.id === activeServiceId;
          const isSecondary = !homeActive && splitEnabled && svc.id === secondaryServiceId;
          const isPlaying = Boolean(rt?.audible && !rt?.muted);
          const isMuted = Boolean(rt?.muted);
          const isHibernated = Boolean(rt?.hibernated);
          const badgeCount = !doNotDisturb ? (rt?.badgeCount ?? 0) : 0;
          const shortcut = idx < 9 ? `Ctrl+${idx + 1}` : '';

          return (
            <div
              key={svc.id}
              id={`tab-${svc.id}`}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
              draggable
              onDragStart={handleDragStart(svc.id)}
              onDragOver={handleDragOver(svc.id)}
              onDrop={handleDrop(svc.id)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelectService(svc.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectService(svc.id);
                }
              }}
              title={`${svc.name}${shortcut ? ` (${shortcut})` : ''} — drag to reorder`}
              className={[
                'service-tab',
                isActive ? 'service-tab--active' : '',
                isSecondary ? 'service-tab--secondary' : '',
                isHibernated ? 'service-tab--hibernated' : '',
                dragOverId === svc.id ? 'service-tab--drag-over' : '',
              ].join(' ')}
            >
              <span className="service-tab__icon">
                <ServiceIcon
                  icon={svc.icon}
                  size={16}
                  color={isActive || isSecondary ? svc.accentColor : 'currentColor'}
                />
              </span>
              <span className="service-tab__label">{svc.name}</span>

              {badgeCount > 0 && (
                <span className="notif-badge" title={`${badgeCount} unread notifications`}>
                  {badgeCount}
                </span>
              )}

              {isSecondary && <span className="service-tab__split-tag">Split</span>}

              {isPlaying && (
                <button
                  type="button"
                  className="service-tab__status-btn"
                  title={`Playing audio — click to mute ${svc.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMute(svc.id);
                  }}
                >
                  <EqualizerBars />
                </button>
              )}

              {!isPlaying && isMuted && rt?.mounted && (
                <button
                  type="button"
                  className="service-tab__status-btn service-tab__status-btn--muted"
                  title={`Muted — click to unmute ${svc.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMute(svc.id);
                  }}
                >
                  <VolumeOffIcon size={12} />
                </button>
              )}

              {isHibernated && (
                <span className="service-tab__status-btn" title="Tab sleeping to save RAM">
                  <MoonIcon size={12} />
                </span>
              )}

              {isActive && (
                <span className="service-tab__indicator" style={{ background: svc.accentColor }} />
              )}
            </div>
          );
        })}

        <button
          type="button"
          id="btn-manage-apps-top"
          className="icon-btn"
          title="Add, reorder, or hide apps"
          onClick={onOpenManageApps}
        >
          <PlusIcon size={15} />
        </button>
      </nav>

      {/* Drag spacer + subtle inline toast */}
      <div className="topbar__drag-spacer">
        {toastMessage && <span className="toast-pill">{toastMessage}</span>}
      </div>

      <div className="topbar__actions">
        {audibleDockOpen && activeServiceId === 'audible' && !homeActive && (
          <button
            type="button"
            className="pill-btn"
            title="Close docked Audible Cloud Player & flush WhisperSync"
            onClick={onCloseAudibleDock}
          >
            <span>Close Player</span>
          </button>
        )}

        {showUpdatePill && (
          <button
            type="button"
            id="btn-update-banner"
            className="pill-btn pill-btn--update"
            title={update.message}
            onClick={onInstallOrOpenUpdate}
          >
            <DownloadCloudIcon size={12} />
            <span>
              {update.phase === 'downloaded'
                ? `Restart v${update.availableVersion}`
                : update.phase === 'downloading'
                  ? `${update.progressPercent ?? 0}%`
                  : `v${update.availableVersion}`}
            </span>
          </button>
        )}

        <button
          type="button"
          id="btn-command-palette"
          className="pill-btn"
          title="Universal Search & Command Palette (Ctrl+K)"
          onClick={onOpenCommandPalette}
        >
          <SearchIcon size={12} />
          <kbd className="kbd--subtle">Ctrl+K</kbd>
        </button>

        {!homeActive && (
          <button
            type="button"
            id="btn-pin-favorite"
            className="icon-btn"
            title="Pin current page to Home Favorites"
            onClick={onPinCurrentPage}
          >
            <StarIcon size={14} />
          </button>
        )}

        <button
          type="button"
          id="btn-open-mixer"
          className="icon-btn"
          title="Audio Mixer & Sleep Timer (Ctrl+Shift+V)"
          onClick={onOpenMixer}
        >
          <SlidersIcon size={14} />
        </button>

        <button
          type="button"
          id="btn-toggle-browser-bar"
          className={`icon-btn ${browserBarVisible ? 'icon-btn--active' : ''}`}
          title="Show/Hide Browser Controls (Back, URL, Zoom, Shield) — Ctrl+B"
          onClick={onToggleBrowserBar}
        >
          <MoreDotsIcon size={14} />
        </button>

        <button
          type="button"
          id="btn-toggle-split-top"
          className={`icon-btn ${splitEnabled ? 'icon-btn--active' : ''}`}
          title="Toggle side-by-side Split View (Ctrl+\)"
          onClick={onToggleSplit}
        >
          <SplitIcon size={14} />
        </button>

        <button
          type="button"
          id="btn-switch-layout-top"
          className="icon-btn"
          title="Switch to Left Sidebar Rail (Ctrl+Shift+L)"
          onClick={onToggleNavPosition}
        >
          <LayoutSidebarIcon size={14} />
        </button>

        <button
          type="button"
          id="btn-settings-top"
          className="icon-btn"
          title="Settings (Ctrl+,)"
          onClick={onOpenSettings}
        >
          <SettingsIcon size={14} />
        </button>

        <div className="win-controls">
          <button
            type="button"
            className="win-btn"
            aria-label="Minimize"
            title="Minimize"
            onClick={onWindowMinimize}
          >
            <WindowMinIcon />
          </button>
          <button
            type="button"
            className="win-btn"
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
            title={isMaximized ? 'Restore' : 'Maximize'}
            onClick={onWindowToggleMaximize}
          >
            {isMaximized ? <WindowRestoreIcon /> : <WindowMaxIcon />}
          </button>
          <button
            type="button"
            className="win-btn win-btn--close"
            aria-label="Close"
            title="Close (Minimizes to Tray if enabled)"
            onClick={onWindowClose}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      </div>
    </header>
  );
}
