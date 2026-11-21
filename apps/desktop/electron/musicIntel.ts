import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  AI_PROVIDER_DEFAULT_MODELS,
  cleanTrackAndArtist,
  parseLrcLyrics,
  type AiAskResponse,
  type AiCompanionConfig,
  type ArtistDossier,
  type SuggestedBand,
  type SuggestedBandTrack,
  type SyncedLyricsResult,
} from '@omnideck/shared';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 120;
const USER_AGENT = 'OmniDeck/1.4.4 (https://github.com/DanHalse/omnideck)';

interface CacheFileShape {
  dossiers: Record<string, ArtistDossier>;
  bands: Record<string, SuggestedBand>;
}

async function fetchJson<T>(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string>; method?: string; body?: string } = {},
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(options.headers ?? {}),
      },
      body: options.body,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDeezerArtistAndRelated(artistName: string): Promise<{
  pictureUrl?: string;
  related: SuggestedBand[];
}> {
  if (!artistName) return { related: [] };

  interface DeezerSearchRes {
    data?: Array<{ id: number; name: string; picture_xl?: string; picture_big?: string; nb_fan?: number }>;
  }
  interface DeezerRelatedRes {
    data?: Array<{ id: number; name: string; picture_medium?: string; picture_big?: string; nb_fan?: number }>;
  }

  const search = await fetchJson<DeezerSearchRes>(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=5`,
    { timeoutMs: 5000 },
  );
  const candidates = search?.data ?? [];
  if (candidates.length === 0) return { related: [] };

  const lower = artistName.toLowerCase();
  const best =
    candidates.find((c) => c.name.toLowerCase() === lower) ??
    candidates.find((c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())) ??
    candidates[0];

  const relatedRes = await fetchJson<DeezerRelatedRes>(
    `https://api.deezer.com/artist/${best.id}/related?limit=8`,
    { timeoutMs: 5000 },
  );

  const related: SuggestedBand[] = (relatedRes?.data ?? []).slice(0, 8).map((r) => ({
    id: `dz-${r.id}`,
    name: r.name,
    pictureUrl: r.picture_big || r.picture_medium,
    fans: r.nb_fan,
    topTracks: [],
    detailsLoaded: false,
  }));

  return {
    pictureUrl: best.picture_xl || best.picture_big,
    related,
  };
}

async function fetchDeezerTopTracks(artistName: string): Promise<{
  pictureUrl?: string;
  fans?: number;
  tracks: SuggestedBandTrack[];
}> {
  interface DeezerSearchRes {
    data?: Array<{ id: number; name: string; picture_big?: string; nb_fan?: number }>;
  }
  interface DeezerTopRes {
    data?: Array<{
      title: string;
      duration?: number;
      preview?: string;
      album?: { title?: string };
    }>;
  }

  const search = await fetchJson<DeezerSearchRes>(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=3`,
    { timeoutMs: 5000 },
  );
  const best = search?.data?.[0];
  if (!best) return { tracks: [] };

  const top = await fetchJson<DeezerTopRes>(
    `https://api.deezer.com/artist/${best.id}/top?limit=5`,
    { timeoutMs: 5000 },
  );
  const tracks: SuggestedBandTrack[] = (top?.data ?? []).slice(0, 3).map((t) => ({
    title: t.title,
    album: t.album?.title,
    previewUrl: t.preview || undefined,
    durationSec: typeof t.duration === 'number' ? t.duration : undefined,
  }));

  return {
    pictureUrl: best.picture_big,
    fans: best.nb_fan,
    tracks,
  };
}

