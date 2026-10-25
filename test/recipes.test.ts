// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildSteps, jobTitle, resolveInodeBytes, stepsToPreview } from '../src/main/lib/recipes';
import type { Step, StepContext } from '../src/main/lib/recipes';
import type { ToolInvocation } from '../src/main/lib/env';
import type { BuildSpec } from '../src/shared/types';

const mkpfsTool = (over: Partial<ToolInvocation> = {}): ToolInvocation => ({
  cmd: '/tools/mkpfs',
  prefix: [],
  display: 'mkpfs',
  origin: 'path',
  ...over,
});

const mkpfsWhl = (): ToolInvocation => ({
  cmd: '/usr/bin/python3',
  prefix: ['-m', 'mkpfs'],
  env: { PYTHONPATH: '/data/tools/mkpfs/whl' },
  display: 'python -m mkpfs',
  origin: 'bundled-whl',
});

const ufs2Tool = (): ToolInvocation => ({
  cmd: '/tools/UFS2Tool',
  prefix: [],
  display: 'ufs2tool',
  origin: 'path',
});

const linuxCtx = (over: Partial<StepContext> = {}): StepContext => ({
  isWindows: false,
  repoPath: '/repo',
  mkpfs: mkpfsTool(),
  ufs2tool: ufs2Tool(),
  sourceFileCount: 100,
  ...over,
});

const winCtx = (over: Partial<StepContext> = {}): StepContext =>
  linuxCtx({ isWindows: true, repoPath: 'C:\\repo', ...over });

function shellOf(step: Step) {
  if (step.kind !== 'shell') throw new Error(`expected shell step, got ${step.kind}`);
  return step;
}

describe('exfat steps', () => {
  it('builds the Linux script invocation', () => {
    const steps = buildSteps(
      { format: 'exfat', sourceDir: '/games/APP', outputFile: '/out/x.exfat' },
      linuxCtx(),
    );
    expect(steps).toHaveLength(1);
    const step = shellOf(steps[0]);
    expect(step.cmd).toBe('bash');
    expect(step.args).toEqual(['/repo/mkexfat.sh', '/games/APP', '/out/x.exfat']);
    expect(step.privileged).toBe(true);
  });

  it('builds the Windows PowerShell invocation with label', () => {
    const steps = buildSteps(
      { format: 'exfat', sourceDir: 'C:\\games\\APP', outputFile: 'C:\\out\\x.exfat', label: 'DATA' },
      winCtx(),
    );
    const step = shellOf(steps[0]);
    expect(step.cmd).toBe('powershell.exe');
    expect(step.args).toContain('C:\\repo\\New-OsfExfatImage.ps1');
    expect(step.args).toContain('-ImagePath');
    expect(step.args).toContain('C:\\out\\x.exfat');
    expect(step.args).toContain('-Label');
    expect(step.args).toContain('DATA');
    expect(step.privileged).toBe(true);
  });
});

describe('ufs2 steps', () => {
  const spec: BuildSpec = { format: 'ufs2', sourceDir: '/games/APP', outputFile: '/out/x.ffpkg' };

  it('uses the documented newfs profile and resolves inode density', () => {
    const steps = buildSteps(spec, linuxCtx({ sourceFileCount: 5000 }));
    const step = shellOf(steps[0]);
    expect(step.cmd).toBe('/tools/UFS2Tool');
    expect(step.args.slice(0, 10)).toEqual(['newfs', '-O', '2', '-b', '65536', '-f', '65536', '-m', '0', '-S']);
    expect(step.args[step.args.indexOf('-i') + 1]).toBe('262144');
    expect(step.args).toContain('-D');
    expect(step.args.slice(-2)).toEqual(['/games/APP', '/out/x.ffpkg']);
    expect(step.privileged).toBe(false);
  });

  it('respects an explicit inode density', () => {
    const steps = buildSteps({ ...spec, inodeDensity: '131072' }, linuxCtx());
    const step = shellOf(steps[0]);
    expect(step.args[step.args.indexOf('-i') + 1]).toBe('131072');
  });
});

