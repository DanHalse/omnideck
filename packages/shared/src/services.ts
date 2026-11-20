import type { ServiceDefinition } from './types.js';

export const DEFAULT_SERVICES: ServiceDefinition[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    shortName: 'YT',
    url: 'https://www.youtube.com',
    mobileUrl: 'https://m.youtube.com',
    accentColor: '#FF2D43',
    icon: 'youtube',
    partition: 'google',
    hidden: false,
    builtIn: true,
    requiresDrm: false,
    keepAliveInBackground: true,
    mobileUserAgentMode: 'mobile',
    allowedAuthHosts: ['accounts.google.com', 'accounts.youtube.com', 'myaccount.google.com'],
    zoomFactor: 1.0,
  },
  {
    id: 'twitch',
    name: 'Twitch',
    shortName: 'Twitch',
    url: 'https://www.twitch.tv',
    mobileUrl: 'https://m.twitch.tv',
    accentColor: '#9146FF',
    icon: 'twitch',
    partition: 'twitch',
    hidden: false,
    builtIn: true,
    requiresDrm: false,
    keepAliveInBackground: true,
    mobileUserAgentMode: 'mobile',
    allowedAuthHosts: ['id.twitch.tv', 'passport.twitch.tv', 'www.amazon.com', 'amazon.com'],
    zoomFactor: 1.0,
  },
  {
    id: 'spotify',
    name: 'Spotify',
    shortName: 'Spotify',
    url: 'https://open.spotify.com',
    mobileUrl: 'https://open.spotify.com',
    accentColor: '#1DB954',
    icon: 'spotify',
    partition: 'spotify',
    hidden: false,
    builtIn: true,
    requiresDrm: true,
    keepAliveInBackground: true,
    // Spotify Web Player redirects mobile UAs to the Play Store; desktop UA enables full in-WebView playback on Android.
    mobileUserAgentMode: 'desktop',
    allowedAuthHosts: [
      'accounts.spotify.com',
      'accounts.google.com',
      'appleid.apple.com',
      'www.facebook.com',
    ],
    zoomFactor: 1.0,
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    shortName: 'YT Music',
    url: 'https://music.youtube.com',
    mobileUrl: 'https://music.youtube.com',
    accentColor: '#FF4E6B',
    icon: 'youtube-music',
    partition: 'google',
    hidden: false,
    builtIn: true,
    requiresDrm: false,
    keepAliveInBackground: true,
    mobileUserAgentMode: 'desktop',
    allowedAuthHosts: ['accounts.google.com', 'accounts.youtube.com', 'myaccount.google.com'],
    zoomFactor: 1.0,
  },
  {
    id: 'reddit',
    name: 'Reddit',
    shortName: 'Reddit',
    url: 'https://www.reddit.com',
    mobileUrl: 'https://www.reddit.com',
    accentColor: '#FF5414',
    icon: 'reddit',
    partition: 'reddit',
    hidden: false,
    builtIn: true,
    requiresDrm: false,
    keepAliveInBackground: false,
    mobileUserAgentMode: 'mobile',
    allowedAuthHosts: ['www.reddit.com', 'old.reddit.com', 'accounts.google.com', 'appleid.apple.com'],
    zoomFactor: 1.0,
  },
  {
    id: 'audible',
    name: 'Audible',
    shortName: 'Audible',
    url: 'https://www.audible.com/library/titles',
    mobileUrl: 'https://www.audible.com/library/titles',
    accentColor: '#F7991C',
    icon: 'audible',
    partition: 'audible',
    hidden: false,
    builtIn: true,
    requiresDrm: true,
    keepAliveInBackground: true,
    // Desktop UA enables Audible Cloud Player directly inside Android WebView.
    mobileUserAgentMode: 'desktop',
    allowedAuthHosts: [
      'www.audible.com',
      'www.audible.co.uk',
      'www.audible.de',
      'www.amazon.com',
      'www.amazon.co.uk',
      'www.amazon.de',
      'ap.amazon.com',
    ],
    zoomFactor: 1.0,
  },
];

export const GLOBAL_AUTH_HOSTS = new Set<string>([
  'accounts.google.com',
  'accounts.youtube.com',
  'myaccount.google.com',
  'appleid.apple.com',
  'accounts.spotify.com',
  'id.twitch.tv',
  'passport.twitch.tv',
  'www.amazon.com',
  'amazon.com',
  'ap.amazon.com',
  'signin.amazon.com',
  'www.facebook.com',
  'login.live.com',
  'login.microsoftonline.com',
  'github.com',
]);

export const GOOGLE_SHARED_SERVICE_IDS = new Set<string>(['youtube', 'youtube-music']);

/**
 * Resolves the Electron session partition for a service.
 * When `shareGoogleSession` is enabled, YouTube and YouTube Music both use `persist:google`
 * so signing in once authenticates both apps automatically.
 */
export function resolveElectronPartition(
  service: Pick<ServiceDefinition, 'id' | 'partition'>,
  shareGoogleSession: boolean,
): string {
  if (GOOGLE_SHARED_SERVICE_IDS.has(service.id)) {
    return shareGoogleSession ? 'persist:google' : `persist:${service.id}`;
  }
  const cleanKey = (service.partition || service.id).replace(/^persist:/, '').trim() || service.id;
  return `persist:${cleanKey}`;
}

