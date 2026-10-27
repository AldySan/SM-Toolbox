// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from 'react';
import type {
  AppSettings,
  BuildSpec,
  EnvReport,
  FolderStat,
  IconPrepResult,
  ImageFormat,
  InnerFormat,
  InodeDensity,
  JobStepPreview,
  QueueSnapshot,
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

interface PickedIcon {
  path: string;
  info: IconPrepResult;
}

export function CreateView(props: {
  settings: AppSettings | null;
  env: EnvReport | null;
  queue: QueueSnapshot;
  onEnqueue: (spec: BuildSpec) => Promise<void>;
  onChange: (patch: Partial<AppSettings>) => void;
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
  const [ps5Title, setPs5Title] = useState('');
  const [icon, setIcon] = useState<PickedIcon | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [iconBusy, setIconBusy] = useState(false);

  const isWindows = props.env?.isWindows ?? false;
  // Post-build options are write-through settings: they persist across
  // restarts and survive view switches without local state to reconcile.
  const autoVerify = props.settings?.createDefaults.autoVerify ?? true;
  const deleteSource = props.settings?.createDefaults.deleteSource ?? false;

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
    const trimmedTitle = ps5Title.trim();
    const appearance = trimmedTitle || icon ? { title: trimmedTitle || undefined, iconPath: icon?.path } : undefined;
    return {
      format,
      sourceDir,
      outputFile,
      innerFormat: format === 'ffpfsc' ? innerFormat : undefined,
      inodeDensity: format === 'ufs2' ? inodeDensity : undefined,
      label: format === 'exfat' && isWindows && label ? label : undefined,
      keepIntermediate: format === 'ffpfsc' ? keepIntermediate : undefined,
      autoVerify,
      deleteSourceAfterSuccess: deleteSource,
      ps5Appearance: appearance,
    };
  }, [format, sourceDir, outputFile, innerFormat, inodeDensity, label, keepIntermediate, isWindows, autoVerify, deleteSource, ps5Title, icon]);

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

  const pickIcon = async () => {
    setError(null);
    const picked = await smp.dialogs.pickFile({
      title: 'Choose an icon image (square PNG works best)',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'ico'] }],
    });
    if (!picked) return;
    setIconBusy(true);
    setIconError(null);
    try {
      const info = await smp.appearance.prepareIcon(picked);
      if (info.ok) {
        setIcon({ path: picked, info });
      } else {
        setIcon(null);
        setIconError(info.error ?? 'The icon could not be converted.');
      }
    } catch (failure) {
      setIcon(null);
      setIconError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setIconBusy(false);
    }
  };

  const iconDetail = (info: IconPrepResult): string => {
    const parts = [`${info.sourceFormat?.toUpperCase() ?? '?'} ${info.width}×${info.height}`];
    if (info.cropped) parts.push('center-cropped');
    parts.push(info.scaled ? 'scaled to 512×512' : 'already 512×512');
    parts.push(`${formatBytes(info.pngSize ?? 0)} PNG`);
    return parts.join(' · ');
  };

  const missingTool = (toolId: string): boolean =>
    Boolean(props.env && !props.env.tools.find((tool) => tool.id === toolId && tool.found));

  const blockers: string[] = [];
  if (format === 'ufs2' && missingTool('ufs2tool')) blockers.push('UFS2Tool is missing — download it from Settings, Tools.');
  if (format === 'ffpfsc' && missingTool('mkpfs')) blockers.push('MkPFS is missing — download it from Settings, Tools.');
  if ((format === 'exfat' || (format === 'ffpfsc' && innerFormat === 'exfat')) && props.env && !props.env.repoOk) {
    blockers.push('No exFAT builder script available — the bundled copy is missing. Reinstall the toolbox, or fetch the scripts from Settings → Tools.');
  }
  if (format === 'exfat' && isWindows && missingTool('osfmount')) {
    blockers.push('OSFMount is missing — install it from osforensics.com (needed by the Windows exFAT builder).');
  }
  if (folderStat?.exists && (!folderStat.ebootBin || !folderStat.paramJson)) {
    blockers.push('Source folder must contain eboot.bin and sce_sys/param.json at its root.');
  }
  if (sourceDir && outputFile && isInside(outputFile, sourceDir)) {
    blockers.push('The output image must live outside the source folder — pick a different output location.');
  }

  const run = async () => {
    if (!spec) return;
    setError(null);
    try {
      await props.onEnqueue(spec);
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

        <div className="field">
          <label>PS5 title &amp; icon (optional)</label>
          <div className="appearance-block">
            <div className="appearance-title-row">
              <input
                type="text"
                value={ps5Title}
                maxLength={128}
                placeholder={
                  folderStat?.paramInfo?.titleName
                    ? `Current title: ${folderStat.paramInfo.titleName}`
                    : 'Title shown on the PS5 home screen'
                }
                onChange={(event) => setPs5Title(event.target.value)}
              />
              <span className="field-hint">{ps5Title.length > 0 ? `${ps5Title.length}/128` : 'Leave empty to keep the current title'}</span>
            </div>
            <div className="appearance-icon-row">
              <button type="button" className="btn btn-small" disabled={iconBusy} onClick={() => void pickIcon()}>
                {iconBusy ? 'Converting…' : 'Choose icon…'}
              </button>
              {icon && (
                <>
                  <img className="icon-preview" src={icon.info.previewDataUrl} alt="Icon preview" />
                  <span className="field-hint">{iconDetail(icon.info)}</span>
                  <button type="button" className="btn btn-small" onClick={() => setIcon(null)}>
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="field-hint">
            Written into <span className="mono">sce_sys/param.json</span> (titleName) and{' '}
            <span className="mono">sce_sys/icon0.png</span> (512×512 PNG) inside the built image — the source folder is
            never modified. Non-square icons are center-cropped; the PS5 may need a restart or a reinstall before the
            home screen refreshes a changed icon.
          </div>
          {iconError && <Callout tone="warn">{iconError}</Callout>}
        </div>

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

        <div className="field">
          <label>After a successful build</label>
          <div className="postbuild-toggles">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={autoVerify}
                onChange={(event) =>
                  props.onChange({ createDefaults: { autoVerify: event.target.checked, deleteSource } })
                }
              />
              Verify the output image
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={deleteSource}
                onChange={(event) =>
                  props.onChange({ createDefaults: { autoVerify, deleteSource: event.target.checked } })
                }
              />
              Delete the source folder
            </label>
          </div>
          <div className="field-hint">
            Verification reads the finished image header and prints the report in the build output. Both options only
            run after every build step succeeded — a failed or cancelled build leaves the source folder untouched.
          </div>
          {deleteSource && (
            <Callout tone="warn" title="Source folder will be deleted">
              Once the image is built successfully, <span className="mono">{sourceDir || 'the source folder'}</span> is
              deleted permanently. Only enable this on dump copies you can afford to lose.
            </Callout>
          )}
        </div>

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
            Add to queue
          </button>
          {outputFile && <span className="field-hint mono">{outputFile}</span>}
        </div>
        {props.queue.items.length > 0 && (
          <div className="field-hint">
            {props.queue.items.some((item) => item.status === 'running')
              ? 'A build is running — this image starts right after it.'
              : `The queue holds ${props.queue.items.length} image${props.queue.items.length === 1 ? '' : 's'}; adding another keeps building one after another.`}
          </div>
        )}

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

/** True when `output` lands inside the `source` directory (both may be relative). */
function isInside(output: string, source: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const out = normalize(output);
  const src = normalize(source);
  return out === src || out.startsWith(`${src}/`);
}
