// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react';
import type { AppInfo, AppSettings, EnvReport, ThemeMode, ToolEvent } from '../../../shared/types';
import { smp } from '../lib/api';
import { Segmented } from '../components/Segmented';
import { PathField } from '../components/PathField';
import { StatusDot } from '../components/StatusDot';

type ToolId = 'mkpfs' | 'ufs2tool';

interface ToolProgress {
  text: string;
  received: number;
  total: number;
}

export function SettingsView(props: {
  settings: AppSettings | null;
  appInfo: AppInfo | null;
  env: EnvReport | null;
  onChange: (patch: Partial<AppSettings>) => void;
  onRefreshEnv: () => void;
}) {
  const { settings, appInfo, env } = props;
  const [progress, setProgress] = useState<Partial<Record<ToolId, ToolProgress>>>({});
  const [busy, setBusy] = useState<Partial<Record<ToolId, boolean>>>({});
  const [toolError, setToolError] = useState<Partial<Record<ToolId, string>>>({});

  useEffect(() => {
    const unsubscribe = smp.onToolEvent((event: ToolEvent) => {
      const tool = event.tool as ToolId;
      if (tool !== 'mkpfs' && tool !== 'ufs2tool') return;
      if (event.type === 'status') {
        setProgress((prev) => ({ ...prev, [tool]: { text: event.text, received: 0, total: 0 } }));
      } else if (event.type === 'progress') {
        setProgress((prev) => ({
          ...prev,
          [tool]: { text: prev[tool]?.text ?? 'Downloading…', received: event.received, total: event.total },
        }));
      } else if (event.type === 'done') {
        setBusy((prev) => ({ ...prev, [tool]: false }));
        setProgress((prev) => {
          const next = { ...prev };
          delete next[tool];
          return next;
        });
        if (event.error) {
          setToolError((prev) => ({ ...prev, [tool]: event.error }));
        } else {
          setToolError((prev) => {
            const next = { ...prev };
            delete next[tool];
            return next;
          });
          props.onRefreshEnv();
        }
      }
    });
    return unsubscribe;
  }, [props]);

  if (!settings) {
    return (
      <div className="view">
        <div className="view-head">
          <h1>Settings</h1>
        </div>
        <p className="sub">Loading…</p>
      </div>
    );
  }

  const download = (tool: ToolId) => {
    setBusy((prev) => ({ ...prev, [tool]: true }));
    setToolError((prev) => {
      const next = { ...prev };
      delete next[tool];
      return next;
    });
    void smp.tools.download(tool).then((result) => {
      if (!result.ok && result.error) {
        setToolError((prev) => ({ ...prev, [tool]: result.error as string }));
      }
      setBusy((prev) => ({ ...prev, [tool]: false }));
    });
  };

  return (
    <div className="view">
      <div className="view-head">
        <h1>Settings</h1>
        <p className="sub">Stored locally in {appInfo ? `${appInfo.userData}/settings.json` : 'your user profile'}.</p>
      </div>

      <div className="card">
        <h2>Appearance</h2>
        <div className="field">
          <label>Theme</label>
          <Segmented<ThemeMode>
            value={settings.theme}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
            onChange={(theme) => props.onChange({ theme })}
            ariaLabel="Theme"
          />
        </div>
      </div>

      <div className="card">
        <h2>ShadowMountPlus repository</h2>
        <PathField
          label="Local checkout"
          value={settings.repoPath}
          kind="folder"
          dialogTitle="Select your ShadowMountPlus checkout"
          placeholder="/home/user/ShadowMountPlus"
          onChange={(repoPath) => props.onChange({ repoPath })}
          hint="Image-builder scripts shipped with the repo are executed from this directory, so the client always uses your checked-out version."
        />
      </div>

      <div className="card">
        <h2>Tools</h2>
        <ToolRow
          toolId="mkpfs"
          label="MkPFS"
          homepage="https://github.com/PSBrew/MkPFS"
          check={env?.tools.find((candidate) => candidate.id === 'mkpfs')}
          override={settings.toolPaths.mkpfs}
          progress={progress.mkpfs}
          busy={busy.mkpfs}
          error={toolError.mkpfs}
          onOverride={(value) => props.onChange({ toolPaths: { ...settings.toolPaths, mkpfs: value } })}
          onDownload={() => download('mkpfs')}
        />
        <ToolRow
          toolId="ufs2tool"
          label="UFS2Tool"
          homepage="https://github.com/SvenGDK/UFS2Tool"
          check={env?.tools.find((candidate) => candidate.id === 'ufs2tool')}
          override={settings.toolPaths.ufs2tool}
          progress={progress.ufs2tool}
          busy={busy.ufs2tool}
          error={toolError.ufs2tool}
          onOverride={(value) => props.onChange({ toolPaths: { ...settings.toolPaths, ufs2tool: value } })}
          onDownload={() => download('ufs2tool')}
        />
      </div>

      {env?.isLinux && (
        <div className="card">
          <h2>Privilege helper</h2>
          <div className="field">
            <label>Raised steps (exFAT builder)</label>
            <Segmented
              value={settings.privilege}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'pkexec', label: 'pkexec' },
                { value: 'direct', label: 'Direct' },
              ]}
              onChange={(privilege) => props.onChange({ privilege })}
              ariaLabel="Privilege helper"
            />
            <div className="field-hint">
              {env.privilege.pkexecAvailable
                ? 'pkexec detected — privileged steps raise a polkit prompt when they are not already running as root.'
                : 'pkexec was not found. Privileged steps run directly and need a root shell or passwordless sudo.'}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Build defaults</h2>
        <PathField
          label="Default output folder"
          value={settings.defaultOutDir}
          kind="folder"
          dialogTitle="Select default output folder"
          onChange={(defaultOutDir) => props.onChange({ defaultOutDir })}
          hint="Used as the starting location when picking output images."
        />
      </div>

      <div className="card">
        <h2>Storage</h2>
        <div className="field">
          <label>App data</label>
          <div className="pathfield">
            <input type="text" className="mono" readOnly value={appInfo?.userData ?? ''} spellCheck={false} />
            <button
              type="button"
              className="btn"
              disabled={!appInfo}
              onClick={() => appInfo && void smp.shell.openPath(appInfo.userData)}
            >
              Open folder
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>About</h2>
        <p>
          SM+ Toolbox {appInfo ? `v${appInfo.version}` : ''} — part of the ShadowMountPlus project, licensed
          GPL-3.0-or-later.
        </p>
        <p className="links">
          <a href="https://github.com/drakmor/ShadowMountPlus">Repository</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/drakmor/ShadowMountPlus/blob/1.7/client">Client source</a>
        </p>
      </div>
    </div>
  );
}

