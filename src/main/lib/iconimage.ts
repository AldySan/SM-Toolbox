// SPDX-License-Identifier: GPL-3.0-or-later
// Icon conversion for the PS5 appearance override. Electron's nativeImage
// does the decoding (PNG/JPEG/BMP/ICO); the pure crop helper lives in
// appearance.ts so it can be unit-tested without Electron. Non-square
// sources are center-cropped to a square first — real PS5 covers are
// 512×512 PNGs, and cropping keeps proportions where stretching would
// distort them.

import fs from 'node:fs';
import { nativeImage } from 'electron';
import { ICON_SIZE, cropSquareBGRA, sniffImageFormat } from './appearance';

export interface PreparedIcon {
  /** The converted 512×512 PNG bytes, ready to become sce_sys/icon0.png. */
  png: Buffer;
  /** Pixel size of the source image (before any crop or resize). */
  width: number;
  height: number;
  /** Sniffed source container: png, jpeg, bmp or ico. */
  sourceFormat: string;
  /** True when the source was not square and got center-cropped. */
  cropped: boolean;
  /** True when the source was not already 512×512 and got resized. */
  scaled: boolean;
}

const MAX_ICON_BYTES = 32 * 1024 * 1024;

/** Decodes `inputPath` and converts it to a 512×512 PNG; throws with a usable message. */
export function prepareIconFile(inputPath: string): PreparedIcon {
  const stat = fs.statSync(inputPath);
  if (stat.size > MAX_ICON_BYTES) throw new Error('The icon file is larger than 32 MiB.');

  const head = Buffer.alloc(12);
  const fd = fs.openSync(inputPath, 'r');
  try {
    fs.readSync(fd, head, 0, head.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const sourceFormat = sniffImageFormat(head);
  if (!sourceFormat) throw new Error('Unrecognized image format — pick a PNG, JPEG, BMP or ICO file.');

  const image = nativeImage.createFromPath(inputPath);
  if (image.isEmpty()) throw new Error('The image could not be decoded.');
  const { width, height } = image.getSize();
  if (width <= 0 || height <= 0) throw new Error('The image has no pixels.');

  const cropped = width !== height;
  let square = image;
  if (cropped) {
    const bitmap = image.toBitmap();
    const squarePixels = cropSquareBGRA(bitmap, width, height);
    square = nativeImage.createFromBitmap(squarePixels.pixels, {
      width: squarePixels.width,
      height: squarePixels.height,
    });
    if (square.isEmpty()) throw new Error('Center-cropping the icon failed.');
  }

  const scaled = square.getSize().width !== ICON_SIZE;
  const sized = scaled ? square.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: 'best' }) : square;
  const png = sized.toPNG();
  if (png.length === 0) throw new Error('Encoding the icon PNG failed.');
  return { png, width, height, sourceFormat, cropped, scaled };
}
