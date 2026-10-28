// SPDX-License-Identifier: GPL-3.0-or-later
// Payload transfer to the console: downloads the latest
// shadowmountplus.elf from the project's releases and streams it to the
// PlayStation 5 payload listener (port 9021). Downloads are anonymous.

import { app } from 'electron';
import fs from 'node:fs';
import net from 'node:net';
import https from 'node:https';
import path from 'node:path';
import type { SendEvent } from '../../shared/types';

const ELF_ASSET = 'shadowmountplus.elf';

export function cachedPayloadPath(): string {
  return path.join(app.getPath('userData'), 'payload', ELF_ASSET);
}

const API_TIMEOUT_MS = 15_000;

function apiGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { 'User-Agent': 'sm-toolbox', Accept: 'application/vnd.github+json' }, timeout: API_TIMEOUT_MS },
      (res) => {
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
      },
    );
    // Without an idle timeout a connection that stalls mid-response would
    // leave the Send view stuck on "Downloading…" forever.
    request.on('timeout', () => request.destroy(new Error(`GitHub API request timed out: ${url}`)));
    request.on('error', reject);
  });
}

interface GhRelease {
  tag_name?: string;
  assets?: { name: string; browser_download_url: string }[];
}

export async function ensurePayload(onStatus: (text: string) => void): Promise<string> {
  const cached = cachedPayloadPath();
  if (isValidElf(cached)) return cached;

  fs.mkdirSync(path.dirname(cached), { recursive: true });
  onStatus('Fetching the latest ShadowMountPlus release…');
  const release = await apiGet<GhRelease>('https://api.github.com/repos/drakmor/ShadowMountPlus/releases/latest');
  const asset = release.assets?.find((candidate) => candidate.name === ELF_ASSET);
  if (!asset) throw new Error(`No ${ELF_ASSET} asset in release ${release.tag_name ?? '?'}`);

  onStatus(`Downloading ${ELF_ASSET} (${release.tag_name ?? ''})…`);
  // Download to a .part file and rename on success: an interrupted download
  // must never leave a truncated payload behind, because a cached file is
  // trusted outright afterwards.
  const partial = `${cached}.part`;
  await new Promise<void>((resolve, reject) => {
    const attempt = (url: string, redirects: number) => {
      const request = https.get(
        url,
        { headers: { 'User-Agent': 'sm-toolbox' }, timeout: 60_000 },
        (res) => {
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
          reject(new Error(`Download failed (${res.statusCode})`));
          return;
        }
        const total = Number(res.headers['content-length'] ?? 0);
        let received = 0;
        const file = fs.createWriteStream(partial);
        const fail = (error: Error) => {
          file.destroy();
          request.destroy();
          reject(error);
        };
        res.on('error', fail);
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) onStatus(`Downloading payload… ${Math.round((received / total) * 100)}%`);
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', fail);
      });
      // Same stall guard the tool downloader has: a silent connection death
      // mid-download must surface as an error instead of hanging the busy state.
      request.on('timeout', () => {
        request.destroy(new Error(`Download stalled for more than 60s: ${url}`));
      });
      request.on('error', (error) => {
        try {
          fs.rmSync(partial, { force: true });
        } catch {
          /* best effort */
        }
        reject(error);
      });
    };
    attempt(asset.browser_download_url, 5);
  });
  fs.renameSync(partial, cached);

  if (!isValidElf(cached)) {
    fs.rmSync(cached, { force: true });
    throw new Error('The downloaded payload does not look like an ELF file.');
  }

  return cached;
}

/** A payload worth trusting: non-trivial size and the ELF magic bytes. */
function isValidElf(file: string): boolean {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size <= 1024) return false;
    const fd = fs.openSync(file, 'r');
    try {
      const header = Buffer.alloc(4);
      const read = fs.readSync(fd, header, 0, 4, 0);
      return read === 4 && header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

export function sendPayload(
  sendId: string,
  host: string,
  port: number,
  elfPath: string,
  emit: (event: SendEvent) => void,
): { start(): Promise<void>; cancel(): void } {
  let socket: net.Socket | undefined;
  let cancelled = false;

  const done = async (): Promise<void> => {
    let size: number;
    try {
      size = fs.statSync(elfPath).size;
    } catch {
      throw new Error(`Payload file is not readable: ${elfPath}`);
    }
    emit({ sendId, type: 'connecting' });
    await new Promise<void>((resolve, reject) => {
      socket = net.connect({ host, port, timeout: 8000 });
      socket.once('timeout', () => {
        socket?.destroy();
        reject(new Error(`Timed out connecting to ${host}:${port}`));
      });
      socket.once('error', (error: Error) => reject(error));
      socket.once('connect', () => {
        emit({ sendId, type: 'connected' });
        const stream = fs.createReadStream(elfPath);
        let sent = 0;
        stream.on('data', (chunk: Buffer) => {
          sent += chunk.length;
          emit({ sendId, type: 'progress', sent, total: size });
        });
        stream.on('error', (error: Error) => {
          socket?.destroy();
          reject(error);
        });
        stream.on('end', () => {
          const activeSocket = socket;
          if (!activeSocket) {
            reject(new Error('Connection lost'));
            return;
          }
          activeSocket.end(() => {
            emit({ sendId, type: 'sent', sent });
            resolve();
          });
        });
        if (!socket) {
          reject(new Error('Connection lost'));
          return;
        }
        stream.pipe(socket);
      });
    });
  };

  return {
    start: async () => {
      if (cancelled) return;
      try {
        await done();
      } catch (error) {
        if (cancelled) {
          emit({ sendId, type: 'cancelled' });
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        emit({ sendId, type: 'failed', message });
        throw error;
      }
    },
    cancel() {
      cancelled = true;
      socket?.destroy();
    },
  };
}
