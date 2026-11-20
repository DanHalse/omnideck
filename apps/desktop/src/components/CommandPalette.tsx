import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PinnedFavorite,
  PowerUpsConfig,
  RecentActivityItem,
  ServiceDefinition,
  WorkspacePreset,
} from '@omnideck/shared';
import { ServiceIcon } from './ServiceIcon';
import { CloseIcon, SearchIcon } from './Icons';

interface PaletteItem {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon?: ServiceDefinition['icon'];
  accentColor?: string;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  services: ServiceDefinition[];
  allServices: ServiceDefinition[];
  activeServiceId: string;
  workspaces: WorkspacePreset[];
  pinnedFavorites: PinnedFavorite[];
  recentActivity: RecentActivityItem[];
  powerUps: PowerUpsConfig;
  audibleDockOpen: boolean;
  onClose: () => void;
  onOpenHome: () => void;
  onSelectService: (serviceId: string) => void;
  onSearchInService: (serviceId: string, query: string) => void;
  onOpenUrlInService: (serviceId: string, url: string) => void;
  onApplyWorkspace: (workspaceId: string) => void;
  onPinCurrent: () => void;
  onToggleSplit: () => void;
  onToggleChromeMode: () => void;
  onToggleNavPosition: () => void;
  onToggleAlwaysOnTop: () => void;
  onTriggerPip: () => void;
  onLikeCurrentTrack: () => void;
  onCloseAudibleDock: () => void;
  onOpenMixer: () => void;
  onOpenEqualizer: () => void;
  onToggleNowPlayingDrawer: () => void;
  onOpenNowPlayingStage: () => void;
  onToggleMiniPlayer: () => void;
  onSetSleepTimer: (minutes: number) => void;
  onHibernateInactive: () => void;
  onHibernateHeavyTabs: () => void;
  onTogglePowerUp: (key: keyof PowerUpsConfig) => void;
  onOpenManageApps: () => void;
  onOpenSettings: () => void;
  onCheckUpdates: () => void;
}

