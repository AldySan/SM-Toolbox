// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { installedTags, planSetup, shouldUpdate } from '../src/main/lib/setup';
import type { AppSettings } from '../src/shared/types';

describe('shouldUpdate', () => {
  it('updates on strictly newer semver tags', () => {
    expect(shouldUpdate('v0.4.0', 'v0.5.0')).toBe(true);
    expect(shouldUpdate('v1.2', 'v1.2.1')).toBe(true);
  });

  it('stays on equal or older tags', () => {
    expect(shouldUpdate('v0.5.0', 'v0.5.0')).toBe(false);
    expect(shouldUpdate('v0.6.0', 'v0.5.0')).toBe(false);
  });

  it('treats different non-semver tags as a new release', () => {
    expect(shouldUpdate('release-9', 'release-10')).toBe(true);
    expect(shouldUpdate('release-9', 'release-9')).toBe(false);
  });

  it('returns false without complete information', () => {
    expect(shouldUpdate(undefined, 'v1.0.0')).toBe(false);
    expect(shouldUpdate('v1.0.0', undefined)).toBe(false);
    expect(shouldUpdate(undefined, undefined)).toBe(false);
  });
});

describe('planSetup', () => {
  it('installs missing tools', () => {
    const plan = planSetup({ mkpfs: 'missing', ufs2tool: 'missing' }, {}, {});
    expect(plan).toEqual([
      expect.objectContaining({ tool: 'ufs2tool', action: 'install' }),
      expect.objectContaining({ tool: 'mkpfs', action: 'install' }),
    ]);
  });

  it('updates cache-managed tools when a newer release is known', () => {
    const plan = planSetup(
      { mkpfs: 'bundled-whl', ufs2tool: 'bundled-whl' },
      { mkpfs: 'v0.4.0', ufs2tool: 'v1.14.0' },
      { mkpfs: 'v0.4.1', ufs2tool: 'v1.14.0' },
    );
    const byTool = Object.fromEntries(plan.map((entry) => [entry.tool, entry]));
    expect(byTool.mkpfs.action).toBe('update');
    expect(byTool.mkpfs.reason).toBe('v0.4.0 -> v0.4.1');
    expect(byTool.ufs2tool.action).toBe('skip');
  });

  it('skips updates when release info is unavailable', () => {
    const plan = planSetup(
      { mkpfs: 'bundled-whl', ufs2tool: 'bundled-whl' },
      { mkpfs: 'v0.4.0', ufs2tool: 'v1.14.0' },
      {},
    );
    expect(plan.every((entry) => entry.action === 'skip')).toBe(true);
  });

  it('never touches override or PATH tools', () => {
    const plan = planSetup(
      { mkpfs: 'override', ufs2tool: 'path' },
      { mkpfs: 'v0.4.0', ufs2tool: 'v1.14.0' },
      { mkpfs: 'v0.9.0', ufs2tool: 'v2.0.0' },
    );
    expect(plan.every((entry) => entry.action === 'skip')).toBe(true);
  });

  it('installs again when the cache tag is gone but the tool is missing', () => {
    const plan = planSetup({ mkpfs: 'missing', ufs2tool: 'bundled-whl' }, { mkpfs: 'v0.4.0' }, {});
    const byTool = Object.fromEntries(plan.map((entry) => [entry.tool, entry]));
    expect(byTool.mkpfs.action).toBe('install');
    expect(byTool.ufs2tool.action).toBe('skip');
  });
});

describe('installedTags', () => {
  it('reads only set tags out of settings', () => {
    const settings = {
      toolVersions: { mkpfs: 'v0.4.0', ufs2tool: '' },
    } as AppSettings;
    expect(installedTags(settings)).toEqual({ mkpfs: 'v0.4.0' });
  });
});
