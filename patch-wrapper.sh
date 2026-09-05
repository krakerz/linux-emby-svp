#!/bin/sh
# Patches Emby's launcher wrapper script to export LD_PRELOAD for our
# emby_svp_shim.so, regardless of which icon/menu entry launches it
# (desktop-file-based LD_PRELOAD didn't reliably apply via Kickoff/Favorites).
#
# Backup safety: checks the CONTENT of the current wrapper rather than just
# whether a backup file exists. If the current wrapper doesn't already
# contain our LD_PRELOAD export, it's treated as the authoritative
# "original" (whether it's the same one as before or a newer one from an
# Emby update) and the backup is refreshed, discarding any stale old one.
set -e

. "$(dirname "$(readlink -f "$0")")/config.sh"

# LD_PRELOAD-ing libpython here (rather than relying on however libmpv/.NET's
# loader dlopens it internally) forces it into the global symbol scope, which
# Python C extensions loaded later via a separate dlopen() (e.g. "import
# vapoursynth" -> vapoursynth.so) need in order to resolve Python C-API
# symbols like PyExc_SystemError -- otherwise they fail with "undefined
# symbol" even though libpython is already loaded and running.
SVP_LIBPYTHON="$SVP_PYTHON/libpython3.12.so.1.0"

if grep -qF "$SHIM_SO" "$EMBY_WRAPPER" 2>/dev/null && grep -q "PYTHONHOME=" "$EMBY_WRAPPER" 2>/dev/null \
    && grep -q "libpython3.12" "$EMBY_WRAPPER" 2>/dev/null; then
    echo "Wrapper is already patched (and points at the current SHIM_SO path) -- nothing to do."
    exit 0
fi

if grep -q "LD_PRELOAD=" "$EMBY_WRAPPER" 2>/dev/null; then
    # Wrapper already carries our LD_PRELOAD (from an older version of this
    # script, before PYTHONHOME/libpython was added) -- it's our own
    # work-in-progress, not a genuine Emby-original file, so leave the
    # existing backup alone.
    echo "Wrapper already has our LD_PRELOAD (from an older patch) -- upgrading in place, backup left untouched."
else
    if [ -f "$EMBY_WRAPPER.orig-backup" ] && ! cmp -s "$EMBY_WRAPPER" "$EMBY_WRAPPER.orig-backup"; then
        echo "Existing backup doesn't match the current wrapper"
        echo "(likely an Emby update happened) -- refreshing the backup."
    elif [ ! -f "$EMBY_WRAPPER.orig-backup" ]; then
        echo "No existing backup found."
    fi
    echo "Backing up current (original) wrapper -> $(basename "$EMBY_WRAPPER").orig-backup"
    sudo cp "$EMBY_WRAPPER" "$EMBY_WRAPPER.orig-backup"
fi

echo "Installing patched wrapper (LD_PRELOAD=$SHIM_SO:$SVP_LIBPYTHON, PYTHONHOME=$SVP_PYTHON)..."
sudo tee "$EMBY_WRAPPER" > /dev/null <<EOF
#!/bin/sh

EL_DIR="\$(dirname "\$(readlink -f "\$0")")"

cd  "\$EL_DIR/resources/bin"

export LD_PRELOAD="$SHIM_SO:$SVP_LIBPYTHON"
export PYTHONHOME="$SVP_PYTHON"
export EMBY_SVP_IPC_SOCKET="$IPC_SOCKET"
export EMBY_SVP_SHIM_LOG="$SHIM_LOG"

exec "./$EMBY_BINARY_NAME" "\$@"
EOF

sudo chown root:root "$EMBY_WRAPPER"
sudo chmod 755 "$EMBY_WRAPPER"

echo "Done. Wrapper now exports LD_PRELOAD for every launch method."
