import path from 'node:path';
import { BrowserWindow, screen } from 'electron';
import type { DesktopSnapshot } from '@omnideck/shared';

interface SavedMiniBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class MiniPlayerManager {
  private win: BrowserWindow | null = null;
  private lastBounds: SavedMiniBounds | null = null;
  private readonly onStateChanged: () => void;

  constructor(onStateChanged: () => void) {
    this.onStateChanged = onStateChanged;
  }

  isOpen(): boolean {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible());
  }

  /**
   * Re-asserts highest reliable Windows/Linux always-on-top Z-order without stealing focus
   * from whatever app the user is working in.
   */
  ensureOnTop(): void {
    if (!this.win || this.win.isDestroyed()) return;
    if (!this.win.isVisible()) {
      this.win.showInactive();
    }
    this.win.setAlwaysOnTop(true, 'screen-saver', 1);
    this.win.moveTop();
  }

  open(snapshot?: DesktopSnapshot): void {
    if (this.win && !this.win.isDestroyed()) {
      this.ensureOnTop();
      if (snapshot) this.broadcast(snapshot);
      this.onStateChanged();
      return;
    }

    const defaultWidth = 408;
    const defaultHeight = 118;
    const primaryWorkArea = screen.getPrimaryDisplay().workArea;
    const defaultX = primaryWorkArea.x + primaryWorkArea.width - defaultWidth - 24;
    const defaultY = primaryWorkArea.y + primaryWorkArea.height - defaultHeight - 24;
    const bounds = this.lastBounds ?? {
      x: defaultX,
      y: defaultY,
      width: defaultWidth,
      height: defaultHeight,
    };

    const miniWin = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      minWidth: 300,
      minHeight: 96,
      maxWidth: 720,
      maxHeight: 280,
      x: bounds.x,
      y: bounds.y,
      frame: false,
      resizable: true,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: false,
      backgroundColor: '#161412',
      title: 'OmniDeck Mini-Player',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // 'screen-saver' level prevents Windows DWM from dropping the frameless HUD behind
    // maximized windows or OmniDeck's main window after clicking media controls.
    miniWin.setAlwaysOnTop(true, 'screen-saver', 1);
    miniWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    const saveBounds = () => {
      if (!miniWin.isDestroyed()) {
        const b = miniWin.getBounds();
        this.lastBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      }
    };

    miniWin.on('blur', () => {
      if (!miniWin.isDestroyed() && miniWin.isVisible()) {
        miniWin.setAlwaysOnTop(true, 'screen-saver', 1);
      }
    });

    miniWin.on('moved', saveBounds);
    miniWin.on('resized', saveBounds);

    miniWin.on('closed', () => {
      this.win = null;
      this.onStateChanged();
    });

    miniWin.webContents.on('did-finish-load', () => {
      if (snapshot) this.broadcast(snapshot);
      if (!miniWin.isDestroyed()) {
        miniWin.setAlwaysOnTop(true, 'screen-saver', 1);
      }
    });

    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
      void miniWin.loadURL(`${devServerUrl}#miniplayer`);
    } else {
      void miniWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
        hash: 'miniplayer',
      });
    }

    this.win = miniWin;
    this.onStateChanged();
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
    }
    this.win = null;
    this.onStateChanged();
  }

  toggle(snapshot?: DesktopSnapshot): boolean {
    if (this.isOpen()) {
      this.close();
      return false;
    }
    this.open(snapshot);
    return true;
  }

  broadcast(snapshot: DesktopSnapshot): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('omnideck:snapshot', snapshot);
    }
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy();
    }
    this.win = null;
  }
}
