import { useEffect, useRef, useState } from 'react';
import {
  clampSplitRatio,
  resolveElectronPartition,
  type ServiceDefinition,
  type ServiceRuntimeState,
} from '@omnideck/shared';
import { ServiceIcon } from './ServiceIcon';
import {
  CloseIcon,
  ExternalLinkIcon,
  MoonIcon,
  ReloadIcon,
  SwapIcon,
  VolumeIcon,
  VolumeOffIcon,
  WakeIcon,
} from './Icons';
import { isElectronRuntime } from '../api';

interface SplitStageProps {
  primaryService: ServiceDefinition;
  primaryRuntime: ServiceRuntimeState;
  secondaryService: ServiceDefinition | null;
  secondaryRuntime: ServiceRuntimeState | null;
  visibleServices: ServiceDefinition[];
  shareGoogleSession: boolean;
  splitEnabled: boolean;
  splitRatio: number;
  onSetSplitRatio: (ratio: number) => void;
  onSelectSecondary: (id: string) => void;
  onSwapPanes: () => void;
  onCloseSplit: () => void;
  onReload: (id: string) => void;
  onToggleMute: (id: string) => void;
  onHibernate: (id: string) => void;
  onWake: (id: string) => void;
  onOpenExternal: (id: string) => void;
}

export function SplitStage({
  primaryService,
  primaryRuntime,
  secondaryService,
  secondaryRuntime,
  visibleServices,
  shareGoogleSession,
  splitEnabled,
  splitRatio,
  onSetSplitRatio,
  onSelectSecondary,
  onSwapPanes,
  onCloseSplit,
  onReload,
  onToggleMute,
  onHibernate,
  onWake,
  onOpenExternal,
}: SplitStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const isElectron = isElectronRuntime();

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const nextRatio = clampSplitRatio((e.clientX - rect.left) / rect.width);
      onSetSplitRatio(nextRatio);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, onSetSplitRatio]);

  const renderPanePlaceholder = (svc: ServiceDefinition, rt: ServiceRuntimeState) => {
    if (rt.hibernated) {
      return (
        <div className="stage-card">
          <div className="stage-card__icon">
            <ServiceIcon icon={svc.icon} size={26} color={svc.accentColor} />
          </div>
          <h2 className="stage-card__title">{svc.name} is sleeping</h2>
          <p className="stage-card__desc">
            Its tab process was hibernated to free memory. Your login cookies and session remain
            saved on disk.
          </p>
          <div className="stage-card__actions">
            <button
              type="button"
              className="pill-btn pill-btn--primary"
              onClick={() => onWake(svc.id)}
            >
              <WakeIcon size={13} />
              <span>Wake {svc.name}</span>
            </button>
          </div>
        </div>
      );
    }

    // In Electron, the live native WebContentsView paints cleanly over this pane.
    if (isElectron) {
      return null;
    }

    // In standalone browser preview mode (`npm run dev:desktop:web`), show a clean interactive stage card.
    const partition = resolveElectronPartition(svc, shareGoogleSession);
    return (
      <div className="stage-card">
        <div className="stage-card__icon">
          <ServiceIcon icon={svc.icon} size={28} color={svc.accentColor} />
        </div>
        <h2 className="stage-card__title">{svc.name}</h2>
        <p className="stage-card__desc">
          Live persistent WebContentsView mounts here inside the OmniDeck Electron desktop app
          (standard browsers block cross-origin embeds via <code>X-Frame-Options</code>).
        </p>
        <div className="stage-card__meta">
          <span className="meta-chip">{partition}</span>
          {svc.requiresDrm && <span className="meta-chip meta-chip--drm">Widevine CDM</span>}
          {svc.keepAliveInBackground && <span className="meta-chip">Background Audio</span>}
        </div>
        <div className="stage-card__actions">
          <button
            type="button"
            className="pill-btn pill-btn--primary"
            onClick={() => onOpenExternal(svc.id)}
          >
            <ExternalLinkIcon size={12} />
            <span>Open {svc.shortName}</span>
          </button>
          <button type="button" className="pill-btn" onClick={() => onHibernate(svc.id)}>
            <MoonIcon size={12} />
            <span>Test Sleep</span>
          </button>
        </div>
      </div>
    );
  };

  if (!splitEnabled || !secondaryService || !secondaryRuntime) {
    return (
      <div className="split-stage" ref={stageRef}>
        <div className="split-stage__pane" style={{ width: '100%' }}>
          {renderPanePlaceholder(primaryService, primaryRuntime)}
        </div>
      </div>
    );
  }

  const ratioPct = `${Math.round(clampSplitRatio(splitRatio) * 1000) / 10}%`;
  const secondaryOptions = visibleServices.filter((s) => s.id !== primaryService.id);

  return (
    <>
      <div
        className="split-header"
        style={{
          gridTemplateColumns: `calc(${ratioPct} - 4px) 8px calc(100% - ${ratioPct} - 4px)`,
        }}
      >
        <div className="split-header__pane split-header__pane--left">
          <span className="split-header__title">
            <ServiceIcon icon={primaryService.icon} size={14} color={primaryService.accentColor} />
            <span>{primaryService.name}</span>
            <span className="meta-chip">Primary</span>
          </span>
          <div className="control-group">
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              title="Swap left and right apps"
              onClick={onSwapPanes}
            >
              <SwapIcon />
            </button>
          </div>
        </div>

        <div aria-hidden="true" />

        <div className="split-header__pane">
          <div className="split-header__title">
            <ServiceIcon
              icon={secondaryService.icon}
              size={14}
              color={secondaryService.accentColor}
            />
            <select
              aria-label="Choose split-view secondary app"
              className="split-header__select"
              value={secondaryService.id}
              onChange={(e) => onSelectSecondary(e.target.value)}
            >
              {secondaryOptions.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              title={`Reload ${secondaryService.name}`}
              onClick={() => onReload(secondaryService.id)}
            >
              <ReloadIcon size={12} />
            </button>
            <button
              type="button"
              className={`icon-btn icon-btn--sm ${secondaryRuntime.muted ? 'icon-btn--danger' : ''}`}
              title={secondaryRuntime.muted ? 'Unmute split app' : 'Mute split app'}
              onClick={() => onToggleMute(secondaryService.id)}
            >
              {secondaryRuntime.muted ? <VolumeOffIcon size={12} /> : <VolumeIcon size={12} />}
            </button>
            {secondaryRuntime.hibernated ? (
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                title={`Wake ${secondaryService.name}`}
                onClick={() => onWake(secondaryService.id)}
              >
                <WakeIcon size={12} />
              </button>
            ) : (
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                title={`Sleep ${secondaryService.name}`}
                onClick={() => onHibernate(secondaryService.id)}
              >
                <MoonIcon size={12} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              title="Close Split View (Ctrl+\)"
              onClick={onCloseSplit}
            >
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="split-stage" ref={stageRef}>
        <div
          className="split-stage__pane"
          style={{ width: `calc(${ratioPct} - 4px)` }}
        >
          {renderPanePlaceholder(primaryService, primaryRuntime)}
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize split view"
          title="Drag to resize • Double-click for 50/50"
          className={`split-divider ${dragging ? 'split-divider--dragging' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDoubleClick={() => onSetSplitRatio(0.5)}
        >
          <span className="split-divider__grip" />
        </div>

        <div
          className="split-stage__pane"
          style={{ width: `calc(100% - ${ratioPct} - 4px)` }}
        >
          {renderPanePlaceholder(secondaryService, secondaryRuntime)}
        </div>
      </div>
    </>
  );
}
