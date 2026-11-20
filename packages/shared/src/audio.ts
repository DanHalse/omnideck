import type {
  AiCompanionConfig,
  AiProviderId,
  EqPresetId,
  EqualizerConfig,
  ListeningEntry,
  ListeningStatsSummary,
  LyricLine,
} from './types.js';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_PRESETS: Record<Exclude<EqPresetId, 'custom'>, { label: string; bands: number[]; preampDb: number }> = {
  flat: {
    label: 'Flat',
    preampDb: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  'bass-boost': {
    label: 'Bass Boost',
    preampDb: -1.5,
    bands: [6, 5, 3.5, 1.5, 0, 0, 0.5, 1, 1.5, 1],
  },
  rock: {
    label: 'Rock',
    preampDb: -1,
    bands: [4, 3, 1.5, -1, -1.5, 0.5, 2.5, 3.5, 4, 3],
  },
  vocal: {
    label: 'Vocal / Podcast',
    preampDb: 0,
    bands: [-3, -2, -0.5, 1.5, 3.5, 4, 3.5, 2, 0.5, -1],
  },
  'late-night': {
    label: 'Late Night',
    preampDb: -2,
    bands: [-4, -3, -1, 1, 2, 2, 1.5, 0, -2, -3],
  },
  electronic: {
    label: 'Electronic',
    preampDb: -1.5,
    bands: [5.5, 4.5, 2, 0, -1, 1, 2, 3.5, 4.5, 5],
  },
};

export const DEFAULT_EQUALIZER_CONFIG: EqualizerConfig = {
  enabled: false,
  preset: 'flat',
  preampDb: 0,
  bands: [...EQ_PRESETS.flat.bands],
};

export const AI_PROVIDER_DEFAULT_MODELS: Record<AiProviderId, string> = {
  none: '',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  ollama: 'llama3.2',
};

export const DEFAULT_AI_COMPANION_CONFIG: AiCompanionConfig = {
  provider: 'none',
  apiKey: '',
  model: 'gemini-2.5-flash',
  ollamaBaseUrl: 'http://localhost:11434',
  autoEnrich: true,
};

export function clampBandDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(12, Math.max(-12, Math.round(value * 2) / 2));
}

export function clampDuckLevel(value: number): number {
  if (!Number.isFinite(value)) return 0.15;
  return Math.min(0.5, Math.max(0.05, Math.round(value * 100) / 100));
}

export function mergeEqualizerConfig(raw?: Partial<EqualizerConfig> | null): EqualizerConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_EQUALIZER_CONFIG, bands: [...DEFAULT_EQUALIZER_CONFIG.bands] };
  }
  const validPresets: EqPresetId[] = [
    'flat',
    'bass-boost',
    'rock',
    'vocal',
    'late-night',
    'electronic',
    'custom',
  ];
  const preset: EqPresetId = validPresets.includes(raw.preset as EqPresetId)
    ? (raw.preset as EqPresetId)
    : 'flat';

  const rawBands = Array.isArray(raw.bands) ? raw.bands : [];
  const bands = EQ_FREQUENCIES.map((_, i) => clampBandDb(Number(rawBands[i] ?? 0)));

  return {
    enabled: Boolean(raw.enabled),
    preset,
    preampDb: clampBandDb(Number(raw.preampDb ?? 0)),
    bands,
  };
}

export function mergeAiCompanionConfig(raw?: Partial<AiCompanionConfig> | null): AiCompanionConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AI_COMPANION_CONFIG };
  }
  const validProviders: AiProviderId[] = ['none', 'gemini', 'openai', 'anthropic', 'ollama'];
  const provider: AiProviderId = validProviders.includes(raw.provider as AiProviderId)
    ? (raw.provider as AiProviderId)
    : 'none';

  const model =
    typeof raw.model === 'string' && raw.model.trim()
      ? raw.model.trim()
      : AI_PROVIDER_DEFAULT_MODELS[provider] || DEFAULT_AI_COMPANION_CONFIG.model;

  const ollamaBaseUrl =
    typeof raw.ollamaBaseUrl === 'string' && /^https?:\/\//i.test(raw.ollamaBaseUrl.trim())
      ? raw.ollamaBaseUrl.trim().replace(/\/+$/, '')
      : DEFAULT_AI_COMPANION_CONFIG.ollamaBaseUrl;

  return {
    provider,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
    model,
    ollamaBaseUrl,
    autoEnrich: typeof raw.autoEnrich === 'boolean' ? raw.autoEnrich : true,
  };
}

