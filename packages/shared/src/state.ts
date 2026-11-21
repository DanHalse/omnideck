import { DEFAULT_SERVICES } from './services.js';
import { DEFAULT_POWER_UPS, mergePowerUpsConfig } from './powerUps.js';
import {
  DEFAULT_AI_COMPANION_CONFIG,
  DEFAULT_EQUALIZER_CONFIG,
  clampDuckLevel,
  mergeAiCompanionConfig,
  mergeEqualizerConfig,
} from './audio.js';
import type {
  AppSettings,
  AudioFocusMode,
  ChromeInsets,
  CustomServiceInput,
  PersistedConfig,
  PinnedFavorite,
  RecentActivityItem,
  ServiceDefinition,
  ServiceRuntimeState,
  StageLayoutMetrics,
  WindowBounds,
  WorkspacePreset,
} from './types.js';

export const APP_VERSION = '1.4.1';
export const GITHUB_REPO_OWNER = 'DanHalse';
export const GITHUB_REPO_NAME = 'omnideck';
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`;

export const DEFAULT_SETTINGS: AppSettings = {
  navPosition: 'top',
  theme: 'dark',
  appChromeMode: 'zen',
  nativePolishCss: true,
  smartLinkRouting: true,
  minimizeToTrayOnClose: true,
  launchAtLogin: false,
  restoreLastPages: true,
  globalSummonShortcut: 'CommandOrControl+Alt+O',
  shareGoogleSession: true,
  backgroundAudioEnabled: true,
  autoHibernateMinutes: 30,
  confirmBeforeQuitWithAudio: false,
  smartAudioSwitching: true,
  audioFocusMode: 'pause',
  audioDuckLevel: 0.15,
  miniPlayerAutoShowOnMinimize: true,
  hardwareMediaKeys: true,
  adBlockerEnabled: true,
  doNotDisturb: false,
  autoCheckUpdates: true,
  hardwareVideoAcceleration: true,
  powerUps: { ...DEFAULT_POWER_UPS },
  equalizer: { ...DEFAULT_EQUALIZER_CONFIG, bands: [...DEFAULT_EQUALIZER_CONFIG.bands] },
  aiCompanion: { ...DEFAULT_AI_COMPANION_CONFIG },
};

export const DEFAULT_WORKSPACES: WorkspacePreset[] = [
  {
    id: 'all',
    name: 'All Media',
    builtIn: true,
    serviceIds: [],
    activeServiceId: 'youtube',
    splitEnabled: false,
    secondaryServiceId: 'reddit',
  },
  {
    id: 'focus-audio',
    name: 'Focus Audio',
    builtIn: true,
    serviceIds: ['spotify', 'youtube-music', 'audible'],
    activeServiceId: 'spotify',
    splitEnabled: false,
    secondaryServiceId: 'audible',
  },
  {
    id: 'watch-chat',
    name: 'Watch & Chat',
    builtIn: true,
    serviceIds: ['youtube', 'twitch', 'reddit'],
    activeServiceId: 'twitch',
    splitEnabled: true,
    secondaryServiceId: 'reddit',
  },
];

export function createDefaultConfig(): PersistedConfig {
  return {
    version: 1,
    services: DEFAULT_SERVICES.map((svc) => ({
      ...svc,
      adBlockEnabled: svc.adBlockEnabled ?? true,
      volume: svc.volume ?? 1.0,
      allowedAuthHosts: svc.allowedAuthHosts ? [...svc.allowedAuthHosts] : undefined,
    })),
    activeServiceId: DEFAULT_SERVICES[0].id,
    splitView: {
      enabled: false,
      secondaryServiceId: 'reddit',
      ratio: 0.5,
    },
    settings: {
      ...DEFAULT_SETTINGS,
      powerUps: { ...DEFAULT_POWER_UPS },
      equalizer: { ...DEFAULT_EQUALIZER_CONFIG, bands: [...DEFAULT_EQUALIZER_CONFIG.bands] },
      aiCompanion: { ...DEFAULT_AI_COMPANION_CONFIG },
    },
    workspaces: DEFAULT_WORKSPACES.map((w) => ({ ...w, serviceIds: [...w.serviceIds] })),
    activeWorkspaceId: 'all',
    pinnedFavorites: [],
    recentActivity: [],
  };
}

export function createInitialRuntimeState(service: ServiceDefinition): ServiceRuntimeState {
  return {
    serviceId: service.id,
    mounted: false,
    hibernated: false,
    loading: false,
    audible: false,
    muted: false,
    volume: clampVolume(service.volume ?? 1.0),
    canGoBack: false,
    canGoForward: false,
    currentUrl: service.lastUrl || service.url,
    pageTitle: service.name,
    zoomFactor: clampZoom(service.zoomFactor ?? 1.0),
    lastActiveAt: 0,
    badgeCount: 0,
    blockedRequests: 0,
  };
}

/**
 * Extracts a leading unread/notification count from a web app page title,
 * e.g. "(3) YouTube" or "[12] Reddit — Dive into anything".
 */
export function extractBadgeCountFromTitle(title: string): number {
  if (!title) return 0;
  const match = title.trim().match(/^[\(\[](\d{1,4})\+?[\)\]]\s*/);
  if (!match) return 0;
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(99, n);
}

/**
 * Normalizes and validates user-provided web app URLs.
 * Allows only `http:` and `https:` protocols to block `javascript:`, `file:`, or `data:` injection.
 */
export function normalizeServiceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('URL cannot be empty.');
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : trimmed.includes(':') && !trimmed.startsWith('localhost') && !/^\d+\.\d+\.\d+\.\d+/.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('Enter a valid web address (e.g. https://example.com).');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http:// and https:// URLs are allowed.');
  }

  return parsed.toString().replace(/\/$/, '') || parsed.origin;
}

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(0.75, Math.max(0.25, Math.round(ratio * 1000) / 1000));
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1.0;
  return Math.min(2.0, Math.max(0.5, Math.round(zoom * 20) / 20));
}

export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1.0;
  return Math.min(1.0, Math.max(0.0, Math.round(volume * 100) / 100));
}

export function getVisibleServices(config: PersistedConfig): ServiceDefinition[] {
  return config.services.filter((s) => !s.hidden);
}

/**
 * Safely hydrates a previously persisted JSON object, upgrading older v1.0/v1.1 configs seamlessly
 * while preserving user ordering, visibility, custom services, workspaces, favorites, and settings.
 */
export function mergePersistedConfig(raw: unknown): PersistedConfig {
  const fallback = createDefaultConfig();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const candidate = raw as Partial<PersistedConfig>;
  const rawAudioFocus = candidate.settings?.audioFocusMode;
  const legacySmartSwitch =
    typeof candidate.settings?.smartAudioSwitching === 'boolean'
      ? candidate.settings.smartAudioSwitching
      : DEFAULT_SETTINGS.smartAudioSwitching;
  const audioFocusMode: AudioFocusMode =
    rawAudioFocus === 'off' || rawAudioFocus === 'pause' || rawAudioFocus === 'duck'
      ? rawAudioFocus
      : legacySmartSwitch
        ? 'pause'
        : 'off';

  const settings: AppSettings = {
    navPosition: candidate.settings?.navPosition === 'left' ? 'left' : 'top',
    theme: candidate.settings?.theme === 'light' ? 'light' : 'dark',
    appChromeMode: candidate.settings?.appChromeMode === 'classic' ? 'classic' : 'zen',
    nativePolishCss:
      typeof candidate.settings?.nativePolishCss === 'boolean'
        ? candidate.settings.nativePolishCss
        : DEFAULT_SETTINGS.nativePolishCss,
    smartLinkRouting:
      typeof candidate.settings?.smartLinkRouting === 'boolean'
        ? candidate.settings.smartLinkRouting
        : DEFAULT_SETTINGS.smartLinkRouting,
    minimizeToTrayOnClose:
      typeof candidate.settings?.minimizeToTrayOnClose === 'boolean'
        ? candidate.settings.minimizeToTrayOnClose
        : DEFAULT_SETTINGS.minimizeToTrayOnClose,
    launchAtLogin:
      typeof candidate.settings?.launchAtLogin === 'boolean'
        ? candidate.settings.launchAtLogin
        : DEFAULT_SETTINGS.launchAtLogin,
    restoreLastPages:
      typeof candidate.settings?.restoreLastPages === 'boolean'
        ? candidate.settings.restoreLastPages
        : DEFAULT_SETTINGS.restoreLastPages,
    globalSummonShortcut:
      typeof candidate.settings?.globalSummonShortcut === 'string' &&
      candidate.settings.globalSummonShortcut.trim()
        ? candidate.settings.globalSummonShortcut.trim()
        : DEFAULT_SETTINGS.globalSummonShortcut,
    shareGoogleSession:
      typeof candidate.settings?.shareGoogleSession === 'boolean'
        ? candidate.settings.shareGoogleSession
        : DEFAULT_SETTINGS.shareGoogleSession,
    backgroundAudioEnabled:
      typeof candidate.settings?.backgroundAudioEnabled === 'boolean'
        ? candidate.settings.backgroundAudioEnabled
        : DEFAULT_SETTINGS.backgroundAudioEnabled,
    autoHibernateMinutes:
      typeof candidate.settings?.autoHibernateMinutes === 'number' &&
      candidate.settings.autoHibernateMinutes >= 0
        ? Math.min(240, Math.floor(candidate.settings.autoHibernateMinutes))
        : DEFAULT_SETTINGS.autoHibernateMinutes,
    confirmBeforeQuitWithAudio:
      typeof candidate.settings?.confirmBeforeQuitWithAudio === 'boolean'
        ? candidate.settings.confirmBeforeQuitWithAudio
        : DEFAULT_SETTINGS.confirmBeforeQuitWithAudio,
    smartAudioSwitching: audioFocusMode !== 'off',
    audioFocusMode,
    audioDuckLevel:
      typeof candidate.settings?.audioDuckLevel === 'number'
        ? clampDuckLevel(candidate.settings.audioDuckLevel)
        : DEFAULT_SETTINGS.audioDuckLevel,
    miniPlayerAutoShowOnMinimize:
      typeof candidate.settings?.miniPlayerAutoShowOnMinimize === 'boolean'
        ? candidate.settings.miniPlayerAutoShowOnMinimize
        : DEFAULT_SETTINGS.miniPlayerAutoShowOnMinimize,
    hardwareMediaKeys:
      typeof candidate.settings?.hardwareMediaKeys === 'boolean'
        ? candidate.settings.hardwareMediaKeys
        : DEFAULT_SETTINGS.hardwareMediaKeys,
    adBlockerEnabled:
      typeof candidate.settings?.adBlockerEnabled === 'boolean'
        ? candidate.settings.adBlockerEnabled
        : DEFAULT_SETTINGS.adBlockerEnabled,
    doNotDisturb:
      typeof candidate.settings?.doNotDisturb === 'boolean'
        ? candidate.settings.doNotDisturb
        : DEFAULT_SETTINGS.doNotDisturb,
    autoCheckUpdates:
      typeof candidate.settings?.autoCheckUpdates === 'boolean'
        ? candidate.settings.autoCheckUpdates
        : DEFAULT_SETTINGS.autoCheckUpdates,
    hardwareVideoAcceleration:
      typeof candidate.settings?.hardwareVideoAcceleration === 'boolean'
        ? candidate.settings.hardwareVideoAcceleration
        : DEFAULT_SETTINGS.hardwareVideoAcceleration,
    powerUps: mergePowerUpsConfig(candidate.settings?.powerUps),
    equalizer: mergeEqualizerConfig(candidate.settings?.equalizer),
    aiCompanion: mergeAiCompanionConfig(candidate.settings?.aiCompanion),
  };

  let services: ServiceDefinition[] = fallback.services;
  if (Array.isArray(candidate.services) && candidate.services.length > 0) {
    const builtInMap = new Map(DEFAULT_SERVICES.map((s) => [s.id, s]));
    const seen = new Set<string>();
    const hydrated: ServiceDefinition[] = [];

    for (const item of candidate.services) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
        continue;
      }
      if (seen.has(item.id)) continue;
      seen.add(item.id);

      const base = builtInMap.get(item.id);
      let validUrl = base?.url ?? '';
      try {
        validUrl = normalizeServiceUrl(item.url ?? validUrl);
      } catch {
        if (!validUrl) continue;
      }

      hydrated.push({
        id: item.id,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : (base?.name ?? item.id),
        shortName:
          typeof item.shortName === 'string' && item.shortName.trim()
            ? item.shortName.trim()
            : (base?.shortName ?? item.name?.slice(0, 10) ?? item.id),
        url: validUrl,
        mobileUrl: item.mobileUrl ? safeOptionalUrl(item.mobileUrl, validUrl) : base?.mobileUrl,
        accentColor:
          typeof item.accentColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(item.accentColor)
            ? item.accentColor
            : (base?.accentColor ?? '#E87A3E'),
        icon: item.icon ?? base?.icon ?? 'globe',
        partition:
          typeof item.partition === 'string' && item.partition.trim()
            ? item.partition.trim()
            : (base?.partition ?? item.id),
        hidden: Boolean(item.hidden),
        builtIn: Boolean(base),
        requiresDrm: item.requiresDrm ?? base?.requiresDrm ?? false,
        keepAliveInBackground:
          typeof item.keepAliveInBackground === 'boolean'
            ? item.keepAliveInBackground
            : (base?.keepAliveInBackground ?? true),
        mobileUserAgentMode:
          item.mobileUserAgentMode === 'desktop' ||
          item.mobileUserAgentMode === 'mobile' ||
          item.mobileUserAgentMode === 'auto'
            ? item.mobileUserAgentMode
            : (base?.mobileUserAgentMode ?? 'mobile'),
        allowedAuthHosts: Array.isArray(item.allowedAuthHosts)
          ? item.allowedAuthHosts.filter((h): h is string => typeof h === 'string')
          : base?.allowedAuthHosts,
        zoomFactor: clampZoom(item.zoomFactor ?? base?.zoomFactor ?? 1.0),
        adBlockEnabled:
          typeof item.adBlockEnabled === 'boolean' ? item.adBlockEnabled : true,
        volume: clampVolume(item.volume ?? 1.0),
        lastUrl:
          typeof item.lastUrl === 'string' && /^https?:\/\//i.test(item.lastUrl)
            ? item.lastUrl
            : undefined,
      });
    }

    for (const def of DEFAULT_SERVICES) {
      if (!seen.has(def.id)) {
        hydrated.push({ ...def, adBlockEnabled: true, volume: 1.0 });
      }
    }

    if (hydrated.length > 0) {
      if (!hydrated.some((s) => !s.hidden)) {
        hydrated[0] = { ...hydrated[0], hidden: false };
      }
      services = hydrated;
    }
  }

  const visible = services.filter((s) => !s.hidden);
  const activeServiceId =
    typeof candidate.activeServiceId === 'string' &&
    visible.some((s) => s.id === candidate.activeServiceId)
      ? candidate.activeServiceId
      : visible[0].id;

  const requestedSecondary = candidate.splitView?.secondaryServiceId ?? null;
  const secondaryValid =
    requestedSecondary &&
    requestedSecondary !== activeServiceId &&
    visible.some((s) => s.id === requestedSecondary);

  const fallbackSecondary = visible.find((s) => s.id !== activeServiceId)?.id ?? null;

  const customWorkspaces: WorkspacePreset[] = [];
  if (Array.isArray(candidate.workspaces)) {
    const builtInWorkspaceIds = new Set(DEFAULT_WORKSPACES.map((w) => w.id));
    const seenW = new Set<string>();
    for (const w of candidate.workspaces) {
      if (
        !w ||
        typeof w !== 'object' ||
        typeof w.id !== 'string' ||
        builtInWorkspaceIds.has(w.id) ||
        seenW.has(w.id)
      ) {
        continue;
      }
      seenW.add(w.id);
      const validIds = Array.isArray(w.serviceIds)
        ? w.serviceIds.filter((sid): sid is string => typeof sid === 'string' && services.some((s) => s.id === sid))
        : [];
      if (validIds.length === 0) continue;
      customWorkspaces.push({
        id: w.id,
        name: typeof w.name === 'string' && w.name.trim() ? w.name.trim().slice(0, 28) : 'Custom',
        builtIn: false,
        serviceIds: validIds,
        activeServiceId: validIds.includes(w.activeServiceId) ? w.activeServiceId : validIds[0],
        splitEnabled: Boolean(w.splitEnabled) && validIds.length >= 2,
        secondaryServiceId:
          w.secondaryServiceId && validIds.includes(w.secondaryServiceId) ? w.secondaryServiceId : null,
      });
    }
  }

  const workspaces = [
    ...DEFAULT_WORKSPACES.map((w) => ({ ...w, serviceIds: [...w.serviceIds] })),
    ...customWorkspaces,
  ];
  const activeWorkspaceId =
    typeof candidate.activeWorkspaceId === 'string' &&
    workspaces.some((w) => w.id === candidate.activeWorkspaceId)
      ? candidate.activeWorkspaceId
      : 'all';

  const pinnedFavorites: PinnedFavorite[] = Array.isArray(candidate.pinnedFavorites)
    ? candidate.pinnedFavorites
        .filter(
          (f): f is PinnedFavorite =>
            Boolean(f) &&
            typeof f === 'object' &&
            typeof f.id === 'string' &&
            typeof f.serviceId === 'string' &&
            typeof f.title === 'string' &&
            typeof f.url === 'string' &&
            /^https?:\/\//i.test(f.url),
        )
        .slice(0, 32)
    : [];

  const recentActivity: RecentActivityItem[] = Array.isArray(candidate.recentActivity)
    ? candidate.recentActivity
        .filter(
          (r): r is RecentActivityItem =>
            Boolean(r) &&
            typeof r === 'object' &&
            typeof r.id === 'string' &&
            typeof r.serviceId === 'string' &&
            typeof r.title === 'string' &&
            typeof r.url === 'string' &&
            /^https?:\/\//i.test(r.url),
        )
        .slice(0, 18)
    : [];

  let windowBounds: WindowBounds | undefined;
  if (
    candidate.windowBounds &&
    typeof candidate.windowBounds === 'object' &&
    typeof candidate.windowBounds.width === 'number' &&
    typeof candidate.windowBounds.height === 'number' &&
    candidate.windowBounds.width >= 600 &&
    candidate.windowBounds.height >= 400
  ) {
    windowBounds = {
      x: typeof candidate.windowBounds.x === 'number' ? candidate.windowBounds.x : undefined,
      y: typeof candidate.windowBounds.y === 'number' ? candidate.windowBounds.y : undefined,
      width: Math.round(candidate.windowBounds.width),
      height: Math.round(candidate.windowBounds.height),
      maximized: Boolean(candidate.windowBounds.maximized),
    };
  }

  return {
    version: 1,
    services,
    activeServiceId,
    splitView: {
      enabled: Boolean(candidate.splitView?.enabled) && Boolean(secondaryValid ? requestedSecondary : fallbackSecondary),
      secondaryServiceId: secondaryValid ? requestedSecondary : fallbackSecondary,
      ratio: clampSplitRatio(candidate.splitView?.ratio ?? 0.5),
    },
    settings,
    workspaces,
    activeWorkspaceId,
    pinnedFavorites,
    recentActivity,
    windowBounds,
  };
}

function safeOptionalUrl(candidate: string, fallback: string): string {
  try {
    return normalizeServiceUrl(candidate);
  } catch {
    return fallback;
  }
}

export function selectActiveService(config: PersistedConfig, targetId: string): PersistedConfig {
  const target = config.services.find((s) => s.id === targetId && !s.hidden);
  if (!target) return config;

  if (config.splitView.enabled && config.splitView.secondaryServiceId === targetId) {
    return {
      ...config,
      activeServiceId: targetId,
      splitView: {
        ...config.splitView,
        secondaryServiceId: config.activeServiceId,
      },
    };
  }

  return {
    ...config,
    activeServiceId: targetId,
  };
}

export function toggleSplitView(
  config: PersistedConfig,
  enabled?: boolean,
  secondaryServiceId?: string | null,
): PersistedConfig {
  const visible = getVisibleServices(config);
  const nextEnabled = typeof enabled === 'boolean' ? enabled : !config.splitView.enabled;

  if (!nextEnabled || visible.length < 2) {
    return {
      ...config,
      splitView: {
        ...config.splitView,
        enabled: false,
      },
    };
  }

  const candidateSecondary = secondaryServiceId ?? config.splitView.secondaryServiceId;
  const validSecondary =
    candidateSecondary &&
    candidateSecondary !== config.activeServiceId &&
    visible.some((s) => s.id === candidateSecondary)
      ? candidateSecondary
      : (visible.find((s) => s.id !== config.activeServiceId)?.id ?? null);

  return {
    ...config,
    splitView: {
      ...config.splitView,
      enabled: Boolean(validSecondary),
      secondaryServiceId: validSecondary,
    },
  };
}

export function swapSplitPanes(config: PersistedConfig): PersistedConfig {
  if (!config.splitView.enabled || !config.splitView.secondaryServiceId) {
    return config;
  }
  return {
    ...config,
    activeServiceId: config.splitView.secondaryServiceId,
    splitView: {
      ...config.splitView,
      secondaryServiceId: config.activeServiceId,
    },
  };
}

export function setSplitRatio(config: PersistedConfig, ratio: number): PersistedConfig {
  return {
    ...config,
    splitView: {
      ...config.splitView,
      ratio: clampSplitRatio(ratio),
    },
  };
}

export function applyWorkspace(config: PersistedConfig, workspaceId: string): PersistedConfig {
  const preset = config.workspaces.find((w) => w.id === workspaceId);
  if (!preset) return config;

  const showAll = preset.serviceIds.length === 0;
  const included = new Set(preset.serviceIds);

  const services = config.services.map((s) => ({
    ...s,
    hidden: showAll ? false : !included.has(s.id),
  }));

  if (!services.some((s) => !s.hidden) && services.length > 0) {
    services[0] = { ...services[0], hidden: false };
  }

  const visible = services.filter((s) => !s.hidden);
  const nextActive = visible.some((s) => s.id === preset.activeServiceId)
    ? preset.activeServiceId
    : visible[0].id;

  const requestedSec = preset.secondaryServiceId ?? null;
  const validSec =
    requestedSec && requestedSec !== nextActive && visible.some((s) => s.id === requestedSec)
      ? requestedSec
      : (visible.find((s) => s.id !== nextActive)?.id ?? null);

  return {
    ...config,
    services,
    activeServiceId: nextActive,
    activeWorkspaceId: preset.id,
    splitView: {
      ...config.splitView,
      enabled: preset.splitEnabled && Boolean(validSec),
      secondaryServiceId: validSec,
    },
  };
}

export function saveCustomWorkspace(config: PersistedConfig, rawName: string): PersistedConfig {
  const name = rawName.trim();
  if (!name) {
    throw new Error('Workspace name is required.');
  }
  const visible = getVisibleServices(config);
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || 'workspace';

  let id = `ws-${slug}`;
  let n = 2;
  while (config.workspaces.some((w) => w.id === id)) {
    id = `ws-${slug}-${n++}`;
  }

  const created: WorkspacePreset = {
    id,
    name: name.slice(0, 28),
    builtIn: false,
    serviceIds: visible.map((s) => s.id),
    activeServiceId: config.activeServiceId,
    splitEnabled: config.splitView.enabled,
    secondaryServiceId: config.splitView.secondaryServiceId,
  };

  return {
    ...config,
    workspaces: [...config.workspaces, created],
    activeWorkspaceId: created.id,
  };
}

export function deleteCustomWorkspace(config: PersistedConfig, workspaceId: string): PersistedConfig {
  const target = config.workspaces.find((w) => w.id === workspaceId);
  if (!target || target.builtIn) return config;

  return {
    ...config,
    workspaces: config.workspaces.filter((w) => w.id !== workspaceId),
    activeWorkspaceId: config.activeWorkspaceId === workspaceId ? 'all' : config.activeWorkspaceId,
  };
}

export function toggleServiceAdBlock(config: PersistedConfig, serviceId: string): PersistedConfig {
  const idx = config.services.findIndex((s) => s.id === serviceId);
  if (idx === -1) return config;
  const services = [...config.services];
  const current = services[idx];
  services[idx] = {
    ...current,
    adBlockEnabled: !(current.adBlockEnabled ?? true),
  };
  return { ...config, services };
}

export function setServiceVolume(
  config: PersistedConfig,
  serviceId: string,
  volume: number,
): PersistedConfig {
  const idx = config.services.findIndex((s) => s.id === serviceId);
  if (idx === -1) return config;
  const services = [...config.services];
  services[idx] = {
    ...services[idx],
    volume: clampVolume(volume),
  };
  return { ...config, services };
}

export function setServiceLastUrl(
  config: PersistedConfig,
  serviceId: string,
  url: string,
): PersistedConfig {
  if (!/^https?:\/\//i.test(url)) return config;
  const idx = config.services.findIndex((s) => s.id === serviceId);
  if (idx === -1) return config;
  if (config.services[idx].lastUrl === url) return config;
  const services = [...config.services];
  services[idx] = {
    ...services[idx],
    lastUrl: url,
  };
  return { ...config, services };
}

export function pinFavorite(
  config: PersistedConfig,
  input: { serviceId: string; title: string; url: string },
): PersistedConfig {
  const normalizedUrl = normalizeServiceUrl(input.url);
  const title = input.title.trim().replace(/^[\(\[]\d+\+?[\)\]]\s*/, '') || normalizedUrl;
  const existingIdx = config.pinnedFavorites.findIndex((f) => f.url === normalizedUrl);
  if (existingIdx !== -1) {
    const next = [...config.pinnedFavorites];
    next[existingIdx] = { ...next[existingIdx], title };
    return { ...config, pinnedFavorites: next };
  }

  const created: PinnedFavorite = {
    id: `fav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serviceId: input.serviceId,
    title: title.slice(0, 80),
    url: normalizedUrl,
    createdAt: Date.now(),
  };

  return {
    ...config,
    pinnedFavorites: [created, ...config.pinnedFavorites].slice(0, 32),
  };
}

