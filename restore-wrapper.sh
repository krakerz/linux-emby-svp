#!/bin/sh
# Restores Emby's original, unpatched launcher wrapper script.
#
# The backup is consumed (moved, not copied) by the restore: if it were left
# behind, a later Emby update could install a genuinely new wrapper, and a
# second uninstall.sh run (with no install.sh in between) would silently
# overwrite that new original with this now-stale backup. Once restored,
# the only trustworthy "original" is whatever Emby currently has installed.
set -e

. "$(dirname "$(readlink -f "$0")")/config.sh"

if [ ! -f "$EMBY_WRAPPER.orig-backup" ]; then
    echo "No backup found at $EMBY_WRAPPER.orig-backup -- nothing to restore." >&2
    exit 1
fi

echo "Restoring original wrapper script..."
sudo mv "$EMBY_WRAPPER.orig-backup" "$EMBY_WRAPPER"
sudo chown root:root "$EMBY_WRAPPER"
sudo chmod 755 "$EMBY_WRAPPER"

echo "Done. Wrapper restored to original (no LD_PRELOAD)."
