export type MediaControlAction = 'play-pause' | 'pause' | 'play' | 'next' | 'previous' | 'pip';

/**
 * Generates an injected JavaScript snippet to control media playback or Video PiP
 * inside YouTube, YouTube Music, Spotify, Twitch, Audible, or any custom HTML5 media app.
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

    if (${JSON.stringify(action)} === 'pip') {
      const videos = Array.from(document.querySelectorAll('video'))
        .filter((v) => v.readyState >= 2 && v.videoWidth > 0)
        .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
      const target = videos[0];
      if (!target) return 'no-video';
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
        return 'exited';
      }
      if (typeof target.requestPictureInPicture === 'function') {
        target.disablePictureInPicture = false;
        target.requestPictureInPicture().catch(() => {});
        return 'entered';
      }
      return 'unsupported';
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
      }
      return 'noop';
    }

    return 'noop';
  })();`;
}
