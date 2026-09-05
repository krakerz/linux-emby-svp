/* LD_PRELOAD shim: forces Emby's embedded libmpv to open a JSON IPC socket
 * so SVP Manager can attach to it, without touching libmpv.so itself or
 * relying on Emby reading any config file (it doesn't).
 *
 * .NET's P/Invoke marshaling resolves native functions via dlsym() on a
 * specific library handle, which bypasses normal LD_PRELOAD symbol
 * interposition (that only affects PLT-based calls between ELF objects).
 * So instead of exporting target functions directly, we intercept dlsym()
 * itself and hand back our own wrapper when asked for the symbols we care
 * about.
 *
 * Emby creates several short-lived mpv instances per session (throwaway
 * ones just to probe available options/capabilities, plus one real
 * playback instance). Forcing input-ipc-server at mpv_initialize() time
 * unconditionally let temp instances steal/recreate the shared socket
 * path and get disposed without ever truly listening, orphaning it.
 *
 * Tried distinguishing "real" instances by watching for a nonzero "wid"
 * option (Emby's embed-window handle) -- but that only gets set when
 * GPU Context is an X11-embeddable one. With Vulkan Wayland (the only
 * GPU context that reliably renders video without hanging on this
 * setup), Emby correctly never sets a real wid at all since there's
 * nothing to embed into, so real playback looks identical to a temp
 * probe instance from that signal.
 *
 * Better, embedding-agnostic signal: wait for the actual "loadfile"
 * command. Only genuine playback ever issues that. input-ipc-server can
 * be set at runtime (via mpv_set_property_string), not just pre-init, so
 * we force it right when "loadfile" is intercepted -- unambiguous
 * regardless of GPU context.
 *
 * IMPORTANT: only log/branch for symbols we actually care about. .NET
 * calls dlsym thousands of times during its own early bootstrap (hostfxr,
 * coreclr, JIT, ICU...); logging every single one to disk synchronously
 * caused the whole app to hang before ever creating a window. Stay light.
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
typedef int (*mpv_command_t)(void *ctx, const char **args);

static dlsym_t real_dlsym = NULL;
static mpv_set_property_string_t real_mpv_set_property_string = NULL;
static mpv_command_t real_mpv_command = NULL;
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

            /* keepaspect-window (mpv default: on) makes mpv actively resize
             * its OWN window to match the video's aspect ratio whenever the
             * filter chain reconfigures -- which SVP's VapourSynth filter
             * does the moment it engages. That fights any outside code
             * (e.g. a KWin script) trying to keep this window matched to
             * Emby's own window: both sides keep resizing it back, forever.
             * Disabling it makes mpv just letterbox/pillarbox the video
             * within whatever size its window actually is, which is what
             * embedding into someone else's window needs. */
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
        if (strcmp(symbol, "mpv_set_property_string") == 0) {
            if (!real_mpv_set_property_string) {
                real_mpv_set_property_string = (mpv_set_property_string_t)rd(handle, symbol);
                logmsg("intercepted dlsym(mpv_set_property_string)");
            }
            return (void *)real_mpv_set_property_string;
        }
    }

    return rd(handle, symbol);
}
