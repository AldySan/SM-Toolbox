// SPDX-License-Identifier: GPL-3.0-or-later
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../../shared/types';

const DEFAULTS: AppSettings = {
  theme: 'auto',
  repoPath: '',
  toolPaths: { mkpfs: '', ufs2tool: '' },
  toolCache: { mkpfs: '', ufs2tool: '' },
  privilege: 'auto',
  defaultOutDir: '',
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
    ps5: { ...current.ps5, ...(patch.ps5 ?? {}) },
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return merge({ ...DEFAULTS }, parsed);
  } catch {
    return {
      ...DEFAULTS,
      toolPaths: { ...DEFAULTS.toolPaths },
      toolCache: { ...DEFAULTS.toolCache },
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
