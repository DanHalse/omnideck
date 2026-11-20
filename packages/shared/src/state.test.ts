import { describe, expect, it } from 'vitest';
import {
  addCustomService,
  applyWorkspace,
  buildServiceSearchUrl,
  computeDesktopLayoutBounds,
  createDefaultConfig,
  createInitialRuntimeState,
  DEFAULT_POWER_UPS,
  DEFAULT_SERVICES,
  deleteCustomWorkspace,
  extractBadgeCountFromTitle,
  extractTwitchChannelLogin,
  extractYouTubeVideoId,
  getVisibleServices,
  isInAppPopupUrl,
  matchServiceForUrl,
  mergePersistedConfig,
  moveServiceById,
  normalizeServiceUrl,
  parseImportedConfig,
  pinFavorite,
  recordRecentActivity,
  removeCustomService,
  removeFavorite,
  resolveElectronPartition,
  rewriteUrlForPowerUps,
  saveCustomWorkspace,
  selectActiveService,
  serializeConfigForExport,
  setServiceVolume,
  setSplitRatio,
  shouldAutoHibernate,
  shouldSoftThrottle,
  swapSplitPanes,
  toggleServiceAdBlock,
  toggleServiceVisibility,
  toggleSplitView,
  updateService,
} from './index.js';

describe('@omnideck/shared defaults & partitions', () => {
  it('ships all 6 requested platforms with YouTube & YT Music sharing Google session', () => {
    const ids = DEFAULT_SERVICES.map((s) => s.id);
    expect(ids).toEqual(['youtube', 'twitch', 'spotify', 'youtube-music', 'reddit', 'audible']);

    const yt = DEFAULT_SERVICES.find((s) => s.id === 'youtube')!;
    const ytm = DEFAULT_SERVICES.find((s) => s.id === 'youtube-music')!;
    const spotify = DEFAULT_SERVICES.find((s) => s.id === 'spotify')!;
    const audible = DEFAULT_SERVICES.find((s) => s.id === 'audible')!;

    expect(resolveElectronPartition(yt, true)).toBe('persist:google');
    expect(resolveElectronPartition(ytm, true)).toBe('persist:google');
    expect(resolveElectronPartition(yt, false)).toBe('persist:youtube');
    expect(resolveElectronPartition(ytm, false)).toBe('persist:youtube-music');
    expect(resolveElectronPartition(spotify, true)).toBe('persist:spotify');
    expect(resolveElectronPartition(audible, true)).toBe('persist:audible');
    expect(spotify.requiresDrm).toBe(true);
    expect(audible.requiresDrm).toBe(true);
  });

  it('keeps OAuth popups and Audible Cloud Player in-app while sending external links out', () => {
    const reddit = DEFAULT_SERVICES.find((s) => s.id === 'reddit')!;
    const audible = DEFAULT_SERVICES.find((s) => s.id === 'audible')!;

    expect(isInAppPopupUrl('https://accounts.google.com/o/oauth2/auth', reddit)).toBe(true);
    expect(isInAppPopupUrl('https://www.audible.com/webplayer?asin=B001', audible)).toBe(true);
    expect(isInAppPopupUrl('https://www.amazon.com/ap/signin', audible)).toBe(true);
    expect(isInAppPopupUrl('https://news.ycombinator.com/item?id=1', reddit)).toBe(false);
    expect(isInAppPopupUrl('javascript:alert(1)', reddit)).toBe(false);
  });
});

