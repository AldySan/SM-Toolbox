// SPDX-License-Identifier: GPL-3.0-or-later
// Planning logic for the one-click setup ("plug 2 play"). Pure and free of
// Electron imports so it stays unit-testable; the IPC layer owns the actual
// downloads.

import type { AppSettings } from '../../shared/types';
import { compareVersions } from './version';

export type ManagedTool = 'mkpfs' | 'ufs2tool';

/** Mirrors ToolInvocation['origin'] without importing the env module. */
export type ToolOrigin = 'override' | 'path' | 'bundled-whl' | 'missing';

export type SetupAction = 'install' | 'update' | 'skip';

export interface ToolPlanEntry {
  tool: ManagedTool;
  action: SetupAction;
  reason: string;
  currentTag?: string;
  latestTag?: string;
}

export interface SetupSummary {
  installed: ManagedTool[];
  updated: ManagedTool[];
  skipped: ManagedTool[];
  failed: { tool: ManagedTool; error: string }[];
}

/** True when the latest tag is newer — or, when tags are not semver, merely different. */
export function shouldUpdate(currentTag?: string, latestTag?: string): boolean {
  if (!currentTag || !latestTag || currentTag === latestTag) return false;
  const comparison = compareVersions(currentTag, latestTag);
  // Unparseable tags can only be compared by string: a difference is a release.
  return comparison === null ? true : comparison < 0;
}

/**
 * Decide what the one-click setup should do with each managed tool:
 * - missing  -> install it
 * - resolved from the toolbox cache -> update when a newer release is known
 * - resolved from an override or PATH -> leave it alone (user-managed)
 */
export function planSetup(
  origins: Record<ManagedTool, ToolOrigin>,
  installedTags: Partial<Record<ManagedTool, string>>,
  latestTags: Partial<Record<ManagedTool, string>>,
): ToolPlanEntry[] {
  const tools: ManagedTool[] = ['ufs2tool', 'mkpfs'];
  return tools.map((tool) => {
    const origin = origins[tool];
    const currentTag = installedTags[tool];
    const latestTag = latestTags[tool];

    if (origin === 'missing') {
      return { tool, action: 'install', reason: 'not found', latestTag };
    }
    if (origin === 'override' || origin === 'path') {
      return { tool, action: 'skip', reason: `resolved from ${origin === 'override' ? 'a manual override' : 'PATH'}`, currentTag, latestTag };
    }
    // Toolbox-managed (cache): only update when we know a newer release exists.
    if (currentTag && latestTag && shouldUpdate(currentTag, latestTag)) {
      return { tool, action: 'update', reason: `${currentTag} -> ${latestTag}`, currentTag, latestTag };
    }
    return { tool, action: 'skip', reason: currentTag ? `up to date (${currentTag})` : 'cache present, no release info', currentTag, latestTag };
  });
}

/** Helper for reading the installed-tag map out of settings. */
export function installedTags(settings: AppSettings): Partial<Record<ManagedTool, string>> {
  const tags: Partial<Record<ManagedTool, string>> = {};
  if (settings.toolVersions?.mkpfs) tags.mkpfs = settings.toolVersions.mkpfs;
  if (settings.toolVersions?.ufs2tool) tags.ufs2tool = settings.toolVersions.ufs2tool;
  return tags;
}
