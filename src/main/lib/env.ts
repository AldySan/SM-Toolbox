// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AppSettings, EnvReport, ToolCheck, ImageFormat } from '../../shared/types';

const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

const LINUX_BIN_DIRS = ['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin'];

/** How a tool is invoked, independent of where it comes from. */
export interface ToolInvocation {
  cmd: string;
  prefix: string[];
  env?: Record<string, string>;
  /** Short form used in command previews. */
  display: string;
  origin: 'override' | 'path' | 'bundled-whl' | 'missing';
}

const MISSING = (display: string): ToolInvocation => ({ cmd: '', prefix: [], display, origin: 'missing' });

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function findExecutable(name: string): string | undefined {
  const candidates = IS_WINDOWS ? [name, `${name}.exe`, `${name}.bat`, `${name}.cmd`] : [name];
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  if (IS_LINUX) dirs.push(...LINUX_BIN_DIRS);
  if (IS_WINDOWS) {
    const programDirs = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
      .filter((d): d is string => Boolean(d))
      .flatMap((d) => [path.join(d, 'OSFMount'), path.join(d, 'PassMark', 'OSFMount')]);
    dirs.push(...programDirs);
  }
  for (const dir of dirs) {
    for (const candidate of candidates) {
      const full = path.join(dir, candidate);
      if (isExecutable(full)) return full;
    }
  }
  return undefined;
}

export function findPython(): ToolInvocation | undefined {
  const direct = findExecutable(IS_WINDOWS ? 'python' : 'python3');
  if (direct) return { cmd: direct, prefix: [], display: 'python', origin: 'path' };
  if (IS_WINDOWS) {
    const py = findExecutable('py');
    if (py) return { cmd: py, prefix: ['-3'], display: 'py -3', origin: 'path' };
  }
  return undefined;
}

export function runCapture(
  cmd: string,
  args: string[],
  timeoutMs = 10000,
  env: Record<string, string> = {},
): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { windowsHide: true, env: { ...process.env, ...env } });
      let out = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve(undefined);
      }, timeoutMs);
      child.stdout?.on('data', (d: Buffer) => {
        out += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        out += d.toString();
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(undefined);
      });
      child.on('close', () => {
        clearTimeout(timer);
        const first = out.trim().split(/\r?\n/)[0];
        resolve(first || undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

function tool(id: string, label: string, requiredFor: ImageFormat[], found: boolean, extra: Partial<ToolCheck> = {}): ToolCheck {
  return { id, label, requiredFor, found, ...extra };
}

export function repoScripts(settings: AppSettings): { repoPath: string; ok: boolean; detail?: string } {
  if (!settings.repoPath) {
    return { repoPath: '', ok: false, detail: 'Repository path is not set' };
  }
  const scripts = IS_WINDOWS ? ['New-OsfExfatImage.ps1'] : ['mkexfat.sh'];
  for (const script of scripts) {
    if (fs.existsSync(path.join(settings.repoPath, script))) {
      return { repoPath: settings.repoPath, ok: true };
    }
  }
  return {
    repoPath: settings.repoPath,
    ok: false,
    detail: `No builder script found (expected ${scripts.join(', ')} inside the checkout)`,
  };
}

export interface ResolvedTools {
  mkpfs: ToolInvocation;
  ufs2tool: ToolInvocation;
}

function pythonModuleInvocation(python: ToolInvocation, packageDir: string): ToolInvocation {
  return {
    cmd: python.cmd,
    prefix: [...python.prefix, '-m', 'mkpfs'],
    env: { PYTHONPATH: packageDir },
    display: `${python.display} -m mkpfs`,
    origin: 'bundled-whl',
  };
}

/** A toolCache entry is either a binary path (UFS2Tool) or an extracted whl dir (MkPFS). */
function isWhlDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'mkpfs', '__init__.py'));
  } catch {
    return false;
  }
}

export function resolveTools(settings: AppSettings): ResolvedTools {
  // MkPFS: manual override > console script on PATH > bundled whl via Python.
  if (settings.toolPaths.mkpfs && fs.existsSync(settings.toolPaths.mkpfs)) {
    const mkpfs: ToolInvocation = { cmd: settings.toolPaths.mkpfs, prefix: [], display: 'mkpfs', origin: 'override' };
    return { mkpfs, ufs2tool: resolveUfs2Tool(settings) };
  }
  const onPath = findExecutable('mkpfs');
  if (onPath) {
    return { mkpfs: { cmd: onPath, prefix: [], display: 'mkpfs', origin: 'path' }, ufs2tool: resolveUfs2Tool(settings) };
  }
  const cached = settings.toolCache.mkpfs;
  if (cached && isWhlDir(cached)) {
    const python = findPython();
    if (python) {
      return { mkpfs: pythonModuleInvocation(python, cached), ufs2tool: resolveUfs2Tool(settings) };
    }
  }
  return { mkpfs: MISSING('mkpfs'), ufs2tool: resolveUfs2Tool(settings) };
}

