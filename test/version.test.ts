// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { compareVersions, isUpdateAvailable, normalizeTag, parseVersion } from '../src/main/lib/version';

describe('normalizeTag', () => {
  it('strips a leading v or V', () => {
    expect(normalizeTag('v1.2.3')).toBe('1.2.3');
    expect(normalizeTag('V1.2.3')).toBe('1.2.3');
  });

  it('keeps tags without a prefix unchanged', () => {
    expect(normalizeTag('1.2.3')).toBe('1.2.3');
    expect(normalizeTag('release-1')).toBe('release-1');
  });
});

describe('parseVersion', () => {
  it('parses core versions with optional v prefix and build metadata', () => {
    expect(parseVersion('v1.2.3')).toEqual({ core: [1, 2, 3], pre: null });
    expect(parseVersion('1.2.3+build.5')).toEqual({ core: [1, 2, 3], pre: null });
    expect(parseVersion('0.1')).toEqual({ core: [0, 1], pre: null });
  });

  it('parses prerelease identifiers', () => {
    expect(parseVersion('1.0.0-rc.1')).toEqual({ core: [1, 0, 0], pre: ['rc', '1'] });
    expect(parseVersion('1.0.0-alpha-1')).toEqual({ core: [1, 0, 0], pre: ['alpha-1'] });
  });

  it('rejects garbage', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('1.2.x')).toBeNull();
    expect(parseVersion('1.0.0-')).toBeNull();
    expect(parseVersion('v')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders cores numerically', () => {
    expect(compareVersions('0.9.9', '0.10.0')).toBe(-1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('treats missing components as zero', () => {
    expect(compareVersions('0.2', '0.2.0')).toBe(0);
    expect(compareVersions('0.2', '0.2.1')).toBe(-1);
  });

  it('ranks prereleases below their release', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.2')).toBe(-1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    expect(compareVersions('1.0.0-2', '1.0.0-10')).toBe(-1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
  });

  it('ignores build metadata', () => {
    expect(compareVersions('1.2.3+build', '1.2.3')).toBe(0);
  });

  it('returns null for unparseable input', () => {
    expect(compareVersions('nope', '1.0.0')).toBeNull();
    expect(compareVersions('1.0.0', 'latest')).toBeNull();
  });
});

describe('isUpdateAvailable', () => {
  it('reports only strictly newer tags', () => {
    expect(isUpdateAvailable('0.1.0', 'v0.2.0')).toBe(true);
    expect(isUpdateAvailable('0.1.0', 'v0.1.0')).toBe(false);
    expect(isUpdateAvailable('0.1.0', 'v0.1.0-rc.1')).toBe(false);
    expect(isUpdateAvailable('0.1.0', 'v0.2.0-beta')).toBe(true);
  });

  it('never reports an update for unparseable tags', () => {
    expect(isUpdateAvailable('0.1.0', 'latest')).toBe(false);
    expect(isUpdateAvailable('0.1.0', '')).toBe(false);
  });
});
