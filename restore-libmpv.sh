#!/bin/sh
# Restores Emby's original bundled libmpv.so and removes the dependency
# files copied in by patch-libmpv.sh.
#
# The backup is consumed (moved, not copied) by the restore: if it were left
# behind, a later Emby update could install a genuinely new libmpv.so, and a
# second uninstall.sh run (with no install.sh in between) would silently
# overwrite that new original with this now-stale backup. Once restored,
# the only trustworthy "original" is whatever Emby currently has installed.
set -e

. "$(dirname "$(readlink -f "$0")")/config.sh"

if [ ! -f "$EMBY_BIN/libmpv.so.orig-backup" ]; then
    echo "No backup found at $EMBY_BIN/libmpv.so.orig-backup -- nothing to restore." >&2
    exit 1
fi

echo "Restoring original libmpv.so..."
sudo mv "$EMBY_BIN/libmpv.so.orig-backup" "$EMBY_BIN/libmpv.so"
sudo chown root:root "$EMBY_BIN/libmpv.so"

echo "Removing copied SVP dependency files..."
sudo rm -f "$EMBY_BIN/libvapoursynth-script.so.0" "$EMBY_BIN/libvapoursynth.so" \
    "$EMBY_BIN/libpython3.12.so.1.0" "$EMBY_BIN/libshaderc.so.1" \
    "$EMBY_BIN/libpython3.12.so.1.0._pth"
sudo rm -f "$EMBY_BIN/lib" "$EMBY_RESOURCES/mpv"

echo "Done. libmpv.so restored to the original bundled build."
