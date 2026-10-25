// SPDX-License-Identifier: GPL-3.0-or-later
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
            active={Boolean(item.jobId) && item.jobId === props.activeJobId}
            onSelectJob={props.onSelectJob}
            onRemove={props.onRemove}
          />
        ))}
      </ul>
      <p className="field-hint">
        Items build one at a time; the next image starts as soon as the current one finishes. Cancelling the
        current build skips to the next queued item — clear the queue first to stop everything.
      </p>
    </section>
  );
}

function QueueRow(props: {
  item: QueueItem;
  active: boolean;
  onSelectJob: (jobId: string) => void;
  onRemove: (itemId: string) => void;
}) {
  const { item } = props;
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
      </button>
      {item.status === 'pending' && (
        <button type="button" className="btn btn-small danger" onClick={() => props.onRemove(item.id)}>
          Remove
        </button>
      )}
    </li>
  );
}
