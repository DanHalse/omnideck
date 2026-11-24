import AsyncStorage from '@react-native-async-storage/async-storage';
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

const CACHE_PREFIX = 'omnideck:mobile-music-cache:v1:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USER_AGENT = 'OmniDeck-Android/1.6.0 (https://github.com/DanHalse/omnideck)';

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

async function fetchDeezerRelated(artistName: string): Promise<{
  pictureUrl?: string;
  related: SuggestedBand[];
}> {
  if (!artistName) return { related: [] };
  const search = await fetchJson<{
    data?: Array<{ id: number; name: string; picture_xl?: string; picture_big?: string; nb_fan?: number }>;
  }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=5`);

  const list = search?.data ?? [];
  if (list.length === 0) return { related: [] };
  const lower = artistName.toLowerCase();
  const best =
    list.find((c) => c.name.toLowerCase() === lower) ??
    list.find((c) => c.name.toLowerCase().includes(lower)) ??
    list[0];

  const rel = await fetchJson<{
    data?: Array<{ id: number; name: string; picture_big?: string; picture_medium?: string; nb_fan?: number }>;
  }>(`https://api.deezer.com/artist/${best.id}/related?limit=8`);

  return {
    pictureUrl: best.picture_xl || best.picture_big,
    related: (rel?.data ?? []).slice(0, 8).map((r) => ({
      id: `dz-${r.id}`,
      name: r.name,
      pictureUrl: r.picture_big || r.picture_medium,
      fans: r.nb_fan,
      topTracks: [],
      detailsLoaded: false,
    })),
  };
}

async function fetchWikipediaSummary(artistName: string): Promise<{
  bio: string;
  thumbnail?: string;
} | null> {
  if (!artistName) return null;
  const searchRes = await fetchJson<{
    query?: { search?: Array<{ title: string }> };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${artistName}" band OR musician OR singer`)}&srlimit=4&format=json`,
  );

  const hits = searchRes?.query?.search ?? [];
  const lower = artistName.toLowerCase();
  const preferred =
    hits.find((h) => h.title.toLowerCase() === lower) ??
    hits.find((h) => h.title.toLowerCase().startsWith(`${lower} (`)) ??
    hits[0];

  const titleToFetch = preferred?.title || artistName;
  const summary = await fetchJson<{
    extract?: string;
    type?: string;
    thumbnail?: { source?: string };
  }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titleToFetch.replace(/\s+/g, '_'))}`);

  if (!summary || !summary.extract || summary.type === 'disambiguation') return null;
  return {
    bio: summary.extract.trim(),
    thumbnail: summary.thumbnail?.source,
  };
}

async function fetchMusicBrainz(artistName: string): Promise<{
  origin?: string;
  activeYears?: string;
  genres: string[];
  members: string[];
  essentialAlbums: string[];
}> {
  if (!artistName) return { genres: [], members: [], essentialAlbums: [] };
  const search = await fetchJson<{
    artists?: Array<{
      id: string;
      name: string;
      area?: { name?: string };
      'begin-area'?: { name?: string };
      'life-span'?: { begin?: string; end?: string; ended?: boolean };
      tags?: Array<{ name: string; count?: number }>;
    }>;
  }>(`https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(`"${artistName}"`)}&limit=3&fmt=json`);

  const top = search?.artists?.[0];
  if (!top) return { genres: [], members: [], essentialAlbums: [] };

  const originParts = [top['begin-area']?.name, top.area?.name].filter(
    (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i,
  );
  const origin = originParts.length > 0 ? originParts.join(', ') : undefined;

  const begin = top['life-span']?.begin?.slice(0, 4);
  const end = top['life-span']?.end?.slice(0, 4);
  const activeYears = begin
    ? top['life-span']?.ended
      ? end
        ? `${begin}–${end}`
        : `${begin} (Disbanded)`
      : `${begin}–present`
    : undefined;

  const genres = (top.tags ?? [])
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .map((t) => t.name)
    .filter((n) => n && n.length <= 28)
    .slice(0, 6);

  const detail = await fetchJson<{
    relations?: Array<{ type?: string; ended?: boolean; artist?: { name?: string } }>;
    'release-groups'?: Array<{
      title?: string;
      'primary-type'?: string;
      'secondary-types'?: string[];
      'first-release-date'?: string;
    }>;
  }>(`https://musicbrainz.org/ws/2/artist/${top.id}?inc=artist-rels+release-groups&fmt=json`);

  const members: string[] = [];
  for (const rel of (detail?.relations ?? [])
    .filter((r) => r.type === 'member of band' && r.artist?.name)
    .sort((a, b) => Number(Boolean(a.ended)) - Number(Boolean(b.ended)))) {
    const n = rel.artist?.name?.trim();
    if (n && !members.includes(n)) members.push(n);
    if (members.length >= 6) break;
  }

  const essentialAlbums: string[] = [];
  for (const rg of (detail?.['release-groups'] ?? [])
    .filter(
      (g) =>
        g['primary-type'] === 'Album' &&
        (!g['secondary-types'] || g['secondary-types'].length === 0) &&
        g.title,
    )
    .sort((a, b) => (a['first-release-date'] || '9999').localeCompare(b['first-release-date'] || '9999'))) {
    const yr = rg['first-release-date']?.slice(0, 4);
    const label = yr ? `${rg.title} (${yr})` : rg.title!;
    if (!essentialAlbums.includes(label)) essentialAlbums.push(label);
    if (essentialAlbums.length >= 6) break;
  }

  return { origin, activeYears, genres, members, essentialAlbums };
}

