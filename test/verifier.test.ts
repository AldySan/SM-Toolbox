// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { detectImage } from '../src/main/lib/verifier';

const dir = mkdtempSync(join(tmpdir(), 'smp-verify-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeImage(name: string, size: number, patch?: (buffer: Buffer) => void): string {
  const buffer = Buffer.alloc(size);
  patch?.(buffer);
  const file = join(dir, name);
  writeFileSync(file, buffer);
  return file;
}

function ufs2Image(name: string, littleEndian = true): string {
  return writeImage(name, 128 * 1024, (buffer) => {
    if (littleEndian) buffer.writeUInt32LE(0x19540119, 0x1055c);
    else buffer.writeUInt32BE(0x19540119, 0x1055c);
  });
}

function exfatImage(name: string, clusterShift = 7): string {
  return writeImage(name, 128 * 1024, (buffer) => {
    buffer.set([0xeb, 0x76, 0x90], 0);
    buffer.write('EXFAT ', 3, 'latin1');
    buffer[0x6c] = 9; // 512-byte sectors
    buffer[0x6d] = clusterShift; // 64 KiB clusters when 7
  });
}

describe('detectImage', () => {
  it('recognises a UFS2 image and the .ffpkg extension', () => {
    const report = detectImage(ufs2Image('game.ffpkg'));
    expect(report).not.toBeNull();
    expect(report?.detected).toBe('ufs2');
    expect(report?.extensionMatches).toBe(true);
    expect(report?.notes[0]).toContain('0x19540119');
  });

  it('accepts the big-endian spelling used by FreeBSD newfs images', () => {
    const report = detectImage(ufs2Image('game.ffpkg', false));
    expect(report?.detected).toBe('ufs2');
  });

  it('recognises UFS1 content and warns about the format', () => {
    const file = writeImage('game.ffpkg', 128 * 1024, (buffer) => {
      buffer.writeUInt32LE(0x011954, 0x25bc);
    });
    const report = detectImage(file);
    expect(report?.detected).toBe('ufs1');
    expect(report?.notes.join(' ')).toContain('UFS2');
  });

  it('recognises an exFAT image with 64 KiB clusters', () => {
    const report = detectImage(exfatImage('game.exfat'));
    expect(report?.detected).toBe('exfat');
    expect(report?.clusterSize).toBe(65536);
    expect(report?.alignment64k).toBe(true);
    expect(report?.notes.join(' ')).toContain('fast-path');
  });

  it('flags exFAT cluster sizes that are not 64 KiB', () => {
    const report = detectImage(exfatImage('game.exfat', 6)); // 32 KiB clusters
    expect(report?.clusterSize).toBe(32768);
    expect(report?.notes.join(' ')).toContain('64 KiB');
  });

  it('flags an extension that does not match the content', () => {
    const report = detectImage(ufs2Image('game.exfat'));
    expect(report?.detected).toBe('ufs2');
    expect(report?.extensionMatches).toBe(false);
    expect(report?.notes.join(' ')).toContain('does not match');
  });

  it('flags exFAT images whose size is not 64 KiB-aligned', () => {
    const file = writeImage('odd.exfat', 65536 + 4096, (buffer) => {
      buffer.set([0xeb, 0x76, 0x90], 0);
      buffer.write('EXFAT ', 3, 'latin1');
      buffer[0x6c] = 9;
      buffer[0x6d] = 7;
    });
    const report = detectImage(file);
    expect(report?.alignment64k).toBe(false);
    expect(report?.notes.join(' ')).toContain('not a multiple of 64 KiB');
  });

  it('defers PFS-family files to the inspector by extension', () => {
    const report = detectImage(writeImage('game.ffpfsc', 4096));
    expect(report?.detected).toBe('pfs');
    expect(report?.extensionMatches).toBe(true);
  });

  it('reports unknown content honestly', () => {
    const report = detectImage(writeImage('random.img', 8192, (buffer) => {
      buffer.fill(0x41, 0, 64);
    }));
    expect(report?.detected).toBe('unknown');
  });

  it('returns null for missing files', () => {
    expect(detectImage(join(dir, 'nope.ffpkg'))).toBeNull();
    expect(detectImage('')).toBeNull();
  });
});