function resolveUfs2Tool(settings: AppSettings): ToolInvocation {
  const names = IS_WINDOWS ? ['UFS2Tool.exe', 'ufs2tool.exe'] : ['ufs2tool', 'UFS2Tool'];
  const override = settings.toolPaths.ufs2tool;
  if (override && fs.existsSync(override)) {
    return { cmd: override, prefix: [], display: 'ufs2tool', origin: 'override' };
  }
  if (settings.toolCache.ufs2tool && fs.existsSync(settings.toolCache.ufs2tool)) {
    return { cmd: settings.toolCache.ufs2tool, prefix: [], display: 'ufs2tool', origin: 'bundled-whl' };
  }
  for (const name of names) {
    const found = findExecutable(name);
    if (found) return { cmd: found, prefix: [], display: 'ufs2tool', origin: 'path' };
  }
  return MISSING('ufs2tool');
}

export async function detectEnvironment(settings: AppSettings): Promise<EnvReport> {
  const tools: ToolCheck[] = [];
  const resolved = resolveTools(settings);

  if (resolved.mkpfs.origin !== 'missing') {
    const version = await runCapture(resolved.mkpfs.cmd, [...resolved.mkpfs.prefix, '-V'], 10000, resolved.mkpfs.env);
    tools.push(
      tool('mkpfs', 'MkPFS', ['ffpfsc'], true, {
        path: resolved.mkpfs.display,
        version,
        detail: resolved.mkpfs.origin === 'bundled-whl' ? 'bundled wheel via Python' : undefined,
      }),
    );
  } else {
    tools.push(
      tool('mkpfs', 'MkPFS', ['ffpfsc'], false, {
        fix: 'Download it from the Tools section in Settings (uses your local Python), or pip install mkpfs.',
      }),
    );
  }

  if (resolved.ufs2tool.origin !== 'missing') {
    const banner = await runCapture(resolved.ufs2tool.cmd, [], 10000, resolved.ufs2tool.env);
    tools.push(tool('ufs2tool', 'UFS2Tool', ['ufs2'], true, { path: resolved.ufs2tool.cmd, version: banner }));
  } else {
    tools.push(
      tool('ufs2tool', 'UFS2Tool', ['ufs2'], false, {
        fix: 'Download it from the Tools section in Settings, or set the path manually.',
      }),
    );
  }

  if (resolved.mkpfs.origin === 'missing' && !(settings.toolCache.mkpfs && isWhlDir(settings.toolCache.mkpfs))) {
    // Only surface Python when it would actually unlock MkPFS.
    if (!findPython()) {
      tools.push({
        id: 'python',
        label: 'Python 3 (for MkPFS)',
        requiredFor: ['ffpfsc'],
        found: false,
        fix: 'Install Python 3 to let the toolbox run the bundled MkPFS wheel.',
      });
    } else {
      tools.push({ id: 'python', label: 'Python 3 (for MkPFS)', requiredFor: ['ffpfsc'], found: true });
    }
  }

  const repo = repoScripts(settings);
  tools.push({
    id: 'repo',
    label: 'ShadowMountPlus checkout',
    requiredFor: ['exfat', 'ffpfsc'],
    found: repo.ok,
    detail: repo.ok ? repo.repoPath : repo.detail,
    fix: 'Clone the repository and point Settings to it.',
  });

  if (IS_LINUX) {
    const deps: [string, string][] = [
      ['mkfs.exfat', 'mkfs.exfat (exfatprogs)'],
      ['mount.exfat-fuse', 'mount.exfat-fuse (exfat-fuse)'],
      ['rsync', 'rsync'],
    ];
    for (const [bin, label] of deps) {
      const found = findExecutable(bin);
      tools.push(
        tool(bin, label, ['exfat'], Boolean(found), {
          path: found,
          fix: found ? undefined : 'sudo apt-get install -y exfatprogs exfat-fuse fuse3 rsync',
        }),
      );
    }
  }

  if (IS_WINDOWS) {
    const osfmount = findExecutable('osfmount.com');
    tools.push({
      id: 'osfmount',
      label: 'OSFMount',
      requiredFor: ['exfat'],
      found: Boolean(osfmount),
      path: osfmount,
      fix: osfmount ? undefined : 'Install OSFMount from https://www.osforensics.com/tools/mount-disk-images.html',
    });
    tools.push({
      id: 'powershell',
      label: 'PowerShell',
      requiredFor: ['exfat'],
      found: true,
      path: findExecutable('powershell.exe'),
    });
  }

  const pkexec = IS_LINUX ? findExecutable('pkexec') : undefined;

  return {
    platform: process.platform,
    isWindows: IS_WINDOWS,
    isLinux: IS_LINUX,
    repoPath: settings.repoPath,
    repoOk: repo.ok,
    repoDetail: repo.detail,
    tools,
    privilege: {
      mode: settings.privilege,
      pkexecAvailable: Boolean(pkexec),
      runningAsRoot: typeof process.getuid === 'function' && process.getuid() === 0,
    },
  };
}
