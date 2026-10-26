// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, FileReport, InspectResult, VerifyItem } from '../../../shared/types';
import { smp } from '../lib/api';
import { useVerifyQueue } from '../lib/verifyqueue';
import { Callout } from '../components/Callout';
import { PathField } from '../components/PathField';
import { StatusDot } from '../components/StatusDot';

const KIND_LABEL: Record<string, string> = {
  exfat: 'exFAT',
  ufs2: 'UFS2',
  ufs1: 'UFS1',
  pfs: 'PFS family',
  unknown: 'Unknown',
};

const STATUS_LABEL: Record<VerifyItem['status'], string> = {
  pending: 'Queued',
  running: 'Checking',
  done: 'Checked',
  failed: 'Unreadable',
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${bytes} B`;
}

/**
 * What "green" means depends on the kind: exFAT is fully validated from the
 * boot sector (cluster size + alignment), UFS2 from the superblock magic, and
 * PFS is only known from its extension — inspect it to be sure.
 */
function verdictOf(report: FileReport): { ok: boolean; warn: boolean; label: string } {
  if (report.detected === 'ufs2') {
    return report.extensionMatches
      ? { ok: true, warn: false, label: 'UFS2' }
      : { ok: false, warn: true, label: 'UFS2 · extension mismatch' };
  }
  if (report.detected === 'exfat') {
    const pass = report.clusterSize === 65536 && report.alignment64k && report.extensionMatches;
    return { ok: pass, warn: !pass, label: pass ? 'exFAT' : 'exFAT · check notes' };
  }
  if (report.detected === 'pfs') {
    return { ok: false, warn: true, label: 'PFS · inspect to confirm' };
  }
  return { ok: false, warn: true, label: 'Unknown content' };
}

export function VerifyView(props: { settings: AppSettings | null }) {
  const queue = useVerifyQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [singleFile, setSingleFile] = useState('');

  const items = queue.snapshot.items;
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  // Deselect cleanly when the row disappears from the list.
  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  const addFiles = async (paths: string[]) => {
    if (paths.length === 0) return;
    setAddError(null);
    try {
      const { skipped } = await queue.add(paths);
      if (skipped > 0) {
        setAddError(
          skipped === 1 ? 'One path was skipped (empty or already in the list).' : `${skipped} paths were skipped (empty or already in the list).`,
        );
      }
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    }
  };

  const addSingle = async () => {
    if (!singleFile) return;
    await addFiles([singleFile]);
    setSingleFile('');
  };

  const runInspect = async () => {
    if (!selected) return;
    setInspecting(true);
    setInspect(null);
    try {
      setInspect(await smp.verify.inspect(selected.path));
    } catch (error) {
      setInspect({ tool: 'mkpfs', output: error instanceof Error ? error.message : String(error) });
    } finally {
      setInspecting(false);
    }
  };

  const pickAndAdd = async () => {
    const picked = await smp.dialogs.pickFiles({
      title: 'Select images to verify',
      filters: [
        { name: 'ShadowMountPlus images', extensions: ['ffpkg', 'exfat', 'ffpfs', 'ffpfsc'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    await addFiles(picked);
  };

  const okCount = items.filter((item) => item.report && verdictOf(item.report).ok).length;
  const warnCount = items.filter((item) => item.report && !verdictOf(item.report).ok).length;
  const failedCount = items.filter((item) => item.status === 'failed').length;
  const busyCount = items.filter((item) => item.status === 'pending' || item.status === 'running').length;

  return (
    <div className="view">
      <div className="view-head">
        <h1>Verify images</h1>
        <p className="sub">Queue any number of images and check what each file actually contains before it reaches the console.</p>
      </div>

      <div className="card">
        <PathField
          label="Add an image"
          value={singleFile}
          kind="file"
          dialogTitle="Select an image to verify"
          filters={[
            { name: 'ShadowMountPlus images', extensions: ['ffpkg', 'exfat', 'ffpfs', 'ffpfsc'] },
            { name: 'All files', extensions: ['*'] },
          ]}
          placeholder="/images/PPSA12345.ffpkg"
          onChange={setSingleFile}
          hint="Reads the first 68 KiB (exFAT boot sector, UFS superblock) and cross-checks the extension."
        />
        <div className="run-row">
          <button type="button" className="btn" disabled={!singleFile} onClick={() => void addSingle()}>
            Add to queue
          </button>
          <button type="button" className="btn primary" onClick={() => void pickAndAdd()}>
            Pick multiple files…
          </button>
        </div>
        {addError && <Callout tone="warn">{addError}</Callout>}
      </div>

      {items.length > 0 && (
        <section className="card" aria-label="Verification queue">
          <div className="card-head-row">
            <h2>Verification queue</h2>
            <span className="queue-summary">
              {busyCount > 0 && <span className="queue-chip">{busyCount} left</span>}
              {okCount > 0 && <span className="queue-chip ok">{okCount} ok</span>}
              {warnCount > 0 && <span className="queue-chip bad">{warnCount} flagged</span>}
              {failedCount > 0 && <span className="queue-chip bad">{failedCount} unreadable</span>}
            </span>
            <button type="button" className="btn btn-small" onClick={queue.clear}>
              Clear list
            </button>
          </div>
          <ul className="queue-list verify-list">
            {items.map((item) => {
              const verdict = item.report ? verdictOf(item.report) : null;
              const active = item.id === selectedId;
              return (
                <li key={item.id} className={`queue-row status-${item.status}${active ? ' active' : ''}`}>
                  <span
                    className={`queue-dot q-${verdict ? (verdict.ok ? 'done' : 'failed') : item.status}`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    className="queue-title"
                    onClick={() => {
                      setSelectedId(item.id);
                      setInspect(null);
                    }}
                    title={item.path}
                  >
                    <span className="queue-name mono">{item.name}</span>
                    <span className="queue-meta">
                      {verdict
                        ? `${verdict.label} · ${formatBytes(item.report?.size ?? 0)}`
                        : item.error
                          ? item.error
                          : `${STATUS_LABEL[item.status]}${item.status === 'running' ? '…' : ''}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-small danger"
                    disabled={item.status === 'running'}
                    onClick={() => queue.remove(item.id)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="field-hint">
            Files are checked one after another the moment they are queued; click a row for the full report. Queued
            items can be removed, finished ones can be cleared away in one go.
          </p>
        </section>
      )}

      {selected?.report && (
        <div className="card">
          <div className="verify-head">
            <StatusDot
              ok={verdictOf(selected.report).ok && selected.report.extensionMatches}
              warn={verdictOf(selected.report).warn || !verdictOf(selected.report).ok}
            />
            <h2 className="verify-kind">{KIND_LABEL[selected.report.detected]}</h2>
            <span className="mono dim">{formatBytes(selected.report.size)}</span>
            {selected.report.clusterSize && (
              <span className="struct-badge">{selected.report.clusterSize / 1024} KiB clusters</span>
            )}
            <span className={`struct-badge${selected.report.alignment64k ? ' ok' : ' bad'}`}>
              {selected.report.alignment64k ? '64 KiB-aligned size' : 'size not 64 KiB-aligned'}
            </span>
            <button type="button" className="btn btn-small" disabled={inspecting} onClick={() => void runInspect()}>
              {inspecting ? 'Inspecting…' : 'Inspect with tool'}
            </button>
          </div>
          <ul className="notes-list">
            {selected.report.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
          {selected.report.extension && !selected.report.extensionMatches && (
            <Callout tone="warn" title="Extension mismatch">
              ShadowMountPlus decides how to attach an image from its extension. Rename the file to match the detected
              content, or rebuild it.
            </Callout>
          )}
        </div>
      )}

      {inspect && (
        <div className="card">
          <h2>{inspect.tool === 'mkpfs' ? 'MkPFS inspect' : 'UFS2Tool info'}</h2>
          <pre className="inspect-output">{inspect.output}</pre>
        </div>
      )}
    </div>
  );
}
