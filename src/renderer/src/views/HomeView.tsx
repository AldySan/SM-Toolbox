// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppInfo, AppSettings, EnvReport, SetupSummary, ToolCheck, ToolEvent } from '../../../shared/types';
import { smp } from '../lib/api';
import { StatusDot } from '../components/StatusDot';

interface FormatReadiness {
  id: string;
  label: string;
  ext: string;
  ok: boolean;
  blockers: string[];
}

export function HomeView(props: {
  appInfo: AppInfo | null;
  settings: AppSettings | null;
  env: EnvReport | null;
  onNavigate: (id: string) => void;
  onRefreshEnv: () => void;
}) {
  const { appInfo, env } = props;
  const detecting = env === null;

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

  const formats = formatReadiness(env);
  const readyCount = formats.filter((format) => format.ok).length;
  const allReady = !detecting && readyCount === formats.length;

  return (
    <div className="view">
      <header className="home-hero">
        <div className="home-hero-main">
          <p className="home-eyebrow">
            {greeting()}
            {appInfo ? ` · ${appInfo.platform} · v${appInfo.version}` : ' · SM+ Toolbox'}
          </p>
          <h1>Turn game dumps into console-ready images.</h1>
          <p className="sub">
            Create UFS2, exFAT or compressed PFS images, verify them, and send the payload to your PS5 — without
            living in a terminal.
          </p>
        </div>
        <div className={`home-status${allReady ? ' ready' : detecting ? ' detecting' : ' incomplete'}`}>
          <span className="home-status-title">
            {detecting ? 'Detecting your setup…' : allReady ? 'Ready to build' : `${readyCount} of ${formats.length} formats ready`}
          </span>
          <span className="home-status-sub">
            {detecting
              ? 'Checking tools on this machine'
              : allReady
                ? 'Every image format this toolbox supports'
                : missingManaged
                  ? 'One click installs MkPFS and UFS2Tool'
                  : 'Finish the rest in Settings'}
          </span>
        </div>
      </header>

      <div className="home-actions">
        <ActionTile
          primary
          icon={<CreateTileIcon />}
          title="Create an image"
          desc="Package a game dump as .ffpkg, .exfat or .ffpfsc."
          onClick={() => props.onNavigate('create')}
        />
        <ActionTile
          icon={<VerifyTileIcon />}
          title="Verify a file"
          desc="Check image headers and structure before they reach the console."
          onClick={() => props.onNavigate('verify')}
        />
        <ActionTile
          icon={<SendTileIcon />}
          title="Send the payload"
          desc="Push the ShadowMountPlus payload to your PS5 over the network."
          onClick={() => props.onNavigate('send')}
        />
        <ActionTile
          icon={<GuideTileIcon />}
          title="Read the guide"
          desc="Formats, profiles and the whole workflow, explained in order."
          onClick={() => props.onNavigate('guide')}
        />
      </div>

      <section className="card">
        <div className="card-head-row">
          <h2>Build readiness</h2>
          <button type="button" className="btn btn-small" onClick={props.onRefreshEnv}>
            Recheck
          </button>
        </div>
        <div className="readiness-bar" aria-hidden="true">
          <span style={{ width: `${detecting ? 0 : (readyCount / formats.length) * 100}%` }} />
        </div>
        <ul className="format-list">
          {formats.map((format) => (
            <li key={format.id}>
              <StatusDot ok={format.ok} warn={detecting} />
              <span className="format-label">{format.label}</span>
              <span className="format-ext mono">{format.ext}</span>
              <span className={`format-note${format.ok && !detecting ? ' ok-text' : ' dim'}`}>
                {detecting
                  ? 'checking…'
                  : format.ok
                    ? 'ready'
                    : format.blockers.length > 0
                      ? `needs ${format.blockers.join(', ')}`
                      : 'not detected'}
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
            <span className="field-hint">Downloads MkPFS and UFS2Tool in one go.</span>
          </div>
        )}
        {!setupRunning && setupSummary && <SetupResult summary={setupSummary} />}
        {!detecting && !allReady && !missingManaged && (
          <p className="field-hint">
            The remaining pieces are system tools this toolbox cannot install for you —{' '}
            <a
              href=""
              onClick={(event) => {
                event.preventDefault();
                props.onNavigate('settings');
              }}
            >
              Settings
            </a>{' '}
            lists what is missing and how to install it. exFAT also relies on the builder scripts bundled with this app
            — Settings → Tools can fetch newer copies straight from the ShadowMountPlus repository.
          </p>
        )}
      </section>

      <section className="card">
        <h2>About</h2>
        <p className="dim">
          SM+ Toolbox wraps the ShadowMountPlus build workflow in a desktop app: create images from game dumps,
          verify them, send the payload to your console, and troubleshoot setups without a terminal. ShadowMountPlus
          is developed by Drakmor and contributors; this client is licensed GPL-3.0-or-later.
        </p>
        <p className="links">
          <a href="https://github.com/drakmor/ShadowMountPlus">Repository</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/drakmor/ShadowMountPlus#readme">Documentation</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/drakmor/ShadowMountPlus/releases">Releases</a>
        </p>
      </section>
    </div>
  );
}

function ActionTile(props: { icon: ReactNode; title: string; desc: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      className={`action-tile${props.primary ? ' primary' : ''}`}
      onClick={props.onClick}
    >
      <span className="tile-icon">{props.icon}</span>
      <span className="tile-text">
        <span className="tile-title">{props.title}</span>
        <span className="tile-desc">{props.desc}</span>
      </span>
    </button>
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

/** Per-format readiness: which image types can this machine actually build right now. */
function formatReadiness(env: EnvReport | null): FormatReadiness[] {
  const tools = env?.tools ?? [];
  const byId = new Map<string, ToolCheck>(tools.map((tool) => [tool.id, tool] as const));

  const ufs2Blockers = blockersFor(byId, ['ufs2tool']);
  // Python only shows up in the report when MkPFS itself is missing, so it is
  // listed as a blocker only when the report actually mentions it.
  const ffpfscBlockers = blockersFor(byId, byId.has('python') ? ['mkpfs', 'python'] : ['mkpfs']);
  const exfatBlockers = blockersFor(byId, exfatIds(env));

  return [
    { id: 'ufs2', label: 'UFS2 images', ext: '.ffpkg', ok: ufs2Blockers.length === 0, blockers: ufs2Blockers },
    { id: 'ffpfsc', label: 'Compressed PFS', ext: '.ffpfsc', ok: ffpfscBlockers.length === 0, blockers: ffpfscBlockers },
    { id: 'exfat', label: 'exFAT images', ext: '.exfat', ok: exfatBlockers.length === 0, blockers: exfatBlockers },
  ];
}

function blockersFor(byId: Map<string, ToolCheck>, ids: string[]): string[] {
  return ids
    .filter((id) => {
      const tool = byId.get(id);
      return !tool || !tool.found;
    })
    .map((id) => byId.get(id)?.label ?? id);
}

function exfatIds(env: EnvReport | null): string[] {
  if (!env || (!env.isLinux && !env.isWindows)) return ['builders'];
  if (env.isLinux) return ['builders', 'mkfs.exfat', 'mount.exfat-fuse', 'rsync'];
  return ['builders', 'osfmount', 'powershell'];
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function CreateTileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5.5v5M5.5 8h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function VerifyTileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.2l4.6 1.7v3.3c0 2.9-1.9 5.1-4.6 6.1-2.7-1-4.6-3.2-4.6-6.1V3.9L8 2.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5.9 8l1.5 1.5 2.8-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendTileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 8l12-5.5L9.5 14 8 9.5 2 8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function GuideTileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 2.5h7.5L13 5v8.5H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5.5 6.5h5M5.5 9h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
