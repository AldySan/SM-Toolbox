// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react';
import type { AppInfo, AppSettings, EnvReport, SetupSummary, ToolCheck, ToolEvent } from '../../../shared/types';
import { smp } from '../lib/api';
import { StatusDot } from '../components/StatusDot';

export function HomeView(props: {
  appInfo: AppInfo | null;
  settings: AppSettings | null;
  env: EnvReport | null;
  onNavigate: (id: string) => void;
  onRefreshEnv: () => void;
}) {
  const { appInfo, env } = props;
  const relevantTools = (env?.tools ?? []).filter((tool) => isRelevant(tool, env));

  // One-click setup: the download progress arrives as regular tool events,
  // so the status line follows whatever the setup is currently doing.
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupStatus, setSetupStatus] = useState<string | null>(null);
  const [setupSummary, setSetupSummary] = useState<SetupSummary | null>(null);

  useEffect(() => {
    const unsubscribe = smp.onToolEvent((event: ToolEvent) => {
      if (event.type === 'status') setSetupStatus(event.text);
    });
    return unsubscribe;
  }, []);

  const missingManaged = (env?.tools ?? []).some(
    (tool) => (tool.id === 'mkpfs' || tool.id === 'ufs2tool') && !tool.found,
  );

  const runSetup = () => {
    setSetupRunning(true);
    setSetupStatus(null);
    setSetupSummary(null);
    void smp.setup
      .run()
      .then((summary) => {
        setSetupSummary(summary);
        props.onRefreshEnv();
      })
      .catch(() => undefined)
      .finally(() => setSetupRunning(false));
  };

  return (
    <div className="view">
      <div className="view-head">
        <h1>SM+ Toolbox</h1>
        <p className="sub">Companion app for ShadowMountPlus, the background auto-mounter for jailbroken PS5 consoles.</p>
      </div>

      <div className="card-grid">
        <div className="card">
          <h2>Quick actions</h2>
          <div className="quick-actions">
            <button type="button" className="btn primary" onClick={() => props.onNavigate('create')}>
              Create an image
            </button>
            <button type="button" className="btn" onClick={() => props.onNavigate('settings')}>
              Manage tools
            </button>
          </div>
          <p className="dim">
            Build UFS2, exFAT or compressed PFS images from a game dump, with the exact profiles documented by
            ShadowMountPlus.
          </p>
        </div>

        <div className="card">
          <div className="card-head-row">
            <h2>Environment</h2>
            <button type="button" className="btn btn-small" onClick={props.onRefreshEnv}>
              Recheck
            </button>
          </div>
          <ul className="env-list">
            {relevantTools.map((tool) => (
              <li key={tool.id}>
                <StatusDot ok={tool.found} />
                <span className="env-label">{tool.label}</span>
                <span className="env-detail mono">
                  {tool.found ? (tool.version ?? tool.path ?? 'found') : (tool.detail ?? 'not found')}
                </span>
              </li>
            ))}
          </ul>
          {setupRunning && <p className="field-hint">{setupStatus ?? 'Preparing…'}</p>}
          {!setupRunning && missingManaged && !setupSummary && (
            <div className="setup-row">
              <button type="button" className="btn primary btn-small" onClick={runSetup}>
                Set up everything
              </button>
              <span className="field-hint">Downloads MkPFS and UFS2Tool in one go — everything else is listed above.</span>
            </div>
          )}
          {!setupRunning && setupSummary && <SetupResult summary={setupSummary} />}
          {env && env.tools.some((tool) => !tool.found) && (
            <p className="field-hint">
              Not everything is required: the checkout and exFAT tools matter only for exFAT images, MkPFS only for
              compressed PFS, UFS2Tool only for UFS2. Missing pieces with a fix note can be set up from{' '}
              <a
                href=""
                onClick={(event) => {
                  event.preventDefault();
                  props.onNavigate('settings');
                }}
              >
                Settings
              </a>
              .
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>About</h2>
        <p>
          SM+ Toolbox wraps the ShadowMountPlus build workflow in a desktop app: create UFS2, exFAT and compressed PFS
          images from game dumps, verify them, send the payload to your console, and troubleshoot setups without
          living in a terminal.
        </p>
        <p className="dim">
          ShadowMountPlus is developed by Drakmor and contributors. This client is licensed GPL-3.0-or-later.
        </p>
        <p className="links">
          <a href="https://github.com/drakmor/ShadowMountPlus">Repository</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/drakmor/ShadowMountPlus#readme">Documentation</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/drakmor/ShadowMountPlus/releases">Releases</a>
        </p>
        {appInfo && (
          <dl className="kv kv-slim">
            <dt>Toolbox</dt>
            <dd>v{appInfo.version}</dd>
            <dt>Platform</dt>
            <dd>
              {appInfo.platform} ({appInfo.arch})
            </dd>
            <dt>Electron</dt>
            <dd>{appInfo.electron}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

function SetupResult(props: { summary: SetupSummary }) {
  const { summary } = props;
  const names = (tools: string[]) => tools.map((tool) => (tool === 'mkpfs' ? 'MkPFS' : 'UFS2Tool')).join(', ');
  return (
    <div className="setup-result">
      {summary.installed.length > 0 && <p className="field-hint">Installed: {names(summary.installed)}</p>}
      {summary.updated.length > 0 && <p className="field-hint">Updated: {names(summary.updated)}</p>}
      {summary.failed.length === 0 ? (
        <p className="field-hint ok-text">Everything the toolbox can manage is in place.</p>
      ) : (
        summary.failed.map((failure) => (
          <p key={failure.tool} className="field-hint error-text">
            {failure.tool === 'mkpfs' ? 'MkPFS' : 'UFS2Tool'}: {failure.error}
          </p>
        ))
      )}
    </div>
  );
}

function isRelevant(tool: ToolCheck, env: EnvReport | null): boolean {
  if (!env) return ['mkpfs', 'ufs2tool', 'repo'].includes(tool.id);
  if (env.isLinux) return !['osfmount', 'powershell'].includes(tool.id);
  if (env.isWindows) return !['mkfs.exfat', 'mount.exfat-fuse', 'rsync'].includes(tool.id);
  return true;
}
