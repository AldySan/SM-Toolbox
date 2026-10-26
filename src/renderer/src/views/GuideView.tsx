// SPDX-License-Identifier: GPL-3.0-or-later
import { Callout } from '../components/Callout';

const SCAN_PATHS = [
  '/data/homebrew',
  '/data/etaHEN/games',
  '/mnt/ext0/homebrew',
  '/mnt/ext0/etaHEN/games',
  '/mnt/ext1/homebrew',
  '/mnt/ext1/etaHEN/games',
  '/mnt/usb0/homebrew … /mnt/usb7/homebrew',
  '/mnt/usb0/etaHEN/games … /mnt/usb7/etaHEN/games',
  '/mnt/usb0 … /mnt/usb7',
  '/mnt/ext0',
  '/mnt/ext1',
  '/mnt/shadowmnt/pfsc (mounted PFSC container scan)',
  '/mnt/shadowmnt (mounted image content scan)',
];

export function GuideView() {
  return (
    <div className="view">
      <div className="view-head">
        <h1>Installation and usage</h1>
        <p className="sub">Getting ShadowMountPlus onto the console and images into the right places.</p>
      </div>

      <div className="card">
        <h2>Requirements</h2>
        <ul className="steps plain-list">
          <li>A jailbroken PS5 on a supported firmware with Kstuff-lite v1.07 or newer (firmware 2.00 included).</li>
          <li>A payload listener on the console (browser exploit or an autoloaded listener) to receive shadowmountplus.elf.</li>
          <li>Game dumps either as folders with sce_sys/param.json, or as images (.ffpkg, .exfat, .ffpfs, .ffpfsc).</li>
        </ul>
      </div>

      <div className="card">
        <h2>Method 1 — send the payload once</h2>
        <p>
          Send <code>shadowmountplus.elf</code> to port <code>9021</code> with any payload sender. The Send tab in this
          app does exactly that: it downloads the latest release ELF and streams it to the console over your LAN. Wait
          for the <em>ShadowMount+</em> notification; the auto-mounter then runs in the background until the console
          reboots.
        </p>
      </div>

      <div className="card">
        <h2>Method 2 — PLK autoloader (recommended)</h2>
        <p>
          Add ShadowMountPlus to your <code>autoload.txt</code> for plk-autoloader so it starts on every boot:
        </p>
        <pre className="code-block">{`shadowmountplus.elf
!3000
kstuff.elf`}</pre>
        <p className="dim">
          The delay entry lets kstuff settle before ShadowMountPlus starts. The payload then survives reboots without
          re-sending anything.
        </p>
      </div>

      <div className="card">
        <h2>Where to put your games</h2>
        <p>Default scan locations — the payload watches all of these and mounts whatever it finds:</p>
        <ul className="mono-list">
          {SCAN_PATHS.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
        <p className="dim">
          Override them with <code>scanpath=...</code> entries in <code>/data/shadowmount/config.ini</code>; when set,
          only those paths are scanned. Recommended layouts under the defaults:
        </p>
        <pre className="code-block">{`# scan_depth=1 (default)
/data/homebrew/<TITLE_ID>/
/data/etaHEN/games/<TITLE_ID>/
/data/homebrew/backports/<TITLE_ID>/

# scan_depth=2 (one extra nested level)
/data/homebrew/PS5/<AnyFolder>/<TITLE_ID>/
/mnt/ext0/etaHEN/games/<Collection>/<TITLE_ID>/`}</pre>
      </div>

      <div className="card">
        <h2>Manual install list</h2>
        <p>
          Games that live outside the scan paths can be listed in <code>/data/shadowmount/manual.lst</code>, one source
          per line: a game folder path (with <code>sce_sys/param.json</code> inside) or a supported image file. Empty
          lines and <code>#</code> comments are ignored, and the file is watched — saving it triggers a rescan.
        </p>
        <pre className="code-block">{`/mnt/usb0/MyGames/PPSA12345
/mnt/usb0/images/PPSA54321.ffpkg
# /mnt/usb0/disabled/PPSA00000`}</pre>
      </div>

      <div className="card">
        <h2>Choosing an image format</h2>
        <dl className="kv">
          <dt>.ffpkg (UFS2)</dt>
          <dd>Recommended default for most games — best overall performance on internal storage.</dd>
          <dt>.exfat (exFAT)</dt>
          <dd>For titles that need external-drive-style compatibility. Always build with 64 KiB clusters.</dd>
          <dt>.ffpfsc (compressed PFS)</dt>
          <dd>Nested-image container using zLib. Roughly 150–250 MB/s throughput — fine for slower or archival games, risky for heavy streamers.</dd>
          <dt>.ffpfs (PFS)</dt>
          <dd>Experimental standalone PFS images.</dd>
        </dl>
        <Callout tone="info">
          The Create tab builds all of these with the documented profiles, and the Verify tab checks existing images
          before they reach the console.
        </Callout>
      </div>

      <div className="card">
        <h2>Runtime config</h2>
        <p>
          <code>/data/shadowmount/config.ini</code> is optional; it is created from the bundled example on first run.
          Commonly used keys:
        </p>
        <dl className="kv">
          <dt>debug</dt>
          <dd>1 enables debug logging to console plus /data/shadowmount/debug.log (default 1).</dd>
          <dt>quiet_mode</dt>
          <dd>1 suppresses plain informational popups while keeping rich toasts.</dd>
          <dt>language</dt>
          <dd>Notification locale, or auto to follow the console language.</dd>
          <dt>api_bind_address / api_port</dt>
          <dd>The built-in HTTP/JSON API listener (default 127.0.0.1:10101 — console-local only).</dd>
          <dt>persistent_image_mounts</dt>
          <dd>1 keeps discovered images mounted between game launches (default 0).</dd>
        </dl>
        <Callout tone="warn">
          The API has no authentication. Do not set api_bind_address=0.0.0.0 on an untrusted network.
        </Callout>
      </div>
    </div>
  );
}