export function removeFavorite(config: PersistedConfig, favoriteId: string): PersistedConfig {
  return {
    ...config,
    pinnedFavorites: config.pinnedFavorites.filter((f) => f.id !== favoriteId),
  };
}

export function recordRecentActivity(
  config: PersistedConfig,
  input: { serviceId: string; title: string; url: string },
  nowMs = Date.now(),
): PersistedConfig {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return config;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return config;

  // Skip bare root pages and auth/login screens so Continue Watching/Listening stays meaningful
  const pathLower = parsed.pathname.toLowerCase();
  if (
    (pathLower === '/' || pathLower === '') &&
    !parsed.search
  ) {
    return config;
  }
  if (
    pathLower.includes('/login') ||
    pathLower.includes('/signin') ||
    pathLower.includes('/oauth') ||
    pathLower.includes('/auth') ||
    parsed.hostname.toLowerCase().startsWith('accounts.')
  ) {
    return config;
  }

  const cleanTitle = input.title.trim().replace(/^[\(\[]\d+\+?[\)\]]\s*/, '');
  if (!cleanTitle) return config;

  const cleanUrl = parsed.toString().replace(/\/$/, '') || parsed.origin;
  const filtered = config.recentActivity.filter((item) => item.url !== cleanUrl);
  const entry: RecentActivityItem = {
    id: `rec-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
    serviceId: input.serviceId,
    title: cleanTitle.slice(0, 96),
    url: cleanUrl,
    visitedAt: nowMs,
  };

  return {
    ...config,
    recentActivity: [entry, ...filtered].slice(0, 16),
  };
}

export function serializeConfigForExport(config: PersistedConfig): string {
  const sanitized: PersistedConfig = {
    ...config,
    settings: {
      ...config.settings,
      aiCompanion: {
        ...config.settings.aiCompanion,
        apiKey: '',
      },
    },
  };
  return JSON.stringify(
    {
      omnideckExport: true,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      config: sanitized,
    },
    null,
    2,
  );
}

export function parseImportedConfig(rawJson: string): PersistedConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid JSON file. Please choose a valid OmniDeck backup.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup JSON must be an object.');
  }
  const wrapper = parsed as { config?: unknown };
  const payload = wrapper.config && typeof wrapper.config === 'object' ? wrapper.config : parsed;
  return mergePersistedConfig(payload);
}

export function addCustomService(
  config: PersistedConfig,
  input: CustomServiceInput,
): { config: PersistedConfig; created: ServiceDefinition } {
  const name = input.name.trim();
  if (!name) {
    throw new Error('App name is required.');
  }
  const url = normalizeServiceUrl(input.url);
  const mobileUrl = input.mobileUrl?.trim() ? normalizeServiceUrl(input.mobileUrl) : url;

  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'app';

  let id = `custom-${baseSlug}`;
  let counter = 2;
  while (config.services.some((s) => s.id === id)) {
    id = `custom-${baseSlug}-${counter++}`;
  }

  const created: ServiceDefinition = {
    id,
    name,
    shortName: input.shortName?.trim() || name.slice(0, 12),
    url,
    mobileUrl,
    accentColor: input.accentColor && /^#[0-9a-fA-F]{3,8}$/.test(input.accentColor) ? input.accentColor : '#D97736',
    icon: input.icon ?? 'globe',
    partition: input.partition?.trim() || id,
    hidden: false,
    builtIn: false,
    requiresDrm: false,
    keepAliveInBackground: input.keepAliveInBackground ?? true,
    mobileUserAgentMode: input.mobileUserAgentMode ?? 'mobile',
    zoomFactor: 1.0,
    adBlockEnabled: input.adBlockEnabled ?? true,
    volume: 1.0,
  };

  return {
    created,
    config: {
      ...config,
      services: [...config.services, created],
    },
  };
}

export function updateService(
  config: PersistedConfig,
  id: string,
  patch: Partial<
    Pick<
      ServiceDefinition,
      | 'name'
      | 'shortName'
      | 'url'
      | 'mobileUrl'
      | 'accentColor'
      | 'icon'
      | 'keepAliveInBackground'
      | 'mobileUserAgentMode'
      | 'zoomFactor'
      | 'adBlockEnabled'
      | 'volume'
    >
  >,
): PersistedConfig {
  const idx = config.services.findIndex((s) => s.id === id);
  if (idx === -1) return config;

  const current = config.services[idx];
  const nextUrl = patch.url !== undefined ? normalizeServiceUrl(patch.url) : current.url;
  const nextMobileUrl =
    patch.mobileUrl !== undefined
      ? patch.mobileUrl.trim()
        ? normalizeServiceUrl(patch.mobileUrl)
        : nextUrl
      : current.mobileUrl;

  const updated: ServiceDefinition = {
    ...current,
    name: patch.name !== undefined && patch.name.trim() ? patch.name.trim() : current.name,
    shortName:
      patch.shortName !== undefined && patch.shortName.trim()
        ? patch.shortName.trim()
        : current.shortName,
    url: nextUrl,
    mobileUrl: nextMobileUrl,
    accentColor:
      patch.accentColor && /^#[0-9a-fA-F]{3,8}$/.test(patch.accentColor)
        ? patch.accentColor
        : current.accentColor,
    icon: patch.icon ?? current.icon,
    keepAliveInBackground:
      typeof patch.keepAliveInBackground === 'boolean'
        ? patch.keepAliveInBackground
        : current.keepAliveInBackground,
    mobileUserAgentMode: patch.mobileUserAgentMode ?? current.mobileUserAgentMode,
    zoomFactor: patch.zoomFactor !== undefined ? clampZoom(patch.zoomFactor) : current.zoomFactor,
    adBlockEnabled:
      typeof patch.adBlockEnabled === 'boolean'
        ? patch.adBlockEnabled
        : (current.adBlockEnabled ?? true),
    volume: patch.volume !== undefined ? clampVolume(patch.volume) : (current.volume ?? 1.0),
  };

  const services = [...config.services];
  services[idx] = updated;
  return { ...config, services };
}

export function removeCustomService(config: PersistedConfig, id: string): PersistedConfig {
  const target = config.services.find((s) => s.id === id);
  if (!target || target.builtIn) {
    return config;
  }
  const services = config.services.filter((s) => s.id !== id);
  const visible = services.filter((s) => !s.hidden);
  if (visible.length === 0 && services.length > 0) {
    services[0] = { ...services[0], hidden: false };
  }
  const nextVisible = services.filter((s) => !s.hidden);
  const nextActive =
    config.activeServiceId === id ? (nextVisible[0]?.id ?? services[0].id) : config.activeServiceId;

  const nextSecondary =
    config.splitView.secondaryServiceId === id
      ? (nextVisible.find((s) => s.id !== nextActive)?.id ?? null)
      : config.splitView.secondaryServiceId;

  return {
    ...config,
    services,
    activeServiceId: nextActive,
    splitView: {
      ...config.splitView,
      enabled: config.splitView.enabled && Boolean(nextSecondary),
      secondaryServiceId: nextSecondary,
    },
  };
}

export function toggleServiceVisibility(config: PersistedConfig, id: string): PersistedConfig {
  const idx = config.services.findIndex((s) => s.id === id);
  if (idx === -1) return config;

  const target = config.services[idx];
  const visibleCount = config.services.filter((s) => !s.hidden).length;
  if (!target.hidden && visibleCount <= 1) {
    return config;
  }

  const services = [...config.services];
  services[idx] = { ...target, hidden: !target.hidden };
  const visible = services.filter((s) => !s.hidden);

  let nextActive = config.activeServiceId;
  if (services[idx].hidden && nextActive === id) {
    nextActive = visible[0].id;
  }

  let nextSecondary = config.splitView.secondaryServiceId;
  let nextSplitEnabled = config.splitView.enabled;
  if (services[idx].hidden && nextSecondary === id) {
    nextSecondary = visible.find((s) => s.id !== nextActive)?.id ?? null;
    if (!nextSecondary) nextSplitEnabled = false;
  }

  return {
    ...config,
    services,
    activeServiceId: nextActive,
    splitView: {
      ...config.splitView,
      enabled: nextSplitEnabled,
      secondaryServiceId: nextSecondary,
    },
  };
}

export function reorderServices(
  config: PersistedConfig,
  fromIndex: number,
  toIndex: number,
): PersistedConfig {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= config.services.length ||
    toIndex >= config.services.length ||
    fromIndex === toIndex
  ) {
    return config;
  }
  const services = [...config.services];
  const [moved] = services.splice(fromIndex, 1);
  services.splice(toIndex, 0, moved);
  return { ...config, services };
}

export function moveServiceById(
  config: PersistedConfig,
  draggedId: string,
  targetId: string,
): PersistedConfig {
  const fromIndex = config.services.findIndex((s) => s.id === draggedId);
  const toIndex = config.services.findIndex((s) => s.id === targetId);
  return reorderServices(config, fromIndex, toIndex);
}

/**
 * Tier-1 Smart Sleep: Determines whether an inactive silent background tab should have
 * Chromium background throttling engaged (default after 5 minutes) to cut CPU before full sleep.
 */
export function shouldSoftThrottle(
  runtime: ServiceRuntimeState,
  config: PersistedConfig,
  nowMs: number,
  softDelayMinutes = 5,
): boolean {
  if (!runtime.mounted || runtime.hibernated || runtime.softThrottled) return false;
  if (runtime.serviceId === config.activeServiceId) return false;
  if (config.splitView.enabled && runtime.serviceId === config.splitView.secondaryServiceId) {
    return false;
  }
  if (runtime.audible) return false;
  if (runtime.lastActiveAt <= 0) return false;
  return nowMs - runtime.lastActiveAt >= softDelayMinutes * 60_000;
}

/**
 * Tier-2 Smart Sleep: Determines whether a mounted background service is eligible for full hibernation.
 * Never hibernates visible services, audio-playing services, or Spotify while Connect Keep-Alive is on.
 */
export function shouldAutoHibernate(
  runtime: ServiceRuntimeState,
  config: PersistedConfig,
  nowMs: number,
): boolean {
  if (config.settings.autoHibernateMinutes <= 0) return false;
  if (!runtime.mounted || runtime.hibernated) return false;
  if (runtime.serviceId === config.activeServiceId) return false;
  if (config.splitView.enabled && runtime.serviceId === config.splitView.secondaryServiceId) {
    return false;
  }
  if (runtime.audible) return false;
  if (runtime.serviceId === 'spotify' && config.settings.powerUps.spotifyKeepConnectAlive) {
    return false;
  }
  if (runtime.lastActiveAt <= 0) return false;

  const idleMs = nowMs - runtime.lastActiveAt;
  return idleMs >= config.settings.autoHibernateMinutes * 60_000;
}

/**
 * Pure layout geometry calculator for Desktop `WebContentsView` bounds.
 * Ensures zero overlap with Top/Left bars, Bottom Media Dock, split divider, Home Hub, or modals.
 */
export function computeDesktopLayoutBounds(
  contentWidth: number,
  contentHeight: number,
  insets: ChromeInsets,
  options: {
    overlayOpen: boolean;
    primaryHibernated: boolean;
    splitEnabled: boolean;
    secondaryHibernated: boolean;
    splitRatio: number;
  },
): StageLayoutMetrics {
  const stageX = Math.max(0, Math.round(insets.left));
  const stageY = Math.max(0, Math.round(insets.top));
  const stageW = Math.max(0, Math.round(contentWidth - stageX - (insets.right ?? 0)));
  const stageH = Math.max(0, Math.round(contentHeight - stageY - (insets.bottom ?? 0)));

  if (options.overlayOpen || stageW <= 0 || stageH <= 0) {
    return { primary: null, secondary: null, dividerX: null };
  }

  if (!options.splitEnabled) {
    return {
      primary: options.primaryHibernated
        ? null
        : { x: stageX, y: stageY, width: stageW, height: stageH },
      secondary: null,
      dividerX: null,
    };
  }

  const ratio = clampSplitRatio(options.splitRatio);
  const dividerW = Math.max(4, Math.round(insets.splitDividerWidth));
  const splitTop = stageY + Math.max(0, Math.round(insets.splitHeaderHeight));
  const paneH = Math.max(0, stageH - Math.max(0, Math.round(insets.splitHeaderHeight)));
  const usableW = Math.max(0, stageW - dividerW);
  const leftW = Math.round(usableW * ratio);
  const rightW = Math.max(0, usableW - leftW);
  const dividerX = stageX + leftW;

  return {
    primary:
      options.primaryHibernated || leftW <= 0 || paneH <= 0
        ? null
        : { x: stageX, y: splitTop, width: leftW, height: paneH },
    secondary:
      options.secondaryHibernated || rightW <= 0 || paneH <= 0
        ? null
        : { x: dividerX + dividerW, y: splitTop, width: rightW, height: paneH },
    dividerX,
  };
}
