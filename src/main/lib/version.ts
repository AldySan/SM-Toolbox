// SPDX-License-Identifier: GPL-3.0-or-later
// Semantic-version helpers for the update checker. Pure and free of Electron
// imports so they stay unit-testable.

export interface ParsedVersion {
  core: number[];
  pre: string[] | null;
}

/** Strip an optional leading `v`/`V` from a release tag. */
export function normalizeTag(tag: string): string {
  return /^[vV]/.test(tag) ? tag.slice(1) : tag;
}

/** Parse `1.2.3`, `v1.2` or `1.0.0-rc.1+build` into core and prerelease parts. */
export function parseVersion(input: string): ParsedVersion | null {
  const value = normalizeTag(input.trim()).split('+')[0];
  if (!value) return null;

  const dash = value.indexOf('-');
  const main = dash === -1 ? value : value.slice(0, dash);
  const prePart = dash === -1 ? null : value.slice(dash + 1);

  const core = main.split('.');
  if (core.length > 4 || core.some((part) => !/^\d+$/.test(part))) return null;

  let pre: string[] | null = null;
  if (prePart !== null) {
    pre = prePart.split('.');
    if (pre.some((part) => part === '')) return null;
  }

  return { core: core.map(Number), pre };
}

function compareCore(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Semver prerelease precedence: a release outranks any prerelease of the same core. */
function comparePre(a: string[] | null, b: string[] | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const xi = Number(x);
      const yi = Number(y);
      if (xi !== yi) return xi < yi ? -1 : 1;
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** Compare two version strings; `null` when either side is not parseable. */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  const core = compareCore(pa.core, pb.core);
  return core !== 0 ? core : comparePre(pa.pre, pb.pre);
}

/** True when `latestTag` is strictly newer than `current`. Unparseable tags never report an update. */
export function isUpdateAvailable(current: string, latestTag: string): boolean {
  const comparison = compareVersions(current, latestTag);
  return comparison !== null && comparison < 0;
}
