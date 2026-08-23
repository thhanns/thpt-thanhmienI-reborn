/* ============================================================================
   Liquid Glass engine
   ---------------------------------------------------------------------------
   Gives any element marked [data-glass] a real refracting edge.

   How it works, in three steps:

     1. A canvas paints a displacement map for the element's exact rounded
        rectangle. A signed distance field finds every pixel's depth inside the
        shape; within the bevel band the surface normal is encoded as colour,
        red carrying the horizontal shift and green the vertical. Flat grey
        means no displacement.

     2. An SVG filter reads that map through feImage and feeds it to
        feDisplacementMap. The displacement runs three times at slightly
        different strengths, keeping one channel from each pass, which is what
        produces the colour fringing along the rim. That is dispersion: the
        cheapest honest model of it.

     3. CSS points backdrop-filter at that filter, so the element bends
        whatever is behind it rather than merely blurring it.

   Only Chromium accepts an SVG url() filter inside backdrop-filter, and that
   is the piece that does the bending. Everywhere else the script stands down
   and the stylesheet's painted bevel takes over.

   Markup:
     data-glass                  enable
     data-glass-dense            text heavy, lifts the backdrop for legibility
     data-glass-bevel="18"       bevel width in px for this surface
     data-glass-refract="1.4"    refraction multiplier for this surface
     data-glass-static           skip the entrance animation

   Tuning:  LiquidGlass.configure({ refract: 16, bevel: 20, dispersion: 9 })
   ========================================================================= */
