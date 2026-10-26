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
  /** Content fingerprint of the builder scripts fetched through Tools; '' = bundled copies in use. */
  buildersVersion: string;
  toolPaths: {
    mkpfs: string;
    ufs2tool: string;
  };
  /** Resolved paths of tools downloaded through the built-in tool manager. */
  toolCache: {
    mkpfs: string;
    ufs2tool: string;
  };
  /** Release tags of tool-manager installs; used to spot tool updates. */
  toolVersions: {
    mkpfs: string;
    ufs2tool: string;
  };
  privilege: PrivilegeMode;
  defaultOutDir: string;
  /** Check GitHub for a newer release shortly after launch. */
  autoCheckUpdates: boolean;
  /** Icon-only sidebar; persisted so it survives restarts. */
  sidebarCollapsed: boolean;
  /** Startup defaults for the Create view. */
  createDefaults: {
    autoVerify: boolean;
    deleteSource: boolean;
  };
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

export interface UpdateCheckResult {
  status: 'available' | 'up-to-date' | 'none' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  message?: string;
}

export interface SetupSummary {
  installed: ('mkpfs' | 'ufs2tool')[];
  updated: ('mkpfs' | 'ufs2tool')[];
  skipped: ('mkpfs' | 'ufs2tool')[];
  failed: { tool: 'mkpfs' | 'ufs2tool'; error: string }[];
}

export interface ToolUpdateCheck {
  tool: 'mkpfs' | 'ufs2tool' | 'builders';
  current?: string;
  latest?: string;
  updateAvailable: boolean;
  message?: string;
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
  repoOk: boolean;
  /** Where the exFAT builder scripts will actually run from. */
  repoOrigin: 'downloaded' | 'bundled' | 'missing';
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
  /** Verify the output image with the built-in checker once the build succeeds. */
  autoVerify?: boolean;
  /** Delete the source folder after a successful build (the step never runs when any build step fails). */
  deleteSourceAfterSuccess?: boolean;
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
  | { jobId: string; type: 'exit'; code: number; ok: boolean; note?: string; cancelled?: boolean }
  | { jobId: string; type: 'cancelled' };

export type QueueItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface QueueItem {
  id: string;
  status: QueueItemStatus;
  addedAt: number;
  endedAt?: number;
  title: string;
  /** Output file name shown in the queue panel. */
  outputName: string;
  format: ImageFormat;
  spec: BuildSpec;
  jobId?: string;
  note?: string;
}

export interface QueueSnapshot {
  items: QueueItem[];
  /** Id of the item currently running, if any. */
  currentId: string | null;
}

export interface VerifyItem {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  addedAt: number;
  /** Absolute path being verified. */
  path: string;
  /** File name shown in the list. */
  name: string;
  /** Filled once verification finished. */
  report?: FileReport;
  error?: string;
}

export interface VerifySnapshot {
  items: VerifyItem[];
  /** Id of the item currently being verified, if any. */
  currentId: string | null;
}

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
    /** Multi-select variant: resolves with every picked path. */
    pickFiles(opts?: { title?: string; filters?: FileFilter[] }): Promise<string[]>;
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
  verifyQueue: {
    list(): Promise<VerifySnapshot>;
    add(paths: string[]): Promise<{ added: number; skipped: number }>;
    remove(itemId: string): Promise<boolean>;
    clear(): Promise<number>;
  };
  jobs: {
    preview(spec: BuildSpec): Promise<{ title: string; steps: JobStepPreview[] }>;
    cancel(jobId: string): Promise<boolean>;
  };
  queue: {
    list(): Promise<QueueSnapshot>;
    add(spec: BuildSpec): Promise<{ itemId: string }>;
    remove(itemId: string): Promise<boolean>;
    clear(): Promise<number>;
  };
  tools: {
    download(tool: 'mkpfs' | 'ufs2tool', assetName?: string): Promise<{ ok: boolean; path?: string; error?: string }>;
    listAssets(tool: 'mkpfs' | 'ufs2tool'): Promise<{ version: string; assets: ReleaseAsset[] }>;
    downloadPayload(): Promise<{ ok: boolean; path?: string; error?: string }>;
    checkUpdates(): Promise<ToolUpdateCheck[]>;
  };
  setup: {
    run(): Promise<SetupSummary>;
  };
  builders: {
    /** Fetch the latest builder scripts from the ShadowMountPlus repository. */
    fetch(): Promise<{ ok: boolean; version?: string; error?: string }>;
    /** Drop the fetched scripts and fall back to the bundled copies. */
    reset(): Promise<{ ok: boolean; error?: string }>;
  };
  send: {
    payload(opts: { host: string; port: number; elfPath: string }): Promise<{ sendId: string }>;
    cancel(sendId: string): Promise<boolean>;
  };
  updates: {
    check(): Promise<UpdateCheckResult>;
  };
  onJobEvent(callback: (event: JobEvent) => void): () => void;
  onToolEvent(callback: (event: ToolEvent) => void): () => void;
  onSendEvent(callback: (event: SendEvent) => void): () => void;
  onQueueEvent(callback: (snapshot: QueueSnapshot) => void): () => void;
  onVerifyQueueEvent(callback: (snapshot: VerifySnapshot) => void): () => void;
}
