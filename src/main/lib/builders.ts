// SPDX-License-Identifier: GPL-3.0-or-later
// Fetches the exFAT image-builder scripts (mkexfat.sh and
// New-OsfExfatImage.ps1) straight from the ShadowMountPlus repository —
// just the two files, no checkout, no clone. Files come from the
// raw.githubusercontent.com CDN and are fingerprinted by content, so no
// GitHub API calls (and their anonymous rate limits) are involved.
// Requests are anonymous; no user credentials are involved.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

/** Upstream repository and branch the builder scripts are fetched from. */
export const BUILDERS_REPO = 'drakmor/ShadowMountPlus';
export const BUILDERS_REF = '1.7';
export const BUILDER_FILES = ['mkexfat.sh', 'New-OsfExfatImage.ps1'] as const;

export interface BuildersFetchResult {
  /** Directory the scripts were written to. */
  dir: string;
  /** Content fingerprint of the fetched pair; doubles as the version stamp. */
  version: string;
}

export function shortVersion(version: string): string {
  return version.slice(0, 7);
}

function httpsGet(url: string, redirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'sm-toolbox' }, timeout: 60000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) {
          reject(new Error('Too many redirects while fetching'));
          return;
        }
        resolve(httpsGet(res.headers.location, redirects - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Request failed (${res.statusCode}) for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      // A reset connection mid-stream only surfaces on the response object;
      // without this the promise would hang forever with a partial body.
      res.on('error', reject);
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Request stalled for more than 60s: ${url}`));
    });
    request.on('error', reject);
  });
}

/**
 * Stable fingerprint of a script pair: a length-prefixed SHA-256 over both
 * files, truncated for display. Comparing fingerprints compares content, so
 * unrelated upstream commits never masquerade as script updates.
 */
export function contentVersion(files: Buffer[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.length.toString(16));
    hash.update(':');
    hash.update(file);
  }
  return hash.digest('hex').slice(0, 12);
}

function rawUrl(file: string): string {
  return `https://raw.githubusercontent.com/${BUILDERS_REPO}/${BUILDERS_REF}/${file}`;
}

async function fetchRaw(file: string): Promise<Buffer> {
  return httpsGet(rawUrl(file));
}

/** Fingerprint of the script pair currently sitting in `dir`, if complete. */
export function localBuildersVersion(dir: string): string | undefined {
  try {
    return contentVersion(BUILDER_FILES.map((file) => fs.readFileSync(path.join(dir, file))));
  } catch {
    return undefined;
  }
}

/** Fingerprint of the script pair currently published upstream. */
export async function upstreamBuildersVersion(): Promise<string> {
  const files: Buffer[] = [];
  for (const file of BUILDER_FILES) files.push(await fetchRaw(file));
  return contentVersion(files);
}

/**
 * Download both builder scripts into `dir`. Files are written through a
 * .part sibling and renamed into place so a failed download never leaves a
 * half-written script behind.
 */
export async function fetchBuilders(dir: string): Promise<BuildersFetchResult> {
  const files: Buffer[] = [];
  for (const file of BUILDER_FILES) files.push(await fetchRaw(file));
  fs.mkdirSync(dir, { recursive: true });
  BUILDER_FILES.forEach((file, index) => {
    const dest = path.join(dir, file);
    const tmp = `${dest}.part`;
    fs.writeFileSync(tmp, files[index]);
    fs.renameSync(tmp, dest);
    if (file.endsWith('.sh') && process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  });
  return { dir, version: contentVersion(files) };
}

/** Remove a downloaded copy; the bundled scripts take over again. */
export function resetBuilders(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
