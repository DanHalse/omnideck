import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  findActiveLyricIndex,
  type ArtistDossier,
  type SuggestedBand,
} from '@omnideck/shared';
import type { MobilePalette } from '../theme';
import { fetchMobileArtistDossier, fetchMobileBandDetails } from '../musicIntel';

export interface MobileNowPlaying {
  serviceId: string;
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  playing: boolean;
  currentTimeSec?: number;
  durationSec?: number;
}

interface ArtistHubSheetProps {
  visible: boolean;
  palette: MobilePalette;
  nowPlaying: MobileNowPlaying | null;
  onClose: () => void;
  onSearchInService: (serviceId: string, query: string) => void;
}

type SheetTab = 'artist' | 'bands' | 'lyrics';

export function ArtistHubSheet({
  visible,
  palette,
  nowPlaying,
  onClose,
  onSearchInService,
}: ArtistHubSheetProps) {
  const [tab, setTab] = useState<SheetTab>('artist');
  const [dossier, setDossier] = useState<ArtistDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedBandId, setExpandedBandId] = useState<string | null>(null);
  const [loadingBandId, setLoadingBandId] = useState<string | null>(null);

  const trackKey = nowPlaying
    ? `${nowPlaying.serviceId}::${nowPlaying.title}::${nowPlaying.artist ?? ''}`
    : '';
  const playServiceId =
    nowPlaying?.serviceId === 'spotify' ? 'spotify' : 'youtube-music';
  const playServiceLabel = playServiceId === 'spotify' ? 'Spotify' : 'YT Music';

  useEffect(() => {
    if (!visible || !nowPlaying || !nowPlaying.title) return;
    let cancelled = false;
    setLoading(true);
    setExpandedBandId(null);

    void fetchMobileArtistDossier({
      serviceId: nowPlaying.serviceId,
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      album: nowPlaying.album,
      artworkUrl: nowPlaying.artworkUrl,
    })
      .then((res) => {
        if (!cancelled) setDossier(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, trackKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeLyricIdx = useMemo(() => {
    if (!dossier?.lyrics?.synced || !dossier.lyrics.lines.length) return -1;
    if (typeof nowPlaying?.currentTimeSec !== 'number') return -1;
    return findActiveLyricIndex(dossier.lyrics.lines, nowPlaying.currentTimeSec);
  }, [dossier?.lyrics, nowPlaying?.currentTimeSec]);

  const handleToggleBand = async (band: SuggestedBand) => {
    if (expandedBandId === band.id) {
      setExpandedBandId(null);
      return;
    }
    setExpandedBandId(band.id);
    if (band.detailsLoaded) return;
    setLoadingBandId(band.id);
    try {
      const details = await fetchMobileBandDetails(band.name);
      setDossier((prev) =>
        prev
          ? {
              ...prev,
              suggestedBands: prev.suggestedBands.map((b) =>
                b.id === band.id ? { ...b, ...details, id: band.id, detailsLoaded: true } : b,
              ),
            }
          : prev,
      );
    } finally {
      setLoadingBandId((cur) => (cur === band.id ? null : cur));
    }
  };

  const jumpAndClose = (serviceId: string, query: string) => {
    onClose();
    onSearchInService(serviceId, query);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.chrome, borderColor: palette.border }]}>
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: palette.inkPrimary }]}>
                Artist &amp; Discovery Hub
              </Text>
              <Text numberOfLines={1} style={[styles.subtitle, { color: palette.inkSecondary }]}>
                {dossier?.trackTitle || nowPlaying?.title || 'Play a song in YT Music or Spotify'}
              </Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: palette.surface }]}>
              <Text style={{ color: palette.inkPrimary, fontWeight: '700' }}>Done</Text>
            </Pressable>
          </View>

          {nowPlaying && (
            <View style={[styles.hero, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
              {dossier?.artworkUrl || nowPlaying.artworkUrl ? (
                <Image
                  source={{ uri: dossier?.artworkUrl || nowPlaying.artworkUrl }}
                  style={styles.heroArt}
                />
              ) : (
                <View style={[styles.heroArt, { backgroundColor: palette.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: palette.accent, fontWeight: '800', fontSize: 18 }}>♪</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.heroTrack, { color: palette.inkPrimary }]}>
                  {dossier?.trackTitle || nowPlaying.title}
                </Text>
                <Text numberOfLines={1} style={[styles.heroArtist, { color: palette.accent }]}>
                  {dossier?.artistName || nowPlaying.artist || 'Unknown Artist'}
                </Text>
                {(dossier?.origin || dossier?.activeYears) && (
                  <Text numberOfLines={1} style={[styles.heroMeta, { color: palette.inkSecondary }]}>
                    {[dossier.origin, dossier.activeYears].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={[styles.tabs, { borderBottomColor: palette.border }]}>
            {(
              [
                ['artist', 'Artist Info'],
                ['bands', `Similar Bands${dossier?.suggestedBands.length ? ` (${dossier.suggestedBands.length})` : ''}`],
                ['lyrics', 'Lyrics'],
              ] as Array<[SheetTab, string]>
            ).map(([id, label]) => {
              const active = tab === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setTab(id)}
                  style={[
                    styles.tabBtn,
                    { backgroundColor: active ? palette.accentSoft : 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: active ? palette.accent : palette.inkSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {loading && !dossier ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={palette.accent} />
                <Text style={{ color: palette.inkSecondary, marginTop: 10 }}>
                  Loading artist bio, similar bands &amp; lyrics…
                </Text>
              </View>
            ) : !nowPlaying ? (
              <View style={styles.centerState}>
                <Text style={{ color: palette.inkSecondary, textAlign: 'center' }}>
                  Play a song on YouTube Music or Spotify to view live artist information,
                  suggested bands, and synced lyrics.
                </Text>
              </View>
            ) : tab === 'artist' && dossier ? (
              <View style={{ gap: 12 }}>
                <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                  <Text style={[styles.eyebrow, { color: palette.inkMuted }]}>ABOUT</Text>
                  <Text style={[styles.bioText, { color: palette.inkPrimary }]}>{dossier.bio}</Text>
                  {dossier.genres.length > 0 && (
                    <View style={styles.pillRow}>
                      {dossier.genres.map((g) => (
                        <View key={g} style={[styles.tag, { backgroundColor: palette.accentSoft }]}>
                          <Text style={[styles.tagText, { color: palette.accent }]}>{g}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {dossier.members.length > 0 && (
                  <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text style={[styles.eyebrow, { color: palette.inkMuted }]}>BAND MEMBERS</Text>
                    <View style={styles.pillRow}>
                      {dossier.members.map((m) => (
                        <View
                          key={m}
                          style={[styles.memberPill, { backgroundColor: palette.chrome, borderColor: palette.border }]}
                        >
                          <Text style={{ color: palette.inkPrimary, fontSize: 12 }}>{m}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {dossier.essentialAlbums.length > 0 && (
                  <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text style={[styles.eyebrow, { color: palette.inkMuted }]}>ESSENTIAL ALBUMS</Text>
                    {dossier.essentialAlbums.map((alb) => (
                      <Pressable
                        key={alb}
                        onPress={() =>
                          jumpAndClose(
                            playServiceId,
                            `${dossier.artistName} ${alb.replace(/\s*\(\d{4}\)$/, '')}`,
                          )
                        }
                        style={[styles.albumRow, { backgroundColor: palette.chrome, borderColor: palette.border }]}
                      >
                        <Text style={{ color: palette.inkPrimary, fontSize: 13, flex: 1 }}>{alb}</Text>
                        <Text style={{ color: palette.accent, fontWeight: '700', fontSize: 12 }}>▶</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => jumpAndClose('youtube', `${dossier.artistName} live performance`)}
                    style={[styles.actionBtn, { backgroundColor: palette.surface, borderColor: palette.border }]}
                  >
                    <Text style={{ color: palette.inkPrimary, fontWeight: '600', fontSize: 12.5 }}>
                      Watch Live on YouTube
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => jumpAndClose('reddit', dossier.artistName)}
                    style={[styles.actionBtn, { backgroundColor: palette.surface, borderColor: palette.border }]}
                  >
                    <Text style={{ color: palette.inkPrimary, fontWeight: '600', fontSize: 12.5 }}>
                      Discuss on Reddit
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : tab === 'bands' && dossier ? (
              <View style={{ gap: 10 }}>
                {dossier.suggestedBands.length === 0 ? (
                  <Text style={{ color: palette.inkSecondary, textAlign: 'center', paddingVertical: 20 }}>
                    No related bands found for this track yet.
                  </Text>
                ) : (
                  dossier.suggestedBands.map((band) => {
                    const isOpen = expandedBandId === band.id;
                    const isBusy = loadingBandId === band.id;
                    return (
                      <View
                        key={band.id}
                        style={[
                          styles.bandCard,
                          {
                            backgroundColor: palette.surface,
                            borderColor: isOpen ? palette.accent : palette.border,
                          },
                        ]}
                      >
                        <Pressable
                          onPress={() => void handleToggleBand(band)}
                          style={styles.bandHeader}
                        >
                          {band.pictureUrl ? (
                            <Image source={{ uri: band.pictureUrl }} style={styles.bandAvatar} />
                          ) : (
                            <View style={[styles.bandAvatar, { backgroundColor: palette.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>
                              <Text style={{ color: palette.accent, fontWeight: '700' }}>
                                {band.name.slice(0, 1)}
                              </Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.bandName, { color: palette.inkPrimary }]}>
                              {band.name}
                            </Text>
                            <Text style={{ color: palette.inkSecondary, fontSize: 12 }}>
                              {band.fans
                                ? `${band.fans.toLocaleString()} listeners · Tap to expand`
                                : 'Tap for bio & top tracks'}
                            </Text>
                          </View>
                          <Text style={{ color: palette.inkMuted }}>{isOpen ? '▾' : '▸'}</Text>
                        </Pressable>

                        {isOpen && (
                          <View style={[styles.bandDrawer, { borderTopColor: palette.border }]}>
                            {isBusy ? (
                              <ActivityIndicator color={palette.accent} size="small" />
                            ) : (
                              <>
                                {band.bio ? (
                                  <Text numberOfLines={4} style={[styles.bioText, { color: palette.inkSecondary }]}>
                                    {band.bio}
                                  </Text>
                                ) : null}
                                {band.topTracks.map((tr) => (
                                  <Pressable
                                    key={tr.title}
                                    onPress={() => jumpAndClose(playServiceId, `${band.name} ${tr.title}`)}
                                    style={[styles.albumRow, { backgroundColor: palette.chrome, borderColor: palette.border }]}
                                  >
                                    <Text style={{ color: palette.accent, fontSize: 11, marginRight: 6 }}>▶</Text>
                                    <Text numberOfLines={1} style={{ color: palette.inkPrimary, fontSize: 12.5, flex: 1 }}>
                                      {tr.title}
                                    </Text>
                                  </Pressable>
                                ))}
                                <View style={styles.actionRow}>
                                  <Pressable
                                    onPress={() => jumpAndClose(playServiceId, band.name)}
                                    style={[styles.actionBtn, { backgroundColor: palette.accent, borderColor: palette.accent }]}
                                  >
                                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                                      Play in {playServiceLabel}
                                    </Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => jumpAndClose('youtube', `${band.name} live`)}
                                    style={[styles.actionBtn, { backgroundColor: palette.chrome, borderColor: palette.border }]}
                                  >
                                    <Text style={{ color: palette.inkPrimary, fontWeight: '600', fontSize: 12 }}>
                                      Live YT
                                    </Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => jumpAndClose('reddit', band.name)}
                                    style={[styles.actionBtn, { backgroundColor: palette.chrome, borderColor: palette.border }]}
                                  >
                                    <Text style={{ color: palette.inkPrimary, fontWeight: '600', fontSize: 12 }}>
                                      Reddit
                                    </Text>
                                  </Pressable>
                                </View>
                              </>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            ) : (
              <View style={{ gap: 8, paddingBottom: 24 }}>
                {dossier?.lyrics?.synced && dossier.lyrics.lines.length > 0 ? (
                  dossier.lyrics.lines.map((line, idx) => {
                    const isActive = idx === activeLyricIdx;
                    return (
                      <Text
                        key={`${line.timeSec}-${idx}`}
                        style={{
                          fontSize: isActive ? 17 : 15,
                          fontWeight: isActive ? '800' : '500',
                          color: isActive ? palette.inkPrimary : palette.inkSecondary,
                          opacity: activeLyricIdx >= 0 && idx < activeLyricIdx ? 0.5 : 1,
                          lineHeight: 23,
                        }}
                      >
                        {line.text}
                      </Text>
                    );
                  })
                ) : dossier?.lyrics?.plainText ? (
                  <Text style={{ color: palette.inkPrimary, fontSize: 14, lineHeight: 22 }}>
                    {dossier.lyrics.plainText}
                  </Text>
                ) : (
                  <Text style={{ color: palette.inkSecondary, textAlign: 'center', paddingVertical: 20 }}>
                    No synced lyrics found on LRCLIB for this song.
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '84%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heroArt: {
    width: 54,
    height: 54,
    borderRadius: 10,
  },
  heroTrack: {
    fontSize: 15,
    fontWeight: '700',
  },
  heroArtist: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  heroMeta: {
    fontSize: 11.5,
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    padding: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 14,
    paddingBottom: 32,
  },
  centerState: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  bioText: {
    fontSize: 13,
    lineHeight: 20,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 11.5,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  memberPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bandCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  bandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
  },
  bandAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  bandName: {
    fontSize: 14,
    fontWeight: '700',
  },
  bandDrawer: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});
