/* ============================================================================
   Shared page behaviour for THPT Thanh Miện.
   Loads on every page. Nothing here assumes an element exists.
   ========================================================================= */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------------------
     Nav: stuck state and the mobile sheet
     ------------------------------------------------------------------- */
  var nav = $(".nav");
  if (nav) {
    var stuckRaf = 0;
    var onScroll = function () {
      if (stuckRaf) return;
      stuckRaf = requestAnimationFrame(function () {
        stuckRaf = 0;
        nav.classList.toggle("is-stuck", window.scrollY > 40);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    var burger = $(".burger", nav);
    if (burger) {
      burger.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = nav.classList.toggle("is-open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("click", function (e) {
        if (!nav.contains(e.target)) {
          nav.classList.remove("is-open");
          burger.setAttribute("aria-expanded", "false");
        }
      });
      $$(".nav-links a", nav).forEach(function (a) {
        a.addEventListener("click", function () {
          nav.classList.remove("is-open");
          burger.setAttribute("aria-expanded", "false");
        });
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          nav.classList.remove("is-open");
          burger.setAttribute("aria-expanded", "false");
        }
      });
    }

    /* mark the current page without hard coding it per file */
    var here = location.pathname.split("/").pop() || "index.html";
    $$(".nav-links a", nav).forEach(function (a) {
      var target = (a.getAttribute("href") || "").split("/").pop();
      if (target && target === here) a.classList.add("is-here");
    });
  }

  /* ---------------------------------------------------------------------
     Reveal on scroll
     ------------------------------------------------------------------- */
  var rises = $$(".rise");
  var showAll = function () { rises.forEach(function (el) { el.classList.add("is-in"); }); };

  if (rises.length) {
    if (!("IntersectionObserver" in window)) {
      showAll();
    } else {
      var revealer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            revealer.unobserve(entry.target);   /* one shot */
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
      rises.forEach(function (el) { revealer.observe(el); });

      /* Failsafe. An observer that never fires (a backgrounded tab at load,
         an odd embedding, a browser quirk) would otherwise leave every
         section below the hero permanently invisible. Content wins over
         choreography, so after a few seconds anything still hidden is shown. */
      setTimeout(showAll, 2600);
    }
  }

  /* ---------------------------------------------------------------------
     Ambient ground

     The aurora only drifts while the hero is on screen. A moving backdrop
     forces every glass surface above it to re-run its displacement passes
     each frame, and below the fold the panes are many, so down there the
     ground holds still. Pages with no hero never animate at all.
     ------------------------------------------------------------------- */
  var ground = $(".ground");
  var hero = $(".hero");
  if (ground && hero && "IntersectionObserver" in window) {
    var live = new IntersectionObserver(function (entries) {
      ground.classList.toggle("is-live", entries[0].isIntersecting);
    }, { threshold: 0 });
    live.observe(hero);
  }

  /* ---------------------------------------------------------------------
     Contact form
     ------------------------------------------------------------------- */
  var form = $("#contactForm");
  if (form) {
    var say = function (msg, ok) {
      var box = $("#formSays");
      if (!box) { alert(msg); return; }
      box.textContent = msg;
      box.hidden = false;
      box.style.borderLeftColor = ok ? "var(--leaf)" : "var(--rose)";
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = Object.fromEntries(new FormData(form));
      var required = ["fullName", "phone", "email", "message"];
      var missing = required.some(function (k) { return !(data[k] || "").trim(); });
      if (missing) {
        say("Vui lòng điền đầy đủ các trường bắt buộc.", false);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
        say("Địa chỉ thư điện tử chưa hợp lệ.", false);
        return;
      }
      say("Cảm ơn quý khách đã gửi ý kiến. Chúng tôi sẽ phản hồi trong thời gian sớm nhất.", true);
      form.reset();
    });
  }

  /* ---------------------------------------------------------------------
     Login placeholder, unchanged in behaviour from the original site
     ------------------------------------------------------------------- */
  var login = $("#loginBtn");
  if (login) {
    login.addEventListener("click", function (e) {
      e.preventDefault();
      alert("Chức năng đăng nhập đang được phát triển!");
    });
  }
})();
