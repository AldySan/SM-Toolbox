# SM+ Toolbox

[![build](https://github.com/AldySan/SM-Toolbox/actions/workflows/build.yml/badge.svg?branch=dev)](https://github.com/AldySan/SM-Toolbox/actions/workflows/build.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-lightgrey.svg)](#installation)

A desktop companion for [ShadowMountPlus](https://github.com/drakmor/ShadowMountPlus), the PS5 homebrew enabler that mounts game images from external storage. The toolbox turns the repository's documented image-building workflow — normally a terminal, an elevated PowerShell, and a hex editor for the cases that go wrong — into one cross-platform app.

![Home view](docs/screenshots/home.png)

## What it does

- **Build images** from decrypted game dumps in the three formats ShadowMountPlus understands: UFS2 (`.ffpkg`), exFAT (`.exfat`), and compressed PFS containers (`.ffpfsc`)
- **Queue builds** — enqueue several images and they build one after another; the next starts the moment the current one finishes
- **Stay current** — on launch the toolbox quietly checks GitHub for a newer release (toggleable in Settings, with a manual check button) and links you to it
- **Verify images** before they reach the console: filesystem sniffing from magic bytes (exFAT boot sector, UFS superblock), extension cross-checks, and inspection through MkPFS / UFS2Tool
- **Send payloads** — download `shadowmountplus.elf` on demand and stream it to a payload listener on the console (TCP 9021)
- **Guide & troubleshoot** — the installation, usage and troubleshooting knowledge from the ShadowMountPlus README, searchable inside the app

![Verify view](docs/screenshots/verify.png)

Every command the app runs is previewed before it executes. Nothing is hidden: the terminal panel shows the exact tools, arguments and output for each step.

![Create view with command preview](docs/screenshots/create.png)

## Requirements

| | Windows | Linux |
|---|---|---|
| UFS2 images & verification | UFS2Tool — downloaded by the tool manager | UFS2Tool — downloaded by the tool manager |
| Compressed PFS images | Python 3 (runs the MkPFS wheel) | Python 3 (runs the MkPFS wheel) |
| exFAT images | [OSFMount](https://www.osforensics.com/tools/mount-disk-images.html) + administrator rights (UAC) | `exfatprogs`, `exfat-fuse`, `fuse3`, `rsync` + `pkexec`/polkit |
| Payload sending | — | — |

Two more things are needed regardless of platform: a local [ShadowMountPlus](https://github.com/drakmor/ShadowMountPlus) checkout (the exFAT builders ship with the repository and always run from your copy) and game sources with `eboot.bin` and `sce_sys/param.json` at the folder root — the app checks and refuses to build otherwise.

The built-in tool manager fetches UFS2Tool and MkPFS from their official releases ([SvenGDK/UFS2Tool](https://github.com/SvenGDK/UFS2Tool), [PSBrew/MkPFS](https://github.com/PSBrew/MkPFS)) with no account or credentials involved.

## Installation

Grab a build from [releases](https://github.com/AldySan/SM-Toolbox/releases):

- **Windows** — `SM-Toolbox-Setup.exe` (installer) or the portable `.zip` (extract and run `sm-toolbox.exe`)
- **Linux** — `.AppImage`, `.deb`, or `.rpm`

Or build from source below.

## Building from source

Node.js 22 or newer:

```sh
git clone https://github.com/AldySan/SM-Toolbox.git
cd SM-Toolbox
npm install

npm start                      # run in development
npm test                       # unit tests (vitest)
npm run typecheck              # strict TypeScript check
npx electron-forge package     # packaged app in out/
npx electron-forge make        # distributables (installer, zip, deb, rpm, AppImage)
```

A headless smoke test is built in: `./out/<platform>/sm-toolbox --smoke-test` boots the app, opens the window, and exits — the same check CI runs on every commit.

## Architecture

Electron app with a strict main/renderer split (`contextIsolation` on, `nodeIntegration` off, ASAR integrity enforced):

```
src/
├── main/               privileged process — owns the filesystem and the tools
│   ├── ipc.ts          IPC surface: settings, dialogs, env, queue, verify, send, updates
│   └── lib/
│       ├── recipes.ts  pure step builders for the three image formats
│       ├── runner.ts   sequential step runner: streaming, cancellation, elevation
│       ├── queue.ts    the build queue state machine
│       ├── env.ts      toolchain detection and resolution
│       ├── verifier.ts folder stats and magic-byte image detection
│       ├── toolmanager.ts  GitHub release downloads for UFS2Tool / MkPFS
│       ├── payload.ts  payload download (cached, atomically) and TCP transfer
│       ├── updater.ts  release check against the GitHub API
│       ├── version.ts  semantic-version comparison for the update check
│       └── settings.ts persisted app settings
├── preload/            the smp API bridge exposed to the renderer
├── renderer/           React app — views, queue panel, terminal dock
└── shared/             types and IPC channel names shared by all three
```

The image formats are built exactly as the ShadowMountPlus README documents them — same tool invocations, same fixed profiles (UFS2 `newfs -O 2 -b 65536 -f 65536 -m 0 -S 4096` with tiered inode density; exFAT with a fixed 64 KiB cluster; two-step `mkpfs pack folder` → `pack file` for containers). The builders are pure functions covered by unit tests; the runner adds streaming output, cancellation and privilege handling on top.

Privilege handling differs per platform: on Linux, privileged steps go through `pkexec`/polkit when available (or print the exact `sudo` command to run yourself); on Windows the exFAT builder is raised through a UAC prompt with its output tailed back into the terminal panel.

## Verification and safety

![Send payload view](docs/screenshots/send.png)

- Image detection reads the first 68 KiB and checks the actual filesystem signatures — an `.ffpkg` that is really an exFAT image is caught before it reaches the console
- exFAT images are validated against the documented profile: 64 KiB clusters and 64 KiB-aligned size
- The payload download is atomic (`.part` + rename) and validated against the ELF magic, so a truncated download can never be sent to the console
- Tool overrides in Settings are probed before use; stale paths fail with a clear message instead of a confusing spawn error

## Development notes

- Conventional commits; PRs target `dev` — `main` tracks releases
- CI (`.github/workflows/build.yml`) builds and smoke-tests on `ubuntu-latest` and `windows-latest` for every push and PR, and attaches Windows/Linux distributables to releases tagged `v*`
- Tests run with `npm test` (vitest): recipe builders, image detection, the queue state machine, and the version comparison behind the update check — no network, no Electron required

## Contributing

Issues and PRs are welcome. Keep changes focused; new tool integration should follow the existing `ToolInvocation` pattern (command, prefix, env, origin) so it composes with overrides, PATH detection and the tool manager.

## License

[GPL-3.0-or-later](LICENSE) — same license as ShadowMountPlus itself.

SM+ Toolbox is an independent companion app. It is not affiliated with Sony, and it builds on the work of the [ShadowMountPlus](https://github.com/drakmor/ShadowMountPlus) contributors, [SvenGDK's UFS2Tool](https://github.com/SvenGDK/UFS2Tool), and [PSBrew's MkPFS](https://github.com/PSBrew/MkPFS).
