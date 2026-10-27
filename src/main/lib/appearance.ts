// SPDX-License-Identifier: GPL-3.0-or-later
// PS5 appearance overrides. ShadowMountPlus reads the title a dump shows on
// the home screen from sce_sys/param.json ("titleName", the en-US entry
// first) and copies sce_sys/icon0.png into /system_data/priv/appmeta at
// install time, where the console's home screen picks it up as the cover.
// The overrides are applied to a hardlink staging copy of the source folder,
// so the original dump is never modified: files are hardlinked (no extra
// data blocks even for very large dumps) and only the two overridden files
// are re-written inside the staging copy.
//
// Only node:fs/path/crypto are used here, so the module stays importable
// from unit tests without Electron; the icon decoding (nativeImage) lives in
// iconimage.ts and hands the converted PNG bytes to stageAppearance().

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** PS5 cover art size; real sce_sys/icon0.png files are 512×512 PNGs. */
export const ICON_SIZE = 512;

/** ShadowMountPlus copies names up to 256 bytes; stay one byte under. */
export const MAX_TITLE_BYTES = 255;

/** ShadowMountPlus refuses to read param.json files above 1 MiB. */
export const MAX_PARAM_JSON_BYTES = 1024 * 1024;

export interface AppearanceOverrides {
  /** New titleName for sce_sys/param.json (validated with validateTitle). */
  title?: string;
  /** Converted 512×512 PNG bytes to write as sce_sys/icon0.png. */
  iconPng?: Buffer;
}

export interface StagedSource {
  /** The staging directory; pass it to removeStage() once the job settles. */
  dir: string;
  /** Human-readable lines describing the overrides, for the build terminal. */
  summary: string[];
  applied: { title: boolean; icon: boolean };
}

/** Validates and normalizes a title override; throws with a usable message. */
export function validateTitle(raw: string): string {
  const title = raw.trim();
  if (!title) throw new Error('The PS5 title override is empty.');
  if (Buffer.byteLength(title, 'utf8') > MAX_TITLE_BYTES) {
    throw new Error(`The PS5 title override is too long (max ${MAX_TITLE_BYTES} bytes).`);
  }
  return title;
}

/**
 * Rewrites the display title in param.json text: the top-level "titleName"
 * and every localizedParameters entry's "titleName" become the new title, so
 * any console language shows it. titleId and every other field are kept
 * untouched. Output is pretty-printed with two spaces, matching how the
 * scene tools write hand-made param.json files.
 */
