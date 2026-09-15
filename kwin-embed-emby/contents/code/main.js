// Borderless, stacked below Emby's main window, height-locked center-crop
// fit to Emby's client area (preserves video aspect, crops overflow instead
// of letterboxing). Applied on window creation, then reactively for the
// window's entire lifetime whenever mpv's own geometry changes again (SVP's
// filter engaging triggers a content-driven resize a few seconds in).
//
// This used to only react for the first 10s after the window appeared, then
// stop -- assuming SVP only ever resizes once, early. Wrong: Emby reuses the
// same mpv window across an auto-advance to the next episode (no fresh
// windowAdded fires), so after watching a full episode the 10s window was
// long expired by the time SVP resized it again for episode 2, and nothing
// caught it. Reacting for the window's whole lifetime instead, guarded by
// two safety nets: applyHeightFit no-ops if the geometry already matches
// what it would set (so our own write doesn't retrigger itself), and a hard
// rate limit disables reacting entirely if that ever fails and it starts
// correcting rapidly anyway. Live reacting fought mpv in a tight loop in an
// earlier version -- that was specifically keepaspect-window and a
// re-applied geometry option fighting back, both now disabled in shim.c.
//
// Emby's main window closes/reopens around fullscreen/playback transitions
// unreliably (observed multiple times), so we don't cache a reference to it
// -- always look it up fresh via currentOverlay() at the point of use.
// Caching + event-based recovery was tried repeatedly and kept going stale.

const MPV_CLASS = "mpv";
const OVERLAY_CLASS = "media.emby.client.beta";
const MAX_CORRECTIONS_PER_SECOND = 5;
const POLL_INTERVAL_MS = 1000;

const mpvWindows = new Set();

function log(msg) {
    console.log("[emby-mpv-embed] " + msg);
}

function matches(win, cls) {
    return win.resourceClass === cls || win.resourceName === cls;
}

// win.caption for an mpv window is the full media URL, including a real
// Emby api_key and device/session IDs -- never log it as-is.
function redactedCaption(win) {
    return String(win.caption).split("?")[0];
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

    // Already correct (within a couple pixels) -- skip the assignment.
    // Without this, setting frameGeometry below would fire
    // frameGeometryChanged again, which would call back into this function
    // forever. An exact-match comparison isn't enough: what we request and
    // what the compositor reports back can differ by a pixel or two of
    // rounding even when nothing meaningful changed, which an exact
    // comparison treats as still-different and reapplies forever -- this
    // is exactly what tripped the rate-limit safety net below in practice.
    const EPS = 2;
    if (Math.abs(real.x - newX) <= EPS && Math.abs(real.y - newY) <= EPS &&
        Math.abs(real.width - newWidth) <= EPS && Math.abs(real.height - newHeight) <= EPS) {
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

    // Hard safety net: if applyHeightFit's own no-op check ever fails to
    // stop a feedback loop for some reason, disable reacting rather than
    // spinning, instead of relying on that check being the only thing
    // standing between this and a genuine infinite loop.
    let reactive = true;
    let corrections = 0;
    let windowStart = Date.now();
    win.frameGeometryChanged.connect(function () {
        if (!reactive) return;
        const now = Date.now();
        if (now - windowStart > 1000) {
            windowStart = now;
            corrections = 0;
        }
        corrections++;
        if (corrections > MAX_CORRECTIONS_PER_SECOND) {
            reactive = false;
            log("WARNING: " + corrections + " corrections within 1s on " +
                redactedCaption(win) + " -- disabling reactive fit for safety");
            return;
        }
        applyHeightFit(win);
    });

    // Belt and suspenders on top of the reactive listener above: at least
    // once, our own frameGeometry assignment held for a moment and then
    // silently reverted seconds later with no further frameGeometryChanged
    // firing in between -- something (most likely mpv's own buffer commit
    // after SVP's reconfigure) can apparently win the geometry negotiation
    // after the fact without a signal we catch. A steady poll guarantees
    // any drift gets caught within POLL_INTERVAL_MS regardless of whether
    // the event fires. Safe/cheap: the no-op check above makes every tick
    // where nothing's wrong a no-op.
    const pollTimer = new QTimer();
    pollTimer.interval = POLL_INTERVAL_MS;
    pollTimer.timeout.connect(function () {
        if (!mpvWindows.has(win)) {
            pollTimer.stop();
            return;
        }
        if (reactive) applyHeightFit(win);
    });
    pollTimer.start();

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