describe('URL normalization & custom services', () => {
  it('normalizes valid web URLs and rejects unsafe schemes', () => {
    expect(normalizeServiceUrl('soundcloud.com')).toBe('https://soundcloud.com');
    expect(normalizeServiceUrl('https://bandcamp.com/')).toBe('https://bandcamp.com');
    expect(() => normalizeServiceUrl('javascript:alert(1)')).toThrow();
    expect(() => normalizeServiceUrl('file:///etc/passwd')).toThrow();
    expect(() => normalizeServiceUrl('')).toThrow();
  });

  it('adds, updates, reorders, hides, and removes custom services safely', () => {
    let config = createDefaultConfig();
    const added = addCustomService(config, {
      name: 'SoundCloud',
      url: 'soundcloud.com/discover',
      icon: 'music',
      accentColor: '#FF5500',
    });
    config = added.config;
    expect(added.created.builtIn).toBe(false);
    expect(added.created.url).toBe('https://soundcloud.com/discover');
    expect(config.services).toHaveLength(7);

    config = moveServiceById(config, added.created.id, 'youtube');
    expect(config.services[0].id).toBe(added.created.id);

    config = updateService(config, added.created.id, { name: 'SC Audio', zoomFactor: 1.25 });
    expect(config.services[0].name).toBe('SC Audio');
    expect(config.services[0].zoomFactor).toBe(1.25);

    expect(removeCustomService(config, 'youtube').services).toHaveLength(7);
    config = selectActiveService(config, added.created.id);
    config = removeCustomService(config, added.created.id);
    expect(config.services).toHaveLength(6);
    expect(config.activeServiceId).toBe('youtube');
  });

  it('never hides the final visible service and switches active service when hiding current', () => {
    let config = createDefaultConfig();
    config = toggleServiceVisibility(config, 'youtube');
    expect(config.services.find((s) => s.id === 'youtube')?.hidden).toBe(true);
    expect(config.activeServiceId).toBe('twitch');

    for (const id of ['twitch', 'spotify', 'youtube-music', 'reddit']) {
      config = toggleServiceVisibility(config, id);
    }
    expect(config.activeServiceId).toBe('audible');

    config = toggleServiceVisibility(config, 'audible');
    expect(config.services.find((s) => s.id === 'audible')?.hidden).toBe(false);
  });
});

describe('Workspaces, badges, ad-blocker toggles & cross-device sync', () => {
  it('switches built-in workspaces and saves/deletes custom presets', () => {
    let config = createDefaultConfig();
    config = applyWorkspace(config, 'focus-audio');
    expect(config.activeWorkspaceId).toBe('focus-audio');
    expect(getVisibleServices(config).map((s) => s.id)).toEqual([
      'spotify',
      'youtube-music',
      'audible',
    ]);
    expect(config.activeServiceId).toBe('spotify');

    config = applyWorkspace(config, 'watch-chat');
    expect(config.splitView.enabled).toBe(true);
    expect(config.activeServiceId).toBe('twitch');
    expect(config.splitView.secondaryServiceId).toBe('reddit');

    config = saveCustomWorkspace(config, 'Late Night');
    const customWs = config.workspaces.find((w) => w.name === 'Late Night')!;
    expect(customWs).toBeDefined();
    expect(customWs.builtIn).toBe(false);

    config = deleteCustomWorkspace(config, customWs.id);
    expect(config.workspaces.some((w) => w.id === customWs.id)).toBe(false);
    expect(config.activeWorkspaceId).toBe('all');

    config = applyWorkspace(config, 'all');
    expect(getVisibleServices(config)).toHaveLength(6);
  });

  it('extracts notification badge counts from page titles cleanly', () => {
    expect(extractBadgeCountFromTitle('(3) YouTube')).toBe(3);
    expect(extractBadgeCountFromTitle('[12+] Reddit — Messages')).toBe(12);
    expect(extractBadgeCountFromTitle('(250) Inbox')).toBe(99);
    expect(extractBadgeCountFromTitle('YouTube — Music (2026)')).toBe(0);
    expect(extractBadgeCountFromTitle('')).toBe(0);
  });

  it('toggles per-service ad-blocker and round-trips cross-device config JSON', () => {
    let config = createDefaultConfig();
    config = toggleServiceAdBlock(config, 'twitch');
    expect(config.services.find((s) => s.id === 'twitch')?.adBlockEnabled).toBe(false);

    config = addCustomService(config, { name: 'Pocket Casts', url: 'play.pocketcasts.com' }).config;
    const exported = serializeConfigForExport(config);
    const imported = parseImportedConfig(exported);

    expect(imported.services).toHaveLength(7);
    expect(imported.services.find((s) => s.id === 'twitch')?.adBlockEnabled).toBe(false);
    expect(imported.services.some((s) => s.name === 'Pocket Casts')).toBe(true);
    expect(() => parseImportedConfig('{bad json')).toThrow();
  });
});

