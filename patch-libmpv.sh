#!/bin/sh
# Swaps Emby's bundled libmpv.so for SVP's VapourSynth-enabled build, and
# copies the few dependency files it needs into Emby's own bin dir (its
# launcher forces LD_LIBRARY_PATH to that exact dir, overriding anything
# we set externally, so the deps have to live there).
#
# Backup safety: compares checksums instead of just checking whether a
# backup file exists. If the currently-installed libmpv.so is NOT our SVP
# build, it's treated as the authoritative "original" (whether it's the
# same one as before or a newer one from an Emby update) and the backup is
# refreshed, discarding any stale old one. This avoids two bugs: restoring
# an outdated pre-update original after Emby updates itself, and silently
# backing up our own already-patched file as if it were "original" if this
# script is run twice without restoring in between.
set -e

. "$(dirname "$(readlink -f "$0")")/config.sh"

SVP_SUM=$(sha256sum "$SVP_MPV/libmpv.so.2" | awk '{print $1}')
CURRENT_SUM=$(sha256sum "$EMBY_BIN/libmpv.so" | awk '{print $1}')

if [ "$CURRENT_SUM" = "$SVP_SUM" ]; then
    echo "libmpv.so is already the SVP build -- skipping the swap, but still"
    echo "checking the Python stdlib sidecar/symlinks below (idempotent)."
else
    if [ -f "$EMBY_BIN/libmpv.so.orig-backup" ]; then
        OLD_SUM=$(sha256sum "$EMBY_BIN/libmpv.so.orig-backup" | awk '{print $1}')
        if [ "$OLD_SUM" != "$CURRENT_SUM" ]; then
            echo "Existing backup doesn't match the currently installed libmpv.so"
            echo "(likely an Emby update happened) -- refreshing the backup."
        fi
    else
        echo "No existing backup found."
    fi

    echo "Backing up current (original) libmpv.so -> libmpv.so.orig-backup"
    sudo cp "$EMBY_BIN/libmpv.so" "$EMBY_BIN/libmpv.so.orig-backup"

    echo "Installing SVP's VapourSynth-enabled libmpv..."
    sudo cp "$SVP_MPV/libmpv.so.2" "$EMBY_BIN/libmpv.so"
fi

echo "Copying required dependencies into $EMBY_BIN ..."
sudo cp "$SVP_MPV/libvapoursynth-script.so.0" "$EMBY_BIN/"
sudo cp "$SVP_MPV/libvapoursynth.so" "$EMBY_BIN/"
sudo cp "$SVP_PYTHON/libpython3.12.so.1.0" "$EMBY_BIN/"
sudo cp /usr/lib/libshaderc_shared.so.1 "$EMBY_BIN/libshaderc.so.1"

# Python's embedded interpreter needs its stdlib tree too, not just the .so.
# SVP ships a "._pth" sidecar next to libpython3.12.so.1.0 that tells Python
# exactly where to find it via paths relative to wherever that sidecar file
# ends up (this is how SVP's own flat, non-standard lib layout -- lib/ instead
# of lib/python3.12/ -- gets found; PYTHONHOME alone assumes the standard
# layout and fails). Copy the sidecar in next to our copy of the library, and
# symlink the directories it points at (lib/, and ../mpv/python for the
# "import vapoursynth" Python binding) so its relative paths resolve.
echo "Installing Python stdlib sidecar (._pth) and symlinks it needs..."
sudo cp "$SVP_PYTHON/libpython3.12.so.1.0._pth" "$EMBY_BIN/"
if [ ! -e "$EMBY_BIN/lib" ]; then
    sudo ln -s "$SVP_PYTHON/lib" "$EMBY_BIN/lib"
fi
if [ ! -e "$EMBY_RESOURCES/mpv" ]; then
    sudo ln -s "$SVP_MPV" "$EMBY_RESOURCES/mpv"
fi

echo "Fixing ownership..."
sudo chown -h root:root "$EMBY_BIN/libmpv.so" "$EMBY_BIN/libvapoursynth-script.so.0" \
    "$EMBY_BIN/libvapoursynth.so" "$EMBY_BIN/libpython3.12.so.1.0" "$EMBY_BIN/libshaderc.so.1" \
    "$EMBY_BIN/libpython3.12.so.1.0._pth" "$EMBY_BIN/lib" "$EMBY_RESOURCES/mpv"

echo "Done. libmpv.so is now the SVP/VapourSynth build."
