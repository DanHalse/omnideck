import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import {
  APP_VERSION,
  GITHUB_RELEASES_URL,
  GITHUB_REPO_NAME,
  GITHUB_REPO_OWNER,
} from '@omnideck/shared';

export interface OtaRuntimeState {
  embeddedVersion: string;
  activeVersion: string;
  runtimeVersion: string;
  isRunningOta: boolean;
  otaVersion?: string | null;
}

export interface MobileOtaManifest {
  version: string;
  runtimeVersion: string;
  bundleAssetName: string;
  bundleSha256: string;
  bundleSizeBytes?: number;
  apkAssetName?: string;
  publishedAt?: string;
}

export interface MobileUpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  /** 'ota' = instant zero-APK JS bundle swap; 'apk' = native in-app APK installer; 'web' = fallback link */
  mode: 'ota' | 'apk' | 'web';
  bundleUrl?: string;
  bundleSha256?: string;
  runtimeVersion?: string;
  apkUrl?: string;
  releaseUrl: string;
  releaseNotes?: string;
}

export interface MobileUpdateProgress {
  phase: 'downloading' | 'ready' | 'downloading-apk' | 'installing-apk' | 'error';
  percent: number;
}

interface NativeOmniDeckOtaModule {
  getOtaState: () => Promise<OtaRuntimeState>;
  confirmBootSuccess: () => void;
  clearOta: () => Promise<boolean>;
  downloadAndApplyOta: (
    bundleUrl: string,
    expectedSha256: string,
    targetVersion: string,
    runtimeVersion: string,
  ) => Promise<boolean>;
  restartApp: () => void;
  downloadAndInstallApk: (apkUrl: string) => Promise<{ status: 'permission-required' | 'installer-opened' }>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
}

const nativeOta: NativeOmniDeckOtaModule | undefined =
  Platform.OS === 'android'
    ? (NativeModules.OmniDeckOta as NativeOmniDeckOtaModule | undefined)
    : undefined;

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((part) => {
        const num = parseInt(part.replace(/[^0-9].*$/, ''), 10);
        return Number.isFinite(num) ? num : 0;
      });
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function confirmOtaBootSuccess(): void {
  try {
    nativeOta?.confirmBootSuccess();
  } catch {
    // ignore on platforms without native OTA module
  }
}

export async function getOtaState(): Promise<OtaRuntimeState> {
  if (!nativeOta?.getOtaState) {
    return {
      embeddedVersion: APP_VERSION,
      activeVersion: APP_VERSION,
      runtimeVersion: '1',
      isRunningOta: false,
      otaVersion: null,
    };
  }
  try {
    return await nativeOta.getOtaState();
  } catch {
    return {
      embeddedVersion: APP_VERSION,
      activeVersion: APP_VERSION,
      runtimeVersion: '1',
      isRunningOta: false,
      otaVersion: null,
    };
  }
}

export async function resetOtaBundle(): Promise<boolean> {
  if (!nativeOta?.clearOta) return false;
  const ok = await nativeOta.clearOta();
  if (ok) {
    nativeOta.restartApp();
  }
  return ok;
}

export function restartMobileApp(): void {
  nativeOta?.restartApp();
}

export function subscribeOtaProgress(
  listener: (progress: MobileUpdateProgress) => void,
): () => void {
  if (!nativeOta) return () => {};
  try {
    const emitter = new NativeEventEmitter(nativeOta as never);
    const sub = emitter.addListener('OmniDeckOtaProgress', (rawPayload: unknown) => {
      const payload = rawPayload as Partial<MobileUpdateProgress> | null | undefined;
      if (payload && typeof payload.percent === 'number' && typeof payload.phase === 'string') {
        listener(payload as MobileUpdateProgress);
      }
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubReleasePayload {
  tag_name?: string;
  html_url?: string;
  body?: string;
  assets?: GitHubReleaseAsset[];
}

export async function checkForMobileUpdate(): Promise<MobileUpdateInfo> {
  const state = await getOtaState();
  const currentVersion =
    compareSemver(APP_VERSION, state.activeVersion) >= 0 ? APP_VERSION : state.activeVersion;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `OmniDeck-Android/${currentVersion}`,
        },
      },
    );
    if (!res.ok) {
      return {
        available: false,
        currentVersion,
        latestVersion: currentVersion,
        mode: 'web',
        releaseUrl: GITHUB_RELEASES_URL,
      };
    }

    const release = (await res.json()) as GitHubReleasePayload;
    const latestVersion = (release.tag_name ?? '').replace(/^v/i, '').trim() || currentVersion;
    const releaseUrl = release.html_url || GITHUB_RELEASES_URL;
    const assets = Array.isArray(release.assets) ? release.assets : [];

    const apkAsset = assets.find((a) => /^OmniDeck-Android-.*\.apk$/i.test(a.name));
    const manifestAsset = assets.find((a) => a.name === 'omnideck-mobile-ota.json');
    const bundleAsset = assets.find((a) => a.name === 'omnideck-mobile-ota.bundle');

    let manifest: MobileOtaManifest | null = null;
    if (manifestAsset?.browser_download_url) {
      try {
        const mRes = await fetch(manifestAsset.browser_download_url, {
          headers: { Accept: 'application/json' },
        });
        if (mRes.ok) {
          manifest = (await mRes.json()) as MobileOtaManifest;
        }
      } catch {
        // fallback to release tag metadata
      }
    }

    const effectiveLatest = manifest?.version || latestVersion;
    const isNewer = compareSemver(effectiveLatest, currentVersion) > 0;
    if (!isNewer) {
      return {
        available: false,
        currentVersion,
        latestVersion: effectiveLatest,
        mode: 'ota',
        releaseUrl,
      };
    }

    const canOta = Boolean(
      nativeOta &&
        manifest &&
        bundleAsset?.browser_download_url &&
        manifest.runtimeVersion === state.runtimeVersion,
    );

    if (canOta && manifest && bundleAsset) {
      return {
        available: true,
        currentVersion,
        latestVersion: effectiveLatest,
        mode: 'ota',
        bundleUrl: bundleAsset.browser_download_url,
        bundleSha256: manifest.bundleSha256 || '',
        runtimeVersion: manifest.runtimeVersion,
        apkUrl: apkAsset?.browser_download_url,
        releaseUrl,
        releaseNotes: release.body,
      };
    }

    if (nativeOta && apkAsset?.browser_download_url) {
      return {
        available: true,
        currentVersion,
        latestVersion: effectiveLatest,
        mode: 'apk',
        apkUrl: apkAsset.browser_download_url,
        releaseUrl,
        releaseNotes: release.body,
      };
    }

    return {
      available: true,
      currentVersion,
      latestVersion: effectiveLatest,
      mode: 'web',
      apkUrl: apkAsset?.browser_download_url,
      releaseUrl,
      releaseNotes: release.body,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function applyMobileUpdate(
  info: MobileUpdateInfo,
): Promise<'restarting' | 'permission-required' | 'installer-opened' | 'open-url'> {
  if (info.mode === 'ota' && nativeOta && info.bundleUrl && info.runtimeVersion) {
    await nativeOta.downloadAndApplyOta(
      info.bundleUrl,
      info.bundleSha256 ?? '',
      info.latestVersion,
      info.runtimeVersion,
    );
    nativeOta.restartApp();
    return 'restarting';
  }

  if (info.mode === 'apk' && nativeOta && info.apkUrl) {
    const res = await nativeOta.downloadAndInstallApk(info.apkUrl);
    return res.status;
  }

  return 'open-url';
}