describe('Split-view, hibernation & desktop layout bounds', () => {
  it('toggles split-view, swaps cleanly when clicking secondary tab, and clamps ratio', () => {
    let config = createDefaultConfig();
    config = toggleSplitView(config, true, 'reddit');
    expect(config.splitView.enabled).toBe(true);
    expect(config.activeServiceId).toBe('youtube');
    expect(config.splitView.secondaryServiceId).toBe('reddit');

    config = selectActiveService(config, 'reddit');
    expect(config.activeServiceId).toBe('reddit');
    expect(config.splitView.secondaryServiceId).toBe('youtube');

    config = swapSplitPanes(config);
    expect(config.activeServiceId).toBe('youtube');
    expect(config.splitView.secondaryServiceId).toBe('reddit');

    config = setSplitRatio(config, 0.95);
    expect(config.splitView.ratio).toBe(0.75);
    config = setSplitRatio(config, 0.05);
    expect(config.splitView.ratio).toBe(0.25);
  });

  it('auto-hibernates idle silent tabs, protects Spotify Connect & audio, and triggers Tier-1 soft throttling', () => {
    const config = createDefaultConfig();
    const now = 1_000_000_000;
    const tenMinAgo = now - 10 * 60_000;
    const fortyMinAgo = now - 40 * 60_000;

    const redditSilent = {
      ...createInitialRuntimeState(DEFAULT_SERVICES[4]),
      mounted: true,
      audible: false,
      lastActiveAt: fortyMinAgo,
    };
    expect(shouldAutoHibernate(redditSilent, config, now)).toBe(true);
    expect(shouldSoftThrottle({ ...redditSilent, lastActiveAt: tenMinAgo }, config, now, 5)).toBe(true);

    // Spotify Connect keep-alive protects Spotify by default, unless disabled
    const spotifySilent = {
      ...createInitialRuntimeState(DEFAULT_SERVICES[2]),
      mounted: true,
      audible: false,
      lastActiveAt: fortyMinAgo,
    };
    expect(shouldAutoHibernate(spotifySilent, config, now)).toBe(false);
    const spotifySleepConfig = {
      ...config,
      settings: {
        ...config.settings,
        powerUps: { ...config.settings.powerUps, spotifyKeepConnectAlive: false },
      },
    };
    expect(shouldAutoHibernate(spotifySilent, spotifySleepConfig, now)).toBe(true);

    const spotifyPlaying = { ...spotifySilent, audible: true };
    expect(shouldAutoHibernate(spotifyPlaying, spotifySleepConfig, now)).toBe(false);

    const activeYouTube = {
      ...createInitialRuntimeState(DEFAULT_SERVICES[0]),
      mounted: true,
      audible: false,
      lastActiveAt: fortyMinAgo,
    };
    expect(shouldAutoHibernate(activeYouTube, config, now)).toBe(false);
  });

  it('computes non-overlapping WebContentsView bounds for top bar, left rail, split view, and modals', () => {
    const topSingle = computeDesktopLayoutBounds(
      1400,
      900,
      { top: 88, left: 0, splitDividerWidth: 6, splitHeaderHeight: 34 },
      {
        overlayOpen: false,
        primaryHibernated: false,
        splitEnabled: false,
        secondaryHibernated: false,
        splitRatio: 0.5,
      },
    );
    expect(topSingle.primary).toEqual({ x: 0, y: 88, width: 1400, height: 812 });
    expect(topSingle.secondary).toBeNull();

    const leftSplit = computeDesktopLayoutBounds(
      1400,
      900,
      { top: 44, left: 72, splitDividerWidth: 6, splitHeaderHeight: 34 },
      {
        overlayOpen: false,
        primaryHibernated: false,
        splitEnabled: true,
        secondaryHibernated: false,
        splitRatio: 0.5,
      },
    );
    expect(leftSplit.primary).toEqual({ x: 72, y: 78, width: 661, height: 822 });
    expect(leftSplit.dividerX).toBe(733);
    expect(leftSplit.secondary).toEqual({ x: 739, y: 78, width: 661, height: 822 });

    const modalOpen = computeDesktopLayoutBounds(
      1400,
      900,
      { top: 88, left: 0, splitDividerWidth: 6, splitHeaderHeight: 34 },
      {
        overlayOpen: true,
        primaryHibernated: false,
        splitEnabled: true,
        secondaryHibernated: false,
        splitRatio: 0.5,
      },
    );
    expect(modalOpen.primary).toBeNull();
    expect(modalOpen.secondary).toBeNull();
  });

  it('gracefully merges partial v1.0 persisted configs into v1.2 defaults', () => {
    const merged = mergePersistedConfig({
      settings: { navPosition: 'left', theme: 'light', autoHibernateMinutes: 15 },
      activeServiceId: 'spotify',
    });
    expect(merged.settings.navPosition).toBe('left');
    expect(merged.settings.theme).toBe('light');
    expect(merged.settings.appChromeMode).toBe('zen');
    expect(merged.settings.smartLinkRouting).toBe(true);
    expect(merged.settings.nativePolishCss).toBe(true);
    expect(merged.settings.shareGoogleSession).toBe(true);
    expect(merged.settings.smartAudioSwitching).toBe(true);
    expect(merged.settings.adBlockerEnabled).toBe(true);
    expect(merged.workspaces).toHaveLength(3);
    expect(merged.activeServiceId).toBe('spotify');
    expect(merged.services).toHaveLength(6);
  });
});

