/* LD_PRELOAD shim: forces Emby's embedded libmpv to open a JSON IPC socket
 * so SVP Manager can attach to it, without touching libmpv.so or Emby's
 * config (it doesn't read one).
 *
 * .NET's P/Invoke resolves native functions via dlsym() on a specific
 * handle, bypassing normal LD_PRELOAD export interposition. So we
 * intercept dlsym() itself instead of exporting our own symbols.
 *
 * Emby spawns short-lived "probe" mpv instances too, not just the real
 * playback one, so forcing input-ipc-server at init unconditionally lets
 * probes steal/orphan the socket. Fix: wait for the real "loadfile"
 * command (only genuine playback issues it), force the IPC socket via
 * property at that point instead of pre-init.
 *
 * Only log/branch for symbols we care about -- .NET calls dlsym thousands
 * of times during its own bootstrap; logging all of them hangs the app.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#define DEFAULT_LOGFILE "/tmp/emby-svp-shim.log"
#define DEFAULT_IPC_SOCKET_PATH "/tmp/mpvsocket"

typedef void *(*dlsym_t)(void *handle, const char *symbol);
typedef int (*mpv_set_property_string_t)(void *ctx, const char *name, const char *data);
typedef int (*mpv_set_option_string_t)(void *ctx, const char *name, const char *data);
typedef int (*mpv_command_t)(void *ctx, const char **args);
typedef int (*mpv_initialize_t)(void *ctx);

static dlsym_t real_dlsym = NULL;
static mpv_set_property_string_t real_mpv_set_property_string = NULL;
static mpv_set_option_string_t real_mpv_set_option_string = NULL;
static mpv_command_t real_mpv_command = NULL;
static mpv_initialize_t real_mpv_initialize = NULL;
static void *libmpv_handle = NULL;

/* Both overridable via env (set by the installed wrapper script) so a
 * different SVP mpv.ipc_path setting, or a non-default log location,
 * doesn't require recompiling. */
static const char *ipc_socket_path(void) {
    const char *p = getenv("EMBY_SVP_IPC_SOCKET");
    return (p && *p) ? p : DEFAULT_IPC_SOCKET_PATH;
}

static void logmsg(const char *msg) {
    const char *path = getenv("EMBY_SVP_SHIM_LOG");
    if (!path || !*path) path = DEFAULT_LOGFILE;
    FILE *f = fopen(path, "a");
    if (!f) return;
    fprintf(f, "%s\n", msg);
    fclose(f);
}

static dlsym_t get_real_dlsym(void) {
    if (!real_dlsym)
        real_dlsym = (dlsym_t)dlvsym(RTLD_NEXT, "dlsym", "GLIBC_2.2.5");
    return real_dlsym;
}

static int my_mpv_initialize(void *ctx) {
    /* mpv's "border" defaults to yes; since it's never truly embedded here
     * (no wid on Wayland), it asks KWin for a server-side decoration, which
     * gets briefly granted then stripped by the KWin script's noBorder --
     * a real but transient race that showed up as a black bar top/bottom.
     * (First theory: mpv's built-in OSC reserving margin -- wrong, this
     * build has Lua disabled so OSC can't even run.) Force border=no
     * pre-init so mpv never asks for decoration at all. */
    if (!real_mpv_set_option_string && libmpv_handle) {
        real_mpv_set_option_string =
            (mpv_set_option_string_t)get_real_dlsym()(libmpv_handle, "mpv_set_option_string");
        logmsg("resolved mpv_set_option_string ourselves via stashed libmpv handle");
    }
    if (real_mpv_set_option_string) {
        int rc = real_mpv_set_option_string(ctx, "border", "no");
        logmsg("forced border=no pre-init to stop mpv requesting its own server-side decoration");
        if (rc < 0)
            logmsg("WARNING: mpv_set_option_string(border) returned an error");
    } else {
        logmsg("WARNING: could not resolve real mpv_set_option_string");
    }
    return real_mpv_initialize(ctx);
}

static int my_mpv_command(void *ctx, const char **args) {
    if (args && args[0] && strcmp(args[0], "loadfile") == 0) {
        logmsg("observed loadfile command -- this is the real playback instance");
        if (!real_mpv_set_property_string && libmpv_handle) {
            real_mpv_set_property_string =
                (mpv_set_property_string_t)get_real_dlsym()(libmpv_handle, "mpv_set_property_string");
            logmsg("resolved mpv_set_property_string ourselves via stashed libmpv handle");
        }
        if (real_mpv_set_property_string) {
            const char *sock = ipc_socket_path();
            unlink(sock);
            int rc = real_mpv_set_property_string(ctx, "input-ipc-server", sock);
            logmsg("removed stale socket (if any) and forced input-ipc-server via property");
            if (rc < 0)
                logmsg("WARNING: mpv_set_property_string(input-ipc-server) returned an error");

            /* keepaspect-window (default: on) makes mpv resize its own
             * window to match video aspect whenever SVP's filter engages,
             * fighting the KWin script's own geometry control. */
            real_mpv_set_property_string(ctx, "keepaspect-window", "no");
            logmsg("disabled keepaspect-window to stop mpv fighting external window resizes");
        } else {
            logmsg("WARNING: could not resolve real mpv_set_property_string");
        }
    }
    return real_mpv_command(ctx, args);
}

void *dlsym(void *handle, const char *symbol) {
    dlsym_t rd = get_real_dlsym();

    if (symbol && symbol[0] == 'm') {
        if (strcmp(symbol, "mpv_command") == 0) {
            if (!real_mpv_command) {
                libmpv_handle = handle;
                real_mpv_command = (mpv_command_t)rd(handle, symbol);
                logmsg("intercepted dlsym(mpv_command)");
            }
            return (void *)my_mpv_command;
        }
        if (strcmp(symbol, "mpv_initialize") == 0) {
            if (!real_mpv_initialize) {
                libmpv_handle = handle;
                real_mpv_initialize = (mpv_initialize_t)rd(handle, symbol);
                logmsg("intercepted dlsym(mpv_initialize)");
            }
            return (void *)my_mpv_initialize;
        }
        if (strcmp(symbol, "mpv_set_property_string") == 0) {
            if (!real_mpv_set_property_string) {
                real_mpv_set_property_string = (mpv_set_property_string_t)rd(handle, symbol);
                logmsg("intercepted dlsym(mpv_set_property_string)");
            }
            return (void *)real_mpv_set_property_string;
        }
        if (strcmp(symbol, "mpv_set_option_string") == 0) {
            if (!real_mpv_set_option_string) {
                real_mpv_set_option_string = (mpv_set_option_string_t)rd(handle, symbol);
                logmsg("intercepted dlsym(mpv_set_option_string)");
            }
            return (void *)real_mpv_set_option_string;
        }
    }

    return rd(handle, symbol);
}
