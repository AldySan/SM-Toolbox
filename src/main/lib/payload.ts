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
  assets?: { name: string; browser_download_url: string }[];
}

export async function ensurePayload(onStatus: (text: string) => void): Promise<string> {
  const cached = cachedPayloadPath();
  try {
    const stat = fs.statSync(cached);
    if (stat.size > 1024) return cached;
  } catch {
    /* not cached yet */
  }

  fs.mkdirSync(path.dirname(cached), { recursive: true });
  onStatus('Fetching the latest ShadowMountPlus release…');
  const release = await apiGet<GhRelease>('https://api.github.com/repos/drakmor/ShadowMountPlus/releases/latest');
  const asset = release.assets?.find((candidate) => candidate.name === ELF_ASSET);
  if (!asset) throw new Error(`No ${ELF_ASSET} asset in release ${release.tag_name ?? '?'}`);

  onStatus(`Downloading ${ELF_ASSET} (${release.tag_name ?? ''})…`);
  await new Promise<void>((resolve, reject) => {
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
            reject(new Error(`Download failed (${res.statusCode})`));
            return;
          }
          const total = Number(res.headers['content-length'] ?? 0);
          let received = 0;
          const file = fs.createWriteStream(cached);
          res.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (total > 0) onStatus(`Downloading payload… ${Math.round((received / total) * 100)}%`);
          });
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
          file.on('error', reject);
        })
        .on('error', reject);
    };
    attempt(asset.browser_download_url, 5);
  });

  return cached;
}

export function sendPayload(
  sendId: string,
  host: string,
  port: number,
  emit: (event: SendEvent) => void,
): { start(): Promise<void>; cancel(): void } {
  const elfPath = cachedPayloadPath();
  let socket: net.Socket | undefined;
  let cancelled = false;

  const done = async (): Promise<void> => {
    const size = fs.statSync(elfPath).size;
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
        stream.pipe(socket, { end: true });
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
