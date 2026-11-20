import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createDefaultConfig,
  mergePersistedConfig,
  type PersistedConfig,
} from '@omnideck/shared';

const STORAGE_KEY = 'omnideck:mobile-config:v1';

export async function loadMobileConfig(): Promise<PersistedConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultConfig();
    return mergePersistedConfig(JSON.parse(raw));
  } catch {
    return createDefaultConfig();
  }
}

export async function saveMobileConfig(config: PersistedConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('[OmniDeck Mobile] Failed to save config:', err);
  }
}
