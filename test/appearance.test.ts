// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cropSquareBGRA,
  patchParamTitle,
  removeStage,
  sniffImageFormat,
  stageAppearance,
  validateTitle,
} from '../src/main/lib/appearance';

const SAMPLE_PARAM = JSON.stringify({
  titleId: 'PPSA01234',
  contentId: 'UP0000-PPSA01234_00-X',
  titleName: 'Original',
  localizedParameters: {
    'en-US': { titleName: 'Original EN' },
    'ja-JP': { titleName: 'オリジナル' },
  },
});

describe('validateTitle', () => {
  it('trims surrounding whitespace', () => {
    expect(validateTitle('  My Game  ')).toBe('My Game');
  });

  it('rejects empty titles', () => {
    expect(() => validateTitle('   ')).toThrow(/empty/);
    expect(() => validateTitle('')).toThrow(/empty/);
  });

  it('rejects titles above the 255-byte budget', () => {
    expect(() => validateTitle('あ'.repeat(86))).toThrow(/too long/); // 258 bytes
    expect(validateTitle('あ'.repeat(85))).toBe('あ'.repeat(85)); // exactly 255 bytes
  });
});

describe('patchParamTitle', () => {
  it('rewrites the top-level and every localized title', () => {
    const out = JSON.parse(patchParamTitle(SAMPLE_PARAM, 'My Game')) as Record<string, any>;
    expect(out.titleName).toBe('My Game');
    expect(out.localizedParameters['en-US'].titleName).toBe('My Game');
    expect(out.localizedParameters['ja-JP'].titleName).toBe('My Game');
  });

  it('keeps ids and unknown fields untouched', () => {
    const out = JSON.parse(patchParamTitle(SAMPLE_PARAM, 'X')) as Record<string, any>;
    expect(out.titleId).toBe('PPSA01234');
    expect(out.contentId).toBe('UP0000-PPSA01234_00-X');
  });

  it('strips a UTF-8 BOM before parsing', () => {
    const out = JSON.parse(patchParamTitle(`\uFEFF${SAMPLE_PARAM}`, 'Y')) as Record<string, any>;
    expect(out.titleName).toBe('Y');
  });

  it('adds titleName to localized entries that lacked one', () => {
    const source = JSON.stringify({ titleId: 'PPSA00001', localizedParameters: { 'fr-FR': {} } });
    const out = JSON.parse(patchParamTitle(source, 'Salut')) as Record<string, any>;
    expect(out.localizedParameters['fr-FR'].titleName).toBe('Salut');
  });

  it('ignores a non-object localizedParameters value', () => {
    const out = JSON.parse(
      patchParamTitle('{"titleName":"A","localizedParameters":"nope"}', 'B'),
    ) as Record<string, any>;
    expect(out.localizedParameters).toBe('nope');
    expect(out.titleName).toBe('B');
  });

  it('throws on invalid JSON', () => {
    expect(() => patchParamTitle('not json', 'X')).toThrow(/not valid JSON/);
  });

  it('throws on non-object roots', () => {
    expect(() => patchParamTitle('[1,2]', 'X')).toThrow(/JSON object/);
  });
});

