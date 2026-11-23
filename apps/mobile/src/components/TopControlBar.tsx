import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ServiceDefinition } from '@omnideck/shared';
import type { MobilePalette } from '../theme';

interface TopControlBarProps {
  palette: MobilePalette;
  service: ServiceDefinition;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  muted: boolean;
  hibernated: boolean;
  desktopMode: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onToggleDesktopMode: () => void;
  onToggleMute: () => void;
  onToggleHibernate: () => void;
  onOpenManage: () => void;
}

export function TopControlBar({
  palette,
  service,
  canGoBack,
  canGoForward,
  loading,
  muted,
  hibernated,
  desktopMode,
  onBack,
  onForward,
  onReload,
  onHome,
  onToggleDesktopMode,
  onToggleMute,
  onToggleHibernate,
  onOpenManage,
}: TopControlBarProps) {
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: palette.chrome,
          borderBottomColor: palette.border,
        },
      ]}
    >
      <View style={styles.group}>
        <Pressable
          accessibilityLabel="Back"
          disabled={!canGoBack}
          onPress={onBack}
          style={[styles.btn, !canGoBack && styles.btnDisabled]}
        >
          <Text style={[styles.btnGlyph, { color: palette.inkPrimary }]}>‹</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Forward"
          disabled={!canGoForward}
          onPress={onForward}
          style={[styles.btn, !canGoForward && styles.btnDisabled]}
        >
          <Text style={[styles.btnGlyph, { color: palette.inkPrimary }]}>›</Text>
        </Pressable>

        <Pressable accessibilityLabel="Reload" onPress={onReload} style={styles.btn}>
          <Text style={[styles.btnSymbol, { color: palette.inkPrimary }]}>
            {loading ? '·' : '↻'}
          </Text>
        </Pressable>

        <Pressable accessibilityLabel="Home" onPress={onHome} style={styles.btn}>
          <Text style={[styles.btnSymbol, { color: palette.inkSecondary }]}>⌂</Text>
        </Pressable>
      </View>

      <View style={styles.titleWrap}>
        <View style={[styles.dot, { backgroundColor: service.accentColor }]} />
        <Text numberOfLines={1} style={[styles.title, { color: palette.inkPrimary }]}>
          {service.name}
        </Text>
      </View>

      <View style={styles.group}>
        <Pressable
          accessibilityLabel="Toggle Desktop or Mobile site"
          onPress={onToggleDesktopMode}
          style={[
            styles.chip,
            {
              backgroundColor: desktopMode ? palette.accentSoft : palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: desktopMode ? palette.accent : palette.inkSecondary },
            ]}
          >
            {desktopMode ? 'PC' : 'MOB'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel={muted ? 'Unmute app' : 'Mute app'}
          onPress={onToggleMute}
          style={[
            styles.chip,
            {
              backgroundColor: muted ? 'rgba(239, 68, 68, 0.14)' : palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: muted ? palette.danger : palette.inkSecondary },
            ]}
          >
            {muted ? 'MUTE' : 'SND'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel={hibernated ? 'Wake tab' : 'Sleep tab'}
          onPress={onToggleHibernate}
          style={[
            styles.chip,
            {
              backgroundColor: hibernated ? palette.accent : palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: hibernated ? '#FFFFFF' : palette.inkSecondary },
            ]}
          >
            {hibernated ? 'WAKE' : 'ZZZ'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Manage Apps & Settings"
          onPress={onOpenManage}
          style={[styles.btn, { backgroundColor: palette.surface, borderRadius: 7 }]}
        >
          <Text style={[styles.btnSymbol, { color: palette.inkPrimary }]}>⚙</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 48,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnDisabled: {
    opacity: 0.36,
  },
  btnGlyph: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '500',
  },
  btnSymbol: {
    fontSize: 15,
    fontWeight: '600',
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  chip: {
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
