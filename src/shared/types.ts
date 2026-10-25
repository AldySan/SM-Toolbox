// SPDX-License-Identifier: GPL-3.0-or-later
// Types shared between the main process, the preload bridge and the renderer.

export type ThemeMode = 'auto' | 'dark' | 'light';

export type PrivilegeMode = 'auto' | 'pkexec' | 'direct';

export type ImageFormat = 'exfat' | 'ufs2' | 'ffpfsc';

export type InnerFormat = 'exfat' | 'pfs';

export type InodeDensity = 'auto' | '262144' | '131072' | '65536';

export type DetectedImageKind = 'exfat' | 'ufs2' | 'ufs1' | 'pfs' | 'unknown';

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface AppSettings {
  theme: ThemeMode;
  /** Directory of a local ShadowMountPlus checkout used for its build scripts. */
  repoPath: string;
  toolPaths: {
    mkpfs: string;
    ufs2tool: string;
  };
  /** Resolved paths of tools downloaded through the built-in tool manager. */
  toolCache: {
    mkpfs: string;
    ufs2tool: string;
  };
  privilege: PrivilegeMode;
  defaultOutDir: string;
  ps5: {
    host: string;
    port: number;
  };
  recentHosts: string[];
}

export interface AppInfo {
  version: string;
  electron: string;
  node: string;
  platform: string;
  arch: string;
  userData: string;
}

export interface ToolCheck {
  id: string;
  label: string;
  found: boolean;
  path?: string;
  version?: string;
  detail?: string;
  requiredFor: ImageFormat[];
  fix?: string;
}

export interface EnvReport {
  platform: string;
  isWindows: boolean;
  isLinux: boolean;
  repoPath: string;
  repoOk: boolean;
  repoDetail?: string;
  tools: ToolCheck[];
  privilege: {
    mode: PrivilegeMode;
    pkexecAvailable: boolean;
    runningAsRoot: boolean;
  };
}

export interface FolderStat {
  path: string;
  exists: boolean;
  ebootBin: boolean;
  paramJson: boolean;
  paramInfo?: {
    titleId?: string;
    contentId?: string;
  };
  fileCount: number;
  dirCount: number;
  totalBytes: number;
}

export interface FileReport {
  path: string;
  size: number;
  extension: string;
  detected: DetectedImageKind;
  /** Describes what was matched and what the header implies. */
  notes: string[];
  clusterSize?: number;
  alignment64k: boolean;
  extensionMatches: boolean;
}

export interface InspectResult {
  tool: 'mkpfs' | 'ufs2tool';
  output: string;
}

export interface BuildSpec {
  format: ImageFormat;
  sourceDir: string;
  outputFile: string;
  /** For ffpfsc: the nested image format packed inside the container. */
  innerFormat?: InnerFormat;
  /** For ufs2: bytes-per-inode policy. */
  inodeDensity?: InodeDensity;
  /** Windows-only exFAT volume label. */
  label?: string;
  /** Keep the intermediate nested image after packing an ffpfsc. */
  keepIntermediate?: boolean;
}

export interface JobStepPreview {
  description: string;
  command: string;
  privileged: boolean;
}

export type JobEvent =
  | { jobId: string; type: 'start'; title: string; steps: number }
  | { jobId: string; type: 'step'; index: number; description: string; command: string }
  | { jobId: string; type: 'data'; chunk: string }
  | { jobId: string; type: 'exit'; code: number; ok: boolean; note?: string }
  | { jobId: string; type: 'cancelled' };

export type ToolEvent =
  | { tool: string; type: 'status'; text: string }
  | { tool: string; type: 'progress'; received: number; total: number }
  | { tool: string; type: 'done'; path?: string; version?: string; error?: string };

export type SendEvent =
  | { sendId: string; type: 'connecting' }
  | { sendId: string; type: 'connected' }
  | { sendId: string; type: 'progress'; sent: number; total: number }
  | { sendId: string; type: 'sent'; sent: number }
  | { sendId: string; type: 'failed'; message: string }
  | { sendId: string; type: 'cancelled' };

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
}

export interface SmpApi {
  platform: string;
  settings: {
    get(): Promise<AppSettings>;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
  };
  appInfo(): Promise<AppInfo>;
  dialogs: {
    pickFolder(title?: string): Promise<string | null>;
    pickFile(opts?: { title?: string; filters?: FileFilter[] }): Promise<string | null>;
    pickSave(opts?: { title?: string; defaultPath?: string; filters?: FileFilter[] }): Promise<string | null>;
  };
  shell: {
    openPath(target: string): Promise<string>;
    showItem(target: string): void;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
  };
  env: {
    detect(): Promise<EnvReport>;
  };
  folders: {
    stat(path: string): Promise<FolderStat | null>;
  };
  verify: {
    file(path: string): Promise<FileReport | null>;
    inspect(path: string): Promise<InspectResult | null>;
  };
  jobs: {
    preview(spec: BuildSpec): Promise<{ title: string; steps: JobStepPreview[] }>;
    run(spec: BuildSpec): Promise<{ jobId: string }>;
    cancel(jobId: string): Promise<boolean>;
  };
  tools: {
    download(tool: 'mkpfs' | 'ufs2tool', assetName?: string): Promise<{ ok: boolean; path?: string; error?: string }>;
    listAssets(tool: 'mkpfs' | 'ufs2tool'): Promise<{ version: string; assets: ReleaseAsset[] }>;
    downloadPayload(): Promise<{ ok: boolean; path?: string; error?: string }>;
  };
  send: {
    payload(opts: { host: string; port: number; elfPath: string }): Promise<{ sendId: string }>;
    cancel(sendId: string): Promise<boolean>;
  };
  onJobEvent(callback: (event: JobEvent) => void): () => void;
  onToolEvent(callback: (event: ToolEvent) => void): () => void;
  onSendEvent(callback: (event: SendEvent) => void): () => void;
}
