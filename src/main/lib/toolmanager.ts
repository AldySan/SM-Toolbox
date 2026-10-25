// SPDX-License-Identifier: GPL-3.0-or-later
// Downloads tool release artifacts from GitHub and stages them for the
// resolver: UFS2Tool as a self-contained binary, MkPFS as its Python wheel
// (the CLI entry point is `python -m mkpfs`, while the PyInstaller bundles
// shipped alongside it are GUI-only).
// Requests are anonymous; no user credentials are involved.

import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { ReleaseAsset, ToolEvent } from '../../shared/types';
import { findPython } from './env';

const IS_WINDOWS = process.platform === 'win32';

type ToolId = 'mkpfs' | 'ufs2tool';

export interface ToolInstall {
  /** Binary path (ufs2tool) or extracted wheel directory (mkpfs). */
  path: string;
  version: string;
  kind: 'binary' | 'whl';
}

function apiGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'sm-toolbox', Accept: 'application/vnd.github+json' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`GitHub API request failed (${res.statusCode}) for ${url}`));
          return;
        }
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

interface GhRelease {
  tag_name?: string;
  assets?: { name: string; size: number; browser_download_url: string }[];
}

async function latestRelease(repo: string): Promise<{ version: string; assets: ReleaseAsset[] }> {
  const release = await apiGet<GhRelease>(`https://api.github.com/repos/${repo}/releases/latest`);
  if (!release.assets) throw new Error(`Release ${release.tag_name ?? '?'} of ${repo} has no assets`);
  return {
    version: release.tag_name ?? 'unknown',
    assets: release.assets.map((asset) => ({
      name: asset.name,
      size: asset.size,
      downloadUrl: asset.browser_download_url,
    })),
  };
}

export async function listAssets(tool: ToolId): Promise<{ version: string; assets: ReleaseAsset[] }> {
  return latestRelease(repoOf(tool));
}

function repoOf(tool: ToolId): string {
  return tool === 'mkpfs' ? 'PSBrew/MkPFS' : 'SvenGDK/UFS2Tool';
}

function matchAsset(tool: ToolId, assets: ReleaseAsset[]): ReleaseAsset | undefined {
  if (tool === 'mkpfs') {
    return assets.find((asset) => /-py3-none-any\.whl$/i.test(asset.name));
  }
  return assets.find((asset) =>
    IS_WINDOWS ? /win-x64-selfcontained\.zip$/i.test(asset.name) : /linux-x64-selfcontained\.zip$/i.test(asset.name),
  );
}

function downloadFile(url: string, dest: string, onProgress: (received: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (url: string, redirects: number) => {
      https
        .get(url, { headers: { 'User-Agent': 'sm-toolbox' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (redirects <= 0) {
              reject(new Error('Too many redirects while downloading'));
              return;
            }
            attempt(res.headers.location, redirects - 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Download failed (${res.statusCode}) for ${url}`));
            return;
          }
          const total = Number(res.headers['content-length'] ?? 0);
          let received = 0;
          const file = fs.createWriteStream(dest);
          res.on('data', (chunk: Buffer) => {
            received += chunk.length;
            onProgress(received, total);
          });
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
          file.on('error', reject);
        })
        .on('error', reject);
    };
    attempt(url, 5);
  });
}

function extractZip(archive: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  new AdmZip(archive).extractAllTo(destDir, true);
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

function probe(cmd: string, args: string[], env: Record<string, string> = {}): Promise<string | undefined> {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true, env: { ...process.env, ...env } });
    } catch {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => {
      child?.kill('SIGKILL');
      resolve(undefined);
    }, 15000);
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(undefined);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(out.trim().split(/\r?\n/)[0] || undefined);
    });
  });
}

export async function downloadTool(
  tool: ToolId,
  emit: (event: ToolEvent) => void,
  assetName?: string,
): Promise<ToolInstall> {
  const repo = repoOf(tool);
  const label = tool === 'mkpfs' ? 'MkPFS' : 'UFS2Tool';
  emit({ tool, type: 'status', text: `Fetching latest ${label} release…` });
  const release = await latestRelease(repo);

  const asset = assetName
    ? release.assets.find((candidate) => candidate.name === assetName)
    : matchAsset(tool, release.assets);
  if (!asset) throw new Error(`No matching asset for ${process.platform} in ${repo} ${release.version}`);

  const toolsRoot = path.join(app.getPath('userData'), 'tools', tool);
  fs.mkdirSync(toolsRoot, { recursive: true });
  const archivePath = path.join(toolsRoot, asset.name);

  emit({ tool, type: 'status', text: `Downloading ${asset.name}…` });
  await downloadFile(asset.downloadUrl, archivePath, (received, total) => {
    emit({ tool, type: 'progress', received, total });
  });

  if (tool === 'mkpfs') {
    // The wheel is the CLI distribution; extract and run it through Python.
    const python = findPython();
    if (!python) throw new Error('Python 3 is required to run the MkPFS wheel. Install Python, then retry.');
    const packageDir = path.join(toolsRoot, 'whl');
    fs.rmSync(packageDir, { recursive: true, force: true });
    emit({ tool, type: 'status', text: 'Extracting wheel…' });
    extractZip(archivePath, packageDir);
    fs.rmSync(archivePath, { force: true });
    if (!fs.existsSync(path.join(packageDir, 'mkpfs', '__init__.py'))) {
      throw new Error('The downloaded wheel did not contain the mkpfs package.');
    }
    emit({ tool, type: 'status', text: 'Verifying…' });
    const version = await probe(python.cmd, [...python.prefix, '-m', 'mkpfs', '-V'], {
      PYTHONPATH: packageDir,
    });
    return { path: packageDir, version: version ?? release.version, kind: 'whl' };
  }

  emit({ tool, type: 'status', text: 'Extracting…' });
  const extractDir = path.join(toolsRoot, 'extracted');
  fs.rmSync(extractDir, { recursive: true, force: true });
  extractZip(archivePath, extractDir);
  fs.rmSync(archivePath, { force: true });

  const binary = walkFiles(extractDir).find((file) => /^(ufs2tool|UFS2Tool)(\.exe)?$/i.test(path.basename(file)));
  if (!binary) throw new Error(`Could not locate the UFS2Tool binary inside ${asset.name}`);
  if (!IS_WINDOWS) fs.chmodSync(binary, 0o755);

  emit({ tool, type: 'status', text: 'Verifying…' });
  const banner = await probe(binary, []);
  return { path: binary, version: banner ?? release.version, kind: 'binary' };
}
