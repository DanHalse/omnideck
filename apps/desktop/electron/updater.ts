import fs from 'node:fs';
import path from 'node:path';
import { app, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import {
  GITHUB_RELEASES_URL,
  GITHUB_REPO_NAME,
  GITHUB_REPO_OWNER,
  type UpdateState,
} from '@omnideck/shared';

/**
 * Compares two semantic version strings (e.g. "1.2.0" vs "1.1.0").
 * Returns true if `candidate` is strictly newer than `current`.
 */
export function isNewerSemver(candidate: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);

  const a = parse(candidate);
  const b = parse(current);
  const len = Math.max(a.length, b.length, 3);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

/**
 * Determines whether the currently running desktop package supports automatic in-place
 * self-replacement via `electron-updater` (Windows NSIS installer & Linux AppImage).
 * Portable Windows `.zip` and Linux `.deb` builds still check GitHub Releases and offer
 * a 1-click download link!
 */
export function supportsInPlaceAutoUpdate(): boolean {
  if (!app.isPackaged) return false;

  if (process.platform === 'linux') {
    return Boolean(process.env.APPIMAGE);
  }

  if (process.platform === 'win32') {
    // electron-builder writes app-update.yml into resources/ for NSIS builds
    const updateCfg = path.join(process.resourcesPath || '', 'app-update.yml');
    return fs.existsSync(updateCfg) && !process.env.PORTABLE_EXECUTABLE_DIR;
  }

  return false;
}

export class UpdateManager {
  private readonly onStateChanged: (state: UpdateState) => void;
  private state: UpdateState;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private initializedNative = false;

  constructor(onStateChanged: (state: UpdateState) => void) {
    this.onStateChanged = onStateChanged;
    const currentVersion = app.getVersion();
    const canAutoInstall = supportsInPlaceAutoUpdate();

    this.state = {
      phase: 'idle',
      currentVersion,
      releaseUrl: GITHUB_RELEASES_URL,
      canAutoInstall,
      message: canAutoInstall
        ? `OmniDeck v${currentVersion} — Automatic self-updates enabled.`
        : `OmniDeck v${currentVersion} — Checks GitHub Releases for new versions.`,
    };

    if (canAutoInstall) {
      this.setupNativeAutoUpdater();
    }
  }

  getState(): UpdateState {
    return this.state;
  }

  startSchedule(enabled: boolean): void {
    this.stopSchedule();
    if (!enabled) return;

    this.startupTimer = setTimeout(() => {
      void this.checkForUpdates(true);
    }, 6_000);

    // Re-check every 4 hours while app remains open
    this.periodicTimer = setInterval(() => {
      void this.checkForUpdates(true);
    }, 4 * 60 * 60_000);
  }

  stopSchedule(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  async checkForUpdates(silent = false): Promise<UpdateState> {
    if (this.state.phase === 'checking' || this.state.phase === 'downloading') {
      return this.state;
    }

    this.updateState({
      phase: 'checking',
      message: 'Checking GitHub Releases for updates…',
    });

    if (this.initializedNative) {
      try {
        await autoUpdater.checkForUpdates();
        return this.state;
      } catch (err) {
        if (!silent) {
          this.updateState({
            phase: 'error',
            message: `Update check failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        } else {
          this.updateState({ phase: 'idle' });
        }
        return this.state;
      }
    }

    // Fallback for portable Windows ZIP, Linux .deb, or dev mode: query GitHub Releases API directly
    return this.checkGitHubReleasesApi(silent);
  }

  quitAndInstall(): void {
    if (this.initializedNative && this.state.phase === 'downloaded') {
      autoUpdater.quitAndInstall(false, true);
      return;
    }
    this.openReleasePage();
  }

  openReleasePage(): void {
    const target = this.state.releaseUrl || GITHUB_RELEASES_URL;
    if (target.startsWith('https://')) {
      void shell.openExternal(target);
    }
  }

  private setupNativeAutoUpdater(): void {
    this.initializedNative = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => {
      this.updateState({
        phase: 'checking',
        message: 'Checking for OmniDeck updates…',
      });
    });

    autoUpdater.on('update-available', (info) => {
      const notes =
        typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map((n) => n.note ?? '').join('\n')
            : undefined;

      this.updateState({
        phase: 'downloading',
        availableVersion: info.version,
        progressPercent: 0,
        releaseNotes: notes,
        releaseUrl: `${GITHUB_RELEASES_URL}/tag/v${info.version}`,
        message: `Downloading OmniDeck v${info.version} in background…`,
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      const pct = Math.max(0, Math.min(100, Math.round(progress.percent)));
      this.updateState({
        phase: 'downloading',
        progressPercent: pct,
        message: `Downloading OmniDeck v${this.state.availableVersion ?? ''} (${pct}%)…`,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.updateState({
        phase: 'downloaded',
        availableVersion: info.version,
        progressPercent: 100,
        releaseUrl: `${GITHUB_RELEASES_URL}/tag/v${info.version}`,
        message: `OmniDeck v${info.version} is ready — restart to install.`,
      });
    });

    autoUpdater.on('update-not-available', () => {
      this.updateState({
        phase: 'up-to-date',
        progressPercent: undefined,
        message: `OmniDeck v${this.state.currentVersion} is up to date.`,
      });
    });

    autoUpdater.on('error', (err) => {
      this.updateState({
        phase: 'error',
        message: `Auto-update error: ${err?.message ?? String(err)}`,
      });
    });
  }

  private async checkGitHubReleasesApi(silent: boolean): Promise<UpdateState> {
    try {
      const apiUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;
      const response = await fetch(apiUrl, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `OmniDeck/${this.state.currentVersion}`,
        },
      });

      if (response.status === 404) {
        this.updateState({
          phase: 'up-to-date',
          message: `OmniDeck v${this.state.currentVersion} is up to date.`,
        });
        return this.state;
      }

      if (!response.ok) {
        throw new Error(`GitHub API returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        tag_name?: string;
        html_url?: string;
        body?: string;
      };

      const latestVersion = (data.tag_name ?? '').replace(/^v/i, '');
      if (latestVersion && isNewerSemver(latestVersion, this.state.currentVersion)) {
        this.updateState({
          phase: 'available',
          availableVersion: latestVersion,
          releaseUrl: data.html_url || `${GITHUB_RELEASES_URL}/tag/v${latestVersion}`,
          releaseNotes: data.body || undefined,
          message: `OmniDeck v${latestVersion} is available on GitHub Releases.`,
        });
      } else {
        this.updateState({
          phase: 'up-to-date',
          message: `OmniDeck v${this.state.currentVersion} is up to date.`,
        });
      }
    } catch (err) {
      if (silent) {
        this.updateState({ phase: 'idle' });
      } else {
        this.updateState({
          phase: 'error',
          message: `Could not check for updates: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
    return this.state;
  }

  private updateState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChanged(this.state);
  }
}
