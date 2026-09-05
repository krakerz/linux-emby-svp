#!/bin/sh
# One-shot installer: builds the LD_PRELOAD shim, swaps in SVP's
# VapourSynth-enabled libmpv, and patches Emby's launcher wrapper to load it.
# Safe to re-run any time (e.g. after an Emby update) -- every step is
# checksum/content-based and idempotent.
set -e

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
. "$SCRIPT_DIR/config.sh"

echo "== Checking prerequisites =="
for d in "$SVP_MPV" "$SVP_PYTHON" "$EMBY_BIN"; do
    if [ ! -d "$d" ]; then
        echo "Required directory not found: $d" >&2
        echo "Check SVP_DIR/EMBY_DIR in config.sh (or as env vars) point at your install." >&2
        exit 1
    fi
done

echo "== Building shim =="
sh "$SCRIPT_DIR/build-shim.sh"

echo "== Patching libmpv.so =="
sh "$SCRIPT_DIR/patch-libmpv.sh"

echo "== Patching launcher wrapper =="
sh "$SCRIPT_DIR/patch-wrapper.sh"

if command -v kpackagetool6 >/dev/null 2>&1; then
    echo "== Installing KWin embed script (cosmetic, KDE Plasma 6 only) =="
    sh "$SCRIPT_DIR/install-kwin-embed.sh" || echo "KWin embed script install failed -- continuing without it (not fatal)."
else
    echo "== Skipping KWin embed script (kpackagetool6 not found -- not a KDE Plasma 6 session) =="
fi

echo
echo "Install complete. Fully close Emby (if running) and relaunch it, then"
echo "play a video -- SVP Manager should pick it up automatically."
