#!/bin/sh
# Reverses install.sh: restores Emby's original wrapper and libmpv.so.
set -e

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
. "$SCRIPT_DIR/config.sh"

echo "== Restoring launcher wrapper =="
sh "$SCRIPT_DIR/restore-wrapper.sh"

echo "== Restoring libmpv.so =="
sh "$SCRIPT_DIR/restore-libmpv.sh"

if command -v kpackagetool6 >/dev/null 2>&1; then
    echo "== Removing KWin embed script =="
    sh "$SCRIPT_DIR/uninstall-kwin-embed.sh" || true
fi

echo
echo "Uninstall complete. Emby is back to its stock, unpatched state."
