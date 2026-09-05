#!/bin/sh
# Compiles the LD_PRELOAD shim used to force Emby's embedded libmpv to open
# a JSON IPC socket (see shim.c for why this is needed).
set -e

. "$(dirname "$(readlink -f "$0")")/config.sh"

mkdir -p "$SHIM_DIR"
gcc -shared -fPIC -O2 -o "$SHIM_SO" "$SHIM_SRC" -ldl -Wall
echo "Built $SHIM_SO"
