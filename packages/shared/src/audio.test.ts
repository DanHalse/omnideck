import { describe, expect, it } from 'vitest';
import {
  addBlockedMusicEntry,
  addBookNote,
  buildMobilePowerUpsScript,
  clampVolumeBoost,
  cleanTrackAndArtist,
  computeListeningStatsSummary,
  createDefaultConfig,
  DEFAULT_POWER_UPS,
  findActiveLyricIndex,
  matchesBlockedMusic,
  mergeAiCompanionConfig,
  mergeEqualizerConfig,
  mergeIntegrationsConfig,
  mergePersistedConfig,
  parseLrcLyrics,
  removeBlockedMusicEntry,
  removeBookNote,
  serializeConfigForExport,
  type ListeningEntry,
} from './index.js';

describe('v1.4.0 audio, lyrics, AI & listening stats utilities', () => {
  it('cleans YouTube Music / Spotify track and artist noise accurately', () => {
    expect(cleanTrackAndArtist('Everlong (Official HD Video)', 'Foo Fighters - Topic')).toEqual({
      track: 'Everlong',
      artist: 'Foo Fighters',
    });

    expect(cleanTrackAndArtist('Tame Impala - Let It Happen [Remastered 2020]', 'YouTube Music')).toEqual({
      track: 'Let It Happen',
      artist: 'Tame Impala',
    });

    expect(cleanTrackAndArtist('Blinding Lights (Official Audio)', 'The WeekndVEVO')).toEqual({
      track: 'Blinding Lights',
      artist: 'The Weeknd',
    });
  });

  it('parses LRC timestamped lyrics and resolves active lyric line index', () => {
    const lrc = [
      '[00:12.50] First line of the song',
      '[00:25.00] Second line rises',
      '[01:02.150] Chorus hits hard',
    ].join('\n');

    const lines = parseLrcLyrics(lrc);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ timeSec: 12.5, text: 'First line of the song' });
    expect(lines[2].timeSec).toBeCloseTo(62.15, 2);

    expect(findActiveLyricIndex(lines, 5)).toBe(-1);
    expect(findActiveLyricIndex(lines, 13)).toBe(0);
    expect(findActiveLyricIndex(lines, 30)).toBe(1);
    expect(findActiveLyricIndex(lines, 70)).toBe(2);
  });

  it('computes private local listening stats summary with daily streak & rankings', () => {
    const now = new Date('2026-11-20T18:00:00Z').getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const entries: ListeningEntry[] = [
      {
        id: '1',
        serviceId: 'youtube-music',
        title: 'Do I Wanna Know?',
        artist: 'Arctic Monkeys',
        startedAt: now - 10_000,
        durationSec: 270,
      },
      {
        id: '2',
        serviceId: 'youtube-music',
        title: 'Do I Wanna Know?',
        artist: 'Arctic Monkeys',
        startedAt: now - dayMs,
        durationSec: 270,
      },
      {
        id: '3',
        serviceId: 'spotify',
        title: 'Nude',
        artist: 'Radiohead',
        startedAt: now - 2 * dayMs,
        durationSec: 240,
      },
      {
        id: '4',
        serviceId: 'youtube-music',
        title: 'Skipped quickly',
        artist: 'Ignored',
        startedAt: now - 5_000,
        durationSec: 4,
      },
    ];

    const summary = computeListeningStatsSummary(entries, now);
    expect(summary.totalPlays).toBe(3);
    expect(summary.totalMinutes).toBe(13);
    expect(summary.streakDays).toBe(3);
    expect(summary.topArtists[0].name).toBe('Arctic Monkeys');
    expect(summary.topArtists[0].plays).toBe(2);
    expect(summary.topTracks[0].title).toBe('Do I Wanna Know?');
    expect(summary.byService[0].serviceId).toBe('youtube-music');
  });

  it('clamps 10-band EQ values, compressor & volume boost, and merges AI companion defaults safely', () => {
    const eq = mergeEqualizerConfig({
      enabled: true,
      preset: 'custom',
      preampDb: 99,
      bands: [20, -30, 3.2],
      compressorEnabled: true,
      volumeBoost: 3.5,
    });
    expect(eq.preampDb).toBe(12);
    expect(eq.bands).toHaveLength(10);
    expect(eq.bands[0]).toBe(12);
    expect(eq.bands[1]).toBe(-12);
    expect(eq.bands[2]).toBe(3);
    expect(eq.bands[9]).toBe(0);
    expect(eq.compressorEnabled).toBe(true);
    expect(eq.volumeBoost).toBe(2.0);
    expect(clampVolumeBoost(0.4)).toBe(1.0);
    expect(clampVolumeBoost(1.65)).toBe(1.65);

    const ai = mergeAiCompanionConfig({
      provider: 'gemini',
      apiKey: '  secret-key  ',
      ollamaBaseUrl: 'javascript:alert(1)',
    });
    expect(ai.provider).toBe('gemini');
    expect(ai.apiKey).toBe('secret-key');
    expect(ai.model).toBe('gemini-2.5-flash');
    expect(ai.ollamaBaseUrl).toBe('http://localhost:11434');
  });

  it('migrates legacy smartAudioSwitching to audioFocusMode and strips AI & scrobbler secrets on export', () => {
    const migratedOff = mergePersistedConfig({
      settings: { smartAudioSwitching: false } as unknown as ReturnType<typeof createDefaultConfig>['settings'],
    });
    expect(migratedOff.settings.audioFocusMode).toBe('off');

    const cfg = createDefaultConfig();
    cfg.settings.aiCompanion.provider = 'openai';
    cfg.settings.aiCompanion.apiKey = 'sk-super-secret';
    cfg.settings.integrations = mergeIntegrationsConfig({
      discordRpcEnabled: true,
      listenBrainzEnabled: true,
      listenBrainzToken: 'lb-secret-token',
      lastFmEnabled: true,
      lastFmApiKey: 'lfm-pub-key',
      lastFmApiSecret: 'lfm-super-secret',
      lastFmSessionKey: 'lfm-session-key',
    });

    const exported = JSON.parse(serializeConfigForExport(cfg)) as {
      config: ReturnType<typeof createDefaultConfig>;
    };
    expect(exported.config.settings.aiCompanion.apiKey).toBe('');
    expect(exported.config.settings.aiCompanion.provider).toBe('openai');
    expect(exported.config.settings.integrations.listenBrainzToken).toBe('');
    expect(exported.config.settings.integrations.lastFmApiSecret).toBe('');
    expect(exported.config.settings.integrations.lastFmSessionKey).toBe('');
    expect(exported.config.settings.integrations.discordRpcEnabled).toBe(true);
  });

  it('generates Reddit mobile anti-app-nag and Spotify mobile responsive drawer scripts', () => {
    const redditScript = buildMobilePowerUpsScript('reddit', DEFAULT_POWER_UPS);
    expect(redditScript).toContain('__od_reddit_mobile_anti_xpromo');
    expect(redditScript).toContain('xpromo-app-selector');
    expect(redditScript).toContain('unlockScroll');

    const spotifyScript = buildMobilePowerUpsScript('spotify', DEFAULT_POWER_UPS);
    expect(spotifyScript).toContain('__od_spotify_mobile_css');
    expect(spotifyScript).toContain('__od_sp_lib_btn');
    expect(spotifyScript).toContain('width=device-width');
  });

  it('supports Universal Music Trashbin matching and Audible book notes state mutations', () => {
    let cfg = createDefaultConfig();
    cfg = addBlockedMusicEntry(cfg, { kind: 'artist', value: 'AI Slop Band' });
    cfg = addBlockedMusicEntry(cfg, { kind: 'artist', value: 'ai slop band' }); // dedupe
    cfg = addBlockedMusicEntry(cfg, {
      kind: 'track',
      value: 'Annoying Remix',
      artist: 'Some DJ',
    });
    expect(cfg.settings.blockedMusic).toHaveLength(2);

    expect(
      matchesBlockedMusic('Random Song', 'AI Slop Band (Official)', cfg.settings.blockedMusic),
    ).not.toBeNull();
    expect(
      matchesBlockedMusic('Annoying Remix', 'Some DJ', cfg.settings.blockedMusic),
    ).not.toBeNull();
    expect(
      matchesBlockedMusic('Good Song', 'Radiohead', cfg.settings.blockedMusic),
    ).toBeNull();

    const firstId = cfg.settings.blockedMusic[0].id;
    cfg = removeBlockedMusicEntry(cfg, firstId);
    expect(cfg.settings.blockedMusic).toHaveLength(1);

    cfg = addBookNote(cfg, {
      bookTitle: 'Project Hail Mary',
      timestampLabel: 'Ch. 4 • 1:12:30',
      note: 'Fist my bump!',
    });
    expect(cfg.settings.bookNotes).toHaveLength(1);
    expect(cfg.settings.bookNotes[0].bookTitle).toBe('Project Hail Mary');

    cfg = removeBookNote(cfg, cfg.settings.bookNotes[0].id);
    expect(cfg.settings.bookNotes).toHaveLength(0);
  });
});