export function CommandPalette({
  services,
  allServices,
  activeServiceId,
  workspaces,
  pinnedFavorites,
  recentActivity,
  powerUps,
  audibleDockOpen,
  onClose,
  onOpenHome,
  onSelectService,
  onSearchInService,
  onOpenUrlInService,
  onApplyWorkspace,
  onPinCurrent,
  onToggleSplit,
  onToggleChromeMode,
  onToggleNavPosition,
  onToggleAlwaysOnTop,
  onTriggerPip,
  onLikeCurrentTrack,
  onCloseAudibleDock,
  onOpenMixer,
  onOpenEqualizer,
  onToggleNowPlayingDrawer,
  onOpenNowPlayingStage,
  onToggleMiniPlayer,
  onSetSleepTimer,
  onHibernateInactive,
  onHibernateHeavyTabs,
  onTogglePowerUp,
  onOpenManageApps,
  onOpenSettings,
  onCheckUpdates,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const qLower = q.toLowerCase();
    const list: PaletteItem[] = [];

    // Direct cross-service search commands whenever user types a query
    if (q.length > 0) {
      if (q.startsWith('r/')) {
        list.push({
          id: 'jump-subreddit',
          group: 'Direct Jump',
          title: `Open ${q} in Reddit`,
          subtitle: `https://www.reddit.com/${q}/`,
          icon: 'reddit',
          accentColor: '#FF5414',
          run: () => onSearchInService('reddit', q),
        });
      }

      for (const svc of services) {
        list.push({
          id: `search-${svc.id}`,
          group: 'Search Across Services',
          title: `Search ${svc.name} for "${q}"`,
          subtitle: `Jump directly to ${svc.name} search results`,
          icon: svc.icon,
          accentColor: svc.accentColor,
          run: () => onSearchInService(svc.id, q),
        });
      }
    }

    // Apps & Home
    const appItems: PaletteItem[] = [
      {
        id: 'go-home-hub',
        group: 'Apps',
        title: 'OmniDeck Home Hub',
        subtitle: 'Favorites, continue watching & unified search',
        shortcut: 'Ctrl+0',
        run: onOpenHome,
      },
      ...services.map((svc, idx) => ({
        id: `app-${svc.id}`,
        group: 'Apps',
        title: svc.name,
        subtitle: svc.url,
        icon: svc.icon,
        accentColor: svc.accentColor,
        shortcut: idx < 9 ? `Ctrl+${idx + 1}` : undefined,
        run: () => onSelectService(svc.id),
      })),
    ];

    // Pinned Favorites
    const favItems: PaletteItem[] = pinnedFavorites.map((fav) => {
      const svc = allServices.find((s) => s.id === fav.serviceId);
      return {
        id: `fav-${fav.id}`,
        group: 'Pinned Favorites',
        title: fav.title,
        subtitle: svc?.name ?? fav.serviceId,
        icon: svc?.icon ?? 'globe',
        accentColor: svc?.accentColor,
        run: () => onOpenUrlInService(fav.serviceId, fav.url),
      };
    });

    // Recent Activity
    const recentItems: PaletteItem[] = recentActivity.slice(0, 6).map((item) => {
      const svc = allServices.find((s) => s.id === item.serviceId);
      return {
        id: `rec-${item.id}`,
        group: 'Recent',
        title: item.title,
        subtitle: svc?.name ?? item.serviceId,
        icon: svc?.icon ?? 'globe',
        accentColor: svc?.accentColor,
        run: () => onOpenUrlInService(item.serviceId, item.url),
      };
    });

    // Workspaces
    const wsItems: PaletteItem[] = workspaces.map((ws) => ({
      id: `ws-${ws.id}`,
      group: 'Workspaces',
      title: `Switch Workspace: ${ws.name}`,
      subtitle: ws.splitEnabled ? 'Includes Split View preset' : 'Layout preset',
      run: () => onApplyWorkspace(ws.id),
    }));

    // Native Actions
    const activeSvc = allServices.find((s) => s.id === activeServiceId);
    const commandItems: PaletteItem[] = [
      {
        id: 'cmd-pin-fav',
        group: 'Actions',
        title: `Pin Current ${activeSvc?.name ?? 'Page'} to Home Favorites`,
        subtitle: 'Save for 1-click access from Home & Ctrl+K',
        run: onPinCurrent,
      },
      {
        id: 'cmd-like-track',
        group: 'Actions',
        title: 'Like / Heart Currently Playing Track',
        subtitle: 'Works on Spotify, YouTube Music & YouTube',
        shortcut: powerUps.spotifyLikeShortcut,
        run: onLikeCurrentTrack,
      },
      ...(audibleDockOpen
        ? [
            {
              id: 'cmd-close-audible-dock',
              group: 'Actions',
              title: 'Close Docked Audible Cloud Player',
              subtitle: 'Flushes WhisperSync & returns Library to full width',
              icon: 'audible' as const,
              accentColor: '#F7991C',
              run: onCloseAudibleDock,
            },
          ]
        : []),
      {
        id: 'cmd-artist-hub',
        group: 'Actions',
        title: 'Toggle AI Artist & Discovery Hub Drawer',
        subtitle: 'Artist bio, similar bands, synced lyrics & AI Q&A alongside your music',
        shortcut: 'Ctrl+Shift+N',
        run: onToggleNowPlayingDrawer,
      },
      {
        id: 'cmd-now-playing-stage',
        group: 'Actions',
        title: 'Open Full-Screen Ambient Now Playing Stage',
        subtitle: 'Immersive album-art backdrop with synced lyrics & artist discovery',
        run: onOpenNowPlayingStage,
      },
      {
        id: 'cmd-mini-player',
        group: 'Actions',
        title: 'Toggle Floating Mini-Player HUD',
        subtitle: 'Always-on-top compact desktop widget with live synced lyric line',
        run: onToggleMiniPlayer,
      },
      {
        id: 'cmd-eq',
        group: 'Actions',
        title: 'Open 10-Band Equalizer & Presets',
        subtitle: 'Bass Boost, Rock, Vocal/Podcast, Late Night & custom curves',
        run: onOpenEqualizer,
      },
      {
        id: 'cmd-mixer',
        group: 'Actions',
        title: 'Open Audio Suite — Mixer, Smart Ducking & Sleep Timer',
        subtitle: 'Independent volume sliders, Smart Audio Focus & 10-band EQ',
        shortcut: 'Ctrl+Shift+V',
        run: onOpenMixer,
      },
      {
        id: 'cmd-sleep-30',
        group: 'Actions',
        title: 'Set 30-Minute Sleep Timer',
        subtitle: 'Gently fades out, pauses & rewinds 15s on Audible resume',
        run: () => onSetSleepTimer(30),
      },
      {
        id: 'cmd-split',
        group: 'Actions',
        title: 'Toggle Side-by-Side Split View',
        shortcut: 'Ctrl+\\',
        run: onToggleSplit,
      },
      {
        id: 'cmd-zen',
        group: 'Actions',
        title: 'Toggle Zen App Mode / Classic Browser Bar',
        shortcut: 'Ctrl+B',
        run: onToggleChromeMode,
      },
      {
        id: 'cmd-pip',
        group: 'Actions',
        title: 'Picture-in-Picture Active Video',
        shortcut: 'Ctrl+Shift+P',
        run: onTriggerPip,
      },
      {
        id: 'cmd-ontop',
        group: 'Actions',
        title: 'Toggle Pin Window Always on Top',
        shortcut: 'Ctrl+Shift+T',
        run: onToggleAlwaysOnTop,
      },
      {
        id: 'cmd-nav-pos',
        group: 'Actions',
        title: 'Switch Top Menu Bar / Left Sidebar Rail',
        shortcut: 'Ctrl+Shift+L',
        run: onToggleNavPosition,
      },
      {
        id: 'cmd-sleep-heavy',
        group: 'Actions',
        title: 'Sleep Heavy Idle Tabs (>350 MB RAM)',
        subtitle: 'Preserves scroll position & video timestamp on wake',
        run: onHibernateHeavyTabs,
      },
      {
        id: 'cmd-sleep-idle',
        group: 'Actions',
        title: 'Sleep All Inactive Silent Tabs (Free RAM)',
        run: onHibernateInactive,
      },
      {
        id: 'cmd-manage-apps',
        group: 'Actions',
        title: 'Manage / Add Custom Web Apps',
        shortcut: 'Ctrl+Shift+A',
        run: onOpenManageApps,
      },
      {
        id: 'cmd-settings',
        group: 'Actions',
        title: 'Open OmniDeck Settings & Power-Ups',
        shortcut: 'Ctrl+,',
        run: onOpenSettings,
      },
      {
        id: 'cmd-updates',
        group: 'Actions',
        title: 'Check for OmniDeck Updates',
        run: onCheckUpdates,
      },
      // Quick Power-Up Toggles
      {
        id: 'pu-yt-sponsor',
        group: 'Power-Ups',
        title: `YouTube SponsorBlock: ${powerUps.youtubeSponsorBlock ? 'ON → Turn Off' : 'OFF → Turn On'}`,
        subtitle: 'Auto-skip sponsors, intros & music-video non-music segments',
        icon: 'youtube',
        accentColor: '#FF2D2D',
        run: () => onTogglePowerUp('youtubeSponsorBlock'),
      },
      {
        id: 'pu-yt-shorts',
        group: 'Power-Ups',
        title: `Hide YouTube Shorts: ${powerUps.youtubeHideShorts ? 'ON → Turn Off' : 'OFF → Turn On'}`,
        subtitle: 'Hide Shorts shelves & open /shorts/ in the full video player',
        icon: 'youtube',
        accentColor: '#FF2D2D',
        run: () => onTogglePowerUp('youtubeHideShorts'),
      },
      {
        id: 'pu-tw-emotes',
        group: 'Power-Ups',
        title: `Twitch 7TV/BTTV/FFZ Emotes: ${powerUps.twitchThirdPartyEmotes ? 'ON → Turn Off' : 'OFF → Turn On'}`,
        subtitle: 'Render global & channel third-party emotes in Twitch chat',
        icon: 'twitch',
        accentColor: '#9146FF',
        run: () => onTogglePowerUp('twitchThirdPartyEmotes'),
      },
      {
        id: 'pu-tw-points',
        group: 'Power-Ups',
        title: `Twitch Auto-Claim Channel Points: ${powerUps.twitchAutoClaimPoints ? 'ON → Turn Off' : 'OFF → Turn On'}`,
        subtitle: 'Automatically click +50 bonus chests in Twitch chat',
        icon: 'twitch',
        accentColor: '#9146FF',
        run: () => onTogglePowerUp('twitchAutoClaimPoints'),
      },
      {
        id: 'pu-tw-theater',
        group: 'Power-Ups',
        title: `Twitch Auto Theater Mode: ${powerUps.twitchAutoTheater ? 'ON → Turn Off' : 'OFF → Turn On'}`,
        subtitle: 'Expand Twitch streams automatically to theater layout',
        icon: 'twitch',
        accentColor: '#9146FF',
        run: () => onTogglePowerUp('twitchAutoTheater'),
      },
      {
        id: 'pu-rd-old',
        group: 'Power-Ups',
        title: `Reddit Classic (old.reddit.com): ${powerUps.redditUseOldReddit ? 'ON → Switch to Modern' : 'OFF → Switch to Old Reddit'}`,
        subtitle: 'Toggle between Modern Reddit and Old Reddit instantly',
        icon: 'reddit',
        accentColor: '#FF5414',
        run: () => onTogglePowerUp('redditUseOldReddit'),
      },
      {
        id: 'pu-rd-kbd',
        group: 'Power-Ups',
        title: `Reddit RES-Lite Keyboard Nav (J/K/X/C): ${powerUps.redditKeyboardNav ? 'ON → Turn Off' : 'OFF → Turn On'}`,
        subtitle: 'Navigate posts with J/K, expand with X, open comments with C',
        icon: 'reddit',
        accentColor: '#FF5414',
        run: () => onTogglePowerUp('redditKeyboardNav'),
      },
      {
        id: 'pu-au-dock',
        group: 'Power-Ups',
        title: `Audible Docked Cloud Player: ${powerUps.audibleDockCloudPlayer ? 'ON → Turn Off' : 'OFF → Turn On'}`,
        subtitle: 'Dock Audible Cloud Player side-by-side with your Library',
        icon: 'audible',
        accentColor: '#F7991C',
        run: () => onTogglePowerUp('audibleDockCloudPlayer'),
      },
      {
        id: 'pu-sp-connect',
        group: 'Power-Ups',
        title: `Spotify Connect Keep-Alive: ${powerUps.spotifyKeepConnectAlive ? 'ON → Turn Off' : 'OFF → Turn On'}`,
        subtitle: 'Prevent auto-sleep from disconnecting Spotify Connect',
        icon: 'spotify',
        accentColor: '#1ED760',
        run: () => onTogglePowerUp('spotifyKeepConnectAlive'),
      },
    ];

    const pool = [...appItems, ...favItems, ...wsItems, ...commandItems, ...recentItems];
    const filtered = qLower
      ? pool.filter(
          (item) =>
            item.title.toLowerCase().includes(qLower) ||
            (item.subtitle?.toLowerCase().includes(qLower) ?? false) ||
            item.group.toLowerCase().includes(qLower),
        )
      : pool;

    return [...filtered, ...list];
  }, [
    query,
    services,
    allServices,
    activeServiceId,
    workspaces,
    pinnedFavorites,
    recentActivity,
    powerUps,
    audibleDockOpen,
    onOpenHome,
    onSelectService,
    onSearchInService,
    onOpenUrlInService,
    onApplyWorkspace,
    onPinCurrent,
    onToggleSplit,
    onToggleChromeMode,
    onToggleNavPosition,
    onToggleAlwaysOnTop,
    onTriggerPip,
    onLikeCurrentTrack,
    onCloseAudibleDock,
    onOpenMixer,
    onSetSleepTimer,
    onHibernateInactive,
    onHibernateHeavyTabs,
    onTogglePowerUp,
    onOpenManageApps,
    onOpenSettings,
    onCheckUpdates,
  ]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const executeSelected = (idx: number) => {
    const target = items[idx];
    if (!target) return;
    onClose();
    target.run();
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="OmniDeck Command & Search Palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette">
        <div className="palette__input-row">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            type="text"
            className="palette__input"
            placeholder="Search YouTube, Spotify, Twitch, Reddit, Audible — or run any command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIdx((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                executeSelected(selectedIdx);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Close" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="palette__list" role="listbox">
          {items.slice(0, 14).map((item, idx) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={idx === selectedIdx}
              className={`palette__item ${idx === selectedIdx ? 'palette__item--selected' : ''}`}
              onMouseEnter={() => setSelectedIdx(idx)}
              onClick={() => executeSelected(idx)}
            >
              <div className="palette__item-left">
                {item.icon ? (
                  <ServiceIcon
                    icon={item.icon}
                    size={16}
                    color={item.accentColor ?? 'currentColor'}
                  />
                ) : (
                  <span className="palette__group-dot" />
                )}
                <div className="palette__item-text">
                  <span className="palette__item-title">{item.title}</span>
                  {item.subtitle && (
                    <span className="palette__item-sub">{item.subtitle}</span>
                  )}
                </div>
              </div>
              <div className="palette__item-right">
                <span className="meta-chip">{item.group}</span>
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </div>
            </button>
          ))}
        </div>

        <div className="palette__footer">
          <span>↑↓ Navigate</span>
          <span>↵ Execute</span>
          <span>Esc Close</span>
          <span>Tip: Type <code>r/linux</code> or any song/video title</span>
        </div>
      </div>
    </div>
  );
}