/**
 * Normalizes track title and artist strings from YouTube Music / Spotify / YouTube
 * by stripping channel suffixes (" - Topic", "VEVO") and video tags ("(Official Audio)", "[Remastered]").
 */
export function cleanTrackAndArtist(
  rawTitle: string,
  rawArtist?: string,
): { track: string; artist: string } {
  let track = (rawTitle || '')
    .replace(/\s*-\s*YouTube Music$/i, '')
    .replace(/\s*-\s*YouTube$/i, '')
    .replace(
      /\s*[\(\[]\s*(official\s*(?:(?:hd|4k|hq|remastered|music|lyric|lyrics|audio|visuali[sz]er)\s*)*(?:video|audio|visuali[sz]er)?|lyrics?|hd|4k|hq|remastered(?:\s*\d{4})?|explicit|clean|radio\s*edit|album\s*version|live[^)\]]*)\s*[\)\]]/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();

  let artist = (rawArtist || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*VEVO$/i, '')
    .replace(/^YouTube Music$/i, '')
    .replace(/^Spotify$/i, '')
    .replace(/\s*[•·]\s*.*$/, '')
    .replace(/\s*,\s*.*$/, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If title is "Artist - Track" and artist is missing or generic, split cleanly
  if (!artist && track.includes(' - ')) {
    const [left, ...rest] = track.split(' - ');
    if (left.trim() && rest.join(' - ').trim()) {
      artist = left.trim();
      track = rest.join(' - ').trim();
    }
  }

  // Also strip leading "Artist - " prefix when artist is already known
  if (artist && track.toLowerCase().startsWith(`${artist.toLowerCase()} - `)) {
    track = track.slice(artist.length + 3).trim();
  }

  return { track, artist };
}

/**
 * Parses standard LRC timestamped lyrics (`[mm:ss.xx] Line text`) into sorted time-coded lines.
 */
export function parseLrcLyrics(lrc: string): LyricLine[] {
  if (!lrc || typeof lrc !== 'string') return [];
  const results: LyricLine[] = [];
  const tagRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lrc.split(/\r?\n/)) {
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    tagRegex.lastIndex = 0;

    while ((match = tagRegex.exec(rawLine)) !== null) {
      const mins = Number.parseInt(match[1], 10);
      const secs = Number.parseInt(match[2], 10);
      const fracRaw = match[3] || '0';
      const frac = fracRaw.length === 3 ? Number.parseInt(fracRaw, 10) / 1000 : Number.parseInt(fracRaw, 10) / 100;
      if (Number.isFinite(mins) && Number.isFinite(secs)) {
        timestamps.push(mins * 60 + secs + (Number.isFinite(frac) ? frac : 0));
      }
    }

    if (timestamps.length === 0) continue;
    const text = rawLine.replace(tagRegex, '').trim();
    if (!text) continue;

    for (const timeSec of timestamps) {
      results.push({ timeSec, text });
    }
  }

  results.sort((a, b) => a.timeSec - b.timeSec);
  return results;
}

/**
 * Returns the index of the active lyric line for a given playback timestamp (in seconds),
 * or -1 before the first line begins.
 */
export function findActiveLyricIndex(lines: LyricLine[], currentTimeSec: number): number {
  if (!lines.length || !Number.isFinite(currentTimeSec)) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  const adjusted = currentTimeSec + 0.25;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeSec <= adjusted) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * Aggregates local listening entries into a private "OmniDeck Wrapped" summary.
 */
