// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { builderScripts } from '../src/main/lib/env';

const IS_WINDOWS = process.platform === 'win32';
const SCRIPT = IS_WINDOWS ? 'New-OsfExfatImage.ps1' : 'mkexfat.sh';

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

describe('builderScripts', () => {
  it('prefers scripts fetched through the tool manager over the bundled copies', () => {
    const downloaded = makeDir(true);
    const bundled = makeDir(true);
    const result = builderScripts(downloaded, bundled);
    expect(result.ok).toBe(true);
    expect(result.origin).toBe('downloaded');
    expect(result.dir).toBe(downloaded);
  });

  it('falls back to the bundled scripts when nothing was fetched', () => {
    const bundled = makeDir(true);
    const result = builderScripts(undefined, bundled);
    expect(result.ok).toBe(true);
    expect(result.origin).toBe('bundled');
    expect(result.dir).toBe(bundled);
  });

  it('ignores an incomplete download and falls back to the bundled copy', () => {
    const downloaded = makeDir(false);
    const bundled = makeDir(true);
    const result = builderScripts(downloaded, bundled);
    expect(result.ok).toBe(true);
    expect(result.origin).toBe('bundled');
    expect(result.dir).toBe(bundled);
  });

  it('reports missing when neither copy has the script', () => {
    const result = builderScripts(undefined, makeDir(false));
    expect(result.ok).toBe(false);
    expect(result.origin).toBe('missing');
    expect(result.detail).toContain(SCRIPT);
  });
});
