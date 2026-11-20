/**
 * High-speed O(1) hostname-first network-level Ad & Tracker Shield for Electron sessions.
 *
 * Explicitly allowlists authentication, DRM license servers (Widevine / Spotify / Audible),
 * and OmniDeck Power-Up APIs (SponsorBlock, 7TV, BTTV, FFZ) before running any pattern rules.
 */

const ALLOWLIST_DOMAINS = new Set<string>([
  'accounts.google.com',
  'accounts.youtube.com',
  'myaccount.google.com',
  'apis.google.com',
  'gstatic.com',
  'recaptcha.net',
  'hcaptcha.com',
  'challenges.cloudflare.com',
  'sponsor.ajay.app',
  '7tv.io',
  'cdn.7tv.app',
  'api.betterttv.net',
  'cdn.betterttv.net',
  'api.frankerfacez.com',
  'cdn.frankerfacez.com',
]);

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
  'ads-api.twitter.com',
  'analytics.twitter.com',
  'adeventtracker.spotify.com',
  'audio-sp-ad.spotifycdn.com',
  'spade.twitch.tv',
  'client-event-reporter.twitch.tv',
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
  /\/pixel\/(track|beacon)/i,
  /[?&]adformat=/i,
];

const ALLOWLIST_PATH_RE = /widevine|license|\/eme|oauth|signin|login|auth|recaptcha/i;

function matchesDomainSet(hostname: string, domainSet: Set<string>): boolean {
  const lower = hostname.toLowerCase();
  if (domainSet.has(lower)) return true;

  let dot = lower.indexOf('.');
  while (dot !== -1) {
    const parent = lower.slice(dot + 1);
    if (domainSet.has(parent)) return true;
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

  // O(1) hostname allowlist fast path (Google Auth, gstatic, SponsorBlock, 7TV/BTTV/FFZ)
  if (matchesDomainSet(parsed.hostname, ALLOWLIST_DOMAINS)) {
    return false;
  }

  // Never block DRM license or auth/OAuth URLs
  if (ALLOWLIST_PATH_RE.test(parsed.pathname) || ALLOWLIST_PATH_RE.test(parsed.search)) {
    return false;
  }

  // O(1) blocked hostname fast path
  if (matchesDomainSet(parsed.hostname, BLOCKED_DOMAINS)) {
    return true;
  }

  // Fast pre-check before running URL path regexes
  const lowerPath = parsed.pathname.toLowerCase();
  const lowerSearch = parsed.search.toLowerCase();
  if (
    !lowerPath.includes('ad') &&
    !lowerPath.includes('track') &&
    !lowerPath.includes('log_event') &&
    !lowerPath.includes('events') &&
    !lowerPath.includes('pixel') &&
    !lowerPath.includes('midroll') &&
    !lowerSearch.includes('adformat=')
  ) {
    return false;
  }

  return BLOCKED_URL_PATTERNS.some((re) => re.test(rawUrl));
}
