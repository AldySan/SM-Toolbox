// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppInfo, AppSettings, BuildSpec, EnvReport, ThemeMode } from '../../shared/types';
import { smp } from './lib/api';
import { useJobs } from './lib/jobs';
import { Sidebar } from './components/Sidebar';
import { TerminalDock } from './components/Terminal';
import { HomeView } from './views/HomeView';
import { CreateView } from './views/CreateView';
import { VerifyView } from './views/VerifyView';
import { SendView } from './views/SendView';
import { GuideView } from './views/GuideView';
import { TroubleshootView } from './views/TroubleshootView';
import { SettingsView } from './views/SettingsView';

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

function navItems(): NavItem[] {
  return [
    { id: 'home', label: 'Home', icon: <HomeIcon /> },
    { id: 'create', label: 'Create image', icon: <CreateIcon /> },
    { id: 'verify', label: 'Verify', icon: <VerifyIcon /> },
    { id: 'send', label: 'Send payload', icon: <SendIcon /> },
    { id: 'guide', label: 'Guide', icon: <GuideIcon /> },
    { id: 'troubleshoot', label: 'Troubleshooting', icon: <WarnIcon /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  ];
}

export function App() {
  const [view, setView] = useState('home');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [env, setEnv] = useState<EnvReport | null>(null);
  const jobs = useJobs();

  const refreshEnv = useCallback(() => {
    void smp.env.detect().then(setEnv);
  }, []);

  useEffect(() => {
    void smp.settings.get().then(setSettings);
    void smp.appInfo().then(setAppInfo);
    refreshEnv();
  }, [refreshEnv]);

  useTheme(settings?.theme ?? 'auto');

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      // Optimistic update: PathField is a controlled input, so the visible
      // value must track each keystroke immediately instead of waiting for
      // the settings save to resolve. The persisted result reconciles the
      // state once the save completes.
      setSettings((current) => (current ? { ...current, ...patch } : current));
      void smp.settings.set(patch).then((next) => {
        setSettings(next);
        refreshEnv();
      });
    },
    [refreshEnv],
  );

  const startJob = useCallback(
    async (spec: BuildSpec) => {
      await jobs.start(spec);
    },
    [jobs],
  );

  return (
    <div className="app">
      <div className="app-main">
        <Sidebar
          items={navItems()}
          active={view}
          onSelect={setView}
          footer={<span>{appInfo ? `${appInfo.platform} · v${appInfo.version}` : ''}</span>}
        />
        <main className="content">
          {view === 'home' && (
            <HomeView appInfo={appInfo} settings={settings} env={env} onNavigate={setView} onRefreshEnv={refreshEnv} />
          )}
          {view === 'create' && <CreateView settings={settings} env={env} onStart={startJob} />}
          {view === 'verify' && <VerifyView settings={settings} />}
          {view === 'send' && <SendView settings={settings} onChange={updateSettings} />}
          {view === 'guide' && <GuideView />}
          {view === 'troubleshoot' && <TroubleshootView />}
          {view === 'settings' && (
            <SettingsView settings={settings} appInfo={appInfo} env={env} onChange={updateSettings} onRefreshEnv={refreshEnv} />
          )}
        </main>
      </div>
      <TerminalDock
        jobs={jobs.jobs}
        activeId={jobs.activeId}
        onSelect={jobs.setActiveId}
        onCancel={jobs.cancel}
      />
    </div>
  );
}

function useTheme(mode: ThemeMode) {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.dataset.theme = mode === 'auto' ? (media.matches ? 'dark' : 'light') : mode;
    };
    apply();
    if (mode === 'auto') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
  }, [mode]);
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 7.5 8 2.5l5.5 5v5.5a1 1 0 0 1-1 1H10v-4H6v4H3.5a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function CreateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5.5v5M5.5 8h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function VerifyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 8l12-5.5L9.5 14 8 9.5 2 8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function GuideIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 2.5h7.5L13 5v8.5H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5.5 6.5h5M5.5 9h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5l6 11H2l6-11z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 7v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.7" fill="currentColor" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4.5h6M11 4.5h3M2 11.5h3M8 11.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9.5" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5.5" cy="11.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
