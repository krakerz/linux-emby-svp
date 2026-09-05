# Emby-Interpolation

Real motion-interpolated video playback (e.g. 24fps -> 120fps, genuine new
in-between frames, not judder/display-sync correction) for Emby's Linux
desktop client, using [SVP4](https://www.svp-team.com/) — the same effect
SVP gives mpv/MPC-HC on Windows.

Emby's built-in "Enable interpolation" setting is judder correction only. This
does the real thing by swapping Emby's bundled `libmpv.so` for SVP's own
VapourSynth-enabled mpv build, and getting SVP Manager to attach to it over
its usual JSON IPC socket -- exactly like it attaches to any other mpv
instance on your system.

## Prerequisites

- **SVP4** installed and working normally with some other mpv setup (this
  reuses its bundled `mpv/` and `python/` directories directly). Default
  expected location: `~/SVP4`.
- **Emby's Linux desktop beta client** (`media.emby.client.beta`). Default
  expected location: `/opt/Emby-Beta`.
- `gcc`, `sudo`, `libshaderc_shared.so.1` (usually already present via your
  Vulkan/mesa stack).
- SVP Manager running in the background as usual, watching for mpv instances.

If your paths differ, override them as environment variables (see
`config.sh` for the full list) -- e.g.:

```sh
EMBY_DIR=/opt/MyEmby SVP_DIR=/opt/SVP4 sh install.sh
```

## Install

```sh
sh install.sh
```

This will (in order):
1. Compile `shim.c` into `emby_svp_shim.so`.
2. Swap Emby's bundled `libmpv.so` for SVP's build, and put the few
   dependencies it needs (VapourSynth, Python) alongside it (see "How it
   works" below for why).
3. Patch Emby's launcher wrapper script to load the shim and set up Python's
   environment correctly.

You'll be prompted for your `sudo` password (Emby's install dir is
root-owned). Fully close Emby and relaunch it afterwards.

## Uninstall

```sh
sh uninstall.sh
```

Restores Emby's original wrapper script and `libmpv.so` from the backups
`install.sh` made.

## After an Emby update

Emby self-updates can silently overwrite `libmpv.so` and the wrapper script.
Just re-run:

```sh
sh install.sh
```

Every step compares checksums/content against what's currently installed, so
it's always safe to re-run -- it'll refresh the backup from the new original
if needed and reapply the patch, without ever backing up its own
already-patched files as if they were "original".

## Known limitations

- **Video renders in a separate top-level window**, not truly embedded into
  Emby's own UI. Emby normally embeds mpv into its window via an X11
  window-handle (`wid`); the only `GPU Context` setting that reliably renders
  video on this setup is Vulkan **Wayland**, and Wayland has no equivalent
  foreign-window embedding. (Vulkan **X11** was also tried, since XWayland is
  available -- it fails with `VK_ERROR_INITIALIZATION_FAILED` and an X11
  `BadLength` protocol error creating the swapchain against Emby's own embed
  window, seemingly from how that window is constructed on Emby's side; not
  something fixable from here.)

  On KDE Plasma 6, `install.sh` installs a KWin script
  (`kwin-embed-emby/`, see `install-kwin-embed.sh`/`uninstall-kwin-embed.sh`
  to manage separately) that makes this look reasonably embedded: it strips
  the video window's decorations and keeps it stacked below Emby's main
  window, so Emby's own on-screen controls stay visible on top of it.

  Several fancier versions of this script were tried and rolled back --
  matching the video window's geometry live to Emby's own window (or to
  Emby's video-placeholder window), and only stripping decorations while
  Emby is fullscreen/maximized rather than unconditionally. Both looked
  better in principle but caused real regressions in practice (mpv fighting
  the forced geometry when SVP's filter engages -- see the
  `keepaspect-window` note below -- and a window re-detection race after
  Emby restarts breaking tracking silently). The current version is
  deliberately the simplest one that was tried, because it was also the
  most reliable one: no geometry matching at all, decorations always off.
  This does mean the video window's actual size/position is whatever mpv
  itself chooses, not necessarily matching Emby's window, and it stays
  borderless even when Emby is windowed rather than fullscreen. This is KDE
  Plasma 6 (KWin scripting) specific; on other desktops/DEs the video just
  plays in its own plain floating window.
- Only tested with H.265/HEVC content at 23.976fps -> 119.88fps
  (SVP's `x5` "Automatic" profile). Other framerates/profiles should work
  through the same mechanism but haven't been exercised.

## How it works

- Emby's Linux client doesn't play video via HTML5 -- `Emby.MpvPlayer.dll`
  P/Invokes the bundled `libmpv.so` directly and renders into its own
  X11-connected window, separate from Chromium/Electron's own UI overlay.
- SVP Manager doesn't need any special integration on Emby's part: it just
  connects to any mpv's `--input-ipc-server` JSON socket and injects a
  VapourSynth interpolation filter live, at runtime.
- SVP4 already ships a complete VapourSynth-enabled `libmpv.so.2` build
  (`~/SVP4/mpv/`), API-compatible with Emby's bundled one -- so instead of
  building mpv from scratch, we drop that in.
- Emby's own config/mpv.conf mechanism doesn't apply here (it doesn't read
  one), and Emby creates several short-lived "probe" mpv instances per
  session in addition to the one real playback instance, so the IPC socket
  can't just be forced on unconditionally at startup. `shim.c`'s comments
  document the two problems this ran into and how each was solved
  (`dlsym()` interception to get around .NET's P/Invoke symbol resolution,
  and detecting the real playback instance via the `loadfile` command rather
  than any embedding-related signal).
- The embedded Python interpreter (needed for VapourSynth's scripting) has
  its own set of gotchas getting a stdlib and C-extension symbols visible
  from inside Emby's process; see the comments in `patch-libmpv.sh` and
  `patch-wrapper.sh` for details (the `._pth` sidecar mechanism, and why
  `libpython` needs to be `LD_PRELOAD`ed rather than just `dlopen`ed).
- mpv's `keepaspect-window` (on by default) makes it actively resize its own
  window to match the video's aspect ratio whenever the filter chain
  reconfigures -- which SVP's VapourSynth filter does the moment it engages.
  An earlier version of the KWin embed script tried to hold the video
  window to a specific geometry, and this fought that (both sides kept
  resizing the window back, forever, visibly breaking the video's scaling).
  `shim.c` disables it via the same IPC property call it already makes for
  `input-ipc-server` -- left in place even after the geometry-matching it
  was originally needed for was rolled back, since it's a reasonable thing
  to have disabled regardless.
- Considered adding a "readjust" button as an actual Emby plugin (client or
  server-side) instead of a KWin script -- not pursued: Emby's Linux client
  has no public plugin/UI-extension API, so a client-side button would mean
  patching its bundled JS/HTML assets directly (fragile, breaks on updates).
  A server-side plugin can't reach this at all -- it runs on the Emby
  Server process (possibly a different machine entirely), with no channel
  to this machine's window manager.

## Files

| File | Purpose |
|---|---|
| `config.sh` | All configurable paths. Sourced by every other script. |
| `shim.c` / `build-shim.sh` | The `LD_PRELOAD` shim and its build script. |
| `patch-libmpv.sh` / `restore-libmpv.sh` | Swap/restore `libmpv.so` + deps. |
| `patch-wrapper.sh` / `restore-wrapper.sh` | Patch/restore the launcher script. |
| `kwin-embed-emby/` | KWin script: cosmetic embedding (KDE Plasma 6 only). |
| `install-kwin-embed.sh` / `uninstall-kwin-embed.sh` | Install/remove that script. |
| `install.sh` / `uninstall.sh` | Run everything above in the right order. |
