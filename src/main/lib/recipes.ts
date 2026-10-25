// SPDX-License-Identifier: GPL-3.0-or-later
// Pure builders that turn a BuildSpec into runnable steps. No I/O happens
// here so the logic stays easy to reason about and to test; the caller
// supplies resolved tool invocations and the source file count.

import type { BuildSpec, InnerFormat, JobStepPreview } from '../../shared/types';
import type { ToolInvocation } from './env';

export interface StepContext {
  isWindows: boolean;
  repoPath: string;
  mkpfs: ToolInvocation;
  ufs2tool: ToolInvocation;
  sourceFileCount: number;
}

export type Step =
  | {
      kind: 'shell';
      description: string;
      command: string;
      cmd: string;
      args: string[];
      env?: Record<string, string>;
      privileged: boolean;
    }
  | { kind: 'unlink'; description: string; command: string; target: string };

const UFS2_PROFILE = ['-O', '2', '-b', '65536', '-f', '65536', '-m', '0', '-S', '4096'];

export function jobTitle(spec: BuildSpec): string {
  const name = spec.outputFile.split(/[\\/]/).pop() ?? spec.outputFile;
  return `Build ${name}`;
}

/** Recommended bytes-per-inode for the fixed UFS2 profile, based on file count. */
export function resolveInodeBytes(spec: BuildSpec, ctx: StepContext): number {
  if (spec.inodeDensity && spec.inodeDensity !== 'auto') {
    return Number(spec.inodeDensity);
  }
  const count = ctx.sourceFileCount;
  if (count > 50000) return 65536;
  if (count > 10000) return 131072;
  return 262144;
}

interface Invocation {
  cmd: string;
  args: string[];
  env?: Record<string, string>;
  display: string;
}

function invoke(tool: ToolInvocation, args: string[]): Invocation {
  return {
    cmd: tool.cmd,
    args: [...tool.prefix, ...args],
    env: tool.env,
    display: `${tool.display} ${args.map(quote).join(' ')}`,
  };
}

function shellStep(description: string, invocation: Invocation, privileged: boolean): Step {
  return {
    kind: 'shell',
    description,
    command: invocation.display,
    cmd: invocation.cmd,
    args: invocation.args,
    env: invocation.env,
    privileged,
  };
}

function exfatShellSteps(spec: BuildSpec, ctx: StepContext): Step[] {
  if (ctx.isWindows) {
    const script = `${ctx.repoPath}\\New-OsfExfatImage.ps1`;
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-ImagePath',
      spec.outputFile,
      '-SourceDir',
      spec.sourceDir,
      '-ForceOverwrite',
    ];
    if (spec.label) args.push('-Label', spec.label);
    return [
      shellStep(
        'Create exFAT image (OSFMount, elevated)',
        {
          cmd: 'powershell.exe',
          args,
          display: `powershell ${args.map(quote).join(' ')}`,
        },
        true,
      ),
    ];
  }
  const script = `${ctx.repoPath}/mkexfat.sh`;
  return [
    shellStep(
      'Create exFAT image via mkexfat.sh',
      {
        cmd: 'bash',
        args: [script, spec.sourceDir, spec.outputFile],
        display: `sudo bash mkexfat.sh ${quote(spec.sourceDir)} ${quote(spec.outputFile)}`,
      },
      true,
    ),
  ];
}

function ufs2ShellStep(spec: BuildSpec, ctx: StepContext): Step {
  const inodeBytes = resolveInodeBytes(spec, ctx);
  return shellStep(
    `Create UFS2 image (inode density ${inodeBytes})`,
    invoke(ctx.ufs2tool, ['newfs', ...UFS2_PROFILE, '-i', String(inodeBytes), '-D', spec.sourceDir, spec.outputFile]),
    false,
  );
}

function packSteps(
  spec: BuildSpec,
  ctx: StepContext,
  innerFormat: InnerFormat,
  intermediate: string,
  innerSteps: Step[],
): Step[] {
  const steps: Step[] = [...innerSteps];

  if (innerFormat === 'pfs') {
    steps.push(
      shellStep(
        'Create uncompressed nested PFS image',
        invoke(ctx.mkpfs, [
          'pack',
          'folder',
          '--verify',
          '--no-compress',
          '--no-adjust-output-file-extension',
          '--version',
          'PS5',
          '--inode-bits',
          '32',
          spec.sourceDir,
          intermediate,
        ]),
        false,
      ),
    );
  }

  steps.push(
    shellStep(
      'Pack nested image into compressed PFS container',
      invoke(ctx.mkpfs, [
        'pack',
        'file',
        '--verify',
        '--version',
        'PS5',
        '--inode-bits',
        '32',
        intermediate,
        spec.outputFile,
      ]),
      false,
    ),
  );

  if (!spec.keepIntermediate) {
    steps.push({
      kind: 'unlink',
      description: 'Remove intermediate image',
      command: `rm ${quote(intermediate)}`,
      target: intermediate,
    });
  }
  return steps;
}

export function buildSteps(spec: BuildSpec, ctx: StepContext): Step[] {
  switch (spec.format) {
    case 'exfat':
      return exfatShellSteps(spec, ctx);
    case 'ufs2':
      return [ufs2ShellStep(spec, ctx)];
    case 'ffpfsc': {
      const innerFormat: InnerFormat = spec.innerFormat ?? 'exfat';
      const base = spec.outputFile.replace(/\.[^.\\/]+$/, '');
      const intermediate = innerFormat === 'exfat' ? `${base}.exfat` : `${base}.dat`;
      const innerSteps = innerFormat === 'exfat' ? exfatShellSteps({ ...spec, outputFile: intermediate }, ctx) : [];
      return packSteps(spec, ctx, innerFormat, intermediate, innerSteps);
    }
  }
}

export function stepsToPreview(steps: Step[]): JobStepPreview[] {
  return steps.map((step) => ({
    description: step.description,
    command: step.command,
    privileged: step.kind === 'shell' ? step.privileged : false,
  }));
}

export function quote(value: string): string {
  return /[^A-Za-z0-9_@%+=:,./-]/.test(value) ? `"${value.replace(/(["\\$`])/g, '\\$1')}"` : value;
}
