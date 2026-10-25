// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from 'react';
import type {
  AppSettings,
  BuildSpec,
  EnvReport,
  FolderStat,
  ImageFormat,
  InnerFormat,
  InodeDensity,
  JobStepPreview,
} from '../../../shared/types';
import { smp } from '../lib/api';
import { Callout } from '../components/Callout';
import { PathField } from '../components/PathField';
import { Segmented } from '../components/Segmented';
import { StatusDot } from '../components/StatusDot';

const FORMAT_INFO: Record<ImageFormat, { label: string; ext: string; blurb: string }> = {
  ufs2: {
    label: 'UFS2',
    ext: '.ffpkg',
    blurb: 'Recommended for most games. Built with UFS2Tool using the documented newfs profile.',
  },
  exfat: {
    label: 'exFAT',
    ext: '.exfat',
    blurb: 'For titles that need external-drive-style compatibility. Uses the repo builder with a fixed 64 KiB cluster.',
  },
  ffpfsc: {
    label: 'Compressed PFS',
    ext: '.ffpfsc',
    blurb: 'zLib-compressed container for nested images (~150-250 MB/s). Best suited to archival and slower games.',
  },
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${bytes} B`;
}

export function CreateView(props: {
  settings: AppSettings | null;
  env: EnvReport | null;
  onStart: (spec: BuildSpec) => Promise<void>;
}) {
  const [format, setFormat] = useState<ImageFormat>('ufs2');
  const [sourceDir, setSourceDir] = useState('');
  const [outputFile, setOutputFile] = useState('');
  const [innerFormat, setInnerFormat] = useState<InnerFormat>('exfat');
  const [inodeDensity, setInodeDensity] = useState<InodeDensity>('auto');
  const [label, setLabel] = useState('');
  const [keepIntermediate, setKeepIntermediate] = useState(false);
  const [folderStat, setFolderStat] = useState<FolderStat | null>(null);
  const [preview, setPreview] = useState<{ title: string; steps: JobStepPreview[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isWindows = props.env?.isWindows ?? false;

  useEffect(() => {
    let cancelled = false;
    if (!sourceDir) {
      setFolderStat(null);
      return;
    }
    const timer = setTimeout(() => {
      void smp.folders.stat(sourceDir).then((stat) => {
        if (!cancelled) setFolderStat(stat);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sourceDir]);

  const spec: BuildSpec | null = useMemo(() => {
    if (!sourceDir || !outputFile) return null;
    return {
      format,
      sourceDir,
      outputFile,
      innerFormat: format === 'ffpfsc' ? innerFormat : undefined,
      inodeDensity: format === 'ufs2' ? inodeDensity : undefined,
      label: format === 'exfat' && isWindows && label ? label : undefined,
      keepIntermediate: format === 'ffpfsc' ? keepIntermediate : undefined,
    };
  }, [format, sourceDir, outputFile, innerFormat, inodeDensity, label, keepIntermediate, isWindows]);

  useEffect(() => {
    if (!spec) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      smp.jobs
        .preview(spec)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [spec]);

  const suggestOutput = (titleId?: string) => {
    const ext = FORMAT_INFO[format].ext;
    const base = titleId ?? (folderStat?.paramInfo?.titleId ?? '');
    const dir = props.settings?.defaultOutDir ?? '';
    if (!base) return;
    const name = `${base}${ext}`;
    setOutputFile(dir ? joinPath(dir, name) : name);
  };

  const missingTool = (toolId: string): boolean =>
    Boolean(props.env && !props.env.tools.find((tool) => tool.id === toolId && tool.found));

  const blockers: string[] = [];
  if (format === 'ufs2' && missingTool('ufs2tool')) blockers.push('UFS2Tool is missing — download it from Settings, Tools.');
  if (format === 'ffpfsc' && missingTool('mkpfs')) blockers.push('MkPFS is missing — download it from Settings, Tools.');
  if ((format === 'exfat' || (format === 'ffpfsc' && innerFormat === 'exfat')) && props.env && !props.env.repoOk) {
    blockers.push('ShadowMountPlus repository path is not set or invalid — configure it in Settings.');
  }
  if (format === 'exfat' && isWindows && missingTool('osfmount')) {
    blockers.push('OSFMount is missing — install it from osforensics.com (needed by the Windows exFAT builder).');
  }
  if (folderStat?.exists && (!folderStat.ebootBin || !folderStat.paramJson)) {
    blockers.push('Source folder must contain eboot.bin and sce_sys/param.json at its root.');
  }

  const run = async () => {
    if (!spec) return;
    setError(null);
    try {
      await props.onStart(spec);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <div className="view">
      <div className="view-head">
        <h1>Create image</h1>
        <p className="sub">Turn a decrypted game dump folder into a ShadowMountPlus-ready image.</p>
      </div>

      <div className="card">
        <div className="field">
          <label>Format</label>
          <Segmented<ImageFormat>
            value={format}
            options={[
              { value: 'ufs2', label: 'UFS2 (.ffpkg)' },
              { value: 'exfat', label: 'exFAT (.exfat)' },
              { value: 'ffpfsc', label: 'Compressed PFS (.ffpfsc)' },
            ]}
            onChange={setFormat}
            ariaLabel="Image format"
          />
          <div className="field-hint">{FORMAT_INFO[format].blurb}</div>
        </div>

        <PathField
          label="Game source folder"
          value={sourceDir}
          kind="folder"
          dialogTitle="Select the game root folder (contains eboot.bin)"
          placeholder="/games/PPSA12345-app"
          onChange={setSourceDir}
          hint="The folder root must contain eboot.bin and sce_sys/param.json."
        />

        {folderStat?.exists && (
          <div className="struct-row">
            <span className={`struct-badge${folderStat.ebootBin ? ' ok' : ' bad'}`}>
              <StatusDot ok={folderStat.ebootBin} /> eboot.bin
            </span>
            <span className={`struct-badge${folderStat.paramJson ? ' ok' : ' bad'}`}>
              <StatusDot ok={folderStat.paramJson} /> sce_sys/param.json
            </span>
            <span className="struct-badge">
              {folderStat.fileCount.toLocaleString()} files · {formatBytes(folderStat.totalBytes)}
            </span>
            {folderStat.paramInfo?.titleId && <span className="struct-badge accent">{folderStat.paramInfo.titleId}</span>}
          </div>
        )}

        <PathField
          label={`Output image (${FORMAT_INFO[format].ext})`}
          value={outputFile}
          kind="save"
          dialogTitle="Choose output image location"
          defaultName={`image${FORMAT_INFO[format].ext}`}
          filters={[{ name: 'Image', extensions: [FORMAT_INFO[format].ext.slice(1)] }]}
          placeholder={`PPSA12345${FORMAT_INFO[format].ext}`}
          onChange={setOutputFile}
        />
        {folderStat?.paramInfo?.titleId && (
          <div className="field-hint">
            <button type="button" className="btn btn-small" onClick={() => suggestOutput()}>
              Use title ID as file name
            </button>
          </div>
        )}

        {format === 'ufs2' && (
          <div className="field">
            <label>Inode density</label>
            <select value={inodeDensity} onChange={(event) => setInodeDensity(event.target.value as InodeDensity)}>
              <option value="auto">Auto (based on file count)</option>
              <option value="262144">262144 — normal dumps</option>
              <option value="131072">131072 — tens of thousands of files</option>
              <option value="65536">65536 — very file-dense images</option>
            </select>
            <div className="field-hint">Bytes per inode for the fixed UFS2 profile (-b 65536 -f 65536 -m 0 -S 4096).</div>
          </div>
        )}

        {format === 'exfat' && isWindows && (
          <div className="field">
            <label>Volume label (optional)</label>
            <input type="text" value={label} maxLength={11} placeholder="OSFIMG" onChange={(event) => setLabel(event.target.value)} />
          </div>
        )}

        {format === 'ffpfsc' && (
          <>
            <div className="field">
              <label>Nested image</label>
              <Segmented<InnerFormat>
                value={innerFormat}
                options={[
                  { value: 'exfat', label: 'exFAT image' },
                  { value: 'pfs', label: 'Uncompressed PFS' },
                ]}
                onChange={setInnerFormat}
                ariaLabel="Nested image format"
              />
              <div className="field-hint">
                The container wraps a nested image; the intermediate file is removed after packing unless you keep it.
              </div>
            </div>
            <div className="field checkbox-field">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={keepIntermediate}
                  onChange={(event) => setKeepIntermediate(event.target.checked)}
                />
                Keep the intermediate nested image
              </label>
            </div>
          </>
        )}

        {props.env?.isLinux && (format === 'exfat' || (format === 'ffpfsc' && innerFormat === 'exfat')) && (
          <Callout tone="info" title="Privileges">
            The exFAT builder mounts a loop device, which requires root. When pkexec is available the toolbox raises the
            step through polkit; otherwise run the printed command with sudo.
          </Callout>
        )}
        {isWindows && (format === 'exfat' || (format === 'ffpfsc' && innerFormat === 'exfat')) && (
          <Callout tone="info" title="Administrator rights">
            The Windows exFAT builder uses OSFMount and must run elevated; a UAC prompt appears when the build starts.
          </Callout>
        )}

        <div className="run-row">
          <button type="button" className="btn primary" disabled={!spec || blockers.length > 0} onClick={() => void run()}>
            Build image
          </button>
          {outputFile && <span className="field-hint mono">{outputFile}</span>}
        </div>

        {blockers.map((blocker) => (
          <Callout key={blocker} tone="warn">
            {blocker}
          </Callout>
        ))}
        {error && <Callout tone="error">{error}</Callout>}
      </div>

      {preview && preview.steps.length > 0 && (
        <div className="card">
          <h2>Command preview</h2>
          <div className="cmd-steps">
            {preview.steps.map((step, index) => (
              <div key={index} className="cmd-step">
                <div className="cmd-step-desc">
                  {step.description}
                  {step.privileged && <span className="badge">elevated</span>}
                </div>
                <code>{step.command}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') || dir.endsWith('\\') ? dir + name : `${dir}/${name}`;
}
