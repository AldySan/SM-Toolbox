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
      config: { options: { name: 'sm-toolbox', bin: 'sm-toolbox' } },
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