async function fetchLyrics(
  artistName: string,
  trackTitle: string,
  albumName?: string,
): Promise<SyncedLyricsResult> {
  if (!trackTitle) return { synced: false, lines: [], plainText: '', source: 'none' };
  const strippedTrack = trackTitle
    .replace(/\s*[\(\[][^\)\]]*(remaster|live|feat|ft\.|official|audio|video|deluxe|version|edit|radio|mono|stereo)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s+-\s+(remaster(ed)?|live|single|radio edit|acoustic).*$/i, '')
    .trim();

  const params = new URLSearchParams({ track_name: strippedTrack || trackTitle });
  if (artistName) params.set('artist_name', artistName);
  if (albumName) params.set('album_name', albumName);

  let rec = await fetchJson<{ syncedLyrics?: string | null; plainLyrics?: string | null }>(
    `https://lrclib.net/api/get?${params.toString()}`,
    { timeoutMs: 5000 },
  );

  if (!rec || (!rec.syncedLyrics && !rec.plainLyrics)) {
    const queries = Array.from(
      new Set(
        [
          `${artistName} ${strippedTrack || trackTitle}`.trim(),
          `${artistName} ${trackTitle}`.trim(),
          strippedTrack && strippedTrack !== trackTitle ? strippedTrack : '',
        ].filter(Boolean),
      ),
    );
    for (const q of queries) {
      const list = await fetchJson<Array<{ syncedLyrics?: string | null; plainLyrics?: string | null }>>(
        `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
        { timeoutMs: 5000 },
      );
      if (Array.isArray(list) && list.length > 0) {
        rec = list.find((i) => Boolean(i.syncedLyrics)) ?? list.find((i) => Boolean(i.plainLyrics)) ?? list[0];
        if (rec?.syncedLyrics || rec?.plainLyrics) break;
      }
    }
  }
  if (!rec) return { synced: false, lines: [], plainText: '', source: 'none' };
  const lines = rec.syncedLyrics ? parseLrcLyrics(rec.syncedLyrics) : [];
  const plainText = (rec.plainLyrics || lines.map((l) => l.text).join('\n')).trim();
  return {
    synced: lines.length > 0,
    lines,
    plainText,
    source: lines.length > 0 || plainText ? 'lrclib' : 'none',
  };
}

export async function fetchMobileArtistDossier(input: {
  serviceId: string;
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
}): Promise<ArtistDossier> {
  const cleaned = cleanTrackAndArtist(input.title, input.artist);
  const trackTitle = cleaned.track || input.title.trim();
  const artistName = cleaned.artist || input.artist?.trim() || '';
  const queryKey = `${artistName.toLowerCase()}::${trackTitle.toLowerCase()}`;

  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${queryKey}`);
    if (raw) {
      const parsed = JSON.parse(raw) as ArtistDossier;
      const hasLyrics = Boolean(parsed.lyrics && (parsed.lyrics.lines.length > 0 || parsed.lyrics.plainText));
      if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS && hasLyrics) {
        return { ...parsed, serviceId: input.serviceId, artworkUrl: input.artworkUrl || parsed.artworkUrl };
      }
    }
  } catch {
    // ignore cache miss
  }

  const [wiki, deezer, mb, lyrics] = await Promise.all([
    fetchWikipediaSummary(artistName),
    fetchDeezerRelated(artistName),
    fetchMusicBrainz(artistName),
    fetchLyrics(artistName, trackTitle, input.album),
  ]);

  const sources: string[] = [];
  if (wiki) sources.push('Wikipedia');
  if (mb.genres.length > 0 || mb.origin) sources.push('MusicBrainz');
  if (deezer.related.length > 0) sources.push('Deezer');
  if (lyrics.source === 'lrclib') sources.push('LRCLIB');

  const dossier: ArtistDossier = {
    queryKey,
    fetchedAt: Date.now(),
    serviceId: input.serviceId,
    trackTitle,
    artistName: artistName || 'Unknown Artist',
    albumName: input.album,
    artworkUrl: input.artworkUrl || deezer.pictureUrl || wiki?.thumbnail,
    bio:
      wiki?.bio ||
      (artistName
        ? `Explore ${artistName}'s sound, related bands, and synced lyrics inside OmniDeck.`
        : 'Play a song in YouTube Music or Spotify to view live artist details.'),
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

  try {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${queryKey}`, JSON.stringify(dossier));
  } catch {
    // ignore storage quota
  }

  return dossier;
}

export async function fetchMobileBandDetails(bandName: string): Promise<SuggestedBand> {
  const [wiki, search, mb] = await Promise.all([
    fetchWikipediaSummary(bandName),
    fetchJson<{
      data?: Array<{ id: number; name: string; picture_big?: string; nb_fan?: number }>;
    }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(bandName)}&limit=3`),
    fetchMusicBrainz(bandName),
  ]);

  const best = search?.data?.[0];
  let topTracks: SuggestedBandTrack[] = [];
  if (best) {
    const top = await fetchJson<{
      data?: Array<{ title: string; duration?: number; preview?: string; album?: { title?: string } }>;
    }>(`https://api.deezer.com/artist/${best.id}/top?limit=3`);
    topTracks = (top?.data ?? []).slice(0, 3).map((t) => ({
      title: t.title,
      album: t.album?.title,
      previewUrl: t.preview || undefined,
      durationSec: t.duration,
    }));
  }

  return {
    id: `band-${bandName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: bandName,
    pictureUrl: best?.picture_big || wiki?.thumbnail,
    fans: best?.nb_fan,
    tags: mb.genres.slice(0, 4),
    bio: wiki?.bio || `${bandName} is recommended based on your current listening session.`,
    topTracks,
    detailsLoaded: true,
  };
}

export async function askMobileMusicAi(
  dossier: ArtistDossier,
  question: string,
  aiConfig: AiCompanionConfig,
): Promise<AiAskResponse> {
  if (aiConfig.provider === 'none' || (aiConfig.provider !== 'ollama' && !aiConfig.apiKey.trim())) {
    return {
      answer: '',
      provider: aiConfig.provider,
      error: 'Configure Gemini, OpenAI, or Claude API key in Settings to unlock AI Q&A.',
    };
  }
  const model = aiConfig.model.trim() || AI_PROVIDER_DEFAULT_MODELS[aiConfig.provider];
  const systemPrompt =
    'You are OmniDeck Music Companion. Give a concise, engaging 2-4 sentence answer grounded in the provided music metadata.';
  const userPrompt = `Track: "${dossier.trackTitle}" by ${dossier.artistName}\nGenres: ${dossier.genres.join(', ')}\nQuestion: ${question}`;

  if (aiConfig.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(aiConfig.apiKey.trim())}`;
    const res = await fetchJson<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    }>(url, {
      method: 'POST',
      timeoutMs: 16_000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      }),
    });
    const text = res?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    return { answer: text || '', provider: 'gemini', error: text ? undefined : res?.error?.message || 'Empty response.' };
  }

  if (aiConfig.provider === 'openai') {
    const res = await fetchJson<{
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    }>('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      timeoutMs: 16_000,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiConfig.apiKey.trim()}` },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const text = res?.choices?.[0]?.message?.content?.trim();
    return { answer: text || '', provider: 'openai', error: text ? undefined : res?.error?.message || 'Empty response.' };
  }

  return {
    answer: '',
    provider: aiConfig.provider,
    error: 'Use Gemini or OpenAI API key on Android for mobile AI Q&A.',
  };
}