async function fetchWikipediaArtistSummary(artistName: string): Promise<{
  bio: string;
  thumbnail?: string;
} | null> {
  if (!artistName) return null;

  interface WikiSearchRes {
    query?: { search?: Array<{ title: string; snippet?: string }> };
  }
  interface WikiSummaryRes {
    title?: string;
    extract?: string;
    type?: string;
    thumbnail?: { source?: string };
  }

  const trySummary = async (pageTitle: string) => {
    const data = await fetchJson<WikiSummaryRes>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle.replace(/\s+/g, '_'))}`,
      { timeoutMs: 4500 },
    );
    if (!data || !data.extract || data.type === 'disambiguation') return null;
    return {
      bio: data.extract.trim(),
      thumbnail: data.thumbnail?.source,
    };
  };

  // Try direct music-qualified searches first so generic words like "Boston" or "Genesis" match the band
  const searchRes = await fetchJson<WikiSearchRes>(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${artistName}" band OR musician OR singer OR rapper`)}&srlimit=4&format=json`,
    { timeoutMs: 5000 },
  );

  const hits = searchRes?.query?.search ?? [];
  const lower = artistName.toLowerCase();
  const preferred =
    hits.find((h) => h.title.toLowerCase() === lower) ??
    hits.find((h) => h.title.toLowerCase().startsWith(`${lower} (`)) ??
    hits.find((h) => h.title.toLowerCase().includes(lower)) ??
    hits[0];

  if (preferred) {
    const summary = await trySummary(preferred.title);
    if (summary) return summary;
  }

  return trySummary(artistName);
}

async function fetchMusicBrainzMetadata(artistName: string): Promise<{
  origin?: string;
  activeYears?: string;
  genres: string[];
  members: string[];
  essentialAlbums: string[];
}> {
  if (!artistName) return { genres: [], members: [], essentialAlbums: [] };

  interface MbSearchRes {
    artists?: Array<{
      id: string;
      name: string;
      score?: number;
      area?: { name?: string };
      'begin-area'?: { name?: string };
      'life-span'?: { begin?: string; end?: string; ended?: boolean };
      tags?: Array<{ name: string; count?: number }>;
    }>;
  }
  interface MbArtistDetailRes {
    relations?: Array<{
      type?: string;
      direction?: string;
      ended?: boolean;
      artist?: { name?: string };
    }>;
    'release-groups'?: Array<{
      title?: string;
      'primary-type'?: string;
      'secondary-types'?: string[];
      'first-release-date'?: string;
    }>;
  }

  const search = await fetchJson<MbSearchRes>(
    `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(`"${artistName}"`)}&limit=3&fmt=json`,
    { timeoutMs: 5500 },
  );
  const top = search?.artists?.[0];
  if (!top) return { genres: [], members: [], essentialAlbums: [] };

  const originParts = [top['begin-area']?.name, top.area?.name].filter(
    (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i,
  );
  const origin = originParts.length > 0 ? originParts.join(', ') : undefined;

  let activeYears: string | undefined;
  const begin = top['life-span']?.begin?.slice(0, 4);
  const end = top['life-span']?.end?.slice(0, 4);
  if (begin) {
    activeYears = top['life-span']?.ended
      ? end
        ? `${begin}–${end}`
        : `${begin} (Disbanded)`
      : `${begin}–present`;
  }

  const genres = (top.tags ?? [])
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .map((t) => t.name)
    .filter((n) => n && n.length <= 28)
    .slice(0, 6);

  const detail = await fetchJson<MbArtistDetailRes>(
    `https://musicbrainz.org/ws/2/artist/${top.id}?inc=artist-rels+release-groups&fmt=json`,
    { timeoutMs: 5500 },
  );

  const members: string[] = [];
  if (detail?.relations) {
    const memberRels = detail.relations.filter(
      (r) => r.type === 'member of band' && r.artist?.name,
    );
    // Prefer active members first, then past members
    const sorted = [...memberRels].sort((a, b) => Number(Boolean(a.ended)) - Number(Boolean(b.ended)));
    for (const rel of sorted) {
      const name = rel.artist?.name?.trim();
      if (name && !members.includes(name)) {
        members.push(name);
      }
      if (members.length >= 6) break;
    }
  }

  const essentialAlbums: string[] = [];
  if (detail?.['release-groups']) {
    const albums = detail['release-groups']
      .filter(
        (rg) =>
          rg['primary-type'] === 'Album' &&
          (!rg['secondary-types'] || rg['secondary-types'].length === 0) &&
          rg.title,
      )
      .sort((a, b) => (a['first-release-date'] || '9999').localeCompare(b['first-release-date'] || '9999'));
    for (const alb of albums) {
      const yr = alb['first-release-date']?.slice(0, 4);
      const label = yr ? `${alb.title} (${yr})` : alb.title!;
      if (!essentialAlbums.includes(label)) {
        essentialAlbums.push(label);
      }
      if (essentialAlbums.length >= 6) break;
    }
  }

  return { origin, activeYears, genres, members, essentialAlbums };
}