describe('v1.2 Native Cockpit — Search, Smart Link Routing, Favorites, History & Mixer', () => {
  it('builds direct cross-service search URLs including r/subreddit shortcuts', () => {
    expect(buildServiceSearchUrl('youtube', 'lofi beats')).toBe(
      'https://www.youtube.com/results?search_query=lofi%20beats',
    );
    expect(buildServiceSearchUrl('spotify', 'daft punk')).toBe(
      'https://open.spotify.com/search/daft%20punk',
    );
    expect(buildServiceSearchUrl('reddit', 'r/linux')).toBe('https://www.reddit.com/r/linux/');
    expect(buildServiceSearchUrl('reddit', 'steam deck')).toBe(
      'https://www.reddit.com/search/?q=steam%20deck',
    );
    expect(buildServiceSearchUrl('audible', 'dune')).toBe(
      'https://www.audible.com/search?keywords=dune',
    );
  });

  it('routes cross-service links cleanly without hijacking OAuth or same-service links', () => {
    const config = createDefaultConfig();
    expect(
      matchServiceForUrl('https://youtu.be/dQw4w9WgXcQ', config.services, 'reddit')?.id,
    ).toBe('youtube');
    expect(
      matchServiceForUrl('https://open.spotify.com/track/123', config.services, 'reddit')?.id,
    ).toBe('spotify');
    expect(
      matchServiceForUrl('https://www.twitch.tv/shroud', config.services, 'youtube')?.id,
    ).toBe('twitch');
    expect(
      matchServiceForUrl('https://music.youtube.com/watch?v=abc', config.services, 'reddit')?.id,
    ).toBe('youtube-music');
    // Same-service links stay inside their tab
    expect(
      matchServiceForUrl('https://www.youtube.com/watch?v=abc', config.services, 'youtube'),
    ).toBeNull();
    // OAuth & Google/YouTube cross-domain auth handoffs are NEVER hijacked
    expect(
      matchServiceForUrl('https://accounts.google.com/o/oauth2/auth', config.services, 'reddit'),
    ).toBeNull();
    expect(
      matchServiceForUrl('https://www.youtube.com/CheckConnection?pmpo=https%3A%2F%2Faccounts.google.com', config.services, 'youtube-music'),
    ).toBeNull();
    expect(
      matchServiceForUrl('https://accounts.youtube.com/accounts/SetSID?ssdc=1', config.services, 'youtube-music'),
    ).toBeNull();
    expect(
      matchServiceForUrl('https://www.youtube.com/ServiceLogin?service=youtube', config.services, 'youtube-music'),
    ).toBeNull();
  });

  it('pins/removes favorites, records meaningful recent items, and clamps mixer volume', () => {
    let config = createDefaultConfig();
    config = pinFavorite(config, {
      serviceId: 'reddit',
      title: '(4) r/linux',
      url: 'https://www.reddit.com/r/linux/',
    });
    expect(config.pinnedFavorites).toHaveLength(1);
    expect(config.pinnedFavorites[0].title).toBe('r/linux');

    const favId = config.pinnedFavorites[0].id;
    config = removeFavorite(config, favId);
    expect(config.pinnedFavorites).toHaveLength(0);

    // Skips bare homepage and login pages
    config = recordRecentActivity(config, {
      serviceId: 'youtube',
      title: 'YouTube',
      url: 'https://www.youtube.com/',
    });
    expect(config.recentActivity).toHaveLength(0);

    config = recordRecentActivity(config, {
      serviceId: 'youtube',
      title: '(2) Awesome Video - YouTube',
      url: 'https://www.youtube.com/watch?v=abc123',
    });
    expect(config.recentActivity).toHaveLength(1);
    expect(config.recentActivity[0].title).toBe('Awesome Video - YouTube');

    config = setServiceVolume(config, 'spotify', 0.35);
    expect(config.services.find((s) => s.id === 'spotify')?.volume).toBe(0.35);
    config = setServiceVolume(config, 'spotify', 1.8);
    expect(config.services.find((s) => s.id === 'spotify')?.volume).toBe(1.0);
  });
});

