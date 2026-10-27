// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react';
import type { QueueItem, QueueSnapshot } from '../../../shared/types';

const FORMAT_LABEL: Record<string, string> = {
  ufs2: 'UFS2',
  exfat: 'exFAT',
  ffpfsc: 'PFS',
};

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  pending: 'Queued',
  running: 'Building',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function QueuePanel(props: {
  snapshot: QueueSnapshot;
  activeJobId: string | null;
  onSelectJob: (jobId: string) => void;
  onRemove: (itemId: string) => void;
  onClearPending: () => void;
}) {
  const { items } = props.snapshot;
  const anyRunning = items.some((item) => item.status === 'running');

  // One shared clock drives the elapsed labels of every running row; it only
  // ticks while something is building so idle queues cost no re-renders.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [anyRunning]);
  // Re-sync the clock when a build starts so the first second does not show a
  // stale timestamp captured while the queue was idle.
  useEffect(() => {
    if (anyRunning) setNow(Date.now());
  }, [anyRunning]);

  if (items.length === 0) return null;

  const pending = items.filter((item) => item.status === 'pending').length;
  const finished = items.filter((item) => item.status === 'done').length;
  const failed = items.filter((item) => item.status === 'failed' || item.status === 'cancelled').length;

  return (
    <section className="queue-panel" aria-label="Build queue">
      <header className="queue-head">
        <h2>Queue</h2>
        <span className="queue-summary">
          {pending > 0 && <span className="queue-chip">{pending} queued</span>}
          {finished > 0 && <span className="queue-chip ok">{finished} done</span>}
          {failed > 0 && <span className="queue-chip bad">{failed} failed</span>}
        </span>
        {pending > 0 && (
          <button type="button" className="btn btn-small" onClick={props.onClearPending}>
            Clear queued
          </button>
        )}
      </header>
      <ul className="queue-list">
        {items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            now={now}
            active={Boolean(item.jobId) && item.jobId === props.activeJobId}
            onSelectJob={props.onSelectJob}
            onRemove={props.onRemove}
          />
        ))}
      </ul>
      <p className="field-hint">
        Tools run hidden in the background; each row shows its own progress. Items build one at a time and the next
        image starts as soon as the current one finishes. Cancelling the current build skips to the next queued item —
        clear the queue first to stop everything.
      </p>
    </section>
  );
}

function QueueRow(props: {
  item: QueueItem;
  now: number;
  active: boolean;
  onSelectJob: (jobId: string) => void;
  onRemove: (itemId: string) => void;
}) {
  const { item, now } = props;
  const running = item.status === 'running';
  const progress = running ? item.progress : undefined;
  const percent = progress ? Math.min(100, Math.round((progress.step / Math.max(1, progress.total)) * 100)) : 0;
  const elapsed = item.startedAt ? (item.endedAt ?? now) - item.startedAt : undefined;

  return (
    <li className={`queue-row status-${item.status}${props.active ? ' active' : ''}`}>
      <span className={`queue-dot q-${item.status}`} aria-hidden="true" />
      <button
        type="button"
        className="queue-title"
        disabled={!item.jobId}
        onClick={() => item.jobId && props.onSelectJob(item.jobId)}
        title={item.jobId ? 'Show output' : 'Output appears once the build starts'}
      >
        <span className="queue-name mono">{item.outputName}</span>
        <span className="queue-meta">
          {FORMAT_LABEL[item.format] ?? item.format} · {STATUS_LABEL[item.status]}
          {item.note ? ` · ${item.note}` : ''}
        </span>
        {running && (
          <span className="queue-live" aria-hidden="true">
            <span className={`queue-progress${progress ? '' : ' indeterminate'}`}>
              <span className="queue-progress-fill" style={progress ? { width: `${percent}%` } : undefined} />
            </span>
            <span className="queue-step">
              <span className="queue-step-label">
                {progress ? `Step ${progress.step}/${progress.total} · ${progress.label}` : 'Preparing…'}
              </span>
              {elapsed !== undefined && <span className="queue-elapsed mono">{formatDuration(elapsed)}</span>}
            </span>
          </span>
        )}
      </button>
      {item.status === 'pending' && (
        <button type="button" className="btn btn-small danger" onClick={() => props.onRemove(item.id)}>
          Remove
        </button>
      )}
    </li>
  );
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
