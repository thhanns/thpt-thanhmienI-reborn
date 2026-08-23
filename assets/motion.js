/* ============================================================================
   Motion — the scripted half of the choreography.

   Loads after site.js on every page. Nothing here assumes an element exists,
   and nothing here is load bearing: with this file removed the site still
   reveals, still navigates and still reads. It only adds movement.

   Everything that runs per frame goes through one requestAnimationFrame gate.
   Scroll listeners are passive, pointer work is rAF throttled, and every
   observer releases its target once it has fired.

   Reduced motion is honoured at the source, not by shortening durations: the
   tilt, the ripple, the counters and the page handover are never bound at all.
   ========================================================================= */
(function () {
  "use strict";

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var root  = document.documentElement;
  var mq    = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var REDUCE = mq("(prefers-reduced-motion: reduce)").matches;
  /* tilt is a pointer affordance; on touch it would only fire on tap and
     leave the pane stuck at an angle until the next tap elsewhere */
  var FINE   = mq("(hover: hover) and (pointer: fine)").matches;

  var IO = "IntersectionObserver" in window;

  /* -------------------------------------------------------------------------
     Reveal stagger

     glass-ui.css multiplies --i by one step to get the delay. The index is
     the element's position among its own revealing siblings, so a three card
     grid staggers within the row and the next section starts from zero again
     rather than continuing to count down the page.
     --------------------------------------------------------------------- */
  var CAP = 6;   /* beyond six steps the last item arrives long after the eye
                    has moved on, so the tail all shares the same delay */
  $$(".rise").forEach(function (el) {
    var i = 0, n = el.parentNode && el.parentNode.firstElementChild;
    while (n && n !== el) {
      if (n.classList.contains("rise")) i++;
      n = n.nextElementSibling;
    }
    el.style.setProperty("--i", Math.min(i, CAP));
  });

  /* -------------------------------------------------------------------------
     Hero: the campus photograph only drifts while the hero is on screen.
     Same reasoning as the aurora in site.js — a moving backdrop forces every
     glass pane above it to re-run its displacement passes every frame.
     --------------------------------------------------------------------- */
  var hero = $(".hero");
  if (hero && IO) {
    new IntersectionObserver(function (entries) {
      hero.classList.toggle("is-live", entries[0].isIntersecting);
    }, { threshold: 0 }).observe(hero);
  } else if (hero) {
    hero.classList.add("is-live");
  }

  /* -------------------------------------------------------------------------
     Counting stats

     The markup carries the real value, so the number is parsed back out of the
     text rather than duplicated in an attribute: whoever edits "1200+" in the
     HTML never has to remember a second place. Suffixes (+, %) are preserved.
     --------------------------------------------------------------------- */
  function countUp(el) {
    var raw = el.textContent.trim();
    var m = raw.match(/^([^\d]*)([\d]+(?:[.,][\d]+)?)(.*)$/);
    if (!m) return;

    var head = m[1], tail = m[3];
    var target = parseFloat(m[2].replace(",", "."));
    var decimals = (m[2].split(/[.,]/)[1] || "").length;
    if (!isFinite(target)) return;

    var start = 0, DUR = 1500;
    var frame = function (now) {
      if (!start) start = now;
      var t = Math.min((now - start) / DUR, 1);
      /* ease out expo: most of the distance is covered early, so the number
         reads as settling rather than as a slot machine winding down */
      var e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = head + (target * e).toFixed(decimals) + tail;
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = raw;   /* land on the authored string exactly */
    };
    el.textContent = head + (0).toFixed(decimals) + tail;
    requestAnimationFrame(frame);
  }

  var numbers = $$(".stat b");
  if (numbers.length && !REDUCE && IO) {
    var counter = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        counter.unobserve(entry.target);
        countUp(entry.target);
      });
    }, { threshold: .4 });
    numbers.forEach(function (el) { counter.observe(el); });
  }

  /* -------------------------------------------------------------------------
     Injected furniture: reading rail, back to top, handover veil
     --------------------------------------------------------------------- */
  function make(tag, cls) {
    var el = document.createElement(tag);
    el.className = cls;
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  var rail = make("div", "m-rail");
  document.body.appendChild(rail);

  var toTop = document.createElement("button");
  toTop.type = "button";
  toTop.className = "m-top";
  toTop.setAttribute("aria-label", "Lên đầu trang");
  toTop.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
  /* let it be a real glass surface rather than a painted lookalike. add() is
     idempotent and LiquidGlass.init() runs on DOMContentLoaded, which is after
     every deferred script, so registering here cannot double up. */
  toTop.setAttribute("data-glass", "");
  toTop.setAttribute("data-glass-bevel", "13");
  document.body.appendChild(toTop);
  if (window.LiquidGlass && window.LiquidGlass.add) window.LiquidGlass.add(toTop);

  toTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: REDUCE ? "auto" : "smooth" });
  });

  /* -------------------------------------------------------------------------
     One scroll handler for all three

     Reads happen together at the top of the frame and writes after them, so a
     scroll never interleaves layout reads with style writes.
     --------------------------------------------------------------------- */
  var nav = $(".nav");
  var lastY = window.scrollY || 0;
  var ticking = false;

  var onFrame = function () {
    ticking = false;

    var y = window.scrollY || 0;
    var span = document.documentElement.scrollHeight - window.innerHeight;
    var p = span > 0 ? Math.min(Math.max(y / span, 0), 1) : 0;

    rail.style.setProperty("--m-p", p.toFixed(4));
    rail.style.setProperty("--m-rail-o", y > 60 ? "1" : "0");

    toTop.classList.toggle("is-on", y > 520);

    /* The capsule steps out of the way while reading downward and comes back
       the moment the user reverses. 6px of slack keeps a trackpad's jitter
       from flickering it, and an open mobile sheet pins it in place. */
    if (nav && !REDUCE) {
      var down = y > lastY + 6;
      var up   = y < lastY - 6;
      if (nav.classList.contains("is-open") || y < 260) {
        nav.classList.remove("is-away");
      } else if (down) {
        nav.classList.add("is-away");
      } else if (up) {
        nav.classList.remove("is-away");
      }
    }

    if (Math.abs(y - lastY) > 6) lastY = y;
  };

  var onScroll = function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onFrame);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onFrame();

  /* -------------------------------------------------------------------------
     Pointer tilt

     The pane leans a few degrees towards the cursor. Kept small on purpose:
     past about five degrees the refraction at the far bevel stretches and the
     glass starts to read as plastic.
     --------------------------------------------------------------------- */
  if (FINE && !REDUCE) {
    var MAX = 4.2;
    $$(".card, .news-card, .info, .stat, .post, .side-box").forEach(function (el) {
      var rc = null, raf = 0, px = 0, py = 0;

      el.addEventListener("pointerenter", function (e) {
        rc = el.getBoundingClientRect();
        px = e.clientX; py = e.clientY;
        el.classList.add("m-tilting");
      });

      el.addEventListener("pointermove", function (e) {
        px = e.clientX; py = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          if (!rc) return;
          var cx = (px - rc.left) / rc.width  - .5;
          var cy = (py - rc.top)  / rc.height - .5;
          el.style.setProperty("--ry", (cx *  MAX * 2).toFixed(2) + "deg");
          el.style.setProperty("--rx", (cy * -MAX * 2).toFixed(2) + "deg");
        });
      }, { passive: true });

      var reset = function () {
        rc = null;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        /* the class goes first so the angles unwind on the spring, not on the
           10ms tracking transition */
        el.classList.remove("m-tilting");
        el.style.removeProperty("--rx");
        el.style.removeProperty("--ry");
      };
      el.addEventListener("pointerleave", reset);
      el.addEventListener("pointercancel", reset);
    });
  }

  /* -------------------------------------------------------------------------
     Click ripple
     --------------------------------------------------------------------- */
  if (!REDUCE) {
    $$(".btn, .nav-cta, .side-cta").concat([toTop]).forEach(function (el) {
      el.addEventListener("pointerdown", function (e) {
        var rc = el.getBoundingClientRect();
        var d = Math.max(rc.width, rc.height) * 2.2;
        var s = document.createElement("span");
        s.className = "m-rip";
        s.setAttribute("aria-hidden", "true");
        s.style.width = s.style.height = d + "px";
        s.style.left = ((e.clientX || rc.left + rc.width / 2) - rc.left) + "px";
        s.style.top  = ((e.clientY || rc.top + rc.height / 2) - rc.top) + "px";
        el.appendChild(s);
        setTimeout(function () {
          if (s.parentNode) s.parentNode.removeChild(s);
        }, 700);
      }, { passive: true });
    });
  }

  /* -------------------------------------------------------------------------
     Page handover

     Fades a veil in, then navigates. Only for plain left clicks on same site
     links that actually change page — modified clicks, new tabs, downloads,
     external hosts and in page anchors all fall through untouched, so nothing
     the browser does natively is taken away.
     --------------------------------------------------------------------- */
  if (!REDUCE) {
    var veil = make("div", "m-veil");
    document.body.appendChild(veil);

    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      var a = e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      if (a.protocol !== location.protocol || a.host !== location.host) return;
      /* same document: that is the smooth anchor scroll, leave it alone */
      if (a.pathname === location.pathname && a.search === location.search) return;

      e.preventDefault();
      root.classList.add("is-leaving");
      setTimeout(function () { location.href = a.href; }, 220);
    });

    /* coming back through history restores the page as it was left, veil and
       all, so the class has to be cleared on the way in */
    window.addEventListener("pageshow", function () {
      root.classList.remove("is-leaving");
    });
  }
})();
