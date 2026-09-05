#!/bin/sh
# Disables and removes the KWin embed script installed by
# install-kwin-embed.sh.
set -e

KWIN_SCRIPT_ID=embymvpembed

if [ ! -d "$HOME/.local/share/kwin/scripts/$KWIN_SCRIPT_ID" ]; then
    echo "KWin script not installed -- nothing to do." >&2
    exit 0
fi

kwriteconfig6 --file kwinrc --group Plugins --key "${KWIN_SCRIPT_ID}Enabled" false
qdbus org.kde.KWin /KWin reconfigure
kpackagetool6 --type KWin/Script --remove "$KWIN_SCRIPT_ID"

echo "Done. Emby's video window will float undecorated/unmanaged again."
