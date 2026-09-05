# Emby-Interpolation

Real motion interpolation (24fps -> 120fps) for Emby's Linux desktop client,
using [SVP4](https://www.svp-team.com/) — same effect SVP gives mpv/MPC-HC
on Windows. Emby's own "Enable interpolation" is judder correction only.

Works by swapping Emby's bundled `libmpv.so` for SVP's VapourSynth-enabled
mpv build, and getting SVP Manager to attach to it over its usual JSON IPC
socket, same as any other mpv instance.

## Demo

<video src="linux-emby-svp-demo.mp4" controls width="600"></video>

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

## How it works

- Video isn't HTML5 — `Emby.MpvPlayer.dll` P/Invokes `libmpv.so` directly.
- SVP Manager just needs any mpv's `--input-ipc-server` socket; no special
  Emby integration.
- SVP4 already ships a compatible `libmpv.so.2` — no build-from-source needed.
- Emby doesn't read mpv.conf, and spawns short-lived "probe" mpv instances
  too, so IPC can't be forced unconditionally at init. `shim.c` intercepts
  `dlsym()` (bypasses .NET's P/Invoke symbol resolution) and forces IPC only
  once it sees the real `loadfile` command.
- Embedded Python (for VapourSynth) needs its stdlib/C-extension symbols
  visible inside Emby's process — see `patch-libmpv.sh`/`patch-wrapper.sh`
  comments (`._pth` sidecar, `libpython` needs `LD_PRELOAD` not `dlopen`).
- `shim.c` also forces `keepaspect-window=no` (stops mpv self-resizing on
  SVP's filter engaging), `border=no` (stops mpv requesting its own
  decoration, which briefly appears before the KWin script's `noBorder`
  strips it — not, as first suspected, mpv's OSC, which can't even run
  since this build has Lua disabled), and a `geometry=100%x100%` +
  post-`loadfile` clear (opens at full screen size instead of native video
  resolution, without leaving that option to fight later reconfigures).

## Known limitations

- **No true window embedding.** Emby embeds mpv via X11 `wid`; only Vulkan
  Wayland renders video reliably here, and Wayland has no foreign-window
  embedding (Vulkan X11 also tried — fails creating the swapchain against
  Emby's embed window; not fixable from here).

  `kwin-embed-emby/` (KDE Plasma 6 only) makes it *look* embedded: no
  decorations, height-locked fit to Emby's window (preserves video aspect,
  crops overflow instead of letterboxing, applied on window creation and
  reactively for the first 10s), and mpv kept always below Emby's own
  window. Other DEs: video just plays in a plain floating window.
- **Video can render above other unrelated windows** (terminal, file
  manager, etc.) if they're not minimized. Tried making both Emby and mpv
  "always on top" with Emby explicitly raised above mpv — verified via
  logging that this was applied correctly on KWin's side, but had no visible
  effect at all. Suspected cause: mpv's Vulkan-Wayland surface may be shown
  via direct scanout (a hardware display plane bypassing normal compositor
  stacking), which would make this uncontrollable from a KWin script
  regardless. Not confirmed; not pursued further (would require restarting
  KWin with `KWIN_DRM_NO_DIRECT_SCANOUT=1` to test).
- Only tested at 23.976fps -> 119.88fps (SVP `x5` "Automatic"), H.265.

## Notes

- Tested on KDE Plasma / KWin 6.7.4 (Wayland), CachyOS (kernel 7.2.3).
- Tested against Emby Linux beta client 2.319.0–2.321.0.
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