/**
 * Extracts registrable base domain (last two labels, sufficient for common media hosts).
 */
export function getBaseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  // Handle co.uk / com.au style multi-part TLDs for regional Audible/Amazon sign-in
  const lastTwo = parts.slice(-2).join('.');
  if (lastTwo === 'co.uk' || lastTwo === 'com.au' || lastTwo === 'co.jp') {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

/**
 * Determines whether a popup window opened via `window.open` should stay inside an in-app
 * auth/player popup sharing the parent partition, versus opening in the OS default browser.
 */
export function isInAppPopupUrl(rawUrl: string, service: ServiceDefinition): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();

    // Audible Cloud Player opens in a popup window on audible.* — keep it in-app!
    if (service.id === 'audible' && (host.includes('audible.') || host.includes('amazon.'))) {
      return true;
    }

    if (GLOBAL_AUTH_HOSTS.has(host)) {
      return true;
    }

    if (service.allowedAuthHosts?.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      return true;
    }

    const serviceHost = new URL(service.url).hostname.toLowerCase();
    if (getBaseDomain(host) === getBaseDomain(serviceHost)) {
      // Allow same-domain OAuth/login/player/chat popouts (e.g. Twitch popout chat, Audible player)
      const pathLower = parsed.pathname.toLowerCase();
      if (
        pathLower.includes('login') ||
        pathLower.includes('signin') ||
        pathLower.includes('sign-in') ||
        pathLower.includes('auth') ||
        pathLower.includes('oauth') ||
        pathLower.includes('webplayer') ||
        pathLower.includes('cloudplayer') ||
        pathLower.includes('popout')
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Clean Android Chrome User-Agents (stripping `; wv` so Google Sign-In & modern web players work).
 */
export const MOBILE_ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36';

export const DESKTOP_LINUX_CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Safari/537.36';

/**
 * Builds a direct search URL (or subreddit jump) for any built-in or custom OmniDeck service.
 */
export function buildServiceSearchUrl(serviceId: string, rawQuery: string, fallbackUrl?: string): string {
  const q = rawQuery.trim();
  if (!q) return fallbackUrl || 'https://www.youtube.com';
  const encoded = encodeURIComponent(q);

  switch (serviceId) {
    case 'youtube':
      return `https://www.youtube.com/results?search_query=${encoded}`;
    case 'youtube-music':
      return `https://music.youtube.com/search?q=${encoded}`;
    case 'twitch':
      return `https://www.twitch.tv/search?term=${encoded}`;
    case 'spotify':
      return `https://open.spotify.com/search/${encoded}`;
    case 'reddit': {
      const subMatch = q.match(/^r\/([a-zA-Z0-9_]+)$/);
      if (subMatch) {
        return `https://www.reddit.com/r/${subMatch[1]}/`;
      }
      return `https://www.reddit.com/search/?q=${encoded}`;
    }
    case 'audible':
      return `https://www.audible.com/search?keywords=${encoded}`;
    default:
      return fallbackUrl || `https://www.google.com/search?q=${encoded}`;
  }
}

/**
 * Matches an outgoing URL to another OmniDeck service for Smart Cross-App Link Routing
 * (e.g., clicking a YouTube/Spotify/Twitch link inside Reddit opens it directly in its own tab).
 * Never hijacks OAuth/login endpoints or same-service links.
 */
export function matchServiceForUrl(
  rawUrl: string,
  services: ServiceDefinition[],
  sourceServiceId?: string,
): ServiceDefinition | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const pathLower = parsed.pathname.toLowerCase();

  // Never hijack OAuth/login/account flows across services
  if (
    GLOBAL_AUTH_HOSTS.has(host) ||
    pathLower.includes('/login') ||
    pathLower.includes('/signin') ||
    pathLower.includes('/oauth') ||
    pathLower.includes('/auth')
  ) {
    return null;
  }

  let matchedId: string | null = null;
  if (host === 'music.youtube.com') {
    matchedId = 'youtube-music';
  } else if (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtu.be'
  ) {
    matchedId = 'youtube';
  } else if (host === 'twitch.tv' || host === 'www.twitch.tv' || host === 'm.twitch.tv' || host === 'clips.twitch.tv') {
    matchedId = 'twitch';
  } else if (host === 'open.spotify.com' || host === 'spotify.link') {
    matchedId = 'spotify';
  } else if (host === 'reddit.com' || host === 'www.reddit.com' || host === 'old.reddit.com' || host === 'redd.it') {
    matchedId = 'reddit';
  } else if (host === 'audible.com' || host === 'www.audible.com' || host.endsWith('.audible.com')) {
    matchedId = 'audible';
  }

  if (matchedId) {
    if (matchedId === sourceServiceId) return null;
    const found = services.find((s) => s.id === matchedId && !s.hidden);
    if (found) return found;
  }

  // Also check custom services by exact hostname match
  for (const svc of services) {
    if (svc.builtIn || svc.hidden || svc.id === sourceServiceId) continue;
    try {
      const svcHost = new URL(svc.url).hostname.toLowerCase();
      if (host === svcHost) return svc;
    } catch {
      // ignore invalid URL
    }
  }

  return null;
}
