// SPDX-License-Identifier: GPL-3.0-or-later
import { app, BrowserWindow, shell } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';
import { registerIpc } from './ipc';

const isSmokeTest = process.argv.includes('--smoke-test');

// Exit early on Windows Squirrel install/uninstall events.
const shouldRun = !started;

const gotLock = shouldRun && app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'SM+ Toolbox',
    backgroundColor: '#101318',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    if (isSmokeTest) {
      console.log('[smoke] window shown');
      setTimeout(() => app.exit(0), 600);
    }
  });

  // External links open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // setWindowOpenHandler only covers new windows; links without a target
  // would otherwise navigate this window to a remote page that still has
  // access to the preload API. Keep in-window navigation on the app itself
  // and hand approved HTTPS links to the system browser instead.
  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return;
    event.preventDefault();
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
  });

  const devServerUrl =
    typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined;
  const rendererName = typeof MAIN_WINDOW_VITE_NAME !== 'undefined' ? MAIN_WINDOW_VITE_NAME : 'main';

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(__dirname, `../renderer/${rendererName}/index.html`));
  }
}