export function computeListeningStatsSummary(
  entries: ListeningEntry[],
  nowMs = Date.now(),
): ListeningStatsSummary {
  const valid = entries.filter((e) => e && e.title && e.durationSec >= 10);
  const totalPlays = valid.length;
  const totalSec = valid.reduce((sum, e) => sum + Math.max(0, e.durationSec), 0);

  // Per-service breakdown
  const svcMap = new Map<string, { plays: number; sec: number }>();
  const artistMap = new Map<
    string,
    { name: string; plays: number; sec: number; artworkUrl?: string; serviceId: string }
  >();
  const trackMap = new Map<
    string,
    {
      title: string;
      artist: string;
      plays: number;
      sec: number;
      artworkUrl?: string;
      serviceId: string;
      url?: string;
    }
  >();
  const dayKeys = new Set<string>();

  for (const item of valid) {
    const svc = svcMap.get(item.serviceId) ?? { plays: 0, sec: 0 };
    svc.plays += 1;
    svc.sec += item.durationSec;
    svcMap.set(item.serviceId, svc);

    const artistClean = (item.artist || '').trim();
    if (artistClean) {
      const aKey = artistClean.toLowerCase();
      const existing = artistMap.get(aKey) ?? {
        name: artistClean,
        plays: 0,
        sec: 0,
        artworkUrl: item.artworkUrl,
        serviceId: item.serviceId,
      };
      existing.plays += 1;
      existing.sec += item.durationSec;
      if (!existing.artworkUrl && item.artworkUrl) existing.artworkUrl = item.artworkUrl;
      artistMap.set(aKey, existing);
    }

    const tKey = `${(item.title || '').trim().toLowerCase()}::${artistClean.toLowerCase()}`;
    const existingTrack = trackMap.get(tKey) ?? {
      title: item.title.trim(),
      artist: artistClean || item.serviceId,
      plays: 0,
      sec: 0,
      artworkUrl: item.artworkUrl,
      serviceId: item.serviceId,
      url: item.url,
    };
    existingTrack.plays += 1;
    existingTrack.sec += item.durationSec;
    if (!existingTrack.artworkUrl && item.artworkUrl) existingTrack.artworkUrl = item.artworkUrl;
    if (!existingTrack.url && item.url) existingTrack.url = item.url;
    trackMap.set(tKey, existingTrack);

    const d = new Date(item.startedAt);
    dayKeys.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
  }

  // Calculate consecutive daily listening streak ending today (or yesterday)
  let streakDays = 0;
  const cursor = new Date(nowMs);
  const toKey = (dt: Date) => `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
  if (!dayKeys.has(toKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dayKeys.has(toKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const byService = [...svcMap.entries()]
    .map(([serviceId, v]) => ({
      serviceId,
      plays: v.plays,
      minutes: Math.round(v.sec / 60),
    }))
    .sort((a, b) => b.minutes - a.minutes || b.plays - a.plays);

  const topArtists = [...artistMap.values()]
    .map((a) => ({
      name: a.name,
      plays: a.plays,
      minutes: Math.round(a.sec / 60),
      artworkUrl: a.artworkUrl,
      serviceId: a.serviceId,
    }))
    .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes)
    .slice(0, 12);

  const topTracks = [...trackMap.values()]
    .map((t) => ({
      title: t.title,
      artist: t.artist,
      plays: t.plays,
      minutes: Math.round(t.sec / 60),
      artworkUrl: t.artworkUrl,
      serviceId: t.serviceId,
      url: t.url,
    }))
    .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes)
    .slice(0, 15);

  const recentPlays = [...valid].sort((a, b) => b.startedAt - a.startedAt).slice(0, 25);

  return {
    totalPlays,
    totalMinutes: Math.round(totalSec / 60),
    streakDays,
    byService,
    topArtists,
    topTracks,
    recentPlays,
  };
}
