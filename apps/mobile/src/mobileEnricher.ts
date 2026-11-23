export interface MobileDislikeStats {
  videoId: string;
  likes: number;
  dislikes: number;
}

export interface MobileSponsorSegment {
  start: number;
  end: number;
  category: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const dislikeCache = new Map<string, CacheEntry<MobileDislikeStats | null>>();
const sponsorCache = new Map<string, CacheEntry<MobileSponsorSegment[]>>();

/**
 * Compact pure-JS SHA-256 hex digest (works in Hermes without Node crypto)
 * used for k-anonymous 4-char SponsorBlock video ID prefix lookups.
 */
function sha256Hex(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  let msg = `${ascii}\x80`;
  while ((msg.length % 64) - 56) msg += '\x00';
  for (let i = 0; i < msg.length; i++) {
    const j = msg.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

async function fetchJson(url: string, timeoutMs = 4500): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMobileYouTubeDislikes(
  videoId: string,
): Promise<MobileDislikeStats | null> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  const cached = dislikeCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const raw = await fetchJson(
    `https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`,
    5000,
  );
  let stats: MobileDislikeStats | null = null;
  if (raw && typeof raw === 'object') {
    const rec = raw as { likes?: unknown; dislikes?: unknown };
    if (typeof rec.dislikes === 'number' && Number.isFinite(rec.dislikes)) {
      stats = {
        videoId,
        likes:
          typeof rec.likes === 'number' && Number.isFinite(rec.likes)
            ? Math.max(0, Math.round(rec.likes))
            : 0,
        dislikes: Math.max(0, Math.round(rec.dislikes)),
      };
    }
  }

  dislikeCache.set(videoId, {
    value: stats,
    expiresAt: Date.now() + (stats ? 20 * 60_000 : 15_000),
  });
  return stats;
}

export async function fetchMobileSponsorSegments(
  videoId: string,
  isMusic: boolean,
): Promise<MobileSponsorSegment[]> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return [];
  const key = `${videoId}:${isMusic ? 'ytm' : 'yt'}`;
  const cached = sponsorCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const prefix = sha256Hex(videoId).slice(0, 4);
  const categories = isMusic
    ? ['music_offtopic', 'sponsor', 'intro', 'outro']
    : ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro'];
  const qs = categories.map((c) => `category=${encodeURIComponent(c)}`).join('&');
  const raw = await fetchJson(
    `https://sponsor.ajay.app/api/skipSegments/${prefix}?${qs}`,
    4000,
  );

  const segments: MobileSponsorSegment[] = [];
  if (Array.isArray(raw)) {
    const match = raw.find(
      (entry: unknown) =>
        entry &&
        typeof entry === 'object' &&
        (entry as { videoID?: string }).videoID === videoId &&
        Array.isArray((entry as { segments?: unknown[] }).segments),
    ) as { segments: Array<{ segment?: [number, number]; category?: string }> } | undefined;

    if (match) {
      for (const item of match.segments) {
        if (
          Array.isArray(item.segment) &&
          typeof item.segment[0] === 'number' &&
          typeof item.segment[1] === 'number' &&
          item.segment[1] > item.segment[0] + 0.5
        ) {
          segments.push({
            start: item.segment[0],
            end: item.segment[1],
            category: item.category || 'sponsor',
          });
        }
      }
    }
  }

  sponsorCache.set(key, { value: segments, expiresAt: Date.now() + 15 * 60_000 });
  return segments;
}

export function buildMobileDislikesInjectScript(stats: MobileDislikeStats): string {
  return `(function(){
    try {
      window.__odMobileRydStats = ${JSON.stringify(stats)};
      if (typeof window.__odApplyMobileRyd === 'function') {
        window.__odApplyMobileRyd();
      }
    } catch {}
  })(); true;`;
}

export function buildMobileSponsorInjectScript(
  videoId: string,
  segments: MobileSponsorSegment[],
): string {
  return `(function(){
    try {
      window.__odMobileSponsorVideoId = ${JSON.stringify(videoId)};
      window.__odMobileSponsorSegments = ${JSON.stringify(segments)};
      if (window.__odMobileSponsorSkipped && typeof window.__odMobileSponsorSkipped.clear === 'function') {
        window.__odMobileSponsorSkipped.clear();
      }
    } catch {}
  })(); true;`;
}
