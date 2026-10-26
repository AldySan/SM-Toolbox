// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoScripts } from '../src/main/lib/env';
import type { AppSettings } from '../src/shared/types';

const IS_WINDOWS = process.platform === 'win32';
const SCRIPT = IS_WINDOWS ? 'New-OsfExfatImage.ps1' : 'mkexfat.sh';

const settings = (repoPath = ''): AppSettings =>
  ({ repoPath } as AppSettings);

const dirs: string[] = [];

function makeDir(withScript: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smp-env-'));
  dirs.push(dir);
  if (withScript) fs.writeFileSync(path.join(dir, SCRIPT), '#!/bin/sh\n');
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('repoScripts', () => {
  it('prefers a checkout that contains the builder script', () => {
    const checkout = makeDir(true);
    const bundled = makeDir(true);
    const result = repoScripts(settings(checkout), bundled);
    expect(result.ok).toBe(true);
    expect(result.origin).toBe('checkout');
    expect(result.dir).toBe(checkout);
  });

  it('falls back to the bundled scripts when no checkout is set', () => {
    const bundled = makeDir(true);
    const result = repoScripts(settings(''), bundled);
    expect(result.ok).toBe(true);
    expect(result.origin).toBe('bundled');
    expect(result.dir).toBe(bundled);
  });

  it('reports missing when the checkout is set but has no script', () => {
    const checkout = makeDir(false);
    const bundled = makeDir(true);
    const result = repoScripts(settings(checkout), bundled);
    expect(result.ok).toBe(false);
    expect(result.origin).toBe('missing');
    expect(result.detail).toContain(SCRIPT);
  });

  it('reports missing when neither checkout nor bundled dir has the script', () => {
    const result = repoScripts(settings(''), makeDir(false));
    expect(result.ok).toBe(false);
    expect(result.origin).toBe('missing');
  });
});