describe('v1.3 Power-Ups — URL Rewrites, Extractors & Auth Preservation', () => {
  it('converts YouTube Shorts to full watch player and launches Audible straight to Library', () => {
    expect(
      rewriteUrlForPowerUps('youtube', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', DEFAULT_POWER_UPS),
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(
      rewriteUrlForPowerUps('audible', 'https://www.audible.com/', DEFAULT_POWER_UPS),
    ).toBe('https://www.audible.com/library/titles');

    expect(
      rewriteUrlForPowerUps('audible', 'https://www.audible.co.uk/', DEFAULT_POWER_UPS),
    ).toBe('https://www.audible.co.uk/library/titles');

    // Never rewrites login/auth endpoints
    expect(
      rewriteUrlForPowerUps('audible', 'https://www.audible.com/ap/signin', DEFAULT_POWER_UPS),
    ).toBeNull();
    expect(
      rewriteUrlForPowerUps('reddit', 'https://www.reddit.com/login', {
        ...DEFAULT_POWER_UPS,
        redditUseOldReddit: true,
      }),
    ).toBeNull();

    // Switches to old.reddit.com when enabled
    expect(
      rewriteUrlForPowerUps('reddit', 'https://www.reddit.com/r/linux/', {
        ...DEFAULT_POWER_UPS,
        redditUseOldReddit: true,
      }),
    ).toBe('https://old.reddit.com/r/linux/');
  });

  it('extracts YouTube video IDs and Twitch channel logins cleanly', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://music.youtube.com/watch?v=abcDEF_1234')).toBe('abcDEF_1234');
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://www.youtube.com/')).toBeNull();

    expect(extractTwitchChannelLogin('https://www.twitch.tv/shroud')).toBe('shroud');
    expect(extractTwitchChannelLogin('https://www.twitch.tv/popout/shroud/chat')).toBe('shroud');
    expect(extractTwitchChannelLogin('https://www.twitch.tv/directory/following')).toBeNull();
    expect(extractTwitchChannelLogin('https://www.twitch.tv/settings/profile')).toBeNull();
  });
});