describe('resolveInodeBytes thresholds', () => {
  const spec: BuildSpec = { format: 'ufs2', sourceDir: '/x', outputFile: '/x.ffpkg' };

  it('tiers by file count', () => {
    expect(resolveInodeBytes(spec, linuxCtx({ sourceFileCount: 10 }))).toBe(262144);
    expect(resolveInodeBytes(spec, linuxCtx({ sourceFileCount: 20000 }))).toBe(131072);
    expect(resolveInodeBytes(spec, linuxCtx({ sourceFileCount: 60000 }))).toBe(65536);
  });

  it('honours manual selection over file count', () => {
    expect(resolveInodeBytes({ ...spec, inodeDensity: '65536' }, linuxCtx({ sourceFileCount: 10 }))).toBe(65536);
  });
});

describe('ffpfsc steps', () => {
  it('wraps an exFAT image and cleans up the intermediate', () => {
    const steps = buildSteps(
      { format: 'ffpfsc', sourceDir: '/games/APP', outputFile: '/out/PPSA1.ffpfsc', innerFormat: 'exfat' },
      linuxCtx(),
    );
    expect(steps.map((step) => step.kind)).toEqual(['shell', 'shell', 'unlink']);
    const inner = shellOf(steps[0]);
    expect(inner.args.slice(-2)).toEqual(['/games/APP', '/out/PPSA1.exfat']);
    expect(inner.privileged).toBe(true);
    const pack = shellOf(steps[1]);
    expect(pack.args).toEqual([
      'pack',
      'file',
      '--verify',
      '--version',
      'PS5',
      '--inode-bits',
      '32',
      '/out/PPSA1.exfat',
      '/out/PPSA1.ffpfsc',
    ]);
    expect(steps[2]).toMatchObject({ kind: 'unlink', target: '/out/PPSA1.exfat' });
  });

  it('creates an uncompressed PFS nested image first when requested', () => {
    const steps = buildSteps(
      { format: 'ffpfsc', sourceDir: '/games/APP', outputFile: '/out/PPSA1.ffpfsc', innerFormat: 'pfs' },
      linuxCtx(),
    );
    expect(steps.map((step) => step.kind)).toEqual(['shell', 'shell', 'unlink']);
    const nested = shellOf(steps[0]);
    expect(nested.args).toContain('folder');
    expect(nested.args).toContain('--no-compress');
    expect(nested.args).toContain('--no-adjust-output-file-extension');
    expect(nested.args.slice(-2)).toEqual(['/games/APP', '/out/PPSA1.dat']);
    expect(shellOf(steps[1]).args).toContain('file');
  });

  it('runs MkPFS through Python with PYTHONPATH when installed from the wheel', () => {
    const steps = buildSteps(
      { format: 'ffpfsc', sourceDir: '/games/APP', outputFile: '/out/a.ffpfsc', innerFormat: 'pfs' },
      linuxCtx({ mkpfs: mkpfsWhl() }),
    );
    const nested = shellOf(steps[0]);
    expect(nested.cmd).toBe('/usr/bin/python3');
    expect(nested.args.slice(0, 3)).toEqual(['-m', 'mkpfs', 'pack']);
    expect(nested.env).toEqual({ PYTHONPATH: '/data/tools/mkpfs/whl' });
    expect(nested.command).toContain('python -m mkpfs pack');
  });

  it('keeps the intermediate when asked', () => {
    const steps = buildSteps(
      { format: 'ffpfsc', sourceDir: '/x', outputFile: '/out/a.ffpfsc', innerFormat: 'pfs', keepIntermediate: true },
      linuxCtx(),
    );
    expect(steps.some((step) => step.kind === 'unlink')).toBe(false);
  });
});

describe('preview and titles', () => {
  it('describes every step', () => {
    const steps = buildSteps(
      { format: 'ffpfsc', sourceDir: '/x', outputFile: '/out/a.ffpfsc', innerFormat: 'exfat' },
      linuxCtx(),
    );
    const preview = stepsToPreview(steps);
    expect(preview).toHaveLength(3);
    expect(preview[0].privileged).toBe(true);
    expect(preview[1].command).toContain('mkpfs');
  });

  it('derives the job title from the output file name', () => {
    expect(jobTitle({ format: 'ufs2', sourceDir: '/x', outputFile: '/out/PPSA9.ffpkg' })).toBe('Build PPSA9.ffpkg');
  });
});
