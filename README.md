# SM+ Toolbox

Desktop companion for [ShadowMountPlus](https://github.com/drakmor/ShadowMountPlus). It wraps the image-building workflow documented by the payload in a small cross-platform app: build UFS2, exFAT and compressed PFS images from a game dump, check them before they reach the console, and push `shadowmountplus.elf` to a listener on the PS5.

Runs on Windows and Linux. There is nothing to configure beyond pointing it at your local ShadowMountPlus checkout and letting it fetch the two external tools it needs.

## Why a GUI

Everything here is already doable by hand — the repository ships `mkexfat.sh`, `New-OsfExfatImage.ps1` and instructions for UFS2Tool and MkPFS. In practice that means a terminal, an elevated PowerShell, remembering which inode density goes with which dump, and a hex editor when a `.ffpkg` turns out to be something else. The toolbox keeps the same commands (you can preview every one before it runs) but hides the bookkeeping: source validation, tool detection, extension checks, and a log you can copy when something goes wrong.

## Requirements

- A local clone of [ShadowMountPlus](https://github.com/drakmor/ShadowMountPlus) — the exFAT builders are executed from your checkout, so the client always uses your version of the scripts.
- **Windows:** [OSFMount](https://www.osforensics.com/tools/mount-disk-images.html) for exFAT images. UFS2Tool and MkPFS are fetched by the built-in tool manager (MkPFS additionally needs Python 3 — it ships as a wheel and runs through `python -m mkpfs`).
- **Linux:** `exfatprogs`, `exfat-fuse`, `fuse3` and `rsync` for exFAT images (`sudo apt-get install -y exfatprogs exfat-fuse fuse3 rsync` on Debian/Ubuntu). `pkexec` is used to raise the mount step through polkit when available; without it, privileged steps print the exact `sudo` command to run yourself.

Sources must be decrypted game dumps with `eboot.bin` and `sce_sys/param.json` at the root. The client checks this and refuses to build otherwise.

## Build

Node 22 or newer:

```sh
cd SM-Toolbox
npm install
npm start        # dev
npm test         # unit tests
npx electron-forge make   # distributables (zip, Windows installer, deb, rpm, AppImage)
```

## What the tabs do

- **Create image** — pick a format, point at the dump, choose the output. UFS2 uses the documented `newfs` profile (`-O 2 -b 65536 -f 65536 -m 0 -S 4096`) and picks the inode density from the file count. exFAT always ends up with 64 KiB clusters. Compressed PFS wraps a nested exFAT or PFS image in a `.ffpfsc` container via MkPFS.
- **Verify** — reads the image header and tells you what the file actually is, whether the extension matches (the payload dispatches on extension), and whether the exFAT geometry fits the fast path. Can run `ufs2tool info` / `mkpfs inspect` on demand.
- **Send payload** — downloads the latest `shadowmountplus.elf` and streams it to port 9021. For boot persistence use plk-autoloader's `autoload.txt` instead; the Guide tab has the sample.
- **Guide / Troubleshooting** — the parts of the main README you'll want while things are running, including the log locations on the console.

## Notes

- On Windows the exFAT step needs an elevated shell (OSFMount); the app raises a single UAC prompt per build.
- Downloads from the tool manager are anonymous GitHub release fetches. No credentials are involved.
- Settings live in `settings.json` under the OS user-data directory, next to the cached tools and payload.

Licensed GPL-3.0-or-later, like the rest of the project. The PlayStation 5 payload and its documentation are the source of truth for every command this app runs — when in doubt, read the main README.
