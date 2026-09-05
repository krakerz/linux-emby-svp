# Emby-Interpolation

Real motion interpolation (24fps -> 120fps) for Emby's Linux desktop client,
using [SVP4](https://www.svp-team.com/) — same effect SVP gives mpv/MPC-HC
on Windows. Emby's own "Enable interpolation" is judder correction only.

Works by swapping Emby's bundled `libmpv.so` for SVP's VapourSynth-enabled
mpv build, and getting SVP Manager to attach to it over its usual JSON IPC
socket, same as any other mpv instance.

## Prerequisites

- **SVP4** installed and working (reuses its `mpv/` and `python/` dirs).
  Default: `~/SVP4`.
- **Emby Linux desktop beta client**. Default: `/opt/Emby-Beta`.
- `gcc`, `sudo`, `libshaderc_shared.so.1`.
- SVP Manager running in the background.

Override paths via env vars (see `config.sh`), e.g.:
```sh
EMBY_DIR=/opt/MyEmby SVP_DIR=/opt/SVP4 sh install.sh
```

## Install / Uninstall

```sh
sh install.sh      # builds shim, patches libmpv.so + launcher, installs KWin script
sh uninstall.sh    # reverses all of the above
```

Prompts for `sudo` (Emby's install dir is root-owned). Close and relaunch
Emby afterward.

## After an Emby update

Just re-run `sh install.sh` — every step is checksum/content-based and safe
to re-run any time; it refreshes backups from the new original instead of
restoring a stale one.

## Known limitations

- **No true window embedding.** Emby embeds mpv via X11 `wid`; only Vulkan
  **Wayland** renders video reliably here, and Wayland has no foreign-window
  embedding. (Vulkan X11 also tried — fails with `VK_ERROR_INITIALIZATION_FAILED`
  / X11 `BadLength` creating the swapchain against Emby's embed window; not
  fixable from here.)

  `kwin-embed-emby/` (KDE Plasma 6 only, installed by `install.sh`) makes it
  *look* embedded instead:
  - No decorations, stacked below Emby's main window.
  - Height-locked, center-crop fit to Emby's client area: scale so video
    height == Emby's window height (preserves aspect ratio), crop
    left/right overflow instead of letterboxing. Applied once on window
    creation, once more at +10s (SVP's filter regrows the window a few
    seconds in, even with `keepaspect-window=no` set — see below).
  - Not continuous/live — live geometry-matching fights mpv's own resizing
    forever (tried, broke scaling). A KWin *Effect*-based paint-transform
    approach was also tried — caused playback to hang; abandoned.
  - Re-scans for Emby's main window if it unexpectedly closes/reopens
    (observed around fullscreen transitions) instead of waiting on an add
    event that may never fire.

  Other DEs: video just plays in a plain floating window.
- Only tested at 23.976fps -> 119.88fps (SVP `x5` "Automatic"), H.265.

## How it works

- Video isn't HTML5 — `Emby.MpvPlayer.dll` P/Invokes `libmpv.so` directly.
- SVP Manager just needs any mpv's `--input-ipc-server` socket; no special
  Emby integration.
- SVP4 already ships a compatible `libmpv.so.2` — no build-from-source needed.
- Emby doesn't read mpv.conf, and spawns short-lived "probe" mpv instances
  too, so IPC can't be forced on unconditionally at init. `shim.c` intercepts
  `dlsym()` (bypasses .NET's P/Invoke symbol resolution) and forces IPC only
  once it sees the real `loadfile` command.
- Embedded Python (for VapourSynth) needs its stdlib/C-extension symbols
  visible inside Emby's process — see `patch-libmpv.sh`/`patch-wrapper.sh`
  comments (`._pth` sidecar, `libpython` needs `LD_PRELOAD` not `dlopen`).
- `shim.c` forces two mpv options pre/post-init:
  - `keepaspect-window=no` — stops mpv self-resizing its window to match
    video aspect when SVP's filter engages (fights any external geometry
    control otherwise).
  - `border=no` — mpv defaults to requesting its own server-side
    decoration since it's never truly embedded; briefly granted before our
    script's `noBorder` strips it, causing a transient black bar. (A first
    theory blamed mpv's built-in OSC reserving margin — wrong, this mpv
    build has Lua disabled entirely so OSC can't run at all.)
- A client-side or server-side Emby plugin for a "readjust" button was
  considered, not pursued — no plugin/UI-extension API on the client, and a
  server-side plugin has no channel to this machine's window manager at all.

## Files

| File | Purpose |
|---|---|
| `config.sh` | Configurable paths, sourced by every script. |
| `shim.c` / `build-shim.sh` | `LD_PRELOAD` shim + build script. |
| `patch-libmpv.sh` / `restore-libmpv.sh` | Swap/restore `libmpv.so` + deps. |
| `patch-wrapper.sh` / `restore-wrapper.sh` | Patch/restore launcher script. |
| `kwin-embed-emby/` | KWin script: cosmetic embedding (Plasma 6 only). |
| `install-kwin-embed.sh` / `uninstall-kwin-embed.sh` | Install/remove it. |
| `install.sh` / `uninstall.sh` | Runs everything above in order. |
