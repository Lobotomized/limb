/** electron-builder configuration: Windows (NSIS), macOS (DMG), Linux (AppImage + unpacked dir). */
'use strict';
module.exports = {
  appId: 'io.limbclash.game',
  productName: 'Limb Clash',
  directories: { output: 'release', buildResources: 'electron/build' },
  files: ['dist/**/*', 'electron/**/*.cjs', 'package.json', '!**/*.map'],
  extraResources: [{ from: 'steam.config.json', to: 'steam.config.json' }],
  // The Steamworks native module and libsteam_api must stay outside the asar archive.
  asarUnpack: ['node_modules/steamworks.js/**/*'],
  npmRebuild: false,
  // Builds are uploaded to Steam (see STEAM.md), not published by electron-builder.
  publish: null,
  win: { target: [{ target: 'nsis', arch: ['x64'] }] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
  mac: { target: [{ target: 'dmg', arch: ['x64', 'arm64'] }], category: 'public.app-category.games' },
  linux: { target: ['AppImage', 'dir'], category: 'Game', syncDesktopName: true },
};
