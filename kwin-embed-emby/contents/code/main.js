// Borderless, stacked below Emby's main window, height-locked center-crop
// fit to Emby's client area (preserves video aspect, crops overflow instead
// of letterboxing). Applied on window creation, then reactively whenever
// mpv's own geometry changes again (SVP's filter engaging triggers exactly
// one, content-driven resize a few seconds in) -- but only for the first
// REACTIVE_WINDOW_MS after the window appears; after that it stops
// reacting entirely and stands by until the next mpv window. Live reacting
// forever was unsafe in an earlier version (fought mpv's own resizing in a
// tight loop) -- that was specifically keepaspect-window and a re-applied
// geometry option fighting back; both are now disabled in shim.c, and
// applyHeightFit no-ops if the geometry already matches what it would set,
// so this can't retrigger itself either way. The time bound is just to
// stop watching once SVP's one-time resize window has clearly passed.
//
// Emby's main window closes/reopens around fullscreen/playback transitions
// unreliably (observed multiple times), so we don't cache a reference to it
// -- always look it up fresh via currentOverlay() at the point of use.
// Caching + event-based recovery was tried repeatedly and kept going stale.

const MPV_CLASS = "mpv";
const OVERLAY_CLASS = "media.emby.client.beta";
const REACTIVE_WINDOW_MS = 10000;

const mpvWindows = new Set();

function log(msg) {
    console.log("[emby-mpv-embed] " + msg);
}

function matches(win, cls) {
    return win.resourceClass === cls || win.resourceName === cls;
}

function currentOverlay() {
    return workspace.windowList().find(function (w) {
        return matches(w, OVERLAY_CLASS);
    }) || null;
}

function applyHeightFit(win) {
    const overlay = currentOverlay();
    if (!overlay) return;
    // clientGeometry is read-only here (throws on assign); frameGeometry
    // is the settable one.
    const real = win.frameGeometry;
    const target = overlay.clientGeometry;
    if (!real.width || !real.height || !target.width || !target.height) return;

    const scale = target.height / real.height;
    // Never narrower than target: if the scaled video is narrower than
    // Emby's window, keep the mpv window at full target width anyway --
    // mpv's own default letterboxing (keepaspect=yes) then pillarboxes the
    // video in black within that window, instead of the window itself
    // being narrower and exposing real desktop in the gap on each side.
    // Only actually wider-than-target (cover/crop) shrinks back to scale.
    const newWidth = Math.max(real.width * scale, target.width);
    const newHeight = target.height;
    const newX = target.x + (target.width - newWidth) / 2;
    const newY = target.y;

    // Already correct -- skip the assignment. Without this, setting
    // frameGeometry below would fire frameGeometryChanged again, which
    // would call back into this function forever.
    if (Math.round(real.x) === Math.round(newX) && Math.round(real.y) === Math.round(newY) &&
        Math.round(real.width) === Math.round(newWidth) && Math.round(real.height) === Math.round(newHeight)) {
        return;
    }

    log("height-fit: real=" + real.width + "x" + real.height +
        " target=" + target.width + "x" + target.height +
        " -> " + newWidth.toFixed(0) + "x" + newHeight.toFixed(0) +
        " at (" + newX.toFixed(0) + "," + newY.toFixed(0) + ")");

    win.frameGeometry = { x: newX, y: newY, width: newWidth, height: newHeight };
}

function setupMpvWindow(win) {
    log("mpv window found");
    win.noBorder = true;
    win.skipTaskbar = true;
    win.skipPager = true;
    win.skipSwitcher = true;
    win.keepBelow = true; // doesn't need an overlay reference to make sense
    applyHeightFit(win);

    let reactive = true;
    win.frameGeometryChanged.connect(function () {
        if (reactive) applyHeightFit(win);
    });

    const stopTimer = new QTimer();
    stopTimer.interval = REACTIVE_WINDOW_MS;
    stopTimer.singleShot = true;
    stopTimer.timeout.connect(function () {
        reactive = false;
        log("reactive window closed (" + win.caption + ") -- standing by for next mpv window");
    });
    stopTimer.start();

    mpvWindows.add(win);
}

function handleWindow(win) {
    if (matches(win, MPV_CLASS)) setupMpvWindow(win);
}

workspace.windowList().forEach(handleWindow);

workspace.windowAdded.connect(handleWindow);

workspace.windowRemoved.connect(function (win) {
    if (mpvWindows.has(win)) {
        mpvWindows.delete(win);
        log("mpv window closed");
    }
});

log("script loaded");
