const { withAndroidManifest } = require('@expo/config-plugins');

const REQUIRED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.WAKE_LOCK',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
];

/**
 * Expo Config Plugin configuring Android permissions & hardware acceleration for
 * persistent multi-WebView audio playback and Widevine EME DRM streams (Spotify & Audible).
 */
module.exports = function withAndroidDrmWebView(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    if (!Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = [];
    }

    const existing = new Set(
      manifest['uses-permission']
        .map((item) => item?.$?.['android:name'])
        .filter(Boolean),
    );

    for (const perm of REQUIRED_PERMISSIONS) {
      if (!existing.has(perm)) {
        manifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    }

    const app = manifest.application?.[0];
    if (app?.$) {
      app.$['android:hardwareAccelerated'] = 'true';
    }

    return modConfig;
  });
};
