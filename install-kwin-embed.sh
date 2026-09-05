#!/bin/sh
# Installs/updates and enables the KWin script that visually embeds Emby's
# floating mpv video window (see kwin-embed-emby/contents/code/main.js for
# how and why). Purely cosmetic -- has no effect on interpolation itself.
# Safe to re-run any time to pick up script changes.
set -e

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
KWIN_SCRIPT_ID=embymvpembed
KWIN_SCRIPT_SRC="$SCRIPT_DIR/kwin-embed-emby"
KWIN_SCRIPT_DEST="$HOME/.local/share/kwin/scripts/$KWIN_SCRIPT_ID"

if [ -d "$KWIN_SCRIPT_DEST" ]; then
    echo "Upgrading existing KWin script install..."
    kpackagetool6 --type KWin/Script --upgrade "$KWIN_SCRIPT_SRC"
else
    echo "Installing KWin script..."
    kpackagetool6 --type KWin/Script --install "$KWIN_SCRIPT_SRC"
fi

echo "Enabling and reloading..."
# A plain "reconfigure" doesn't reliably reload an already-loaded script's
# updated file -- toggling it off/on forces KWin to actually re-read it.
kwriteconfig6 --file kwinrc --group Plugins --key "${KWIN_SCRIPT_ID}Enabled" false
qdbus org.kde.KWin /KWin reconfigure
sleep 1
kwriteconfig6 --file kwinrc --group Plugins --key "${KWIN_SCRIPT_ID}Enabled" true
qdbus org.kde.KWin /KWin reconfigure

echo "Done. Check ~/.xsession-errors or 'journalctl --user | grep emby-mpv-embed' if it doesn't seem active."
