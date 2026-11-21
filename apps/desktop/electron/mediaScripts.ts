export type MediaControlAction =
  | 'play-pause'
  | 'pause'
  | 'play'
  | 'next'
  | 'previous'
  | 'pip'
  | 'pip-enter'
  | 'rewind-15'
  | 'like-track';

/**
 * Generates an injected JavaScript snippet to control media playback, Video PiP,
 * guaranteed ±30s Audible skips, 15s sleep-resume rewind, or Spotify/YTM Heart/Like.
 */
export function buildMediaControlScript(action: MediaControlAction): string {
  return `(function () {
    const host = (location.hostname || '').toLowerCase();
    const clickFirst = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && typeof el.click === 'function') {
          el.click();
          return true;
        }
      }
      return false;
    };

    const mediaEls = () => Array.from(document.querySelectorAll('video, audio'));
    const seekPrimaryMedia = (deltaSeconds) => {
      const m = mediaEls().find((el) => !el.paused) || mediaEls()[0];
      if (m && Number.isFinite(m.currentTime)) {
        const maxDur = Number.isFinite(m.duration) ? m.duration : m.currentTime + Math.abs(deltaSeconds);
        m.currentTime = Math.max(0, Math.min(maxDur, m.currentTime + deltaSeconds));
        return true;
      }
      return false;
    };

    const bindPipPersistence = (video) => {
      if (!video || video.__odPipTracked) return;
      video.__odPipTracked = true;
      video.addEventListener('enterpictureinpicture', () => {
        window.__odPipActive = true;
        window.__odPipNeedsRestore = false;
      });
      video.addEventListener('leavepictureinpicture', () => {
        window.__odPipActive = false;
        window.__odPipLeftAt = Date.now();
        // If Chromium closed PiP right as the video emptied or swapped tracks, mark for restore
        if (video.readyState <= 1 || video.ended) {
          window.__odPipNeedsRestore = true;
        }
      });
      const markIfJustLeft = () => {
        if (window.__odPipLeftAt && Date.now() - window.__odPipLeftAt < 2500) {
          window.__odPipNeedsRestore = true;
        }
      };
      video.addEventListener('emptied', markIfJustLeft);
      video.addEventListener('loadstart', markIfJustLeft);
    };

    if (${JSON.stringify(action)} === 'pip' || ${JSON.stringify(action)} === 'pip-enter') {
      const videos = Array.from(document.querySelectorAll('video'))
        .filter((v) => v.readyState >= 2 && v.videoWidth > 0)
        .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
      const target = videos[0];
      if (!target) return 'no-video';
      bindPipPersistence(target);
      if (document.pictureInPictureElement) {
        if (${JSON.stringify(action)} === 'pip-enter') {
          window.__odPipNeedsRestore = false;
          return 'already-in-pip';
        }
        window.__odPipNeedsRestore = false;
        window.__odPipActive = false;
        document.exitPictureInPicture().catch(() => {});
        return 'exited';
      }
      if (typeof target.requestPictureInPicture === 'function') {
        target.disablePictureInPicture = false;
        window.__odPipNeedsRestore = false;
        target.requestPictureInPicture().catch(() => {});
        return 'entered';
      }
      return 'unsupported';
    }

    if (${JSON.stringify(action)} === 'rewind-15') {
      return seekPrimaryMedia(-15) ? 'rewound' : 'noop';
    }

    if (${JSON.stringify(action)} === 'like-track') {
      if (host.includes('spotify.com')) {
        if (clickFirst([
          '[data-testid="add-button"]',
          'button[aria-label*="Save to Your Library" i]',
          'button[aria-label*="Save to Liked Songs" i]',
          'button[aria-label*="Remove from Your Library" i]'
        ])) return 'liked';
      }
      if (host.includes('music.youtube.com')) {
        if (clickFirst([
          'ytmusic-player-bar ytmusic-like-button-renderer #button-shape-like button',
          'ytmusic-player-bar button[aria-label="Like"]',
          'ytmusic-player-bar button[aria-label="Remove like"]'
        ])) return 'liked';
      }
      if (host.includes('youtube.com')) {
        if (clickFirst([
          'like-button-view-model button',
          'ytd-watch-metadata button[aria-label*="like this video" i]'
        ])) return 'liked';
      }
      return 'noop';
    }

    if (${JSON.stringify(action)} === 'pause') {
      let pausedAny = false;
      for (const m of mediaEls()) {
        if (!m.paused) {
          m.pause();
          pausedAny = true;
        }
      }
      if (!pausedAny && host.includes('spotify.com')) {
        clickFirst(['[data-testid="control-button-playpause"][aria-label*="Pause" i]']);
      }
      if (!pausedAny && host.includes('audible.')) {
        clickFirst(['.adblPauseButton', 'button[aria-label*="Pause" i]']);
      }
      return 'paused';
    }

    if (${JSON.stringify(action)} === 'play') {
      if (host.includes('spotify.com')) {
        if (clickFirst(['[data-testid="control-button-playpause"][aria-label*="Play" i]', '[data-testid="control-button-playpause"]'])) return 'ok';
      }
      if (host.includes('audible.')) {
        if (clickFirst(['.adblPlayButton', 'button[aria-label*="Play" i]'])) return 'ok';
      }
      const m = mediaEls()[0];
      if (m) {
        m.play().catch(() => {});
        return 'ok';
      }
      return 'noop';
    }

    if (${JSON.stringify(action)} === 'play-pause') {
      if (host.includes('spotify.com')) {
        if (clickFirst(['[data-testid="control-button-playpause"]'])) return 'ok';
      }
      if (host.includes('music.youtube.com')) {
        if (clickFirst(['#play-pause-button', 'tp-yt-paper-icon-button.play-pause-button'])) return 'ok';
      }
      if (host.includes('youtube.com')) {
        if (clickFirst(['.ytp-play-button'])) return 'ok';
      }
      if (host.includes('twitch.tv')) {
        if (clickFirst(['[data-a-target="player-play-pause-button"]'])) return 'ok';
      }
      if (host.includes('audible.')) {
        if (clickFirst(['.adblPlayButton', '.adblPauseButton', 'button[aria-label*="Play" i]', 'button[aria-label*="Pause" i]'])) return 'ok';
      }
      const m = mediaEls().find((el) => !el.paused) || mediaEls()[0];
      if (m) {
        if (m.paused) m.play().catch(() => {});
        else m.pause();
        return 'ok';
      }
      return 'noop';
    }

    if (${JSON.stringify(action)} === 'next') {
      if (host.includes('spotify.com')) {
        if (clickFirst(['[data-testid="control-button-skip-forward"]'])) return 'ok';
      }
      if (host.includes('music.youtube.com')) {
        if (clickFirst(['.next-button', 'tp-yt-paper-icon-button.next-button'])) return 'ok';
      }
      if (host.includes('youtube.com')) {
        if (clickFirst(['.ytp-next-button'])) return 'ok';
      }
      if (host.includes('audible.')) {
        if (clickFirst(['.adblFastForward', 'button[aria-label*="Forward" i]', 'button[aria-label*="Next" i]'])) return 'ok';
        if (seekPrimaryMedia(30)) return 'ok';
      }
      return 'noop';
    }

    if (${JSON.stringify(action)} === 'previous') {
      if (host.includes('spotify.com')) {
        if (clickFirst(['[data-testid="control-button-skip-back"]'])) return 'ok';
      }
      if (host.includes('music.youtube.com')) {
        if (clickFirst(['.previous-button', 'tp-yt-paper-icon-button.previous-button'])) return 'ok';
      }
      if (host.includes('youtube.com')) {
        if (clickFirst(['.ytp-prev-button'])) return 'ok';
      }
      if (host.includes('audible.')) {
        if (clickFirst(['.adblFastRewind', 'button[aria-label*="Back" i]', 'button[aria-label*="Rewind" i]'])) return 'ok';
        if (seekPrimaryMedia(-30)) return 'ok';
      }
      return 'noop';
    }

    return 'noop';
  })();`;
}