export function patchParamTitle(text: string, title: string): string {
  const stripped = text.replace(/^\uFEFF/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error('sce_sys/param.json is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('sce_sys/param.json does not contain a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  obj.titleName = title;
  const localized = obj.localizedParameters;
  if (localized !== null && typeof localized === 'object' && !Array.isArray(localized)) {
    for (const entry of Object.values(localized)) {
      if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
        (entry as Record<string, unknown>).titleName = title;
      }
    }
  }
  const out = `${JSON.stringify(obj, null, 2)}\n`;
  if (Buffer.byteLength(out, 'utf8') > MAX_PARAM_JSON_BYTES) {
    throw new Error('The patched param.json exceeds the 1 MiB limit ShadowMountPlus reads.');
  }
  return out;
}

/** Recognizes the image containers nativeImage can decode, by magic bytes. */
export function sniffImageFormat(head: Buffer): 'png' | 'jpeg' | 'bmp' | 'ico' | null {
  if (head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 2 && head[0] === 0x42 && head[1] === 0x4d) return 'bmp';
  if (head.length >= 4 && head[0] === 0 && head[1] === 0 && head[2] === 1 && head[3] === 0) return 'ico';
  return null;
}

/**
 * Center-crops raw BGRA pixels to a square without touching pixel values,
 * so non-square icons keep their proportions instead of being stretched.
 * Operates on nativeImage.toBitmap() output (4 bytes per pixel, row-major).
 */
export function cropSquareBGRA(pixels: Buffer, width: number, height: number): { pixels: Buffer; width: number; height: number } {
  if (width <= 0 || height <= 0) throw new Error('Cannot crop an empty image.');
  if (pixels.length < width * height * 4) throw new Error('The pixel buffer is smaller than width × height.');
  if (width === height) return { pixels, width, height };
  const side = Math.min(width, height);
  const offsetX = Math.floor((width - side) / 2);
  const offsetY = Math.floor((height - side) / 2);
  const stride = width * 4;
  const rowBytes = side * 4;
  const out = Buffer.alloc(side * side * 4);
  for (let row = 0; row < side; row += 1) {
    const start = (offsetY + row) * stride + offsetX * 4;
    pixels.copy(out, row * rowBytes, start, start + rowBytes);
  }
  return { pixels: out, width: side, height: side };
}

/**
 * Creates the staging copy next to the source folder and applies the
 * overrides to it. Throws (with the staging copy cleaned up) on any failure;
 * the caller owns the returned directory and must removeStage() it.
 */
export async function stageAppearance(sourceDir: string, overrides: AppearanceOverrides): Promise<StagedSource> {
  const wantsTitle = Boolean(overrides.title);
  const wantsIcon = Boolean(overrides.iconPng);
  if (!wantsTitle && !wantsIcon) throw new Error('No PS5 appearance overrides were given.');

  const summary: string[] = [];

  let patchedParam: string | undefined;
  if (wantsTitle) {
    const title = validateTitle(overrides.title as string);
    const paramPath = path.join(sourceDir, 'sce_sys', 'param.json');
    let text: string;
    try {
      text = await fs.promises.readFile(paramPath, 'utf8');
    } catch {
      throw new Error('sce_sys/param.json was not found in the source folder — the title override needs it.');
    }
    patchedParam = patchParamTitle(text, title);
    summary.push(`title → ${title}`);
  }

  const stageDir = path.join(
    path.dirname(path.resolve(sourceDir)),
    `.sm-toolbox-stage-${randomBytes(5).toString('hex')}`,
  );
  try {
    await mirrorTree(sourceDir, stageDir);
  } catch (error) {
    await removeStage(stageDir);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not create the staging copy next to the source folder (${message}). ` +
        'The PS5 overrides are applied to a hardlink copy, which needs a writable folder next to the source.',
    );
  }

  const applied = { title: false, icon: false };
  try {
    if (patchedParam !== undefined) {
      await replaceFile(path.join(stageDir, 'sce_sys', 'param.json'), Buffer.from(patchedParam, 'utf8'));
      applied.title = true;
    }
    if (overrides.iconPng) {
      const stageIcon = path.join(stageDir, 'sce_sys', 'icon0.png');
      await fs.promises.mkdir(path.dirname(stageIcon), { recursive: true });
      await replaceFile(stageIcon, overrides.iconPng);
      applied.icon = true;
      summary.push(`icon0.png → ${ICON_SIZE}×${ICON_SIZE} PNG`);
    }
  } catch (error) {
    await removeStage(stageDir);
    throw error;
  }
  return { dir: stageDir, summary, applied };
}

/** Removes a staging directory; hardlinks only, so this never touches the source. */
export async function removeStage(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Writes new contents at `target`, unlinking any hardlink first so the write never reaches the source. */
async function replaceFile(target: string, contents: Buffer): Promise<void> {
  await fs.promises.rm(target, { force: true });
  await fs.promises.writeFile(target, contents);
}

/** Mirrors a directory tree using hardlinks (metadata only, no data copied). */
async function mirrorTree(src: string, dst: string): Promise<void> {
  await fs.promises.mkdir(dst, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await mirrorTree(from, to);
    } else if (entry.isFile()) {
      await fs.promises.link(from, to);
    } else if (entry.isSymbolicLink()) {
      // Recreate symlinks as-is; when that is impossible, copy the file.
      const target = await fs.promises.readlink(from);
      await fs.promises.symlink(target, to).catch(() => fs.promises.copyFile(from, to));
    }
  }
}
