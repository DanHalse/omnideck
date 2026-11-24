import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addBlockedMusicEntry,
  addBookNote,
  isValidSkinPresetId,
  mergePowerUpsConfig,
  pinFavorite,
  resolveSkinPreset,
  whitelistArtist,
  type HandoffPayload,
  type PersistedConfig,
  type PowerUpsConfig,
  type SkinPresetId,
} from '@omnideck/shared';

const PAIRING_STORAGE_KEY = 'omnideck.mobile.lanPairing.v1';

export interface SavedLanPairing {
  hostUrl: string;
  pin: string;
}

export async function loadSavedLanPairing(): Promise<SavedLanPairing> {
  try {
    const raw = await AsyncStorage.getItem(PAIRING_STORAGE_KEY);
    if (!raw) return { hostUrl: '', pin: '' };
    const parsed = JSON.parse(raw) as Partial<SavedLanPairing>;
    return {
      hostUrl: typeof parsed.hostUrl === 'string' ? parsed.hostUrl : '',
      pin: typeof parsed.pin === 'string' ? parsed.pin : '',
    };
  } catch {
    return { hostUrl: '', pin: '' };
  }
}

export async function saveLanPairing(pairing: SavedLanPairing): Promise<void> {
  try {
    await AsyncStorage.setItem(PAIRING_STORAGE_KEY, JSON.stringify(pairing));
  } catch {
    // Ignore storage errors
  }
}

function normalizeHostUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Enter your PC address (e.g. http://192.168.1.50:47831)');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export async function syncWithDesktopOverLan(
  rawHostUrl: string,
  pin: string,
  localConfig: PersistedConfig,
): Promise<{ nextConfig: PersistedConfig; deviceName: string; handoff: HandoffPayload | null }> {
  const baseUrl = normalizeHostUrl(rawHostUrl);
  const cleanPin = pin.trim();
  if (!cleanPin) throw new Error('Enter the 6-digit PIN shown on OmniDeck Desktop.');

  const res = await fetch(`${baseUrl}/api/sync?device=Android`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-omnideck-pin': cleanPin,
    },
    body: JSON.stringify({
      deviceName: 'OmniDeck Android',
      skin: localConfig.settings.skin,
      powerUps: localConfig.settings.powerUps,
      blockedMusic: localConfig.settings.blockedMusic,
      whitelistedArtists: localConfig.settings.whitelistedArtists,
      bookNotes: localConfig.settings.bookNotes,
      pinnedFavorites: localConfig.pinnedFavorites,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(res.status === 401 ? 'Invalid 6-digit PIN.' : `Sync failed (${res.status}) ${errText}`);
  }

  const data = (await res.json()) as {
    bundle?: {
      deviceName?: string;
      skin?: SkinPresetId;
      powerUps?: Partial<PowerUpsConfig>;
      blockedMusic?: Array<{ kind: 'artist' | 'track'; value: string; artist?: string }>;
      autoSkipAiSlop?: boolean;
      whitelistedArtists?: string[];
      bookNotes?: Array<{ bookTitle: string; timestampLabel: string; note: string; url?: string }>;
      pinnedFavorites?: Array<{ serviceId: string; title: string; url: string }>;
    };
  };

  let next = localConfig;
  const b = data.bundle;
  if (b) {
    if (b.skin && isValidSkinPresetId(b.skin)) {
      next = {
        ...next,
        settings: {
          ...next.settings,
          skin: b.skin,
          theme: resolveSkinPreset(b.skin).baseTheme,
        },
      };
    }
    if (b.powerUps) {
      next = {
        ...next,
        settings: {
          ...next.settings,
          powerUps: mergePowerUpsConfig({ ...next.settings.powerUps, ...b.powerUps }),
        },
      };
    }
    if (typeof b.autoSkipAiSlop === 'boolean') {
      next = {
        ...next,
        settings: {
          ...next.settings,
          autoSkipAiSlop: b.autoSkipAiSlop,
        },
      };
    }
    if (Array.isArray(b.blockedMusic)) {
      for (const item of b.blockedMusic) {
        if (item?.value) next = addBlockedMusicEntry(next, item);
      }
    }
    if (Array.isArray(b.whitelistedArtists)) {
      for (const artist of b.whitelistedArtists) {
        if (typeof artist === 'string') next = whitelistArtist(next, artist);
      }
    }
    if (Array.isArray(b.bookNotes)) {
      const existingKeys = new Set(
        (next.settings.bookNotes ?? []).map((n) => `${n.bookTitle}::${n.timestampLabel}::${n.note}`),
      );
      for (const n of b.bookNotes) {
        const k = `${n.bookTitle}::${n.timestampLabel}::${n.note}`;
        if (n.bookTitle && n.note && !existingKeys.has(k)) {
          next = addBookNote(next, n);
        }
      }
    }
    if (Array.isArray(b.pinnedFavorites)) {
      for (const fav of b.pinnedFavorites) {
        if (fav.serviceId && fav.url && fav.title) {
          next = pinFavorite(next, fav);
        }
      }
    }
  }

  let handoff: HandoffPayload | null = null;
  try {
    const hRes = await fetch(`${baseUrl}/api/handoff`, {
      headers: { 'x-omnideck-pin': cleanPin },
    });
    if (hRes.ok) {
      const hJson = (await hRes.json()) as { handoff?: HandoffPayload | null };
      handoff = hJson.handoff ?? null;
    }
  } catch {
    // Optional handoff fetch
  }

  await saveLanPairing({ hostUrl: baseUrl, pin: cleanPin });
  return { nextConfig: next, deviceName: b?.deviceName || 'OmniDeck PC', handoff };
}

export async function pullHandoffFromDesktop(
  rawHostUrl: string,
  pin: string,
): Promise<HandoffPayload> {
  const baseUrl = normalizeHostUrl(rawHostUrl);
  const cleanPin = pin.trim();
  const res = await fetch(`${baseUrl}/api/handoff`, {
    headers: { 'x-omnideck-pin': cleanPin },
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Invalid 6-digit PIN.' : `Handoff failed (${res.status})`);
  }
  const data = (await res.json()) as { handoff?: HandoffPayload | null };
  if (!data.handoff || !data.handoff.url) {
    throw new Error('No active page or playback found on PC.');
  }
  await saveLanPairing({ hostUrl: baseUrl, pin: cleanPin });
  return data.handoff;
}

export async function sendHandoffToDesktop(
  rawHostUrl: string,
  pin: string,
  payload: { serviceId: string; url: string; title?: string; positionSec?: number },
): Promise<void> {
  const baseUrl = normalizeHostUrl(rawHostUrl);
  const cleanPin = pin.trim();
  const res = await fetch(`${baseUrl}/api/handoff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-omnideck-pin': cleanPin,
    },
    body: JSON.stringify({
      ...payload,
      fromDevice: 'Android Phone',
    }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Invalid 6-digit PIN.' : `Handoff failed (${res.status})`);
  }
  await saveLanPairing({ hostUrl: baseUrl, pin: cleanPin });
}
