// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react';
import type { AppSettings, FileReport, InspectResult } from '../../../shared/types';
import { smp } from '../lib/api';
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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${bytes} B`;
}

export function VerifyView(props: { settings: AppSettings | null }) {
  const [file, setFile] = useState('');
  const [report, setReport] = useState<FileReport | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!file) {
      setReport(null);
      setInspect(null);
      return;
    }
    const timer = setTimeout(() => {
      void smp.verify.file(file).then((result) => {
        if (!cancelled) setReport(result);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [file]);

  const runInspect = async () => {
    if (!file) return;
    setInspecting(true);
    setInspect(null);
    try {
      setInspect(await smp.verify.inspect(file));
    } finally {
      setInspecting(false);
    }
  };

  const ok =
    report &&
    report.detected !== 'unknown' &&
    report.extensionMatches &&
    report.alignment64k &&
    report.clusterSize === 65536;

  return (
    <div className="view">
      <div className="view-head">
        <h1>Verify image</h1>
        <p className="sub">Check what a file actually contains before moving it to your console.</p>
      </div>

      <div className="card">
        <PathField
          label="Image file"
          value={file}
          kind="file"
          dialogTitle="Select an image to verify"
          filters={[
            { name: 'ShadowMountPlus images', extensions: ['ffpkg', 'exfat', 'ffpfs', 'ffpfsc'] },
            { name: 'All files', extensions: ['*'] },
          ]}
          placeholder="/images/PPSA12345.ffpkg"
          onChange={setFile}
          hint="Reads the first 68 KiB (exFAT boot sector, UFS superblock) and cross-checks the extension."
        />
      </div>

      {report && (
        <div className="card">
          <div className="verify-head">
            <StatusDot ok={Boolean(ok)} warn={report.detected === 'unknown' || !report.extensionMatches} />
            <h2 className="verify-kind">{KIND_LABEL[report.detected]}</h2>
            <span className="mono dim">{formatBytes(report.size)}</span>
            {report.clusterSize && (
              <span className="struct-badge">{report.clusterSize / 1024} KiB clusters</span>
            )}
            <span className={`struct-badge${report.alignment64k ? ' ok' : ' bad'}`}>
              {report.alignment64k ? '64 KiB-aligned size' : 'size not 64 KiB-aligned'}
            </span>
            <button type="button" className="btn btn-small" disabled={!file || inspecting} onClick={() => void runInspect()}>
              {inspecting ? 'Inspecting…' : 'Inspect with tool'}
            </button>
          </div>
          <ul className="notes-list">
            {report.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
          {report.extension && !report.extensionMatches && (
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
