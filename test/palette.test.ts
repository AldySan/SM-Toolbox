// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS_PATH = path.resolve(__dirname, '../src/renderer/src/styles.css');
const CSS = fs.readFileSync(CSS_PATH, 'utf8');

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function luminance(rgb: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(hexToRgb(fg));
  const l2 = luminance(hexToRgb(bg));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite `rgba(r,g,b,a)` over an opaque hex background. */
function overRgba(rgba: string, bg: string): string {
  const match = rgba.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (!match) throw new Error(`not an rgba() value: ${rgba}`);
  const [, r, g, b, alpha] = match;
  const fg = hexToRgb(`#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`);
  const base = hexToRgb(bg);
  const out = fg.map((c, i) => Math.round(c * Number(alpha) + base[i] * (1 - Number(alpha)))) as Rgb;
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function tokenBlock(selector: string): Record<string, string> {
  const anchored = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`(?:^|\\n)${anchored}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`token block not found: ${selector}`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

type Theme = 'dark' | 'light';
const THEMES: Record<Theme, Record<string, string>> = {
  dark: tokenBlock(`[data-theme='dark']`),
  light: tokenBlock(`[data-theme='light']`),
};
const PRESETS = ['green', 'blue', 'purple', 'orange', 'pink'] as const;

function accentTokens(theme: Theme, preset: (typeof PRESETS)[number]): Record<string, string> {
  if (preset === 'green') return THEMES[theme];
  return tokenBlock(`[data-accent='${preset}'][data-theme='${theme}']`);
}

const failures: string[] = [];
function expectAa(label: string, fg: string, bg: string, minimum = 4.5): void {
  const ratio = contrast(fg, bg);
  if (ratio < minimum) failures.push(`${ratio.toFixed(2)}:1 (< ${minimum}) ${label} (${fg} on ${bg})`);
}

describe('palette contrast (WCAG AA)', () => {
  it('keeps base text tokens readable on their surfaces', () => {
    for (const theme of ['dark', 'light'] as const) {
      const t = THEMES[theme];
      const surfaces = { bg: t['--bg'], raised: t['--bg-raised'], inset: t['--bg-inset'] };
      for (const [surfaceName, surface] of Object.entries(surfaces)) {
        expectAa(`${theme} text on ${surfaceName}`, t['--text'], surface);
        expectAa(`${theme} dim on ${surfaceName}`, t['--text-dim'], surface);
      }
      expectAa(`${theme} ok on bg`, t['--ok'], t['--bg']);
      expectAa(`${theme} ok on raised`, t['--ok'], t['--bg-raised']);
      expectAa(`${theme} warn on bg`, t['--warn'], t['--bg']);
      expectAa(`${theme} warn on raised`, t['--warn'], t['--bg-raised']);
      expectAa(`${theme} err on bg`, t['--err'], t['--bg']);
      expectAa(`${theme} err on raised`, t['--err'], t['--bg-raised']);
    }
  });

  it('keeps every accent preset readable as text, on buttons and on soft tints', () => {
    for (const theme of ['dark', 'light'] as const) {
      const t = THEMES[theme];
      const surfaces = { bg: t['--bg'], raised: t['--bg-raised'], inset: t['--bg-inset'] };
      for (const preset of PRESETS) {
        const a = accentTokens(theme, preset);
        for (const [surfaceName, surface] of Object.entries(surfaces)) {
          expectAa(`${theme}/${preset} accent text on ${surfaceName}`, a['--accent'], surface);
        }
        expectAa(`${theme}/${preset} button text on accent`, a['--accent-contrast'], a['--accent']);
        expectAa(
          `${theme}/${preset} update badge on soft tint`,
          a['--accent'],
          overRgba(a['--accent-soft'], t['--bg-inset']),
        );
        expectAa(
          `${theme}/${preset} home status title on soft tint`,
          t['--text'],
          overRgba(a['--accent-soft'], t['--bg']),
        );
        expectAa(
          `${theme}/${preset} ready title (ok) on soft tint`,
          t['--ok'],
          overRgba(a['--accent-soft'], t['--bg']),
        );
      }
    }
  });

  it('keeps focus and accent icons above the 3:1 ui-component minimum', () => {
    for (const theme of ['dark', 'light'] as const) {
      const t = THEMES[theme];
      expectAa(`${theme} focus ring vs bg`, t['--accent'], t['--bg'], 3);
      expectAa(`${theme} accent icon vs inset`, t['--accent'], t['--bg-inset'], 3);
    }
  });

  it('has no failing pairs', () => {
    expect(failures).toEqual([]);
  });
});
