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
  - Height-locked fit to Emby's client area: scale so video height == Emby's
    window height (preserves aspect ratio); if scaled width overflows,
    window stays that wide, cropping left/right; if narrower, window stays
    at Emby's full width instead of shrinking, so mpv's own default
    letterboxing fills the sides in black rather than exposing desktop.
    Applied on window creation, then reactively whenever mpv's own geometry
    changes again — but only for the first 10s after the window appears,
    then it stops watching entirely until the next mpv window (SVP's
    filter engaging causes exactly one, content-driven resize a few seconds
    in, even with `keepaspect-window=no` and a cleared `geometry` option —
    see below; reacting indefinitely isn't needed and risks fighting any
    later legitimate resize). A no-op check when geometry already matches
    stops this from retriggering itself. Unbounded live reacting was unsafe
    in an earlier version — `keepaspect-window` and a re-applied `geometry`
    option fought back in a tight loop; both are fixed at the source now.
    A KWin *Effect*-based paint-transform approach was also tried — caused
    playback to hang; abandoned.
  - Emby's main window closes/reopens unreliably around fullscreen/playback
    transitions, so its reference is never cached — looked up fresh via
    `workspace.windowList()` every time it's needed instead.

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
- `shim.c` forces mpv options pre/post-init:
  - `keepaspect-window=no` — stops mpv self-resizing its window to match
    video aspect when SVP's filter engages (fights any external geometry
    control otherwise).
  - `border=no` — mpv defaults to requesting its own server-side
    decoration since it's never truly embedded; briefly granted before our
    script's `noBorder` strips it, causing a transient black bar. (A first
    theory blamed mpv's built-in OSC reserving margin — wrong, this mpv
    build has Lua disabled entirely so OSC can't run at all.)
  - `geometry=100%x100%` — mpv defaults its window to the video's native
    resolution (e.g. 1920x1080 for a 1080p file), not the display, so it
    opens small before the KWin script resizes it. This opens it at full
    screen size immediately instead. mpv re-evaluates `geometry` on every
    reconfigure though, not just the first, so it gets cleared again right
    after `loadfile` (initial size already applied by then, well before
    SVP ever attaches) so it can't fight the KWin script on a later one.
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
