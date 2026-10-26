// SPDX-License-Identifier: GPL-3.0-or-later
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { JobEvent, QueueSnapshot, SendEvent, SmpApi, ToolEvent } from '../shared/types';

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
    cancel: (jobId) => ipcRenderer.invoke(IPC.JobCancel, jobId),
  },
  queue: {
    list: () => ipcRenderer.invoke(IPC.QueueList),
    add: (spec) => ipcRenderer.invoke(IPC.QueueAdd, spec),
    remove: (itemId) => ipcRenderer.invoke(IPC.QueueRemove, itemId),
    clear: () => ipcRenderer.invoke(IPC.QueueClear),
  },
  tools: {
    download: (tool, assetName) => ipcRenderer.invoke(IPC.ToolDownload, tool, assetName),
    listAssets: (tool) => ipcRenderer.invoke(IPC.ToolListAssets, tool),
    downloadPayload: () => ipcRenderer.invoke(IPC.PayloadDownload),
    checkUpdates: () => ipcRenderer.invoke(IPC.ToolCheckUpdates),
  },
  setup: {
    run: () => ipcRenderer.invoke(IPC.SetupRun),
  },
  send: {
    payload: (opts) => ipcRenderer.invoke(IPC.SendPayload, opts),
    cancel: (sendId) => ipcRenderer.invoke(IPC.SendCancel, sendId),
  },
  updates: {
    check: () => ipcRenderer.invoke(IPC.UpdatesCheck),
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
  onQueueEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: QueueSnapshot) => callback(snapshot);
    ipcRenderer.on(IPC.EventQueue, listener);
    return () => ipcRenderer.removeListener(IPC.EventQueue, listener);
  },
};

contextBridge.exposeInMainWorld('smp', api);
