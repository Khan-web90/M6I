/* ============================================================
   M61 Restaurant — Motion engine
   ------------------------------------------------------------
   No dependencies. Everything degrades safely:
   - html.motion is only added once the engine is live, so a JS
     failure leaves the page fully visible
   - transforms / opacity / clip-path only
   - one shared rAF loop for scroll-driven work
   - IntersectionObserver for reveals, unobserved after firing
   - custom cursor, magnetic and sheen only on fine pointers
   ============================================================ */
(function () {
  "use strict";

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const smallScreen = window.matchMedia("(max-width: 900px)");
  const coarse = window.matchMedia("(hover: none), (pointer: coarse)");

  /* A real phone or tablet: no cursor, no magnetism, no pointer sheen,
     and a much smaller reveal set. Width is included as well as pointer
     type so a narrow desktop window also gets the compact path. */
  const compact = () => smallScreen.matches || coarse.matches;

  /* Bail out entirely for reduced-motion users: no listeners, no cost. */
  if (reduced.matches) return;

  if (!("IntersectionObserver" in window)) return;

  root.classList.add("motion");

  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  /* ============================================================
     Shared rAF scroll loop
     ============================================================ */
  const scrollSubs = [];
  let rafPending = false;
  let scrollY = window.scrollY;

  function onScroll() {
    scrollY = window.scrollY;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      for (let i = 0; i < scrollSubs.length; i++) scrollSubs[i](scrollY);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ============================================================
     1. Scroll progress rail
     ============================================================ */
  (function progressRail() {
    // Not created at all on phones/tablets — the CSS hides it there anyway.
    if (compact()) return;
    const rail = document.createElement("div");
    rail.className = "m-scroll-rail";
    rail.setAttribute("aria-hidden", "true");
    rail.innerHTML = '<span class="m-scroll-rail__fill"></span>';
    document.body.appendChild(rail);
    const fill = rail.firstChild;

    scrollSubs.push(function () {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
      fill.style.transform = "scaleY(" + p + ")";
    });
    onScroll();
  })();

  /* ============================================================
     2. Scroll reveal system
     ------------------------------------------------------------
     Targets are tagged automatically so no page markup had to be
     rewritten. Stagger is computed per batch and capped so a long
     grid (the menu has 100+ cards) never gets a long tail delay.
     ============================================================ */
  const REVEAL_SELECTORS = [
    ".section__eyebrow", ".section__title", ".section__lede", ".section__cta-row",
    ".about__copy p", ".about__signature",
    ".menu__card", ".value", ".review", ".cuisine-card", ".contact-card",
    ".gallery-item", ".deal-card", ".cart-item", ".hours li", ".address",
    ".menu-card", ".checkout-card", ".confirmed-card", ".cart-summary",
    ".confirmed__list li", ".visit__actions", ".payment-options",
    ".section--menu .menu__grid", ".cuisine__grid", ".values__grid"
  ].join(",");

  /* On phones the menu page alone would tag 169 individually-transitioning
     cards. That is real work on a budget device for an effect nobody can
     perceive one card at a time, so on compact screens the dense grids
     reveal as a single block instead. Cuts ~169 targets down to ~8. */
  const HEAVY_SELECTORS = ".menu-card, .deal-card";
  const BLOCK_SELECTORS = ".deals-band, .signature-strip, .section--menu-scans";

  function buildRevealList() {
    const list = compact()
      ? REVEAL_SELECTORS.split(",")
          .map(function (s) { return s.trim(); })
          .filter(function (s) {
            return HEAVY_SELECTORS.split(",").indexOf(s.trim()) === -1;
          })
          .concat(BLOCK_SELECTORS.split(",").map(function (s) { return s.trim(); }))
      : REVEAL_SELECTORS.split(",").map(function (s) { return s.trim(); });
    return list.join(",");
  }

  // The sticky menu nav and the hero own their own choreography.
  const EXCLUDE = ".menu-nav, .topbar, .hero, .drawer, .page-hero, .m-cursor-ring, .m-lightbox";

  function initReveals() {
    const isCompact = compact();
    const nodes = $$(buildRevealList()).filter(function (el) {
      return !el.closest(EXCLUDE) && !el.hasAttribute("data-reveal") &&
        getComputedStyle(el).display !== "none";
    });
    if (!nodes.length) return;

    // Pick a reveal treatment by role, then vary direction between
    // sibling groups so consecutive sections don't repeat themselves.
    const groups = new Map();
    let gi = 0;

    nodes.forEach(function (el) {
      const isImage = el.matches(".gallery-item, .deal-card, .menu-card");
      const isNum = el.matches(".menu__num, .value__num, .deal-card__badge, .checkout-section h3 .step");

      let kind = "up";
      if (isNum) kind = "num";
      else if (el.matches(".section__lede, .about__copy p")) kind = "up";
      else if (el.matches(".gallery-item")) kind = "mask";
      else if (el.matches(".deal-card, .menu-card, .contact-card")) kind = "scale";
      else if (isImage) kind = "scale";
      // A whole block revealing at once should just rise, not scale.

      el.setAttribute("data-reveal", kind);

      // Stagger index relative to the nearest structural parent
      const parent = el.parentElement;
      if (parent) {
        if (!groups.has(parent)) groups.set(parent, { n: 0, i: gi++ });
        const g = groups.get(parent);
        const idx = g.n++;
        // Compact screens get a tighter stagger — less waiting per item.
        const step = isCompact ? 45 : 65;
        el.style.setProperty("--reveal-delay", Math.min(idx, isCompact ? 4 : 6) * step + "ms");
      }

      if (el.matches(".section__eyebrow")) el.classList.add("eyebrow-rule");
    });

    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        release(entry.target);
        io.unobserve(entry.target);
      });
    }, {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.08
    });

    nodes.forEach(function (el) { io.observe(el); });

    /* ------------------------------------------------------------
       Failsafe.
       Content must never be left invisible on a live ordering site.
       If the observer misses an element — fast scrolling, a restored
       scroll position, a deep anchor jump, a browser quirk, or a
       container that was display:none when observed — this sweep
       releases it. It runs on load, on a short interval until the
       page is fully resolved, and then stops.
       ------------------------------------------------------------ */
    var remaining = nodes.slice();
    var pending = [];   // released, still animating

    function release(el) {
      if (el.classList.contains("is-revealed")) return;
      el.classList.add("is-revealed");
      el.setAttribute("data-reveal-at", String(performance.now()));
      pending.push(el);
    }

    function sweep() {
      var vh = window.innerHeight;
      var still = [];
      for (var i = 0; i < remaining.length; i++) {
        var el = remaining[i];
        var r = el.getBoundingClientRect();
        // Inside the viewport, or already scrolled past the top.
        if (r.bottom > -100 && r.top < vh + 100) {
          release(el);
          io.unobserve(el);
        } else {
          still.push(el);
        }
      }
      remaining = still;
    }

    /* A transition that has had its full time (delay + duration + slack)
       and still has not reached its end state is not going to. Force it.
       Content must never be left invisible on a live ordering site. */
    function settle() {
      if (!pending.length) return;
      var now = performance.now();
      var stillRunning = [];
      for (var i = 0; i < pending.length; i++) {
        var el = pending[i];
        var started = parseFloat(el.getAttribute("data-reveal-at")) || 0;
        if (now - started < 2600) { stillRunning.push(el); continue; }
        var cs = getComputedStyle(el);
        var done = parseFloat(cs.opacity) > 0.995 &&
                   (cs.transform === "none" || cs.transform === "matrix(1, 0, 0, 1, 0, 0)");
        if (!done) el.classList.add("is-settled");
        else el.classList.remove("is-settled");
      }
      pending = stillRunning;
    }

    var failsafe = setInterval(function () {
      sweep();
      settle();
      if (!remaining.length && !pending.length) clearInterval(failsafe);
    }, 500);

    window.addEventListener("load", sweep);
    scrollSubs.push(sweep);

    // Absolute last resort: if the failsafe itself was throttled (background
    // tab, heavy page), release everything outright.
    setTimeout(function () {
      nodes.forEach(function (el) { el.classList.add("is-settled"); });
      clearInterval(failsafe);
    }, 9000);

    // Print and find-in-page must never land on hidden text.
    window.addEventListener("beforeprint", function () {
      nodes.forEach(function (el) { el.classList.add("is-settled"); });
    });
  }

  /* ============================================================
     3. Custom cursor
     ============================================================ */
  (function customCursor() {
    if (!finePointer.matches) return;
    if (compact()) return;
    // Coarse pointers can still match in odd hybrids; confirm touch is absent.
    if (navigator.maxTouchPoints > 0 && !window.matchMedia("(any-hover: hover)").matches) return;

    const dot = document.createElement("div");
    dot.className = "m-cursor";
    dot.setAttribute("aria-hidden", "true");

    const ring = document.createElement("div");
    ring.className = "m-cursor-ring";
    ring.setAttribute("aria-hidden", "true");
    ring.innerHTML = '<span class="m-cursor-label"></span>';

    document.body.appendChild(dot);
    document.body.appendChild(ring);

    const label = ring.firstChild;
    let tx = 0, ty = 0, rx = 0, ry = 0, shown = false, looping = false;

    /* The trail loop only runs while the ring is still catching up, so a
       stationary cursor costs nothing instead of pinning a rAF forever. */
    function trail() {
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;
      dot.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
      ring.style.transform = "translate3d(" + rx.toFixed(2) + "px," + ry.toFixed(2) + "px,0)";
      if (Math.abs(tx - rx) > 0.1 || Math.abs(ty - ry) > 0.1) {
        requestAnimationFrame(trail);
      } else {
        looping = false;
      }
    }
    function kick() {
      if (looping) return;
      looping = true;
      requestAnimationFrame(trail);
    }

    window.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!shown) {
        shown = true;
        rx = tx; ry = ty;
        dot.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
        ring.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
        root.classList.add("m-cursor-on");
      }
      kick();
    }, { passive: true });

    document.addEventListener("mouseleave", function () {
      root.classList.remove("m-cursor-on");
      shown = false;
    });
    document.addEventListener("mouseenter", function () {
      if (shown) root.classList.add("m-cursor-on");
    });

    // Leaving the desktop breakpoint tears the whole layer down.
    smallScreen.addEventListener("change", function (e) {
      if (e.matches) {
        root.classList.remove("m-cursor-on");
        dot.remove();
        ring.remove();
      }
    });

    /* --- Cursor states, derived from the element under the pointer --- */
    const LABELS = [
      [".gallery-item", "View", "is-active"],
      [".deal-card--poster", "View", "is-active"],
      [".menu-card__add, .btn-add, .deal-card__add", "Add", "is-active"],
      ["a[href^='tel:']", "Call", "is-active"],
      [".contact-card__actions a[target='_blank'], a[href*='google.com/maps']", "Maps", "is-active"],
      [".btn--primary, .topbar__cta, .topbar__cart, .theme-toggle", "", "is-link"],
      [".topbar__nav a, .footer__col a, .drawer a", "", "is-link"],
      [".menu-tabs a, .gallery-item__cat, .review", "", "is-tight"]
    ];

    function resolve(el) {
      if (!el || !el.closest) return null;
      for (let i = 0; i < LABELS.length; i++) {
        const hit = el.closest(LABELS[i][0]);
        if (hit) return { label: LABELS[i][1], cls: LABELS[i][2] };
      }
      if (el.closest("a, button")) return { label: "", cls: "is-link" };
      return null;
    }

    document.addEventListener("mouseover", function (e) {
      const state = resolve(e.target);
      ring.classList.remove("is-active", "is-link", "is-tight");
      if (state) {
        ring.classList.add(state.cls);
        label.textContent = state.label;
      }
    });
  })();

  /* ============================================================
     4. Magnetic primary CTAs
     ============================================================ */
  (function magnetic() {
    if (!finePointer.matches || compact()) return;
    const targets = $$(".btn--primary, .topbar__cta");
    if (!targets.length) return;
    const STRENGTH = 6; // px, well inside the "4–8px" brief
    const reduce = document.documentElement;

    targets.forEach(function (el) {
      let raf = null, cx = 0, cy = 0, curX = 0, curY = 0, active = false;

      function apply() {
        curX += (cx - curX) * 0.16;
        curY += (cy - curY) * 0.16;
        reduce.style.setProperty("--mx", (el.getBoundingClientRect().width / 2 + curX) + "px");
        el.style.transform =
          "translate3d(" + curX.toFixed(2) + "px," + curY.toFixed(2) + "px,0)";
        if (Math.abs(cx - curX) > 0.05 || Math.abs(cy - curY) > 0.05) {
          raf = requestAnimationFrame(apply);
        } else {
          el.style.transform = "translate3d(" + curX.toFixed(2) + "px," + curY.toFixed(2) + "px,0)";
          raf = null;
        }
      }
      function start() { if (!raf) raf = requestAnimationFrame(apply); }

      el.classList.add("m-magnetic");

      el.addEventListener("mouseenter", function () { active = true; start(); });
      el.addEventListener("mousemove", function (e) {
        if (!active) return;
        const r = el.getBoundingClientRect();
        cx = (e.clientX - (r.left + r.width / 2)) * 0.22;
        cy = (e.clientY - (r.top + r.height / 2)) * 0.3;
        cx = clamp(cx, -STRENGTH, STRENGTH);
        cy = clamp(cy, -STRENGTH, STRENGTH);
        start();
      });
      el.addEventListener("mouseleave", function () {
        active = false; cx = 0; cy = 0; start();
      });
      // Never let magnetism fight the pressed state or a disabled control.
      el.addEventListener("mousedown", function () { el.style.transform = "scale(.97)"; });
    });
  })();

  /* ============================================================
     5. Reflected sheen that tracks the pointer on media tiles
     ============================================================ */
  (function sheen() {
    if (!finePointer.matches || compact()) return;
    $$(".gallery-item, .deal-card__media, .menu-card").forEach(function (el) {
      el.classList.add("m-sheen");
      el.addEventListener("mousemove", function (e) {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
        el.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
      }, { passive: true });
    });
  })();

  /* ============================================================
     6. Gallery lightbox
     ============================================================ */
  (function lightbox() {
    const grid = document.querySelector(".gallery-grid");
    if (!grid) return;

    const items = $$(".gallery-item", grid);
    if (!items.length) return;

    // Affordance + keyboard access, added without touching the markup file.
    items.forEach(function (fig, i) {
      if (!fig.querySelector("img")) return;
      fig.setAttribute("tabindex", "0");
      fig.setAttribute("role", "button");
      fig.setAttribute("aria-label", "Open image: " + ((fig.querySelector(".gallery-item__name") || {}).textContent || "gallery image"));

      const badge = document.createElement("span");
      badge.className = "gallery-item__view";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "View";
      fig.appendChild(badge);

      const open = function () { show(i); };
      fig.addEventListener("click", open);
      fig.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });

    const box = document.createElement("div");
    box.className = "m-lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Gallery image viewer");
    box.innerHTML =
      '<figure class="m-lightbox__figure">' +
        '<img class="m-lightbox__img" alt="">' +
        '<figcaption class="m-lightbox__cap">' +
          '<span class="m-lightbox__cap-name"></span>' +
          '<span class="m-lightbox__cap-cat"></span>' +
          '<span class="m-lightbox__count"></span>' +
        '</figcaption>' +
      '</figure>' +
      '<button type="button" class="m-lightbox__btn m-lightbox__prev" aria-label="Previous image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button type="button" class="m-lightbox__btn m-lightbox__next" aria-label="Next image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '<button type="button" class="m-lightbox__btn m-lightbox__close" aria-label="Close viewer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<p class="m-lightbox__hint">Esc to close · Arrow keys to browse · Swipe on touch</p>';
    document.body.appendChild(box);

    const img = box.querySelector(".m-lightbox__img");
    const capName = box.querySelector(".m-lightbox__cap-name");
    const capCat = box.querySelector(".m-lightbox__cap-cat");
    const capCount = box.querySelector(".m-lightbox__count");
    const prevBtn = box.querySelector(".m-lightbox__prev");
    const nextBtn = box.querySelector(".m-lightbox__next");
    const closeBtn = box.querySelector(".m-lightbox__close");

    let index = 0;
    let lastFocus = null;

    function render() {
      const fig = items[index];
      const src = fig.querySelector("img");
      if (!src) return;
      img.src = src.currentSrc || src.src;
      img.alt = src.alt || "";
      capName.textContent = (fig.querySelector(".gallery-item__name") || {}).textContent || "";
      capCat.textContent = (fig.querySelector(".gallery-item__cat") || {}).textContent || "";
      capCount.textContent = (index + 1) + " / " + items.length;
      const many = items.length > 1;
      prevBtn.hidden = !many;
      nextBtn.hidden = !many;
    }

    function show(i) {
      index = (i + items.length) % items.length;
      render();
      lastFocus = document.activeElement;
      box.classList.add("is-open");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
      document.dispatchEvent(new CustomEvent("m61:lightbox", { detail: { open: true } }));
    }

    function close() {
      if (!box.classList.contains("is-open")) return;
      box.classList.remove("is-open");
      document.body.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      document.dispatchEvent(new CustomEvent("m61:lightbox", { detail: { open: false } }));
    }

    prevBtn.addEventListener("click", function () { show(index - 1); });
    nextBtn.addEventListener("click", function () { show(index + 1); });
    closeBtn.addEventListener("click", close);
    box.addEventListener("click", function (e) { if (e.target === box) close(); });

    document.addEventListener("keydown", function (e) {
      if (!box.classList.contains("is-open")) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
      else if (e.key === "Tab") {
        // Keep focus inside the dialog.
        const f = [closeBtn, prevBtn, nextBtn].filter(function (b) { return !b.hidden; });
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // Touch swipe
    let sx = 0, sy = 0, tracking = false;
    box.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
      else if (Math.abs(dy) > 46) close();
    }, { passive: true });

    // Reflect open state for the custom cursor
    document.addEventListener("m61:lightbox", function (e) {
      root.classList.toggle("m-lightbox-open", e.detail.open);
    });
  })();

  /* ============================================================
     7. Focus ring continuity for keyboard users inside reveals
     ============================================================ */
  document.addEventListener("focusin", function (e) {
    const el = e.target;
    if (!el || !el.closest) return;
    const rv = el.closest("[data-reveal]");
    if (rv && !rv.classList.contains("is-revealed")) rv.classList.add("is-revealed");
  });

  /* ============================================================
     8. Boot
     ============================================================ */
  function boot() {
    initReveals();
    onScroll();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Live preference changes
  if (reduced.addEventListener) {
    reduced.addEventListener("change", function (e) {
      if (e.matches) {
        root.classList.remove("motion");
        $$("[data-reveal]").forEach(function (el) { el.classList.add("is-revealed"); });
      }
    });
  }
})();
