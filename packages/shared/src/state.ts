import { DEFAULT_SERVICES } from './services.js';
import type {
  AppSettings,
  ChromeInsets,
  CustomServiceInput,
  PersistedConfig,
  ServiceDefinition,
  ServiceRuntimeState,
  StageLayoutMetrics,
  WorkspacePreset,
} from './types.js';

export const APP_VERSION = '1.1.0';
export const GITHUB_REPO_OWNER = 'DanHalse';
export const GITHUB_REPO_NAME = 'omnideck';
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`;

export const DEFAULT_SETTINGS: AppSettings = {
  navPosition: 'top',
  theme: 'dark',
  shareGoogleSession: true,
  backgroundAudioEnabled: true,
  autoHibernateMinutes: 30,
  confirmBeforeQuitWithAudio: false,
  smartAudioSwitching: true,
  hardwareMediaKeys: true,
  adBlockerEnabled: true,
  doNotDisturb: false,
  autoCheckUpdates: true,
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
      allowedAuthHosts: svc.allowedAuthHosts ? [...svc.allowedAuthHosts] : undefined,
    })),
    activeServiceId: DEFAULT_SERVICES[0].id,
    splitView: {
      enabled: false,
      secondaryServiceId: 'reddit',
      ratio: 0.5,
    },
    settings: { ...DEFAULT_SETTINGS },
    workspaces: DEFAULT_WORKSPACES.map((w) => ({ ...w, serviceIds: [...w.serviceIds] })),
    activeWorkspaceId: 'all',
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
    canGoBack: false,
    canGoForward: false,
    currentUrl: service.url,
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

export function getVisibleServices(config: PersistedConfig): ServiceDefinition[] {
  return config.services.filter((s) => !s.hidden);
}

/**
 * Safely hydrates a previously persisted JSON object, ensuring any newly introduced default
 * fields exist while preserving the user's ordering, visibility, custom services, workspaces, and settings.
 */
export function mergePersistedConfig(raw: unknown): PersistedConfig {
  const fallback = createDefaultConfig();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const candidate = raw as Partial<PersistedConfig>;
  const settings: AppSettings = {
    navPosition: candidate.settings?.navPosition === 'left' ? 'left' : 'top',
    theme: candidate.settings?.theme === 'light' ? 'light' : 'dark',
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
    smartAudioSwitching:
      typeof candidate.settings?.smartAudioSwitching === 'boolean'
        ? candidate.settings.smartAudioSwitching
        : DEFAULT_SETTINGS.smartAudioSwitching,
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
      });
    }

    for (const def of DEFAULT_SERVICES) {
      if (!seen.has(def.id)) {
        hydrated.push({ ...def, adBlockEnabled: true });
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

  // Hydrate workspaces (always keep built-in workspaces + valid custom presets)
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

export function serializeConfigForExport(config: PersistedConfig): string {
  return JSON.stringify(
    {
      omnideckExport: true,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      config,
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
 * Determines whether a mounted background service is eligible for automatic hibernation.
 * Never hibernates visible services (primary or split-view) or services currently playing audio!
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
  if (runtime.lastActiveAt <= 0) return false;

  const idleMs = nowMs - runtime.lastActiveAt;
  return idleMs >= config.settings.autoHibernateMinutes * 60_000;
}

/**
 * Pure layout geometry calculator for Desktop `WebContentsView` bounds.
 * Ensures zero overlap with the Top Menu Bar / Left Sidebar Rail, split divider, or open modals.
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
