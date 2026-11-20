/**
 * Optional Castlabs EVS VMP signing hook for Windows production DRM builds.
 *
 * Linux Widevine playback works without VMP signing.
 * On Windows, development/UAT playback works out of the box with Castlabs ECS, while
 * commercial production DRM streams (Spotify/Audible) on packaged Windows binaries
 * benefit from Castlabs' free EVS signing CLI (`python3 -m castlabs_evs.vmp sign-pkg`).
 *
 * Set `OMNIDECK_SIGN_EVS=1` in CI/release environments after logging into `castlabs-evs`.
 */
const { execFileSync } = require('node:child_process');

exports.default = async function afterSign(context) {
  if (process.env.OMNIDECK_SIGN_EVS !== '1') {
    return;
  }
  const platform = context.electronPlatformName;
  if (platform !== 'win32' && platform !== 'darwin') {
    return;
  }

  console.log(`[OmniDeck] Running Castlabs EVS VMP signing on ${context.appOutDir}...`);
  execFileSync('python3', ['-m', 'castlabs_evs.vmp', 'sign-pkg', context.appOutDir], {
    stdio: 'inherit',
  });
};