async function fetchSyncedLyrics(
  artistName: string,
  trackTitle: string,
  albumName?: string,
  durationSec?: number,
): Promise<SyncedLyricsResult> {
  if (!trackTitle) {
    return { synced: false, lines: [], plainText: '', source: 'none' };
  }

  interface LrcLibRecord {
    trackName?: string;
    artistName?: string;
    albumName?: string;
    duration?: number;
    syncedLyrics?: string | null;
    plainLyrics?: string | null;
  }

  const pickBestMatch = (records: LrcLibRecord[]): LrcLibRecord | null => {
    if (!records.length) return null;
    const targetArtist = artistName.toLowerCase();
    const targetTrack = trackTitle.toLowerCase();

    let best: LrcLibRecord | null = null;
    let bestScore = -Infinity;

    for (const item of records) {
      let score = 0;
      if (item.syncedLyrics) score += 100;
      else if (item.plainLyrics) score += 20;
      else continue;

      const itemArtist = (item.artistName || '').toLowerCase();
      const itemTrack = (item.trackName || '').toLowerCase();
      if (targetArtist && itemArtist === targetArtist) score += 35;
      else if (targetArtist && (itemArtist.includes(targetArtist) || targetArtist.includes(itemArtist))) score += 18;

      if (targetTrack && itemTrack === targetTrack) score += 35;
      else if (targetTrack && (itemTrack.includes(targetTrack) || targetTrack.includes(itemTrack))) score += 15;

      // Strongly prefer versions whose duration matches the actual playing track (avoids live/intro/extended drift)
      if (typeof durationSec === 'number' && durationSec > 10 && typeof item.duration === 'number' && item.duration > 10) {
        const diff = Math.abs(item.duration - durationSec);
        if (diff <= 2) score += 60;
        else if (diff <= 5) score += 35;
        else if (diff <= 10) score += 10;
        else score -= Math.min(80, diff * 1.5);
      }

      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  };

  const params = new URLSearchParams();
  params.set('track_name', trackTitle);
  if (artistName) params.set('artist_name', artistName);
  if (albumName) params.set('album_name', albumName);
  if (durationSec && durationSec > 10) params.set('duration', String(Math.round(durationSec)));

  let record = await fetchJson<LrcLibRecord>(
    `https://lrclib.net/api/get?${params.toString()}`,
    { timeoutMs: 4000 },
  );

  // If /api/get missed OR returned a version whose duration differs by >5s, search and rank by duration proximity
  const durationMismatch =
    Boolean(
      record &&
        typeof durationSec === 'number' &&
        durationSec > 10 &&
        typeof record.duration === 'number' &&
        Math.abs(record.duration - durationSec) > 5,
    );

  if (!record || !record.syncedLyrics || durationMismatch) {
    const q = [artistName, trackTitle].filter(Boolean).join(' ');
    const list = await fetchJson<LrcLibRecord[]>(
      `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
      { timeoutMs: 4500 },
    );
    if (Array.isArray(list) && list.length > 0) {
      const candidate = pickBestMatch(record ? [record, ...list] : list);
      if (candidate) record = candidate;
    }
  }

  if (!record) {
    return { synced: false, lines: [], plainText: '', source: 'none' };
  }

  const lines = record.syncedLyrics ? parseLrcLyrics(record.syncedLyrics) : [];
  const plainText = (record.plainLyrics || lines.map((l) => l.text).join('\n')).trim();

  return {
    synced: lines.length > 0,
    lines,
    plainText,
    source: lines.length > 0 || plainText ? 'lrclib' : 'none',
  };
}

async function callConfiguredAi(
  cfg: AiCompanionConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 650,
): Promise<{ text: string | null; error?: string }> {
  if (cfg.provider === 'none') {
    return { text: null, error: 'AI Companion is set to Free Open APIs Only.' };
  }
  if (cfg.provider !== 'ollama' && !cfg.apiKey.trim()) {
    return { text: null, error: `Add your ${cfg.provider} API key in Settings → AI Companion.` };
  }

  const model = cfg.model.trim() || AI_PROVIDER_DEFAULT_MODELS[cfg.provider];

  try {
    if (cfg.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey.trim())}`;
      const res = await fetchJson<{
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string };
      }>(url, {
        method: 'POST',
        timeoutMs: 18_000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
        }),
      });
      const text = res?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
      if (text) return { text };
      return { text: null, error: res?.error?.message || 'Gemini returned an empty response.' };
    }

    if (cfg.provider === 'openai') {
      const res = await fetchJson<{
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      }>('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        timeoutMs: 18_000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.5,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      const text = res?.choices?.[0]?.message?.content?.trim();
      if (text) return { text };
      return { text: null, error: res?.error?.message || 'OpenAI returned an empty response.' };
    }

    if (cfg.provider === 'anthropic') {
      const res = await fetchJson<{
        content?: Array<{ text?: string }>;
        error?: { message?: string };
      }>('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        timeoutMs: 18_000,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey.trim(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      const text = res?.content?.map((c) => c.text ?? '').join('').trim();
      if (text) return { text };
      return { text: null, error: res?.error?.message || 'Anthropic returned an empty response.' };
    }

    if (cfg.provider === 'ollama') {
      const base = (cfg.ollamaBaseUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const res = await fetchJson<{ message?: { content?: string }; response?: string }>(
        `${base}/api/chat`,
        {
          method: 'POST',
          timeoutMs: 25_000,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        },
      );
      const text = (res?.message?.content || res?.response || '').trim();
      if (text) return { text };
      return { text: null, error: `Could not reach Ollama at ${base} (is model "${model}" pulled?).` };
    }
  } catch (err) {
    return { text: null, error: err instanceof Error ? err.message : String(err) };
  }

  return { text: null, error: 'Unsupported AI provider.' };
}

export class MusicIntelService {
  private readonly cachePath: string;
  private cache: CacheFileShape;
  private inflight = new Map<string, Promise<ArtistDossier>>();
  private lyricsCache = new Map<string, SyncedLyricsResult>();

  constructor(customCachePath?: string) {
    this.cachePath =
      customCachePath ?? path.join(app.getPath('userData'), 'omnideck-music-cache.json');
    this.cache = this.loadCache();
  }

  /**
   * Fast LRCLIB-only lookup (bypasses Wikipedia/MusicBrainz/Deezer) so the Floating Mini-Player HUD
   * gets duration-matched synced lyrics within ~150ms of a song change.
   */
  async getSyncedLyricsFast(input: {
    title: string;
    artist?: string;
    album?: string;
    durationSec?: number;
  }): Promise<SyncedLyricsResult> {
    const cleaned = cleanTrackAndArtist(input.title, input.artist);
    const trackTitle = cleaned.track || input.title.trim();
    const artistName = cleaned.artist || input.artist?.trim() || '';
    const durBucket =
      typeof input.durationSec === 'number' && input.durationSec > 10
        ? Math.round(input.durationSec / 4) * 4
        : 0;
    const key = `${artistName.toLowerCase()}::${trackTitle.toLowerCase()}::${durBucket}`;
    const hit = this.lyricsCache.get(key);
    if (hit) return hit;

    const res = await fetchSyncedLyrics(artistName, trackTitle, input.album, input.durationSec);
    if (this.lyricsCache.size > 150) {
      const oldest = this.lyricsCache.keys().next().value;
      if (oldest) this.lyricsCache.delete(oldest);
    }
    this.lyricsCache.set(key, res);
    return res;
  }

  async getArtistDossier(
    input: {
      serviceId: string;
      title: string;
      artist?: string;
      album?: string;
      artworkUrl?: string;
      durationSec?: number;
      forceRefresh?: boolean;
    },
    aiConfig: AiCompanionConfig,
  ): Promise<ArtistDossier> {
    const cleaned = cleanTrackAndArtist(input.title, input.artist);
    const trackTitle = cleaned.track || input.title.trim();
    const artistName = cleaned.artist || input.artist?.trim() || '';
    const aiTag = aiConfig.provider !== 'none' && aiConfig.autoEnrich ? aiConfig.provider : 'free';
    const durBucket =
      typeof input.durationSec === 'number' && input.durationSec > 10
        ? Math.round(input.durationSec / 6) * 6
        : 0;
    const queryKey = `${artistName.toLowerCase()}::${trackTitle.toLowerCase()}::${durBucket}::${aiTag}`;

    if (!input.forceRefresh) {
      const cached = this.cache.dossiers[queryKey];
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return {
          ...cached,
          serviceId: input.serviceId,
          artworkUrl: input.artworkUrl || cached.artworkUrl,
        };
      }
    }

    const existing = this.inflight.get(queryKey);
    if (existing) return existing;

    const promise = this.buildDossier(queryKey, input, trackTitle, artistName, aiConfig).finally(
      () => {
        this.inflight.delete(queryKey);
      },
    );
    this.inflight.set(queryKey, promise);
    return promise;
  }

  async getBandDetails(bandName: string): Promise<SuggestedBand> {
    const key = bandName.trim().toLowerCase();
    const cached = this.cache.bands[key];
    if (cached && cached.detailsLoaded) {
      return cached;
    }

    const [wiki, deezer, mb] = await Promise.all([
      fetchWikipediaArtistSummary(bandName),
      fetchDeezerTopTracks(bandName),
      fetchMusicBrainzMetadata(bandName),
    ]);

    const band: SuggestedBand = {
      id: cached?.id || `band-${key.replace(/[^a-z0-9]+/g, '-')}`,
      name: bandName.trim(),
      pictureUrl: deezer.pictureUrl || wiki?.thumbnail || cached?.pictureUrl,
      fans: deezer.fans ?? cached?.fans,
      tags: mb.genres.slice(0, 4),
      bio: wiki?.bio || `${bandName} is a similar artist recommended for your current session.`,
      topTracks: deezer.tracks,
      detailsLoaded: true,
    };

    this.cache.bands[key] = band;
    this.trimAndSaveCache();
    return band;
  }

  async askMusicAi(
    dossier: ArtistDossier,
    question: string,
    aiConfig: AiCompanionConfig,
  ): Promise<AiAskResponse> {
    if (aiConfig.provider === 'none') {
      return {
        answer: '',
        provider: 'none',
        error: 'Configure Gemini, OpenAI, Claude, or local Ollama in Settings → AI Companion to unlock interactive AI Q&A.',
      };
    }

    const systemPrompt =
      'You are OmniDeck Music Companion, a concise, knowledgeable music historian and tastemaker. ' +
      'Ground your answer in the provided verified metadata. Keep answers scannable (bullet points or 2-4 crisp sentences), engaging, and free of filler.';

    const contextLines = [
      `Track: "${dossier.trackTitle}"`,
      `Artist: ${dossier.artistName}`,
      dossier.albumName ? `Album: ${dossier.albumName}` : '',
      dossier.origin ? `Origin: ${dossier.origin}` : '',
      dossier.activeYears ? `Active: ${dossier.activeYears}` : '',
      dossier.genres.length > 0 ? `Genres: ${dossier.genres.join(', ')}` : '',
      dossier.bio ? `Artist Bio: ${dossier.bio.slice(0, 450)}` : '',
      dossier.suggestedBands.length > 0
        ? `Related Artists: ${dossier.suggestedBands.map((b) => b.name).join(', ')}`
        : '',
      dossier.lyrics?.plainText
        ? `Lyrics Excerpt:\n${dossier.lyrics.plainText.slice(0, 900)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const res = await callConfiguredAi(
      aiConfig,
      systemPrompt,
      `${contextLines}\n\nUser Question: ${question}`,
      550,
    );

    return {
      answer: res.text ?? '',
      provider: aiConfig.provider,
      error: res.error,
    };
  }

  async testAiConnection(aiConfig: AiCompanionConfig): Promise<{ ok: boolean; message: string }> {
    if (aiConfig.provider === 'none') {
      return { ok: true, message: 'Free Open APIs mode active (no AI key needed).' };
    }
    const res = await callConfiguredAi(
      aiConfig,
      'Reply with exactly: OK',
      'Connection test',
      16,
    );
    if (res.text) {
      return { ok: true, message: `Connected to ${aiConfig.provider} (${aiConfig.model || AI_PROVIDER_DEFAULT_MODELS[aiConfig.provider]}).` };
    }
    return { ok: false, message: res.error || 'Connection test failed.' };
  }

  private async buildDossier(
    queryKey: string,
    input: {
      serviceId: string;
      title: string;
      artist?: string;
      album?: string;
      artworkUrl?: string;
      durationSec?: number;
    },
    trackTitle: string,
    artistName: string,
    aiConfig: AiCompanionConfig,
  ): Promise<ArtistDossier> {
    const [wiki, deezer, mb, lyrics] = await Promise.all([
      fetchWikipediaArtistSummary(artistName),
      fetchDeezerArtistAndRelated(artistName),
      fetchMusicBrainzMetadata(artistName),
      fetchSyncedLyrics(artistName, trackTitle, input.album, input.durationSec),
    ]);

    const sources: string[] = [];
    if (wiki) sources.push('Wikipedia');
    if (mb.genres.length > 0 || mb.origin || mb.members.length > 0) sources.push('MusicBrainz');
    if (deezer.related.length > 0) sources.push('Deezer');
    if (lyrics.source === 'lrclib') sources.push('LRCLIB');

    let dossier: ArtistDossier = {
      queryKey,
      fetchedAt: Date.now(),
      serviceId: input.serviceId,
      trackTitle,
      artistName: artistName || 'Unknown Artist',
      albumName: input.album || undefined,
      artworkUrl: input.artworkUrl || deezer.pictureUrl || wiki?.thumbnail,
      bio:
        wiki?.bio ||
        (artistName
          ? `Explore ${artistName}'s sound, related bands, and synced lyrics right alongside your music.`
          : 'Play a song on YouTube Music or Spotify to inspect artist information and suggested bands.'),
      origin: mb.origin,
      activeYears: mb.activeYears,
      genres: mb.genres,
      members: mb.members,
      essentialAlbums: mb.essentialAlbums,
      suggestedBands: deezer.related,
      lyrics,
      aiEnriched: false,
      sources,
    };

    // Optional AI Enrichment (grounds trackContext + "why these bands match" reasons in verified metadata)
    if (
      aiConfig.provider !== 'none' &&
      aiConfig.autoEnrich &&
      artistName &&
      (aiConfig.provider === 'ollama' || Boolean(aiConfig.apiKey.trim()))
    ) {
      const enriched = await this.enrichWithAi(dossier, aiConfig);
      if (enriched) {
        dossier = enriched;
      }
    }

    this.cache.dossiers[queryKey] = dossier;
    this.trimAndSaveCache();
    return dossier;
  }

  private async enrichWithAi(
    dossier: ArtistDossier,
    aiConfig: AiCompanionConfig,
  ): Promise<ArtistDossier | null> {
    const bandNames = dossier.suggestedBands.map((b) => b.name);
    const systemPrompt =
      'You are OmniDeck Music Companion. Return ONLY valid JSON with no markdown fences using this exact schema: ' +
      '{"trackContext":"2-3 concise sentences about the track sound, era, production, or vibe","bandReasons":{"Band Name":"Short 1-sentence reason why fans of this track will like them"},"extraBands":[{"name":"Band Name","reason":"Short 1-sentence match reason"}]}';

    const userPrompt = [
      `Track: "${dossier.trackTitle}" by ${dossier.artistName}`,
      dossier.albumName ? `Album: ${dossier.albumName}` : '',
      dossier.genres.length ? `Genres: ${dossier.genres.join(', ')}` : '',
      `Existing similar bands to annotate: ${bandNames.length > 0 ? bandNames.join(', ') : '(none found — please suggest 5 bands in extraBands)'}`,
    ]
      .filter(Boolean)
      .join('\n');

    const res = await callConfiguredAi(aiConfig, systemPrompt, userPrompt, 500);
    if (!res.text) return null;

    try {
      const cleanedJson = res.text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const firstBrace = cleanedJson.indexOf('{');
      const lastBrace = cleanedJson.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) return null;
      const parsed = JSON.parse(cleanedJson.slice(firstBrace, lastBrace + 1)) as {
        trackContext?: string;
        bandReasons?: Record<string, string>;
        extraBands?: Array<{ name?: string; reason?: string }>;
      };

      const reasonsLower = new Map<string, string>();
      if (parsed.bandReasons && typeof parsed.bandReasons === 'object') {
        for (const [k, v] of Object.entries(parsed.bandReasons)) {
          if (typeof v === 'string' && v.trim()) {
            reasonsLower.set(k.toLowerCase(), v.trim());
          }
        }
      }

      const suggestedBands = dossier.suggestedBands.map((band) => ({
        ...band,
        reason: reasonsLower.get(band.name.toLowerCase()) || band.reason,
      }));

      // If Deezer returned fewer than 4 bands, supplement with AI-suggested bands
      if (suggestedBands.length < 4 && Array.isArray(parsed.extraBands)) {
        for (const extra of parsed.extraBands) {
          const name = extra?.name?.trim();
          if (!name) continue;
          if (suggestedBands.some((b) => b.name.toLowerCase() === name.toLowerCase())) continue;
          suggestedBands.push({
            id: `ai-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            name,
            reason: extra.reason?.trim(),
            topTracks: [],
            detailsLoaded: false,
          });
        }
      }

      return {
        ...dossier,
        trackContext: typeof parsed.trackContext === 'string' ? parsed.trackContext.trim() : dossier.trackContext,
        suggestedBands: suggestedBands.slice(0, 8),
        aiEnriched: true,
        aiProvider: aiConfig.provider,
        sources: dossier.sources.includes(`AI (${aiConfig.provider})`)
          ? dossier.sources
          : [...dossier.sources, `AI (${aiConfig.provider})`],
      };
    } catch {
      return null;
    }
  }

  private loadCache(): CacheFileShape {
    try {
      if (!fs.existsSync(this.cachePath)) {
        return { dossiers: {}, bands: {} };
      }
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8')) as Partial<CacheFileShape>;
      return {
        dossiers: parsed.dossiers && typeof parsed.dossiers === 'object' ? parsed.dossiers : {},
        bands: parsed.bands && typeof parsed.bands === 'object' ? parsed.bands : {},
      };
    } catch {
      return { dossiers: {}, bands: {} };
    }
  }

  private trimAndSaveCache(): void {
    try {
      const entries = Object.entries(this.cache.dossiers);
      if (entries.length > MAX_CACHE_ENTRIES) {
        entries.sort((a, b) => (b[1]?.fetchedAt ?? 0) - (a[1]?.fetchedAt ?? 0));
        this.cache.dossiers = Object.fromEntries(entries.slice(0, MAX_CACHE_ENTRIES));
      }
      const bandEntries = Object.entries(this.cache.bands);
      if (bandEntries.length > MAX_CACHE_ENTRIES * 2) {
        this.cache.bands = Object.fromEntries(bandEntries.slice(-MAX_CACHE_ENTRIES * 2));
      }
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      const tmp = `${this.cachePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.cache), 'utf-8');
      fs.renameSync(tmp, this.cachePath);
    } catch {
      // Non-critical cache failure
    }
  }
}
