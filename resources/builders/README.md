# Bundled exFAT builder scripts

These are unmodified copies of the exFAT image builder scripts from the
[ShadowMountPlus](https://github.com/drakmor/ShadowMountPlus) repository
(GPL-3.0, Copyright (C) ShadowMountPlus contributors), vendored so the
toolbox can build exFAT-based images without a local checkout.

- `mkexfat.sh` — Linux builder (needs `mkfs.exfat`, `mount.exfat-fuse`,
  `rsync`, `truncate`, `find`, `awk`).
- `New-OsfExfatImage.ps1` — Windows builder (needs OSFMount and PowerShell).

Pinned upstream commit: see `.upstream-sha`.

A copy fetched through Settings → Tools ("Fetch latest") overrides these
bundled files — the toolbox downloads just the two scripts from the
ShadowMountPlus repository, never a full checkout. "Use bundled" removes
the fetched copy again.
