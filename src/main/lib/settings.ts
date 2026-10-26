// SPDX-License-Identifier: GPL-3.0-or-later
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../../shared/types';

const DEFAULTS: AppSettings = {
  theme: 'auto',
  buildersVersion: '',
  toolPaths: { mkpfs: '', ufs2tool: '' },
  toolCache: { mkpfs: '', ufs2tool: '' },
  toolVersions: { mkpfs: '', ufs2tool: '' },
  privilege: 'auto',
  defaultOutDir: '',
  autoCheckUpdates: true,
  sidebarCollapsed: false,
  createDefaults: { autoVerify: true, deleteSource: false },
  ps5: { host: '', port: 9021 },
  recentHosts: [],
};

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function merge(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...current,
    ...patch,
    toolPaths: { ...current.toolPaths, ...(patch.toolPaths ?? {}) },
    toolCache: { ...current.toolCache, ...(patch.toolCache ?? {}) },
    toolVersions: { ...current.toolVersions, ...(patch.toolVersions ?? {}) },
    createDefaults: { ...current.createDefaults, ...(patch.createDefaults ?? {}) },
    ps5: { ...current.ps5, ...(patch.ps5 ?? {}) },
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppSettings> & { repoPath?: string };
    // Drop the pre-release checkout setting so it does not linger in the file.
    const { repoPath: _legacyRepoPath, ...known } = parsed;
    return merge({ ...DEFAULTS, createDefaults: { ...DEFAULTS.createDefaults } }, known);
  } catch {
    return {
      ...DEFAULTS,
      toolPaths: { ...DEFAULTS.toolPaths },
      toolCache: { ...DEFAULTS.toolCache },
      toolVersions: { ...DEFAULTS.toolVersions },
      createDefaults: { ...DEFAULTS.createDefaults },
      ps5: { ...DEFAULTS.ps5 },
    };
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = merge(loadSettings(), patch);
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}
