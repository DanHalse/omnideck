import { describe, expect, it } from 'vitest';
import { shouldBlockNetworkRequest } from './adBlocker.js';

describe('Ad & Tracker Shield request filter', () => {
  it('blocks known ad networks and media telemetry beacons', () => {
    expect(shouldBlockNetworkRequest('https://pubads.g.doubleclick.net/gampad/ads', 'xhr')).toBe(true);
    expect(shouldBlockNetworkRequest('https://www.youtube.com/pagead/adview?ai=1', 'xhr')).toBe(true);
    expect(shouldBlockNetworkRequest('https://www.youtube.com/api/stats/ads?v=123', 'ping')).toBe(true);
    expect(shouldBlockNetworkRequest('https://events.redditmedia.com/v1', 'xhr')).toBe(true);
    expect(shouldBlockNetworkRequest('https://spade.twitch.tv/track', 'xhr')).toBe(true);
    expect(shouldBlockNetworkRequest('https://aax.amazon-adsystem.com/e/dtb/bid', 'xhr')).toBe(true);
  });

  it('never blocks OAuth logins, Widevine DRM licenses, media streams, or mainFrame navigations', () => {
    expect(shouldBlockNetworkRequest('https://accounts.google.com/o/oauth2/v2/auth', 'xhr')).toBe(false);
    expect(shouldBlockNetworkRequest('https://accounts.youtube.com/accounts/SetSID?ssdc=1', 'xhr')).toBe(false);
    expect(shouldBlockNetworkRequest('https://myaccount.google.com/intro', 'xhr')).toBe(false);
    expect(shouldBlockNetworkRequest('https://apis.google.com/js/api.js', 'script')).toBe(false);
    expect(shouldBlockNetworkRequest('https://www.gstatic.com/accounts/static/botguard.js', 'script')).toBe(false);
    expect(shouldBlockNetworkRequest('https://alb.reddit.com/rp.gif', 'xhr')).toBe(false);
    expect(shouldBlockNetworkRequest('https://www.reddit.com/svc/shreddit/events', 'xhr')).toBe(false);
    expect(shouldBlockNetworkRequest('https://www.recaptcha.net/recaptcha/api.js', 'script')).toBe(false);
    expect(shouldBlockNetworkRequest('https://sponsor.ajay.app/api/skipSegments/ab12', 'xhr')).toBe(false);
    expect(shouldBlockNetworkRequest('https://cdn.7tv.app/emote/12345/2x.webp', 'image')).toBe(false);
    expect(shouldBlockNetworkRequest('https://cdn.betterttv.net/emote/12345/2x', 'image')).toBe(false);
    expect(shouldBlockNetworkRequest('https://cdn.frankerfacez.com/emote/12345/2', 'image')).toBe(false);
    expect(shouldBlockNetworkRequest('https://gew1-spclient.spotify.com/widevine-license/v1/audio/license', 'xhr')).toBe(false);
    expect(shouldBlockNetworkRequest('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'mainFrame')).toBe(false);
    expect(shouldBlockNetworkRequest('https://doubleclick.net/test', 'mainFrame')).toBe(false);
    expect(shouldBlockNetworkRequest('https://www.audible.com/webplayer?asin=B001', 'script')).toBe(false);
  });
});
