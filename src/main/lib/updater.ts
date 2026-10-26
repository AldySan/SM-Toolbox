// SPDX-License-Identifier: GPL-3.0-or-later
import { app, net } from 'electron';
import type { UpdateCheckResult } from '../../shared/types';
import { isUpdateAvailable } from './version';

/** Releases are published from this repository; the checker compares against them. */
export const UPDATES_REPO = 'AldySan/SM-Toolbox';

const RELEASES_URL = `https://api.github.com/repos/${UPDATES_REPO}/releases/latest`;
const REQUEST_TIMEOUT_MS = 8_000;

interface GithubRelease {
  tag_name?: unknown;
  html_url?: unknown;
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError') {
    return 'The update check timed out';
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ask GitHub for the latest published release and compare it against the
 * running version. Never throws: network failures come back as an `error`
 * status so only manual checks have to surface them.
 */
export async function checkForUpdates(currentVersion: string = app.getVersion()): Promise<UpdateCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await net.fetch(RELEASES_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `SM-Toolbox/${currentVersion} (+https://github.com/${UPDATES_REPO})`,
      },
    });
    if (response.status === 404) {
      // No release has been published yet — not an error condition.
      return { status: 'none', currentVersion };
    }
    if (!response.ok) {
      return { status: 'error', currentVersion, message: `GitHub answered with HTTP ${response.status}` };
    }
    const release = (await response.json()) as GithubRelease;
    const tag = typeof release.tag_name === 'string' ? release.tag_name.trim() : '';
    if (!tag) return { status: 'error', currentVersion, message: 'The latest release has no version tag' };
    const releaseUrl =
      typeof release.html_url === 'string' && release.html_url
        ? release.html_url
        : `https://github.com/${UPDATES_REPO}/releases/latest`;
    return isUpdateAvailable(currentVersion, tag)
      ? { status: 'available', currentVersion, latestVersion: tag, releaseUrl }
      : { status: 'up-to-date', currentVersion, latestVersion: tag };
  } catch (error) {
    return { status: 'error', currentVersion, message: describeError(error) };
  } finally {
    clearTimeout(timer);
  }
}