(function (global) {
  "use strict";

  /* -----------------------------------------------------------------------
     Capability detection
     --------------------------------------------------------------------- */
  var ua = navigator.userAgent;
  var isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|android|edg|fxios/i.test(ua);
  var isFirefox = /firefox|fxios/i.test(ua);
  var hasBackdrop =
    (global.CSS && CSS.supports && (CSS.supports("backdrop-filter", "blur(1px)") ||
      CSS.supports("-webkit-backdrop-filter", "blur(1px)"))) || false;

  var CAN_REFRACT = hasBackdrop && !isSafari && !isFirefox;

  var root = document.documentElement;

  /* -----------------------------------------------------------------------
     Parameters
     --------------------------------------------------------------------- */
  var P = {
    refract: 15,     /* px of displacement at the very edge */
    bevel: 18,       /* width of the band where the normal tilts */
    dispersion: 9,   /* channel spread, tenths of a percent */
    enabled: CAN_REFRACT
  };

  /* -----------------------------------------------------------------------
     Displacement map
     --------------------------------------------------------------------- */
  var mapCache = Object.create(null);
  var MAX_MAP_PX = 300000;

  /* 128,128,128,255 packed for this platform's byte order, probed rather than
     assumed so the fast fill cannot flip the alpha channel on big endian */
  var NEUTRAL = (function () {
    var probe = new Uint8ClampedArray(4);
    probe[0] = 128; probe[1] = 128; probe[2] = 128; probe[3] = 255;
    return new Uint32Array(probe.buffer)[0];
  })();

  function sdRoundBox(px, py, hw, hh, r) {
    var qx = Math.abs(px) - hw + r;
    var qy = Math.abs(py) - hh + r;
    var mx = qx > 0 ? qx : 0;
    var my = qy > 0 ? qy : 0;
    return Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - r;
  }

  function buildMap(w, h, r, bevel) {
    var key = w + "|" + h + "|" + r + "|" + bevel;
    if (mapCache[key]) return mapCache[key];

    /* The map is a smooth, low frequency field and feImage resamples it onto
       the element anyway, so it is authored in CSS pixels. Rendering at device
       resolution would quadruple this loop on a 2x display for no visible
       gain. Oversized surfaces scale to a pixel budget, with radius and bevel
       scaled to match so the geometry stays true. */
    var scale = 1;
    var area = w * h;
    if (area > MAX_MAP_PX) scale = Math.sqrt(MAX_MAP_PX / area);

    var W = Math.max(2, Math.round(w * scale));
    var H = Math.max(2, Math.round(h * scale));
    var R = r * scale;
    var B = Math.max(1, bevel * scale);

    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");
    var img = ctx.createImageData(W, H);
    var d = img.data;

    var hw = W / 2, hh = H / 2;
    var rr = Math.min(R, Math.min(hw, hh));

    /* Rows further than bevel+radius from the top and bottom can only meet the
       boundary at the left and right, so their middle span stays neutral and
       gets skipped. Only worth it when there IS a middle: a circle or a pill
       has none, and there the prefill is pure overhead, so it is gated. */
    var frame = Math.ceil(B + rr) + 2;
    var coreTop = frame, coreBottom = H - frame;
    var edge = Math.ceil(B) + 2;
    var useSkip = (coreBottom - coreTop) > 8 && (W - 2 * edge) > 8;

    if (useSkip) new Uint32Array(d.buffer).fill(NEUTRAL);

    for (var y = 0; y < H; y++) {
      var py = y + 0.5 - hh;
      var inCore = useSkip && (y >= coreTop && y < coreBottom);

      for (var x = 0; x < W; x++) {
        if (inCore && x >= edge && x < W - edge) {
          x = W - edge - 1;      /* jump the neutral interior */
          continue;
        }
        var px = x + 0.5 - hw;
        var i = (y * W + x) * 4;

        var dist = sdRoundBox(px, py, hw, hh, rr);
        var R8 = 128, G8 = 128;

        if (dist < 0) {
          var depth = -dist;
          if (depth < B) {
            /* numeric gradient of the field: the outward pointing normal */
            var gx = sdRoundBox(px + 1, py, hw, hh, rr) - sdRoundBox(px - 1, py, hw, hh, rr);
            var gy = sdRoundBox(px, py + 1, hw, hh, rr) - sdRoundBox(px, py - 1, hw, hh, rr);
            var len = Math.sqrt(gx * gx + gy * gy);
            if (len > 1e-6) {
              gx /= len; gy /= len;
              /* Treat the surface as a quarter round: the slope is
                 s/sqrt(1-s^2), softened so it saturates at the very edge
                 instead of running away to infinity. */
              var s = 1 - depth / B;
              var slope = s / Math.sqrt(1 - s * s + 1e-4);
              var m = slope / (1 + slope);
              /* push the sample inward: the classic lens squeeze */
              R8 = 128 - gx * m * 127;
              G8 = 128 - gy * m * 127;
            }
          }
        }

        d[i]     = R8 < 0 ? 0 : R8 > 255 ? 255 : R8;
        d[i + 1] = G8 < 0 ? 0 : G8 > 255 ? 255 : G8;
        d[i + 2] = 128;
        d[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    var url = cv.toDataURL();
    mapCache[key] = url;

    var keys = Object.keys(mapCache);
    if (keys.length > 80) delete mapCache[keys[0]];
    return url;
  }

  /* -----------------------------------------------------------------------
     SVG filter
     --------------------------------------------------------------------- */
  var NS = "http://www.w3.org/2000/svg";
  var XL = "http://www.w3.org/1999/xlink";
  var host = null;
  var uid = 0;

  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function ensureHost() {
    if (host) return host;
    host = svgEl("svg", { width: 0, height: 0, "aria-hidden": "true" });
    host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;opacity:0";
    document.body.appendChild(host);
    return host;
  }

  var CHANNEL = {
    r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
    g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
    b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
  };

  function makeFilter() {
    var id = "lgfx" + (++uid);
    var f = svgEl("filter", {
      id: id,
      filterUnits: "userSpaceOnUse",
      primitiveUnits: "userSpaceOnUse",
      "color-interpolation-filters": "sRGB",
      x: 0, y: 0, width: 1, height: 1
    });

    var im = svgEl("feImage", {
      result: "map", preserveAspectRatio: "none", x: 0, y: 0, width: 1, height: 1
    });
    f.appendChild(im);

    var names = ["r", "g", "b"];
    var disp = [];
    for (var i = 0; i < 3; i++) {
      var dm = svgEl("feDisplacementMap", {
        in: "SourceGraphic", in2: "map", scale: 0,
        xChannelSelector: "R", yChannelSelector: "G",
        result: "d" + names[i]
      });
      f.appendChild(dm);
      disp.push(dm);
      f.appendChild(svgEl("feColorMatrix", {
        in: "d" + names[i], type: "matrix",
        values: CHANNEL[names[i]], result: "c" + names[i]
      }));
    }
    f.appendChild(svgEl("feBlend", { in: "cr", in2: "cg", mode: "screen", result: "crg" }));
    f.appendChild(svgEl("feBlend", { in: "crg", in2: "cb", mode: "screen" }));

    ensureHost().appendChild(f);
    return { id: id, node: f, image: im, disp: disp };
  }

  /* -----------------------------------------------------------------------
     Registry
     --------------------------------------------------------------------- */
  var items = [];
  var LIGHT_HEIGHT = 620;   /* virtual lamp, this far above each surface */

  function radiusOf(el, w, h) {
    var raw = getComputedStyle(el).borderTopLeftRadius || "0px";
    var r = parseFloat(raw) || 0;
    if (raw.indexOf("%") > -1) r = (parseFloat(raw) / 100) * Math.min(w, h);
    return Math.min(r, Math.min(w, h) / 2);
  }

  function chain(id, dense) {
    return (id ? "url(#" + id + ") " : "") +
      "blur(var(--lg-blur)) saturate(var(--lg-sat)) brightness(var(--lg-bright))";
  }

  /* Cheap: only rewrites the CSS chain. Safe on every surface including off
     screen ones, so a parameter change takes effect at once rather than only
     when something scrolls back into view. */
  function applyChain(it) {
    var css = chain(P.enabled && it.fx ? it.fx.id : null);
    it.el.style.backdropFilter = css;
    it.el.style.webkitBackdropFilter = css;
  }

  function applyScale(it) {
    if (!it.fx) return;
    /* feDisplacementMap shifts by scale * (channel - 0.5), so the pixel
       displacement at full deflection is scale/2. */
    var base = P.refract * it.refractMul * 2 * (it.pressed ? 1.7 : 1);
    var spread = P.dispersion / 100;
    var mult = [1 - spread, 1, 1 + spread];
    for (var i = 0; i < 3; i++) {
      it.fx.disp[i].setAttribute("scale", (base * mult[i]).toFixed(2));
    }
  }

  function bevelFor(it, w, h) {
    var limit = Math.min(w, h) / 2 - 1;
    return Math.max(2, Math.min(it.bevel, limit));
  }

  function refresh(it, force) {
    var el = it.el;
    var w = el.offsetWidth, h = el.offsetHeight;
    if (w < 4 || h < 4) return;

    var r = radiusOf(el, w, h);
    var bev = bevelFor(it, w, h);
    var changed = (w !== it.w || h !== it.h || r !== it.r || bev !== it.bevUsed);

    it.w = w; it.h = h; it.r = r; it.bevUsed = bev;

    if (!P.enabled) {
      applyChain(it);
      it.dirty = true;
      return;
    }

    if (!it.fx) it.fx = makeFilter();

    if (changed || force || it.dirty) {
      it.fx.node.setAttribute("width", w);
      it.fx.node.setAttribute("height", h);
      it.fx.image.setAttribute("width", w);
      it.fx.image.setAttribute("height", h);
      var url = buildMap(w, h, r, bev);
      it.fx.image.setAttributeNS(XL, "xlink:href", url);
      it.fx.image.setAttribute("href", url);
      it.dirty = false;
    }

    applyScale(it);
    applyChain(it);
  }

  /* -----------------------------------------------------------------------
     Environment light

     A real environment light is fixed in space: what makes rims look
     consistent is the angle varying with WHERE a surface sits, not with where
     the cursor is. So the angle is computed once per surface from its own
     position and only the surface under the cursor gets a live sheen. Tracking
     the pointer across every surface would repaint a dozen filtered layers on
     every mouse frame.
     --------------------------------------------------------------------- */
  function setRimAngle(it, cx) {
    if (cx === undefined) {
      var rc = it.el.getBoundingClientRect();
      cx = rc.left + rc.width / 2;
    }
    var ang = Math.atan2(-LIGHT_HEIGHT, (global.innerWidth / 2) - cx) * 180 / Math.PI + 90;
    it.el.style.setProperty("--lg-ang", ang.toFixed(1) + "deg");
  }

  /* every rect read up front, every write after: one layout pass, not N */
  function setAllRimAngles() {
    var i, cx = [];
    for (i = 0; i < items.length; i++) {
      var rc = items[i].el.getBoundingClientRect();
      cx.push(rc.left + rc.width / 2);
    }
    for (i = 0; i < items.length; i++) setRimAngle(items[i], cx[i]);
  }

  function bindSheen(el) {
    var rc = null, raf = 0, px = 0, py = 0;
    el.addEventListener("pointerenter", function () { rc = el.getBoundingClientRect(); });
    el.addEventListener("pointerleave", function () { rc = null; });
    el.addEventListener("pointermove", function (e) {
      if (!rc) rc = el.getBoundingClientRect();
      px = e.clientX; py = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (!rc) return;
        el.style.setProperty("--lg-mx", (((px - rc.left) / rc.width) * 100).toFixed(1) + "%");
        el.style.setProperty("--lg-my", (((py - rc.top) / rc.height) * 100).toFixed(1) + "%");
      });
    }, { passive: true });
  }

  /* Press pulls the refraction up while the surface squashes. */
  function bindPress(el, it) {
    el.addEventListener("pointerdown", function () { it.pressed = true; applyScale(it); });
    var release = function () {
      if (it.pressed) { it.pressed = false; applyScale(it); }
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointerleave", release);
    el.addEventListener("pointercancel", release);
  }

  /* -----------------------------------------------------------------------
     Observers
     --------------------------------------------------------------------- */
  var io = null, ro = null, lit = null;

  function ensureObservers() {
    if (io) return;

    io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var it = entries[i].target.__lg;
        if (!it) continue;
        it.visible = entries[i].isIntersecting;
        if (it.visible && it.dirty) refresh(it, true);
      }
    }, { rootMargin: "300px" });

    ro = new ResizeObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var it = entries[i].target.__lg;
        if (it) refresh(it, false);
      }
    });

    /* one shot entrance: light it once, then stop watching it */
    lit = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add("lg-lit");
          lit.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.15 });
  }

  /* -----------------------------------------------------------------------
     Public surface
     --------------------------------------------------------------------- */
  function add(el) {
    if (el.__lg) return el.__lg;

    var it = {
      el: el,
      fx: null,
      w: 0, h: 0, r: 0, bevUsed: 0,
      bevel: parseFloat(el.getAttribute("data-glass-bevel")) || P.bevel,
      refractMul: parseFloat(el.getAttribute("data-glass-refract")) || 1,
      dirty: true,
      visible: false,
      pressed: false
    };
    el.__lg = it;
    items.push(it);

    el.classList.add("lg");

    /* The material must not take over the host's layout. Read what the host
       already declares and only fill in what is genuinely missing:

       position   the injected layers need a containing block, but forcing
                  relative on everything turned this site's fixed navbar into
                  a static one and pushed the hero down the page.
       transition these cards carry "transition: all"; redeclaring it would
                  narrow the list and make their other hover properties snap. */
    var cs = getComputedStyle(el);
    if (cs.position === "static") el.style.position = "relative";
    if (parseFloat(cs.transitionDuration) === 0) el.classList.add("lg-needs-ease");

    /* Real nodes rather than ::before/::after. Every card on this site already
       uses its own pseudo-elements for a hover shine, and quietly overwriting
       those would be a nasty surprise. Absolutely positioned children stay out
       of flex and grid flow, so hosts using either are unaffected. */
    el.insertBefore(layer("lg-sheen"), el.firstChild);
    if (!el.hasAttribute("data-glass-static")) {
      el.insertBefore(layer("lg-sweep"), el.firstChild);
    }
    el.appendChild(layer("lg-rim"));

    bindSheen(el);
    bindPress(el, it);

    ensureObservers();
    io.observe(el);
    ro.observe(el);

    if (!el.hasAttribute("data-glass-static")) lit.observe(el);
    return it;
  }

  function layer(cls) {
    var s = document.createElement("span");
    s.className = cls;
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  var pending = 0;
  function invalidate(hard) {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (hard) it.dirty = true;
        /* only the map rebuild is deferred off screen; the chain is cheap and
           must stay correct everywhere */
        if (it.visible) refresh(it, hard);
        else applyChain(it);
      }
    });
  }

  function init(selector) {
    root.classList.toggle("no-lg-refract", !CAN_REFRACT);
    var nodes = document.querySelectorAll(selector || "[data-glass]");
    for (var i = 0; i < nodes.length; i++) add(nodes[i]);
    setAllRimAngles();
    for (var j = 0; j < items.length; j++) refresh(items[j], true);
  }

  var rsz = 0;
  global.addEventListener("resize", function () {
    clearTimeout(rsz);
    rsz = setTimeout(function () { setAllRimAngles(); invalidate(true); }, 160);
  }, { passive: true });

  global.LiquidGlass = {
    init: init,
    add: function (el) { var it = add(el); setRimAngle(it); refresh(it, true); return it; },
    configure: function (opts) {
      for (var k in opts) if (k in P) P[k] = opts[k];
      var hard = ("bevel" in opts);
      if ("bevel" in opts) {
        for (var i = 0; i < items.length; i++) {
          if (!items[i].el.hasAttribute("data-glass-bevel")) items[i].bevel = P.bevel;
        }
      }
      invalidate(hard);
    },
    /* true only where the browser can actually displace the backdrop */
    supported: CAN_REFRACT,
    surfaces: function () { return items.length; }
  };

  function boot() {
    init();
    /* fonts and late layout shift boxes; one settle pass */
    global.addEventListener("load", function () {
      setTimeout(function () { setAllRimAngles(); invalidate(true); }, 60);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
