// SPDX-License-Identifier: GPL-3.0-or-later
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { JobEvent, SendEvent, SmpApi, ToolEvent } from '../shared/types';

const api: SmpApi = {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke(IPC.SettingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.SettingsSet, patch),
  },
  appInfo: () => ipcRenderer.invoke(IPC.AppInfo),
  dialogs: {
    pickFolder: (title) => ipcRenderer.invoke(IPC.DialogPickFolder, title),
    pickFile: (opts) => ipcRenderer.invoke(IPC.DialogPickFile, opts),
    pickSave: (opts) => ipcRenderer.invoke(IPC.DialogPickSave, opts),
  },
  shell: {
    openPath: (target) => ipcRenderer.invoke(IPC.ShellOpenPath, target),
    showItem: (target) => {
      void ipcRenderer.invoke(IPC.ShellShowItem, target);
    },
  },
  clipboard: {
    writeText: (text) => ipcRenderer.invoke(IPC.ClipboardWrite, text).then(() => undefined),
  },
  env: {
    detect: () => ipcRenderer.invoke(IPC.EnvDetect),
  },
  folders: {
    stat: (path) => ipcRenderer.invoke(IPC.FolderStat, path),
  },
  verify: {
    file: (path) => ipcRenderer.invoke(IPC.VerifyFile, path),
    inspect: (path) => ipcRenderer.invoke(IPC.VerifyInspect, path),
  },
  jobs: {
    preview: (spec) => ipcRenderer.invoke(IPC.JobPreview, spec),
    run: (spec) => ipcRenderer.invoke(IPC.JobRun, spec),
    cancel: (jobId) => ipcRenderer.invoke(IPC.JobCancel, jobId),
  },
  tools: {
    download: (tool, assetName) => ipcRenderer.invoke(IPC.ToolDownload, tool, assetName),
    listAssets: (tool) => ipcRenderer.invoke(IPC.ToolListAssets, tool),
    downloadPayload: () => ipcRenderer.invoke(IPC.PayloadDownload),
  },
  send: {
    payload: (opts) => ipcRenderer.invoke(IPC.SendPayload, opts),
    cancel: (sendId) => ipcRenderer.invoke(IPC.SendCancel, sendId),
  },
  onJobEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: JobEvent) => callback(payload);
    ipcRenderer.on(IPC.EventJob, listener);
    return () => ipcRenderer.removeListener(IPC.EventJob, listener);
  },
  onToolEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ToolEvent) => callback(payload);
    ipcRenderer.on(IPC.EventTool, listener);
    return () => ipcRenderer.removeListener(IPC.EventTool, listener);
  },
  onSendEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: SendEvent) => callback(payload);
    ipcRenderer.on(IPC.EventSend, listener);
    return () => ipcRenderer.removeListener(IPC.EventSend, listener);
  },
};

contextBridge.exposeInMainWorld('smp', api);
