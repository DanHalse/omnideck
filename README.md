# OmniDeck

**OmniDeck** is a cross-platform multi-service media hub for **Windows**, **Linux**, and **Android** that keeps you simultaneously signed in to **YouTube, Twitch, Spotify, YouTube Music, Reddit, and Audible** (plus any custom web apps you add) with instant quick-swap navigation, automatic self-updates, and uninterrupted background audio.

## Architecture

```text
omnideck/
├── packages/shared/     # Shared TypeScript domain model, default 6 services, brand SVGs,
│                        # workspaces, sync export/import, layout geometry & hibernation rules
├── apps/desktop/        # Windows & Linux desktop app (Castlabs Widevine Electron + Vite + React + electron-updater)
└── apps/mobile/         # Android app (React Native + Expo SDK 58 + persistent WebView stack)
```

## Features (v1.1.0)

- **Automatic Self-Updates (`electron-updater`)**: Downloads new versions automatically from GitHub Releases (`DanHalse/omnideck`) using `.blockmap` binary diffs and installs on restart without losing logins or preferences (in-place on Windows NSIS installer & Linux `AppImage`; release notifier on portable ZIP / `.deb`).
- **Unified Now Playing Mini-Controller + Hardware Media Keys**: Control Play/Pause, Previous, and Next for whichever app is playing right from the control strip, or via keyboard/headset media keys (`MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack`).
- **Smart Audio Switching**: Playing a YouTube video or Twitch stream automatically pauses competing Spotify, Audible, or YouTube Music playback—with a 1-click **Resume** button.
- **Built-in Network Ad & Tracker Shield**: Fast request-level filter engineered to preserve OAuth logins and Widevine DRM playback, with live per-app blocked counters and per-service toggle.
- **Picture-in-Picture & Always-on-Top**: Pop out active videos via HTML5 PiP (`Ctrl+Shift+P`) or pin OmniDeck floating above other windows (`Ctrl+Shift+T`).
- **Live Notification Badges & Do Not Disturb**: Shows unread counts on menu bar icons and offers a 1-click **Do Not Disturb** mute for notifications & badges.
- **Workspaces & Presets**: Instant layout presets (**All Media**, **Focus Audio**, **Watch & Chat**) plus custom saved workspaces.
- **Cross-Device Config Sync**: Export/import portable JSON backups (or copy/paste Sync JSON directly between Windows, Linux, and Android).
- **Widevine DRM on Windows & Linux**: Powered by **Castlabs Electron for Content Security (`v45.2.1+wvcus`)** for Spotify Web Player and Audible Cloud Player.
- **Shared Google Session**: YouTube & YouTube Music share `persist:google` by default (configurable in Settings).
- **Configurable Layout & Split-View**: Toggle between **Top Menu Bar** and **Left Sidebar Rail** (`Ctrl+Shift+L`), run two services side-by-side (`Ctrl+\`) with a draggable divider, and sleep idle tabs to save RAM.

## Getting Started

```bash
npm install
npm run build:shared
npm run dev:desktop
```

### Automated Releases (Self-Updating Builds)

Pushing a version tag (`v1.1.0`, `v1.2.0`, etc.) triggers [.github/workflows/release.yml](.github/workflows/release.yml) on `windows-latest` and `ubuntu-latest` to build and publish:
- **Windows**: `OmniDeck-Setup-<ver>.exe` (self-updating NSIS installer), `OmniDeck-Portable-<ver>.exe`, `OmniDeck-<ver>-win-x64.zip`, `latest.yml`, `.blockmap`
- **Linux**: `OmniDeck-<ver>-x86_64.AppImage` (self-updating), `OmniDeck-<ver>-amd64.deb`, `latest-linux.yml`

### Packaging Locally

```bash
npm run package:linux   # AppImage & .deb -> apps/desktop/release/
npm run package:win     # NSIS Setup & Portable .exe (run on Windows)
```

### Android Mobile App

```bash
npm run dev:mobile
npx eas-cli build --platform android --profile preview
```

## Desktop Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Quick-swap to App 1–9 | `Ctrl + 1` … `Ctrl + 9` |
| Next / Previous App | `Ctrl + Tab` / `Ctrl + Shift + Tab` |
| Play / Pause Now Playing | `Ctrl + Shift + Space` (or Media Key) |
| Toggle Split-View | `Ctrl + \` |
| Video Picture-in-Picture | `Ctrl + Shift + P` |
| Pin Always on Top | `Ctrl + Shift + T` |
| Toggle Top Bar / Left Sidebar | `Ctrl + Shift + L` |
| Mute / Unmute Active App | `Ctrl + M` |
| Mute All Apps | `Ctrl + Shift + M` |
| Sleep Active App (Free RAM) | `Ctrl + Shift + H` |
| Open Settings | `Ctrl + ,` |
| Manage Apps | `Ctrl + Shift + A` |
