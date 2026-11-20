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
  GITHUB_REPO_NAME,
  GITHUB_REPO_OWNER,
  normalizeServiceUrl,
  type CustomServiceInput,
  type ServiceDefinition,
  type ThemeMode,
  type WorkspacePreset,
} from '@omnideck/shared';
import type { MobilePalette } from '../theme';
import { ServiceSvgIcon } from './ServiceSvgIcon';

interface ServiceManagerSheetProps {
  visible: boolean;
  palette: MobilePalette;
  theme: ThemeMode;
  services: ServiceDefinition[];
  workspaces: WorkspacePreset[];
  activeWorkspaceId: string;
  onClose: () => void;
  onToggleTheme: () => void;
  onSleepInactive: () => void;
  onApplyWorkspace: (workspaceId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggleVisibility: (id: string) => void;
  onRemoveCustom: (id: string) => void;
  onAddCustom: (input: CustomServiceInput) => void;
  onGetSyncJson: () => string;
  onImportSyncJson: (rawJson: string) => void;
}

export function ServiceManagerSheet({
  visible,
  palette,
  theme,
  services,
  workspaces,
  activeWorkspaceId,
  onClose,
  onToggleTheme,
  onSleepInactive,
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
  const [updateStatus, setUpdateStatus] = useState<string>(`OmniDeck v${APP_VERSION}`);

  const visibleCount = services.filter((s) => !s.hidden).length;

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

  const handleCheckUpdate = async () => {
    setUpdateStatus('Checking GitHub Releases…');
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`,
      );
      if (!res.ok) {
        setUpdateStatus(`OmniDeck v${APP_VERSION} (up to date)`);
        return;
      }
      const data = (await res.json()) as { tag_name?: string; html_url?: string };
      const latest = (data.tag_name ?? '').replace(/^v/i, '');
      if (latest && latest !== APP_VERSION) {
        setUpdateStatus(`New version v${latest} available — opening Releases`);
        void Linking.openURL(data.html_url || GITHUB_RELEASES_URL);
      } else {
        setUpdateStatus(`OmniDeck v${APP_VERSION} is up to date`);
      }
    } catch {
      setUpdateStatus('Could not reach GitHub Releases.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.chrome, borderColor: palette.border }]}>
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <Text style={[styles.headerTitle, { color: palette.inkPrimary }]}>
              Apps, Workspaces &amp; Sync
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

            <Pressable
              onPress={() => void handleCheckUpdate()}
              style={[styles.actionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <Text style={[styles.actionLabel, { color: palette.inkPrimary }]}>
                Check for Updates
              </Text>
              <Text style={[styles.actionSub, { color: palette.inkSecondary }]}>{updateStatus}</Text>
            </Pressable>

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
