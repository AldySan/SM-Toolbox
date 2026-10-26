// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JobState } from '../lib/jobs';
import { smp } from '../lib/api';

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

function displayLines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => {
      const parts = line.split('\r');
      return parts[parts.length - 1];
    })
    .slice(-2000);
}

function lineClass(line: string): string {
  if (line.startsWith('──')) return 't-line t-rule';
  if (line.startsWith('$ ')) return 't-line t-cmd';
  return 't-line';
}

export function TerminalDock(props: {
  jobs: JobState[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);

  const active = props.jobs.find((job) => job.id === props.activeId) ?? props.jobs[0] ?? null;
  const running = props.jobs.some((job) => job.status === 'running');

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const lines = useMemo(() => (active ? displayLines(active.output) : []), [active?.output]);

  useEffect(() => {
    if (!collapsed && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, collapsed, tick]);

  if (!active) return null;

  const statusLabel =
    active.status === 'running'
      ? `Running · ${active.currentStep}/${active.totalSteps}`
      : active.status === 'success'
        ? 'Done'
        : active.status === 'cancelled'
          ? 'Cancelled'
          : `Failed (${active.exitCode ?? '?'})`;

  return (
    <section className={`terminal${collapsed ? ' collapsed' : ''}`}>
      <header className="terminal-head">
        <button type="button" className="terminal-toggle" onClick={() => setCollapsed((value) => !value)} aria-label="Toggle output panel">
          {collapsed ? '▲' : '▼'}
        </button>
        {props.jobs.length > 1 ? (
          <select
            className="terminal-select"
            value={active.id}
            onChange={(event) => props.onSelect(event.target.value)}
            aria-label="Active job"
          >
            {props.jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        ) : (
          <span className="terminal-title">{active.title}</span>
        )}
        <span className={`terminal-status status-${active.status}`}>{statusLabel}</span>
        <span className="terminal-time">
          {formatElapsed((active.endedAt ?? Date.now()) - active.startedAt)}
          <span className="sr-only">{tick}</span>
        </span>
        <span className="terminal-actions">
          <button type="button" className="btn btn-small" onClick={() => void smp.clipboard.writeText(active.output)}>
            Copy log
          </button>
          {active.status === 'running' && (
            <button type="button" className="btn btn-small danger" onClick={() => props.onCancel(active.id)}>
              Cancel
            </button>
          )}
        </span>
      </header>
      {!collapsed && (
        <div className="terminal-body" ref={bodyRef}>
          {lines.map((line, index) => (
            <div key={index} className={lineClass(line)}>
              {line || '\u00a0'}
            </div>
          ))}
          {active.note && <div className="t-line t-note">{active.note}</div>}
        </div>
      )}
    </section>
  );
}
