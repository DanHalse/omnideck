import {
  GOOGLE_SHARED_SERVICE_IDS,
  type DrmStatus,
  type ServiceDefinition,
  type ServiceRuntimeState,
} from '@omnideck/shared';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  HomeIcon,
  MoonIcon,
  PinIcon,
  PipIcon,
  ReloadIcon,
  ShieldIcon,
  StarIcon,
  VolumeIcon,
  VolumeOffIcon,
  WakeIcon,
} from './Icons';

interface ControlStripProps {
  service: ServiceDefinition;
  runtime: ServiceRuntimeState;
  drm: DrmStatus;
  shareGoogleSession: boolean;
  adBlockerGlobalEnabled: boolean;
  alwaysOnTop: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: (hard?: boolean) => void;
  onHome: () => void;
  onPinFavorite: () => void;
  onToggleMute: () => void;
  onSetZoom: (zoom: number) => void;
  onHibernate: () => void;
  onWake: () => void;
  onOpenExternal: () => void;
  onTriggerPip: () => void;
  onToggleAlwaysOnTop: () => void;
  onToggleServiceAdBlock: () => void;
}

/**
 * Slim on-demand Browser & Page Tools strip.
 * Hidden by default in Zen App Mode so OmniDeck feels like a pure native app;
 * toggled instantly with `Ctrl+B` or the `•••` button, or pinned in Classic Mode.
 */
export function ControlStrip({
  service,
  runtime,
  drm,
  shareGoogleSession,
  adBlockerGlobalEnabled,
  alwaysOnTop,
  onBack,
  onForward,
  onReload,
  onHome,
  onPinFavorite,
  onToggleMute,
  onSetZoom,
  onHibernate,
  onWake,
  onOpenExternal,
  onTriggerPip,
  onToggleAlwaysOnTop,
  onToggleServiceAdBlock,
}: ControlStripProps) {
  const isGoogleShared = shareGoogleSession && GOOGLE_SHARED_SERVICE_IDS.has(service.id);
  const zoomPercent = Math.round((runtime.zoomFactor || 1) * 100);
  const shieldActive = adBlockerGlobalEnabled && service.adBlockEnabled !== false;

  return (
    <div className="control-strip" role="toolbar" aria-label={`${service.name} page tools`}>
      <div className="control-group">
        <button
          type="button"
          id="btn-nav-back"
          className="icon-btn"
          disabled={!runtime.canGoBack}
          title="Back (Alt+Left)"
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </button>
        <button
          type="button"
          id="btn-nav-forward"
          className="icon-btn"
          disabled={!runtime.canGoForward}
          title="Forward (Alt+Right)"
          onClick={onForward}
        >
          <ArrowRightIcon />
        </button>
        <button
          type="button"
          id="btn-nav-reload"
          className="icon-btn"
          title="Reload (Ctrl+R • Shift-click for hard reload)"
          onClick={(e) => onReload(e.shiftKey)}
        >
          <ReloadIcon />
        </button>
        <button
          type="button"
          id="btn-nav-home"
          className="icon-btn"
          title={`Go to ${service.name} home`}
          onClick={onHome}
        >
          <HomeIcon />
        </button>
      </div>

      <div className="url-pill" title={runtime.currentUrl || service.url}>
        <span className="url-pill__service">{service.name}</span>
        <span className="url-pill__sep">/</span>
        <span className="url-pill__url">{runtime.currentUrl || service.url}</span>

        {isGoogleShared && (
          <span className="meta-chip" title="YouTube & YouTube Music share one persistent Google login">
            Google Sync
          </span>
        )}

        {service.requiresDrm && (
          <span
            className={`meta-chip ${drm.widevineReady ? 'meta-chip--drm' : 'meta-chip--drm-warn'}`}
            title={drm.message}
          >
            {drm.widevineReady ? 'Widevine DRM' : 'DRM Inactive'}
          </span>
        )}
      </div>

      <div className="control-group">
        <button
          type="button"
          className="icon-btn"
          title="Pin this page to Home Favorites"
          onClick={onPinFavorite}
        >
          <StarIcon size={13} />
        </button>

        <button
          type="button"
          id="btn-adblock-toggle"
          className={`pill-btn ${shieldActive ? 'pill-btn--shield-on' : ''}`}
          title={
            !adBlockerGlobalEnabled
              ? 'Ad & Tracker Shield is disabled globally in Settings'
              : shieldActive
                ? `Ad & Tracker Shield ON for ${service.name} (${runtime.blockedRequests} blocked) — click to disable`
                : `Ad & Tracker Shield paused for ${service.name} — click to enable`
          }
          disabled={!adBlockerGlobalEnabled}
          onClick={onToggleServiceAdBlock}
        >
          <ShieldIcon size={12} />
          <span>{runtime.blockedRequests}</span>
        </button>

        <button
          type="button"
          id="btn-pip-video"
          className="icon-btn"
          title="Pop out video into Picture-in-Picture (Ctrl+Shift+P)"
          onClick={onTriggerPip}
        >
          <PipIcon size={14} />
        </button>

        <button
          type="button"
          id="btn-pin-ontop"
          className={`icon-btn ${alwaysOnTop ? 'icon-btn--active' : ''}`}
          title={
            alwaysOnTop
              ? 'Window pinned Always on Top (Ctrl+Shift+T to unpin)'
              : 'Pin OmniDeck Always on Top (Ctrl+Shift+T)'
          }
          onClick={onToggleAlwaysOnTop}
        >
          <PinIcon size={13} />
        </button>

        <div className="zoom-control" aria-label="Page Zoom">
          <button
            type="button"
            id="btn-zoom-out"
            className="icon-btn icon-btn--sm"
            title="Zoom out"
            onClick={() => onSetZoom((runtime.zoomFactor || 1) - 0.1)}
          >
            −
          </button>
          <button
            type="button"
            id="btn-zoom-reset"
            className="zoom-control__value"
            title="Reset zoom to 100%"
            onClick={() => onSetZoom(1.0)}
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            id="btn-zoom-in"
            className="icon-btn icon-btn--sm"
            title="Zoom in"
            onClick={() => onSetZoom((runtime.zoomFactor || 1) + 0.1)}
          >
            +
          </button>
        </div>

        <button
          type="button"
          id="btn-mute-active"
          className={`icon-btn ${runtime.muted ? 'icon-btn--danger' : ''}`}
          title={runtime.muted ? `Unmute ${service.name} (Ctrl+M)` : `Mute ${service.name} (Ctrl+M)`}
          onClick={onToggleMute}
        >
          {runtime.muted ? <VolumeOffIcon /> : <VolumeIcon />}
        </button>

        {runtime.hibernated ? (
          <button
            type="button"
            id="btn-wake-active"
            className="pill-btn pill-btn--primary"
            title={`Wake ${service.name}`}
            onClick={onWake}
          >
            <WakeIcon size={12} />
            <span>Wake</span>
          </button>
        ) : (
          <button
            type="button"
            id="btn-sleep-active"
            className="icon-btn"
            title={`Sleep ${service.name} tab to free RAM (keeps login)`}
            onClick={onHibernate}
          >
            <MoonIcon />
          </button>
        )}

        <button
          type="button"
          id="btn-open-external"
          className="icon-btn"
          title="Open current page in default system browser"
          onClick={onOpenExternal}
        >
          <ExternalLinkIcon />
        </button>
      </div>

      {runtime.loading && <div className="control-strip__loading-bar" aria-hidden="true" />}
    </div>
  );
}
