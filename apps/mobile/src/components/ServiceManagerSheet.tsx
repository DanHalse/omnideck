import React, { useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  APP_VERSION,
  GITHUB_RELEASES_URL,
  normalizeServiceUrl,
  type CustomServiceInput,
  type PowerUpsConfig,
  type ServiceDefinition,
  type ThemeMode,
  type WorkspacePreset,
} from '@omnideck/shared';
import type { MobilePalette } from '../theme';
import { ServiceSvgIcon } from './ServiceSvgIcon';
import {
  type MobileUpdateInfo,
  type OtaRuntimeState,
  resetOtaBundle,
} from '../otaUpdater';

interface ServiceManagerSheetProps {
  visible: boolean;
  palette: MobilePalette;
  theme: ThemeMode;
  services: ServiceDefinition[];
  workspaces: WorkspacePreset[];
  activeWorkspaceId: string;
  sleepTimerMinutes: number;
  powerUps: PowerUpsConfig;
  otaState: OtaRuntimeState | null;
  updateInfo: MobileUpdateInfo | null;
  updateBusy: boolean;
  updateProgress: number;
  updateStatusText: string;
  onClose: () => void;
  onToggleTheme: () => void;
  onSleepInactive: () => void;
  onSetSleepTimer: (minutes: number) => void;
  onTogglePowerUp: (key: keyof PowerUpsConfig) => void;
  onCheckUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  onApplyWorkspace: (workspaceId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggleVisibility: (id: string) => void;
  onRemoveCustom: (id: string) => void;
  onAddCustom: (input: CustomServiceInput) => void;
  onGetSyncJson: () => string;
  onImportSyncJson: (rawJson: string) => void;
}

const MOBILE_POWER_UP_ITEMS: Array<{ key: keyof PowerUpsConfig; label: string }> = [
  { key: 'youtubeReturnDislikes', label: 'YT Dislikes' },
  { key: 'youtubeSponsorBlock', label: 'SponsorBlock' },
  { key: 'youtubeHideShorts', label: 'Hide Shorts' },
  { key: 'youtubeHideEndScreens', label: 'No End Cards' },
  { key: 'youtubeAutoDismissStillListening', label: 'Auto-Dismiss' },
  { key: 'redditHidePromoted', label: 'No Reddit Ads' },
  { key: 'redditCollapseAutoMod', label: 'Hide AutoMod' },
  { key: 'redditNextCommentButton', label: 'Next Comment ↓' },
];

export function ServiceManagerSheet({
  visible,
  palette,
  theme,
  services,
  workspaces,
  activeWorkspaceId,
  sleepTimerMinutes,
  powerUps,
  otaState,
  updateInfo,
  updateBusy,
  updateProgress,
  updateStatusText,
  onClose,
  onToggleTheme,
  onSleepInactive,
  onSetSleepTimer,
  onTogglePowerUp,
  onCheckUpdates,
  onInstallUpdate,
  onApplyWorkspace,
  onReorder,
  onToggleVisibility,
  onRemoveCustom,
  onAddCustom,
  onGetSyncJson,
  onImportSyncJson,
}: ServiceManagerSheetProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [desktopUa, setDesktopUa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncJson, setSyncJson] = useState('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const visibleCount = services.filter((s) => !s.hidden).length;
  const activeVersionLabel = otaState?.activeVersion || APP_VERSION;

  const handleAdd = () => {
    setError(null);
    if (!name.trim()) {
      setError('Enter an app name.');
      return;
    }
    try {
      normalizeServiceUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enter a valid https:// URL.');
      return;
    }

    onAddCustom({
      name: name.trim(),
      url: url.trim(),
      icon: 'globe',
      accentColor: '#E47E3C',
      mobileUserAgentMode: desktopUa ? 'desktop' : 'mobile',
    });
    setName('');
    setUrl('');
    setDesktopUa(false);
  };

  const handleShareSync = async () => {
    try {
      await Share.share({ message: onGetSyncJson(), title: 'OmniDeck Sync Backup' });
    } catch {
      setSyncStatus('Unable to open share sheet.');
    }
  };

  const handleImportSync = () => {
    try {
      onImportSyncJson(syncJson);
      setSyncJson('');
      setSyncStatus('Synced apps & workspaces from JSON!');
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : 'Invalid sync JSON.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.chrome, borderColor: palette.border }]}>
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <Text style={[styles.headerTitle, { color: palette.inkPrimary }]}>
              Apps, Power-Ups &amp; Updates
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeText, { color: palette.accent }]}>Done</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.quickRow}>
              <Pressable
                onPress={onToggleTheme}
                style={[styles.actionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Text style={[styles.actionLabel, { color: palette.inkPrimary }]}>
                  Theme: {theme === 'dark' ? 'Dark' : 'Light'}
                </Text>
                <Text style={[styles.actionSub, { color: palette.inkSecondary }]}>Tap to switch</Text>
              </Pressable>

              <Pressable
                onPress={onSleepInactive}
                style={[styles.actionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Text style={[styles.actionLabel, { color: palette.inkPrimary }]}>
                  Sleep Inactive
                </Text>
                <Text style={[styles.actionSub, { color: palette.inkSecondary }]}>Free mobile RAM</Text>
              </Pressable>
            </View>

            <View
              style={[
                styles.actionCard,
                { backgroundColor: palette.surface, borderColor: palette.border, gap: 6 },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionLabel, { color: palette.inkPrimary }]}>
                    OmniDeck v{activeVersionLabel}
                    {otaState?.isRunningOta ? ' · OTA' : ''}
                  </Text>
                  <Text style={[styles.actionSub, { color: palette.inkSecondary }]}>
                    {updateBusy && updateProgress > 0
                      ? `${updateStatusText} (${updateProgress}%)`
                      : updateStatusText}
                  </Text>
                </View>

                <Pressable
                  disabled={updateBusy}
                  onPress={() =>
                    void (updateInfo?.available ? onInstallUpdate() : onCheckUpdates())
                  }
                  style={[
                    styles.wsChip,
                    {
                      backgroundColor: updateInfo?.available ? palette.accent : palette.chromeElevated,
                      borderColor: palette.border,
                      opacity: updateBusy ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: updateInfo?.available ? '#FFFFFF' : palette.inkPrimary,
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    {updateBusy
                      ? `${updateProgress}%`
                      : updateInfo?.available
                        ? updateInfo.mode === 'ota'
                          ? 'Instant Update'
                          : 'Install Update'
                        : 'Check Now'}
                  </Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable onPress={() => void Linking.openURL(updateInfo?.releaseUrl || GITHUB_RELEASES_URL)}>
                  <Text style={{ color: palette.accent, fontSize: 11.5, fontWeight: '600' }}>
                    Release Notes
                  </Text>
                </Pressable>
                {otaState?.isRunningOta && (
                  <Pressable onPress={() => void resetOtaBundle()}>
                    <Text style={{ color: palette.danger, fontSize: 11.5, fontWeight: '600' }}>
                      Reset to Built-in v{otaState.embeddedVersion}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: palette.inkMuted }]}>
              POWER-UPS (YOUTUBE, REDDIT &amp; MUSIC)
            </Text>
            <View style={styles.wsWrap}>
              {MOBILE_POWER_UP_ITEMS.map((item) => {
                const enabled = Boolean(powerUps[item.key]);
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => onTogglePowerUp(item.key)}
                    style={[
                      styles.wsChip,
                      {
                        backgroundColor: enabled ? palette.accentSoft : palette.surface,
                        borderColor: enabled ? palette.accent : palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: enabled ? palette.accent : palette.inkSecondary,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {enabled ? '✓ ' : ''}
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { color: palette.inkMuted }]}>
              SLEEP TIMER {sleepTimerMinutes > 0 ? `(ACTIVE · ${sleepTimerMinutes}m)` : ''}
            </Text>
            <View style={styles.wsWrap}>
              {[15, 30, 45, 60].map((m) => {
                const active = sleepTimerMinutes === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => onSetSleepTimer(m)}
                    style={[
                      styles.wsChip,
                      {
                        backgroundColor: active ? palette.accent : palette.surface,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? '#FFFFFF' : palette.inkPrimary, fontSize: 12, fontWeight: '600' }}>
                      {m} min
                    </Text>
                  </Pressable>
                );
              })}
              {sleepTimerMinutes > 0 && (
                <Pressable
                  onPress={() => onSetSleepTimer(0)}
                  style={[styles.wsChip, { backgroundColor: palette.surface, borderColor: palette.border }]}
                >
                  <Text style={{ color: palette.danger, fontSize: 12, fontWeight: '600' }}>Off</Text>
                </Pressable>
              )}
            </View>

            <Text style={[styles.sectionTitle, { color: palette.inkMuted }]}>WORKSPACES</Text>
            <View style={styles.wsWrap}>
              {workspaces.map((ws) => {
                const active = ws.id === activeWorkspaceId;
                return (
                  <Pressable
                    key={ws.id}
                    onPress={() => onApplyWorkspace(ws.id)}
                    style={[
                      styles.wsChip,
                      {
                        backgroundColor: active ? palette.accent : palette.surface,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? '#FFFFFF' : palette.inkPrimary, fontSize: 12, fontWeight: '600' }}>
                      {ws.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { color: palette.inkMuted }]}>
              MENU BAR ORDER &amp; VISIBILITY
            </Text>
            <View style={styles.list}>
              {services.map((svc, idx) => {
                const isLastVisible = !svc.hidden && visibleCount <= 1;
                return (
                  <View
                    key={svc.id}
                    style={[
                      styles.row,
                      { backgroundColor: palette.chromeElevated, borderColor: palette.border },
                      svc.hidden && styles.rowHidden,
                    ]}
                  >
                    <View style={styles.rowInfo}>
                      <ServiceSvgIcon icon={svc.icon} size={18} color={svc.accentColor} />
                      <View style={styles.rowText}>
                        <Text style={[styles.rowName, { color: palette.inkPrimary }]}>
                          {svc.name}
                        </Text>
                        <Text numberOfLines={1} style={[styles.rowUrl, { color: palette.inkMuted }]}>
                          {svc.url}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.rowActions}>
                      <Pressable
                        disabled={idx === 0}
                        onPress={() => onReorder(idx, idx - 1)}
                        style={[styles.smallBtn, idx === 0 && styles.disabled]}
                      >
                        <Text style={{ color: palette.inkPrimary }}>↑</Text>
                      </Pressable>
                      <Pressable
                        disabled={idx === services.length - 1}
                        onPress={() => onReorder(idx, idx + 1)}
                        style={[styles.smallBtn, idx === services.length - 1 && styles.disabled]}
                      >
                        <Text style={{ color: palette.inkPrimary }}>↓</Text>
                      </Pressable>
                      <Pressable
                        disabled={isLastVisible}
                        onPress={() => onToggleVisibility(svc.id)}
                        style={[styles.smallBtn, isLastVisible && styles.disabled]}
                      >
                        <Text style={{ color: svc.hidden ? palette.inkMuted : palette.inkPrimary }}>
                          {svc.hidden ? 'Show' : 'Hide'}
                        </Text>
                      </Pressable>
                      {!svc.builtIn && (
                        <Pressable
                          onPress={() => onRemoveCustom(svc.id)}
                          style={styles.smallBtn}
                        >
                          <Text style={{ color: palette.danger }}>Del</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { color: palette.inkMuted }]}>
              ADD CUSTOM WEB APP
            </Text>
            <View style={[styles.form, { backgroundColor: palette.chromeElevated, borderColor: palette.border }]}>
              <TextInput
                placeholder="App name (e.g. SoundCloud)"
                placeholderTextColor={palette.inkMuted}
                value={name}
                onChangeText={setName}
                style={[
                  styles.input,
                  { backgroundColor: palette.input, borderColor: palette.border, color: palette.inkPrimary },
                ]}
              />
              <TextInput
                placeholder="https://soundcloud.com"
                placeholderTextColor={palette.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={url}
                onChangeText={setUrl}
                style={[
                  styles.input,
                  { backgroundColor: palette.input, borderColor: palette.border, color: palette.inkPrimary },
                ]}
              />
              <Pressable onPress={() => setDesktopUa((v) => !v)} style={styles.uaToggle}>
                <Text style={{ color: palette.inkSecondary, fontSize: 12.5 }}>
                  Request Desktop Site by default: {desktopUa ? 'ON' : 'OFF'}
                </Text>
              </Pressable>

              {error && <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>}

              <Pressable
                onPress={handleAdd}
                style={[styles.submitBtn, { backgroundColor: palette.accent }]}
              >
                <Text style={styles.submitText}>Add App to Menu Bar</Text>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { color: palette.inkMuted }]}>
              CROSS-DEVICE CONFIG SYNC
            </Text>
            <View style={[styles.form, { backgroundColor: palette.chromeElevated, borderColor: palette.border }]}>
              <Pressable
                onPress={() => void handleShareSync()}
                style={[styles.secondaryBtn, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Text style={{ color: palette.inkPrimary, fontWeight: '600', fontSize: 13 }}>
                  Export / Share Config JSON
                </Text>
              </Pressable>
              <TextInput
                placeholder="Paste Sync JSON from OmniDeck Desktop…"
                placeholderTextColor={palette.inkMuted}
                multiline
                value={syncJson}
                onChangeText={setSyncJson}
                style={[
                  styles.input,
                  { height: 72, paddingVertical: 8, backgroundColor: palette.input, borderColor: palette.border, color: palette.inkPrimary },
                ]}
              />
              <Pressable
                onPress={handleImportSync}
                style={[styles.submitBtn, { backgroundColor: palette.accent }]}
              >
                <Text style={styles.submitText}>Import Sync JSON</Text>
              </Pressable>
              {syncStatus && (
                <Text style={{ color: palette.inkSecondary, fontSize: 12 }}>{syncStatus}</Text>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    padding: 16,
    gap: 14,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  actionLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  actionSub: {
    fontSize: 11.5,
  },
  wsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wsChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  rowHidden: {
    opacity: 0.52,
  },
  rowInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  rowUrl: {
    fontSize: 11,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  disabled: {
    opacity: 0.28,
  },
  form: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  input: {
    height: 40,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 13.5,
  },
  uaToggle: {
    paddingVertical: 4,
  },
  errorText: {
    fontSize: 12,
  },
  submitBtn: {
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    height: 38,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
});
