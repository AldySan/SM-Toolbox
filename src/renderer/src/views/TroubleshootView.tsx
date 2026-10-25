// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import { Callout } from '../components/Callout';

interface Section {
  id: string;
  title: string;
  symptoms: string;
  steps: string[];
}

const SECTIONS: Section[] = [
  {
    id: 'not-mounted',
    title: 'A game is not mounted',
    symptoms: 'The image sits in a scan path but never shows up on the console.',
    steps: [
      'Enable debug logging if it is off: set debug=1 in /data/shadowmount/config.ini. The log lives at /data/shadowmount/debug.log and mirrors to system notifications.',
      'Confirm the image is inside a scan root (/data/homebrew, /data/etaHEN/games, /mnt/ext0, /mnt/usb0..7, or a scanpath= override). Remember that scanpath= entries replace the defaults entirely.',
      'Check scan depth: scan_depth=1 only scans first-level subfolders; use scan_depth=2 for one extra nested level (recursive_scan=1 is the deprecated spelling of the same thing).',
      'Check the source layout. Folder games need <GAME_DIR>/sce_sys/param.json. Image games (.ffpkg, .exfat, .ffpfs) need sce_sys/param.json at the image root — no extra top-level folder inside the image.',
      'For .ffpfsc containers: only nested supported image files are scanned; game files dropped directly into the container are ignored.',
      'If the log shows source not stable yet, the source was still being written. Wait for the copy to finish or raise stability_wait_seconds.',
      'If you see missing/invalid param.json for an image, check over FTP that the mounted content under /mnt/shadowmnt/<image_name>_<hash>/ includes sce_sys/param.json.',
    ],
  },
  {
    id: 'mount-fails',
    title: 'Image mount failure',
    symptoms: 'A notification reports the mount itself failed.',
    steps: [
      'Match the extension to the real content: .ffpkg = UFS2, .exfat = exFAT, .ffpfs = PFS, .ffpfsc = PFS container. The Verify tab checks this for you from the file header.',
      'Re-verify the image integrity on the PC side (UFS2Tool info for .ffpkg, MkPFS inspect for .ffpfsc).',
      'exFAT images must be built with a 64 KiB cluster size — smaller clusters break the LVD profile and hurt performance.',
      'Corrupted or truncated transfers are common with FTP: compare file sizes between the PC and the console.',
    ],
  },
  {
    id: 'registered-but-no-start',
    title: 'Game is mounted but does not start',
    symptoms: 'The icon is there, launching returns to the home screen.',
    steps: [
      'Look for Register failed ... notifications — the game did not register into the system library.',
      'Try removing the launcher icon and removing the entry from Itemzflow, then let the scanner re-register it.',
      'If that does not help, remove the game data from system settings and retry. This deletes the game saves — back them up first.',
    ],
  },
  {
    id: 'duplicates',
    title: 'Duplicate title ID notifications',
    symptoms: 'The console reports the same title twice.',
    steps: [
      'Keep exactly one source per <TITLE_ID>. Two images (or an image plus a folder) with the same title confuse registration.',
      'Remember manual.lst entries also count as sources — comment out or remove lines you no longer need (lines starting with # are ignored).',
    ],
  },
  {
    id: 'slow-first-scan',
    title: 'First scan is slow',
    symptoms: 'Nothing appears right after boot or after installing the payload.',
    steps: [
      'Large libraries take a few seconds to register on first run; very large games (100 GB+) need extra time for integrity verification before the Installed notification.',
      'Keep the number of images sane: the reusable image index supports up to 8,192 games across 2,048 images.',
    ],
  },
  {
    id: 'rest-mode',
    title: 'Library problems after rest mode',
    symptoms: 'Games vanish or USB sources drop out after wake-up.',
    steps: [
      'USB library recovery after rest mode was reworked in 1.7 — make sure you run a current payload build.',
      'Optional removal of unavailable games waits and cancels if the source returns; games with installed DLC are protected unless auto_remove_games_with_dlc=1 is set.',
    ],
  },
];

export function TroubleshootView() {
  const [open, setOpen] = useState<string>(SECTIONS[0].id);

  return (
    <div className="view">
      <div className="view-head">
        <h1>Troubleshooting</h1>
        <p className="sub">Field guide for the failure modes the ShadowMountPlus README documents.</p>
      </div>

      <Callout tone="warn" title="Read this first">
        Mounting images can cause shutdown problems and data corruption on internal drives. This depends on many
        factors and is more common on older firmware versions — keep backups of important data and config before
        experimenting.
      </Callout>

      <div className="trouble-list">
        {SECTIONS.map((section) => {
          const expanded = open === section.id;
          return (
            <div key={section.id} className="card trouble-card">
              <button
                type="button"
                className="trouble-head"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? '' : section.id)}
              >
                <span className="trouble-title">{section.title}</span>
                <span className="trouble-chevron">{expanded ? '−' : '+'}</span>
              </button>
              {expanded && (
                <div className="trouble-body">
                  <p className="dim">{section.symptoms}</p>
                  <ol className="steps plain-list numbered">
                    {section.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2>Where the logs live</h2>
        <dl className="kv">
          <dt>Debug log</dt>
          <dd>/data/shadowmount/debug.log</dd>
          <dt>Runtime config</dt>
          <dd>/data/shadowmount/config.ini</dd>
          <dt>Manual install list</dt>
          <dd>/data/shadowmount/manual.lst</dd>
          <dt>Manual install state</dt>
          <dd>/data/shadowmount/manual.status</dd>
          <dt>Mounted image content</dt>
          <dd>/mnt/shadowmnt/</dd>
          <dt>Mounted PFSC containers</dt>
          <dd>/mnt/shadowmnt/pfsc</dd>
        </dl>
        <p className="dim">
          Debug logging is enabled by default (debug=1). Notifications from ShadowMount+ mirror the important log
          lines, so watch for toasts while reproducing an issue.
        </p>
      </div>
    </div>
  );
}
