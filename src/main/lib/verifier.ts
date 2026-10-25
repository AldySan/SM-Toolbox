// SPDX-License-Identifier: GPL-3.0-or-later
// Source-folder inspection and image-file verification. Magic-byte checks are
// derived from the on-disk formats: the exFAT boot sector at offset 0 and the
// UFS superblock magic at 0x1025C (cylinder group 0 superblock + 0x55C).

import fs from 'node:fs';
import path from 'node:path';
import type { DetectedImageKind, FileReport, FolderStat } from '../../shared/types';

/* ---------------- folder stats ---------------- */

export function statFolder(input: string): FolderStat | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(input);
  } catch {
    return { path: input, exists: false, ebootBin: false, paramJson: false, fileCount: 0, dirCount: 0, totalBytes: 0 };
  }
  if (!stat.isDirectory()) {
    return { path: input, exists: false, ebootBin: false, paramJson: false, fileCount: 0, dirCount: 0, totalBytes: 0 };
  }

  let fileCount = 0;
  let dirCount = 0;
  let totalBytes = 0;
  const stack: string[] = [input];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        dirCount += 1;
        stack.push(full);
      } else if (entry.isFile()) {
        fileCount += 1;
        try {
          totalBytes += fs.statSync(full).size;
        } catch {
          /* unreadable file: skip size */
        }
      }
    }
  }

  const paramJsonPath = path.join(input, 'sce_sys', 'param.json');
  const paramJson = fs.existsSync(paramJsonPath);
  let paramInfo: FolderStat['paramInfo'];
  if (paramJson) {
    try {
      const parsed = JSON.parse(fs.readFileSync(paramJsonPath, 'utf8')) as Record<string, unknown>;
      paramInfo = {
        titleId: typeof parsed.titleId === 'string' ? parsed.titleId : undefined,
        contentId: typeof parsed.contentId === 'string' ? parsed.contentId : undefined,
      };
    } catch {
      paramInfo = {};
    }
  }

  return {
    path: input,
    exists: true,
    ebootBin: fs.existsSync(path.join(input, 'eboot.bin')),
    paramJson,
    paramInfo,
    fileCount,
    dirCount,
    totalBytes,
  };
}

export function countFiles(dir: string): number {
  return statFolder(dir)?.fileCount ?? 0;
}

/* ---------------- image verification ---------------- */

const UFS2_MAGIC = 0x19540119;
const UFS1_MAGIC = 0x011954;
/** UFS2 superblock (0x10000) + fs_magic offset (0x55C). */
const UFS2_SB_OFFSET = 0x1055c;
/** UFS1 fallback: superblock at 0x2000, same in-superblock offset. */
const UFS1_SB_OFFSET = 0x25bc;
const EXFAT_ID = Buffer.from('EXFAT', 'latin1'); // start of the 8-byte OEM name at offset 3

function readHeader(file: string, length: number): Buffer | undefined {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return undefined;
  }
  try {
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, 0);
    return read === length ? buffer : buffer.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

interface ExfatBoot {
  valid: boolean;
  clusterSize: number;
}

function parseExfatBoot(buffer: Buffer): ExfatBoot {
  if (buffer.length < 0x70) return { valid: false, clusterSize: 0 };
  const jump = buffer.subarray(0, 3);
  if (!(jump[0] === 0xeb && jump[1] === 0x76 && jump[2] === 0x90)) return { valid: false, clusterSize: 0 };
  if (!buffer.subarray(3, 8).equals(EXFAT_ID)) return { valid: false, clusterSize: 0 };
  const bytesPerSectorShift = buffer[0x6c];
  const sectorsPerClusterShift = buffer[0x6d];
  const bytesPerSector = 1 << bytesPerSectorShift;
  const clusterSize = bytesPerSector << sectorsPerClusterShift;
  return { valid: true, clusterSize };
}

export function detectImage(file: string): FileReport | null {
  if (typeof file !== 'string' || file.length === 0) return null;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const extension = path.extname(file).toLowerCase();
  const notes: string[] = [];
  const header = readHeader(file, 0x11000);
  let detected: DetectedImageKind = 'unknown';
  let clusterSize: number | undefined;
  let alignment64k = stat.size % 65536 === 0;

  const exfat = header ? parseExfatBoot(header.subarray(0, 0x70)) : { valid: false, clusterSize: 0 };
  if (exfat.valid) {
    detected = 'exfat';
    clusterSize = exfat.clusterSize;
    notes.push('exFAT boot sector found (jump EB 76 90 + "EXFAT" OEM).');
    if (clusterSize === 65536) {
      notes.push('Cluster size is 64 KiB — matches the LVD type-5 / BFS fast-path profile.');
    } else if (clusterSize > 0) {
      notes.push(
        `Cluster size is ${clusterSize / 1024} KiB — the documented builders always use 64 KiB; rebuild the image if you need the fast path.`,
      );
    }
  } else if (header && header.length >= UFS2_SB_OFFSET + 4) {
    // The magic may appear either byte order depending on the builder
    // (UFS2Tool writes it little-endian; accept both).
    const magicAt = (offset: number): number => {
      if (header.length < offset + 4) return 0;
      const be = header.readUInt32BE(offset);
      return be === UFS2_MAGIC || be === UFS1_MAGIC ? be : header.readUInt32LE(offset);
    };
    const magic = magicAt(UFS2_SB_OFFSET);
    const legacyMagic = magicAt(UFS1_SB_OFFSET);
    if (magic === UFS2_MAGIC) {
      detected = 'ufs2';
      notes.push('UFS2 superblock magic 0x19540119 at offset 0x1055C.');
    } else if (legacyMagic === UFS1_MAGIC) {
      detected = 'ufs1';
      notes.push('UFS1 superblock magic 0x011954 — ShadowMountPlus expects UFS2 (.ffpkg).');
    }
  }

  if (detected === 'unknown' && (extension === '.ffpfsc' || extension === '.ffpfs')) {
    // PFS containers are opaque binary headers; defer to the MkPFS inspector.
    detected = 'pfs';
    notes.push('PFS-family container detected from extension; use Inspect to verify with MkPFS.');
  }

  if (detected === 'unknown') {
    notes.push('No known filesystem signature found in the first 68 KiB.');
  }

  const extensionMatches = extensionMatchesKind(extension, detected);
  if (!extensionMatches && detected !== 'unknown') {
    notes.push(`Extension ${extension || '(none)'} does not match the detected ${detected.toUpperCase()} content.`);
    notes.push('ShadowMountPlus dispatches on extension, so rename or rebuild the image.');
  }
  if (detected === 'exfat' && !alignment64k) {
    notes.push('Image size is not a multiple of 64 KiB; the documented builders round up to 1 MiB.');
  }

  return {
    path: file,
    size: stat.size,
    extension,
    detected,
    notes,
    clusterSize,
    alignment64k,
    extensionMatches,
  };
}

function extensionMatchesKind(extension: string, kind: DetectedImageKind): boolean {
  switch (kind) {
    case 'exfat':
      return extension === '.exfat';
    case 'ufs2':
    case 'ufs1':
      return extension === '.ffpkg';
    case 'pfs':
      return extension === '.ffpfs' || extension === '.ffpfsc';
    default:
      return true;
  }
}
