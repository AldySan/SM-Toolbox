// SPDX-License-Identifier: GPL-3.0-or-later
// Sequential step runner with live output streaming, cancellation and
// privilege handling: pkexec on Linux, an elevated PowerShell wrapper on
// Windows (UAC), with the child's output tailed through a log file.

import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PrivilegeMode } from '../../shared/types';
import type { Step } from './recipes';

const IS_WINDOWS = process.platform === 'win32';
const ELEVATION_DECLINED = 1223;

export interface RunnerOptions {
  privilege: PrivilegeMode;
  pkexecAvailable: boolean;
  runningAsRoot: boolean;
  onStep(index: number, total: number, step: Step): void;
  onData(chunk: string): void;
}

export interface RunningJob {
  cancel(reason?: string): void;
  done: Promise<{ code: number; ok: boolean; note?: string }>;
}

export function runJob(jobId: string, steps: Step[], opts: RunnerOptions): RunningJob {
  let cancelled = false;
  let killActive: ((hard?: boolean) => void) | undefined;

  const done = (async (): Promise<{ code: number; ok: boolean; note?: string }> => {
    for (let index = 0; index < steps.length; index += 1) {
      if (cancelled) return { code: -1, ok: false, note: 'Cancelled' };
      const step = steps[index];
      opts.onStep(index, steps.length, step);
      if (step.kind === 'unlink') {
        try {
          await fs.promises.rm(step.target, { force: true });
        } catch (error) {
          return { code: -1, ok: false, note: `Failed to remove ${step.target}: ${String(error)}` };
        }
        continue;
      }

      const result = await runShellStep(jobId, step, opts, (kill) => {
        killActive = kill;
      });
      killActive = undefined;
      if (cancelled) return { code: -1, ok: false, note: 'Cancelled' };
      if (result.code !== 0) {
        let note: string | undefined;
        if (result.code === ELEVATION_DECLINED) {
          note = 'Elevation was declined. The exFAT builder needs OSFMount and must run as administrator.';
        } else if (step.privileged && !IS_WINDOWS && !opts.runningAsRoot) {
          note = 'This step needs root privileges. Configure pkexec (default), run the app as root, or run the command above in a terminal with sudo.';
        }
        return { code: result.code, ok: false, note };
      }
    }
    return { code: 0, ok: true };
  })();

  return {
    cancel() {
      cancelled = true;
      killActive?.(true);
    },
    done,
  };
}

interface ShellResult {
  code: number;
}

function runShellStep(
  jobId: string,
  step: Extract<Step, { kind: 'shell' }>,
  opts: RunnerOptions,
  registerKill: (kill: (hard?: boolean) => void) => void,
): Promise<ShellResult> {
  if (IS_WINDOWS) {
    if (step.privileged) {
      return runElevatedWindows(jobId, step, opts, registerKill);
    }
    return runDirect(step, opts, registerKill);
  }

  const needsRoot = step.privileged && !opts.runningAsRoot;
  const usePkexec =
    needsRoot && (opts.privilege === 'pkexec' || (opts.privilege === 'auto' && opts.pkexecAvailable));
  if (usePkexec) {
    // Environment variables do not survive pkexec; raised steps never rely on one.
    return runDirect({ ...step, cmd: 'pkexec', args: [step.cmd, ...step.args], env: undefined }, opts, registerKill);
  }
  return runDirect(step, opts, registerKill);
}

function runDirect(
  step: { cmd: string; args: string[]; env?: Record<string, string> },
  opts: RunnerOptions,
  registerKill: (kill: (hard?: boolean) => void) => void,
): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, {
      windowsHide: true,
      detached: !IS_WINDOWS,
      env: step.env ? { ...process.env, ...step.env } : process.env,
    });
    let finished = false;

    const finish = (code: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code });
    };

    const timer = setTimeout(() => {
      if (!finished) killChild(child);
    }, 24 * 60 * 60 * 1000);

    registerKill((hard) => killChild(child, hard));

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => opts.onData(chunk));
    child.stderr?.on('data', (chunk: string) => opts.onData(chunk));
    child.on('error', (error) => {
      opts.onData(`\nFailed to start: ${error.message}\n`);
      finish(-1);
    });
    child.on('close', (code) => finish(code ?? -1));
  });
}

function killChild(child: ReturnType<typeof spawn>, hard = true): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else if (child.pid) {
      process.kill(-child.pid, hard ? 'SIGKILL' : 'SIGTERM');
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function tempDir(): string {
  const dir = path.join(app.getPath('temp'), 'sm-toolbox');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeElevationHelpers(jobId: string, step: Extract<Step, { kind: 'shell' }>): { inner: string; log: string } {
  const dir = tempDir();
  const log = path.join(dir, `job-${jobId}.log`);
  fs.rmSync(log, { force: true });

  const inner = path.join(dir, `job-${jobId}.ps1`);
  fs.writeFileSync(
    inner,
    [
      '$ErrorActionPreference = \'Continue\'',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      `& ${psQuote(step.cmd)} ${step.args.map(psQuote).join(' ')} *>&1 | Out-File -FilePath ${psQuote(log)} -Encoding utf8 -Append`,
      'exit $LASTEXITCODE',
      '',
    ].join('\r\n'),
    'utf8',
  );

  const outer = path.join(dir, 'elevate.ps1');
  fs.writeFileSync(
    outer,
    [
      '$ErrorActionPreference = \'Stop\'',
      'try {',
      "  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $args[0]) -Verb RunAs -PassThru -Wait -WindowStyle Hidden",
      '  exit $p.ExitCode',
      '} catch {',
      `  exit ${ELEVATION_DECLINED}`,
      '}',
      '',
    ].join('\r\n'),
    'utf8',
  );
  return { inner, log };
}

function runElevatedWindows(
  jobId: string,
  step: Extract<Step, { kind: 'shell' }>,
  opts: RunnerOptions,
  registerKill: (kill: (hard?: boolean) => void) => void,
): Promise<ShellResult> {
  const { inner, log } = writeElevationHelpers(jobId, step);
  let offset = 0;
  let bomStripped = false;

  const pump = () => {
    try {
      const stat = fs.statSync(log);
      if (stat.size > offset) {
        const fd = fs.openSync(log, 'r');
        const length = stat.size - offset;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, offset);
        fs.closeSync(fd);
        offset = stat.size;
        let text = buffer.toString('utf8');
        if (!bomStripped && text.charCodeAt(0) === 0xfeff) {
          text = text.slice(1);
        }
        bomStripped = true;
        if (text) opts.onData(text);
      }
    } catch {
      /* log not written yet */
    }
  };

  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(tempDir(), 'elevate.ps1'), inner],
      { windowsHide: true },
    );
    let finished = false;
    const finish = (code: number) => {
      if (finished) return;
      finished = true;
      clearInterval(poll);
      clearTimeout(timer);
      pump();
      resolve({ code });
    };

    const poll = setInterval(pump, 200);
    const timer = setTimeout(() => {
      if (!finished) killChild(child);
    }, 24 * 60 * 60 * 1000);

    registerKill(() => killChild(child));

    child.on('error', (error) => {
      opts.onData(`\nFailed to start elevation helper: ${error.message}\n`);
      finish(-1);
    });
    child.on('close', (code) => {
      // Give Out-File a moment to flush before the final pump.
      setTimeout(() => finish(code ?? -1), 250);
    });
  });
}
