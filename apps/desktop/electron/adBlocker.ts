/**
 * Lightweight, zero-overhead network-level Ad & Tracker Shield for Electron sessions.
 *
 * Explicitly avoids blocking authentication, DRM license servers (Widevine / Spotify / Audible),
 * CDN media chunks, or core application APIs so sign-in and streaming stay 100% reliable.
 */

const BLOCKED_DOMAINS = new Set<string>([
  // Google / YouTube ad & tracking infrastructure
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googletagservices.com',
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'ads.youtube.com',

  // Amazon / Twitch / Reddit / Spotify ad & telemetry networks
  'amazon-adsystem.com',
  'aax.amazon-adsystem.com',
  'fls-na.amazon.com',
  'events.redditmedia.com',
  'alb.reddit.com',
  'ads-api.twitter.com',
  'analytics.twitter.com',
  'adeventtracker.spotify.com',
  'audio-sp-ad.spotifycdn.com',
  'spclient.wg.spotify.com/ad-logic',
  'scorecardresearch.com',
  'quantserve.com',
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'criteo.net',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'casalemedia.com',
  'moatads.com',
  'adsafeprotected.com',
  'hotjar.com',
  'segment.io',
  'mixpanel.com',
  'branch.io',
  'appsflyer.com',
  'sentry-cdn.com',
]);

const BLOCKED_URL_PATTERNS: RegExp[] = [
  /youtube\.com\/api\/stats\/ads/i,
  /youtube\.com\/pagead\//i,
  /youtube\.com\/ptracking/i,
  /youtube\.com\/get_midroll_info/i,
  /youtube\.com\/youtubei\/v1\/log_event/i,
  /spotify\.com\/ad-logic\//i,
  /spade\.twitch\.tv\//i,
  /client-event-reporter\.twitch\.tv\//i,
  /reddit\.com\/svc\/shreddit\/events/i,
  /\/pixel\/(track|beacon)/i,
  /[?&]adformat=/i,
];

const ALLOWLIST_PATTERNS: RegExp[] = [
  /accounts\.google\.com/i,
  /accounts\.youtube\.com/i,
  /myaccount\.google\.com/i,
  /apis\.google\.com/i,
  /gstatic\.com/i,
  /widevine/i,
  /license/i,
  /eme/i,
  /oauth/i,
  /signin|login|auth/i,
];

function matchesBlockedDomain(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_DOMAINS.has(lower)) return true;

  let dot = lower.indexOf('.');
  while (dot !== -1) {
    const parent = lower.slice(dot + 1);
    if (BLOCKED_DOMAINS.has(parent)) return true;
    dot = lower.indexOf('.', dot + 1);
  }
  return false;
}

export function shouldBlockNetworkRequest(rawUrl: string, resourceType?: string): boolean {
  // Never block top-level document navigations so users can always visit any site directly
  if (resourceType === 'mainFrame') {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  if (ALLOWLIST_PATTERNS.some((re) => re.test(rawUrl))) {
    return false;
  }

  if (matchesBlockedDomain(parsed.hostname)) {
    return true;
  }

  return BLOCKED_URL_PATTERNS.some((re) => re.test(rawUrl));
}
