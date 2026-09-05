// Keeps Emby's floating "mpv" playback window borderless and stacked below
// Emby's own main window ("media.emby.client.beta"), and fits it to Emby's
// available client area (excluding Emby's own titlebar/borders) using a
// height-locked, center-crop fit:
//
//   scale = target.height / mpv.height   (uniform, preserves mpv's own
//                                          current aspect ratio)
//   new width = mpv.width * scale, new height = target.height
//   horizontally centered over target -- if the scaled width is wider than
//   target's width, the overflow extends equally past target's left/right
//   edges (cropped from the viewer's perspective) rather than leaving a
//   gap or letterboxing top/bottom.
//
// Locking to height rather than stretching to Emby's exact box avoids
// mismatching mpv's own aspect ratio, which is what caused visible black
// bars in an earlier version that just set frameGeometry = target as-is.
//
// Applied once when the mpv window appears, then once more after a fixed
// ~10s delay: SVP's VapourSynth filter engaging a few seconds into
// playback changes mpv's own natural window size again (observed even with
// shim.c's keepaspect-window=no already disabled), so the fit is redone
// once, reading mpv's now-current size/aspect. Deliberately not applied
// continuously/live -- continuously re-matching geometry on every change
// fought mpv's own internal resizing forever in an earlier version, and
// visibly broke video scaling. Two fixed applications (now, and once more
// at +10s) handles the SVP-regrowth case without that fight.

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
        if (!mpvWindows.has(win)) return; // window already closed
        log("10s readjust (" + win.caption + ")");
        applyHeightFit(win);
    });
    timer.start();
}

function setupMpvWindow(win) {
    log("mpv window found, applying embed styling");
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
    mpvWindows.forEach(function (w) {
        w.keepBelow = true;
    });
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
    }
});

log("script loaded");
