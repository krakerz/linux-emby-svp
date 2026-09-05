// Borderless, stacked below Emby's main window, height-locked center-crop
// fit to Emby's client area (preserves video aspect, crops overflow instead
// of letterboxing). Applied on window creation + once more at +10s (SVP's
// filter regrows mpv's window a few seconds in even with
// shim.c's keepaspect-window=no). Not continuous/live -- that fights mpv's
// own resizing forever and breaks scaling (tried, reverted).

const MPV_CLASS = "mpv";
const OVERLAY_CLASS = "media.emby.client.beta";
const REGROW_DELAY_MS = 10000;

let overlay = null;
const mpvWindows = new Set();

function log(msg) {
    console.log("[emby-mpv-embed] " + msg);
}

function matches(win, cls) {
    return win.resourceClass === cls || win.resourceName === cls;
}

function applyHeightFit(win) {
    if (!overlay) return;
    // clientGeometry is read-only here (throws on assign); frameGeometry
    // is the settable one.
    const real = win.frameGeometry;
    const target = overlay.clientGeometry;
    if (!real.width || !real.height || !target.width || !target.height) return;

    const scale = target.height / real.height;
    const newWidth = real.width * scale;
    const newHeight = target.height;
    const newX = target.x + (target.width - newWidth) / 2;
    const newY = target.y;

    log("height-fit: real=" + real.width + "x" + real.height +
        " target=" + target.width + "x" + target.height +
        " -> " + newWidth.toFixed(0) + "x" + newHeight.toFixed(0) +
        " at (" + newX.toFixed(0) + "," + newY.toFixed(0) + ")");

    win.frameGeometry = { x: newX, y: newY, width: newWidth, height: newHeight };
}

function scheduleRegrowFix(win) {
    const timer = new QTimer();
    timer.interval = REGROW_DELAY_MS;
    timer.singleShot = true;
    timer.timeout.connect(function () {
        if (!mpvWindows.has(win)) return; // already closed
        log("10s readjust (" + win.caption + ")");
        applyHeightFit(win);
    });
    timer.start();
}

function setupMpvWindow(win) {
    log("mpv window found");
    win.noBorder = true;
    win.skipTaskbar = true;
    win.skipPager = true;
    win.skipSwitcher = true;
    if (overlay) win.keepBelow = true;
    applyHeightFit(win);
    mpvWindows.add(win);
    scheduleRegrowFix(win);
}

function setupOverlay(win) {
    log("overlay window found");
    overlay = win;
    mpvWindows.forEach(function (w) { w.keepBelow = true; });
}

function findOverlayCandidate() {
    return workspace.windowList().find(function (w) {
        return matches(w, OVERLAY_CLASS);
    }) || null;
}

function handleWindow(win) {
    if (matches(win, MPV_CLASS)) setupMpvWindow(win);
    else if (matches(win, OVERLAY_CLASS)) setupOverlay(win);
}

workspace.windowList().forEach(handleWindow);

workspace.windowAdded.connect(handleWindow);

workspace.windowRemoved.connect(function (win) {
    if (mpvWindows.has(win)) {
        mpvWindows.delete(win);
        log("mpv window closed");
    }
    if (win === overlay) {
        overlay = null;
        log("overlay window closed");
        // Emby sometimes closes/recreates its main window (e.g. around a
        // fullscreen transition) without windowAdded firing for the
        // replacement -- re-scan now instead of waiting on an add event
        // that may never come.
        const candidate = findOverlayCandidate();
        if (candidate) setupOverlay(candidate);
    }
});

log("script loaded");
