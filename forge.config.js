// SPDX-License-Identifier: GPL-3.0-or-later
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

// Deb/rpm installers and the AppImage maker resolve the executable and the
// package name from package.json "name" by default and ignore
// packagerConfig.executableName, so both are set explicitly here.
const LINUX_PACKAGES = {
  name: 'sm-toolbox',
  bin: 'sm-toolbox',
  productName: 'SM+ Toolbox',
  maintainer: 'AldySan',
  homepage: 'https://github.com/AldySan/SM-Toolbox',
  icon: 'assets/icon.png',
  categories: ['Utility'],
};

// The app ships English UI strings only; every other Chromium locale pack
// (~7.7 MiB across ~50 .pak files) is dead weight in all six installers.
// Chromium falls back to en-US when a locale file is missing.
async function pruneLocales({ buildPath }) {
  const fs = require('node:fs');
  const path = require('node:path');
  // buildPath is <package>/resources/app; the locale packs sit two levels up.
  const localesDir = path.join(buildPath, '..', '..', 'locales');
  if (fs.existsSync(localesDir)) {
    for (const name of fs.readdirSync(localesDir)) {
      if (name.endsWith('.pak') && name !== 'en-US.pak') {
        fs.rmSync(path.join(localesDir, name), { force: true });
      }
    }
  }
}

// Put forge/ first on PATH for this process (and everything it spawns) so the
// AppImage maker resolves forge/mksquashfs, which widens SquashFS blocks from
// the maker's 16 KiB to 1 MiB for ~20% smaller AppImage downloads. Windows
// never builds AppImages, so it keeps its PATH untouched.
if (process.platform !== 'win32') {
  const path = require('node:path');
  const wrapperDir = path.join(__dirname, 'forge');
  if (!process.env.PATH.split(':').includes(wrapperDir)) {
    process.env.PATH = `${wrapperDir}:${process.env.PATH}`;
  }
}

const config = {
  packagerConfig: {
    name: 'sm-toolbox',
    executableName: 'sm-toolbox',
    asar: true,
    icon: 'assets/icon',
    appCopyright: 'Copyright (C) ShadowMountPlus contributors',
    // exFAT builder scripts from ShadowMountPlus; shipped outside the asar so
    // they can be executed directly (bash / powershell -File).
    extraResource: ['resources/builders'],
    afterCopy: [pruneLocales],
  },
  rebuildConfig: {},
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['linux', 'win32'] },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: { name: 'sm_toolbox' },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: { options: { ...LINUX_PACKAGES, section: 'utils' } },
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        options: {
          ...LINUX_PACKAGES,
          // Upstream spec template breaks with rpm 4.17+ scriptlet cwd
          // (electron/forge#3701); use the patched copy in forge/rpm-spec.ejs.
          specTemplate: 'forge/rpm-spec.ejs',
        },
      },
    },
    {
      name: '@reforged/maker-appimage',
      platforms: ['linux'],
      // zstd instead of mksquashfs' gzip default: ~17% smaller downloads and
      // supported both by every kernel since 4.14 and by the type-2 runtime's
      // built-in extractor (which rejects xz, so xz would break no-FUSE
      // extract-and-run). Block size and level are tuned by forge/mksquashfs.
      config: { options: { name: 'sm-toolbox', bin: 'sm-toolbox', compressor: 'zstd' } },
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', target: 'main', config: 'vite.main.config.mts' },
        { entry: 'src/preload/preload.ts', target: 'preload', config: 'vite.preload.config.mts' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

module.exports = config;
