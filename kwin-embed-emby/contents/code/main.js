// Visually embeds Emby's floating "mpv" playback window: strips its
// decorations, continuously matches its geometry to Emby's own
// video-placeholder window ("embyvideounderlaybeta" -- the window Emby
// normally embeds real X11-backed mpv into, still created even though
// Vulkan Wayland can't actually embed into it), and keeps it stacked below
// Emby's own control/overlay window ("media.emby.client.beta") so Emby's
// on-screen controls remain visible on top of the video.

const MPV_CLASS = "mpv";
const UNDERLAY_CLASS = "embyvideounderlaybeta";
const OVERLAY_CLASS = "media.emby.client.beta";

let underlay = null;
let overlay = null;
const mpvWindows = new Set();

function log(msg) {
    console.log("[emby-mpv-embed] " + msg);
}

function matches(win, cls) {
    return win.resourceClass === cls || win.resourceName === cls;
}

function applyGeometry(win) {
    if (!underlay) return;
    win.frameGeometry = underlay.frameGeometry;
}

function setupMpvWindow(win) {
    log("mpv window found, applying embed styling");
    win.noBorder = true;
    win.skipTaskbar = true;
    win.skipPager = true;
    win.skipSwitcher = true;
    if (overlay) win.keepBelow = true;
    applyGeometry(win);
    mpvWindows.add(win);
}

function setupUnderlay(win) {
    log("underlay window found");
    underlay = win;
    win.frameGeometryChanged.connect(function () {
        mpvWindows.forEach(applyGeometry);
    });
    mpvWindows.forEach(applyGeometry);
}

function setupOverlay(win) {
    log("overlay window found");
    overlay = win;
    mpvWindows.forEach(function (w) { w.keepBelow = true; });
}

workspace.windowList().forEach(function (win) {
    if (matches(win, MPV_CLASS)) setupMpvWindow(win);
    else if (matches(win, UNDERLAY_CLASS)) setupUnderlay(win);
    else if (matches(win, OVERLAY_CLASS)) setupOverlay(win);
});

workspace.windowAdded.connect(function (win) {
    if (matches(win, MPV_CLASS)) setupMpvWindow(win);
    else if (matches(win, UNDERLAY_CLASS)) setupUnderlay(win);
    else if (matches(win, OVERLAY_CLASS)) setupOverlay(win);
});

workspace.windowRemoved.connect(function (win) {
    if (mpvWindows.has(win)) {
        mpvWindows.delete(win);
        log("mpv window closed");
    }
    if (win === underlay) {
        underlay = null;
        log("underlay window closed");
    }
    if (win === overlay) {
        overlay = null;
        log("overlay window closed");
    }
});

log("script loaded");
