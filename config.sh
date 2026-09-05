#!/bin/sh
# Shared configuration for the Emby + SVP interpolation installer scripts.
# Meant to be sourced (". config.sh"), never executed directly.
#
# Override any of these by exporting the variable before running a script,
# e.g.:
#   EMBY_DIR=/opt/MyEmby SVP_DIR=/opt/SVP4 sh install.sh
#
# Defaults assume: SVP4 installed at ~/SVP4 (its own installer's default),
# and the Emby Linux beta client installed at /opt/Emby-Beta.

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

: "${EMBY_DIR:=/opt/Emby-Beta}"
: "${EMBY_BINARY_NAME:=Emby.Client.Electron1}"
: "${SVP_DIR:=$HOME/SVP4}"
: "${SHIM_DIR:=$SCRIPT_DIR}"
: "${IPC_SOCKET:=/tmp/mpvsocket}"
: "${SHIM_LOG:=/tmp/emby-svp-shim.log}"

EMBY_WRAPPER="$EMBY_DIR/media.emby.client.beta"
EMBY_BIN="$EMBY_DIR/resources/bin"
EMBY_RESOURCES="$EMBY_DIR/resources"

SVP_MPV="$SVP_DIR/mpv"
SVP_PYTHON="$SVP_DIR/python"

SHIM_SRC="$SCRIPT_DIR/shim.c"
SHIM_SO="$SHIM_DIR/emby_svp_shim.so"