describe('cropSquareBGRA', () => {
  /** Grid buffer where pixel i is BGRA [i, i, i, 255]. */
  const grid = (width: number, height: number): Buffer => {
    const buf = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      buf[i * 4] = i;
      buf[i * 4 + 1] = i;
      buf[i * 4 + 2] = i;
      buf[i * 4 + 3] = 255;
    }
    return buf;
  };

  const indices = (buf: Buffer): number[] => {
    const out: number[] = [];
    for (let i = 0; i < buf.length / 4; i += 1) out.push(buf[i * 4]);
    return out;
  };

  it('passes square images through untouched', () => {
    const buf = grid(3, 3);
    const out = cropSquareBGRA(buf, 3, 3);
    expect(out.pixels).toBe(buf);
    expect(out.width).toBe(3);
    expect(out.height).toBe(3);
  });

  it('center-crops landscape images (4×3 → 3×3)', () => {
    const out = cropSquareBGRA(grid(4, 3), 4, 3);
    expect(out.width).toBe(3);
    expect(out.height).toBe(3);
    expect(indices(out.pixels)).toEqual([0, 1, 2, 4, 5, 6, 8, 9, 10]);
  });

  it('center-crops portrait images (3×4 → 3×3)', () => {
    const out = cropSquareBGRA(grid(3, 4), 3, 4);
    expect(indices(out.pixels)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('crops odd offsets from the middle (5×3 → 3×3)', () => {
    const out = cropSquareBGRA(grid(5, 3), 5, 3);
    expect(indices(out.pixels)).toEqual([1, 2, 3, 6, 7, 8, 11, 12, 13]);
  });

  it('throws when the pixel buffer is too small', () => {
    expect(() => cropSquareBGRA(Buffer.alloc(4), 2, 2)).toThrow(/smaller than/);
    expect(() => cropSquareBGRA(Buffer.alloc(0), 0, 3)).toThrow(/empty/);
  });
});

describe('sniffImageFormat', () => {
  it('recognizes the four supported containers', () => {
    expect(sniffImageFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffImageFormat(Buffer.from([0x42, 0x4d, 0x00, 0x00]))).toBe('bmp');
    expect(sniffImageFormat(Buffer.from([0x00, 0x00, 0x01, 0x00]))).toBe('ico');
  });

  it('returns null for anything else', () => {
    expect(sniffImageFormat(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toBeNull();
    expect(sniffImageFormat(Buffer.alloc(0))).toBeNull();
    expect(sniffImageFormat(Buffer.from('GIF89a'))).toBeNull();
  });
});

describe('stageAppearance', () => {
  let root: string;
  let source: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'smp-appearance-'));
    source = path.join(root, 'game');
    fs.mkdirSync(path.join(source, 'sce_sys'), { recursive: true });
    fs.mkdirSync(path.join(source, 'data', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(source, 'sce_sys', 'param.json'), SAMPLE_PARAM);
    fs.writeFileSync(path.join(source, 'sce_sys', 'icon0.png'), 'original-icon');
    fs.writeFileSync(path.join(source, 'eboot.bin'), 'elf');
    fs.writeFileSync(path.join(source, 'data', 'nested', 'deep.bin'), 'deep');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('patches param.json and icon0.png without touching the source', async () => {
    const staged = await stageAppearance(source, { title: 'My Game', iconPng: Buffer.from('converted-png') });
    try {
      expect(staged.applied).toEqual({ title: true, icon: true });
      expect(staged.summary.join(' ')).toContain('My Game');

      const patched = JSON.parse(fs.readFileSync(path.join(staged.dir, 'sce_sys', 'param.json'), 'utf8')) as Record<
        string,
        any
      >;
      expect(patched.titleName).toBe('My Game');
      expect(patched.titleId).toBe('PPSA01234');
      expect(fs.readFileSync(path.join(staged.dir, 'sce_sys', 'icon0.png')).toString()).toBe('converted-png');

      expect(fs.existsSync(path.join(staged.dir, 'eboot.bin'))).toBe(true);
      expect(fs.existsSync(path.join(staged.dir, 'data', 'nested', 'deep.bin'))).toBe(true);

      // The original folder must stay byte-identical.
      const originalParam = JSON.parse(
        fs.readFileSync(path.join(source, 'sce_sys', 'param.json'), 'utf8'),
      ) as Record<string, any>;
      expect(originalParam.titleName).toBe('Original');
      expect(originalParam.localizedParameters['en-US'].titleName).toBe('Original EN');
      expect(fs.readFileSync(path.join(source, 'sce_sys', 'icon0.png')).toString()).toBe('original-icon');
    } finally {
      await removeStage(staged.dir);
    }
    expect(fs.existsSync(staged.dir)).toBe(false);
  });

  it('mirrors files with hardlinks, not copies', async () => {
    const staged = await stageAppearance(source, { title: 'X' });
    try {
      const original = fs.statSync(path.join(source, 'eboot.bin'));
      const mirrored = fs.statSync(path.join(staged.dir, 'eboot.bin'));
      expect(mirrored.ino).toBe(original.ino);
    } finally {
      await removeStage(staged.dir);
    }
  });

  it('injects an icon even when sce_sys/icon0.png was missing', async () => {
    fs.rmSync(path.join(source, 'sce_sys', 'icon0.png'));
    const staged = await stageAppearance(source, { iconPng: Buffer.from('png-bytes') });
    try {
      expect(staged.applied).toEqual({ title: false, icon: true });
      expect(fs.readFileSync(path.join(staged.dir, 'sce_sys', 'icon0.png')).toString()).toBe('png-bytes');
      expect(fs.existsSync(path.join(source, 'sce_sys', 'icon0.png'))).toBe(false);
    } finally {
      await removeStage(staged.dir);
    }
  });

  it('fails with a clear message when param.json is missing', async () => {
    fs.rmSync(path.join(source, 'sce_sys', 'param.json'));
    await expect(stageAppearance(source, { title: 'X' })).rejects.toThrow(/param\.json/);
    expect(fs.readdirSync(root).filter((name) => name.startsWith('.sm-toolbox-stage-'))).toEqual([]);
  });

  it('throws when called without overrides', async () => {
    await expect(stageAppearance(source, {})).rejects.toThrow(/No PS5 appearance/);
  });

  it('stages next to the source, inside the same directory', async () => {
    const staged = await stageAppearance(source, { title: 'Y' });
    try {
      expect(path.dirname(staged.dir)).toBe(path.dirname(path.resolve(source)));
    } finally {
      await removeStage(staged.dir);
    }
  });
});