function ToolRow(props: {
  toolId: ToolId;
  label: string;
  homepage: string;
  check?: { found: boolean; path?: string; version?: string };
  override: string;
  progress?: ToolProgress;
  busy?: boolean;
  error?: string;
  onOverride: (value: string) => void;
  onDownload: () => void;
}) {
  return (
    <div className="tool-row">
      <div className="tool-row-head">
        <StatusDot ok={Boolean(props.check?.found)} warn={Boolean(props.progress)} />
        <span className="tool-name">{props.label}</span>
        <span className="tool-detail mono">
          {props.check?.found ? (props.check.version ?? props.check.path) : 'not found'}
        </span>
        <button type="button" className="btn btn-small" disabled={props.busy} onClick={props.onDownload}>
          {props.busy ? 'Working…' : 'Download latest'}
        </button>
      </div>
      <PathField
        label="Path override"
        value={props.override}
        kind="file"
        dialogTitle={`Locate ${props.label}`}
        placeholder="optional — auto-detected when empty"
        onChange={props.onOverride}
      />
      {props.progress && (
        <div className="tool-progress">
          <div className="progress-track">
            {props.progress.total > 0 && (
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, (props.progress.received / props.progress.total) * 100)}%` }}
              />
            )}
          </div>
          <span className="field-hint">
            {props.progress.text}
            {props.progress.total > 0 &&
              ` — ${Math.round(props.progress.received / 1024 / 1024)} / ${Math.round(props.progress.total / 1024 / 1024)} MiB`}
          </span>
        </div>
      )}
      {props.error && <div className="field-hint error-text">{props.error}</div>}
      <div className="field-hint">
        Downloaded into the app data folder. Manual builds:{' '}
        <a href={props.homepage}>{props.homepage.replace('https://', '')}</a>
      </div>
    </div>
  );
}
